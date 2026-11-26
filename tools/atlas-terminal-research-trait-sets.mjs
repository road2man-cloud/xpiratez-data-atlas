// Explicit research chronology + trait multiset, attached to the shared ledger.
// The pair index groups witnesses for navigation, never asserts equivalence or closure.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
const kinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const sorted=x=>[...x].sort();
const counts=x=>Object.fromEntries([...x].sort(([a],[b])=>a.localeCompare(b)));
export function buildTerminalResearchTraitSets({db,ledger,index,replay}){
 const c=db.careerCompletion,targets=c.terminalRule.targets;
 assert.equal(ledger.sourceMetadataSha256,db.sourceMetadataSha256);
 assert.equal(index.sourceGraphSha256,ledger.sourceGraphSha256);
 const frontier=createTerminalDescendantFrontier(ledger.graphs,ledger.terminalResearch.records);
 const paths={},traits={},pairs={},records={},errors=[];
 const cache=new Map([[0,foundationWorld()]]),metrics={applied:0,cacheHits:0,actionVisits:0};
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
 const candidates=Object.entries(ledger.routes).filter(([,r])=>frontier.contains(r.sourceGraph,r.sourceNode)).sort(([,a],[,b])=>a.sourceGraph.localeCompare(b.sourceGraph)||a.sourceNode-b.sourceNode);
 for(const [rid,r] of candidates){
  try{
   const ix=index.routes[rid],g=ledger.graphs[r.sourceGraph],n=g.nodes[r.sourceNode];assert(ix&&n);
   const actions=sequence(ix.fullPrefix);metrics.actionVisits+=actions.length;assert.equal(key(actions),r.fullActionHash);
   const w=getWorld(ix.fullPrefix);assert.equal(exactWorld(w),r.canonicalStateHash);assert(!w.pendingFree);
   const s=member(w).state,tc=counts(s.bonusCounts);assert.deepEqual(Object.keys(tc).sort(),sorted(r.traitEvidence.retained));
   assert(Object.values(tc).every(x=>Number.isSafeInteger(x)&&x>0));
   const all=sorted(w.researched),disabled=sorted(w.disabled),active=all.filter(k=>!w.disabled.has(k));
   const researchActions=actions.filter(a=>kinds.has(a.type));
   const pathId=key([researchActions,all,disabled]),traitId=key(tc);
   paths[pathId]??={actions:researchActions,researched:all,disabled,active};
   traits[traitId]??=tc;
   const activeSet=new Set(active);
   const goals=targets.filter(t=>t.researchGoals.every(k=>activeSet.has(k))&&!(t.inactiveResearch||[]).some(k=>activeSet.has(k))).map(t=>t.id).sort();
   const historyGoals=Object.values(ledger.terminalResearch.records).filter(t=>t.graph===r.sourceGraph&&t.status==="CONDITIONAL_TARGET_RESEARCH_READY").filter(t=>{
    let i=r.sourceNode;while(i!==null){if(i===t.to)return true;i=g.nodes[i].parent;}return false;
   }).map(t=>t.target).sort();
   const pairId=key([r.origin,r.branch,r.body,r.allowedDifficulties,pathId,traitId]);
   const pair=pairs[pairId]??={origin:r.origin,branch:r.branch,body:r.body,difficulties:r.allowedDifficulties,pathId,traitId,routes:[]};
   pair.routes.push(rid);
   const openEdges=n.edges===null?null:n.edges.filter(e=>!["AT_CAP","HISTORY_GATE"].includes(e.status)).map(e=>({action:e.action,status:e.status}));
   records[rid]={pairId,pathId,traitId,actionHash:r.fullActionHash,stateHash:r.canonicalStateHash,goals,historyGoals,
    current:r.permanentVector,cap:r.permanentCapVector,rank:r.rank,medals:r.medals,
    pendingExpansion:n.edges===null,openEdges,assumptions:[...new Set(actions.filter(a=>a.assumption===true||a.assumeOutcome===true||a.type==="externalInputs"||String(a.type).startsWith("conditional")).map(a=>a.type))].sort(),
    complete:false};
  }catch(e){errors.push({route:rid,reason:String(e.message)});}
 }
 assert.equal(errors.length,0,JSON.stringify(errors.slice(0,5)));
 const values=Object.values(records),pairValues=Object.values(pairs);
 return {schema:"ATLAS_TERMINAL_RESEARCH_TRAIT_SETS_V1",sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,terminalFingerprint:c.terminalRule.fingerprint,
  scope:"Conditional replayed research chronology and final trait multiset; grouping is not state equivalence or terminal closure.",
  paths,traits,pairs,records,summary:{records:values.length,pairs:pairValues.length,paths:Object.keys(paths).length,traitSets:Object.keys(traits).length,
   withActiveGoal:values.filter(r=>r.goals.length).length,withoutActiveGoal:values.filter(r=>!r.goals.length).length,
   pending:values.filter(r=>r.pendingExpansion).length,stackedTraitSets:Object.values(traits).filter(t=>Object.values(t).some(n=>n>1)).length,
   witnessAlternatives:values.length-pairValues.length,complete:0,metrics}};
}
