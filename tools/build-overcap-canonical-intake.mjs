// Produce an append-only canonical graph intake patch, NOT a final admission.
// Reconstruct all endpoints using the current shared lifecycle replay.
// The patch is bound to the exact main graph and trie prefixes, and cannot
// be applied to a newer ledger without rerunning the producer.
import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createSharedCareerReplay,flatRollEvidence,lifecycleEvidence} from "./population-shared-lifecycle-replay.mjs";
import {createSharedRankEvidence} from "./population-shared-default-rank.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createIrreversibleBodyCareerScope} from "./atlas-body-career-scope-v4-irreversible.mjs";
const read=p=>JSON.parse(fs.readFileSync(p));
const bytes=p=>fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:256*1024*1024});
const decode=p=>JSON.parse(gunzipSync(bytes(p)));
const sort=x=>[...x].sort(), researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const ledger=decode("public/data/soldier-population-missing-origin-career.json.gz");
const index=decode("public/data/soldier-population-missing-origin-career-index.json.gz");
const db=hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz"));
const data=read("public/data/soldiers-modern-index.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(catalog.itemIds);
const body=process.argv.find(a=>a.startsWith("--body="))?.slice(7)||"CHORT";
assert(/^[A-Z0-9_]+$/.test(body));
const intake=read("tools/data/overcap-fixed-body-intake-"+body+".json");
const closure=read("public/data/soldier-overcap-fixed-body-closure-"+body+".json");
const material=read("public/data/soldier-overcap-successor-material-ledger.json");
const metadata=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,"v.o2");assert.equal(catalog.sourceVersion,"v.o2");assert.equal(material.sourceVersion,"v.o2");
assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
for(const x of [ledger,index,db,intake,closure,material])assert.equal(x.sourceMetadataSha256,metadata);
assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);
assert.equal(index.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(key(closure),intake.closureLedgerHash);
assert.equal(key(catalog),intake.sourceCatalogHash);
assert.equal(db.careerCompletion.terminalRule.fingerprint,ledger.terminalResearch.sourceFingerprint);
const replay=createSharedCareerReplay(data,ledger.summary),scope=createIrreversibleBodyCareerScope(data,db.branches,replay,catalog);
const rankEvidence=createSharedRankEvidence(data,ledger.summary.defaultRankPolicy);
const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r])),branches=new Map(db.branches.map(b=>[b.id,b]));
const targets=new Map(db.careerCompletion.terminalRule.targets.map(t=>[t.id,t]));
const certs=new Map(closure.closed.map(c=>[c.id,c]));
const finite=new Map(Object.values(material.catalog).filter(c=>c.cap!=null).map(c=>[c.id,c]));
assert.equal(finite.get("STR_CAPTAINS_11_TOKEN")?.cap,11);
assert.equal(finite.get("STR_STASIS_POD_GREEN_GAL")?.cap,3);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const choices=b=>[...new Set([...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean))];
const allChoices=new Set(db.branches.flatMap(choices));
const branchOkay=(w,b)=>choices(b).every(k=>active(w,k))&&(b.blockedResearch||[]).every(k=>!active(w,k))&&[...allChoices].every(k=>!active(w,k)||choices(b).includes(k));
const goalOkay=(w,t)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
function materialState(actions){
 const m={granted:{},consumed:{},violations:[],events:[]};
 const add=(o,k,n)=>{if(finite.has(k)&&Number.isSafeInteger(n)&&n>0)o[k]=(o[k]||0)+n;};
 for(const a of actions){
  if(a.type==="eventResearch"&&!m.events.includes(a.event))m.events.push(a.event);
  if(a.type==="externalInputs")for(const [k,n] of Object.entries(a.items||{}))add(m.granted,k,n);
  let consumed={};
  if(a.type==="recruit")consumed=profiles.get(a.profile)?.acquisitionRequiredItems||{};
  if(a.type==="transform")consumed=rules.get(a.transform)?.requiredItems||{};
  if(a.type==="research"||a.type==="repeatResearch"){const r=data.researchRules[a.id];if(r?.needItem&&r.destroyItem)consumed={[r.neededItem||a.id]:1};}
  for(const [k,n] of Object.entries(consumed))add(m.consumed,k,n);
 }
 for(const [k,c] of finite){
  const n=Math.max(m.granted[k]||0,m.consumed[k]||0);
  if(n>c.cap)m.violations.push(k+": "+n+"/"+c.cap);
  if(n&&k==="STR_CAPTAINS_11_TOKEN"&&!m.events.includes("STR_CAPTAINS_11"))m.violations.push("CAPTAINS_11_SOURCE_NOT_REPLAYED");
  if(n&&k==="STR_STASIS_POD_GREEN_GAL"&&!m.events.includes("STR_VENTURA_ANOMALY_EVENT"))m.violations.push("GREEN_GAL_POOL_SOURCE_NOT_REPLAYED");
 }
 return m;
}
function nodeFor(w,parent,action,steps,full){
 const m=materialState(full);assert.deepEqual(m.violations,[]);
 let rh=key([]);for(const a of full)if(researchKinds.has(a.type))rh=key([rh,a]);
 const stateHash=exactWorld(w);
 return {parent,action,steps,stateHash,projection:"EXACT_HISTORY_MATERIAL:"+key([stateHash,rh,m]),...replay.finish(w),traits:traitSnapshot(w),edges:null};
}
const graphChanges={},routes={},indexRoutes={},terminalRecords={},receipts=[],errors=[];
const nodes=index.nodes.slice(),actionNodes=index.actionNodes.slice();
const trieMap=arr=>new Map(arr.slice(1).map((n,i)=>[key([n.parent,n.action]),i+1]));
const rm=trieMap(nodes),am=trieMap(actionNodes);
const push=(arr,map,parent,action)=>{const h=key([parent,action]);if(map.has(h))return map.get(h);const i=arr.length;arr.push({parent,action});map.set(h,i);return i;};
function sequence(g,i){const tail=[];while(i!==0){const n=g.nodes[i];assert(n&&n.parent<i);tail.push(n.steps);i=n.parent;}return [...g.birthActions,...tail.reverse().flat()];}
function addRoute(gid,g,i){
 const n=g.nodes[i],rid="MISSCAR:"+gid+":"+i,full=sequence(g,i),hash=key(full);
 const old=ledger.routes[rid]||routes[rid];
 if(old){assert.equal(old.canonicalStateHash,n.stateHash);assert.equal(old.fullActionHash,hash);return rid;}
 const ctx=auditOriginCampaignContext(full,data),allowed=ctx.allowedDifficulties.filter(x=>g.allowedDifficulties.includes(x));assert(ctx.kind==="compatible"&&allowed.length);
 let rp=0,ap=0;const order=[],transformGates=[];
 for(const [j,a] of full.entries()){
  ap=push(actionNodes,am,ap,a);if(researchKinds.has(a.type))rp=push(nodes,rm,rp,a);
  if(a.type==="transform"){const r=rules.get(a.transform);assert(r);transformGates.push({index:j,prefix:rp,transform:a.transform,requires:r.requires});if(a.soldier==="origin")order.push(a.transform);}
 }
 const rankDefault=rankEvidence(full),flatRoll=flatRollEvidence(full,ledger.summary.flatRollPolicy),lifecycle=lifecycleEvidence(full,ledger.summary.lifecyclePolicy);
 routes[rid]={origin:g.origin,branch:g.branch,body:n.body,order,permanentVector:n.permanentVector,permanentCapVector:n.permanentCapVector,fullActionHash:hash,canonicalStateHash:n.stateHash,allowedDifficulties:allowed,traitEvidence:{retained:n.traits},rank:n.rank,medals:n.medals,sourceGraph:gid,sourceNode:i,birthEvidence:{scope:"CONDITIONAL_MIN_RECRUITMENT",mode:g.mode,birthAt:g.birthAt,birthMonth:g.birthMonth,prefixSource:g.prefixSource,requiredResearch:profiles.get(g.origin).requires},...(rankDefault?{rankDefault}:{}),...(flatRoll?{flatRoll}:{}),...(lifecycle?{lifecycle}:{}),actualGameCertified:false};
 indexRoutes[rid]={origin:g.origin,branch:g.branch,fullActionHash:hash,prefix:rp,fullPrefix:ap,transformGates,history:key([g.branch,rp]),sourceGraph:gid,sourceNode:i,actionCount:full.length};
 return rid;
}
for(const r of intake.rows){
 try{
  const a=r.actions,p=profiles.get(r.origin),b=branches.get(r.branch),t=targets.get(r.target),c=certs.get(r.id);
  assert(p&&b&&t&&c&&!b.sourceRootConflict&&b.historyCount);
  assert.equal(key(a),r.actionHash);assert.equal(c.sourceActionHash,r.actionHash);
  assert.equal(key(c.certificate),r.proofHash);assert.equal(c.proofHash,r.proofHash);assert.equal(r.finalAdmission,false);
  assert.deepEqual(materialState(a).violations,[]);
  const birthAt=a.findIndex(x=>x.type==="recruit"&&x.soldier==="origin");assert(birthAt>=0&&a[birthAt].profile===p.id&&a[birthAt].band==="min");
  const ctx=auditOriginCampaignContext(a,data);assert(ctx.kind==="compatible"&&ctx.allowedDifficulties.includes(r.difficulty));
  let w=foundationWorld(),root=null,rootAt=null,goal=null,goalAt=null,birthMonth=null;
  for(const [i,action] of a.entries()){
   if(i===birthAt)birthMonth=w.month;
   w=replay.apply(w,action);
   if(i>=birthAt&&!root&&!w.pendingFree&&member(w)?.state.soldierType===p.soldierType&&branchOkay(w,b)){
    assert(!a.slice(birthAt+1,i+1).some(x=>x.type==="transform"&&x.soldier==="origin"),"No canonical birth root before first surgery");
    root=structuredClone(w);rootAt=i+1;
   }
   if(root&&!w.pendingFree){
    if(goalOkay(w,t)){if(goalAt===null){goal=structuredClone(w);goalAt=i+1;}}
    else {goal=null;goalAt=null;}
   }
  }
  assert(root&&goal&&rootAt<=goalAt&&!w.pendingFree&&branchOkay(w,b)&&goalOkay(w,t));
  const independent=replay.replay(a);assert.equal(exactWorld(independent),exactWorld(w));
  const s=member(w).state,f=replay.finish(w),ac=sort([...w.researched].filter(k=>active(w,k)));
  assert.equal(f.body,r.body);assert.equal(f.rank,r.rank);assert.deepEqual(f.raw,r.raw);assert.deepEqual(f.permanentCapVector,r.cap);
  assert.deepEqual([...s.bonusCounts].sort(),r.traits);assert.deepEqual(ac,r.activeResearch);assert.deepEqual(sort(w.disabled),r.disabledResearch);
  const q=scope.assess({body:r.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:new Set(ac),raw:f.raw,capRaw:f.capRaw},b,w);
  // An independent candidate closure is useful evidence, but the official
  // v9/v10 admission and material migration are still separate requirements.
  const birthActions=a.slice(0,rootAt),gid=key([p.id,b.id,birthActions]),old=ledger.graphs[gid];
  const rootCtx=auditOriginCampaignContext(birthActions,data);assert(rootCtx.kind==="compatible"&&rootCtx.allowedDifficulties.includes(r.difficulty));
  let g=graphChanges[gid]?.graph||structuredClone(old||{origin:p.id,branch:b.id,birthAt,birthMonth,mode:"OVERCAP_CANONICAL_INTAKE_V1",prefixSource:{kind:"overcapCanonicalIntake",id:key([b.id,birthActions.slice(0,birthAt)])},prefixHash:key([b.id,birthActions.slice(0,birthAt)]),birthActions,rootStateHash:exactWorld(root),allowedDifficulties:rootCtx.allowedDifficulties,nodes:[nodeFor(root,null,null,[],birthActions)],cursor:0});
  assert.equal(g.rootStateHash,exactWorld(root));assert.deepEqual(g.birthActions,birthActions);
  function append(world,end,parent,start,action){
   const full=a.slice(0,end),h=key(full),stateHash=exactWorld(world);
   const existing=g.nodes.findIndex((n,i)=>n.stateHash===stateHash&&key(sequence(g,i))===h);
   if(existing>=0)return existing;
   const n=nodeFor(world,parent,action,a.slice(start,end),full);
   assert.equal(key([...sequence(g,parent),...n.steps]),h);
   g.nodes.push(n);return g.nodes.length-1;
  }
  const gi=goalAt===rootAt?0:append(goal,goalAt,0,rootAt,"TERMINAL_RESEARCH:"+t.id);
  const ei=goalAt===a.length?gi:append(w,a.length,gi,goalAt,"OVERCAP_INTAKE_CONTINUATION");
  assert.equal(key(sequence(g,ei)),r.actionHash);
  graphChanges[gid]={priorGraphHash:old?key(old):null,graph:g};
  const rootRid=addRoute(gid,g,0),goalRid=addRoute(gid,g,gi),endRid=addRoute(gid,g,ei);
  const tk=key([key([gid,t.id]),gi,0]);
  const tr={graph:gid,origin:g.origin,branch:g.branch,target:t.id,node:gi,to:gi,attempt:1,roundToken:key([ledger.sourceGraphSha256,intake.closureLedgerHash]),status:"CONDITIONAL_TARGET_RESEARCH_READY",added:[],missingItems:Object.entries(t.requiredItems||{}).filter(([k,n])=>(goal.items[k]||0)<n),inactiveGoals:[]};
  if(!ledger.terminalResearch.records[tk])terminalRecords[tk]=tr;
  receipts.push({candidate:r.id,seedId:r.seedId,routeId:endRid,rootRouteId:rootRid,goalRouteId:goalRid,graph:gid,node:ei,actionHash:r.actionHash,stateHash:exactWorld(w),material:materialState(a),replayedScope:{closed:q.closed,openRules:q.open.map(x=>x.id),missingResearch:q.missingResearch,unknownRules:q.unknownRules,openGrowth:q.openGrowth,blocked:q.blocked,repeats:q.repeats},status:"CANONICAL_GRAPH_PATCH_READY",officialFinal:false});
 }catch(e){errors.push({candidate:r.id,reason:String(e.message)});}
}
const summary={inputs:intake.rows.length,replayed:receipts.length,uniqueEndpointRoutes:new Set(receipts.map(r=>r.routeId)).size,newGraphs:Object.values(graphChanges).filter(x=>x.priorGraphHash===null).length,changedGraphs:Object.keys(graphChanges).length,newRoutes:Object.keys(routes).length,newResearchTrieNodes:nodes.length-index.nodes.length,newActionTrieNodes:actionNodes.length-index.actionNodes.length,candidateClosure:receipts.filter(r=>r.replayedScope.closed).length,errors:errors.length,officialFinal:0};
const out={schema:"ATLAS_OVERCAP_CANONICAL_GRAPH_PATCH_V1",sourceMetadataSha256:metadata,baseGraphHash:ledger.sourceGraphSha256,baseLedgerSchema:ledger.schema,baseCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sourceIntakeHash:key(intake),sourceMaterialHash:key(material),sourceCatalogHash:key(catalog),projectionMaterialPolicy:"V.O2_INDEXED_FINITE_POOLS",baseTrie:{researchCount:index.nodes.length,researchHash:key(index.nodes),actionCount:index.actionNodes.length,actionHash:key(index.actionNodes)},summary,graphChanges,routes,indexRoutes,terminalRecords,researchNodes:nodes.slice(index.nodes.length),actionNodes:actionNodes.slice(index.actionNodes.length),receipts,errors};
const file="tools/data/overcap-canonical-graph-patch-"+body+".json";
fs.writeFileSync(file,JSON.stringify(out)+"\n");
console.log(JSON.stringify({file,summary,receipts:receipts.map(r=>({candidate:r.candidate,routeId:r.routeId,closed:r.replayedScope.closed,open:r.replayedScope.openRules})),errors},null,2));
if(errors.length)process.exitCode=1;
