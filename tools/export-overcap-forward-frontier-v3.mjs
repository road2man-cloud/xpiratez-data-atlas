// Publish selected V3 campaign witnesses and source-bound open milestones.
// Neither unmaterialized choices nor unreachable research flags are certified.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const stem="tools/data/overcap-forward-research-v3-frontier";
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],load=p=>JSON.parse(fs.readFileSync(p));
const bytes=fs.readFileSync(stem+".json.gz"),summary=load(stem+"-summary.json"),g=JSON.parse(gunzipSync(bytes));
assert.equal(sha(bytes),summary.artifactSha256);
assert.equal(g.schema,"ATLAS_FORWARD_CAMPAIGN_RESEARCH_V3");
assert.deepEqual(g.inputs,summary.inputs);
assert.equal(g.frontierProduction.schedulerSha256,summary.schedulerSha256);
for(const [p,h] of Object.entries(g.inputs.files))assert.equal(sha(fs.readFileSync(p)),h,p);
for(const [p,h] of Object.entries(g.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
assert.equal(sha(fs.readFileSync("tools/build-overcap-forward-frontier-v3.mjs","utf8").replace(/\r\n/g,"\n")),summary.schedulerSha256);
const data=load("public/data/soldiers-modern-index.json"),supply=load("tools/data/overcap-forward-supply-catalog-v2.json"),sampleBytes=fs.readFileSync("tools/data/overcap-forward-sample-source-index-v3.json"),samples=JSON.parse(sampleBytes);
assert.equal(samples.sourceMetadataSha256,data.meta.source.metadataSha256);
const nodes=g.nodes,edges=g.edges,rules=data.researchRules;
const active=(n,k)=>n.researched.includes(k)&&!n.disabled.includes(k);
const unlockers=new Map();
for(const [id,r] of Object.entries(rules))for(const t of arr(r.unlocks)){if(!unlockers.has(t))unlockers.set(t,[]);unlockers.get(t).push(id);}
function blocker(n,id){
 const r=rules[id];if(!r)return {id,status:"RULE_NOT_INDEXED"};
 const item=r.neededItem||id,s=samples.research[id],sources=samples.items[item];
 return {id,cost:r.cost,reached:active(n,id),disabled:n.disabled.includes(id),missingDependencies:arr(r.dependencies).filter(k=>!active(n,k)),missingRequires:arr(r.requires).filter(k=>!active(n,k)),missingFunctions:arr(r.requiresBaseFunc).filter(k=>!n.baseFunctions.includes(k)),explicitUnlockSources:arr(unlockers.get(id)),sample:r.needItem?{id:item,held:Number(n.items[item]||0),destroyItem:r.destroyItem,sourceIndexPresent:!!sources,candidates:sources?{purchase:sources.purchase,manufacture:arr(sources.manufacture).map(x=>({id:x.id,kind:x.kind,requires:x.requires,functions:x.functions})),events:arr(sources.events).map(x=>({event:x.event,kind:x.kind,scripts:x.scripts})),mapSourceCount:sources.legacyMapLoot?.sourceCount||0,researchGrants:arr(sources.researchItemGrants).map(x=>({source:x.source||x.research,kind:x.kind})),freeResearchSources:arr(s?.alternativeResearchAwards).map(x=>({source:x.source,kind:x.kind,guard:x.guard||null}))}:null}:null};
}
function target(n,t){
 const f=t.kind==="facility"?supply.facilities[t.id]:null;
 const reached=f?n.facilities.includes(t.id):active(n,t.id);
 const b=blocker(n,t.id);
 return {...t,reached,missingFacilityFunctions:f?arr(f.requires).filter(k=>!n.baseFunctions.includes(k)):[],missingFacilityResearch:f?arr(f.research).filter(k=>!active(n,k)):[],directResearch:b,immediatePrerequisites:reached?[]:[...new Set([...b.missingDependencies||[],...b.missingRequires||[]])].map(k=>blocker(n,k))};
}
const witnesses=[],allRuns=[...g.runs,...g.frontierProduction.runs];
for(const [label,root] of Object.entries(g.roots)){
 const first=edges.find(e=>e.from===0&&e.action.type==="research"&&e.action.id===root);assert(first);
 const runs=allRuns.filter(r=>r.root===root);
 let at=first.to;const selected=[first.id],milestoneHistory=[];
 for(const r of runs){
  assert.equal(r.seed,at,"Disconnected cursor "+root);
  for(const id of r.selected){const e=edges[id];assert.equal(e.id,id);assert.equal(e.from,at);assert.equal(nodes[e.to].firstRoot,root);selected.push(id);at=e.to;}
  assert.equal(at,r.final);assert.equal(nodes[at].stateHash,r.finalStateHash);
  milestoneHistory.push({phase:r.phase||"foundation",status:r.status,finalNode:at,throughStep:selected.length,milestones:r.milestones,reason:r.reason});
 }
 const steps=selected.map(id=>{
  const e=edges[id],a=nodes[e.from],b=nodes[e.to],itemChanges={};
  for(const k of new Set([...Object.keys(a.items),...Object.keys(b.items)])){
   const before=Number(a.items[k]||0),after=Number(b.items[k]||0);if(before!==after)itemChanges[k]={before,after,delta:after-before};
  }
  return {edge:id,from:e.from,to:e.to,action:e.action,evidence:e.evidence,added:e.added,closed:e.closed,reopened:e.reopened,itemChanges,newFunctions:b.baseFunctions.filter(k=>!a.baseFunctions.includes(k)),newFacilities:b.facilities.filter(k=>!a.facilities.includes(k)),conditional:e.conditional,notes:e.notes,stateHash:b.stateHash};
 });
 const n=nodes[at],latest=runs.at(-1);
 const frontier=g.frontierProduction.frontiers[at];
 const goals=[...g.goals,...(latest?.phase==="advanced"?latest.milestones.map(x=>({kind:x.kind,id:x.id})):[])];
 witnesses.push({label,root,finalNode:at,stateHash:n.stateHash,labDepth:n.researchDepth,researchCount:n.researched.length,baseFunctions:n.baseFunctions,facilities:n.facilities,remainingJunk:Number(n.items.STR_JUNK_PILE||0),milestoneHistory,targets:goals.map(t=>target(n,t)),frontier:frontier?{offered:frontier.offered,materialized:frontier.materialized,deferred:frontier.deferred.length}:null,steps,normalizationComplete:false,actualGameCertified:false});
}
const out={schema:"ATLAS_FORWARD_FRONTIER_WITNESSES_V3",graphSha256:summary.artifactSha256,sampleSourceSha256:sha(sampleBytes),initialAction:g.initialAction,witnesses,scope:"Root-to-cursor selected graph edges, plus immediate open conditions. Deferred alternatives and acquisition candidates remain unexecuted. All construction/RNG/time/economy assumptions remain conditional."};
fs.writeFileSync(stem+"-witnesses.json",JSON.stringify(out,null,2)+"\n");
const activeIndex={schema:"ATLAS_FORWARD_ACTIVE_CHECKPOINT_V3",graph:{path:stem+".json.gz",summary:stem+"-summary.json",witnesses:stem+"-witnesses.json",sha256:summary.artifactSha256},sourceMetadataSha256:g.sourceMetadataSha256,inputs:g.inputs,schedulerSha256:summary.schedulerSha256,counts:g.summary,rootCursors:witnesses.map(w=>({root:w.root,label:w.label,finalNode:w.finalNode,stateHash:w.stateHash,labDepth:w.labDepth,researchCount:w.researchCount,remainingJunk:w.remainingJunk,targets:w.targets.map(t=>({kind:t.kind,id:t.id,reached:t.reached})),nextFrontier:w.frontier})),normalizationComplete:false,actualGameCertified:false};
fs.writeFileSync("tools/data/overcap-forward-research-v3-active.json",JSON.stringify(activeIndex,null,2)+"\n");
console.log(JSON.stringify({rootCursors:activeIndex.rootCursors,counts:g.summary},null,2));
