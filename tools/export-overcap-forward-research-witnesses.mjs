import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {replayForwardNode} from "./atlas-overcap-forward-research.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex"),stem="tools/data/overcap-forward-research-v1";
const bytes=fs.readFileSync(stem+".json.gz"),summary=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8")),graph=JSON.parse(gunzipSync(bytes));
assert.equal(sha(bytes),summary.artifactSha256);
const rules=fs.readFileSync("public/data/soldiers-modern-index.json");
assert.equal(sha(rules),graph.inputs.rulesSha256);
for(const [p,h] of Object.entries(graph.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const data=JSON.parse(rules);
const initial=graph.edges.filter(e=>e.from===0);
assert.deepEqual(initial.map(e=>e.action),Object.values(graph.roots).map(id=>({type:"research",id})));
const witnesses=[];
for(const [label,root] of Object.entries(graph.roots)){
 const candidates=graph.nodes.filter(n=>n.firstRoot===root&&!n.pendingFree).sort((a,b)=>b.researchDepth-a.researchDepth||b.researched.length-a.researched.length||a.id-b.id);
 const n=candidates[0],w=replayForwardNode(data,graph,n.id);
 const path=w.actions.slice(1).map((action,i)=>({action,evidence:w.evidence[i]}));
 witnesses.push({label,root,nodeId:n.id,stateHash:w.stateHash,labDepth:n.researchDepth,actions:w.actions,path,completedResearch:n.researched,disabledResearch:n.disabled,nextLab:w.next.choices.filter(x=>["research","repeatResearch"].includes(x.action.type)),nextFree:w.next.choices.filter(x=>x.action.type==="freeResearch"),normalizationComplete:false,actualGameCertified:false});
}
const out={schema:"ATLAS_FORWARD_RESEARCH_WITNESSES_V1",graphSha256:summary.artifactSha256,sourceMetadataSha256:graph.sourceMetadataSha256,scope:"Representative deep conditional witnesses from the forward graph, not optimal or final paths.",witnesses};
fs.writeFileSync(stem+"-witnesses.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(witnesses.map(w=>({label:w.label,nodeId:w.nodeId,labDepth:w.labDepth,actions:w.actions.length,labOrder:w.actions.filter(a=>a.type==="research"||a.type==="repeatResearch").map(a=>a.id),nextLab:w.nextLab.length,completed:w.completedResearch.length})),null,2));
