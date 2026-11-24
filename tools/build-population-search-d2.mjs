// Population-wide bounded numeric search: 72 origins x 1064 accepted branches.
// Final ACTIVE research snapshots only. Recruitment, supply, growth and RNG
// acquisition are conditional; no proof of a full campaign or global optimum.
// Same numeric transition may be reused across exact history/provenance aliases.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {initialState,applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=x=>createHash("sha256").update(x).digest("hex");
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/branch-soldier-results.json.gz")));
const data=read("public/data/soldiers-modern-index.json");
const historyFile=arg("histories","D:/xpiratez-data-atlas/experiments/endgame-current-save/12-damsel-madgal-2280-cap-research-history-pareto.json");
const histories=read(historyFile),depth=Number(arg("depth","2")),cachePath=arg("cache","population-search-transition-cache.json.gz");
const source=data.meta.source.metadataSha256;
if(source!==db.sourceMetadataSha256||source!==histories.sourceMetadataSha256||data.meta.mod.version!=="v.o2"||data.profiles.length!==72||depth<1||depth>3)throw Error("Invalid population source/depth");
const accepted=db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount>0).sort((a,b)=>a.rank-b.rank);
const ranks=new Map(histories.parentRows.map(b=>[b.rank,b]));
if(accepted.length!==1064)throw Error("Expected 1064 accepted branches, got "+accepted.length);
for(const b of accepted){const h=ranks.get(b.rank);if(!h||h.sourceRootConflict||h.historyCount!==b.historyCount||JSON.stringify(h.captain)!==JSON.stringify(b.captain)||["path","cause","queen","codex"].some(k=>(h.choices[k]||null)!==(b.choices[k]||null)))throw Error("Branch mismatch "+b.rank);}
const branchIndex=new Map(accepted.map((b,i)=>[b.rank,i]));
const hs=histories.histories.filter(h=>branchIndex.has(h.rank));
if(hs.length!==1577||accepted.some(b=>hs.filter(h=>h.rank===b.rank).length!==b.historyCount))throw Error("History coverage mismatch");
const sourceFiles=["tools/build-population-search-d2.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/research-training-locks.js"];
const engine=hash(sourceFiles.map(p=>hash(fs.readFileSync(p))).join("|"));
const cacheKey=source+"|"+engine;
const useCache=!process.argv.includes("--no-cache");
const researchVocabulary=[...new Set(hs.flatMap(h=>h.finalActiveIds))].sort(),researchBit=new Map(researchVocabulary.map((id,i)=>[id,1n<<BigInt(i)]));
const historyMask=h=>h.finalActiveIds.reduce((mask,id)=>mask|researchBit.get(id),0n).toString(16);
const persistent=useCache&&fs.existsSync(cachePath)?JSON.parse(zlib.gunzipSync(fs.readFileSync(cachePath))):null;
const cache=new Map(persistent?.key===cacheKey?persistent.entries:[]);
const counts={transitionRequests:0,transitionComputed:0,transitionCacheHits:0,diskCacheEntries:cache.size,historyOriginRequests:0,historyOriginBirthGateMissing:0,groupCalculations:0,historyGroupReuse:0,numericNodes:0,orderedLabels:0,nodeSuccessorRequests:0,nodeSuccessorReuse:0,terminalParetoRemoved:0,actualGameCertified:0,globalPruned:0,rankMedalRejectedOrOtherGate:0,randomOrUnknown:0};
const bodies=new Map(data.soldiers.map(b=>[b.id,b]));
const rules=data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"));
const byBody=new Map();
for(let i=0;i<rules.length;i++)for(const b of rules[i].allowedSoldierTypes){const ids=byBody.get(b)||[];ids.push(i);byBody.set(b,ids);}
const bits=rules.map((_,i)=>1n<<BigInt(i));
const readyMasks=hs.map(h=>{const active=new Set(h.finalActiveIds);let mask=0n;for(let i=0;i<rules.length;i++)if(rules[i].requires.every(id=>active.has(id)))mask|=bits[i];return {active,mask};});
const reachableMask=p=>{let bodies=new Set([p.soldierType]),mask=0n;for(let d=0;d<depth;d++){const next=new Set(bodies);for(const b of bodies)for(const i of byBody.get(b)||[]){mask|=bits[i];next.add(rules[i].producedSoldierType||b);}bodies=next;}return mask;};
const vec=s=>STAT_KEYS.map(k=>s[k]),total=v=>v.reduce((a,b)=>a+b,0);
const sorted=m=>[...m].sort(([a],[b])=>a.localeCompare(b));
const project=s=>[s.soldierType,s.armorId,s.status,s.corpseRecovered,s.rank,vec(s.initialStats),vec(s.currentStats),sorted(s.history),sorted(s.bonusCounts),[...s.bonusIds].sort(),s.retired,s.historyKnown,s.exactStats];
function unpack(p){
 const [soldierType,armorId,status,corpseRecovered,rank,ini,raw,hist,bc,bi,retired,historyKnown,exactStats]=p;
 return {soldierType,armorId,status,corpseRecovered,rank,initialStats:Object.fromEntries(STAT_KEYS.map((k,i)=>[k,ini[i]])),currentStats:Object.fromEntries(STAT_KEYS.map((k,i)=>[k,raw[i]])),history:new Map(hist),bonusCounts:new Map(bc),bonusIds:new Set(bi),retired,historyKnown,exactStats,researchIds:new Set(),steps:[],remarks:[]};
}
function fill(s){const body=bodies.get(s.soldierType),raw={...s.currentStats};for(const k of STAT_KEYS){
 if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)continue;
 const cap=body.statCaps[k],v=raw[k];if(Number.isSafeInteger(cap)&&cap>v)raw[k]=k==="bravery"?v+10*Math.floor((cap-v)/10):cap;
 }return {...s,currentStats:raw};}
