// Final combinations are not a new ledger. They are an admission index over
// the canonical career records, with source/action identity and proof receipts.
import {key} from "./population-research-career-core.mjs";
import {birthActions} from "./population-growth-replay-core.mjs";
import {readResearchWitness} from "../public/branch-soldier-atlas-career-core.js";
export const SCHEMA="ATLAS_COMPLETE_CAREER_V1";
export const REQUIRED_PROOFS=Object.freeze([
 "terminalRule","terminalResearchPath","recruitment","chronologicalReplay",
 "exclusiveChoices","traitHistoryAndCounts","permanentStatsAndCaps",
 "trainingCombatGrowth","resourcesFacilitiesEventsRank","successorClosure",
 "equivalence","independentReplay"
]);
const digest=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const success=x=>x===true;
function canon(x){
 if(Array.isArray(x))return x.map(canon);
 if(x&&typeof x==="object")return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])]));
 return x;
}
function fullActions(ledger,row,raw,db,index){
 if(row.sourceGraph)return readResearchWitness(index,row,db.sourceMetadataSha256).fullActions;
 if(ledger.key==="newpair"){
  const entry=db.populationNewPairEntry,s=entry.routes[raw.seed];
  if(s){
   const root=entry.roots[s.root],birth=s.actions.at(-1)?.type==="conditionalCapGrowth"?s.actions.slice(0,-1):s.actions;
   return [...root.actions,...birth,...raw.actions];
  }
  const e=db.originEventBirth.variants[raw.seed];
  if(!e)throw Error("NEWPAIR_SEED_MISSING");
  const root=db.originEventBirth.roots[e.root].actions;
  return [...root.slice(0,e.insertionAt),...e.extraBeforeBirth,...e.inserted,...root.slice(e.insertionAt),...raw.actions];
 }
 const {steps}=birthActions(db,raw);
 return [...steps,...raw.actions];
}
export function evidenceIdentity(row){return key([row.origin,row.branch,row.hash]);}
export function classifyCandidate({ledger,row,raw,db,index}){
 let actions=null,traceError=null;
 try{
  actions=fullActions(ledger,row,raw,db,index);
  if(!Array.isArray(actions)||key(actions)!==row.hash)throw Error("ACTION_HASH_MISMATCH");
  const births=actions.filter(a=>a.type==="recruit"&&a.soldier==="origin");
  if(births.length!==1||births[0].profile!==row.origin)throw Error("RECRUITMENT_IDENTITY");
 }catch(e){actions=null;traceError=String(e.message);}
 const assumed=new Set();
 if(actions)for(const a of actions){
  if(a.type==="externalInputs")assumed.add("EXTERNAL_RESOURCES");
  if(a.type==="conditionalCapGrowth")assumed.add("CAP_GROWTH");
  if(a.type==="conditionalPromotion")assumed.add("PROMOTION");
  if(a.type==="conditionalMedal")assumed.add("MEDAL");
  if(a.assumption===true||a.assumeOutcome===true)assumed.add("CONDITIONAL_ACTION");
 }
 // Legacy flags never establish a completed campaign.
 const category=row.fixedModelOptimum?"FIXED_MODEL_BOUND":row.conditionalScopeComplete?"CONDITIONAL_CLOSED":"INTERMEDIATE";
 const missing=[...REQUIRED_PROOFS];
 return {category,traceHashVerified:!!actions,traceError,assumptions:[...assumed].sort(),missing,actualGameCertified:row.certified===true,terminalEvidenceCandidate:!!raw.completionProof};
}
export function normalizedCombination(row,proof){
 // Research chronology equivalence must be independently established; never
 // infer it from a branch ID or a set of unlocked research alone.
 const t=proof.traitCounts;
 if(!row.traits||!t||Object.keys(t).length!==row.traits.length||
    row.traits.some(id=>!Number.isSafeInteger(t[id])||t[id]<1))throw Error("FINAL_TRAIT_COUNTS_MISSING");
 if(!row.current.every(Number.isSafeInteger)||!row.cap.every(Number.isSafeInteger)||!Number.isSafeInteger(row.rank)||!row.medals)throw Error("FINAL_STATE_MISSING");
 if(!digest(proof.normalizedResearchPathHash)||!digest(proof.conditionsHash)||!digest(proof.equivalenceStateHash)||!proof.researchPathId)throw Error("FINAL_EQUIVALENCE_MISSING");
 return key(canon([row.origin,row.branch,proof.researchPathId,proof.normalizedResearchPathHash,row.body,t,row.current,row.cap,row.rank,row.medals,proof.conditionsHash,proof.equivalenceStateHash]));
}
export function admitVerified({row,raw,db,classification,verifyEvidence}){
 const proof=raw.completionProof;
 // No trusted original-rule / engine proof verifier is currently installed.
 // Never accept self-declared "complete", actualGameCertified or proof flags.
 if(!classification.traceHashVerified||!proof||typeof verifyEvidence!=="function")return null;
 if(proof.sourceMetadataSha256!==db.sourceMetadataSha256||proof.engineVersion!=="8.7.1"||
    proof.actionHash!==row.hash||proof.stateHash!==raw.canonicalStateHash||!digest(proof.stateHash)||
    !["GAMEPLAY_REPLAY","RULESET_ENGINE_PROOF"].includes(proof.kind))return null;
 const branch=db.branches.find(b=>b.id===row.branch);
 if(!branch||branch.sourceRootConflict||!proof.researchPathId)return null;
 // The independent verifier must resolve real branch research identity,
 // resource and assumption discharge, and every individual proof artifact.
 if(!success(verifyEvidence("researchPathReference",proof,{row,raw,db})))return null;
 for(const obligation of REQUIRED_PROOFS){
  const receipt=proof.receipts?.[obligation];
  if(!receipt||!digest(receipt.sha256)||typeof receipt.ref!=="string"||!receipt.ref||
     !success(verifyEvidence(obligation,receipt,{row,raw,db,proof})))return null;
 }
 const id=normalizedCombination(row,proof);
 return {id,source:row.source,routeId:row.id,actionHash:row.hash,researchPathId:proof.researchPathId,
  proofKind:proof.kind,proofHash:key(canon(proof)),globalOptimal:success(verifyEvidence("globalOptimal",proof,{row,raw,db})),
  alternatives:[]};
}
