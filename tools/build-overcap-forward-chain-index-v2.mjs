// Single active checkpoint index for the accumulated forward graph.
// A cursor is an existing conditional graph state, not an admission receipt.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const label=process.argv.find(x=>x.startsWith("--label="))?.slice(8)||"foundation-d";
assert(/^[a-z0-9_-]+$/.test(label));
const stem="tools/data/overcap-forward-research-v2-chain-"+label,sha=b=>createHash("sha256").update(b).digest("hex");
const bytes=fs.readFileSync(stem+".json.gz"),summary=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8")),g=JSON.parse(gunzipSync(bytes));
assert.equal(sha(bytes),summary.artifactSha256);assert.deepEqual(g.summary, Object.fromEntries(Object.keys(g.summary).map(k=>[k,summary[k]])));
const allRuns=[...(g.goalRun?[g.goalRun]:[]),...(g.chainHistory||[]),g.chainRun];
const cursors=new Map(),history=[],goals=new Map();
for(const run of allRuns){
 assert(run&&Array.isArray(run.results));
 for(const x of run.results){
  const n=g.nodes[x.final];assert(n&&n.firstRoot===x.root&&n.stateHash===x.finalStateHash);
  const old=cursors.get(x.root);
  if(old)assert.equal(x.seed,old.finalNode,"Disconnected cumulative root cursor "+x.root);
  cursors.set(x.root,{root:x.root,finalNode:n.id,stateHash:n.stateHash,labDepth:n.researchDepth,completedResearch:n.researched.length,month:n.month,facilities:n.facilities,baseFunctions:n.baseFunctions,pendingFree:!!n.pendingFree,pendingDeliveries:n.pendingDeliveries.length,status:"CONDITIONAL_CURSOR",lastRun:run.label||run.goal});
  history.push({root:x.root,run:run.label||run.goal,seed:x.seed,finalNode:x.final,selectedEdges:x.selected.length,status:x.status,reason:x.reason});
 }
 for(const t of run.goals||[])goals.set(t.kind+":"+t.id,t);
 if(run.goal)goals.set("research:"+run.goal,{kind:"research",id:run.goal});
}
const roots=Object.entries(g.roots).map(([label,root])=>{
 const c=cursors.get(root);assert(c,"Missing root cursor "+root);
 const n=g.nodes[c.finalNode];const milestones=[...goals.values()].map(t=>({...t,reached:t.kind==="facility"?n.facilities.includes(t.id):n.researched.includes(t.id)&&!n.disabled.includes(t.id)}));
 return {...c,label,milestones};
});
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),catalog=JSON.parse(fs.readFileSync("tools/data/overcap-forward-supply-catalog-v2.json")),itemBytes=fs.readFileSync("public/data/items-v2-index.json"),items=new Map(JSON.parse(itemBytes).items.map(x=>[x.id,x]));
const openSamples=new Map();
for(const r of roots)for(const t of r.milestones.filter(t=>!t.reached&&t.kind==="research")){
 const n=g.nodes[r.finalNode],q=[t.id],seen=new Set();
 while(q.length){
  const id=q.shift();if(seen.has(id)||n.researched.includes(id)&&!n.disabled.includes(id))continue;seen.add(id);
  const rr=data.researchRules[id];if(!rr)continue;
  if(rr.needItem&&!Number(n.items[rr.neededItem||id]||0)){
   const item=rr.neededItem||id,s=data.itemSupply[item],i=items.get(item);
   const row=openSamples.get(item)||{item,research:id,koName:i?.koName||null,roots:[],itemIndexPresent:!!i,itemSupplyPresent:!!s,indexedPurchase:catalog.buys[item]||null,indexedRecipes:catalog.recipes.filter(x=>x.outputs[item]>0).map(x=>x.id),indexedFixedEvents:Object.values(catalog.events).filter(x=>x.fixed[item]>0).map(x=>x.id),itemFields:i?{costBuy:i.fields?.costBuy??null,requires:i.fields?.requires||[],requiresBuy:i.fields?.requiresBuy||[]}:null,sourceStatus:"OPEN_NOT_ACQUIRED"};
   if(!row.roots.includes(r.root))row.roots.push(r.root);openSamples.set(item,row);
  }
  q.push(...(rr.dependencies||[]),...(rr.requires||[]));
 }
}
const out={schema:"ATLAS_FORWARD_ACTIVE_CHECKPOINT_V2",graph:{baseArg:"chain-"+label,path:stem+".json.gz",summaryPath:stem+"-summary.json",sha256:summary.artifactSha256},sourceMetadataSha256:g.sourceMetadataSha256,inputs:g.inputs,itemIndexSha256:sha(itemBytes),counts:g.summary,rootCursors:roots,runHistory:history,openSampleSources:[...openSamples.values()],normalizationComplete:false,actualGameCertified:false,scope:"Development-only cumulative conditional graph. Not a final career admission receipt. Research and actual facility construction remain distinct."};
fs.writeFileSync("tools/data/overcap-forward-research-v2-active.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({graph:out.graph,roots:roots.map(r=>({label:r.label,node:r.finalNode,labDepth:r.labDepth,milestones:r.milestones})),openSampleSources:out.openSampleSources},null,2));