function finish(s){const t=fill(s),raw=vec(t.currentStats),b=bonusStats(t,data),bonus=STAT_KEYS.map(k=>b[k]||0),vector=raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));return {body:s.soldierType,raw,bonus,vector,bonusIds:[...s.bonusIds].sort()};}
function transition(s,i,grow){
 const before=grow?fill(s):s;if(grow&&vec(before.currentStats).every((v,k)=>v===s.currentStats[STAT_KEYS[k]]))return null;
 const key=JSON.stringify([project(before),i]);counts.transitionRequests++;
 let entry;
 if(useCache&&cache.has(key)){counts.transitionCacheHits++;entry=cache.get(key);}
 else{
  counts.transitionComputed++;
  const r=rules[i],x=applyTransformation(r,before,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:{},statsKnown:true,medalsKnown:true});
  entry=x.verdict.kind!=="eligible"?["GATE"]:!x.state.exactStats||x.state.retired?["RANDOM"]:["OK",project(x.state)];
  if(useCache)cache.set(key,entry);
 }
 if(entry[0]!=="OK"){if(entry[0]==="GATE")counts.rankMedalRejectedOrOtherGate++;else counts.randomOrUnknown++;return null;}
 return unpack(entry[1]);
}
const start=performance.now(),cpuStart=process.cpuUsage(),records=[],witnesses={},allGroups=[],matrix=[];
const dominance=(a,b)=>a.vector.every((n,i)=>n>=b.vector[i])&&a.fees<=b.fees&&(a.fees<b.fees||a.vector.some((n,i)=>n>b.vector[i]));
for(const p of data.profiles){
 const available=reachableMask(p),groups=new Map(),pairGroups=Array.from({length:accepted.length},()=>[]);
 for(let hi=0;hi<hs.length;hi++){
  counts.historyOriginRequests++;
  const {active,mask}=readyMasks[hi];
  if((p.requires||[]).some(id=>!active.has(id))){counts.historyOriginBirthGateMissing++;continue;}
  // Entire chronological histories remain aliases. Only the fixed-research,
  // externally supplied D<=depth numerical model projects to these bits.
  const key=(mask&available).toString(16);let g=groups.get(key);
  if(!g){g={mask:mask&available,histories:[],index:allGroups.length+groups.size};groups.set(key,g);}
  g.histories.push(hi);const pi=branchIndex.get(hs[hi].rank);
  if(!pairGroups[pi].includes(g.index))pairGroups[pi].push(g.index);
 }
 for(const g of groups.values()){
  counts.groupCalculations++;counts.historyGroupReuse+=g.histories.length-1;
  const branchIds=[...new Set(g.histories.map(i=>accepted[branchIndex.get(hs[i].rank)].id))].sort();
  const labels=[],nodes=[],nodeMap=new Map(),edgeCache=new Map();
  // Keep every ordered label, while memoizing exact numerical states and
  // successor transitions. Costs/materials remain per route, never merged.
  function node(s){
   const key=JSON.stringify(project(s));let n=nodeMap.get(key);
   if(n===undefined){n=nodes.length;nodeMap.set(key,n);nodes.push({s,terminal:finish(s)});}
   return n;
  }
  function visit(n,band,steps,growth,fees){
   labels.push({n,band,steps,growth,fees});
   if(steps.length>=depth)return;
   counts.nodeSuccessorRequests++;
   let edges=edgeCache.get(n);
   if(edges)counts.nodeSuccessorReuse++;
   if(!edges){
    edges=[];const s=nodes[n].s;
    for(const i of byBody.get(s.soldierType)||[])if(g.mask&bits[i])for(const grow of [false,true]){
     const t=transition(s,i,grow);if(t)edges.push([node(t),i,grow]);
    }
    edgeCache.set(n,edges);
   }
   for(const [next,i,grow] of edges)visit(next,band,[...steps,i],[...growth,grow],fees+Math.max(0,rules[i].cost||0));
  }
  for(const band of ["min","max"]){
   const s={...initialState(data,p,{band}),historyKnown:true,exactStats:true};
   if(!vec(s.currentStats).every(Number.isSafeInteger)||!vec(s.initialStats).every(Number.isSafeInteger))throw Error("Noninteger birth "+p.id);
   visit(node(s),band,[],[],0);
  }
  counts.numericNodes+=nodes.length;counts.orderedLabels+=labels.length;
  const terminal=labels.map(l=>({...l,...nodes[l.n].terminal}));
  const byFinal=new Map();
  for(let i=0;i<terminal.length;i++){const l=terminal[i],ids=byFinal.get(l.body)||[];ids.push(i);byFinal.set(l.body,ids);}
  const representativeIds=[];
  for(const [body,ids] of byFinal){
   // Terminal display Pareto only; all labels remain in group data.
   const unique=new Map();
   for(const i of ids){const l=terminal[i],k=JSON.stringify([l.vector,l.fees]);if(!unique.has(k))unique.set(k,i);}
   // A strict dominator has >= total and <= fee; ties in total
   // are ordered by fee. Comparing retained dominators is transitive.
   const us=[...unique.values()].sort((i,j)=>total(terminal[j].vector)-total(terminal[i].vector)||terminal[i].fees-terminal[j].fees||i-j),front=[];
   for(const i of us)if(!front.some(j=>dominance(terminal[j],terminal[i])))front.push(i);
   front.sort((a,b)=>a-b);
   counts.terminalParetoRemoved+=ids.length-front.length;
   for(const i of front){
    const l=terminal[i],seq=l.steps.map(i=>rules[i].id),wkey=JSON.stringify([p.id,l.band,seq,l.growth,l.raw,l.bonus]);
    const id="POPSEARCH12:"+hash(wkey).slice(0,24);
    let w=witnesses[id];
    if(!w){w={source:"POPSEARCH12",originProfile:p.id,body:l.body,raw:l.raw,bonus:l.bonus,vector:l.vector,bonusIds:l.bonusIds,steps:seq.map(id=>({id,count:1})),growthBefore:l.growth,placement:"FIXED_ACTIVE_RESEARCH_CAP_TARGET",birthBand:l.band,fees:l.fees,research:[...new Set([...(p.requires||[]),...l.steps.flatMap(i=>rules[i].requires)])].sort(),branchIds:[],populationGroups:[],actualGameCertified:false};witnesses[id]=w;}
    w.populationGroups.push(g.index);representativeIds.push(id);
   }
  }
  // Store group support once, including every source history and every ordered
  // path label. No global frontier is used to eliminate intermediate states.
  allGroups.push({originProfile:p.id,readyMask:g.mask.toString(16),historyIndices:g.histories,branchIds,representativeIds:[...new Set(representativeIds)],states:nodes.map(n=>({...n.terminal,state:project(n.s)})),edges:[...edgeCache].map(([n,e])=>[n,e.map(([to,i,grow])=>[to,i,Number(grow)])]),labels:labels.map(l=>[l.n,l.band==="max"?1:0,l.steps,l.growth.map(Number),l.fees])});
 }
 matrix.push(pairGroups);
 records.push({originProfile:p.id,body:p.soldierType,sourceType:p.sourceType,birthRequires:p.requires||[],birthTimingUnverified:true,groups:groups.size,coveredPairs:pairGroups.filter(a=>a.length).length});
 console.log(p.id,groups.size,pairGroups.filter(a=>a.length).length);
}
const pairCount=accepted.length*data.profiles.length,covered=matrix.flat().filter(a=>a.length).length;
const elapsedMs=Math.round(performance.now()-start),cpuUsage=process.cpuUsage(cpuStart);
const result={schemaVersion:1,kind:"POPULATION_FIXED_ACTIVE_DAG",sourceMetadataSha256:source,engine,historyFileHash:hash(fs.readFileSync(historyFile)),depth,origins:data.profiles.map(p=>p.id),branches:accepted.map(b=>b.id),researchVocabulary,histories:hs.map(h=>({id:h.id,branchId:accepted[branchIndex.get(h.rank)].id,steps:h.steps,activeHash:hash(JSON.stringify([...h.finalActiveIds].sort())),activeMaskHex:historyMask(h)})),rules:rules.map(r=>r.id),matrix,groups:allGroups,records,witnesses,summary:{...counts,pairCount,coveredPairs:covered,missingFinalBirthGatePairs:pairCount-covered,registered:Object.keys(witnesses).length,elapsedMs,cpuUserMs:Math.round(cpuUsage.user/1000),cpuSystemMs:Math.round(cpuUsage.system/1000),cacheEnabled:useCache,cacheEntries:cache.size,peakRssBytes:process.resourceUsage().maxRSS*1024,scope:"FIXED_ACTIVE_RESEARCH_D"+depth,modeledOrigins:records.filter(r=>r.groups>0).length,eventTimingUnverifiedPairs:records.filter(r=>r.sourceType==="event").reduce((n,r)=>n+r.coveredPairs,0),fullCampaignCertified:0}};
fs.writeFileSync(arg("out","population-search-d2.json.gz"),zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));
if(useCache)fs.writeFileSync(cachePath,zlib.gzipSync(Buffer.from(JSON.stringify({key:cacheKey,entries:[...cache]})),{level:6}));
console.log(JSON.stringify(result.summary));
