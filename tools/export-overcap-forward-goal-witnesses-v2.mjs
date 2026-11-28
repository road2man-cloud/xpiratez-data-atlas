// Export full root-to-goal action sequences, including resource deltas.
// Shared-prefix cache avoids replaying a branch repeatedly. Each edge's
// stored evidence is checked against the current option list.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v2.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const goal=process.argv.find(x=>x.startsWith("--goal="))?.slice(7)||"STR_PERSONAL_LABS";
assert(/^STR_[A-Z0-9_]+$/.test(goal));
const stem="tools/data/overcap-forward-research-v2-goal-"+goal.toLowerCase(),sha=b=>createHash("sha256").update(b).digest("hex");
const b=fs.readFileSync(stem+".json.gz"),summary=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8")),g=JSON.parse(gunzipSync(b));
assert.equal(sha(b),summary.artifactSha256);assert.equal(g.schema,SCHEMA);assert.equal(g.goalRun.goal,goal);assert.deepEqual(g.inputs,summary.inputs);
const raw=fs.readFileSync("public/data/soldiers-modern-index.json"),supply=fs.readFileSync("tools/data/overcap-forward-supply-catalog-v2.json"),data=JSON.parse(raw);
data.forwardSupply=JSON.parse(supply);assert.equal(sha(raw),g.inputs.rulesSha256);assert.equal(sha(supply),g.inputs.supplySha256);
for(const [p,h] of Object.entries(g.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const engine=createForwardResearch(data,{maxMonth:g.budget.maxMonth}),initial=engine.start(),nodes=g.nodes,edges=g.edges;
assert.equal(exactStateHash(initial),nodes[0].stateHash);
assert.deepEqual(edges.filter(e=>e.from===0).map(e=>e.action),Object.values(g.roots).map(id=>({type:"research",id})));
const worlds=new Map([[0,initial]]),options=new Map();
function checkEdge(e,w){
 assert.equal(exactStateHash(w),nodes[e.from].stateHash);
 if(!options.has(e.from))options.set(e.from,engine.options(w,nodes[e.from].firstRoot).choices);
 assert(options.get(e.from).some(x=>key(x.action)===key(e.action)&&key(x.evidence)===key(e.evidence)),"Unavailable edge "+e.id);
 const r=engine.apply(w,e.action,nodes[e.from].firstRoot),next=r.world;
 assert.equal(exactStateHash(next),nodes[e.to].stateHash,"State mismatch "+e.id);
 worlds.set(e.to,next);
 return next;
}
function canonicalPath(id){
 const result=[],seen=new Set();let n=nodes[id];
 while(n.parent!=null){assert(!seen.has(n.id));seen.add(n.id);const e=edges[n.parent];assert(e.to===n.id&&e.from<n.id);result.push(e);n=nodes[e.from];}
 assert.equal(n.id,0);return result.reverse();
}
function row(e,w,next){
 const ids=new Set([...Object.keys(w.items),...Object.keys(next.items)]),itemChanges={};
 for(const id of ids){const from=Number(w.items[id]||0),to=Number(next.items[id]||0);if(from!==to)itemChanges[id]={before:from,after:to,delta:to-from};}
 return {edge:e.id,from:e.from,to:e.to,action:e.action,evidence:e.evidence,added:e.added,closed:e.closed,reopened:e.reopened,itemChanges,conditional:e.conditional,notes:e.notes,stateHash:nodes[e.to].stateHash};
}
const witnesses=[];
for(const r of g.goalRun.results){
 const path=[...canonicalPath(r.seed),...r.selected.map(id=>edges[id])];
 let w=initial,at=0;const steps=[];
 for(const e of path){assert.equal(e.from,at);const next=checkEdge(e,w);steps.push(row(e,w,next));w=next;at=e.to;}
 assert.equal(at,r.final);assert.equal(exactStateHash(w),r.finalStateHash);
 const reached=w.researched.has(goal)&&!w.disabled.has(goal);
 assert.equal(reached,r.status==="CONDITIONAL_GOAL_REACHED");
 const rule=data.researchRules[goal],facility=data.forwardSupply.facilities[goal];
 witnesses.push({root:r.root,goal,status:r.status,reason:r.reason,seed:r.seed,finalNode:r.final,stateHash:r.finalStateHash,initialAction:engine.init,steps,labOrder:steps.filter(s=>["research","repeatResearch"].includes(s.action.type)).map(s=>s.action.id),researchCount:w.researched.size,goalRequirements:{dependencies:rule.dependencies,requires:rule.requires,needItem:rule.needItem,requiresBaseFunc:rule.requiresBaseFunc},facilityIfAny:facility?{...facility,constructed:w.facilities.has(goal),missingFunctions:facility.requires.filter(f=>!w.baseFunctions.has(f))}:null,normalizationComplete:false,actualGameCertified:false});
}
const out={schema:"ATLAS_FORWARD_GOAL_WITNESSES_V2",goal,graphSha256:summary.artifactSha256,scope:"Conditional full campaign-start to goal witnesses. Not actual game certification, building completion, or all-path normalization.",witnesses};
fs.writeFileSync(stem+"-witnesses.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(witnesses.map(w=>({root:w.root,status:w.status,steps:w.steps.length,labDepth:w.labOrder.length,researchCount:w.researchCount,purchase:w.steps.filter(s=>s.action.type==="sourceBuySample").map(s=>s.action),sampleConsumption:w.steps.filter(s=>s.action.type==="research"&&data.researchRules[s.action.id]?.needItem).map(s=>({id:s.action.id,itemChanges:s.itemChanges})),facility:w.facilityIfAny})),null,2));
