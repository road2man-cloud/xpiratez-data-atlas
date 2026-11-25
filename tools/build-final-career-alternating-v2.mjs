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
const MODEL="ALTERNATING_RESEARCH_CAREER_REPLAY_V2";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),ledger=db.populationFrontierChronology,data=read("public/data/soldiers-modern-index.json");
const fixed=decode("public/data/soldier-final-career-active-closure-v3.json.gz"),exp=decode("public/data/soldier-final-career-research-expansion.json.gz"),ec=decode("public/data/soldier-final-career-expanded-closure.json.gz");
assert.equal(exp.sourceClosureFingerprint,fixed.fingerprint);assert.equal(ec.sourceExpansionFingerprint,exp.fingerprint);
for(const x of [fixed,exp,ec])assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const files=["tools/build-final-career-alternating-v2.mjs","tools/final-career-research-alternatives.mjs","tools/final-career-repeat-quotient.mjs","tools/final-career-conditional-resource-quotient.mjs","tools/population-frontier-chronology-core.mjs","tools/population-research-career-core.mjs","tools/population-growth-replay-core.mjs","tools/population-chronological-career-core.mjs","tools/final-career-active-research-sets.mjs","tools/final-career-research-reuse.mjs","tools/final-career-research-segments.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/foundation-research-planner.js","public/soldiers/modern/research-training-locks.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/origin-campaign-context.js"];
const fingerprint=key([MODEL,db.sourceMetadataSha256,fixed.fingerprint,exp.fingerprint,ec.fingerprint,files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]);
const out="public/data/soldier-final-career-alternating-v2.json.gz",oldFile="public/data/soldier-final-career-alternating.json.gz";
const prior=fs.existsSync(out)?decode(out):decode(oldFile);
if(prior.schema===MODEL)assert.equal(prior.fingerprint,fingerprint,"Explicit migration required on model change");else{assert.equal(prior.schema,"ALTERNATING_RESEARCH_CAREER_REPLAY_V1");assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(prior.sourceExpansionFingerprint,exp.fingerprint);assert.equal(prior.sourceExpandedClosureFingerprint,ec.fingerprint);}
const migration=prior.migration||{from:prior.fingerprint,graphs:Object.keys(prior.graphs).length,tasks:Object.keys(prior.tasks).length,receipts:Object.keys(prior.receipts).length};
const retryHistory=prior.retryHistory||{};
const graphs=prior?.graphs||{},tasks=prior?.tasks||{},receipts=prior?.receipts||{},sets=prior?.sets||{};
const births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const {engine,replay,loadBirth}=createBridge(data,db,ledger.cacheHashes||ledger.hashes,{cache:true,templates:prior?.templates||exp.templates||{}});
let segments;try{segments=createResearchSegments(decode("public/data/soldier-final-career-research-index.json.gz"),db,engine);}catch{}
const alternatives=createResearchAlternatives(data,engine);
const quotient=createConditionalResourceQuotient(data),rules=new Map(data.transformations.map(r=>[r.id,r])),allBody=new Map();
for(const r of rules.values())for(const b of r.allowedSoldierTypes||[]){const a=allBody.get(b)||[];a.push(r);allBody.set(b,a);}
const round={newTasks:0,plans:0,researchRoots:0,expanded:0,states:0,aliases:0,duplicateHistories:0,suffixHits:0,suffixTrials:0,compactSuffixHits:0,groupGateHits:0,groupGateBuilds:0,retries:0,recovered:0,alternativeSuccesses:0,errors:[]};
const cache=new Map(),seen=new Map(),suffixes=new Map();
function put(k,v){if(cache.size>=120)cache.delete(cache.keys().next().value);cache.set(k,v);return v;}
function remember(branch,goal,actions){const k=key([branch,goal]),a=suffixes.get(k)||[],h=key(actions);if(!a.some(x=>x.hash===h))a.push({hash:h,actions});suffixes.set(k,a);}
for(const e of Object.values(exp.expansions))remember(e.branch,e.goal,e.researchActions);
for(const g of Object.values(graphs))remember(g.branch,g.goal,g.researchActions);
function follow(g,node,v){const path=[];for(let p=node;p!==0;p=g.nodes[p].parent){assert(g.nodes[p]&&Number.isInteger(g.nodes[p].parent));path.push(p);}
 let w=v.world,steps=v.steps;for(const i of path.reverse()){const n=g.nodes[i];w=replay.replay(n.steps,w);assert.equal(exactWorld(w),n.stateHash);steps=[...steps,...n.steps];}return {...v,world:w,steps};}
