// Export the actual selected edge sequences from the newly produced graph.
// No new research admission: graph edges already applied by V3 producer.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const stem="tools/data/overcap-forward-research-v3-source-start";
const sha=b=>createHash("sha256").update(b).digest("hex");
const bytes=fs.readFileSync(stem+".json.gz"),summary=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8")),g=JSON.parse(gunzipSync(bytes));
assert.equal(sha(bytes),summary.artifactSha256);
assert.equal(g.schema,"ATLAS_FORWARD_CAMPAIGN_RESEARCH_V3");assert.deepEqual(g.inputs,summary.inputs);
const nodes=g.nodes,edges=g.edges;
const witnesses=[];
for(const [label,root] of Object.entries(g.roots)){
 const runs=g.runs.filter(r=>r.root===root);
 if(!runs.length){witnesses.push({label,root,status:"OPEN_ROOT_NOT_YET_EXPANDED"});continue;}
 const first=edges.find(e=>e.from===0&&e.action.type==="research"&&e.action.id===root);
 assert(first);let at=first.to;const selected=[first.id];
 for(const r of runs){
  assert.equal(r.seed,at);
  for(const id of r.selected){const e=edges[id];assert.equal(e.from,at);selected.push(id);at=e.to;}
  assert.equal(at,r.final);assert.equal(nodes[at].stateHash,r.finalStateHash);
 }
 const steps=selected.map(id=>{
  const e=edges[id],a=nodes[e.from],b=nodes[e.to],itemChanges={};
  for(const k of new Set([...Object.keys(a.items),...Object.keys(b.items)])){
   const before=Number(a.items[k]||0),after=Number(b.items[k]||0);
   if(before!==after)itemChanges[k]={before,after,delta:after-before};
  }
  return {edge:id,from:e.from,to:e.to,action:e.action,evidence:e.evidence,added:e.added,closed:e.closed,itemChanges,newFunctions:b.baseFunctions.filter(k=>!a.baseFunctions.includes(k)),newFacilities:b.facilities.filter(k=>!a.facilities.includes(k)),conditional:e.conditional,notes:e.notes};
 });
 const n=nodes[at],r=runs.at(-1);
 witnesses.push({label,root,status:r.status,reason:r.reason,finalNode:at,stateHash:n.stateHash,labDepth:n.researchDepth,researchCount:n.researched.length,baseFunctions:n.baseFunctions,milestones:r.milestones,steps,normalizationComplete:false,actualGameCertified:false});
}
const out={schema:"ATLAS_FORWARD_SOURCE_START_WITNESSES_V3",graphSha256:summary.artifactSha256,initialAction:g.initialAction,witnesses,scope:"Selected generated paths from source-matched base. Conditional RNG, construction, timing and economy; not an all-path normalization certificate."};
fs.writeFileSync(stem+"-witnesses.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(witnesses.map(w=>({root:w.root,status:w.status,finalNode:w.finalNode,labDepth:w.labDepth,researchCount:w.researchCount,steps:w.steps?.length,random:w.steps?.filter(s=>s.action.type==="sourceRandomManufacture"||s.action.type==="freeResearch"&&s.action.assumeOutcome).map(s=>({action:s.action,evidence:s.action.type==="sourceRandomManufacture"?s.evidence:{choices:s.evidence.choices.length},itemChanges:s.itemChanges})),milestones:w.milestones})),null,2));
