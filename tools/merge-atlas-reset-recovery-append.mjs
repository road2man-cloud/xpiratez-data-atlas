// Merge two append-only career production batches. Remote IDs are canonical;
// local new nodes are remapped by exact chronological path, never by score.
// Reject incompatible edits instead of overwriting them.
import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gzipSync,gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
const arg=k=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3);
const path="public/data/soldier-population-missing-origin-career.json.gz",registry="public/data/branch-soldier-results.json.gz";
const raw=(ref,p=path)=>execFileSync("git",["show",ref+":"+p],{maxBuffer:96*1024*1024});
const get=ref=>JSON.parse(gunzipSync(raw(ref))),base=get(arg("base")),remote=get(arg("remote")),local=get(arg("local"));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b),same=(a,b,msg)=>assert(eq(a,b),msg);
assert.equal(base.schema,remote.schema);assert.equal(local.schema,"COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V15_RESET_RECOVERY");
for(const x of [remote,local]){assert.equal(x.sourceMetadataSha256,base.sourceMetadataSha256);assert.equal(key(x.graphs),x.sourceGraphSha256);same(Object.keys(x.graphs),Object.keys(base.graphs),"Unexpected new graphs");}
const out=structuredClone(local),maps=new Map(),metrics={appended:0,sharedExactPaths:0,edgeConflicts:0,remappedRoutes:0};
out.graphs=structuredClone(remote.graphs);
const bare=({edges,...n})=>n;
const graphMeta=({nodes,cursor,...g})=>g;
const mapped=(id,i)=>i==null?i:(assert(maps.get(id)?.has(i),"Missing node map "+id+":"+i),maps.get(id).get(i));
function remapEdge(id,e){return e.to==null?e:{...e,to:mapped(id,e.to)};}
for(const [id,b] of Object.entries(base.graphs)){
 const r=remote.graphs[id],l=local.graphs[id],g=out.graphs[id],m=new Map();maps.set(id,m);
 same(graphMeta(b),graphMeta(r),"Remote graph metadata changed");same(graphMeta(b),graphMeta(l),"Local graph metadata changed");
 for(let i=0;i<b.nodes.length;i++){same(bare(b.nodes[i]),bare(r.nodes[i]),"Remote old node changed");same(bare(b.nodes[i]),bare(l.nodes[i]),"Local old node changed");m.set(i,i);}
 const paths=new Map(g.nodes.map((n,i)=>[key([n.parent,n.steps,n.stateHash,n.projection]),i]));
 for(let i=b.nodes.length;i<l.nodes.length;i++){
  const n=l.nodes[i],parent=mapped(id,n.parent),h=key([parent,n.steps,n.stateHash,n.projection]);
  if(paths.has(h)){const j=paths.get(h);same({...bare(n),parent},bare(g.nodes[j]),"Exact path state mismatch");m.set(i,j);metrics.sharedExactPaths++;continue;}
  const j=g.nodes.length;m.set(i,j);paths.set(h,j);g.nodes.push({...n,parent,edges:null});metrics.appended++;
 }
 for(let i=0;i<l.nodes.length;i++){
  const n=l.nodes[i],j=mapped(id,i),dest=g.nodes[j];if(!n.edges)continue;
  const edges=n.edges.map(e=>remapEdge(id,e));
  if(!dest.edges){dest.edges=edges;continue;}
  if(eq(dest.edges,edges))continue;
  // Existing expanded nodes have the same exact parent; retain the remote
  // action edge and keep any extra local alternate child via its parent.
  const byAction=new Map(dest.edges.map(e=>[e.action,e]));
  for(const e of edges){if(!byAction.has(e.action)){dest.edges.push(e);byAction.set(e.action,e);}else if(!eq(byAction.get(e.action),e)){metrics.edgeConflicts++;assert.equal(byAction.get(e.action).status,e.status,"Conflicting successor outcome");}}
 }
 g.cursor=g.nodes.findIndex(n=>!n.edges);if(g.cursor<0)g.cursor=g.nodes.length;
}
for(const k of ["attempts","careerResearch","templates","stagedPrefixes","repairedStages","sharedIndex","followThrough"]){
 same(base[k],local[k],"Unsupported local change "+k);out[k]=remote[k];
}
out.routes={...remote.routes};
for(const [id,r] of Object.entries(local.routes)){
 const sourceNode=mapped(r.sourceGraph,r.sourceNode),rid="MISSCAR:"+r.sourceGraph+":"+sourceNode,x={...r,sourceNode};
 if(out.routes[rid])same(out.routes[rid],x,"Route identity conflict");else{out.routes[rid]=x;if(id!==rid)metrics.remappedRoutes++;}
}
function remapRecord(r){const x={...r,node:mapped(r.graph,r.node)};if(r.to!=null)x.to=mapped(r.graph,r.to);return x;}
out.terminalResearch={...remote.terminalResearch,records:{...remote.terminalResearch.records},anchors:{...remote.terminalResearch.anchors}};
for(const [k,v] of Object.entries(local.terminalResearch.records)){
 if(eq(base.terminalResearch.records[k],v))continue;
 const x=remapRecord(v),aKey=key([x.graph,x.target]),rKey=key([aKey,x.node,x.attempt]);
 if(out.terminalResearch.records[rKey]){
  const old=out.terminalResearch.records[rKey];
  if(!eq(old,x)){
   assert(old.stateHash===x.stateHash&&old.to===x.to,"Nonidentical terminal attempt collision");
  }
 }else out.terminalResearch.records[rKey]=x;
 const localAnchor=local.terminalResearch.anchors[aKey],remoteAnchor=out.terminalResearch.anchors[aKey];
 if(localAnchor&&localAnchor.node===v.to&&(!remoteAnchor||remoteAnchor.status!=="CONDITIONAL_TARGET_RESEARCH_READY"&&localAnchor.status==="CONDITIONAL_TARGET_RESEARCH_READY"))out.terminalResearch.anchors[aKey]={...localAnchor,node:mapped(x.graph,localAnchor.node),attempts:Math.max(localAnchor.attempts,remoteAnchor?.attempts||0)};
}
out.terminalSupply={...remote.terminalSupply,front:{...remote.terminalSupply.front}};
for(const k of ["plans","records","attempted","resourceResearch"])same(base.terminalSupply[k],local.terminalSupply[k],"Unexpected local supply edits");
for(const r of Object.values(local.terminalSupply.front)){const x=remapRecord(r);out.terminalSupply.front[key([x.graph,x.node,x.target])]=x;}
const seeds=new Map(remote.chainSeeds.map(r=>[r.id+"|"+r.node,r]));
for(const r of local.chainSeeds){const x={...r,node:mapped(r.id,r.node)};seeds.set(x.id+"|"+x.node,x);}out.chainSeeds=[...seeds.values()];
out.endStage={...local.endStage,records:{...remote.endStage.records},research:{...remote.endStage.research}};
for(const r of Object.values(local.endStage.records)){const x=remapRecord(r);out.endStage.records[key([x.graph,x.node,x.target])]=x;}
for(const r of Object.values(local.endStage.research)){
 const x=remapRecord(r);if(r.outcomes)x.outcomes=r.outcomes.map(e=>remapEdge(r.graph,e));
 out.endStage.research[key([x.graph,x.node,x.target,x.action])]=x;
}
out.resetRecovery={...local.resetRecovery,records:{}};
for(const r of Object.values(local.resetRecovery.records)){
 const x=remapRecord(r);
 if(r.resetAncestor!=null)x.resetAncestor=mapped(r.graph,r.resetAncestor);
 if(r.researchNode!=null)x.researchNode=mapped(r.graph,r.researchNode);
 x.outcomes=r.outcomes.map(e=>remapEdge(r.graph,e));
 out.resetRecovery.records[key([x.graph,x.node,x.target,x.action])]=x;
}
out.sourceGraphSha256=key(out.graphs);
out.traitSchedule={...local.traitSchedule,clock:Math.max(remote.traitSchedule.clock,local.traitSchedule.clock),batches:Math.max(remote.traitSchedule.batches,local.traitSchedule.batches),turns:{...remote.traitSchedule.turns,...local.traitSchedule.turns}};
// The builder regenerates both action tries, summaries and all route records.
fs.writeFileSync(path+".tmp",gzipSync(JSON.stringify(out)));fs.renameSync(path+".tmp",path);
fs.writeFileSync(registry+".tmp",raw(arg("remote"),registry));fs.renameSync(registry+".tmp",registry);
console.log(JSON.stringify({metrics,remoteRoutes:Object.keys(remote.routes).length,localRoutes:Object.keys(local.routes).length,combinedRoutes:Object.keys(out.routes).length,states:Object.values(out.graphs).reduce((s,g)=>s+g.nodes.length,0)}));