function fixedSource(root,node){
 const id="fixed|"+root+"|"+node;if(cache.has(id))return cache.get(id);
 const g=fixed.graphs[root],r=ledger.routes[root];assert(g&&r&&!r.rankDefault&&r.fullActionHash===g.rootActionHash&&r.canonicalStateHash===g.rootStateHash);
 const b=loadBirth(births.get(r.input)),w=replay.replay(r.actions,b.n.world);assert.equal(exactWorld(w),g.rootStateHash);
 return put(id,follow(g,node,{world:w,steps:r.actions,birth:b,root,origin:g.origin,branch:g.branch,allowed:g.allowedDifficulties,input:r.input,generation:0}));
}
function source(ref){
 const [kind,id,node]=ref,k=ref.join("|");if(cache.has(k))return cache.get(k);
 if(kind==="E"){
  const e=exp.expansions[id],g=ec.graphs[id];assert(e&&g&&e.resultStateHash===g.rootStateHash&&e.fullActionHash===g.rootActionHash);
  const v=fixedSource(e.root,e.node);assert.equal(exactWorld(v.world),e.sourceStateHash);
  const w=replay.replay(e.researchActions,v.world),steps=[...v.steps,...e.researchActions];
  assert.equal(exactWorld(w),e.resultStateHash);assert.equal(key([...v.birth.birth,...steps]),e.fullActionHash);assert.equal(researchSetId(w,v.branch),e.resultSet);
  const x=follow(g,node,{...v,world:w,steps,allowed:e.allowedDifficulties,generation:1});assert.equal(exactWorld(x.world),g.nodes[node].stateHash);return put(k,x);
 }
 assert.equal(kind,"R");const g=graphs[id];assert(g);
 const v=source(g.source),w=replay.replay(g.researchActions,v.world),steps=[...v.steps,...g.researchActions];assert.equal(exactWorld(w),g.rootStateHash);assert.equal(key([...v.birth.birth,...steps]),g.fullActionHash);assert.equal(researchSetId(w,v.branch),g.researchSet);
 const x=follow(g,node,{...v,world:w,steps,allowed:g.allowedDifficulties,generation:g.generation});assert.equal(exactWorld(x.world),g.nodes[node].stateHash);return put(k,x);
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
  if(tasks[id]){assert.deepEqual(tasks[id],t);continue;}tasks[id]=t;round.newTasks++;if(!receipts[id])enqueue(id,t);
 }
}
for(const [id,t] of Object.entries(tasks)){if(!receipts[id])enqueue(id,t);else if(retryable(receipts[id])&&(retryHistory[id]?.length||0)<3)enqueue(id,t,true);}
for(const [id,g] of Object.entries(ec.graphs))for(let i=0;i<g.nodes.length;i++)addTasks(["E",id,i]);
for(const [id,g] of Object.entries(graphs))for(let i=0;i<g.nodes.length;i++)addTasks(["R",id,i]);
function compare(a,b){
 const ka=researchGoalGroup(a[1]),kb=researchGoalGroup(b[1]);
 // Prioritize proven reusable proposals, then under-sampled research groups.
 return Number(groupSuccess.has(kb))-Number(groupSuccess.has(ka))||Math.min(20,groupAttempts.get(ka)||0)-Math.min(20,groupAttempts.get(kb)||0)||b[1].fresh-a[1].fresh||a[1].goal.length-b[1].goal.length||a[1].generation-b[1].generation||a[0].localeCompare(b[0]);
}
function pick(q){let origin=null;for(const [o,a] of q)if(a.length&&(origin===null||(turns.get(o)||0)<(turns.get(origin)||0)))origin=o;if(origin===null)return null;
 turns.set(origin,++serial);const a=q.get(origin);let best=0;for(let i=1;i<a.length;i++)if(compare(a[i],a[best])<0)best=i;
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
  const s=researchSet(q.world,v.branch),sid=key(s),fullActionHash=key([...v.birth.birth,...q.steps]),gid=key([v.input,v.branch,fullActionHash,q.allowed]);
  if(graphs[gid]){receipts[id]={status:"RESEARCH_HISTORY_REUSE",graph:gid,provenance};round.duplicateHistories++;groupSuccess.add(group);if(retry)round.recovered++;return;}
  const before=new Set([...rules.values()].filter(r=>r.requires.every(k=>replay.active(v.world,k))).map(r=>r.id));
  const newlySupported=[...rules.values()].filter(r=>!before.has(r.id)&&r.requires.every(k=>replay.active(q.world,k))).map(r=>r.id).sort();
  sets[sid]=s;const g={root:v.root,origin:v.origin,branch:v.branch,input:v.input,source:t.ref,sourceSet:t.sourceSet,researchSet:sid,sourceStateHash:exactWorld(v.world),rootStateHash:exactWorld(q.world),fullActionHash,allowedDifficulties:q.allowed,generation:v.generation+1,goal:t.goal,targets:t.targets,researchActions:q.actions,researchProvenance:provenance,newlySupported,nodes:[],cursor:0};
  graphs[gid]=g;insert(gid,g,q.world,null,null,[]);put(["R",gid,0].join("|"),{...v,world:q.world,steps:q.steps,allowed:q.allowed,generation:g.generation});
  receipts[id]={status:"CONDITIONAL_RESEARCH_EXPANDED",graph:gid,provenance};remember(t.branch,t.goal,q.actions);groupSuccess.add(group);if(retry)round.recovered++;round.researchRoots++;
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
const seconds=Number(arg("seconds","25")),planLimit=Number(arg("plans","100")),nodeLimit=Number(arg("nodes","300")),start=performance.now();
assert(seconds>0&&Number.isSafeInteger(planLimit)&&planLimit>=0&&Number.isSafeInteger(nodeLimit)&&nodeLimit>=0);
let rotate=0;
while(performance.now()-start<seconds*1000){
 let work=false;
 if(round.plans<planLimit){const t=nextTask();if(t){processResearch(...t);work=true;}}
 for(let i=0;i<3&&round.expanded<nodeLimit&&performance.now()-start<seconds*1000;i++){
  const a=Object.entries(graphs).filter(([,g])=>g.cursor<g.nodes.length&&!g.blocker);if(!a.length)break;
  const [id,g]=a[rotate++%a.length];try{expand(id,g);}catch(e){g.blocker=String(e.message);round.errors.push({id,reason:g.blocker});}work=true;
 }
 if(!work)break;
}
const counts={},statusCounts={},details=[];let states=0,processed=0,aliases=0,changed=0,traitGains=0;
for(const r of Object.values(receipts))counts[r.status]=(counts[r.status]||0)+1;
for(const [id,g] of Object.entries(graphs)){
 const base=g.nodes[0],frontier=new Map();let unresolved=0,unsupported=0,localAliases=0,maxTraits=base.traits.length,improved=0;
 for(const [i,n] of g.nodes.entries()){
  maxTraits=Math.max(maxTraits,n.traits.length);if(i&&(n.body!==base.body||n.permanentVector.some((v,j)=>v>base.permanentVector[j])||n.traits.some(t=>!base.traits.includes(t))))improved++;
  for(const e of n.edges||[]){statusCounts[e.status]=(statusCounts[e.status]||0)+1;if(e.status==="UNSUPPORTED_FAMILY")unsupported++;if(e.status==="UNRESOLVED_LOCAL_GATE"||e.status==="RESEARCH_CHANGE_OUTSIDE_SCOPE")unresolved++;if(e.status==="FIXED_SET_ALIAS")localAliases++;}
  const xs=frontier.get(n.body)||[];if(!xs.some(j=>dominates(g.nodes[j].permanentVector,n.permanentVector)))frontier.set(n.body,[...xs.filter(j=>!dominates(n.permanentVector,g.nodes[j].permanentVector)),i]);
 }
 g.frontier=Object.fromEntries(frontier);g.scopeComplete=g.cursor===g.nodes.length&&!g.blocker&&!unresolved&&!unsupported;
 states+=g.nodes.length;processed+=g.cursor;aliases+=localAliases;changed+=Number(improved>0);traitGains+=Number(maxTraits>base.traits.length);
 details.push({id,root:g.root,origin:g.origin,branch:g.branch,generation:g.generation,sourceSet:g.sourceSet,researchSet:g.researchSet,rootStateHash:ledger.routes[g.root].canonicalStateHash,rootActionHash:ledger.routes[g.root].fullActionHash,states:g.nodes.length,processed:g.cursor,scopeComplete:g.scopeComplete,unresolved,unsupported,aliases,improved,maxTraits,newlySupported:g.newlySupported});
}
const sourceCounts={E:0,R:0},allGroups=new Set();for(const t of Object.values(tasks)){sourceCounts[t.ref[0]]++;allGroups.add(researchGoalGroup(t));}
const retryCount=Object.values(retryHistory).reduce((n,x)=>n+x.length,0),recoveredCount=Object.keys(retryHistory).filter(id=>receipts[id]?.graph).length;
const summary={researchGoalGroups:allGroups.size,attemptedGroups:groupAttempts.size,successfulGroups:groupSuccess.size,retryCount,recoveredCount,alternativePlanner:alternatives.metrics,groupGateCacheSize:gateCache.size,importedRoots:Object.keys(ec.graphs).length,importedStates:Object.values(ec.graphs).reduce((s,g)=>s+g.nodes.length,0),taskSources:sourceCounts,goalTasks:Object.keys(tasks).length,attempted:Object.keys(receipts).length,pending:Object.keys(tasks).length-Object.keys(receipts).length,counts,graphs:details.length,researchSets:new Set(details.map(x=>x.researchSet)).size,origins:new Set(details.map(x=>x.origin)).size,branches:new Set(details.map(x=>x.branch)).size,maxGeneration:Math.max(1,...details.map(x=>x.generation)),states,processed,pendingStates:states-processed,scopeComplete:details.filter(x=>x.scopeComplete).length,aliases,changedRoots:changed,traitGainRoots:traitGains,statusCounts,actualGameCertified:0,round};
const result={schema:MODEL,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceExpansionFingerprint:exp.fingerprint,sourceExpandedClosureFingerprint:ec.fingerprint,scope:"Research plans and treatment paths are conditional. Representative expansion and bounded research planner are not exhaustive. Fixed-set quotient aliases are unresolved research timing obligations; no global certification.",quotientProof:quotient.proof,summary,sets,tasks,receipts,graphs,retryHistory,migration,templates:engine.templates};
const bytes=gzipSync(JSON.stringify(result));fs.writeFileSync(out+".tmp",bytes);fs.renameSync(out+".tmp",out);
fs.writeFileSync("public/branch-soldier-alternating-v2-summary.js","export const alternatingSummary="+JSON.stringify({...summary,sourceMetadataSha256:db.sourceMetadataSha256,sourceExpansionFingerprint:exp.fingerprint,sourceExpandedClosureFingerprint:ec.fingerprint,file:"soldier-final-career-alternating-v2.json.gz",sha256:sha(bytes),details})+";\n");
console.log(JSON.stringify({...summary,bytes:bytes.length}));
