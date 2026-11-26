// A completed research line is an existential witness, not exhaustive search.
// The source-bound replay snapshots are evidence for the modeled research tree.
// Keep real-game victory certification and optimality strictly separate.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
export const RESEARCH_LINE_PROOF="REPLAYED_RESEARCH_LINE_V1";
export function admitResearchLines({db,sets,ledger,classifications,prior}){
 const branches=new Map(db.branches.map(b=>[b.id,b])),targets=new Map(db.careerCompletion.terminalRule.targets.map(t=>[t.id,t]));
 const old=new Map((prior?.rows||[]).filter(r=>r.proofKind===RESEARCH_LINE_PROOF).map(r=>[r.id,r.routeId]));
 const rows=[],rejected=[],covered=new Set();
 for(const [id,pair] of Object.entries(sets.pairs)){
  const b=branches.get(pair.branch),p=sets.paths[pair.pathId],t=sets.traits[pair.traitId];
  if(!b||b.sourceRootConflict||!p||!t){rejected.push({id,reason:"BRANCH_OR_PAIR_MISSING"});continue;}
  const active=new Set(p.active),commit=[...b.captain,...Object.values(b.choices||{})].filter(Boolean);
  if(commit.some(k=>!active.has(k))||(b.blockedResearch||[]).some(k=>active.has(k))){rejected.push({id,reason:"BRANCH_CONFLICT"});continue;}
  const goals=[...targets.values()].filter(q=>q.researchGoals.every(k=>active.has(k))&&!(q.inactiveResearch||[]).some(k=>active.has(k))).map(q=>q.id).sort();
  if(!goals.length){rejected.push({id,reason:"NO_TERMINAL_RESEARCH_GOAL"});continue;}
  assert.equal(id,key([pair.origin,pair.branch,pair.body,pair.difficulties,pair.pathId,pair.traitId]));
  const refs=[];
  for(const rid of pair.routes){
   const snap=sets.records[rid],raw=ledger.routes[rid],cls=classifications.missingbirth[rid];
   if(!snap||!raw||!cls?.traceHashVerified||snap.pairId!==id||snap.pathId!==pair.pathId||snap.traitId!==pair.traitId||snap.actionHash!==raw.fullActionHash||snap.stateHash!==raw.canonicalStateHash)continue;
   if(raw.origin!==pair.origin||raw.branch!==pair.branch||raw.body!==pair.body||key(raw.allowedDifficulties)!==key(pair.difficulties)||!raw.allowedDifficulties.length)continue;
   if(key(snap.goals)!==key(goals)||!snap.snapshotHash||key([snap.snapshotIdentity,snap.pathId,snap.traitId,snap.assumptions])!==snap.snapshotHash)continue;
   if(!Object.values(t).every(n=>Number.isSafeInteger(n)&&n>0)||!raw.permanentVector?.every(Number.isFinite)||!raw.permanentCapVector?.every(Number.isFinite))continue;
   const proofHash=key([RESEARCH_LINE_PROOF,sets.sourceMetadataSha256,sets.replayFingerprint,sets.terminalFingerprint,id,snap.snapshotHash,raw.fullActionHash,raw.canonicalStateHash,goals]);
   refs.push({source:"missingbirth",routeId:rid,actionHash:raw.fullActionHash,proofHash,assumptions:snap.assumptions,terminalGoals:goals});
  }
  if(!refs.length){rejected.push({id,reason:"NO_REPLAY_WITNESS"});continue;}
  // Stable representative, not a highest-score claim; distinct actual states
  // with the same research+traits are linked as alternatives, never erased.
  refs.sort((a,b)=>a.routeId.localeCompare(b.routeId));
  const representative=refs.find(r=>r.routeId===old.get(id))||refs[0];
  rows.push({...representative,id,researchPathId:pair.pathId,traitSetId:pair.traitId,proofKind:RESEARCH_LINE_PROOF,globalOptimal:false,actualGameCertified:false,alternatives:refs.filter(r=>r!==representative)});
  for(const r of refs){covered.add(r.routeId);const c=classifications.missingbirth[r.routeId];c.status="RESEARCH_LINE_COMPLETE";c.researchLineId=id;c.gameplayProofMissing=c.missing;}
 }
 return {rows,covered,rejected};
}
