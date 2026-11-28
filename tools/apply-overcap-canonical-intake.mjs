// Apply a produced intake patch to an isolated staging ledger.
// Never modifies the public registry or existing public archives.
// Regenerate the patch if main's graph or either trie prefix has changed.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
const body=process.argv.find(a=>a.startsWith("--body="))?.slice(7)||"CHORT";
assert(/^[A-Z0-9_]+$/.test(body));
const read=p=>JSON.parse(fs.readFileSync(p));
const bytes=p=>fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:256*1024*1024});
const decode=p=>JSON.parse(gunzipSync(bytes(p)));
const name="soldier-population-missing-origin-career";
const baseStage=process.argv.find(a=>a.startsWith("--base-stage="))?.slice(13)||null;
assert(baseStage===null||/^[A-Z0-9_]+$/.test(baseStage)&&baseStage!==body);
const base=baseStage?"tools/data/overcap-intake-stage-"+baseStage+"/":"public/data/";
const ledger=decode(base+name+".json.gz"),index=decode(base+name+"-index.json.gz");
const patch=read("tools/data/overcap-canonical-graph-patch-"+body+".json");
assert.equal(patch.schema,"ATLAS_OVERCAP_CANONICAL_GRAPH_PATCH_V1");
assert.equal(ledger.sourceMetadataSha256,patch.sourceMetadataSha256);
assert.equal(ledger.schema,patch.baseLedgerSchema);
assert.equal(key(ledger.graphs),patch.baseGraphHash);
assert.equal(ledger.sourceGraphSha256,patch.baseGraphHash);
assert.equal(index.sourceGraphSha256,patch.baseGraphHash);
assert.equal(index.nodes.length,patch.baseTrie.researchCount);assert.equal(key(index.nodes),patch.baseTrie.researchHash);
assert.equal(index.actionNodes.length,patch.baseTrie.actionCount);assert.equal(key(index.actionNodes),patch.baseTrie.actionHash);
assert.equal(key(index.nodes),key(ledger.nodes));assert.equal(key(index.actionNodes),key(ledger.actionNodes));
assert.equal(key(index.routes),key(ledger.indexRoutes));
assert.equal(patch.errors.length,0,"Intake has unresolved replay errors");
assert.equal(patch.summary.officialFinal,0);
const before={graphs:Object.keys(ledger.graphs).length,routes:Object.keys(ledger.routes).length,states:Object.values(ledger.graphs).reduce((s,g)=>s+g.nodes.length,0),researchNodes:ledger.nodes.length,actionNodes:ledger.actionNodes.length};
const oldRouteHash=key(ledger.routes),oldIndexHash=key(index.routes);
const graphs={...ledger.graphs},routes={...ledger.routes},indexRoutes={...index.routes};
for(const [id,c] of Object.entries(patch.graphChanges)){
 const old=graphs[id],g=c.graph;
 assert.equal(id,key([g.origin,g.branch,g.birthActions]));
 assert.equal(old?key(old):null,c.priorGraphHash);
 if(old){const {nodes:oldNodes,...oldHead}=old,{nodes:newNodes,...newHead}=g;assert.deepEqual(newHead,oldHead);assert.deepEqual(newNodes.slice(0,oldNodes.length),oldNodes);}
 assert.equal(g.nodes[0].parent,null);assert.equal(g.nodes[0].stateHash,g.rootStateHash);
 for(let i=1;i<g.nodes.length;i++)assert(Number.isInteger(g.nodes[i].parent)&&g.nodes[i].parent>=0&&g.nodes[i].parent<i);
 graphs[id]=g;
}
const appendTrie=(base,delta)=>{
 const a=base.slice(),seen=new Set(base.slice(1).map(n=>key([n.parent,n.action])));
 for(const n of delta){assert(Number.isInteger(n.parent)&&n.parent>=0&&n.parent<a.length);const h=key([n.parent,n.action]);assert(!seen.has(h),"Duplicate appended trie node");seen.add(h);a.push(n);}
 return a;
};
const nodes=appendTrie(index.nodes,patch.researchNodes),actionNodes=appendTrie(index.actionNodes,patch.actionNodes);
function sequence(trie,i){const a=[];while(i){const n=trie[i];assert(n&&n.parent<i);a.push(n.action);i=n.parent;}return a.reverse();}
function graphSequence(g,i){const a=[];while(i){const n=g.nodes[i];assert(n&&n.parent<i);a.push(n.steps);i=n.parent;}return [...g.birthActions,...a.reverse().flat()];}
const kinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
assert.deepEqual(Object.keys(patch.routes).sort(),Object.keys(patch.indexRoutes).sort());
for(const [id,r] of Object.entries(patch.routes)){
 assert(!routes[id]&&!indexRoutes[id],"Existing route collision "+id);
 const ix=patch.indexRoutes[id],g=graphs[r.sourceGraph],n=g?.nodes[r.sourceNode];assert(g&&n);
 assert.equal(id,"MISSCAR:"+r.sourceGraph+":"+r.sourceNode);assert.equal(r.canonicalStateHash,n.stateHash);
 assert.equal(ix.sourceGraph,r.sourceGraph);assert.equal(ix.sourceNode,r.sourceNode);
 const a=graphSequence(g,r.sourceNode);assert.equal(a.length,ix.actionCount);
 assert.equal(key(a),r.fullActionHash);assert.equal(ix.fullActionHash,r.fullActionHash);
 assert.deepEqual(sequence(actionNodes,ix.fullPrefix),a);
 assert.deepEqual(sequence(nodes,ix.prefix),a.filter(x=>kinds.has(x.type)));
 assert.deepEqual(r.permanentVector,n.permanentVector);assert.deepEqual(r.permanentCapVector,n.permanentCapVector);
 assert.deepEqual(r.traitEvidence.retained,n.traits);assert.equal(r.actualGameCertified,false);
 routes[id]=r;indexRoutes[id]=ix;
}
const terminalRecords={...ledger.terminalResearch.records},anchors={...ledger.terminalResearch.anchors};
for(const [id,r] of Object.entries(patch.terminalRecords)){
 assert(!terminalRecords[id]);assert.equal(r.status,"CONDITIONAL_TARGET_RESEARCH_READY");
 assert(graphs[r.graph]?.nodes[r.to]);assert.equal(r.node,r.to);
 terminalRecords[id]=r;
 const ak=key([r.graph,r.target]),old=anchors[ak];
 if(!old||old.status!=="CONDITIONAL_TARGET_RESEARCH_READY")anchors[ak]={node:r.to,attempts:r.attempt,status:r.status,roundToken:r.roundToken};
}
for(const r of patch.receipts){
 assert.equal(r.officialFinal,false);assert.equal(routes[r.routeId]?.fullActionHash,r.actionHash);assert.equal(routes[r.routeId]?.canonicalStateHash,r.stateHash);
 assert.equal(r.replayedScope.closed,true);assert.deepEqual(r.material.violations,[]);
}
assert.equal(key(ledger.routes),oldRouteHash);assert.equal(key(index.routes),oldIndexHash);
const sourceGraphSha256=key(graphs),terminalResearch={...ledger.terminalResearch,records:terminalRecords,anchors};
terminalResearch.attempts=Object.keys(terminalRecords).length;
terminalResearch.advanced=Object.values(terminalRecords).filter(r=>r.suffixHash).length;
terminalResearch.ready=Object.values(anchors).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY").length;
terminalResearch.partial=Object.values(anchors).filter(r=>r.status==="CONDITIONAL_TARGET_PARTIAL").length;
terminalResearch.unresolved=Object.keys(anchors).length-terminalResearch.ready-terminalResearch.partial;
const states=Object.values(graphs).reduce((s,g)=>s+g.nodes.length,0),origins=new Set(Object.values(graphs).map(g=>g.origin));
const after={graphs:Object.keys(graphs).length,routes:Object.keys(routes).length,states,researchNodes:nodes.length,actionNodes:actionNodes.length};
const summary={...ledger.summary,births:after.graphs,states,processed:Object.values(graphs).reduce((s,g)=>s+g.nodes.filter(n=>n.edges!==null).length,0),published:after.routes,sharedOrigins:origins.size,sharedPairs:new Set(Object.values(graphs).map(g=>g.origin+"|"+g.branch)).size,coveredOrigins:ledger.targets.filter(k=>origins.has(k)).length,missingOrigins:ledger.targets.filter(k=>!origins.has(k)),terminalResearch:{...ledger.summary.terminalResearch,attempts:terminalResearch.attempts,advanced:terminalResearch.advanced,ready:terminalResearch.ready,partial:terminalResearch.partial,unresolved:terminalResearch.unresolved},overcapCanonicalIntake:{schema:patch.schema,baseGraphHash:patch.baseGraphHash,patchHash:key(patch),...patch.summary,officialFinal:0,scope:"Staged graph only; current v.o2 finite material migration and official final gate required."}};
const out={...ledger,sourceGraphSha256,graphs,routes,nodes,actionNodes,indexRoutes,terminalResearch,summary};
const ix={...index,sourceGraphSha256,nodes,actionNodes,routes:indexRoutes};
const stage=path.join("tools","data","overcap-intake-stage-"+body);
fs.mkdirSync(stage,{recursive:true});
for(const [file,value] of [[name+".json.gz",out],[name+"-index.json.gz",ix]]){
 const p=path.join(stage,file);fs.writeFileSync(p+".tmp",gzipSync(JSON.stringify(value)));fs.renameSync(p+".tmp",p);
}
const receipt={schema:"ATLAS_OVERCAP_STAGED_GRAPH_INTAKE_V1",sourceMetadataSha256:patch.sourceMetadataSha256,baseGraphHash:patch.baseGraphHash,baseStage,sourceGraphSha256,patchHash:key(patch),before,after,added:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]])),replayedEndpoints:patch.receipts.map(r=>r.routeId),publicRegistryChanged:false,officialFinal:0,materialPolicy:"V.O2_INDEXED_FINITE_POOLS",stagedFiles:[name+".json.gz",name+"-index.json.gz"],blocker:"Official publication must use a current v.o2 material policy and successor-closure gate; do not publish these staged files alone."};
fs.writeFileSync("tools/data/overcap-staged-intake-receipt-"+body+".json",JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt,null,2));
