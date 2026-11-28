// Targeted expansion of the existing, independently generated V2 graph.
// All options at a selected node are expanded; no legacy career input.
// Focus changes scheduling only, never the transition rules.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v2.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const limit=Number(arg("expand","12")),resume=process.argv.includes("--resume");
assert(Number.isSafeInteger(limit)&&limit>0&&limit<=120);
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort(),pairs=x=>Object.entries(x||{});
const base="tools/data/overcap-forward-research-v2",stem="tools/data/overcap-forward-research-v2-focus";
const baseBytes=fs.readFileSync(base+".json.gz"),baseSummary=JSON.parse(fs.readFileSync(base+"-summary.json","utf8"));
assert.equal(sha(baseBytes),baseSummary.artifactSha256);
const raw=fs.readFileSync("public/data/soldiers-modern-index.json"),supplyBytes=fs.readFileSync("tools/data/overcap-forward-supply-catalog-v2.json");
const data=JSON.parse(raw);data.forwardSupply=JSON.parse(supplyBytes);
assert.equal(sha(raw),baseSummary.inputs.rulesSha256);assert.equal(sha(supplyBytes),baseSummary.inputs.supplySha256);
for(const [p,h] of pairs(baseSummary.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const schedulerSha256=sha(fs.readFileSync("tools/build-overcap-forward-focus-v2.mjs","utf8").replace(/\r\n/g,"\n"));
let bytes=baseBytes;
if(resume){bytes=fs.readFileSync(stem+".json.gz");const s=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8"));assert.equal(sha(bytes),s.artifactSha256);}
const g=JSON.parse(gunzipSync(bytes));
assert.equal(g.schema,SCHEMA);assert.deepEqual(g.inputs,baseSummary.inputs);
if(resume){assert.equal(g.focus.baseSha256,sha(baseBytes));assert.equal(g.focus.schedulerSha256,schedulerSha256);}
else g.focus={baseSha256:sha(baseBytes),schedulerSha256,baseCounts:{nodes:g.nodes.length,edges:g.edges.length,expanded:g.summary.expanded},expansions:[],produced:[]};
const rules=data.researchRules,catalog=data.forwardSupply,engine=createForwardResearch(data,{maxMonth:g.budget.maxMonth});
const nodes=g.nodes,edges=g.edges,worlds=new Map([[0,engine.start()]]),seen=new Map(),roots=Object.values(g.roots);
assert.equal(exactStateHash(worlds.get(0)),nodes[0].stateHash);
for(const [i,n] of nodes.entries()){assert.equal(n.id,i);const k=key([n.firstRoot,n.stateHash]);assert(!seen.has(k));seen.set(k,i);}
const sampleRules=Object.entries(rules).filter(([,r])=>r.cost>0&&r.needItem&&!arr(r.requires).length);
const sampleByItem=new Map(),unlocks=new Map();
for(const [id,r] of sampleRules){const k=r.neededItem||id;if(!sampleByItem.has(k))sampleByItem.set(k,[]);sampleByItem.get(k).push([id,r]);}
for(const [id,r] of pairs(rules))for(const k of arr(r.unlocks)){if(!unlocks.has(k))unlocks.set(k,[]);unlocks.get(k).push(id);}
const recipes=catalog.recipes,buys=Object.values(catalog.buys),facilities=Object.values(catalog.facilities);
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
// These snapshots are only scheduling hints. engine.options and engine.apply
// independently determine every generated edge at its actual predecessor.
const hintCache=new Map();
function hints(n){
 if(hintCache.has(n.id))return hintCache.get(n.id);
 const h={sample:[],manufacture:[],purchase:[],facility:[],settle:[]};
 if(n.pendingFree||n.pendingDeliveries.length){
  if(n.pendingFree)h.settle.push("FREE:"+n.pendingFree.source);
  for(const d of n.pendingDeliveries)h.settle.push("DELIVERY:"+d.item);
  hintCache.set(n.id,h);return h;
 }
 const have=new Set(n.researched),disabled=new Set(n.disabled),f=new Set(n.baseFunctions),items=n.items;
 const active=k=>have.has(k)&&!disabled.has(k),all=xs=>arr(xs).every(active),fn=xs=>arr(xs).every(k=>f.has(k)),qty=id=>Number(items[id]||0);
 const need={};
 for(const [id,r] of sampleRules)if(!have.has(id)&&!disabled.has(id))need[r.neededItem||id]=1;
 for(const r of recipes)if(all(r.requires)&&fn(r.functions))for(const [id,v] of pairs(r.requiredItems))need[id]=Math.max(need[id]||0,v);
 for(const [item,count] of pairs(items))if(count>0)for(const [id,r] of sampleByItem.get(item)||[])if(!have.has(id)&&!disabled.has(id)&&fn(r.requiresBaseFunc)&&(arr(r.dependencies).every(k=>have.has(k))||arr(unlocks.get(id)).some(k=>have.has(k))))h.sample.push(id);
 for(const r of recipes)if(all(r.requires)&&fn(r.functions)&&pairs(r.outputs).some(([id])=>(need[id]||0)>qty(id))&&pairs(r.requiredItems).every(([id,v])=>qty(id)>=v))h.manufacture.push(r.id);
 for(const b of buys)if(all(b.requires)&&fn(b.functions)&&(need[b.id]||0)>qty(b.id))h.purchase.push(b.id);
 for(const b of facilities)if(!n.facilities.includes(b.id)&&all(b.research)&&fn(b.requires)&&b.provides.some(k=>!f.has(k)))h.facility.push(b.id);
 hintCache.set(n.id,h);return h;
}
const actionKind=a=>a.type==="research"&&rules[a.id]?.needItem?"sample":a.type==="sourceManufactureItem"?"manufacture":a.type==="sourceBuySample"?"purchase":a.type==="sourceBuildFacility"?"facility":a.type==="sourceResearchDelivery"||a.type==="freeResearch"?"settle":"other";
const produced=new Map();
for(const e of edges){
 const kind=actionKind(e.action),id=e.action.id||e.action.item||e.action.research;
 if(kind!=="other"&&id)produced.set(key([nodes[e.to].firstRoot,kind,id]),(produced.get(key([nodes[e.to].firstRoot,kind,id]))||0)+1);
}
const rootCount=Object.fromEntries(roots.map(r=>[r,0]));
for(const x of g.focus.expansions)rootCount[x.root]++;
const modeCounts={};for(const x of g.focus.expansions)modeCounts[x.mode]=(modeCounts[x.mode]||0)+1;
// A rotating quota prevents a single cheap sample from monopolizing the search.
const lanes=["sample","manufacture","purchase","settle","sample","facility","research","settle"];
function choose(){
 const mode=lanes[g.focus.expansions.length%lanes.length];
 let best=null,score=-Infinity;
 for(const n of nodes){
  if(n.status!=="OPEN_UNEXPANDED"||!n.firstRoot)continue;
  const h=hints(n),ids=h[mode]||[];
  if(mode!=="research"&&!ids.length)continue;
  if(mode==="research"&&(n.pendingFree||n.pendingDeliveries.length))continue;
  const novel=ids.filter(id=>!produced.has(key([n.firstRoot,mode,id]))).length;
  const parent=n.parent==null?null:edges[n.parent]?.action;
  const fromFocus=Number(n.id>=g.focus.baseCounts.nodes);
  const continuation=mode==="settle"&&parent?.type==="sourceBuySample"?1:0;
  const value=novel*100000+continuation*50000+fromFocus*5000-rootCount[n.firstRoot]*1000+Math.min(n.researchDepth,100)*10+ids.length-n.id/1000000;
  if(value>score){score=value;best={n,mode,ids};}
 }
 if(!best){
  for(const n of nodes)if(n.status==="OPEN_UNEXPANDED"&&n.firstRoot){
   const h=hints(n),k=["sample","manufacture","purchase","settle","facility"].find(k=>h[k].length)||"research";
   const v=Number(k!=="research")*10000-rootCount[n.firstRoot]*1000+n.researchDepth;
   if(v>score){score=v;best={n,mode:k,ids:h[k]||[]};}
  }
 }
 return best;
}
const before={nodes:nodes.length,edges:edges.length,expanded:g.summary.expanded};
for(let i=0;i<limit;i++){
 const pick=choose();if(!pick)break;
 const {n,mode,ids}=pick,w=worldAt(n.id),{choices,unresolved}=engine.options(w,n.firstRoot);
 n.unresolved=unresolved;for(const u of unresolved)g.unsupported[u.kind]=(g.unsupported[u.kind]||0)+1;
 let success=0;const focused=[];
 for(const {action,evidence} of choices){
  try{
   const r=engine.apply(w,action,n.firstRoot),next=r.world,eid=edges.length;
   const to=insert(next,n.firstRoot,eid,n.depth+1,n.researchDepth+Number(["research","repeatResearch"].includes(action.type)));
   const e={id:eid,from:n.id,to,action,evidence,added:sort([...next.researched].filter(k=>!w.researched.has(k))),closed:sort([...next.disabled].filter(k=>!w.disabled.has(k))),reopened:sort([...w.disabled].filter(k=>!next.disabled.has(k))),notes:r.notes,conditional:r.conditional};
   edges.push(e);success++;
   const kind=actionKind(action),id=action.id||action.item||action.research;
   if(kind!=="other"&&id){const k=key([n.firstRoot,kind,id]);produced.set(k,(produced.get(k)||0)+1);}
   if(kind===mode||kind==="sample"||kind==="manufacture"||kind==="purchase"){
    focused.push(eid);g.focus.produced.push({edge:eid,kind,root:n.firstRoot,id,to});
   }
  }catch(e){g.failed.push({from:n.id,action,reason:e.message||String(e)});}
 }
 n.status=success?"EXPANDED":"OPEN_NO_SUPPORTED_SUCCESSOR";n.outgoing=success;n.rejected=choices.length-success;
 rootCount[n.firstRoot]++;modeCounts[mode]=(modeCounts[mode]||0)+1;
 g.focus.expansions.push({node:n.id,root:n.firstRoot,mode,hints:ids,edges:success,focused});
}
const byAction={};for(const e of edges)byAction[e.action.type]=(byAction[e.action.type]||0)+1;
const byRoot=Object.fromEntries(roots.map(root=>{const a=nodes.filter(n=>n.firstRoot===root);return [root,{states:a.length,expanded:a.filter(n=>n.status!=="OPEN_UNEXPANDED").length,open:a.filter(n=>n.status==="OPEN_UNEXPANDED").length,maxLabDepth:Math.max(0,...a.map(n=>n.researchDepth)),distinctResearch:new Set(a.flatMap(n=>n.researched)).size}];}));
const sampleEdges=edges.filter(e=>actionKind(e.action)==="sample");
g.summary={nodes:nodes.length,edges:edges.length,expanded:nodes.filter(n=>n.status!=="OPEN_UNEXPANDED").length,openUnexpanded:nodes.filter(n=>n.status==="OPEN_UNEXPANDED").length,openNoSupportedSuccessor:nodes.filter(n=>n.status==="OPEN_NO_SUPPORTED_SUCCESSOR").length,distinctResearch:new Set(nodes.flatMap(n=>n.researched)).size,byRoot,byAction,failed:g.failed.length,sampleResearchEdges:sampleEdges.length,sampleResearchIds:sort(new Set(sampleEdges.map(e=>e.action.id)))};
g.budget={...g.budget,maxExpanded:g.summary.expanded,maxNodes:Math.max(g.budget.maxNodes,nodes.length)};
const out=gzipSync(JSON.stringify(g),{level:9});
const summary={schema:g.schema,artifact:stem+".json.gz",artifactSha256:sha(out),inputs:g.inputs,focus:g.focus,previous:before,...g.summary,focusModes:modeCounts,normalizationComplete:false,actualGameCertified:false};
fs.writeFileSync(stem+".json.gz.tmp",out);fs.writeFileSync(stem+"-summary.json.tmp",JSON.stringify(summary,null,2)+"\n");
fs.renameSync(stem+".json.gz.tmp",stem+".json.gz");fs.renameSync(stem+"-summary.json.tmp",stem+"-summary.json");
console.log(JSON.stringify({previous:before,...g.summary,focusModes:modeCounts,focusProduced:g.focus.produced.length,artifactSha256:summary.artifactSha256},null,2));
