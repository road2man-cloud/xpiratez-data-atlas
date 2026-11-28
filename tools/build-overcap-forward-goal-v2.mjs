// Goal-directed scheduler over V2, not a backward-built research sequence.
// Dependency closure is a priority hint only. Each new predecessor gets its
// full current option set from the existing forward transition engine.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v2.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const goal=arg("goal","STR_PERSONAL_LABS"),maxSteps=Number(arg("steps","24"));
assert(Number.isSafeInteger(maxSteps)&&maxSteps>0&&maxSteps<=100&&/^STR_[A-Z0-9_]+$/.test(goal));
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort(),pairs=x=>Object.entries(x||{});
const base="tools/data/overcap-forward-research-v2-focus",stem="tools/data/overcap-forward-research-v2-goal-"+goal.toLowerCase();
const bytes=fs.readFileSync(base+".json.gz"),summary=JSON.parse(fs.readFileSync(base+"-summary.json","utf8"));
assert.equal(sha(bytes),summary.artifactSha256);
const raw=fs.readFileSync("public/data/soldiers-modern-index.json"),supplyBytes=fs.readFileSync("tools/data/overcap-forward-supply-catalog-v2.json"),data=JSON.parse(raw);
data.forwardSupply=JSON.parse(supplyBytes);
assert.equal(sha(raw),summary.inputs.rulesSha256);assert.equal(sha(supplyBytes),summary.inputs.supplySha256);
for(const [p,h] of pairs(summary.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const g=JSON.parse(gunzipSync(bytes));assert.equal(g.schema,SCHEMA);assert.deepEqual(g.inputs,summary.inputs);
const rules=data.researchRules,catalog=data.forwardSupply,engine=createForwardResearch(data,{maxMonth:g.budget.maxMonth});
assert(rules[goal],"Unknown goal");
const nodes=g.nodes,edges=g.edges,worlds=new Map([[0,engine.start()]]),seen=new Map(),outgoing=new Map();
assert.equal(exactStateHash(worlds.get(0)),nodes[0].stateHash);
for(const [i,n] of nodes.entries()){assert.equal(n.id,i);const k=key([n.firstRoot,n.stateHash]);assert(!seen.has(k));seen.set(k,i);}
for(const [i,e] of edges.entries()){assert.equal(e.id,i);if(!outgoing.has(e.from))outgoing.set(e.from,[]);outgoing.get(e.from).push(e);}
const before={nodes:nodes.length,edges:edges.length,expanded:g.summary.expanded};
const wanted=new Set(),samples=new Set(),purchaseTargets=new Set();
function hint(id){
 if(wanted.has(id)||!rules[id])return;wanted.add(id);const r=rules[id];
 for(const k of [...arr(r.dependencies),...arr(r.requires)])hint(k);
 if(r.needItem){const item=r.neededItem||id;samples.add(item);const b=catalog.buys[item];if(b){purchaseTargets.add(item);for(const k of arr(b.requires))hint(k);}}
}
hint(goal);
assert(wanted.size<=2000,"Goal hint closure exceeds bounded policy");
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
function expand(n){
 if(n.status!=="OPEN_UNEXPANDED")return outgoing.get(n.id)||[];
 const w=worldAt(n.id),{choices,unresolved}=engine.options(w,n.firstRoot);
 n.unresolved=unresolved;for(const u of unresolved)g.unsupported[u.kind]=(g.unsupported[u.kind]||0)+1;
 const results=[];
 for(const {action,evidence} of choices){
  try{
   const r=engine.apply(w,action,n.firstRoot),next=r.world,id=edges.length;
   const to=insert(next,n.firstRoot,id,n.depth+1,n.researchDepth+Number(["research","repeatResearch"].includes(action.type)));
   const e={id,from:n.id,to,action,evidence,added:sort([...next.researched].filter(k=>!w.researched.has(k))),closed:sort([...next.disabled].filter(k=>!w.disabled.has(k))),reopened:sort([...w.disabled].filter(k=>!next.disabled.has(k))),notes:r.notes,conditional:r.conditional};
   edges.push(e);results.push(e);
  }catch(e){g.failed.push({from:n.id,action,reason:e.message||String(e)});}
 }
 outgoing.set(n.id,results);n.status=results.length?"EXPANDED":"OPEN_NO_SUPPORTED_SUCCESSOR";n.outgoing=results.length;n.rejected=choices.length-results.length;
 return results;
}
function active(n,id){return n.researched.includes(id)&&!n.disabled.includes(id);}
function progress(n){
 let p=0;for(const id of wanted)if(active(n,id))p+=100;
 for(const item of samples){
  const needs=[...wanted].some(id=>rules[id].needItem&&(rules[id].neededItem||id)===item&&!active(n,id));
  if(needs){if(n.items[item]>0)p+=30;else if(n.pendingDeliveries.some(d=>d.item===item))p+=15;}
 }
 return p;
}
function nextPriority(n,e){
 const dest=nodes[e.to],a=e.action;
 if(active(dest,goal))return 1000000;
 let p=progress(dest)-progress(n);
 if(n.pendingFree&&a.type==="freeResearch")return 10000+p;
 if(n.pendingDeliveries.length&&a.type==="sourceResearchDelivery")return 10000+p;
 if(p<=0)return -Infinity;
 // Prefer actual laboratory completions, then source-backed item actions.
 return p*100+(a.type==="research"?30:0)+(a.type==="sourceBuySample"&&purchaseTargets.has(a.id)?20:0);
}
const rootArg=arg("root","ALL"),roots=Object.values(g.roots).filter(r=>rootArg==="ALL"||r===rootArg);
assert(roots.length,"Unknown root");
const results=[];
for(const root of roots){
 const candidates=nodes.slice(0,before.nodes).filter(n=>n.firstRoot===root&&!n.pendingFree&&!n.pendingDeliveries.length&&!n.disabled.includes(goal));
 candidates.sort((a,b)=>progress(b)-progress(a)||a.depth-b.depth||a.id-b.id);
 let n=candidates[0];assert(n,"Missing seed for "+root);
 const seed=n.id,selected=[],visited=new Set([seed]);let reason=null;
 for(let i=0;i<maxSteps&&!active(n,goal);i++){
  const choices=expand(n).filter(e=>!visited.has(e.to)).map(e=>({e,score:nextPriority(n,e)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.e.id-b.e.id);
  if(!choices.length){reason="NO_PROGRESS_EDGE_WITHIN_GOAL_HINT";break;}
  const e=choices[0].e;selected.push(e.id);n=nodes[e.to];visited.add(n.id);
 }
 const reached=active(n,goal);
 if(!reached&&!reason)reason="STEP_BUDGET";
 results.push({root,seed,final:n.id,status:reached?"CONDITIONAL_GOAL_REACHED":"OPEN",reason,selected,missing:[...wanted].filter(id=>!active(n,id)),finalStateHash:n.stateHash});
}
const byAction={};for(const e of edges)byAction[e.action.type]=(byAction[e.action.type]||0)+1;
const byRoot=Object.fromEntries(Object.values(g.roots).map(root=>{const a=nodes.filter(n=>n.firstRoot===root);return [root,{states:a.length,expanded:a.filter(n=>n.status!=="OPEN_UNEXPANDED").length,open:a.filter(n=>n.status==="OPEN_UNEXPANDED").length,maxLabDepth:Math.max(0,...a.map(n=>n.researchDepth)),distinctResearch:new Set(a.flatMap(n=>n.researched)).size}];}));
const sampleEdges=edges.filter(e=>e.action.type==="research"&&rules[e.action.id]?.needItem);
g.summary={nodes:nodes.length,edges:edges.length,expanded:nodes.filter(n=>n.status!=="OPEN_UNEXPANDED").length,openUnexpanded:nodes.filter(n=>n.status==="OPEN_UNEXPANDED").length,openNoSupportedSuccessor:nodes.filter(n=>n.status==="OPEN_NO_SUPPORTED_SUCCESSOR").length,distinctResearch:new Set(nodes.flatMap(n=>n.researched)).size,byRoot,byAction,failed:g.failed.length,sampleResearchEdges:sampleEdges.length,sampleResearchIds:sort(new Set(sampleEdges.map(e=>e.action.id)))};
g.budget={...g.budget,maxExpanded:g.summary.expanded,maxNodes:Math.max(g.budget.maxNodes,nodes.length)};
g.goalRun={schema:"ATLAS_FORWARD_GOAL_RUN_V1",goal,baseSha256:sha(bytes),schedulerSha256:sha(fs.readFileSync("tools/build-overcap-forward-goal-v2.mjs","utf8").replace(/\r\n/g,"\n")),maxSteps,hintResearch:sort(wanted),hintSamples:sort(samples),results,normalizationComplete:false,actualGameCertified:false};
const out=gzipSync(JSON.stringify(g),{level:9});
const report={schema:g.schema,artifact:stem+".json.gz",artifactSha256:sha(out),inputs:g.inputs,previous:before,...g.summary,goalRun:g.goalRun,normalizationComplete:false,actualGameCertified:false};
fs.writeFileSync(stem+".json.gz.tmp",out);fs.writeFileSync(stem+"-summary.json.tmp",JSON.stringify(report,null,2)+"\n");
fs.renameSync(stem+".json.gz.tmp",stem+".json.gz");fs.renameSync(stem+"-summary.json.tmp",stem+"-summary.json");
console.log(JSON.stringify({previous:before,...g.summary,goal,results:results.map(r=>({...r,actions:r.selected.map(i=>edges[i].action)})),artifactSha256:report.artifactSha256},null,2));
