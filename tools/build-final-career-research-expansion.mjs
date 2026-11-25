// Expand actual ordered research histories from fixed-research closure
// representatives. No end-of-campaign research grants. This is a resumable
// conditional search over representative snapshots, NOT a global closure.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {createBridge,birthCatalog} from "./population-frontier-chronology-core.mjs";
import {key,sha} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {researchSet,researchSetId} from "./final-career-active-research-sets.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {createResearchSegments} from "./final-career-research-segments.mjs";
const MODEL="RESEARCH_SET_CONDITIONAL_EXPANSION_V1";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),ledger=db.populationFrontierChronology,data=read("public/data/soldiers-modern-index.json");
const fixed=decode("public/data/soldier-final-career-active-closure-v3.json.gz");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);assert.equal(fixed.sourceMetadataSha256,db.sourceMetadataSha256);
const files=["tools/build-final-career-research-expansion.mjs","tools/population-frontier-chronology-core.mjs","tools/population-research-career-core.mjs","tools/population-chronological-career-core.mjs","tools/population-growth-replay-core.mjs","tools/final-career-research-segments.mjs","tools/final-career-research-reuse.mjs","tools/final-career-active-research-sets.mjs","public/soldiers/modern/foundation-research-planner.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/eligibility.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/origin-campaign-context.js"];
const fingerprint=key([MODEL,fixed.fingerprint,db.sourceMetadataSha256,files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]);
const out="public/data/soldier-final-career-research-expansion.json.gz";
const prior=fs.existsSync(out)?decode(out):null;if(prior)assert.equal(prior.fingerprint,fingerprint);
const tasks=prior?.tasks||{},expansions=prior?.expansions||{},sets=prior?.sets||{},receipts=prior?.receipts||{};
const births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const {engine,replay,loadBirth}=createBridge(data,db,ledger.cacheHashes||ledger.hashes,{cache:true,templates:prior?.templates||{}});
let reuse=null;try{reuse=createResearchSegments(decode("public/data/soldier-final-career-research-index.json.gz"),db,engine);}catch(e){console.log("Optional shared segments unavailable: "+String(e.message));}
const rules=new Map(data.transformations.map(r=>[r.id,r]));
const round={attempted:0,expanded:0,replayedTransforms:0,aliases:0,sharedSuffixHits:0,errors:0};
const roots=new Map(),snapshots=new Map(),suffixes=new Map();
for(const e of Object.values(expansions)){const k=key([e.sourceSet,e.goal]);const a=suffixes.get(k)||[];if(!a.some(s=>key(s)===key(e.researchActions)))a.push(e.researchActions);suffixes.set(k,a);}
function source(root,node){
 const id=root+"|"+node;if(snapshots.has(id))return snapshots.get(id);
 const g=fixed.graphs[root],r=ledger.routes[root];assert(g&&r&&!r.rankDefault&&r.fullActionHash===g.rootActionHash&&r.canonicalStateHash===g.rootStateHash);
 let b=roots.get(root);if(!b){const birth=loadBirth(births.get(r.input)),w=replay.replay(r.actions,birth.n.world);assert.equal(exactWorld(w),g.rootStateHash);b={birth,world:w};roots.set(root,b);}
 const chain=[];for(let p=node;p!==0;p=g.nodes[p].parent)chain.push(p);
 let w=b.world,steps=r.actions.slice();for(const p of chain.reverse()){const z=g.nodes[p];w=replay.replay(z.steps,w);assert.equal(exactWorld(w),z.stateHash);steps.push(...z.steps);}
 assert.equal(researchSetId(w,g.branch),g.researchSet);
 const v={g,r,birth:b.birth,n:{world:w,steps}};if(snapshots.size>=48)snapshots.delete(snapshots.keys().next().value);snapshots.set(id,v);return v;
}
const seedTasks={};let rawInactive=0,unsupported=0,alreadyHistorical=0;
for(const [root,g] of Object.entries(fixed.graphs))if(g.scopeComplete){
 const r=ledger.routes[root];assert(r?.fullActionHash===g.rootActionHash);
 const active=new Set(ledger.activeResearchIndex.sets[g.researchSet].active);
 for(const [node,n] of g.nodes.entries())for(const e of n.edges||[])if(e.status==="INACTIVE_RESEARCH"){
  rawInactive++;const rule=rules.get(e.action);assert(rule);
  // Unsupported transformations are retained as an explicit unmodeled family.
  if(!(engine.byBody.get(n.body)||[]).some(x=>x.id===rule.id)){unsupported++;continue;}
  const missing=rule.requires.filter(k=>!active.has(k)).sort();if(!missing.length){alreadyHistorical++;continue;}
  const id=key([root,node,missing]);const t=seedTasks[id]??={root,node,sourceSet:g.researchSet,branch:g.branch,origin:g.origin,goal:missing,targets:[]};
  if(!t.targets.includes(rule.id))t.targets.push(rule.id);
 }
}
for(const [id,t] of Object.entries(seedTasks)){if(tasks[id])assert.deepEqual(tasks[id],t);else tasks[id]=t;}
function replayPlan(v,actions,rule){
 const {n,g,birth}=v,p=engine.policy(g.branch,n),goals=[...new Set([...p.commit,...rule.requires])];let w=n.world;
 try{for(const a of actions){const z=replay.apply(w,a);if([...z.researched].some(k=>!w.researched.has(k)&&(p.blocked.has(k)||p.opposing.has(k)))||p.commit.some(k=>replay.active(w,k)&&!replay.active(z,k)))return null;w=z;}
 if(w.pendingFree||!goals.every(k=>replay.active(w,k)))return null;
 const steps=[...n.steps,...actions],allowed=engine.context(g.branch,birth.p,[...birth.birth,...steps],w).filter(i=>g.allowedDifficulties.includes(i));
 return allowed.length?{world:w,steps,allowed}:null;
 }catch{return null;}
}
function support(w){return [...rules.values()].filter(r=>r.requires.every(k=>replay.active(w,k))).map(r=>r.id).sort();}
function storeExpansion(id,t,v,plan){
 const {g,r,birth,n}=v,w=plan.world,actions=plan.steps.slice(n.steps.length),s=researchSet(w,g.branch),sid=key(s);
 assert(sid!==g.researchSet&&t.goal.every(k=>s.active.includes(k)));
 const before=new Set(support(n.world)),after=support(w),newly=after.filter(k=>!before.has(k)),lost=[...before].filter(k=>!after.includes(k));
 const ek=key([t.root,t.node,exactWorld(w)]);if(expansions[ek]){round.aliases++;return ek;}
 sets[sid]=s;const e={root:t.root,node:t.node,origin:t.origin,branch:t.branch,sourceSet:t.sourceSet,resultSet:sid,goal:t.goal,targets:t.targets,sourceStateHash:exactWorld(n.world),resultStateHash:exactWorld(w),researchActions:actions,fullActionHash:key([...birth.birth,...plan.steps]),allowedDifficulties:plan.allowed,newlySupported:newly,lostSupport:lost,addedActive:s.active.filter(k=>!replay.active(n.world,k)),lostActive:[...n.world.researched].filter(k=>replay.active(n.world,k)&&!replay.active(w,k)),transformResults:{},actualGameCertified:false};
 for(const rule of engine.byBody.get(member(w).state.soldierType)||[]){
  if(!newly.includes(rule.id))continue;
  try{const x=replay.transform({world:w,steps:[]},rule);if(!x){e.transformResults[rule.id]={status:"UNRESOLVED_LOCAL_GATE"};continue;}
   const z=replay.grow(x),full=[...birth.birth,...plan.steps,...z.steps],allowed=engine.context(g.branch,birth.p,full,z.world).filter(i=>plan.allowed.includes(i));if(!allowed.length){e.transformResults[rule.id]={status:"UNRESOLVED_CONTEXT"};continue;}
   const f=replay.finish(z.world);e.transformResults[rule.id]={status:"CONDITIONAL_REPLAY",steps:z.steps,stateHash:exactWorld(z.world),fullActionHash:key(full),allowedDifficulties:allowed,...f,traits:traitSnapshot(z.world),actualGameCertified:false};round.replayedTransforms++;
  }catch(err){e.transformResults[rule.id]={status:"UNRESOLVED",reason:String(err.message)};}
 }
 expansions[ek]=e;round.expanded++;const k=key([t.sourceSet,t.goal]),a=suffixes.get(k)||[];if(!a.some(s=>key(s)===key(actions)))a.push(actions);suffixes.set(k,a);return ek;
}
const pending=Object.entries(tasks).filter(([id])=>!receipts[id]),groups=new Map();
for(const [id,t] of pending){const k=t.origin;const a=groups.get(k)||[];a.push([id,t]);groups.set(k,a);}
for(const a of groups.values())a.sort((x,y)=>x[1].goal.length-y[1].goal.length||y[1].targets.length-x[1].targets.length||x[0].localeCompare(y[0]));
const seconds=Number(arg("seconds","25")),limit=Number(arg("limit","100"));assert(seconds>0&&Number.isSafeInteger(limit)&&limit>0);
const start=performance.now(),cursors=new Map();let work=true;
while(work&&round.attempted<limit&&performance.now()-start<seconds*1000){work=false;
 for(const [origin,list] of groups){if(round.attempted>=limit||performance.now()-start>=seconds*1000)break;
  const i=cursors.get(origin)||0;if(i>=list.length)continue;work=true;cursors.set(origin,i+1);
  const [id,t]=list[i];round.attempted++;
  try{const v=source(t.root,t.node),p=engine.policy(t.branch,v.n),rule={id:t.targets[0],requires:t.goal};
   if(t.goal.some(k=>p.blocked.has(k)||p.opposing.has(k))){receipts[id]={status:"EXCLUDED_BY_CURRENT_BRANCH_POLICY"};continue;}
   let q=null;for(const a of suffixes.get(key([t.sourceSet,t.goal]))||[]){q=replayPlan(v,a,rule);if(q){round.sharedSuffixHits++;break;}}
   if(!q){const proposed=reuse?.plan(v.n,t.branch,v.birth.birth,rule)||engine.plan(v.n,t.branch,v.birth.birth,rule);if(!proposed.ok){receipts[id]={status:"LIMITED_UNRESOLVED",reason:proposed.reason||"RESEARCH_PLAN_UNRESOLVED"};continue;}
    q=replayPlan(v,proposed.n.steps.slice(v.n.steps.length),rule);}
   if(!q){receipts[id]={status:"LIMITED_UNRESOLVED",reason:"JOINT_CONTEXT_OR_BRANCH_REPLAY"};continue;}
   const ek=storeExpansion(id,t,v,q);receipts[id]={status:"CONDITIONAL_RESEARCH_EXPANDED",expansion:ek};
  }catch(e){round.errors++;receipts[id]={status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
 }
}
const counts={};for(const v of Object.values(receipts))counts[v.status]=(counts[v.status]||0)+1;
const xs=Object.values(expansions),newSets=new Set(xs.map(e=>e.resultSet)),transformResults=xs.flatMap(e=>Object.entries(e.transformResults));
const summary={roots:Object.values(fixed.graphs).filter(g=>g.scopeComplete).length,rawInactive,unsupported,alreadyHistorical,goalTasks:Object.keys(tasks).length,attempted:Object.keys(receipts).length,pending:Object.keys(tasks).length-Object.keys(receipts).length,counts,expandedStates:xs.length,distinctNewResearchSets:newSets.size,newlySupportedKinds:new Set(xs.flatMap(e=>e.newlySupported)).size,successfulTransforms:transformResults.filter(([,r])=>r.status==="CONDITIONAL_REPLAY").length,unresolvedTransforms:transformResults.filter(([,r])=>r.status!=="CONDITIONAL_REPLAY").length,origins:new Set(xs.map(e=>e.origin)).size,branches:new Set(xs.map(e=>e.branch)).size,actualGameCertified:0,round,planner:engine.metrics,sharedSegments:reuse?.metrics};
const result={schema:MODEL,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceClosureFingerprint:fixed.fingerprint,scope:"Research expansion from conditional fixed-set graph representatives; research plan search is bounded, no global completeness or acquisition certificate. Research/support gates do not prove simultaneous treatment feasibility.",summary,tasks,receipts,sets,expansions,templates:engine.templates};
const bytes=gzipSync(JSON.stringify(result));fs.writeFileSync(out+".tmp",bytes);fs.renameSync(out+".tmp",out);
const rows=Object.entries(expansions).map(([id,e])=>({id,root:e.root,node:e.node,origin:e.origin,branch:e.branch,rootActionHash:fixed.graphs[e.root].rootActionHash,rootStateHash:fixed.graphs[e.root].rootStateHash,sourceSet:e.sourceSet,resultSet:e.resultSet,addedActive:e.addedActive.length,lostActive:e.lostActive.length,newlySupported:e.newlySupported,successfulTransforms:Object.keys(e.transformResults).filter(k=>e.transformResults[k].status==="CONDITIONAL_REPLAY")}));
fs.writeFileSync("public/branch-soldier-research-expansion-summary.js","export const researchExpansionSummary="+JSON.stringify({...summary,sourceMetadataSha256:db.sourceMetadataSha256,sourceClosureFingerprint:fixed.fingerprint,file:"soldier-final-career-research-expansion.json.gz",sha256:sha(bytes),rows})+";\n");
console.log(JSON.stringify({...summary,bytes:bytes.length}));
