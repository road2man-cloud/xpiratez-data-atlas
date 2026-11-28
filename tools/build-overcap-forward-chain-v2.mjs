// Cumulative forward-only milestones. Extend one hashed graph; preserve all prior edges and all options at each expanded node.
// Dependency closure is a priority hint only. Each new predecessor gets its
// full current option set from the existing forward transition engine.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v2.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
import {assertForwardPurchaseGate} from "./atlas-overcap-forward-purchase-gate-v3.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const goalList=arg("goals","facility:STR_HYDROPONICS,STR_EXCAVATION,STR_PRIMITIVE_WEAPONS_2,STR_FLINTLOCKS_PRODUCTION,STR_STEAM_POWER").split(",").filter(Boolean);
const label=arg("label","foundation"),baseName=arg("base","goal-str_personal_labs"),maxSteps=Number(arg("steps","24"));
assert(Number.isSafeInteger(maxSteps)&&maxSteps>0&&maxSteps<=100);
assert(/^[a-z0-9_-]+$/.test(label)&&/^[a-z0-9_-]+$/.test(baseName)&&label!=="focus");
assert(goalList.length&&goalList.every(x=>/^(facility:)?STR_[A-Z0-9_]+$/.test(x)));
const goals=goalList.map(x=>x.startsWith("facility:")?{kind:"facility",id:x.slice(9)}:{kind:"research",id:x});
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort(),pairs=x=>Object.entries(x||{});
const base="tools/data/overcap-forward-research-v2-"+baseName,stem="tools/data/overcap-forward-research-v2-chain-"+label;
assert.notEqual(base,stem,"Do not overwrite the input graph");
const bytes=fs.readFileSync(base+".json.gz"),summary=JSON.parse(fs.readFileSync(base+"-summary.json","utf8"));
assert.equal(sha(bytes),summary.artifactSha256);
const raw=fs.readFileSync("public/data/soldiers-modern-index.json"),supplyBytes=fs.readFileSync("tools/data/overcap-forward-supply-catalog-v2.json"),data=JSON.parse(raw);
data.forwardSupply=JSON.parse(supplyBytes);
assert.equal(sha(raw),summary.inputs.rulesSha256);assert.equal(sha(supplyBytes),summary.inputs.supplySha256);
for(const [p,h] of pairs(summary.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const g=JSON.parse(gunzipSync(bytes));assert.equal(g.schema,SCHEMA);assert.deepEqual(g.inputs,summary.inputs);
const rules=data.researchRules,catalog=data.forwardSupply,engine=createForwardResearch(data,{maxMonth:g.budget.maxMonth});
for(const x of goals)assert(x.kind==="facility"?catalog.facilities[x.id]:rules[x.id],"Unknown milestone "+x.id);
const nodes=g.nodes,edges=g.edges,worlds=new Map([[0,engine.start()]]),seen=new Map(),outgoing=new Map();
assert.equal(exactStateHash(worlds.get(0)),nodes[0].stateHash);
for(const [i,n] of nodes.entries()){assert.equal(n.id,i);const k=key([n.firstRoot,n.stateHash]);assert(!seen.has(k));seen.set(k,i);}
for(const [i,e] of edges.entries()){assert.equal(e.id,i);if(!outgoing.has(e.from))outgoing.set(e.from,[]);outgoing.get(e.from).push(e);}
const before={nodes:nodes.length,edges:edges.length,expanded:g.summary.expanded};
const wanted=new Set(),samples=new Set(),purchaseTargets=new Set(),awardHints=new Map(),awardByTarget=new Map();
// Include free-research and lookup sources as alternatives, not prerequisites.
// Limit scheduler hints to accessible, no-sample lab sources; the full
// forward engine still determines whether each actual action is legal.
for(const [source,r] of pairs(rules)){
 if(!(r.cost>0)||r.needItem||arr(r.requires).length)continue;
 for(const [target,kind,guard] of [
  ...arr(r.getOneFree).map(id=>[id,"FREE_RESEARCH",null]),
  ...(r.lookup?[[r.lookup,"LOOKUP",null]]:[]),
  ...pairs(r.getOneFreeProtected).flatMap(([k,v])=>arr(v).map(id=>[id,"PROTECTED_FREE",k]))
 ]){
  if(!awardByTarget.has(target))awardByTarget.set(target,[]);
  awardByTarget.get(target).push({source,kind,guard});
 }
}
function hint(id){
 if(wanted.has(id)||!rules[id])return;wanted.add(id);const r=rules[id];
 for(const k of [...arr(r.dependencies),...arr(r.requires)])hint(k);
 if(r.needItem){
  const item=r.neededItem||id;samples.add(item);
  const b=catalog.buys[item];
  // An item that can only be bought after its own research is not a
  // first-acquisition source. Never turn a cycle into a fabricated purchase.
  if(b&&!arr(b.requires).includes(id)){purchaseTargets.add(item);for(const k of arr(b.requires))hint(k);}
  const choices=(awardByTarget.get(id)||[]).filter(x=>x.source!==id&&x.guard!==id).sort((a,b)=>Number(!!a.guard)-Number(!!b.guard)||arr(rules[a.source].requiresBaseFunc).length-arr(rules[b.source].requiresBaseFunc).length||arr(rules[a.source].dependencies).length-arr(rules[b.source].dependencies).length||rules[a.source].cost-rules[b.source].cost||a.source.localeCompare(b.source));
  // Bounded hint, not an exclusion of other free sources.
  const selected=choices.slice(0,2);
  if(selected.length){awardHints.set(id,selected);for(const x of selected){hint(x.source);if(x.guard)hint(x.guard);}}
 }
}
for(const x of goals){
 if(x.kind==="research")hint(x.id);
 else for(const k of catalog.facilities[x.id].research)hint(k);
}
assert(wanted.size<=2000,"Goal hint closure exceeds bounded policy");
function worldAt(id){
 if(worlds.has(id))return worlds.get(id);
 const n=nodes[id],e=edges[n.parent];assert(e&&e.to===id&&e.from<id);
 const prior=worldAt(e.from);assertForwardPurchaseGate(prior,e.action,data);
 const w=engine.apply(prior,e.action,nodes[e.from].firstRoot).world;
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
   assertForwardPurchaseGate(w,action,data);
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
function achieved(n,x){return x.kind==="research"?active(n,x.id):n.facilities.includes(x.id);}
const allGoals=n=>goals.every(x=>achieved(n,x));
function progress(n){
 let p=0;for(const id of wanted)if(active(n,id))p+=100;
 for(const x of goals)if(x.kind==="facility"){
  const f=catalog.facilities[x.id];
  if(achieved(n,x))p+=180;
  else p+=f.requires.filter(k=>n.baseFunctions.includes(k)).length*20;
 }
 for(const item of samples){
  const needs=[...wanted].some(id=>rules[id].needItem&&(rules[id].neededItem||id)===item&&!active(n,id));
  if(needs){if(n.items[item]>0)p+=30;else if(n.pendingDeliveries.some(d=>d.item===item))p+=15;}
 }
 return p;
}
function nextPriority(n,e){
 const dest=nodes[e.to],a=e.action;
 if(allGoals(dest))return 1000000;
 let p=progress(dest)-progress(n);
 // A before-source free reward delays the parent research completion.
 // Its laboratory action must remain selectable even though it has not
 // yet added a completed research flag.
 if(!n.pendingFree&&dest.pendingFree&&wanted.has(dest.pendingFree.source))return 5000+p;
 if(n.pendingFree&&a.type==="freeResearch")return 10000+p*100;
 if(n.pendingDeliveries.length&&a.type==="sourceResearchDelivery")return 10000+p;
 if(p<=0)return -Infinity;
 // Prefer actual laboratory completions, then source-backed item actions.
 return p*100+(a.type==="research"?30:0)+(a.type==="sourceBuySample"&&purchaseTargets.has(a.id)?20:0);
}
const rootArg=arg("root","ALL"),roots=Object.values(g.roots).filter(r=>rootArg==="ALL"||r===rootArg);
assert(roots.length,"Unknown root");
const results=[];
const priorResults=[...(g.chainRun?.results||[]),...[...(g.chainHistory||[])].reverse().flatMap(x=>x.results||[]),...(g.goalRun?.results||[])];
for(const root of roots){
 const prev=priorResults.find(x=>x.root===root);
 // Continuity: select the actual last state of the preceding milestone run.
 // An unresolved goal remains OPEN; no substitution of a different branch.
 let n=prev?nodes[prev.final]:null;
 if(!n){
  const candidates=nodes.slice(0,before.nodes).filter(n=>n.firstRoot===root&&!n.pendingFree&&!n.pendingDeliveries.length);
  candidates.sort((a,b)=>progress(b)-progress(a)||a.depth-b.depth||a.id-b.id);
  n=candidates[0];
 }
 assert(n&&n.firstRoot===root,"Missing compatible seed "+root);
 if(prev)assert.equal(n.stateHash,prev.finalStateHash);
 const seed=n.id,selected=[],visited=new Set([seed]);let reason=null;
 for(let i=0;i<maxSteps&&!allGoals(n);i++){
  const choices=expand(n).filter(e=>!visited.has(e.to)).map(e=>({e,score:nextPriority(n,e)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.e.id-b.e.id);
  if(!choices.length){reason="NO_PROGRESS_EDGE_WITHIN_MILESTONE_HINT";break;}
  const e=choices[0].e;assertForwardPurchaseGate(n,e.action,data);selected.push(e.id);n=nodes[e.to];visited.add(n.id);
 }
 const reached=allGoals(n);
 if(!reached&&!reason)reason="STEP_BUDGET";
 const milestones=goals.map(x=>({...x,status:achieved(n,x)?"CONDITIONAL_REACHED":"OPEN",...(x.kind==="facility"?{missingFunctions:catalog.facilities[x.id].requires.filter(k=>!n.baseFunctions.includes(k)),missingResearch:catalog.facilities[x.id].research.filter(k=>!active(n,k))}:{missingDependencies:arr(rules[x.id].dependencies).filter(k=>!active(n,k)),missingFunctions:arr(rules[x.id].requiresBaseFunc).filter(k=>!n.baseFunctions.includes(k)),missingSample:rules[x.id].needItem&&!n.items[rules[x.id].neededItem||x.id]?rules[x.id].neededItem||x.id:null})}));
 results.push({root,seed,final:n.id,status:reached?"CONDITIONAL_ALL_MILESTONES_REACHED":"OPEN",reason,selected,missing:[...wanted].filter(id=>!active(n,id)),milestones,baseFunctions:n.baseFunctions,facilities:n.facilities,finalStateHash:n.stateHash});
}

const byAction={};for(const e of edges)byAction[e.action.type]=(byAction[e.action.type]||0)+1;
const byRoot=Object.fromEntries(Object.values(g.roots).map(root=>{const a=nodes.filter(n=>n.firstRoot===root);return [root,{states:a.length,expanded:a.filter(n=>n.status!=="OPEN_UNEXPANDED").length,open:a.filter(n=>n.status==="OPEN_UNEXPANDED").length,maxLabDepth:Math.max(0,...a.map(n=>n.researchDepth)),distinctResearch:new Set(a.flatMap(n=>n.researched)).size}];}));
const sampleEdges=edges.filter(e=>e.action.type==="research"&&rules[e.action.id]?.needItem);
g.summary={nodes:nodes.length,edges:edges.length,expanded:nodes.filter(n=>n.status!=="OPEN_UNEXPANDED").length,openUnexpanded:nodes.filter(n=>n.status==="OPEN_UNEXPANDED").length,openNoSupportedSuccessor:nodes.filter(n=>n.status==="OPEN_NO_SUPPORTED_SUCCESSOR").length,distinctResearch:new Set(nodes.flatMap(n=>n.researched)).size,byRoot,byAction,failed:g.failed.length,sampleResearchEdges:sampleEdges.length,sampleResearchIds:sort(new Set(sampleEdges.map(e=>e.action.id)))};
g.budget={...g.budget,maxExpanded:g.summary.expanded,maxNodes:Math.max(g.budget.maxNodes,nodes.length)};
const previousRun=g.chainRun||g.goalRun||null;
g.chainHistory=[...(g.chainHistory||[]),...(g.chainRun?[g.chainRun]:[])];
g.chainRun={schema:"ATLAS_FORWARD_CHAIN_RUN_V1",label,goals,base:baseName,baseSha256:sha(bytes),previousRun:previousRun?{schema:previousRun.schema,label:previousRun.label||null,goal:previousRun.goal||null}:null,schedulerSha256:sha(fs.readFileSync("tools/build-overcap-forward-chain-v2.mjs","utf8").replace(/\r\n/g,"\n")),maxSteps,hintResearch:sort(wanted),hintSamples:sort(samples),hintAwardSources:Object.fromEntries(awardHints),results,normalizationComplete:false,actualGameCertified:false};
const out=gzipSync(JSON.stringify(g),{level:9});
const report={schema:g.schema,artifact:stem+".json.gz",artifactSha256:sha(out),inputs:g.inputs,previous:before,...g.summary,chainRun:g.chainRun,normalizationComplete:false,actualGameCertified:false};
fs.writeFileSync(stem+".json.gz.tmp",out);fs.writeFileSync(stem+"-summary.json.tmp",JSON.stringify(report,null,2)+"\n");
fs.renameSync(stem+".json.gz.tmp",stem+".json.gz");fs.renameSync(stem+"-summary.json.tmp",stem+"-summary.json");
console.log(JSON.stringify({previous:before,...g.summary,goals,results:results.map(r=>({...r,actions:r.selected.map(i=>edges[i].action)})),artifactSha256:report.artifactSha256},null,2));
