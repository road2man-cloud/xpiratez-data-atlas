// Merge append-only career batches against a common ancestor. Existing public
// route IDs are immutable. Local collisions receive new indices; every local
// full chronological action hash is checked before and after the remapping.
import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
const opt=k=>process.argv.find(a=>a.startsWith("--"+k+"="))?.slice(k.length+3);
const file="public/data/soldier-population-missing-origin-career.json.gz";
const refs=Object.fromEntries(["base","remote","local"].map(k=>[k,execFileSync("git",["rev-parse",opt(k)],{encoding:"utf8"}).trim()]));
assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),refs.remote);
const read=r=>JSON.parse(gunzipSync(execFileSync("git",["show",r+":"+file],{maxBuffer:100*1024*1024})));
const base=read(refs.base),remote=read(refs.remote),local=read(refs.local);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b),copy=structuredClone;
for(const x of [base,remote,local]){assert.equal(x.sourceMetadataSha256,base.sourceMetadataSha256);assert.equal(x.sourceGraphSha256,key(x.graphs));}
assert(eq(JSON.parse(gunzipSync(fs.readFileSync(file))),remote),"Working ledger differs from remote; refusing to overwrite");
const out=copy(remote),maps=new Map(),stats={appendedNodes:0,identicalNodes:0,overlappingGraphs:0,remappedNodes:0,importedRoutes:0,identicalRoutes:0,recordConflicts:0,importedRecords:0,importedSeeds:0};
const omit=(o,ks)=>Object.fromEntries(Object.entries(o).filter(([k])=>!ks.includes(k)));
const nodeCore=n=>omit(n,["edges"]);
const alternateProvenance={graphs:{},attempts:{}};
function mapNode(id,i){if(i===null||i===undefined)return i;assert(Number.isInteger(i));const j=maps.get(id)?.get(i);assert(Number.isInteger(j),"Unknown local node "+id+":"+i);return j;}
for(const [id,g] of Object.entries(local.graphs)){
 let b=base.graphs[id];const r=out.graphs[id];
 if(!b){
  assert.equal(id,key([g.origin,g.branch,g.birthActions]));
  assert.equal(g.nodes[0].stateHash,g.rootStateHash);
  if(!r){
   out.graphs[id]=copy(g);stats.importedGraphs=(stats.importedGraphs||0)+1;stats.appendedNodes+=g.nodes.length;
   maps.set(id,new Map(g.nodes.map((n,i)=>{assert(n.parent===null||n.parent<i);return [i,i];})));continue;
  }
  // Concurrent recruitment may independently create the same content-addressed
  // graph. Treat the identical root as its virtual common ancestor, not the
  // whole local graph. All later nodes use the normal append/remap algorithm.
  if(!eq(omit(r,["nodes"]),omit(g,["nodes"]))){
   // The same exact recruitment history may be discovered via different
   // donors. Only provenance may differ; never relax body, difficulty,
   // action, root hash, or birth-time equality.
   assert(eq(omit(r,["nodes","prefixSource"]),omit(g,["nodes","prefixSource"])),"New graph metadata conflict "+id);
   assert(g.prefixSource?.donorResearchHash&&g.prefixSource.donorResearchHash===r.prefixSource?.donorResearchHash,"Donor research hash conflict "+id);
   alternateProvenance.graphs[id]=copy(g.prefixSource);
  }
  assert(eq(nodeCore(r.nodes[0]),nodeCore(g.nodes[0])),"New graph root conflict "+id);
  b={...g,nodes:[g.nodes[0]]};stats.sharedNewRoots=(stats.sharedNewRoots||0)+1;
 }
 assert(r,"Remote removed common graph "+id);
 assert(eq(omit(g,["nodes"]),omit(b,["nodes"])),"Local graph metadata changed "+id);
 assert(g.nodes.length>=b.nodes.length&&r.nodes.length>=b.nodes.length);
 const m=new Map();maps.set(id,m);
 for(let i=0;i<b.nodes.length;i++){
  assert(eq(g.nodes[i],b.nodes[i]),"Local common node mutated "+id+":"+i);
  assert(eq(nodeCore(r.nodes[i]),nodeCore(b.nodes[i])),"Remote common node identity changed "+id+":"+i);
  m.set(i,i);
 }
 if(g.nodes.length>b.nodes.length&&r.nodes.length>b.nodes.length)stats.overlappingGraphs++;
 const byIdentity=new Map(r.nodes.map((n,i)=>[key(nodeCore(n)),i]));
 for(let i=b.nodes.length;i<g.nodes.length;i++){
  const n=copy(g.nodes[i]);assert(n.edges===null,"Local appended edge expansion not supported");
  n.parent=mapNode(id,n.parent);const signature=key(nodeCore(n));
  let j=byIdentity.get(signature);
  if(j!==undefined){assert(eq(nodeCore(r.nodes[j]),nodeCore(n)));stats.identicalNodes++;}
  else{j=r.nodes.length;r.nodes.push(n);byIdentity.set(signature,j);stats.appendedNodes++;}
  m.set(i,j);if(i!==j)stats.remappedNodes++;
 }
}
function actions(g,i){const trail=[];let j=i;while(j!==null){const n=g.nodes[j];assert(n);trail.push(n.steps);assert(n.parent===null||n.parent<j);j=n.parent;}return [...g.birthActions,...trail.reverse().flat()];}
for(const [id,r] of Object.entries(local.routes)){
 if(base.routes[id]){assert(eq(r,base.routes[id]));assert(eq(remote.routes[id],r));continue;}
 const j=mapNode(r.sourceGraph,r.sourceNode),rid="MISSCAR:"+r.sourceGraph+":"+j,n=out.graphs[r.sourceGraph].nodes[j];
 assert.equal(n.stateHash,r.canonicalStateHash);assert.equal(key(actions(local.graphs[r.sourceGraph],r.sourceNode)),r.fullActionHash);
 assert.equal(key(actions(out.graphs[r.sourceGraph],j)),r.fullActionHash,"Action witness changed in remap");
 const v={...r,sourceNode:j};
 if(alternateProvenance.graphs[r.sourceGraph])v.birthEvidence={...v.birthEvidence,prefixSource:out.graphs[r.sourceGraph].prefixSource};
 if(out.routes[rid]){assert(eq(out.routes[rid],v));stats.identicalRoutes++;}
 else{out.routes[rid]=v;stats.importedRoutes++;}
}
// Local producer only changed these two scheduling ledgers. Unknown future
// mutation kinds fail closed, rather than silently dropping a reference.
// New recruitment graphs may add these auxiliary maps. Require unchanged
// common records and no node remapping for any of these added references.
function mergeNewMap(b,l,r,label,normalize=v=>v,validate=()=>{} ){
 for(const [k,v] of Object.entries(b))assert(eq(l[k],v)&&k in r,"Common local record mutated "+label+":"+k);
 for(const [k,v] of Object.entries(l))if(!(k in b)){
  validate(k,v);
  assert(!(k in r)||eq(normalize(r[k]),normalize(v)),"Auxiliary merge conflict "+label+":"+k);
  if(!(k in r)){r[k]=copy(v);stats.importedAuxiliary=(stats.importedAuxiliary||0)+1;}
 }
}
// New recruitment records reference the content-addressed graph or stage,
 // not a graph node. Terminal anchors below are explicitly restricted to
 // unchanged root references, so remapping descendants cannot corrupt them.
