// Sparse, resumable frontier expansion on the source-matched V3 graph.
// Candidate selection is a scheduling heuristic, never an unlock rule.
// Unmaterialized candidates are explicitly retained as an open frontier.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const phase=arg("phase","foundation"),rootArg=arg("root","ALL"),limit=Number(arg("steps","65"));
assert(["foundation","advanced"].includes(phase)&&Number.isSafeInteger(limit)&&limit>0&&limit<=100);
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],pairs=x=>Object.entries(x||{}),sort=x=>[...x].sort();
const source="tools/data/overcap-forward-research-v3-source-start",stem="tools/data/overcap-forward-research-v3-frontier";
const original=fs.readFileSync(source+".json.gz"),os=JSON.parse(fs.readFileSync(source+"-summary.json","utf8"));
assert.equal(sha(original),os.artifactSha256);
const schedulerSha256=sha(fs.readFileSync("tools/build-overcap-forward-frontier-v3.mjs","utf8").replace(/\r\n/g,"\n"));
let g=JSON.parse(gunzipSync(original));
if(process.argv.includes("--resume")){
 const b=fs.readFileSync(stem+".json.gz"),s=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8"));
 assert.equal(sha(b),s.artifactSha256);g=JSON.parse(gunzipSync(b));assert.equal(g.frontierProduction.baseSha256,sha(original));assert.equal(g.frontierProduction.schedulerSha256,schedulerSha256);
}else g.frontierProduction={baseSha256:sha(original),schedulerSha256,runs:[],frontiers:{},scope:"Deferred option lists contain candidates, not applied edges or certified paths."};
assert.equal(g.schema,SCHEMA);assert.deepEqual(g.inputs,os.inputs);
for(const [p,h] of pairs(g.inputs.files))assert.equal(sha(fs.readFileSync(p)),h,p);
for(const [p,h] of pairs(g.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const load=p=>JSON.parse(fs.readFileSync(p));
const data=load("public/data/soldiers-modern-index.json");
data.forwardSupply=load("tools/data/overcap-forward-supply-catalog-v2.json");data.forwardStartingBase=load("tools/data/overcap-forward-starting-base-v3.json");data.forwardJunk=load("tools/data/overcap-forward-junk-extraction-v3.json");
const rules=data.researchRules,catalog=data.forwardSupply,engine=createForwardResearch(data,{maxMonth:g.budget.maxMonth});
const nodes=g.nodes,edges=g.edges,roots=Object.values(g.roots),selectedRoots=roots.filter(r=>rootArg==="ALL"||r===rootArg);assert(selectedRoots.length);
const foundation=g.goals,advanced=[{kind:"research",id:"STR_ALIEN_ALLOYS"},{kind:"research",id:"STR_COMMUNICATIONS"},{kind:"research",id:"STR_CRAFT_AUXILARY_SYSTEMS"},{kind:"research",id:"STR_NECROPLANE_PARTS_RECYCLING"},{kind:"research",id:"STR_CONTACT_SHIP_JUNKYARD"},{kind:"facility",id:"STR_POWER_PLANT"},{kind:"facility",id:"STR_LIBRARY"},{kind:"research",id:"STR_SCHOOLING_2"}];
const goals=phase==="foundation"?foundation:advanced;
const wanted=new Set(),sampleTargets=new Set(),facilityTargets=new Set(),unlockers=new Map();
for(const [id,r] of pairs(rules))for(const k of arr(r.unlocks)){if(!unlockers.has(k))unlockers.set(k,[]);unlockers.get(k).push(id);}
function hint(id,depth=0){
 if(wanted.has(id)||!rules[id]||depth>30)return;wanted.add(id);const r=rules[id];
 // Zero-cost alternatives are scheduling hints only; their actual OR/AND
 // semantics are evaluated exclusively by the shared transition engine.
 for(const k of [...arr(r.dependencies),...arr(r.requires)])hint(k,depth+1);
 if(r.cost===0&&!r.needItem&&!arr(r.dependencies).length&&!arr(r.requires).length)for(const k of arr(unlockers.get(id)))hint(k,depth+1);
 if(r.needItem&&r.cost>0)sampleTargets.add(r.neededItem||id);
}
for(const t of goals){
 if(t.kind==="research")hint(t.id);
 else{facilityTargets.add(t.id);for(const k of catalog.facilities[t.id].research)hint(k);}
}
if(phase==="foundation"){for(const id of roots)hint(id);hint("STR_DATA_DISK_B");sampleTargets.add("STR_DATA_DISK");}
assert(wanted.size<2000);
const worlds=new Map([[0,engine.start()]]),seen=new Map(),outgoing=new Map();
for(const [i,n] of nodes.entries()){assert.equal(n.id,i);const k=key([n.firstRoot,n.stateHash]);assert(!seen.has(k));seen.set(k,i);}
assert.equal(nodes[0].stateHash,exactStateHash(worlds.get(0)));
for(const [i,e] of edges.entries()){assert.equal(e.id,i);if(!outgoing.has(e.from))outgoing.set(e.from,new Map());outgoing.get(e.from).set(key([e.action,e.evidence]),e);}
const initial=edges.filter(e=>e.from===0);assert.deepEqual(initial.map(e=>e.action),roots.map(id=>({type:"research",id})));
function worldAt(id){
 if(worlds.has(id))return worlds.get(id);
 const n=nodes[id],e=edges[n.parent];assert(e&&e.to===id&&e.from<id);
 const w=engine.apply(worldAt(e.from),e.action,nodes[e.from].firstRoot).world;
 assert.equal(exactStateHash(w),n.stateHash,"State mismatch "+id);worlds.set(id,w);return w;
}
function insert(w,root,parent,depth,researchDepth){
 const stateHash=exactStateHash(w),sig=key([root,stateHash]);if(seen.has(sig))return seen.get(sig);
 const id=nodes.length,n={id,firstRoot:root,parent,depth,researchDepth,stateHash,researched:sort(w.researched),disabled:sort(w.disabled),items:w.items,baseFunctions:sort(w.baseFunctions),facilities:sort(w.facilities),month:w.month,pendingFree:w.pendingFree||null,pendingDeliveries:arr(w.forwardDeliveries),status:"OPEN_UNEXPANDED"};
 nodes.push(n);worlds.set(id,w);seen.set(sig,id);return id;
}
const active=(n,id)=>n.researched.includes(id)&&!n.disabled.includes(id),reached=(n,t)=>t.kind==="facility"?n.facilities.includes(t.id):active(n,t.id);
const allGoals=n=>goals.every(t=>reached(n,t))&&!n.pendingFree&&!n.pendingDeliveries.length;
const sampleByItem=new Map();for(const k of wanted){const r=rules[k];if(r.needItem){const id=r.neededItem||k;if(!sampleByItem.has(id))sampleByItem.set(id,[]);sampleByItem.get(id).push(k);}}
const needed=(n,id)=>sampleTargets.has(id)&&!(n.items[id]>0)&&(arr(sampleByItem.get(id)).some(k=>!active(n,k))||id==="STR_DATA_DISK"&&!active(n,"STR_SUPER_STAPLER")&&!active(n,"STR_DATA_DISK_B")&&!n.items.STR_DATA_DISK_B);
const researchScore=(n,k)=>wanted.has(k)&&!active(n,k)&&!n.disabled.includes(k)?(goals.some(t=>t.id===k)?180:100):0;
function rank(n,opt){
 const a=opt.action,e=opt.evidence;
 if(n.pendingFree&&a.type==="freeResearch"){
  const r=rules[a.research],score=researchScore(n,a.research),item=r?.neededItem||a.research;
  // Prefer a needed, otherwise unavailable sample over research that
  // can already be performed using stock. Do not change RNG eligibility.
  const scarce=score>0&&r?.needItem&&!(n.items[item]>0)?2000:0;
  return 1000+score*10+scarce;
 }
 if(n.pendingDeliveries.length&&a.type==="sourceResearchDelivery")return 1000;
 if(a.type==="research")return researchScore(n,a.id);
 if(a.type==="eventResearch"||a.type==="missionResearch")return researchScore(n,a.research)*0.8;
 if(a.type==="sourceBuildFacility")return facilityTargets.has(a.id)&&!n.facilities.includes(a.id)?250:0;
 if(a.type==="sourceBuySample")return needed(n,a.id)?30:0;
 if(a.type==="sourceRandomManufacture")return Object.keys({...e.fixed,...e.random}).filter(k=>needed(n,k)).length*40;
 if(a.type==="sourceManufactureItem")return a.id==="STR_DATA_DISK_B"&&!active(n,"STR_SUPER_STAPLER")&&!n.items.STR_DATA_DISK_B&&!active(n,"STR_DATA_DISK_B")?95:Object.keys(e.outputs||{}).filter(k=>needed(n,k)).length*35;
 if(a.type==="sourceEventItems")return Object.keys(e.items||{}).filter(k=>needed(n,k)).length*25;
 return 0;
}
function materialize(n,w,opt){
 const k=key([opt.action,opt.evidence]);let map=outgoing.get(n.id);if(!map){map=new Map();outgoing.set(n.id,map);}
 if(map.has(k))return map.get(k);
 const r=engine.apply(w,opt.action,n.firstRoot),next=r.world,id=edges.length,to=insert(next,n.firstRoot,id,n.depth+1,n.researchDepth+Number(["research","repeatResearch"].includes(opt.action.type)));
 const e={id,from:n.id,to,action:opt.action,evidence:opt.evidence,added:sort([...next.researched].filter(k=>!w.researched.has(k))),closed:sort([...next.disabled].filter(k=>!w.disabled.has(k))),reopened:sort([...w.disabled].filter(k=>!next.disabled.has(k))),notes:r.notes,conditional:r.conditional};
 edges.push(e);map.set(k,e);return e;
}
const before={nodes:nodes.length,edges:edges.length};
for(const root of selectedRoots){
 const prior=[...g.frontierProduction.runs].reverse().find(r=>r.root===root&&r.phase===phase) || (phase==="advanced"?[...g.frontierProduction.runs].reverse().find(r=>r.root===root&&r.phase==="foundation"):null) || [...g.runs].reverse().find(r=>r.root===root);
 const seed=prior?.final??initial.find(e=>e.action.id===root).to;let n=nodes[seed];if(prior)assert.equal(n.stateHash,prior.finalStateHash);
 const selected=[],visited=new Set([seed]);let reason=null;
 for(let i=0;i<limit&&!allGoals(n);i++){
  const w=worldAt(n.id),{choices,unresolved}=engine.options(w,n.firstRoot);
  const ranked=choices.map((opt,i)=>({opt,i,p:rank(n,opt)})).filter(x=>x.p>0).sort((a,b)=>b.p-a.p||a.i-b.i);
  let next=null;
  for(const x of ranked){
   try{const e=materialize(n,w,x.opt);if(!visited.has(e.to)){next=e;break;}}
   catch(e){g.failed.push({from:n.id,action:x.opt.action,reason:e.message||String(e)});}
  }
  const known=outgoing.get(n.id)||new Map(),deferred=choices.filter(x=>!known.has(key([x.action,x.evidence])));
  if(n.status!=="EXPANDED"&&n.status!=="OPEN_NO_SUPPORTED_SUCCESSOR"){
   g.frontierProduction.frontiers[n.id]={stateHash:n.stateHash,offered:choices.length,materialized:choices.length-deferred.length,deferred,unresolved};
   n.status=deferred.length?"OPEN_PARTIAL":choices.length?"EXPANDED":"OPEN_NO_SUPPORTED_SUCCESSOR";
   n.outgoing=known.size;
  }
  if(!next){reason="NO_SUPPORTED_TARGET_PROGRESS_EDGE";break;}
  selected.push(next.id);n=nodes[next.to];visited.add(n.id);
 }
 if(!allGoals(n)&&!reason)reason="STEP_BUDGET";
 const run={phase,root,seed,final:n.id,finalStateHash:n.stateHash,selected,status:allGoals(n)?"CONDITIONAL_ALL_MILESTONES_REACHED":"OPEN",reason,milestones:goals.map(t=>({...t,reached:reached(n,t)})),missing:[...wanted].filter(k=>!active(n,k))};
 g.frontierProduction.runs.push(run);
 console.log(JSON.stringify({phase,root,status:run.status,reason,steps:selected.length,final:n.id,milestones:run.milestones,labDepth:n.researchDepth,actions:selected.map(id=>edges[id].action)}));
}
const byAction={};for(const e of edges)byAction[e.action.type]=(byAction[e.action.type]||0)+1;
g.summary={nodes:nodes.length,edges:edges.length,expanded:nodes.filter(n=>["EXPANDED","OPEN_NO_SUPPORTED_SUCCESSOR"].includes(n.status)).length,openPartial:nodes.filter(n=>n.status==="OPEN_PARTIAL").length,openUnexpanded:nodes.filter(n=>n.status==="OPEN_UNEXPANDED").length,distinctResearch:new Set(nodes.flatMap(n=>n.researched)).size,maxLabDepth:Math.max(...nodes.map(n=>n.researchDepth)),byAction,failed:g.failed.length,deferredOptions:Object.values(g.frontierProduction.frontiers).reduce((s,f)=>s+f.deferred.length,0)};
const out=gzipSync(JSON.stringify(g),{level:9}),report={schema:g.schema,artifact:stem+".json.gz",artifactSha256:sha(out),inputs:g.inputs,schedulerSha256,baseSha256:sha(original),previous:before,...g.summary,roots:g.roots,rootCursors:roots.map(root=>{const r=[...g.frontierProduction.runs].reverse().find(r=>r.root===root)||[...g.runs].reverse().find(r=>r.root===root);return r?{...r,labDepth:nodes[r.final].researchDepth,completedResearch:nodes[r.final].researched.length,baseFunctions:nodes[r.final].baseFunctions}:null;}),normalizationComplete:false,actualGameCertified:false};
fs.writeFileSync(stem+".json.gz.tmp",out);fs.writeFileSync(stem+"-summary.json.tmp",JSON.stringify(report,null,2)+"\n");
fs.renameSync(stem+".json.gz.tmp",stem+".json.gz");fs.renameSync(stem+"-summary.json.tmp",stem+"-summary.json");
console.log(JSON.stringify({...g.summary,artifactSha256:report.artifactSha256}));
