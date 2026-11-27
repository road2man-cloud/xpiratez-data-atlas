// Bounded conditional local candidate production, not final campaign admission.
export function produceOvercapLocalPaths(data,report,engine,{maxSteps=8,maxStatesPerOrigin=20000,sourceRuntimeBlob=null}={}){
 const {STAT_KEYS,initialState,bonusStats,eligibleTransformation,applyTransformation}=engine;
 const keys=STAT_KEYS,sum=v=>v.reduce((s,x)=>s+x,0),vec=o=>keys.map(k=>o[k]),same=(a,b)=>a.every((v,i)=>v===b[i]),valid=o=>keys.every(k=>Number.isSafeInteger(o?.[k])&&o[k]>=(k==="health"?1:0)),sorted=x=>[...new Set(x)].sort();
 const rows=[],profiles=[],issues=[],groups=new Map(),rules=new Map(data.transformations.map(r=>[r.id,r])),bodies=new Map(data.soldiers.map(b=>[b.id,b]));
 if(data.meta?.mod?.version!=="v.o2"||report.sourceMetadataSha256!==data.meta.source.metadataSha256)throw Error("Version/metadata mismatch");
 const jobs=new Map();
 for(const r of report.rows){
  if(!jobs.has(r.body))jobs.set(r.body,new Set());jobs.get(r.body).add(r.rule);
 }
 const stats=s=>{const b=bonusStats(s,data);return keys.map(k=>k==="psiSkill"&&s.currentStats[k]<=0&&(b[k]||0)>0?s.currentStats[k]:Math.max(k==="health"?1:0,s.currentStats[k]+(b[k]||0)))};
 function grow(s){
  const b=bodies.get(s.soldierType);if(!b||!valid(s.currentStats))throw Error("Invalid growth body/stat");
  const v=Object.fromEntries(keys.map(k=>{const x=s.currentStats[k],c=b.statCaps[k];if(!Number.isSafeInteger(c))throw Error("Unknown cap "+k);return [k,k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary||c<=x?x:k==="bravery"?x+10*Math.floor((c-x)/10):c]}));
  return same(vec(v),vec(s.currentStats))?s:{...s,currentStats:v};
 }
 const rankCmp=(a,b)=>sum(b.cap)-sum(a.cap)||sum(b.capRaw)-sum(a.capRaw)||a.steps.length-b.steps.length||JSON.stringify(a.steps).localeCompare(JSON.stringify(b.steps));
 const dominates=(a,b)=>a.cap.every((x,i)=>x>=b.cap[i])&&a.capRaw.every((x,i)=>x>=b.capRaw[i]);
 const metrics={visited:0,transformed:0,blocked:0,randomOrInvalid:0,duplicate:0,limitOrigins:0};
 for(const p of data.profiles.filter(p=>jobs.has(p.soldierType))){
  const root=initialState(data,p,{band:"min"});
  if(!valid(root.currentStats)||!valid(root.initialStats)){issues.push({origin:p.id,reason:"Invalid birth profile"});continue;}
  root.exactStats=true;root.historyKnown=true;
  const body=bodies.get(root.soldierType),baseline=grow(root),baselineRaw=vec(baseline.currentStats),baselineEffective=stats(baseline);
  const candidates=[...jobs.get(p.soldierType)].map(id=>rules.get(id)).filter(Boolean);
  const seen=new Set(),perOrder=new Map(),early=new Map(),stack=[{state:root,steps:[],order:[],needs:sorted(p.requires||[]),items:{...(p.acquisitionRequiredItems||{})},functions:sorted(p.requiresBaseFunc||[]),cost:p.cost||0,hasGrowth:false}];
  let visited=0,truncated=false;
  while(stack.length){
   if(visited>=maxStatesPerOrigin){truncated=true;metrics.limitOrigins++;break;}
   const n=stack.pop(),s=n.state,signature=JSON.stringify([n.order,vec(s.currentStats),[...s.history].sort(),[...s.bonusCounts].sort(),s.rank,n.hasGrowth]);
   if(seen.has(signature)){metrics.duplicate++;continue;}seen.add(signature);visited++;metrics.visited++;
   if(n.order.length){
    const end=grow(s),raw=vec(s.currentStats),capRaw=vec(end.currentStats),cap=stats(end),current=stats(s),traits=[...s.bonusCounts].sort(),steps=n.steps.map(a=>({...a}));
    const row={origin:p.id,body:s.soldierType,order:n.order,steps,rank:s.rank,raw,capRaw,current,cap,traits,
     researchGoals:n.needs,assumedItems:n.items,assumedBaseFunctions:n.functions,assumedCost:n.cost,
     rawDelta:capRaw.map((v,i)=>v-baselineRaw[i]),effectiveDelta:cap.map((v,i)=>v-baselineEffective[i]),
     overcap:capRaw.map((v,i)=>Math.max(0,v-body.statCaps[keys[i]])),
     scope:"CONDITIONAL_LOCAL_TRAINING_PATH",actualGameCertified:false,canonicalReplayVerified:false};
    const id=JSON.stringify(n.order);
    if(!n.hasGrowth){const prev=early.get(id);if(!prev||rankCmp(row,prev)<0)early.set(id,row);}
    let a=perOrder.get(id)||[];
    if(!a.some(x=>dominates(x,row))){a=a.filter(x=>!dominates(row,x));a.push(row);perOrder.set(id,a);}
   }
   if(n.order.length>=Math.min(maxSteps,candidates.length))continue;
   const g=grow(s),variants=g===s?[{state:s,added:false}]:[{state:s,added:false},{state:g,added:true}];
   for(const r of candidates){
    // This finite local batch tries each candidate at most once; repeatable rules remain open.
    if(n.order.includes(r.id)||r.createsClone||r.producedItem||r.producedSoldierType&&r.producedSoldierType!==body.id||!r.allowsLiveSoldiers)continue;
    if((r.requires||[]).some(id=>id==="STR_UNAVAILABLE"||!data.researchRules?.[id])){metrics.blocked++;continue;}
    for(const v of variants){
     const options={mode:"current",researched:r.requires||[],disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),statsKnown:true,medalsKnown:true,itemsKnown:true,baseFunctionsKnown:true,commendations:{}};
     const verdict=eligibleTransformation(r,v.state,data,options);
     if(verdict.kind!=="eligible"){metrics.blocked++;continue;}
     const result=applyTransformation(r,v.state,data,options);
     if(result.verdict.kind!=="eligible"||!result.state.exactStats||result.state.soldierType!==body.id||!valid(result.state.currentStats)){metrics.randomOrInvalid++;continue;}
     const items={...n.items};for(const [id,q] of Object.entries(r.requiredItems||{}))items[id]=(items[id]||0)+q;
     stack.push({state:result.state,steps:[...n.steps,...(v.added?[{type:"conditionalCapGrowth",soldier:"origin",assumption:true}]:[]),{type:"transform",soldier:"origin",transform:r.id}],order:[...n.order,r.id],needs:sorted([...n.needs,...r.requires||[]]),functions:sorted([...n.functions,...r.requiresBaseFunc||[]]),items,cost:n.cost+Math.max(0,r.cost||0),hasGrowth:n.hasGrowth||v.added});metrics.transformed++;
    }
   }
  }
  let local=0,improved=0;
  for(const [id,rs] of perOrder){
   const e=early.get(id);
   for(const r of rs.sort(rankCmp)){
    r.earlyTrainingCapRaw=e?.capRaw??null;r.earlyTrainingCap=e?.cap??null;
    r.timingRawDelta=e?r.capRaw.map((x,i)=>x-e.capRaw[i]):null;
    r.timingEffectiveDelta=e?r.cap.map((x,i)=>x-e.cap[i]):null;
    r.timingRawTotal=e?sum(r.timingRawDelta):null;r.timingEffectiveTotal=e?sum(r.timingEffectiveDelta):null;
    r.baselineRaw=baselineRaw;r.baselineEffective=baselineEffective;
    r.finalGrowthAssumption=true;
    if(r.timingRawTotal>0)improved++;
    rows.push(r);local++;
   }
  }
  profiles.push({origin:p.id,body:p.soldierType,sourceName:p.sourceKoName||p.sourceEnName||p.id,visited,paths:local,positiveTiming:improved,truncated});
 }
 rows.sort((a,b)=>a.origin.localeCompare(b.origin)||b.order.length-a.order.length||rankCmp(a,b));
 // Do not count action order variants as independent final research/trait sets.
 for(const r of rows){
  const k=JSON.stringify([r.origin,r.body,r.researchGoals,r.traits,r.rank]);
  const g=groups.get(k)||{origin:r.origin,body:r.body,researchGoals:r.researchGoals,traits:r.traits,rank:r.rank,variants:0,best:null,maxDepth:0};
  g.variants++;g.maxDepth=Math.max(g.maxDepth,r.order.length);if(!g.best||rankCmp(r,g.best)<0)g.best=r;groups.set(k,g);
 }
 const grouped=[...groups.values()].map(g=>({...g,best:{order:g.best.order,steps:g.best.steps,cap:g.best.cap,capRaw:g.best.capRaw,timingRawTotal:g.best.timingRawTotal}}));
 const represented=new Set(rows.map(x=>x.body));
 const bestByBody=[...represented].map(id=>{const local=rows.filter(r=>r.body===id),best=local.slice().sort((a,b)=>sum(b.rawDelta)-sum(a.rawDelta)||rankCmp(a,b))[0];return {id,name:bodies.get(id)?.koName,paths:local.length,multiPaths:local.filter(r=>r.order.length>=2).length,positiveTiming:local.filter(r=>r.timingRawTotal>0).length,best:{origin:best.origin,order:best.order,steps:best.steps,rawDelta:best.rawDelta,rawTotal:sum(best.rawDelta),timingRawTotal:best.timingRawTotal}};});
 return {schema:"ATLAS_CONDITIONAL_OVERCAP_LOCAL_PATHS_V1",sourceMetadataSha256:data.meta.source.metadataSha256,sourceRuntimeBlob,statKeys:keys,statLabels:data.statLabels,
  assumptions:["minimum birth profile","healthy, initial rank, no medals","required research availability at each action, supply and funds assumed","conditional growth, exact model deterministic transformations only","same-body listed candidate rules, each at most once","research order and campaign branch not replayed; not final admission"],
  summary:{profiles:profiles.length,bodies:represented.size,paths:rows.length,multiPaths:rows.filter(r=>r.order.length>=2).length,positiveTiming:rows.filter(r=>r.timingRawTotal>0).length,goalTraitGroups:grouped.length,metrics,unrepresentedBodies:[...jobs.keys()].filter(id=>!represented.has(id)),issues:issues.length},
  profiles,issues,bestByBody,groups:grouped,rows};
}
