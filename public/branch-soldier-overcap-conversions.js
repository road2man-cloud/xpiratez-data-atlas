// Conditional conversion continuation producer. Never feeds final admission directly.
export function produceOvercapConversionPaths(data,report,engine,{targets=["STR_SOLDIER_R","STR_SOLDIER_W","STR_SOLDIER_CHORT"],maxConversionDepth=3,maxPrep=2,maxPost=4,maxStates=2500,maxGroupsPerTarget=120,sourceRuntimeBlob=null}={}){
 const {STAT_KEYS:keys,initialState,bonusStats,eligibleTransformation,applyTransformation}=engine;
 if(data.meta?.mod?.version!=="v.o2"||report.sourceMetadataSha256!==data.meta.source.metadataSha256)throw Error("metadata mismatch");
 const sum=v=>v.reduce((a,b)=>a+b,0),vec=o=>keys.map(k=>o[k]),sorted=x=>[...new Set(x)].sort(),valid=o=>keys.every(k=>Number.isSafeInteger(o?.[k])&&o[k]>=(k==="health"?1:0));
 const bodies=new Map(data.soldiers.map(b=>[b.id,b])),rules=new Map(data.transformations.map(r=>[r.id,r]));
 const jobs=new Map();for(const r of report.rows){if(!jobs.has(r.body))jobs.set(r.body,new Set());jobs.get(r.body).add(r.rule);}
 const usable=r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!(r.requires||[]).some(id=>id==="STR_UNAVAILABLE"||!data.researchRules?.[id]);
 const deterministic=(r,dest)=>keys.every(k=>["flat","percent","percentGained"].every(f=>(r[f+"Min"]?.[k]||0)===(r[f+"Max"]?.[k]||0))&&(!r.rerollStats?.[k]||dest.minStats[k]===dest.maxStats[k]));
 const available=(r,id)=>r.allowedSoldierTypes?.includes(id)&&!r.forbiddenSoldierTypes?.includes(id);
 const same=(a,b)=>a.every((x,i)=>x===b[i]);
 function grow(s){const b=bodies.get(s.soldierType);if(!b||!valid(s.currentStats))throw Error("invalid growth");const v=Object.fromEntries(keys.map(k=>{const x=s.currentStats[k],c=b.statCaps[k];if(!Number.isSafeInteger(c))throw Error("unknown cap");return [k,k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary||c<=x?x:k==="bravery"?x+10*Math.floor((c-x)/10):c]}));return same(vec(v),vec(s.currentStats))?s:{...s,currentStats:v};}
 function effective(s){const b=bonusStats(s,data);return keys.map(k=>k==="psiSkill"&&s.currentStats[k]<=0&&(b[k]||0)>0?s.currentStats[k]:Math.max(k==="health"?1:0,s.currentStats[k]+(b[k]||0)));}
 function compare(a,b){return sum(b.gain)-sum(a.gain)||sum(b.cap)-sum(a.cap)||a.steps.length-b.steps.length||JSON.stringify(a.steps).localeCompare(JSON.stringify(b.steps));}
 const allRows=[],summaries=[],metrics={visited:0,accepted:0,blocked:0,randomDeferred:0,invalid:0,stateLimits:0,duplicates:0},reasons={},deferredRules=new Set();
 const growth={type:"conditionalCapGrowth",soldier:"origin",assumption:true};
 function attempt(n,r){
  const dest=bodies.get(r.producedSoldierType||n.s.soldierType);
  if(!dest||!deterministic(r,dest)){metrics.randomDeferred++;deferredRules.add(r.id);return null;}
  const opts={mode:"current",researched:r.requires||[],disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),statsKnown:true,medalsKnown:true,itemsKnown:true,baseFunctionsKnown:true,commendations:{}};
  const verdict=eligibleTransformation(r,n.s,data,opts);
  if(verdict.kind!=="eligible"){metrics.blocked++;for(const reason of verdict.blockers||[])reasons[reason]=(reasons[reason]||0)+1;return null;}
  const res=applyTransformation(r,n.s,data,opts);
  if(!res.state.exactStats||res.state.retired||res.state.status!=="healthy"||!valid(res.state.currentStats)){metrics.invalid++;return null;}
  const items={...n.items};for(const [id,q] of Object.entries(r.requiredItems||{}))items[id]=(items[id]||0)+q;
  const steps=[...n.steps,{type:"transform",soldier:"origin",transform:r.id}];
  metrics.accepted++;
  return {...n,s:res.state,steps,used:[...n.used,r.id],needs:sorted([...n.needs,...r.requires||[]]),functions:sorted([...n.functions,...r.requiresBaseFunc||[]]),items,cost:n.cost+Math.max(0,r.cost||0)};
 }
 const variants=n=>{const g=grow(n.s);return g===n.s?[n]:[{...n,s:g,steps:[...n.steps,growth]},n];};
 for(const target of targets){
  if(!jobs.has(target))continue;
  const conversions=data.transformations.filter(r=>usable(r)&&r.producedSoldierType&&bodies.has(r.producedSoldierType));
  const direct=conversions.filter(r=>r.producedSoldierType===target).map(r=>({id:r.id,name:r.koName,allowed:r.allowedSoldierTypes,previous:r.requiredPreviousTransformations,forbidden:r.forbiddenPreviousTransformations,requires:r.requires,deterministic:deterministic(r,bodies.get(target)),rank:r.minRank,medals:r.requiredCommendations}));
  const dist=new Map([[target,0]]);
  for(let i=1;i<=maxConversionDepth;i++)for(const r of conversions)if(dist.get(r.producedSoldierType)===i-1)for(const id of r.allowedSoldierTypes||[])if(id!==r.producedSoldierType&&available(r,id)&&!dist.has(id))dist.set(id,i);
  const wanted=new Set(conversions.filter(r=>dist.has(r.producedSoldierType)).flatMap(r=>r.requiredPreviousTransformations||[]));
  for(let i=0;i<maxPrep;i++)for(const id of [...wanted])for(const req of rules.get(id)?.requiredPreviousTransformations||[])wanted.add(req);
  const groups=new Map(),reached=new Set(),trained=new Set();let reachedCount=0,postCount=0,visited=0,limits=0,rawRows=0;
  const origins=data.profiles.filter(p=>dist.has(p.soldierType)&&p.soldierType!==target);
  for(const p of origins){
   const s=initialState(data,p,{band:"min"});if(!valid(s.currentStats)||!valid(s.initialStats))continue;s.exactStats=true;s.historyKnown=true;
   const root={s,steps:[],used:[],needs:sorted(p.requires||[]),functions:sorted(p.requiresBaseFunc||[]),items:{...(p.acquisitionRequiredItems||{})},cost:p.cost||0,prep:0,conv:0,post:[],entry:null};
   const stack=[root],seen=new Set();let vcount=0;
   while(stack.length){
    if(vcount>=maxStates){metrics.stateLimits++;limits++;break;}
    const n=stack.pop(),id=n.s.soldierType,signature=JSON.stringify([id,vec(n.s.currentStats),[...n.s.history].sort(),[...n.s.bonusCounts].sort(),n.s.rank,n.used.slice().sort(),n.post.slice().sort(),n.needs,n.entry?.capRaw||null,n.prep,n.conv,n.s.armorId,n.items,n.functions,n.cost]);
    if(seen.has(signature)){metrics.duplicates++;continue;}seen.add(signature);vcount++;metrics.visited++;visited++;
    if(id===target){
     if(!n.entry)throw Error("missing entry baseline");
     reached.add(p.id);reachedCount++;
     if(n.post.length){
      const end=grow(n.s),capRaw=vec(end.currentStats),cap=effective(end),gain=capRaw.map((v,i)=>v-n.entry.capRaw[i]);
      if(gain.some(x=>x>0)){
       trained.add(p.id);postCount++;rawRows++;
       const row={origin:p.id,sourceBody:p.soldierType,body:id,steps:[...n.steps,...(end!==n.s?[growth]:[])],conversion:n.entry.rule,post:n.post,rank:n.s.rank,traits:[...n.s.bonusCounts].sort(),researchGoals:n.needs,assumedItems:n.items,assumedBaseFunctions:n.functions,assumedCost:n.cost,entryCapRaw:n.entry.capRaw,capRaw,cap,gain,overcap:capRaw.map((x,i)=>Math.max(0,x-bodies.get(id).statCaps[keys[i]])),scope:"CONDITIONAL_LOCAL_CONVERSION_PATH",actualGameCertified:false,canonicalReplayVerified:false};
       const k=JSON.stringify([p.id,id,row.researchGoals,row.traits,row.rank]);const g=groups.get(k);
       if(!g||compare(row,g.best)<0)groups.set(k,{best:row,variants:(g?.variants||0)+1});else g.variants++;
      }
     }
     if(n.post.length>=maxPost)continue;
     for(const rid of jobs.get(id)||[]){const r=rules.get(rid);if(!r||!usable(r)||n.post.includes(rid))continue;for(const z of variants(n)){const x=attempt(z,r);if(x)stack.push({...x,post:[...n.post,rid]});}}
     continue;
    }
    if(n.conv>=maxConversionDepth)continue;
    const choices=conversions.filter(r=>available(r,id)&&r.producedSoldierType!==id&&dist.has(r.producedSoldierType)&&dist.get(r.producedSoldierType)<dist.get(id)&&!n.used.includes(r.id));
    for(const r of choices)for(const z of variants(n)){const x=attempt(z,r);if(x){const entry=x.s.soldierType===target?{rule:r.id,capRaw:vec(grow(x.s).currentStats)}:null;stack.push({...x,entry,conv:n.conv+1});}}
    if(n.prep>=maxPrep||!choices.length)continue;
    const required=new Set(choices.flatMap(r=>r.requiredPreviousTransformations||[]));
    const missing=keys.filter(k=>choices.some(r=>(r.requiredMinStats?.[k]||0)>grow(n.s).currentStats[k]));
    const prep=data.transformations.filter(r=>usable(r)&&available(r,id)&&(!r.producedSoldierType||r.producedSoldierType===id)&&!n.used.includes(r.id)&&(wanted.has(r.id)||required.has(r.id)||jobs.get(id)?.has(r.id)||missing.some(k=>(r.flatOverallStatChange?.[k]||0)>0||(r.traitStats?.[k]||0)>0||(r.percentOverallStatChange?.[k]||0)>0)));
    // Required-history steps first, then stat preparation. Bounded scheduling only.
    prep.sort((a,b)=>Number(required.has(b.id))-Number(required.has(a.id))||a.id.localeCompare(b.id));
    for(const r of prep.slice().reverse())for(const z of variants(n).slice().reverse()){const x=attempt(z,r);if(x)stack.push({...x,prep:n.prep+1});}
   }
  }
  const groupList=[...groups.values()].sort((a,b)=>compare(a.best,b.best)),selected=groupList.slice(0,maxGroupsPerTarget);
  allRows.push(...selected.map(g=>({...g.best,observedVariants:g.variants})));
  summaries.push({target,name:bodies.get(target).koName,directConversions:direct,eligibleOriginProfiles:origins.length,reachedProfiles:reached.size,trainedProfiles:trained.size,reachedStates:reachedCount,positivePostStates:postCount,visited,limitOrigins:limits,groups:groupList.length,publishedGroups:selected.length,omittedGroups:Math.max(0,groupList.length-selected.length),best:selected[0]?.best||null});
 }
 return {schema:"ATLAS_CONDITIONAL_OVERCAP_CONVERSIONS_V1",sourceMetadataSha256:data.meta.source.metadataSha256,sourceRuntimeBlob,statKeys:keys,statLabels:data.statLabels,scope:"conditional local deterministic living transformation paths; no final admission",limits:{maxConversionDepth,maxPrep,maxPost,maxStates,maxGroupsPerTarget},assumptions:["minimum birth profile","healthy, initial rank, no medals","research, funds, facilities and materials available at each action; campaign chronology not replayed","shortest-decreasing conversion corridor only; other routes not excluded","deterministic transformations only; no clones, deaths or repeated preparation"],summary:{groups:allRows.length,metrics,deferredRandomRules:[...deferredRules].sort(),topBlockers:Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,20),targets:summaries.map(({best,...x})=>({...x,best:best?{origin:best.origin,steps:best.steps,gain:best.gain,rawTotal:sum(best.gain),capRaw:best.capRaw}:null}))},rows:allRows};
}
