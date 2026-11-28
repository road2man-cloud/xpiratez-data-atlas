// Independent V3 graph production from verified startingBase. All generated
// choices are kept; target hints only schedule which successor to expand.
// No V2 world, legacy action sequence, or arbitrary external input is reused.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
import {START_RESEARCH} from "./atlas-overcap-rooted-early-research.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const rootArg=arg("root","ALL"),steps=Number(arg("steps","36")),resume=process.argv.includes("--resume");
assert(Number.isSafeInteger(steps)&&steps>0&&steps<=100);
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort(),pairs=x=>Object.entries(x||{});
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json"};
const inputBytes=Object.fromEntries(pairs(files).map(([k,p])=>[k,fs.readFileSync(p)]));
const data=JSON.parse(inputBytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(inputBytes[k]);
const engineFiles=["tools/build-overcap-forward-source-start-v3.mjs","tools/atlas-overcap-forward-research-v3.mjs","tools/atlas-overcap-forward-supply-v2.mjs","tools/atlas-overcap-forward-purchase-gate-v3.mjs","tools/atlas-overcap-rooted-early-research.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","tools/population-research-career-core.mjs","public/soldiers/modern/origin-witness.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/event-chronology.js","public/soldiers/modern/auto-zero-cascade.js","public/soldiers/modern/eligibility.js","public/soldiers/modern/origin-campaign-context.js"];
const inputs={files:Object.fromEntries(pairs(files).map(([k,p])=>[p,sha(inputBytes[k])])),engineFiles:Object.fromEntries(engineFiles.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])),nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz"))};
const rules=data.researchRules,catalog=data.forwardSupply,engine=createForwardResearch(data,{maxMonth:12});
const roots=Object.values(START_RESEARCH),selectedRoots=roots.filter(k=>rootArg==="ALL"||rootArg===k);assert(selectedRoots.length);
const goals=[{kind:"facility",id:"STR_PERSONAL_LABS"},{kind:"research",id:"STR_ELERIUM_115"},{kind:"facility",id:"STR_WORKSHOP"}];
const wanted=new Set(),sampleTargets=new Set();
function hint(id){if(wanted.has(id)||!rules[id])return;wanted.add(id);const r=rules[id];for(const k of [...arr(r.dependencies),...arr(r.requires)])hint(k);if(r.needItem)sampleTargets.add(r.neededItem||id);}
for(const t of goals)if(t.kind==="research")hint(t.id);else for(const k of catalog.facilities[t.id].research)hint(k);
// The raw recipe and free-research pool provide two distinct acquisition
// paths: guild corpse from junk, super stapler from decoded data disc.
// These are hints, not grants. The engine must generate each exact edge.
assert(rules.STR_DATA_DISK_B.getOneFree.includes("STR_SUPER_STAPLER"));
assert(data.forwardJunk.recipe.outcomes.some(o=>o.items.STR_GUILD_CORPSE>0));
hint("STR_DATA_DISK_B");hint("STR_SCHOOLING_1");sampleTargets.add("STR_DATA_DISK");
const stem="tools/data/overcap-forward-research-v3-source-start";
let g={schema:SCHEMA,sourceMetadataSha256:data.meta.source.metadataSha256,roots:START_RESEARCH,initialAction:engine.init,inputs,budget:{maxMonth:12},nodes:[],edges:[],failed:[],unsupported:{},runs:[],goals,normalizationComplete:false,actualGameCertified:false,scope:"Independent source-start V3 conditional graph; all options at expanded nodes, goal-prioritized exploration. Exact time/funds/base space and RNG not certified."};
if(resume){const b=fs.readFileSync(stem+".json.gz"),s=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8"));assert.equal(sha(b),s.artifactSha256);g=JSON.parse(gunzipSync(b));assert.equal(g.schema,SCHEMA);assert.deepEqual(g.inputs,inputs);assert.deepEqual(g.goals,goals);}
const nodes=g.nodes,edges=g.edges,worlds=new Map([[0,engine.start()]]),seen=new Map(),outgoing=new Map();
function insert(w,root,parent,depth,researchDepth){
 const stateHash=exactStateHash(w),sig=key([root,stateHash]);if(seen.has(sig))return seen.get(sig);
 const id=nodes.length,n={id,firstRoot:root,parent,depth,researchDepth,stateHash,researched:sort(w.researched),disabled:sort(w.disabled),items:w.items,baseFunctions:sort(w.baseFunctions),facilities:sort(w.facilities),month:w.month,pendingFree:w.pendingFree||null,pendingDeliveries:arr(w.forwardDeliveries),status:"OPEN_UNEXPANDED"};
 nodes.push(n);worlds.set(id,w);seen.set(sig,id);return id;
}
if(!nodes.length)insert(worlds.get(0),null,null,0,0);
for(const [i,n] of nodes.entries()){assert.equal(n.id,i);const k=key([n.firstRoot,n.stateHash]);assert(!seen.has(k)||seen.get(k)===i);seen.set(k,i);}
assert.equal(nodes[0].stateHash,exactStateHash(worlds.get(0)));
for(const [i,e] of edges.entries()){assert.equal(e.id,i);if(!outgoing.has(e.from))outgoing.set(e.from,[]);outgoing.get(e.from).push(e);}
function worldAt(id){
 if(worlds.has(id))return worlds.get(id);
 const n=nodes[id],e=edges[n.parent];assert(e&&e.to===id&&e.from<id);
 const w=engine.apply(worldAt(e.from),e.action,nodes[e.from].firstRoot).world;
 assert.equal(exactStateHash(w),n.stateHash,"State mismatch "+id);worlds.set(id,w);return w;
}
function expand(n){
 if(n.status!=="OPEN_UNEXPANDED")return outgoing.get(n.id)||[];
 const w=worldAt(n.id),{choices,unresolved}=engine.options(w,n.firstRoot);
 n.unresolved=unresolved;for(const u of unresolved)g.unsupported[u.kind]=(g.unsupported[u.kind]||0)+1;
 const results=[];
 for(const {action,evidence} of choices){
  try{
   const r=engine.apply(w,action,n.firstRoot),next=r.world,id=edges.length,root=n.firstRoot||action.id;
   assert(roots.includes(root));
   const to=insert(next,root,id,n.depth+1,n.researchDepth+Number(["research","repeatResearch"].includes(action.type)));
   const e={id,from:n.id,to,action,evidence,added:sort([...next.researched].filter(k=>!w.researched.has(k))),closed:sort([...next.disabled].filter(k=>!w.disabled.has(k))),reopened:sort([...w.disabled].filter(k=>!next.disabled.has(k))),notes:r.notes,conditional:r.conditional};
   edges.push(e);results.push(e);
  }catch(e){g.failed.push({from:n.id,action,reason:e.message||String(e)});}
 }
 outgoing.set(n.id,results);n.status=results.length?"EXPANDED":"OPEN_NO_SUPPORTED_SUCCESSOR";n.outgoing=results.length;n.rejected=choices.length-results.length;return results;
}
const initial=expand(nodes[0]);assert.deepEqual(initial.map(e=>e.action),roots.map(id=>({type:"research",id})));
const active=(n,k)=>n.researched.includes(k)&&!n.disabled.includes(k);
const reached=(n,t)=>t.kind==="facility"?n.facilities.includes(t.id):active(n,t.id);
const allGoals=n=>goals.every(t=>reached(n,t))&&!n.pendingFree&&!n.pendingDeliveries.length;
function progress(n){
 let p=0;for(const k of wanted)if(active(n,k))p+=100;
 for(const t of goals)if(reached(n,t))p+=250;
 for(const id of sampleTargets){
  const needs=[...wanted].some(k=>rules[k]?.needItem&&(rules[k].neededItem||k)===id&&!active(n,k))||(id==="STR_DATA_DISK"&&!active(n,"STR_SUPER_STAPLER")&&!active(n,"STR_DATA_DISK_B")&&!n.items.STR_DATA_DISK_B);
  if(needs){if(n.items[id]>0)p+=35;else if(n.pendingDeliveries.some(d=>d.item===id))p+=15;}
 }
 return p;
}
function priority(n,e){
 const dest=nodes[e.to],a=e.action,p=progress(dest)-progress(n);
 if(allGoals(dest))return 1e9;
 if(n.pendingFree&&a.type==="freeResearch")return 20000+p*100;
 if(n.pendingDeliveries.length&&a.type==="sourceResearchDelivery")return 20000+p*100;
 if(dest.pendingFree&&wanted.has(dest.pendingFree.source))return 10000+p*100;
 if(a.type==="sourceManufactureItem"&&a.id==="STR_DATA_DISK_B"&&!active(n,"STR_SUPER_STAPLER")&&!n.items.STR_DATA_DISK_B)return 5000+p*100;
 if(p<=0)return -Infinity;
 return p*100+(a.type==="research"?40:0)+(a.type==="sourceRandomManufacture"?20:0);
}
for(const root of selectedRoots){
 const prior=[...g.runs].reverse().find(r=>r.root===root),seed=prior?.final??initial.find(e=>e.action.id===root).to;
 let n=nodes[seed],reason=null;const selected=[],visited=new Set([seed]);
 if(prior)assert.equal(n.stateHash,prior.finalStateHash);
 for(let i=0;i<steps&&!allGoals(n);i++){
  const opts=expand(n).filter(e=>!visited.has(e.to)).map(e=>({e,p:priority(n,e)})).filter(x=>Number.isFinite(x.p)).sort((a,b)=>b.p-a.p||a.e.id-b.e.id);
  if(!opts.length){reason="NO_PROGRESS_EDGE_WITHIN_GOAL_HINT";break;}
  const e=opts[0].e;selected.push(e.id);n=nodes[e.to];visited.add(n.id);
 }
 if(!allGoals(n)&&!reason)reason="STEP_BUDGET";
 g.runs.push({root,seed,final:n.id,finalStateHash:n.stateHash,selected,status:allGoals(n)?"CONDITIONAL_ALL_MILESTONES_REACHED":"OPEN",reason,missing:[...wanted].filter(k=>!active(n,k)),milestones:goals.map(t=>({...t,reached:reached(n,t)}))});
}
const byAction={};for(const e of edges)byAction[e.action.type]=(byAction[e.action.type]||0)+1;
const rootCursors=roots.flatMap(root=>{const r=[...g.runs].reverse().find(x=>x.root===root);return r?[{...r,labDepth:nodes[r.final].researchDepth,completedResearch:nodes[r.final].researched.length,baseFunctions:nodes[r.final].baseFunctions,items:nodes[r.final].items}]:[];});
g.summary={nodes:nodes.length,edges:edges.length,expanded:nodes.filter(n=>n.status!=="OPEN_UNEXPANDED").length,openUnexpanded:nodes.filter(n=>n.status==="OPEN_UNEXPANDED").length,distinctResearch:new Set(nodes.flatMap(n=>n.researched)).size,maxLabDepth:Math.max(...nodes.map(n=>n.researchDepth)),byAction,failed:g.failed.length};
const out=gzipSync(JSON.stringify(g),{level:9});
const report={schema:g.schema,artifact:stem+".json.gz",artifactSha256:sha(out),inputs,roots:START_RESEARCH,...g.summary,goals,rootCursors,normalizationComplete:false,actualGameCertified:false,firstFailures:g.failed.slice(0,10)};
fs.writeFileSync(stem+".json.gz.tmp",out);fs.writeFileSync(stem+"-summary.json.tmp",JSON.stringify(report,null,2)+"\n");
fs.renameSync(stem+".json.gz.tmp",stem+".json.gz");fs.renameSync(stem+"-summary.json.tmp",stem+"-summary.json");
console.log(JSON.stringify({...g.summary,rootCursors:rootCursors.map(r=>({...r,actions:r.selected.map(i=>edges[i].action)})),firstFailures:report.firstFailures,artifactSha256:report.artifactSha256},null,2));
