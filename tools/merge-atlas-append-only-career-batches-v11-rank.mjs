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
function remapRouteId(id){if(typeof id!=="string")return id;const m=id.match(/^MISSCAR:([^:]+):(\d+)$/);if(!m)return id;return "MISSCAR:"+m[1]+":"+mapNode(m[1],Number(m[2]));}
for(const [id,g] of Object.entries(local.graphs))if(!base.graphs[id]&&!remote.graphs[id]&&g.prefixSource?.id?.startsWith("MISSCAR:"))out.graphs[id].prefixSource.id=remapRouteId(g.prefixSource.id);
function actions(g,i){const trail=[];let j=i;while(j!==null){const n=g.nodes[j];assert(n);trail.push(n.steps);assert(n.parent===null||n.parent<j);j=n.parent;}return [...g.birthActions,...trail.reverse().flat()];}
for(const [id,r] of Object.entries(local.routes)){
 if(base.routes[id]){assert(eq(r,base.routes[id]));assert(eq(remote.routes[id],r));continue;}
 const j=mapNode(r.sourceGraph,r.sourceNode),rid="MISSCAR:"+r.sourceGraph+":"+j,n=out.graphs[r.sourceGraph].nodes[j];
 assert.equal(n.stateHash,r.canonicalStateHash);assert.equal(key(actions(local.graphs[r.sourceGraph],r.sourceNode)),r.fullActionHash);
 assert.equal(key(actions(out.graphs[r.sourceGraph],j)),r.fullActionHash,"Action witness changed in remap");
 const v={...r,sourceNode:j};
 if(alternateProvenance.graphs[r.sourceGraph]||!remote.graphs[r.sourceGraph]&&out.graphs[r.sourceGraph].prefixSource?.id!==local.graphs[r.sourceGraph].prefixSource?.id)v.birthEvidence={...v.birthEvidence,prefixSource:out.graphs[r.sourceGraph].prefixSource};
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
const attemptsLocal=copy(local.attempts);for(const [k,v] of Object.entries(attemptsLocal))if(!(k in base.attempts)&&v.donor)v.donor=remapRouteId(v.donor);
for(const k of ["attempts","stagedPrefixes"])mergeNewMap(base[k],k==="attempts"?attemptsLocal:local[k],out[k],k,v=>k==="attempts"&&v.status==="CONDITIONAL_REPLAY"&&v.donorHash?omit(v,["donor"]):v,(id,v)=>{
 if(k==="attempts"&&out[k][id]&&!eq(v,out[k][id])){
  assert(v.status==="CONDITIONAL_REPLAY"&&out[k][id].status==="CONDITIONAL_REPLAY"&&v.donorHash&&v.donorHash===out[k][id].donorHash&&eq(omit(v,["donor"]),omit(out[k][id],["donor"])),"Attempt metadata conflict "+id);
  alternateProvenance.attempts[id]=copy(v);
 }
 assert(!("node" in v)&&!("to" in v)&&!("sourceNode" in v),"Unexpected auxiliary node reference");
 if(v.graph)assert(out.graphs[v.graph],"Unknown recruitment graph");
});
const withoutRound=v=>omit(v,["roundToken"]);
// Preserve terminal research action identity, not unstable node numbers.
function remapChecked(graph,node){
 const j=mapNode(graph,node);assert.equal(out.graphs[graph].nodes[j].stateHash,local.graphs[graph].nodes[node].stateHash);
 assert.equal(key(actions(out.graphs[graph],j)),key(actions(local.graphs[graph],node)));
 return j;
}
function putNew(table,id,v,label,normalize=x=>x){
 if(table[id])assert(eq(normalize(table[id]),normalize(v)),"Auxiliary merge conflict "+label+":"+id);
 else {table[id]=v;stats.importedAuxiliary=(stats.importedAuxiliary||0)+1;}
}
// The records are append-only; anchors are mutable pointers into that
// history. Keep the remote pointer when both workers advanced independently.
for(const [id,v] of Object.entries(base.terminalResearch.records))assert(eq(local.terminalResearch.records[id],v)&&eq(remote.terminalResearch.records[id],v),"Common terminal record changed "+id);
for(const id of Object.keys(base.terminalResearch.anchors))assert(id in local.terminalResearch.anchors&&id in remote.terminalResearch.anchors,"Common terminal anchor removed "+id);
alternateProvenance.terminalRecords={};alternateProvenance.terminalAnchors={};
const localTerminalByAnchor=new Map();
for(const [id,orig] of Object.entries(local.terminalResearch.records)){
 if(id in base.terminalResearch.records)continue;
 const anchor=key([orig.graph,orig.target]);assert.equal(id,key([anchor,orig.node,orig.attempt-1]),"Terminal record key");
 const v=copy(orig);v.node=remapChecked(v.graph,v.node);
 if(Number.isInteger(v.to)){
  v.to=remapChecked(v.graph,v.to);const n=out.graphs[v.graph].nodes[v.to];
  if(v.stateHash)assert.equal(n.stateHash,v.stateHash);
  if(v.suffixHash)assert.equal(key(n.steps),v.suffixHash);
 }
 for(const f of v.fragments||[])if(f.source)f.source.node=remapChecked(f.source.graph,f.source.node);
 const mappedKey=key([anchor,v.node,v.attempt-1]),existing=out.terminalResearch.records[mappedKey];
 const normalize=x=>omit(x,["roundToken","elapsedMs"]);
 // A competing attempt on the same source node can yield a different
 // chronological suffix. Preserve the remapped evidence, not a fake retry.
 if(existing&&!eq(normalize(existing),normalize(v))){
  alternateProvenance.terminalRecords[key([refs.local,id,mappedKey])]={canonicalKey:mappedKey,record:v};
  stats.terminalRecordConflicts=(stats.terminalRecordConflicts||0)+1;
 }else putNew(out.terminalResearch.records,mappedKey,v,"terminalResearch.records",normalize);
 const previous=localTerminalByAnchor.get(anchor);if(!previous||orig.attempt>previous.orig.attempt)localTerminalByAnchor.set(anchor,{orig,v});
}
for(const [id,orig] of Object.entries(local.terminalResearch.anchors)){
 const original=base.terminalResearch.anchors[id],other=remote.terminalResearch.anchors[id];
 if(original&&eq(orig,original))continue;
 const pair=localTerminalByAnchor.get(id);assert(pair,"Advanced anchor lacks terminal record");const r=pair.orig;
 assert.equal(orig.attempts,r.attempt);assert.equal(orig.status,r.status);assert.equal(orig.node,Number.isInteger(r.to)?r.to:r.node);
 const v={...orig,node:remapChecked(r.graph,orig.node)};
 const mappedKey=key([id,pair.v.node,pair.v.attempt-1]);
 const canonical=out.terminalResearch.records[mappedKey];
 if((other&&!eq(other,original))||!canonical||!eq(omit(canonical,["roundToken","elapsedMs"]),omit(pair.v,["roundToken","elapsedMs"]))){
  alternateProvenance.terminalAnchors[id]={anchor:v,record:pair.v};
  stats.terminalAnchorConflicts=(stats.terminalAnchorConflicts||0)+1;
 }else {out.terminalResearch.anchors[id]=v;stats.importedAuxiliary=(stats.importedAuxiliary||0)+1;}
}
for(const [id,v] of Object.entries(base.terminalSupply.front))assert(eq(local.terminalSupply.front[id],v)&&id in out.terminalSupply.front,"Common supply front changed");
for(const [id,orig] of Object.entries(local.terminalSupply.front)){
 if(id in base.terminalSupply.front)continue;
 assert.equal(id,key([orig.graph,orig.node,orig.target]));
 const v={...orig,node:remapChecked(orig.graph,orig.node)};
 putNew(out.terminalSupply.front,key([v.graph,v.node,v.target]),v,"terminalSupply.front");
}
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
   const oldBase=key([id,oldNode,v.action]),newBase=key([id,v.node,v.action]);
   if(v.retryOf){
    // A retry on an unchanged source node keeps both its base candidate
    // and original template revision. Require its predecessor in both
    // histories to be identical; do not infer an alias.
    assert.equal(oldBase,newBase,"Retry remap not supported");
    assert.equal(v.baseCandidate,oldBase);
    assert(base.traitChain.records[v.retryOf]&&eq(base.traitChain.records[v.retryOf],r[v.retryOf]),"Retry predecessor changed");
    if(v.rankRetryPolicy){
     assert.equal(v.rankRetryPolicy,local.summary.defaultRankPolicy?.policy?.id);
     assert.equal(v.rankRetryPolicy,"OXCE_DEFAULT_RANK_CONDITIONAL_V1");
     const previous=base.traitChain.records[v.retryOf],n=base.graphs[id].nodes[oldNode];
     assert.equal(previous.status,"PROBE_UNRESOLVED");
     assert(local.summary.defaultRankPolicy.indexed.includes(n.body));
     assert.equal(oldId,key([oldBase,"DEFAULT_RANK_RETRY",v.rankRetryPolicy]));
    }else assert.equal(oldId,key([oldBase,"NEW_RESEARCH_TEMPLATE",v.templateRevision]));
    k=oldId;
   }else if(v.concurrentAlternativeOf){
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
// Keep compaction evidence tied to the remapped concrete witness nodes.
const comp=local.summary.repeatCompaction;
if(comp?.records){
 const records={...(out.summary.repeatCompaction?.records||{})};
 for(const [id,orig] of Object.entries(comp.records)){
  const r=copy(orig),oldSource=r.source;
  r.from=remapChecked(r.graph,r.from);r.source=remapRouteId(oldSource);
  assert(out.routes[r.source],"Missing compaction source");
  if(r.status==="COMPACT_REPLAY"){
   r.anchor=remapChecked(r.graph,r.anchor);r.to=remapChecked(r.graph,r.to);
   const dest=out.routes["MISSCAR:"+r.graph+":"+r.to];
   assert(dest&&dest.canonicalStateHash===r.targetStateHash&&out.routes[r.source].canonicalStateHash===r.sourceStateHash);
   assert(dest.order.length<out.routes[r.source].order.length);
  }
  const existing=records[r.source],baseReceipt=base.summary.repeatCompaction?.records?.[id];
  if(eq(orig,baseReceipt))continue;
  if(!existing||eq(existing,baseReceipt)){
   // A failed attempt may be retried by a newer algorithm; keep its exact
   // predecessor nested in the updated record.
   if(existing)assert(existing.status!=="COMPACT_REPLAY"&&eq(r.previous,existing),"Compaction retry ancestry mismatch "+r.source);
   records[r.source]=r;stats.importedCompaction=(stats.importedCompaction||0)+1;
  }else if(eq(omit(existing,["revision","mode","previous"]),omit(r,["revision","mode","previous"]))){
   stats.identicalCompaction=(stats.identicalCompaction||0)+1;
   if((r.revision||1)>(existing.revision||1))records[r.source]=r;
  }else{
   // Preserve independently witnessed alternatives instead of losing either.
   alternateProvenance.compaction??={};
   alternateProvenance.compaction[key([refs.local,id])]=r;
   if(existing.status!=="COMPACT_REPLAY"&&r.status==="COMPACT_REPLAY")records[r.source]=r;
   else if(existing.status==="COMPACT_REPLAY"&&r.status==="COMPACT_REPLAY"){
    const oldDest=out.routes["MISSCAR:"+existing.graph+":"+existing.to],newDest=out.routes["MISSCAR:"+r.graph+":"+r.to];
    if(newDest.order.length<oldDest.order.length)records[r.source]=r;
   }
   stats.compactionAlternatives=(stats.compactionAlternatives||0)+1;
  }
 }
 out.summary.repeatCompaction={...comp,records};
}
if(local.summary.defaultRankPolicy){
 if(out.summary.defaultRankPolicy)assert(eq(out.summary.defaultRankPolicy,local.summary.defaultRankPolicy));
 out.summary.defaultRankPolicy=copy(local.summary.defaultRankPolicy);
 out.summary.defaultRankRoutes=Object.values(out.routes).filter(r=>r.rankDefault).length;
}
out.sourceGraphSha256=key(out.graphs);
out.summary={...out.summary,mergedRecruitmentExtension:local.summary.terminalExtension,mergedEventRecruitment:local.summary.terminalEvent,mergedBranchCoverage:local.summary.branchCoverage,mergedTerminalTransfer:local.summary.terminalTransfer};
out.migration={...out.migration,appendOnlyConcurrentMerge:{...refs,...stats,sourceLocalFingerprint:local.fingerprint,alternateProvenance}};
for(const [id,r] of Object.entries(remote.routes))assert(eq(out.routes[id],r),"Remote published route changed");
for(const [id,r] of Object.entries(out.routes))assert.equal(out.graphs[r.sourceGraph].nodes[r.sourceNode].stateHash,r.canonicalStateHash);
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out)));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({...stats,remoteRoutes:Object.keys(remote.routes).length,mergedRoutes:Object.keys(out.routes).length,mergedStates:Object.values(out.graphs).reduce((s,g)=>s+g.nodes.length,0)}));