for(const k of ["attempts","stagedPrefixes"])mergeNewMap(base[k],local[k],out[k],k,v=>k==="attempts"&&v.status==="CONDITIONAL_REPLAY"&&v.donorHash?omit(v,["donor"]):v,(id,v)=>{
 if(k==="attempts"&&out[k][id]&&!eq(v,out[k][id])){
  assert(v.status==="CONDITIONAL_REPLAY"&&out[k][id].status==="CONDITIONAL_REPLAY"&&v.donorHash&&v.donorHash===out[k][id].donorHash&&eq(omit(v,["donor"]),omit(out[k][id],["donor"])),"Attempt metadata conflict "+id);
  alternateProvenance.attempts[id]=copy(v);
 }
 assert(!("node" in v)&&!("to" in v)&&!("sourceNode" in v),"Unexpected auxiliary node reference");
 if(v.graph)assert(out.graphs[v.graph],"Unknown recruitment graph");
});
const withoutRound=v=>omit(v,["roundToken"]);
const rootReference=(id,v)=>{
 assert.equal(v.node,0,"Only new root terminal references supported");
 if("to" in v)assert.equal(v.to,0);
 if(v.graph)assert.equal(mapNode(v.graph,0),0);
};
for(const k of ["records","anchors"])mergeNewMap(base.terminalResearch[k],local.terminalResearch[k],out.terminalResearch[k],"terminalResearch."+k,withoutRound,rootReference);
mergeNewMap(base.terminalSupply.front,local.terminalSupply.front,out.terminalSupply.front,"terminalSupply.front",v=>v,rootReference);
for(const k of ["plans","records","attempted","resourceResearch"])assert(eq(local.terminalSupply[k],base.terminalSupply[k]),"Unsupported terminalSupply mutation "+k);
for(const k of ["careerResearch","templates","repairedStages","followThrough","sharedIndex","traitSchedule","targets"]){
 assert(eq(local[k],base[k]),"Unsupported local mutation: "+k);
}
for(const k of ["records","research","turns"])assert(eq(local.endStage[k],base.endStage[k]),"Unsupported end-stage mutation "+k);
function mergeCounters(section,k){
 const b=base[section][k]||{},l=local[section][k]||{},r=out[section][k]||{};
 for(const [id,v] of Object.entries(b))assert(Number.isSafeInteger(v)&&id in l&&id in r);
 for(const [id,v] of Object.entries(l)){
  const before=b[id]||0,other=r[id]||0;
  assert([v,before,other].every(Number.isSafeInteger)&&v>=before&&other>=before);
  r[id]=other+v-before;
 }out[section][k]=r;
}
for(const section of ["traitChain","resetRecovery"]){
 const b=base[section].records,l=local[section].records,r=out[section].records;
 for(const [id,v] of Object.entries(b))assert(eq(l[id],v)&&id in r,"Local record mutated "+id);
 for(const [oldId,value] of Object.entries(l)){
  if(oldId in b)continue;
  const v=copy(value),id=v.graph,oldNode=v.node;
  v.node=mapNode(id,v.node);
  for(const k of ["researchNode","resetAncestor"])if(k in v)v[k]=mapNode(id,v[k]);
  for(const e of v.outcomes||[])if(Number.isInteger(e.to)){
   e.to=mapNode(id,e.to);
   if(e.status==="CONDITIONAL_REPLAY")assert.equal(out.graphs[id].nodes[e.to].stateHash,e.stateHash);
  }
  if(v.template)v.template.node=mapNode(v.template.graph,v.template.node);
  for(const f of v.fragments||[])if(f.source)f.source.node=mapNode(f.source.graph,f.source.node);
  let k;
  if(section==="traitChain"){
   assert(!v.retryOf,"New local retry record needs retry-reference migration");
   const oldBase=key([id,oldNode,v.action]),newBase=key([id,v.node,v.action]);
   if(v.concurrentAlternativeOf){
    assert.equal(v.concurrentAlternativeOf,oldBase);
    v.concurrentAlternativeOf=newBase;v.baseCandidate=newBase;
    k=newBase===oldBase?oldId:key(["REMAPPED_CONCURRENT_ALTERNATIVE",oldId,newBase]);
   }else{assert.equal(oldId,oldBase);k=newBase;v.baseCandidate=newBase;}
  }else{assert.equal(oldId,key([id,oldNode,v.target,v.action]));k=key([id,v.node,v.target,v.action]);}
  if(r[k]){
   if(eq(r[k],v))continue;
   // Preserve both outcomes when separate searches started at the same node.
   // Canonical remote key remains the scheduler's visited marker.
   v.concurrentAlternativeOf=k;v.concurrentSource=refs.local;
   k=key(["CONCURRENT_ALTERNATIVE",section,refs.local,oldId,k]);
   assert(!r[k]);stats.recordConflicts++;
  }
  r[k]=v;stats.importedRecords++;
 }
 mergeCounters(section,"turns");if(section==="traitChain")mergeCounters(section,"groupTurns");
}
const seeds=new Map(out.chainSeeds.map(s=>[s.id+"|"+s.node,s]));
for(const s of local.chainSeeds){
 const v={...s,node:mapNode(s.id,s.node)},k=v.id+"|"+v.node;
 if(seeds.has(k))assert(eq(seeds.get(k),v));else{seeds.set(k,v);stats.importedSeeds++;}
}
out.chainSeeds=[...seeds.values()];
out.sourceGraphSha256=key(out.graphs);
out.summary={...out.summary,mergedRecruitmentExtension:local.summary.terminalExtension,mergedEventRecruitment:local.summary.terminalEvent};
out.migration={...out.migration,appendOnlyConcurrentMerge:{...refs,...stats,sourceLocalFingerprint:local.fingerprint,alternateProvenance}};
for(const [id,r] of Object.entries(remote.routes))assert(eq(out.routes[id],r),"Remote published route changed");
for(const [id,r] of Object.entries(out.routes))assert.equal(out.graphs[r.sourceGraph].nodes[r.sourceNode].stateHash,r.canonicalStateHash);
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out)));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({...stats,remoteRoutes:Object.keys(remote.routes).length,mergedRoutes:Object.keys(out.routes).length,mergedStates:Object.values(out.graphs).reduce((s,g)=>s+g.nodes.length,0)}));
