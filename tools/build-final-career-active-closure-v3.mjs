// Reachability graph for each exact replayed seed under a fixed research
// snapshot. No depth limit, no score-based removal. Every processed node
// records all indexed body/research/history gates and all supported edges.
// The action family is conditional: cap growth and minimum promotion/medal/
// material assumptions only; other game actions are not certified.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {createBridge,birthCatalog} from "./population-frontier-chronology-core.mjs";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {researchSetId} from "./final-career-active-research-sets.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {createConditionalResourceQuotient} from "./final-career-conditional-resource-quotient.mjs";
const MODEL="FIXED_ACTIVE_RESEARCH_REACHABILITY_V3";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),ledger=db.populationFrontierChronology,data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert(ledger.activeResearchIndex);
const files=["tools/build-final-career-active-closure-v3.mjs","tools/final-career-repeat-quotient.mjs","tools/final-career-conditional-resource-quotient.mjs","public/soldiers/modern/research-training-locks.js","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json","tools/final-career-active-research-sets.mjs","tools/population-frontier-chronology-core.mjs","tools/population-research-career-core.mjs","tools/population-growth-replay-core.mjs","tools/population-chronological-career-core.mjs","tools/population-scalar-upper-bound.mjs","tools/population-rank-trait-priority.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/origin-campaign-context.js"];
const fingerprint=key([MODEL,db.sourceMetadataSha256,files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]);
const out=arg("out","public/data/soldier-final-career-active-closure-v3.json.gz");
const quotient=createConditionalResourceQuotient(data);
const prior=fs.existsSync(out)?decode(out):null;
if(prior)assert.equal(prior.fingerprint,fingerprint,"Closure implementation changed; explicit migration required");
const graphs=prior?.graphs||{},births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const {engine,replay,loadBirth}=createBridge(data,db,ledger.cacheHashes||ledger.hashes,{cache:true});
const bodyRules=new Map(),supported=new Map();
for(const r of data.transformations)for(const body of r.allowedSoldierTypes||[]){
 const xs=bodyRules.get(body)||[];xs.push(r);bodyRules.set(body,xs);
 const dest=replay.bodies.get(r.producedSoldierType||body);
 supported.set(body+"|"+r.id,Boolean(dest&&r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&deterministicRule(r,[dest])));
}
const known=new Set(Object.values(ledger.routes).map(r=>key([r.input,r.branch,r.allowedDifficulties,r.canonicalStateHash])));
const cap=Number(arg("roots","12")),budget=Number(arg("nodes","400")),seconds=Number(arg("seconds","24"));
assert(Number.isSafeInteger(cap)&&cap>=0&&Number.isSafeInteger(budget)&&budget>0&&Number.isFinite(seconds)&&seconds>0);
const start=performance.now(),cache=new Map(),seenByGraph=new Map(),rootsByOrigin=new Set(Object.values(graphs).map(g=>g.origin));
const round={newRoots:0,processed:0,newStates:0,exactAliases:0,quotientAliases:0,knownLedgerStates:0,newLedgerStates:0,transforms:0,growth:0,rootErrors:[]};
function cachePut(k,w){if(cache.size>=120)cache.delete(cache.keys().next().value);cache.set(k,w);return w;}
function rootWorld(id,g){
 const r=ledger.routes[id];assert(r&&!r.rankDefault&&r.fullActionHash===g.rootActionHash&&r.canonicalStateHash===g.rootStateHash);
 const b=loadBirth(births.get(r.input)),w=replay.replay(r.actions,b.n.world);
 assert.equal(exactWorld(w),g.rootStateHash);assert.equal(researchSetId(w,g.branch),g.researchSet);
 return w;
}
function load(id,g,i){
 const k=id+"|"+i;if(cache.has(k))return cache.get(k);
 const chain=[];let p=i;
 while(p!==null&&!cache.has(id+"|"+p)){chain.push(p);p=g.nodes[p].parent;}
 let w=p===null?rootWorld(id,g):cache.get(id+"|"+p);
 for(const j of chain.reverse()){if(j!==0)w=replay.replay(g.nodes[j].steps,w);assert.equal(exactWorld(w),g.nodes[j].stateHash);cachePut(id+"|"+j,w);}
 return w;
}
function snapshot(w){const f=replay.finish(w);return {...f,traits:traitSnapshot(w)};}
function insert(id,g,world,parent,steps,action){
 const stateHash=exactWorld(world),projection=quotient.project(world);let seen=seenByGraph.get(id);
 if(!seen){seen=new Map(g.nodes.map((n,i)=>[n.projection,i]));seenByGraph.set(id,seen);}
 if(seen.has(projection)){const to=seen.get(projection),exact=g.nodes[to].stateHash===stateHash;round[exact?"exactAliases":"quotientAliases"]++;return {to,alias:true,exact,stateHash,projection};}
 const to=g.nodes.length;seen.set(projection,to);
 const k=key([g.input,g.branch,g.allowedDifficulties,stateHash]),already=known.has(k);
 const n={parent,steps,action,stateHash,projection,knownLedgerState:already,...snapshot(world),edges:null};
 g.nodes.push(n);cachePut(id+"|"+to,world);
 if(parent!==null){round.newStates++;round[already?"knownLedgerStates":"newLedgerStates"]++;}
 return {to,alias:false,stateHash,projection};
}
for(const [id,g] of Object.entries(graphs)){
 assert.equal(ledger.routes[id]?.fullActionHash,g.rootActionHash);assert.equal(ledger.routes[id]?.canonicalStateHash,g.rootStateHash);
 assert.equal(g.nodes[0].stateHash,g.rootStateHash);assert(g.cursor>=0&&g.cursor<=g.nodes.length);
}
const choices=Object.entries(ledger.activeResearchIndex.refs).filter(([id])=>!graphs[id]&&!ledger.routes[id].rankDefault).map(([id,r])=>[id,ledger.routes[id],r]);
const originCount=new Map();for(const g of Object.values(graphs))originCount.set(g.origin,(originCount.get(g.origin)||0)+1);
const old=arg("seed-from",""),preferred=new Set(old?Object.keys(decode(old).graphs):[]);
const compare=(a,b)=>Number(preferred.has(b[0]))-Number(preferred.has(a[0]))||(originCount.get(a[1].origin)||0)-(originCount.get(b[1].origin)||0)||a[1].order.length-b[1].order.length||a[0].localeCompare(b[0]);
for(let i=0;i<cap&&choices.length&&performance.now()-start<seconds*1000;i++){
 choices.sort(compare);const [id,r,ref]=choices.shift();
 const g={origin:r.origin,branch:r.branch,input:r.input,rootActionHash:r.fullActionHash,rootStateHash:r.canonicalStateHash,researchSet:ref.set,allowedDifficulties:r.allowedDifficulties,nodes:[],cursor:0,scopeComplete:false,actualGameCertified:false};
 try{const w=rootWorld(id,g);insert(id,g,w,null,[],null);graphs[id]=g;round.newRoots++;originCount.set(r.origin,(originCount.get(r.origin)||0)+1);}catch(e){round.rootErrors.push({id,reason:String(e.message)});}
}
const scope=["No new research or research-changing action is included; funds equivalence applies only under conditional top-up assumptions","Only indexed deterministic healthy live nonclone transformations","Optional cap growth; minimum required rank/medals and resources are conditional assumptions","Partial growth, RNG, death/revival, independent rank/medal acquisition, time and other game actions remain outside scope","Rejected modeled actions are unresolved unless an explicit research/body/history gate excludes them"];
function expand(id,g){
 const i=g.cursor,n=g.nodes[i],w=load(id,g,i),state=member(w).state,history=state.history;
 const edges=[],gates={inactive:0,forbiddenBody:0,history:0,unsupported:0,unresolved:0,researchChanged:0};
 function offer(action,x){
  if(!x){edges.push({action,status:"UNRESOLVED"});gates.unresolved++;return;}
  if(researchSetId(x.world,g.branch)!==g.researchSet){edges.push({action,status:"RESEARCH_STATE_CHANGED_OUTSIDE_SCOPE"});gates.researchChanged++;return;}
  const steps=x.steps;
  const q=insert(id,g,x.world,i,steps,action);
  edges.push({action,status:q.alias?(q.exact?"EXACT_STATE_ALIAS":"PROVEN_MODEL_QUOTIENT_ALIAS"):"REPLAYED",to:q.to,steps,stateHash:q.stateHash,projection:q.projection});
 }
 try{const grown=replay.grow({world:w,steps:[]});if(grown.steps.length){round.growth++;offer("CAP_GROWTH",grown);}else edges.push({action:"CAP_GROWTH",status:"ALREADY_AT_CAP"});}catch(e){edges.push({action:"CAP_GROWTH",status:"UNRESOLVED",reason:String(e.message)});gates.unresolved++;}
 const rules=(bodyRules.get(state.soldierType)||[]).slice().sort((a,b)=>a.id.localeCompare(b.id));
 for(const r of rules){
  const action=r.id;
  if(r.forbiddenSoldierTypes?.includes(state.soldierType)){gates.forbiddenBody++;edges.push({action,status:"BODY_FORBIDDEN"});continue;}
  if(!r.requires.every(k=>replay.active(w,k))){gates.inactive++;edges.push({action,status:"INACTIVE_RESEARCH"});continue;}
  if(r.requiredPreviousTransformations?.some(k=>!history.has(k))||r.forbiddenPreviousTransformations?.some(k=>history.has(k))){gates.history++;edges.push({action,status:"HISTORY_GATE"});continue;}
  if(!supported.get(state.soldierType+"|"+r.id)){gates.unsupported++;edges.push({action,status:"UNSUPPORTED_FAMILY"});continue;}
  try{round.transforms++;offer(action,replay.transform({world:w,steps:[]},r));}catch(e){gates.unresolved++;edges.push({action,status:"UNRESOLVED",reason:String(e.message)});}
 }
 n.edges=edges;n.gates=gates;g.cursor++;round.processed++;
}
while(round.processed<budget&&performance.now()-start<seconds*1000){
 let work=false;
 for(const [id,g] of Object.entries(graphs)){
  if(round.processed>=budget||performance.now()-start>=seconds*1000)break;
  if(g.cursor>=g.nodes.length)continue;
  work=true;try{expand(id,g);}catch(e){round.rootErrors.push({id,reason:String(e.message)});g.blocker=String(e.message);break;}
 }
 if(!work||Object.values(graphs).some(g=>g.blocker))break;
}
const details=[];let states=0,expanded=0,pending=0,aliases=0,unresolved=0,unsupported=0,researchChanged=0,exhausted=0,scopeComplete=0,novel=0;
const statusCounts={},uniqueNovel=new Set();
for(const [id,g] of Object.entries(graphs)){
 const frontiers=new Map();let maxTraits=0,maxDistinct=0;
 const local={aliases:0,unresolved:0,unsupported:0,researchChanged:0};
 for(const [i,n] of g.nodes.entries()){
  for(const e of n.edges||[]){statusCounts[e.status]=(statusCounts[e.status]||0)+1;if(e.status==="EXACT_STATE_ALIAS"||e.status==="PROVEN_MODEL_QUOTIENT_ALIAS")local.aliases++;if(e.status==="UNRESOLVED")local.unresolved++;if(e.status==="UNSUPPORTED_FAMILY")local.unsupported++;if(e.status==="RESEARCH_STATE_CHANGED_OUTSIDE_SCOPE")local.researchChanged++;}
  maxTraits=Math.max(maxTraits,n.traits.length);
  if(i&&!n.knownLedgerState){uniqueNovel.add(key([g.input,g.branch,g.allowedDifficulties,n.stateHash]));}
  const xs=frontiers.get(n.body)||[];
  if(!xs.some(j=>dominates(g.nodes[j].permanentVector,n.permanentVector)))frontiers.set(n.body,[...xs.filter(j=>!dominates(n.permanentVector,g.nodes[j].permanentVector)),i]);
 }
 const done=g.cursor===g.nodes.length&&!g.blocker;g.scopeComplete=done&&!local.unresolved&&!local.unsupported&&!local.researchChanged;
 states+=g.nodes.length;expanded+=g.cursor;pending+=g.nodes.length-g.cursor;aliases+=local.aliases;unresolved+=local.unresolved;unsupported+=local.unsupported;researchChanged+=local.researchChanged;exhausted+=Number(done);scopeComplete+=Number(g.scopeComplete);
 const best=[...frontiers.values()].flat().sort((i,j)=>g.nodes[j].traits.length-g.nodes[i].traits.length||i-j);
 const root=g.nodes[0],pick=g.nodes[best[0]],vectors=new Set(g.nodes.map(n=>JSON.stringify([n.body,n.permanentVector]))),improved=g.nodes.filter(n=>n.body!==root.body||n.permanentVector.some((v,i)=>v>root.permanentVector[i])||n.traits.some(t=>!root.traits.includes(t))).length;
 details.push({id,origin:g.origin,branch:g.branch,rootActionHash:g.rootActionHash,rootStateHash:g.rootStateHash,researchSet:g.researchSet,states:g.nodes.length,expanded:g.cursor,pending:g.nodes.length-g.cursor,...local,queueExhausted:done,scopeComplete:g.scopeComplete,frontierCount:best.length,distinctVectors:vectors.size,improvedStates:improved,maxTraits,rootTraits:root.traits.length,bestNode:best[0],bestTraits:pick.traits.length,body:pick.body,vector:pick.permanentVector});
 g.frontier=Object.fromEntries(frontiers);
}
novel=uniqueNovel.size;
const summary={roots:details.length,origins:new Set(details.map(r=>r.origin)).size,branches:new Set(details.map(r=>r.branch)).size,states,expanded,pending,aliases,unresolved,unsupported,researchChanged,exhausted,scopeComplete,novelStates:novel,changedRoots:details.filter(r=>r.improvedStates>0).length,improvedStates:details.reduce((n,r)=>n+r.improvedStates,0),quotientAliases:statusCounts.PROVEN_MODEL_QUOTIENT_ALIAS||0,statusCounts,actualGameCertified:0,round,details};
const result={schema:MODEL,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceLedgerFingerprint:ledger.fingerprint,scope,quotientProof:quotient.proof,summary,graphs};
const bytes=gzipSync(JSON.stringify(result));fs.writeFileSync(out+".tmp",bytes);fs.renameSync(out+".tmp",out);
fs.writeFileSync("public/branch-soldier-active-closure-summary.js","export const activeClosureSummary="+JSON.stringify({...summary,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,file:"soldier-final-career-active-closure-v3.json.gz",sha256:sha(bytes)})+";\n");
console.log(JSON.stringify({...summary,details:details.slice(0,5),bytes:bytes.length}));
