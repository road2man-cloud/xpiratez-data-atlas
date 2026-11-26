// Research chronology + trait multiset, attached to the shared ledger.
// Pair grouping is navigation, never a proof of state equivalence or closure.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {key,sha} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
const kinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const sorted=x=>[...x].sort();
const counts=x=>Object.fromEntries([...x].sort(([a],[b])=>a.localeCompare(b)));
const schema="ATLAS_TERMINAL_RESEARCH_TRAIT_SETS_V1";
// Hash the local transitive static imports of the snapshot producer, and
// the exact three data files supplied to createCareerReplay. UI-only or
// scheduling-only changes do not invalidate a replay snapshot.
function replayFingerprint(){
 const files=new Map(),queue=["tools/atlas-terminal-research-trait-sets.mjs"];
 while(queue.length){
  const p=queue.pop();if(files.has(p))continue;
  const source=fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n");files.set(p,sha(source));
  for(const m of source.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["'](\.[^"']+)["']/gm)){
   queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1].split("?")[0])));
  }
 }
 for(const p of ["public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json"])files.set(p,sha(fs.readFileSync(p)));
 return key([process.versions.node,process.versions.v8,[...files].sort(([a],[b])=>a.localeCompare(b))]);
}
export function buildTerminalResearchTraitSets({db,ledger,index,replay,prior=null}){
 const c=db.careerCompletion,targets=c.terminalRule.targets,fingerprint=replayFingerprint();
 assert.equal(ledger.sourceMetadataSha256,db.sourceMetadataSha256);
 assert.equal(index.sourceGraphSha256,ledger.sourceGraphSha256);
 const usable=prior?.schema===schema&&prior.sourceMetadataSha256===db.sourceMetadataSha256&&prior.replayFingerprint===fingerprint;
 const frontier=createTerminalDescendantFrontier(ledger.graphs,ledger.terminalResearch.records);
 const paths={},traits={},pairs={},records={},errors=[];
 const cache=new Map([[0,foundationWorld()]]),metrics={applied:0,cacheHits:0,actionVisits:0,reusedRecords:0,freshRecords:0,skippedActionVisits:0,snapshotMisses:0};
 const goalsByPath=new Map(),historyByGraph=new Map(),roots=new Map(),validatedPaths=new Set(),validatedTraits=new Set();
 for(const t of Object.values(ledger.terminalResearch.records)){
  if(t.status!=="CONDITIONAL_TARGET_RESEARCH_READY"||!Number.isInteger(t.to))continue;
  const a=roots.get(t.graph)||new Map(),s=a.get(t.to)||new Set();s.add(t.target);a.set(t.to,s);roots.set(t.graph,a);
 }
 function history(id,i){
  if(!historyByGraph.has(id)){
   const g=ledger.graphs[id],root=roots.get(id)||new Map(),a=[];
   for(const [j,n] of g.nodes.entries()){
    assert(n.parent===null||Number.isInteger(n.parent)&&n.parent>=0&&n.parent<j);
    a.push(sorted(new Set([...(a[n.parent]||[]),...(root.get(j)||[])])));
   }
   historyByGraph.set(id,a);
  }
  return historyByGraph.get(id)[i];
 }
 function remember(i,w){if(!i)return;cache.delete(i);cache.set(i,w);if(cache.size>160){cache.delete([...cache.keys()].find(k=>k!==0));}}
 function getWorld(i){
  const end=i,stack=[];while(!cache.has(i)){const n=index.actionNodes[i];assert(n&&n.parent<i);stack.push(i);i=n.parent;}
  let w=cache.get(i);if(i){metrics.cacheHits++;remember(i,w);}
  for(const [j,n] of stack.reverse().entries()){w=replay.apply(w,index.actionNodes[n].action);metrics.applied++;if(j%32===31||n===end)remember(n,w);}
  return w;
 }
 function sequence(i){
  const actions=[];while(i){const n=index.actionNodes[i];assert(n&&n.parent<i);actions.push(n.action);i=n.parent;}return actions.reverse();
 }
 function reuse(rid,r,identity){
  if(!usable)return null;
  const old=prior.records?.[rid];if(!old||old.snapshotIdentity!==identity||old.actionHash!==r.fullActionHash||old.stateHash!==r.canonicalStateHash||old.complete!==false)return null;
  const p=prior.paths?.[old.pathId],t=prior.traits?.[old.traitId];
  if(!p||!t||!Array.isArray(old.assumptions)||key([identity,old.pathId,old.traitId,old.assumptions])!==old.snapshotHash)return null;
  if(!validatedPaths.has(old.pathId)){
   if(!Array.isArray(p.actions)||!Array.isArray(p.researched)||!Array.isArray(p.disabled)||!Array.isArray(p.active)||key([p.actions,p.researched,p.disabled])!==old.pathId||key(p.active)!==key(p.researched.filter(k=>!p.disabled.includes(k))))return null;
   validatedPaths.add(old.pathId);
  }
  if(!validatedTraits.has(old.traitId)){
   if(key(t)!==old.traitId||!Object.values(t).every(n=>Number.isSafeInteger(n)&&n>0))return null;
   validatedTraits.add(old.traitId);
  }
  if(key(sorted(Object.keys(t)))!==key(sorted(r.traitEvidence.retained)))return null;
  return {pathId:old.pathId,traitId:old.traitId,path:p,traits:t,assumptions:old.assumptions};
 }
 const candidates=Object.entries(ledger.routes).filter(([,r])=>frontier.contains(r.sourceGraph,r.sourceNode)).sort(([,a],[,b])=>a.sourceGraph.localeCompare(b.sourceGraph)||a.sourceNode-b.sourceNode);
 for(const [rid,r] of candidates){
  try{
   const ix=index.routes[rid],g=ledger.graphs[r.sourceGraph],n=g.nodes[r.sourceNode];assert(ix&&n);
   assert.equal(ix.fullActionHash,r.fullActionHash);assert.equal(n.stateHash,r.canonicalStateHash);
   assert.equal(ix.sourceGraph,r.sourceGraph);assert.equal(ix.sourceNode,r.sourceNode);
   assert(Number.isSafeInteger(ix.actionCount)&&ix.actionCount>0);metrics.actionVisits+=ix.actionCount;
   const identity=key([r,ix.actionCount]);let snap=reuse(rid,r,identity);
   if(snap){metrics.reusedRecords++;metrics.skippedActionVisits+=ix.actionCount;}
   else{
    if(usable&&prior.records?.[rid])metrics.snapshotMisses++;
    const actions=sequence(ix.fullPrefix);assert.equal(actions.length,ix.actionCount);assert.equal(key(actions),r.fullActionHash);
    const w=getWorld(ix.fullPrefix);assert.equal(exactWorld(w),r.canonicalStateHash);assert(!w.pendingFree);
    const s=member(w).state,tc=counts(s.bonusCounts);assert.deepEqual(sorted(Object.keys(tc)),sorted(r.traitEvidence.retained));
    assert(Object.values(tc).every(x=>Number.isSafeInteger(x)&&x>0));
    const all=sorted(w.researched),disabled=sorted(w.disabled),active=all.filter(k=>!w.disabled.has(k));
    const researchActions=actions.filter(a=>kinds.has(a.type));
    snap={pathId:key([researchActions,all,disabled]),traitId:key(tc),path:{actions:researchActions,researched:all,disabled,active},traits:tc,
     assumptions:sorted(new Set(actions.filter(a=>a.assumption===true||a.assumeOutcome===true||a.assumeAvailability===true||a.type==="externalInputs"||String(a.type).startsWith("conditional")).map(a=>a.type)))};
    metrics.freshRecords++;
   }
   const {pathId,traitId,assumptions}=snap;
   paths[pathId]??=snap.path;traits[traitId]??=snap.traits;
   if(!goalsByPath.has(pathId)){
    const activeSet=new Set(snap.path.active);
    goalsByPath.set(pathId,sorted(targets.filter(t=>t.researchGoals.every(k=>activeSet.has(k))&&!(t.inactiveResearch||[]).some(k=>activeSet.has(k))).map(t=>t.id)));
   }
   const goals=goalsByPath.get(pathId),historyGoals=history(r.sourceGraph,r.sourceNode);
   const pairId=key([r.origin,r.branch,r.body,r.allowedDifficulties,pathId,traitId]);
   const pair=pairs[pairId]??={origin:r.origin,branch:r.branch,body:r.body,difficulties:r.allowedDifficulties,pathId,traitId,routes:[]};
   pair.routes.push(rid);
   const openEdges=n.edges===null?null:n.edges.filter(e=>!["AT_CAP","HISTORY_GATE"].includes(e.status)).map(e=>({action:e.action,status:e.status}));
   records[rid]={pairId,pathId,traitId,actionHash:r.fullActionHash,stateHash:r.canonicalStateHash,goals,historyGoals,
    current:r.permanentVector,cap:r.permanentCapVector,rank:r.rank,medals:r.medals,
    pendingExpansion:n.edges===null,openEdges,assumptions,snapshotIdentity:identity,snapshotHash:key([identity,pathId,traitId,assumptions]),complete:false};
  }catch(e){errors.push({route:rid,reason:String(e.message)});}
 }
 assert.equal(errors.length,0,JSON.stringify(errors.slice(0,5)));
 const values=Object.values(records),pairValues=Object.values(pairs);
 return {schema,sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,terminalFingerprint:c.terminalRule.fingerprint,replayFingerprint:fingerprint,
  scope:"Conditional replayed research chronology and final trait multiset; grouping is not state equivalence or terminal closure.",
  paths,traits,pairs,records,summary:{records:values.length,pairs:pairValues.length,paths:Object.keys(paths).length,traitSets:Object.keys(traits).length,
   withActiveGoal:values.filter(r=>r.goals.length).length,withoutActiveGoal:values.filter(r=>!r.goals.length).length,
   pending:values.filter(r=>r.pendingExpansion).length,stackedTraitSets:Object.values(traits).filter(t=>Object.values(t).some(n=>n>1)).length,
   witnessAlternatives:values.length-pairValues.length,complete:0,metrics}};
}
