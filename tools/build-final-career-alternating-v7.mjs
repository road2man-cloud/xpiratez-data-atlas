// Alternating ordered research acquisition and conditional fixed-research
// treatment closure. All stored paths are concrete replay witnesses.
// Quotient aliases are used ONLY within fixed-set subgraphs: omitted
// research timings at aliases, unsupported families and planner alternatives
// remain open obligations. Execution budgets do not limit career depth.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {createBridge,birthCatalog} from "./population-frontier-chronology-core.mjs";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {researchSet,researchSetId} from "./final-career-active-research-sets.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {createResearchSegments} from "./final-career-research-segments.mjs";
import {createConditionalResourceQuotient} from "./final-career-conditional-resource-quotient.mjs";
import {createResearchAlternatives,researchGoalGroup} from "./final-career-research-alternatives.mjs";
import {createResearchBatch} from "./final-career-research-batch.mjs";
import {createInductiveUpper,POLICY as UPPER_POLICY} from "./final-career-inductive-upper.mjs";
import {createUpperPriority,compareBounds,POLICY as PRIORITY_POLICY} from "./final-career-upper-priority.mjs";
import {createJointResearch,POLICY as JOINT_POLICY} from "./final-career-joint-research.mjs";
const MODEL="ALTERNATING_RESEARCH_CAREER_REPLAY_V7";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),ledger=db.populationFrontierChronology,data=read("public/data/soldiers-modern-index.json");
const fixed=decode("public/data/soldier-final-career-active-closure-v3.json.gz"),exp=decode("public/data/soldier-final-career-research-expansion.json.gz"),ec=decode("public/data/soldier-final-career-expanded-closure.json.gz");
assert.equal(exp.sourceClosureFingerprint,fixed.fingerprint);assert.equal(ec.sourceExpansionFingerprint,exp.fingerprint);
for(const x of [fixed,exp,ec])assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const files=["tools/build-final-career-alternating-v7.mjs","tools/final-career-joint-research.mjs","tools/final-career-upper-priority.mjs","tools/final-career-inductive-upper.mjs","tools/population-scalar-upper-bound.mjs","public/data/soldiers-modern-index.json","tools/final-career-research-batch.mjs","tools/final-career-research-alternatives.mjs","tools/final-career-repeat-quotient.mjs","tools/final-career-conditional-resource-quotient.mjs","tools/population-frontier-chronology-core.mjs","tools/population-research-career-core.mjs","tools/population-growth-replay-core.mjs","tools/population-chronological-career-core.mjs","tools/final-career-active-research-sets.mjs","tools/final-career-research-reuse.mjs","tools/final-career-research-segments.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/foundation-research-planner.js","public/soldiers/modern/research-training-locks.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/origin-campaign-context.js"];
const fingerprint=key([MODEL,db.sourceMetadataSha256,fixed.fingerprint,exp.fingerprint,ec.fingerprint,files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]);
const out="public/data/soldier-final-career-alternating-v7.json.gz",oldFile="public/data/soldier-final-career-alternating-v6.json.gz";
const prior=fs.existsSync(out)?decode(out):decode(oldFile);
if(prior.schema===MODEL)assert.equal(prior.fingerprint,fingerprint,"Explicit migration required on model change");else{assert.equal(prior.schema,"ALTERNATING_RESEARCH_CAREER_REPLAY_V6");assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(prior.sourceExpansionFingerprint,exp.fingerprint);assert.equal(prior.sourceExpandedClosureFingerprint,ec.fingerprint);}
const migration=prior.schema===MODEL?prior.migration:{from:prior.fingerprint,graphs:Object.keys(prior.graphs).length,tasks:Object.keys(prior.tasks).length,receipts:Object.keys(prior.receipts).length,previous:prior.migration};
const retryHistory=prior.retryHistory||{};
const jointRequests=prior.jointRequests||{},jointReceipts=prior.jointReceipts||{};
const graphs=prior?.graphs||{},tasks=prior?.tasks||{},receipts=prior?.receipts||{},sets=prior?.sets||{};
const batch=createResearchBatch(tasks,receipts,prior.batchTried||{});
const births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const {engine,replay,loadBirth}=createBridge(data,db,ledger.cacheHashes||ledger.hashes,{cache:true,templates:prior?.templates||exp.templates||{}});
let segments;try{segments=createResearchSegments(decode("public/data/soldier-final-career-research-index.json.gz"),db,engine);}catch{}
const alternatives=createResearchAlternatives(data,engine);
const upperEngine=createInductiveUpper(data,engine),upperBounds=prior.upperBounds||{},upperRefs=prior.upperRefs||{},upperErrors=prior.upperErrors||{},upperTransitions=prior.upperTransitions||{};
const priority=createUpperPriority(data),priorityRound={policy:PRIORITY_POLICY,goalPriorityPicks:0,fairGoalPicks:0,gapPriorityBatches:0,newTransitionBounds:0,raisedTransitions:0,transitionErrors:0};
function boundOf(w,branch){const b=upperEngine.compute(w,branch);upperBounds[b.signature]=b;return b;}
function transitionOf(id,g,before,after){assert.equal(exactWorld(before),g.sourceStateHash);assert.equal(exactWorld(after),g.rootStateHash);assert.equal(researchSetId(before,g.branch),g.sourceSet);assert.equal(researchSetId(after,g.branch),g.researchSet);const a=boundOf(before,g.branch),b=boundOf(after,g.branch);upperRefs[id]={bound:b.signature,rootStateHash:g.rootStateHash,researchSet:g.researchSet};const cmp=compareBounds(a,b);upperTransitions[id]={...cmp,sourceStateHash:g.sourceStateHash,resultStateHash:g.rootStateHash,sourceSet:g.sourceSet,resultSet:g.researchSet};priorityRound.newTransitionBounds++;priorityRound.raisedTransitions+=Number(cmp.raisedAxes>0);delete upperErrors[id];return cmp;}
const quotient=createConditionalResourceQuotient(data),rules=new Map(data.transformations.map(r=>[r.id,r])),allBody=new Map();
for(const r of rules.values())for(const b of r.allowedSoldierTypes||[]){const a=allBody.get(b)||[];a.push(r);allBody.set(b,a);}
const round={newTasks:0,plans:0,researchRoots:0,expanded:0,states:0,aliases:0,duplicateHistories:0,suffixHits:0,suffixTrials:0,compactSuffixHits:0,groupGateHits:0,groupGateBuilds:0,retries:0,recovered:0,alternativeSuccesses:0,errors:[]};
const cache=new Map(),seen=new Map(),suffixes=new Map(),prefixMetrics={hits:0,rootReplays:0,edgeReplays:0,nearestAncestorHits:0};
const cacheLimit=Number(arg("cache","320"));assert(Number.isSafeInteger(cacheLimit)&&cacheLimit>=32);
function put(k,v){cache.delete(k);while(cache.size>=cacheLimit)cache.delete(cache.keys().next().value);cache.set(k,v);return v;}
function get(k){const v=cache.get(k);if(v){cache.delete(k);cache.set(k,v);prefixMetrics.hits++;}return v;}
function prefixFollow(kind,id,node,g,loadRoot){const path=[];let p=node,v;for(;;){const k=[kind,id,p].join("|");v=get(k);if(v){if(path.length)prefixMetrics.nearestAncestorHits++;break;}if(p===0){v=put(k,loadRoot());prefixMetrics.rootReplays++;assert.equal(exactWorld(v.world),g.nodes[0].stateHash);break;}const n=g.nodes[p];assert(n&&Number.isInteger(n.parent)&&n.parent<p);path.push(p);p=n.parent;}for(const i of path.reverse()){const n=g.nodes[i],world=replay.replay(n.steps,v.world);assert.equal(exactWorld(world),n.stateHash);v=put([kind,id,i].join("|"),{...v,world,steps:[...v.steps,...n.steps]});prefixMetrics.edgeReplays++;}return v;}
function remember(branch,goal,actions){const k=key([branch,goal]),a=suffixes.get(k)||[],h=key(actions);if(!a.some(x=>x.hash===h))a.push({hash:h,actions});suffixes.set(k,a);}
for(const [id,e] of Object.entries(exp.expansions)){remember(e.branch,e.goal,e.researchActions);batch.addProposal(e,["E",id]);}
for(const [id,g] of Object.entries(graphs)){remember(g.branch,g.goal,g.researchActions);batch.addProposal(g,["R",id]);}
function fixedSource(root,node){
 const g=fixed.graphs[root],r=ledger.routes[root];assert(g&&r&&!r.rankDefault&&r.fullActionHash===g.rootActionHash&&r.canonicalStateHash===g.rootStateHash);
 return prefixFollow("fixed",root,node,g,()=>{
  const b=loadBirth(births.get(r.input)),w=replay.replay(r.actions,b.n.world);assert.equal(exactWorld(w),g.rootStateHash);
  return {world:w,steps:r.actions,birth:b,root,origin:g.origin,branch:g.branch,allowed:g.allowedDifficulties,input:r.input,generation:0};
 });
}
function source(ref){
 const [kind,id,node]=ref;
 if(kind==="E"){
  const e=exp.expansions[id],g=ec.graphs[id];assert(e&&g&&e.resultStateHash===g.rootStateHash&&e.fullActionHash===g.rootActionHash);
  return prefixFollow(kind,id,node,g,()=>{
   const v=fixedSource(e.root,e.node);assert.equal(exactWorld(v.world),e.sourceStateHash);
   const w=replay.replay(e.researchActions,v.world),steps=[...v.steps,...e.researchActions];
   assert.equal(exactWorld(w),e.resultStateHash);assert.equal(key([...v.birth.birth,...steps]),e.fullActionHash);assert.equal(researchSetId(w,v.branch),e.resultSet);
   return {...v,world:w,steps,allowed:e.allowedDifficulties,generation:1};
  });
 }
 assert.equal(kind,"R");const g=graphs[id];assert(g);
 return prefixFollow(kind,id,node,g,()=>{
  const v=source(g.source);assert.equal(exactWorld(v.world),g.sourceStateHash);
  const w=replay.replay(g.researchActions,v.world),steps=[...v.steps,...g.researchActions];assert.equal(exactWorld(w),g.rootStateHash);assert.equal(key([...v.birth.birth,...steps]),g.fullActionHash);assert.equal(researchSetId(w,v.branch),g.researchSet);
  return {...v,world:w,steps,allowed:g.allowedDifficulties,generation:g.generation};
 });
}
function meta(ref){const [kind,id,node]=ref,g=kind==="E"?ec.graphs[id]:graphs[id];const e=kind==="E"?exp.expansions[id]:g;return {g,n:g.nodes[node],root:e.root,origin:e.origin,branch:e.branch,sourceSet:g.researchSet,generation:kind==="E"?1:g.generation};}
const queues=new Map(),retryQueues=new Map(),turns=new Map(),groupAttempts=new Map(),groupSuccess=new Set(),gateCache=new Map();let serial=0;
const retryable=r=>["LIMITED_PLANNER_UNRESOLVED","JOINT_REPLAY_UNRESOLVED"].includes(r?.status);
for(const [id,r] of Object.entries(receipts)){const t=tasks[id];assert(t);const k=researchGoalGroup(t);groupAttempts.set(k,(groupAttempts.get(k)||0)+1);if(r.graph)groupSuccess.add(k);}
function enqueue(id,t,retry=false){const q=retry?retryQueues:queues,a=q.get(t.origin)||[];a.push([id,t]);q.set(t.origin,a);}
function addTasks(ref){
 const {n,origin,branch,sourceSet,generation}=meta(ref),s=sets[sourceSet]||exp.sets[sourceSet];assert(s);
 const ck=key([sourceSet,n.body]);let groups=gateCache.get(ck);
 if(!groups){const active=new Set(s.active);groups=new Map();
  for(const r of engine.byBody.get(n.body)||[]){const missing=r.requires.filter(k=>!active.has(k)).sort();if(!missing.length)continue;const k=JSON.stringify(missing),g=groups.get(k)||{goal:missing,targets:[]};g.targets.push(r.id);groups.set(k,g);}
  gateCache.set(ck,groups);round.groupGateBuilds++;
 }else round.groupGateHits++;
 for(const g of groups.values()){
  const fresh=g.targets.filter(id=>{const b=rules.get(id).soldierBonusType;return b&&!n.traits.includes(b);}).length;
  const id=key([ref,g.goal]),t={ref,origin,branch,sourceSet,generation,goal:g.goal,targets:[...g.targets].sort(),fresh};
  if(tasks[id]){assert.deepEqual(tasks[id],t);continue;}tasks[id]=t;batch.addTarget(id,t);round.newTasks++;if(!receipts[id])enqueue(id,t);
 }
}
for(const [id,t] of Object.entries(tasks)){if(!receipts[id])enqueue(id,t);else if(retryable(receipts[id])&&(retryHistory[id]?.length||0)<3)enqueue(id,t,true);}
for(const [id,g] of Object.entries(ec.graphs))for(let i=0;i<g.nodes.length;i++)addTasks(["E",id,i]);
for(const [id,g] of Object.entries(graphs))for(let i=0;i<g.nodes.length;i++)addTasks(["R",id,i]);
function goalPotential(t){const {n}=meta(t.ref),ref=t.ref[0]==="R"?upperRefs[t.ref[1]]:null;return priority.goalScore(t,n,ref?upperBounds[ref.bound]?.initial:null);}
function compare(a,b,high=false){
 const ka=researchGoalGroup(a[1]),kb=researchGoalGroup(b[1]);
 if(high){const d=goalPotential(b[1])-goalPotential(a[1]);if(d)return d;}
 // Prioritize proven reusable proposals, then under-sampled research groups.
 return Number(groupSuccess.has(kb))-Number(groupSuccess.has(ka))||Math.min(20,groupAttempts.get(ka)||0)-Math.min(20,groupAttempts.get(kb)||0)||b[1].fresh-a[1].fresh||a[1].goal.length-b[1].goal.length||a[1].generation-b[1].generation||a[0].localeCompare(b[0]);
}
function pick(q){for(const [o,a] of q)q.set(o,a.filter(([id])=>q===retryQueues?retryable(receipts[id]):!receipts[id]));let origin=null;for(const [o,a] of q)if(a.length&&(origin===null||(turns.get(o)||0)<(turns.get(origin)||0)))origin=o;if(origin===null)return null;
 turns.set(origin,++serial);const a=q.get(origin);let best=0;const high=round.plans%3!==0;for(let i=1;i<a.length;i++)if(compare(a[i],a[best],high)<0)best=i;
 priorityRound[high?"goalPriorityPicks":"fairGoalPicks"]++;
 const row=a[best];a[best]=a.at(-1);a.pop();return row;
}
function nextTask(){const retry=round.plans%4===0;const t=retry?(pick(retryQueues)||pick(queues)):(pick(queues)||pick(retryQueues));return t;}

