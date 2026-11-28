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
import {createBodyCareerScope} from "./atlas-body-career-scope-v5-vo2-irreversible.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy-v2-vo2.mjs";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
const read=p=>JSON.parse(fs.readFileSync(p));
const bytes=p=>fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:256*1024*1024});
const decode=p=>JSON.parse(gunzipSync(bytes(p)));
const sort=x=>[...x].sort(), researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const stage="tools/data/overcap-intake-stage-CHORT/";
const ledger=decode(stage+"soldier-population-missing-origin-career.json.gz");
const index=decode(stage+"soldier-population-missing-origin-career-index.json.gz");
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
const data=read("public/data/soldiers-modern-index.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(catalog.itemIds);
const body="POD_REPAIR";
const intake=read("tools/data/overcap-vo2-pod-repair-intake.json");
const metadata=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,"v.o2");assert.equal(catalog.sourceVersion,"v.o2");
assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
for(const x of [ledger,index,db,intake])assert.equal(x.sourceMetadataSha256,metadata);
assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);
assert.equal(index.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(intake.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(db.careerCompletion.terminalRule.fingerprint,ledger.terminalResearch.sourceFingerprint);
const replay=createSharedCareerReplay(data,ledger.summary),scope=createBodyCareerScope(data,db.branches,replay,catalog);
const material=createResearchMaterialPolicy(data),budget=material.describe();assert.equal(budget.sha256,intake.materialBudgetHash);
const rankEvidence=createSharedRankEvidence(data,ledger.summary.defaultRankPolicy);
const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r])),branches=new Map(db.branches.map(b=>[b.id,b]));
const targets=new Map(db.careerCompletion.terminalRule.targets.map(t=>[t.id,t]));
const candidateRows=intake.closedCandidates.flatMap(g=>g.witnesses);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const choices=b=>[...new Set([...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean))];
const allChoices=new Set(db.branches.flatMap(choices));
const branchOkay=(w,b)=>choices(b).every(k=>active(w,k))&&(b.blockedResearch||[]).every(k=>!active(w,k))&&[...allChoices].every(k=>!active(w,k)||choices(b).includes(k));
const goalOkay=(w,t)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
function materialState(actions){
 const m=material.extend(material.empty(),actions),q=material.issues(m);
 assert.deepEqual(q,{hard:[],uncertain:[]});
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
// Preserve each original ancestor boundary. Translate action positions by
// the inserted event prefix and the explicitly skipped duplicate actions.
for(const r of candidateRows){
 try{
  const p=profiles.get(r.origin),b=branches.get(r.branch),prior=ledger.routes[r.priorRoute];
  assert(p&&b&&prior&&!b.sourceRootConflict&&b.historyCount);
  assert.equal(r.finalAdmission,false);assert.equal(key(r.actions),r.actionHash);
  const originalGraph=ledger.graphs[prior.sourceGraph],chain=[];
  for(let i=prior.sourceNode;i!==0;i=originalGraph.nodes[i].parent)chain.push(originalGraph.nodes[i]);
  chain.reverse();const old=sequence(originalGraph,prior.sourceNode);
  assert.equal(key(old),prior.fullActionHash);
  const insertion=old.findIndex(a=>a.type==="externalInputs"&&a.items?.STR_STASIS_POD_GREEN_GAL>0);
  assert(insertion>=0&&r.inserted.length>0);
  const skipped=new Set(r.skipped.map(x=>x.index));
  for(const x of r.skipped)assert.deepEqual(old[x.index],x.action);
  const rebuilt=[...old.slice(0,insertion),...r.inserted,...old.slice(insertion).filter((_,i)=>!skipped.has(i+insertion))];
  assert.deepEqual(rebuilt,r.actions);
  const a=r.actions,ctx=auditOriginCampaignContext(a,data);
  assert.equal(ctx.kind,"compatible");assert.deepEqual(ctx.allowedDifficulties,prior.allowedDifficulties);
  const shift=k=>k+(insertion<k?r.inserted.length:0)-[...skipped].filter(i=>i<k).length;
  const rootAt=shift(originalGraph.birthActions.length);
  const boundaries=[{at:rootAt,action:null}];let oldAt=originalGraph.birthActions.length;
  for(const n of chain){oldAt+=n.steps.length;const at=shift(oldAt);if(at>boundaries.at(-1).at)boundaries.push({at,action:n.action});}
  assert.equal(boundaries.at(-1).at,a.length);
  const birthAt=a.findIndex(x=>x.type==="recruit"&&x.soldier==="origin");assert(birthAt>=0&&birthAt<rootAt&&a[birthAt].profile===p.id&&a[birthAt].band==="min");
  let w=foundationWorld(),birthMonth=null,previous=0,gid=null,g=null,oldGraph=null,parent=null,rootRid=null,terminalReady=[];
  for(const {at,action} of boundaries){
   for(let j=previous;j<at;j++){if(j===birthAt)birthMonth=w.month;w=replay.apply(w,a[j]);}
   assert(!w.pendingFree&&member(w));
   if(gid===null){
    const birthActions=a.slice(0,at),rootCtx=auditOriginCampaignContext(birthActions,data);
    assert(rootCtx.kind==="compatible"&&member(w).state.soldierType===p.soldierType&&branchOkay(w,b));
    gid=key([r.origin,r.branch,birthActions]);oldGraph=ledger.graphs[gid];
    g=graphChanges[gid]?.graph||structuredClone(oldGraph||{origin:r.origin,branch:r.branch,birthAt,birthMonth,mode:"OVERCAP_POD_REPAIR_INTAKE_V1",prefixSource:{kind:"overcapPodRepair",id:key([r.branch,birthActions.slice(0,birthAt)])},prefixHash:key([r.branch,birthActions.slice(0,birthAt)]),birthActions,rootStateHash:exactWorld(w),allowedDifficulties:rootCtx.allowedDifficulties,nodes:[nodeFor(w,null,null,[],birthActions)],cursor:0});
    assert.equal(g.rootStateHash,exactWorld(w));assert.deepEqual(g.birthActions,birthActions);parent=0;rootRid=addRoute(gid,g,0);
   }else{
    const full=a.slice(0,at),h=key(full),stateHash=exactWorld(w);
    let i=g.nodes.findIndex((n,i)=>n.stateHash===stateHash&&key(sequence(g,i))===h);
    if(i<0){const n=nodeFor(w,parent,action||"POD_REPAIR_CONTINUATION",a.slice(previous,at),full);assert.equal(key([...sequence(g,parent),...n.steps]),h);g.nodes.push(n);i=g.nodes.length-1;}
    parent=i;addRoute(gid,g,i);
   }
   if(at>insertion+r.inserted.length)for(const k of r.targetGoals){const t=targets.get(k);if(t&&goalOkay(w,t))terminalReady.push({target:k,node:parent,at,missingItems:Object.entries(t.requiredItems||{}).filter(([id,n])=>(w.items[id]||0)<n)});}
   previous=at;
  }
  assert(branchOkay(w,b)&&r.targetGoals.every(k=>goalOkay(w,targets.get(k))));
  const s=member(w).state,f=replay.finish(w),ac=sort([...w.researched].filter(k=>active(w,k)));
  assert.equal(exactWorld(w),r.stateHash);assert.equal(exactWorld(replay.replay(a)),r.stateHash);
  assert.equal(f.body,r.body);assert.equal(f.rank,r.endpoint.rank);assert.deepEqual(f.raw,r.endpoint.raw);assert.deepEqual(f.permanentCapVector,r.endpoint.cap);
  assert.deepEqual(f.permanentVector,r.endpoint.permanent);assert.deepEqual([...s.bonusCounts].sort(),r.endpoint.traits);assert.deepEqual(f.medals,r.endpoint.medals);
  const m=materialState(a),q=scope.assess({body:r.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:new Set(ac),raw:f.raw,capRaw:f.capRaw,finite:budget.finite,consumed:m.consumed},b,w);
  assert(q.closed,"Repaired witness no longer closed: "+q.open.map(x=>x.id).join(","));
  assert.equal(key(sequence(g,parent)),r.actionHash);
  graphChanges[gid]={priorGraphHash:oldGraph?key(oldGraph):null,graph:g};
  const endRid=addRoute(gid,g,parent);
  // Record a goal-ready anchor on the repaired lineage, not the original
  // unbacked-material path. A later re-disable leaves the earlier anchor
  // only as historical readiness; the final replay verifies active goals.
  for(const k of r.targetGoals){
   const z=terminalReady.find(x=>x.target===k);assert(z);
   const tk=key([key([gid,k]),z.node,0]);
   const tr={graph:gid,origin:g.origin,branch:g.branch,target:k,node:z.node,to:z.node,attempt:1,roundToken:key([ledger.sourceGraphSha256,key(intake)]),status:"CONDITIONAL_TARGET_RESEARCH_READY",added:[],missingItems:z.missingItems,inactiveGoals:[]};
   if(!ledger.terminalResearch.records[tk])terminalRecords[tk]=tr;
  }
  receipts.push({candidate:r.id,priorPair:r.priorPair,priorRoute:r.priorRoute,expectedPair:r.pairId,routeId:endRid,rootRouteId:rootRid,graph:gid,node:parent,actionHash:r.actionHash,stateHash:exactWorld(w),sourceAssumptions:r.sourceAssumptions,manufacture:r.manufacture,material:m,replayedScope:{closed:q.closed,openRules:q.open.map(x=>x.id),missingResearch:q.missingResearch,unknownRules:q.unknownRules,openGrowth:q.openGrowth,blocked:q.blocked,repeats:q.repeats},status:"CANONICAL_GRAPH_PATCH_READY",officialFinal:false});
 }catch(e){errors.push({candidate:r.id,priorPair:r.priorPair,reason:String(e.message)});}
}
const summary={inputs:candidateRows.length,replayed:receipts.length,uniqueEndpointRoutes:new Set(receipts.map(r=>r.routeId)).size,newGraphs:Object.values(graphChanges).filter(x=>x.priorGraphHash===null).length,changedGraphs:Object.keys(graphChanges).length,newRoutes:Object.keys(routes).length,newResearchTrieNodes:nodes.length-index.nodes.length,newActionTrieNodes:actionNodes.length-index.actionNodes.length,candidateClosure:receipts.filter(r=>r.replayedScope.closed).length,errors:errors.length,officialFinal:0};
const out={schema:"ATLAS_OVERCAP_CANONICAL_GRAPH_PATCH_V1",sourceMetadataSha256:metadata,baseGraphHash:ledger.sourceGraphSha256,baseLedgerSchema:ledger.schema,baseCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sourceIntakeHash:key(intake),sourceMaterialHash:budget.sha256,sourceCatalogHash:key(catalog),projectionMaterialPolicy:"V.O2_INDEXED_FINITE_POOLS",baseTrie:{researchCount:index.nodes.length,researchHash:key(index.nodes),actionCount:index.actionNodes.length,actionHash:key(index.actionNodes)},summary,graphChanges,routes,indexRoutes,terminalRecords,researchNodes:nodes.slice(index.nodes.length),actionNodes:actionNodes.slice(index.actionNodes.length),receipts,errors};
const file="tools/data/overcap-canonical-graph-patch-"+body+".json";
fs.writeFileSync(file,JSON.stringify(out)+"\n");
console.log(JSON.stringify({file,summary,receipts:receipts.map(r=>({candidate:r.candidate,routeId:r.routeId,closed:r.replayedScope.closed,open:r.replayedScope.openRules})),errors},null,2));
if(errors.length)process.exitCode=1;
