// Produce new reachable conditional career vectors and action witnesses.
// Fixed research and assumed medal presets are not complete campaign models.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {signature,dominates,liveIndex,findCover,verifyCover} from "./population-antichain-core.mjs";
import {terminalFrontier} from "./population-closure-core.mjs";
import {MODEL,createCareerModel,PROMOTE,GROW} from "./population-career-frontier-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=read("public/data/branch-soldier-results.json.gz"),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const meta=db.populationAssumedBirthClosure,env=db.populationCareerEnvelope,v=db.populationSearch.versions.D3;
assert(meta&&env&&v);
function asset(m){const b=fs.readFileSync("public/data/"+m.file);assert.equal(sha(b),m.sha256);return JSON.parse(gunzipSync(b));}
const src=asset(meta),snap=asset(v),career=asset(env);
assert.equal(src.kind,"POPULATION_ASSUMED_BIRTH_CLOSURE");
assert.equal(src.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.deepEqual(src.origins,career.origins);assert.deepEqual(src.branches,career.branches);
assert.equal(src.summary.certifiedGroups,src.groups.length);
const {base,checker,careerBits,preset,scenario}=createCareerModel(data,snap);
const hashes=Object.fromEntries(["tools/build-population-career-frontier.mjs","tools/population-career-frontier-core.mjs","tools/population-random-box-core.mjs","tools/population-closure-core.mjs","tools/population-antichain-core.mjs","public/soldiers/modern/eligibility.js","public/data/soldiers-modern-index.json"].map(f=>[f,sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"))]));
const identity=key([MODEL,meta.sha256,env.sha256,v.sha256,hashes]);
const output=arg("out","public/data/soldier-population-career-frontier.json.gz");
const checkpoint=arg("checkpoint","population-career-frontier.checkpoint.json.gz");
const seconds=Number(arg("seconds","35")),limit=Number(arg("groups","120")),maxNew=Number(arg("new-states","100000")),maxRecords=Number(arg("group-records","35000"));
assert(Number.isFinite(seconds)&&seconds>0&&[limit,maxNew,maxRecords].every(n=>Number.isSafeInteger(n)&&n>0));
const before=fs.existsSync(checkpoint)?read(checkpoint):null;
if(before){assert.equal(before.identity,identity,"Source or solver changed; explicit checkpoint migration required");assert.equal(before.digest,key(before.payload));}
const prior=before?.payload||{},nodes=prior.nodes||[],work=prior.work||[];
const index=new Map(nodes.map((n,i)=>[JSON.stringify(n.state),i]));
const workById=new Map(work.map(g=>[g.group,g]));
const masks=src.groups.map(g=>BigInt("0x"+g.mask));
const affected=src.groups.filter(g=>masks[g.id]&careerBits).map(g=>g.id),affectedSet=new Set(affected);
const n0=nodes.length,metrics={requests:0,cacheHits:0,computed:0,newStates:0,expanded:0,covered:0,retired:0,gateRejected:0,outsideModel:0,closed:0,unproved:0,goalQueuePicks:0};
const totals=()=>Object.fromEntries(Object.entries(metrics).map(([k,n])=>[k,n+(prior.totals?.[k]||0)]));
const byGroupPairs=Array.from({length:src.groups.length},()=>[]),admittedCounts=Array(src.groups.length).fill(0);
for(let i=0;i<src.pairGroups.length;i++){
 const admitted=new Set(src.admittedGroups[i]);
 for(const g of src.pairGroups[i]){byGroupPairs[g].push(i);if(admitted.has(g))admittedCounts[g]++;}
}
const width=src.branches.length;
const targetStats=career.targets.filter(t=>t.target!==null&&t.newRejectedPairs>0).map(t=>[career.stats.indexOf(t.stat),t.target]);
const priority=affected.map(id=>{
 let viable=0,admitted=admittedCounts[id],envGroups=new Set();
 for(const p of byGroupPairs[id]){
  const gi=career.pairClasses[Math.floor(p/width)][p%width];envGroups.add(gi);
  const b=career.groups[gi].value;
  if(targetStats.some(([k,n])=>b.effectiveMax[k]>=n))viable++;
 }
 return {id,admitted,viable,pairs:byGroupPairs[id].length,envelopeGroups:envGroups.size};
}).sort((a,b)=>Number(b.admitted>0)-Number(a.admitted>0)||b.viable-a.viable||b.admitted-a.admitted||b.pairs-a.pairs||a.id-b.id);
const scenarios=new Map();
function modelFor(id){
 const mask=masks[id],medals=preset(mask),context=JSON.stringify([src.groups[id].mask,medals]);
 if(!scenarios.has(context))scenarios.set(context,scenario(mask,medals));
 return {context,model:scenarios.get(context),medals};
}
function intern(p){
 const k=JSON.stringify(p);if(index.has(k))return index.get(k);
 const id=nodes.length;nodes.push({state:p,edges:{}});index.set(k,id);metrics.newStates++;return id;
}
// A cache entry includes the complete fixed action/medal context. This
// avoids reusing a transition when medal-inclusive gates differ.
function transition(id,a,context,model){
 metrics.requests++;const n=nodes[id],k=JSON.stringify([context,a]);
 if(Object.hasOwn(n.edges,k)){metrics.cacheHits++;return n.edges[k];}
 metrics.computed++;const t=model.transition(n.state,a);
 const to=t.kind==="OK"?intern(t.state):t.kind==="GATE"?-1:-2;n.edges[k]=to;return to;
}
function add(g,id,parent,action,buckets){
 const p=nodes[id].state,k=signature(p),list=buckets.get(k)||[];
 if(findCover(p,g,nodes,buckets)!==null){metrics.covered++;return;}
 const keep=[],i=g.records.length;
 for(const j of list){const r=g.records[j];if(!r.live)continue;if(dominates(p,nodes[r.id].state)){r.live=false;metrics.retired++;}else keep.push(j);}
 g.records.push({id,parent,action,live:true});keep.push(i);buckets.set(k,keep);
}
function create(id){
 const x=src.groups[id],{medals}=modelFor(id),root=intern(x.roots[1]);
 const g={group:id,mask:x.mask,medals,roots:[root],records:[],cursor:0,status:"OPEN",outside:0};
 add(g,root,null,null,new Map());work.push(g);workById.set(id,g);return g;
}
const start=performance.now(),elapsed=()=>performance.now()-start;
const auditCache=new Map(),bucketsByGroup=new Map();
function finish(g,context,model){
 // verifyCover's input expects edges indexed by action. Expose a view of
 // only this group's context without duplicating the global state store.
 const view=new Proxy(nodes,{get(t,k){
  if(typeof k!=="string"||!/^\d+$/.test(k))return Reflect.get(t,k);
  const n=t[Number(k)];if(!n)return n;
  return {state:n.state,edges:Object.fromEntries(model.actions(n.state,model.mask).flatMap(a=>{
   const key=JSON.stringify([context,a]);return Object.hasOwn(n.edges,key)?[[String(a),n.edges[key]]]:[];
  }))};
 }});
 const a=verifyCover(g,view,model,checker,{replay:false,transitionCache:auditCache});
 g.audit=a;
 if(a.ok&&!g.outside){g.status="FIXED_PRESET_NUMERIC_CLOSED";metrics.closed++;}
 else{g.status="CANDIDATE_NOT_PROVED";metrics.unproved++;}
}
function expand(g,quantum=400){
 const {context,model}=modelFor(g.group);
 assert.deepEqual(g.medals,model.medals);
 let buckets=bucketsByGroup.get(g.group);if(!buckets){buckets=liveIndex(g,nodes);bucketsByGroup.set(g.group,buckets);}
 let n=0;
 while(g.cursor<g.records.length&&g.records.length<maxRecords&&n<quantum&&nodes.length-n0<maxNew&&elapsed()<seconds*1000){
  const j=g.cursor++,r=g.records[j];n++;if(!r.live)continue;metrics.expanded++;
  for(const a of model.actions(nodes[r.id].state,model.mask)){
   const to=transition(r.id,a,context,model);
   if(to===-1){metrics.gateRejected++;continue;}
   if(to===-2){g.outside++;metrics.outsideModel++;continue;}
   add(g,to,j,a,buckets);
  }
 }
 if(g.cursor===g.records.length)finish(g,context,model);
 return n;
}
let picked=0;
for(const p of priority){
 if(elapsed()>=seconds*1000||nodes.length-n0>=maxNew)break;
 const existing=workById.get(p.id);
 if(existing&&existing.status!=="OPEN")continue;
 if(!existing&&picked>=limit)continue;
 if(existing&&existing.records.length>=maxRecords)continue;
 const g=existing||create(p.id);if(!existing){picked++;metrics.goalQueuePicks++;}
 // Finish small high-impact groups before adding more new work.
 while(g.status==="OPEN"&&expand(g)>0&&elapsed()<seconds*1000&&nodes.length-n0<maxNew&&g.records.length<maxRecords){}
}
const totalMetrics=totals(),cumulativeMs=(prior.cumulativeMs||0)+elapsed();
const payload={nodes,work,totals:totalMetrics,cumulativeMs};
fs.writeFileSync(checkpoint+".tmp",gzipSync(Buffer.from(JSON.stringify({identity,digest:key(payload),payload})),{level:6}));fs.renameSync(checkpoint+".tmp",checkpoint);
// Export independent reachable frontier candidates from both objectives:
// permanent-only and fixed medal-inclusive. Preserve a parent action chain.
const groups=[],improvedPermanent=new Set(),improvedEffective=new Set(),improvedPairSet=new Set(),admittedImprovedPairs=new Set();
const baseGroup=meta.groups,recordsById=new Map(),newRecordMax=Array(12).fill(null),oldRecordMax=Array(12).fill(null);
const maxVec=(a,b)=>a.map((n,i)=>Math.max(n??-Infinity,b[i]));
let routes=0,permanentNovel=0,medalNovel=0,promotionRoutes=0,medalGateRoutes=0;
for(const g of baseGroup)for(const f of g.frontier)for(let i=0;i<12;i++)oldRecordMax[i]=Math.max(oldRecordMax[i]??-Infinity,f.vector[i]);
for(const w of work){
 const {context,model}=modelFor(w.group),previous=baseGroup[w.group].frontier;
 const live=w.records.filter(r=>r.live).map(r=>r.id);
 const effective=terminalFrontier(live,nodes,model),permanent=terminalFrontier(live,nodes,{terminal:p=>{const t=model.terminal(p);return {...t,vector:t.permanentVector};}});
 const ids=[...new Set([...effective,...permanent].map(f=>f.id))];
 const byId=new Map(w.records.map((r,i)=>[r.id,i])),frontier=[];
 for(const id of ids){
  const t=model.terminal(nodes[id].state),old=previous.filter(f=>f.body===t.body);
  const novelP=!old.some(f=>f.vector.every((n,i)=>n>=t.permanentVector[i]));
  const novelE=!old.some(f=>f.vector.every((n,i)=>n>=t.vector[i]));
  if(!novelP&&!novelE)continue;
  let j=byId.get(id),r=w.records[j];assert(r.live);
  const actions=[];while(r.parent!==null){
   const a=r.action,prev=w.records[r.parent];assert.equal(transition(prev.id,a,context,model),r.id);
   actions.push(a===PROMOTE?{kind:"ASSUMED_PROMOTION",rank:nodes[r.id].state[4]}:a===GROW?{kind:"CAP_TARGET"}:{kind:"TRANSFORM",id:base.rules[a].id,requiredMedals:base.rules[a].requiredCommendations||{}});
   j=r.parent;r=w.records[j];
  }
  actions.reverse();assert(w.roots.includes(r.id));
  let replay=nodes[r.id].state;for(const a of actions){
   const k=a.kind==="ASSUMED_PROMOTION"?PROMOTE:a.kind==="CAP_TARGET"?GROW:base.rules.findIndex(x=>x.id===a.id);
   const step=model.transition(replay,k);assert.equal(step.kind,"OK");replay=step.state;
  }
  assert.deepEqual(replay,nodes[id].state);
  if(novelP){permanentNovel++;improvedPermanent.add(w.group);}
  if(novelE){medalNovel++;improvedEffective.add(w.group);}
  if(actions.some(a=>a.kind==="ASSUMED_PROMOTION"))promotionRoutes++;
  if(actions.some(a=>Object.keys(a.requiredMedals||{}).length))medalGateRoutes++;
  for(let i=0;i<12;i++)newRecordMax[i]=Math.max(newRecordMax[i]??-Infinity,t.permanentVector[i]);
  frontier.push({id:key([w.group,w.medals,actions,t.permanentVector,t.vector,t.body]).slice(0,24),...t,actions,novelPermanent:novelP,novelMedalInclusive:novelE});
  routes++;
 }
 if(frontier.some(f=>f.novelPermanent))for(const pi of byGroupPairs[w.group]){
  improvedPairSet.add(pi);if(src.admittedGroups[pi].includes(w.group))admittedImprovedPairs.add(pi);
 }
 groups.push({group:w.group,status:w.status,mask:w.mask,medals:w.medals,frontier,states:w.records.length,expanded:w.cursor,pairs:byGroupPairs[w.group].length,admittedPairs:admittedCounts[w.group]});
}
const closed=new Set(work.filter(g=>g.status==="FIXED_PRESET_NUMERIC_CLOSED").map(g=>g.group));
let modelClosedPairs=0,modelPartialPairs=0,modelUnprocessedPairs=0;
for(const gs of src.pairGroups){
 const need=gs.filter(g=>affectedSet.has(g));if(need.every(g=>closed.has(g)))modelClosedPairs++;
 else if(need.some(g=>workById.has(g)))modelPartialPairs++;else modelUnprocessedPairs++;
}
const summary={pairCount:src.pairGroups.length,affectedGroups:affected.length,unaffectedGroups:src.groups.length-affected.length,
 processedGroups:work.length,closedGroups:closed.size,openGroups:work.filter(g=>g.status==="OPEN").length,unprovedGroups:work.filter(g=>g.status==="CANDIDATE_NOT_PROVED").length,
 modelClosedPairs,modelPartialPairs,modelUnprocessedPairs,novelRoutes:routes,permanentNovel,medalNovel,promotionRoutes,medalGateRoutes,
 improvedPermanentGroups:improvedPermanent.size,improvedMedalGroups:improvedEffective.size,improvedPermanentPairs:improvedPairSet.size,admittedImprovedPairs:admittedImprovedPairs.size,
 oldPermanentMax:oldRecordMax,newPermanentMax:newRecordMax,storedStates:nodes.length,elapsedMs:Math.round(elapsed()),cumulativeMs:Math.round(cumulativeMs),
 metrics:totalMetrics,globalCompleted:0,globalOptimalCertified:0,actualGameCertified:0};
const result={schemaVersion:1,kind:"POPULATION_CONDITIONAL_CAREER_FRONTIER",model:MODEL,identity,sourceMetadataSha256:db.sourceMetadataSha256,hashes,
 source:{file:meta.file,sha256:meta.sha256,pairMapHash:meta.pairMapHash},envelope:{file:env.file,sha256:env.sha256},sourceD3Sha256:v.sha256,
 origins:src.origins,branches:src.branches,stats:db.stats,groups,priority,summary,
 scope:{birth:"Hypothetical max birth in recorded birth box; admitted aliases distinct from actual joint birth.",research:"One observed fixed-active history. No new research.",promotion:"Assumed rank increments up to relevant threshold, honoring indexed rank caps and reset.",medals:"One fixed preset of gate-required medal levels; attainment assumed, not all levels or award histories.",growth:"Conditional cap target and all-max supported independent flat rolls.",proof:"Closed means antichain simulation of this fixed preset only; all novel paths independently replayed. Partial groups retain reachable conditional candidates. No global optimality or campaign completion."}};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({file:output,bytes:fs.statSync(output).size,sha256:sha(fs.readFileSync(output)),summary,top:groups.filter(g=>g.frontier.length).slice(0,2).map(g=>({group:g.group,pairs:g.pairs,status:g.status,medals:g.medals,route:g.frontier[0]}))}));