function insert(id,g,w,parent,action,steps){
 const stateHash=exactWorld(w),projection=quotient.project(w);let m=seen.get(id);if(!m){m=new Map(g.nodes.map((n,i)=>[n.projection,i]));seen.set(id,m);}
 if(m.has(projection)){round.aliases++;return {status:"FIXED_SET_ALIAS",to:m.get(projection),stateHash,projection,steps,researchTimingUnresolved:true};}
 const to=g.nodes.length;m.set(projection,to);g.nodes.push({parent,action,steps,stateHash,projection,...replay.finish(w),traits:traitSnapshot(w),edges:null});if(parent!==null)round.states++;
 addTasks(["R",id,to]);return {status:"CONDITIONAL_REPLAY",to,stateHash,projection,steps};
}
function plan(v,t,actions,compact=false){
 const n={world:v.world,steps:v.steps},p=engine.policy(v.branch,n),goals=[...new Set([...p.commit,...t.goal])];let w=v.world;const applied=[];
 try{for(const a of actions){
  if(compact&&a.type==="research"&&!w.pendingFree&&replay.active(w,a.id))continue;
  const z=replay.apply(w,a);
  if([...z.researched].some(k=>!w.researched.has(k)&&(p.blocked.has(k)||p.opposing.has(k)))||p.commit.some(k=>replay.active(w,k)&&!replay.active(z,k)))return null;
  w=z;applied.push(a);
 }
 if(w.pendingFree||!goals.every(k=>replay.active(w,k))||researchSetId(w,v.branch)===t.sourceSet)return null;
 const steps=[...v.steps,...applied],allowed=engine.context(v.branch,v.birth.p,[...v.birth.birth,...steps],w).filter(i=>v.allowed.includes(i));return allowed.length?{world:w,steps,allowed,actions:applied}:null;
 }catch{return null;}
}
function storeResearch(id,t,v,q,provenance,retry){const group=researchGoalGroup(t);
  const s=researchSet(q.world,v.branch),sid=key(s),fullActionHash=key([...v.birth.birth,...q.steps]),gid=key([v.input,v.branch,fullActionHash,q.allowed]);
  if(graphs[gid]){receipts[id]={status:"RESEARCH_HISTORY_REUSE",graph:gid,provenance};round.duplicateHistories++;groupSuccess.add(group);if(retry)round.recovered++;return gid;}
  const before=new Set([...rules.values()].filter(r=>r.requires.every(k=>replay.active(v.world,k))).map(r=>r.id));
  const newlySupported=[...rules.values()].filter(r=>!before.has(r.id)&&r.requires.every(k=>replay.active(q.world,k))).map(r=>r.id).sort();
  sets[sid]=s;const g={root:v.root,origin:v.origin,branch:v.branch,input:v.input,source:t.ref,sourceSet:t.sourceSet,researchSet:sid,sourceStateHash:exactWorld(v.world),rootStateHash:exactWorld(q.world),fullActionHash,allowedDifficulties:q.allowed,generation:v.generation+1,goal:t.goal,targets:t.targets,researchActions:q.actions,researchProvenance:provenance,newlySupported,nodes:[],cursor:0};
  graphs[gid]=g;insert(gid,g,q.world,null,null,[]);put(["R",gid,0].join("|"),{...v,world:q.world,steps:q.steps,allowed:q.allowed,generation:g.generation});
  try{transitionOf(gid,g,v.world,q.world);}catch(e){priorityRound.transitionErrors++;upperErrors[gid]=String(e.message);}
  receipts[id]={status:"CONDITIONAL_RESEARCH_EXPANDED",graph:gid,provenance};remember(t.branch,t.goal,q.actions);groupSuccess.add(group);if(retry)round.recovered++;round.researchRoots++;batch.addProposal(g,["R",gid]);return gid;
}
function processBatch(x){
 const {id,t,p}=x,previous=receipts[id],retry=retryable(previous);
 try{
  const v=source(t.ref);assert.equal(researchSetId(v.world,v.branch),t.sourceSet);
  const q=plan(v,t,p.actions)||plan(v,t,p.actions,true);
  if(!q){batch.record(x,{ok:false,reason:"JOINT_REPLAY_UNRESOLVED"});return;}
  const compact=q.actions.length<p.actions.length;
  storeResearch(id,t,v,q,{kind:"BATCH_RESEARCH_WITNESS",source:p.source,sourceOrigin:p.origin,sourceSet:p.sourceSet,hash:p.hash,compact},retry);
  if(retry){(retryHistory[id]??=[]).push(previous);}
  const group=researchGoalGroup(t);groupAttempts.set(group,(groupAttempts.get(group)||0)+1);
  batch.record(x,{ok:true,compact});
 }catch(e){batch.record(x,{ok:false,reason:String(e.message)});round.errors.push({id,reason:String(e.message)});}
}
const joint=createJointResearch(data,engine,suffixes,plan);
const jointRound={generated:0,attempted:0,full:0,partial:0,unresolved:0,graphs:0,errors:[]},jointOriginTurns=new Map();
const jointTargets=new Map();
function collectJoint(){
 const refs=new Map();
 for(const t of Object.values(tasks)){
  if(t.goal.length!==1)continue;
  if(!suffixes.has(key([t.branch,t.goal])))continue;
  const k=JSON.stringify(t.ref),xs=refs.get(k)||[];xs.push(t);refs.set(k,xs);
 }
 for(const xs of refs.values()){
  const goals=[...new Set(xs.flatMap(t=>t.goal))].sort();if(goals.length<2)continue;
  const t0=xs[0],id=key([t0.ref,goals]),t={...t0,goal:goals,targets:[...new Set(xs.flatMap(t=>t.targets))].sort(),fresh:xs.reduce((s,t)=>s+t.fresh,0),components:goals.map(k=>[k])};
  if(!jointRequests[id]){jointRequests[id]=t;jointRound.generated++;}
  else assert.deepEqual(jointRequests[id],t);
 }
 // Same state + goal order receives a separate unresolved receipt; no
 // successful subset marks the original joint request fully complete.
 for(const [id,t] of Object.entries(jointRequests)){
  const done=jointReceipts[id]||[];
  if(done.some(r=>r.status==="FULL")||done.length>=2)continue;
  jointTargets.set(id,t);
 }
}
function pickJoint(){
 let best=null;
 for(const [id,t] of jointTargets){
  const prev=jointReceipts[id]||[];
  const score=[jointOriginTurns.get(t.origin)||0,prev.length,-t.goal.length,-t.fresh,id];
  if(!best||score.some((x,i)=>x<best.score[i]&&score.slice(0,i).every((y,j)=>y===best.score[j])))best={id,t,score};
 }
 if(best){jointTargets.delete(best.id);jointOriginTurns.set(best.t.origin,jointRound.attempted+1);}
 return best;
}
function processJoint(id,t,deadline){
 jointRound.attempted++;
 const priorReceipts=jointReceipts[id]??=[];
 try{
  const v=source(t.ref);assert.equal(researchSetId(v.world,v.branch),t.sourceSet);
  const q=joint.assemble(v,t,{variant:priorReceipts.length,deadline});
  if(!q.q){jointRound.unresolved++;priorReceipts.push({status:"UNRESOLVED",remaining:q.remaining,attempted:q.attempted,conflicts:q.conflicts,variant:q.variant});return;}
  const achievedSet=new Set(q.achieved),targets=t.targets.filter(k=>rules.get(k).requires.every(x=>achievedSet.has(x)||replay.active(v.world,x)));
  const sub={...t,goal:q.achieved,targets,components:q.achieved.map(k=>[k])},sid=key([t.ref,q.achieved]);
  if(!tasks[sid]){tasks[sid]=sub;batch.addTarget(sid,sub);round.newTasks++;}
  const before=Object.keys(graphs).length;
  const gid=storeResearch(sid,sub,v,q.q,{kind:"JOINT_RESEARCH_SET",request:id,requested:t.goal,achieved:q.achieved,remaining:q.remaining,components:q.records,conflictHints:q.conflicts,variant:q.variant},false);
  jointRound.graphs+=Object.keys(graphs).length-before;
  jointRound[q.complete?"full":"partial"]++;
  priorReceipts.push({status:q.complete?"FULL":"PARTIAL",graph:gid,task:sid,achieved:q.achieved,remaining:q.remaining,attempted:q.attempted,conflicts:q.conflicts,variant:q.variant});
 }catch(e){jointRound.unresolved++;jointRound.errors.push({id,reason:String(e.message)});priorReceipts.push({status:"UNRESOLVED",reason:String(e.message)});}
}
function processResearch(id,t){
 round.plans++;const group=researchGoalGroup(t),previous=receipts[id],retry=retryable(previous);groupAttempts.set(group,(groupAttempts.get(group)||0)+1);
 if(retry){round.retries++;(retryHistory[id]??=[]).push(previous);}
 try{
  const v=source(t.ref),n={world:v.world,steps:v.steps};assert.equal(researchSetId(v.world,v.branch),t.sourceSet);
  const p=engine.policy(v.branch,n);
  if(t.goal.some(k=>p.blocked.has(k)||p.opposing.has(k))){receipts[id]={status:"CURRENT_BRANCH_POLICY_EXCLUDED"};return;}
  let q=null,provenance={kind:"BASE_PLANNER"};
  for(const a of (suffixes.get(key([t.branch,t.goal]))||[]).slice(0,12)){round.suffixTrials++;q=plan(v,t,a.actions)||plan(v,t,a.actions,true);if(q){round.suffixHits++;if(q.actions.length<a.actions.length)round.compactSuffixHits++;provenance={kind:"SHARED_REPLAY_SUFFIX",hash:a.hash,compact:q.actions.length<a.actions.length};break;}}
  if(!q&&!retry){const rule={id:t.targets[0],requires:t.goal},x=segments?.plan(n,t.branch,v.birth.birth,rule)||engine.plan(n,t.branch,v.birth.birth,rule);if(x.ok)q=plan(v,t,x.n.steps.slice(v.steps.length));if(!q){receipts[id]={status:"LIMITED_PLANNER_UNRESOLVED",reason:x.reason||"JOINT_REPLAY_UNRESOLVED"};return;}}
  if(!q&&retry){const x=alternatives.tryAlternative(v,t,plan,(retryHistory[id]?.length||1)-1);if(x.q){q=x.q;round.alternativeSuccesses++;provenance={kind:"ALTERNATIVE_ACQUISITION_ORDER",profile:x.profile,goalOrder:x.goalOrder,attempts:x.attempts};}else{receipts[id]={status:"LIMITED_PLANNER_UNRESOLVED",reason:x.reason||"ALTERNATIVE_UNRESOLVED",profile:x.profile,deadEnds:x.deadEnds};return;}}
  if(!q){receipts[id]={status:"JOINT_REPLAY_UNRESOLVED"};return;}
  storeResearch(id,t,v,q,provenance,retry);
 }catch(e){receipts[id]={status:"LIMITED_PLANNER_UNRESOLVED",reason:String(e.message)};round.errors.push({id,reason:String(e.message)});}
}
function expand(id,g){
 const i=g.cursor,n=g.nodes[i],v=source(["R",id,i]),w=v.world,s=member(w).state,edges=[];
 function offer(action,x){if(!x){edges.push({action,status:"UNRESOLVED_LOCAL_GATE"});return;}if(researchSetId(x.world,g.branch)!==g.researchSet){edges.push({action,status:"RESEARCH_CHANGE_OUTSIDE_SCOPE"});return;}const edge=insert(id,g,x.world,i,action,x.steps);edges.push({action,...edge});if(edge.status==="CONDITIONAL_REPLAY")put(["R",id,edge.to].join("|"),{...v,world:x.world,steps:[...v.steps,...x.steps]});}
 try{const x=replay.grow({world:w,steps:[]});if(x.steps.length)offer("CAP_GROWTH",x);else edges.push({action:"CAP_GROWTH",status:"AT_CAP"});}catch(e){edges.push({action:"CAP_GROWTH",status:"UNRESOLVED_LOCAL_GATE",reason:String(e.message)});}
 const supported=new Set((engine.byBody.get(s.soldierType)||[]).map(r=>r.id));
 for(const r of allBody.get(s.soldierType)||[]){const action=r.id;
  if(r.forbiddenSoldierTypes?.includes(s.soldierType)){edges.push({action,status:"BODY_GATE"});continue;}
  if(!r.requires.every(k=>replay.active(w,k))){edges.push({action,status:"INACTIVE_RESEARCH"});continue;}
  if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){edges.push({action,status:"HISTORY_GATE"});continue;}
  if(!supported.has(action)){edges.push({action,status:"UNSUPPORTED_FAMILY"});continue;}
  try{offer(action,replay.transform({world:w,steps:[]},r));}catch(e){edges.push({action,status:"UNRESOLVED_LOCAL_GATE",reason:String(e.message)});}
 }
 n.edges=edges;g.cursor++;round.expanded++;
}
const seconds=Number(arg("seconds","25")),planLimit=Number(arg("plans","100")),nodeLimit=Number(arg("nodes","300")),batchLimit=Number(arg("batch","160")),jointLimit=Number(arg("joint","30")),start=performance.now();
assert(seconds>0&&Number.isSafeInteger(planLimit)&&planLimit>=0&&Number.isSafeInteger(nodeLimit)&&nodeLimit>=0&&Number.isSafeInteger(batchLimit)&&batchLimit>=0&&Number.isSafeInteger(jointLimit)&&jointLimit>=0);
const schedule=prior.schedule||{clock:0,turns:{}};
const roundSchedule={batches:0,closedQueues:0,smallFirst:0,fair:0};
function pickGraph(){
 const candidates=Object.entries(graphs).filter(([,g])=>g.cursor<g.nodes.length&&!g.blocker);if(!candidates.length)return null;
 const mode=roundSchedule.batches%3,oldest=([id])=>schedule.turns[id]||0;
 const scores=new Map();
 if(mode===0)for(const [id,g] of candidates)scores.set(id,priority.graphScore(g,upperBounds[upperRefs[id]?.bound],upperTransitions[id]));
 candidates.sort((a,b)=>(mode===0?scores.get(b[0]).score-scores.get(a[0]).score:mode===1?(a[1].nodes.length-a[1].cursor)-(b[1].nodes.length-b[1].cursor):0)||oldest(a)-oldest(b)||a[0].localeCompare(b[0]));
 const x=candidates[0];schedule.turns[x[0]]=++schedule.clock;roundSchedule.batches++;
 if(mode===0)priorityRound.gapPriorityBatches++;else roundSchedule[mode===1?"smallFirst":"fair"]++;
 return x;
}
const quantum=Number(arg("quantum","12"));assert(Number.isSafeInteger(quantum)&&quantum>0);
collectJoint();
while(performance.now()-start<seconds*1000){
 let work=false;
 if(jointRound.attempted<jointLimit&&performance.now()-start<seconds*1000){const x=pickJoint();if(x){processJoint(x.id,x.t,start+seconds*1000);work=true;}}
 if(batch.metrics.attempts<batchLimit){for(let j=0;j<3&&batch.metrics.attempts<batchLimit&&performance.now()-start<seconds*1000;j++){const x=batch.choose();if(!x)break;processBatch(x);work=true;}}
 if(round.plans<planLimit&&performance.now()-start<seconds*1000){const t=nextTask();if(t){processResearch(...t);work=true;}}
 if(round.expanded<nodeLimit&&performance.now()-start<seconds*1000){const picked=pickGraph();if(picked){const [id,g]=picked;for(let i=0;i<quantum&&g.cursor<g.nodes.length&&!g.blocker&&round.expanded<nodeLimit&&performance.now()-start<seconds*1000;i++){try{expand(id,g);}catch(e){g.blocker=String(e.message);round.errors.push({id,reason:g.blocker});}work=true;}if(g.cursor===g.nodes.length&&!g.blocker)roundSchedule.closedQueues++;}}
 if(!work)break;
}
// Separate depth-independent abstract proof layer. Never drop any concrete node
// or use a finite bound to block research exploration.
const upperStart=performance.now(),upperSeconds=Number(arg("bound-seconds","15")),upperLimit=Number(arg("bounds","165"));
assert(Number.isFinite(upperSeconds)&&upperSeconds>=0&&Number.isSafeInteger(upperLimit)&&upperLimit>=0);
let upperProcessed=0;
for(const [id,g] of Object.entries(graphs)){
 if(upperRefs[id])assert.equal(upperRefs[id].rootStateHash,g.rootStateHash);
 if(upperTransitions[id])continue;
 if(upperProcessed>=upperLimit||performance.now()-upperStart>=upperSeconds*1000)break;
 upperProcessed++;
 try{
  const v=source(["R",id,0]);assert.equal(exactWorld(v.world),g.rootStateHash);assert.equal(researchSetId(v.world,g.branch),g.researchSet);
  const prev=source(g.source);transitionOf(id,g,prev.world,v.world);
 }catch(e){upperErrors[id]=String(e.message);}
}
const counts={},statusCounts={},details=[];let states=0,processed=0,aliases=0,changed=0,traitGains=0;
const convergence={selfLoops:0,repeatKinds:{},roots:0,examples:[]},boundSummary={policy:UPPER_POLICY,roots:0,allStatsFinite:0,finiteAxes:0,unresolvedAxes:0,attainedAxes:0,allAxesAttained:0,inconsistentRoots:0,errors:Object.keys(upperErrors).length,round:upperProcessed,metrics:upperEngine.metrics};
const baseline=new Map(),novelVectors=new Set();const pair=(o,b,c)=>key([o,b,c]);
for(const r of Object.values(ledger.routes)){if(!Array.isArray(r.permanentVector))continue;const k=pair(r.origin,r.branch,r.body),a=baseline.get(k)||[];if(!a.some(v=>dominates(v,r.permanentVector)))baseline.set(k,[...a.filter(v=>!dominates(r.permanentVector,v)),r.permanentVector]);}
for(const r of Object.values(receipts))counts[r.status]=(counts[r.status]||0)+1;
for(const [id,g] of Object.entries(graphs)){
 const base=g.nodes[0],frontier=new Map();let unresolved=0,unsupported=0,localAliases=0,maxTraits=base.traits.length,improved=0,strict=0,novel=0,best=null;
 for(const [i,n] of g.nodes.entries()){
  maxTraits=Math.max(maxTraits,n.traits.length);if(i&&(n.body!==base.body||n.permanentVector.some((v,j)=>v>base.permanentVector[j])||n.traits.some(t=>!base.traits.includes(t))))improved++;
  const p=pair(g.origin,g.branch,n.body),bv=baseline.get(p);if(bv&&!bv.some(v=>dominates(v,n.permanentVector))){novel++;novelVectors.add(key([p,n.permanentVector]));}
  if(i&&n.body===base.body&&dominates(n.permanentVector,base.permanentVector)&&n.permanentVector.some((v,j)=>v>base.permanentVector[j])){strict++;const delta=n.permanentVector.map((v,j)=>v-base.permanentVector[j]),gain=delta.reduce((a,b)=>a+b,0);if(!best||gain>best.gain)best={node:i,body:n.body,delta,gain,vector:n.permanentVector,base:base.permanentVector};}
  for(const e of n.edges||[]){statusCounts[e.status]=(statusCounts[e.status]||0)+1;if(e.status==="UNSUPPORTED_FAMILY")unsupported++;if(e.status==="UNRESOLVED_LOCAL_GATE"||e.status==="RESEARCH_CHANGE_OUTSIDE_SCOPE")unresolved++;if(e.status==="FIXED_SET_ALIAS")localAliases++;}
  const xs=frontier.get(n.body)||[];if(!xs.some(j=>dominates(g.nodes[j].permanentVector,n.permanentVector)))frontier.set(n.body,[...xs.filter(j=>!dominates(n.permanentVector,g.nodes[j].permanentVector)),i]);
 }
 // A concrete replayed alias to the same node witnesses model convergence
 // of that one action at that state, not closure of a research schedule.
 let selfLoops=0;const loopRules=new Set();
 for(const [i,n] of g.nodes.entries())for(const e of n.edges||[])if(e.status==="FIXED_SET_ALIAS"&&e.to===i&&e.action!=="CAP_GROWTH"){
  selfLoops++;loopRules.add(e.action);convergence.repeatKinds[e.action]=(convergence.repeatKinds[e.action]||0)+1;
  if(convergence.examples.length<40)convergence.examples.push({graph:id,node:i,action:e.action,body:n.body,raw:n.raw,permanentVector:n.permanentVector});
 }
 convergence.selfLoops+=selfLoops;convergence.roots+=Number(selfLoops>0);
 let upper=null;const ref=upperRefs[id],b=ref&&upperBounds[ref.bound],transition=upperTransitions[id]||null;
 if(b){
  assert.equal(ref.rootStateHash,g.rootStateHash);assert.equal(ref.researchSet,g.researchSet);
  const finite=b.stats.filter(x=>x.status==="INDUCTIVE_UPPER").length;
  let bad=false;
  for(const n of g.nodes){const raw=b.rawUpper[n.body],eff=b.effectiveUpper[n.body];if(!raw||!eff||n.raw.some((v,j)=>raw[j]!==null&&v>raw[j])||n.permanentCapVector.some((v,j)=>eff[j]!==null&&v>eff[j]))bad=true;}
  if(bad){boundSummary.inconsistentRoots++;upper={status:"UNRESOLVED_BOUND_MISMATCH",finite:0,attained:0};}
  else{
   const axes=b.stats.map((x,j)=>{if(x.status!=="INDUCTIVE_UPPER")return null;const ceiling=Math.max(...b.reachableBodies.map(k=>b.effectiveUpper[k][j]));return g.nodes.some(n=>n.permanentVector[j]===ceiling)?ceiling:null;});
   const attained=axes.filter(x=>x!==null).length;boundSummary.roots++;boundSummary.finiteAxes+=finite;boundSummary.unresolvedAxes+=12-finite;boundSummary.allStatsFinite+=Number(finite===12);boundSummary.attainedAxes+=attained;boundSummary.allAxesAttained+=Number(attained===12);
   upper={status:finite===12?"FINITE_RELAXED_UPPER":"PARTIAL_RELAXED_UPPER",finite,attained,raw:b.rawUpper[b.rootBody],effective:b.effectiveUpper[b.rootBody],attainedAcrossBodies:axes,body:b.rootBody,reachableBodies:b.reachableBodies.length};
  }
 }
 g.frontier=Object.fromEntries(frontier);g.scopeComplete=g.cursor===g.nodes.length&&!g.blocker&&!unresolved&&!unsupported;
 states+=g.nodes.length;processed+=g.cursor;aliases+=localAliases;changed+=Number(improved>0);traitGains+=Number(maxTraits>base.traits.length);
 details.push({id,root:g.root,origin:g.origin,branch:g.branch,generation:g.generation,sourceSet:g.sourceSet,researchSet:g.researchSet,rootStateHash:ledger.routes[g.root].canonicalStateHash,rootActionHash:ledger.routes[g.root].fullActionHash,states:g.nodes.length,processed:g.cursor,scopeComplete:g.scopeComplete,unresolved,unsupported,aliases:localAliases,improved,maxTraits,newlySupported:g.newlySupported,strictRootImprovements:strict,novelComparedToLedger:novel,bestImprovement:best,repeatSelfLoops:selfLoops,repeatRules:[...loopRules],upper,transition});
}
const sourceCounts={E:0,R:0},allGroups=new Set();for(const t of Object.values(tasks)){sourceCounts[t.ref[0]]++;allGroups.add(researchGoalGroup(t));}
const retryCount=Object.values(retryHistory).reduce((n,x)=>n+x.length,0),recoveredCount=Object.keys(retryHistory).filter(id=>receipts[id]?.graph).length;
const batchTotals=Object.values(batch.tried).flatMap(x=>Object.values(x));const compared=details.filter(x=>x.transition),raised=compared.filter(x=>x.transition.raisedAxes>0),nondecreasing=raised.filter(x=>x.transition.loweredAxes===0&&x.transition.unknownAxes===0);
const transitionSummary={policy:PRIORITY_POLICY,compared:compared.length,raised:raised.length,nondecreasing:nondecreasing.length,raisedResearchSets:new Set(raised.map(x=>x.researchSet)).size,raisedPairs:new Set(raised.map(x=>key([x.origin,x.branch]))).size,newBodyTransitions:compared.filter(x=>x.transition.newBodies.length>0).length,round:priorityRound,metrics:priority.metrics};
collectJoint();
const jointHistory=Object.values(jointReceipts).flat(),jointFull=new Set(Object.entries(jointReceipts).filter(([,rs])=>rs.some(r=>r.status==="FULL")).map(([id])=>id)),jointGraphs=new Set(jointHistory.filter(r=>r.graph).map(r=>r.graph));
const jointSummary={policy:JOINT_POLICY,requests:Object.keys(jointRequests).length,attemptedRequests:Object.keys(jointReceipts).length,fullyReplayed:jointFull.size,partialOnly:Object.entries(jointReceipts).filter(([id,rs])=>!jointFull.has(id)&&rs.some(r=>r.status==="PARTIAL")).length,unresolvedRequests:Object.keys(jointReceipts).length-jointFull.size,graphs:jointGraphs.size,sets:new Set([...jointGraphs].map(id=>graphs[id].researchSet)).size,pairs:new Set([...jointGraphs].map(id=>key([graphs[id].origin,graphs[id].branch]))).size,maxSimultaneousGoals:Math.max(0,...jointHistory.map(r=>r.achieved?.length||0)),round:jointRound,metrics:joint.metrics};
const summary={jointSummary,transitionSummary,boundSummary,convergence,prefixMetrics,roundSchedule,batchRound:batch.metrics,batchAttempts:batchTotals.length,batchSuccesses:batchTotals.filter(x=>x.status==="REPLAYED").length,batchCrossOriginSuccesses:batchTotals.filter(x=>x.status==="REPLAYED"&&x.crossOrigin).length,batchExactSetSuccesses:batchTotals.filter(x=>x.status==="REPLAYED"&&x.exactSet).length,strictImprovementRoots:details.filter(x=>x.strictRootImprovements>0).length,novelLedgerVectors:novelVectors.size,novelLedgerRoots:details.filter(x=>x.novelComparedToLedger>0).length,researchGoalGroups:allGroups.size,attemptedGroups:groupAttempts.size,successfulGroups:groupSuccess.size,retryCount,recoveredCount,alternativePlanner:alternatives.metrics,groupGateCacheSize:gateCache.size,importedRoots:Object.keys(ec.graphs).length,importedStates:Object.values(ec.graphs).reduce((s,g)=>s+g.nodes.length,0),taskSources:sourceCounts,goalTasks:Object.keys(tasks).length,attempted:Object.keys(receipts).length,pending:Object.keys(tasks).length-Object.keys(receipts).length,counts,graphs:details.length,researchSets:new Set(details.map(x=>x.researchSet)).size,origins:new Set(details.map(x=>x.origin)).size,branches:new Set(details.map(x=>x.branch)).size,maxGeneration:Math.max(1,...details.map(x=>x.generation)),states,processed,pendingStates:states-processed,scopeComplete:details.filter(x=>x.scopeComplete).length,aliases,changedRoots:changed,traitGainRoots:traitGains,statusCounts,actualGameCertified:0,round};
const result={schema:MODEL,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceExpansionFingerprint:exp.fingerprint,sourceExpandedClosureFingerprint:ec.fingerprint,scope:"Research plans and treatment paths are conditional. Representative expansion and bounded research planner are not exhaustive. Fixed-set quotient aliases are unresolved research timing obligations; no global certification.",quotientProof:quotient.proof,summary,sets,tasks,receipts,graphs,retryHistory,batchTried:batch.tried,migration,schedule,upperBounds,upperRefs,upperErrors,upperTransitions,jointRequests,jointReceipts,templates:engine.templates};
const bytes=gzipSync(JSON.stringify(result));fs.writeFileSync(out+".tmp",bytes);fs.renameSync(out+".tmp",out);
fs.writeFileSync("public/branch-soldier-alternating-v7-summary.js","export const alternatingSummary="+JSON.stringify({...summary,sourceMetadataSha256:db.sourceMetadataSha256,sourceExpansionFingerprint:exp.fingerprint,sourceExpandedClosureFingerprint:ec.fingerprint,file:"soldier-final-career-alternating-v7.json.gz",sha256:sha(bytes),details})+";\n");
console.log(JSON.stringify({...summary,bytes:bytes.length}));
