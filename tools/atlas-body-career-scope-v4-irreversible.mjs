// Fixed-end-body development scope. The full chronological research witness
// is retained. Different final bodies are alternative goals, not missing work.
// An excluded model action is NOT a proof of game-wide impossibility.
import assert from "node:assert/strict";
import {createBranchResearchExclusion} from "./atlas-branch-research-exclusion.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createRepeatQuotient} from "./final-career-repeat-quotient.mjs";
import {createIrreversibleResearchExclusion} from "./atlas-replay-irreversible-research.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
export const SCOPE="SELECTED_VICTORY_RESEARCH_FIXED_FINAL_BODY_IRREVERSIBLE_V1";
export function createIrreversibleBodyCareerScope(data,branches,replay,sourceCatalog){
 const first=createFirstSuccessorIndex(data),rules=new Map(data.transformations.map(r=>[r.id,r]));
 const quotient=createRepeatQuotient(data),irreversible=createIrreversibleResearchExclusion(data,sourceCatalog),safeHistory=new Set(quotient.proof.safeHistory);
 // Only item-free repeated surgery is certified here. No v.o1.1.1 acquisition index.
 const choices=b=>[...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean);
 const allChoices=new Set(branches.flatMap(choices)),branchExclusion=createBranchResearchExclusion(data);
 const stats={scope:SCOPE,repeatTrials:0,repeatFixed:0,repeatCapRestored:0,repeatUnresolved:0,repeatReasons:{},transitiveExclusions:0,cycleAttempts:0,cycleAccepted:0,passiveFiniteReturnEdges:0,cycleStates:0,cycleEdges:0,cycleRejected:{}};
 function reason(k){stats.repeatReasons[k]=(stats.repeatReasons[k]||0)+1;return null;}
 function eligible(x,inputs,allowFirst=false){
  const r=rules.get(x.id),body=replay.bodies.get(inputs.body);
  return !!r&&!!body&&inputs.historyKnown&&(inputs.history?.has(x.id)||(allowFirst&&!r.soldierBonusType))&&safeHistory.has(x.id)&&!r.reset&&!r.resetRank&&!r.removeTransformations?.length&&!r.createsClone&&!r.producedItem&&x.destination===inputs.body&&x.missingResearch.length===0&&Number.isSafeInteger(r.cost||0)&&(r.cost||0)>=0&&deterministicRule(r,[body])&&(r.allowsLiveSoldiers||replay.lifecycleRules?.has(r.id))&&Object.keys(r.requiredItems||{}).length===0;
 }
 function fixedRepeat(x,inputs,w){
  if(!eligible(x,inputs))return null;
  const r=rules.get(x.id);stats.repeatTrials++;
  try{
   assert(member(w).state.status==="healthy");
   const v=replay.transform({world:w,steps:[]},r);if(!v)return reason("NO_EXACT_REPLAY");
   assert.equal(exactWorld(replay.replay(v.steps,w)),exactWorld(v.world));
   assert(v.steps.filter(a=>a.type==="transform").length===1);
   const support=v.steps.filter(a=>a.type==="externalInputs");
   assert(support.every(a=>Object.keys(a.items||{}).every(k=>Object.hasOwn(r.requiredItems||{},k))&&!(a.functions||[]).length));
   const itemKeys=Object.keys(r.requiredItems||{});
   function normalize(a){
    const z=structuredClone(a);z.funds=0;
    for(const k of itemKeys)delete z.items[k];
    return quotient.project(z);
   }
   // Only declared repeat costs may differ. Research, identity, armor,
   // initial stats, promotion, medals, base functions and all other items
   // must match in the full conditional world quotient.
   assert(v.world.funds<=w.funds);
   assert(itemKeys.every(k=>(v.world.items[k]||0)<=(w.items[k]||0)));
   const before=normalize(w),immediate=normalize(v.world);
   let target=v.world,steps=v.steps,kind="FIXED_REPEAT";
   if(immediate!==before){
    // The scoped objective explicitly restores cap growth after each
    // transformation. Do not claim that an intermediate reduced-stat
    // state is globally interchangeable or that alternate bodies cannot
    // return with more traits.
    if((first.byBody.get(inputs.body)||[]).some(q=>q.requiredMaxStats))return reason("MAX_STAT_GATE_PRESENT");
    const q=replay.grow({world:v.world,steps:v.steps});
    target=q.world;steps=q.steps;kind="CAP_RESTORED_REPEAT";
   }
   if(normalize(target)!==before)return reason("STATE_CHANGED");
   assert.equal(exactWorld(replay.replay(steps,w)),exactWorld(target));
   const a=replay.finish(w),b=replay.finish(target);
   assert.deepEqual(a.raw,b.raw);assert.deepEqual(a.capRaw,b.capRaw);assert.deepEqual(a.permanentVector,b.permanentVector);
   stats.repeatFixed++;stats.repeatCapRestored+=Number(kind==="CAP_RESTORED_REPEAT");
   return {id:r.id,reason:kind,evidence:{ruleHash:key(r),before:exactWorld(w),after:exactWorld(target),immediate:exactWorld(v.world),quotient:before,actions:steps,ordinaryMaterialIds:itemKeys,cost:r.cost||0,modelOnly:true}};
  }catch(e){stats.repeatUnresolved++;return reason("REPLAY:"+String(e.message).slice(0,100));}
 }
 function assess(inputs,branch,w=null){
  const q=first.assess(inputs),blocked=q.blocked.slice(),alternatives=[],open=[],repeats=[];
  const chosen=new Set(choices(branch)),forbidden=new Set([...(branch.blockedResearch||[]),...[...allChoices].filter(k=>!chosen.has(k))]);
  for(const x of q.open){
   const r=rules.get(x.id),conflict=x.missingResearch.filter(k=>forbidden.has(k));
   if(conflict.length){blocked.push({id:x.id,reason:"SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH",evidence:conflict});continue;}
   // Only committed mutually exclusive choices seed transitive exclusion.
   // Direct blockedResearch still has the original, narrower semantics.
   const excludedChoices=new Set([...allChoices].filter(k=>!chosen.has(k)));
   const irreversibleProofs=w?x.missingResearch.map(k=>irreversible.prove(w,k)).filter(Boolean):[];
   if(irreversibleProofs.length){blocked.push({id:x.id,reason:"IRREVERSIBLE_INDEXED_RESEARCH_EXCLUSION",evidence:irreversibleProofs});continue;}
   const proofs=x.missingResearch.map(k=>branchExclusion.prove(k,excludedChoices,inputs.active)).filter(Boolean);
   if(proofs.length){blocked.push({id:x.id,reason:"SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH_TRANSITIVE",evidence:{policy:"ALL_INDEXED_METHODS_BLOCKED_V1",proofs,modelOnly:true}});stats.transitiveExclusions++;continue;}
   if(x.destination!==inputs.body||x.clone||r?.producedItem){
    alternatives.push({...x,reason:x.clone?"OTHER_INDIVIDUAL":r?.producedItem?"ITEM_CONVERSION":"OTHER_FINAL_BODY"});continue;
   }
   const proof=w?fixedRepeat(x,inputs,w):null;
   if(proof){blocked.push(proof);repeats.push(proof);}
   else open.push(x);
  }
  const possibleExact=q.unknownRules.length===0&&inputs.historyKnown&&!q.openGrowth&&open.every(x=>eligible(x,inputs,true));
  return {...q,blocked,open,alternatives,repeats,possibleExact,missingResearch:[...new Set(open.flatMap(x=>x.missingResearch))].sort(),closed:inputs.historyKnown&&!q.openGrowth&&!open.length&&!q.unknownRules.length,allBodyClosed:q.closed};
 }
 return {assess,stats,scope:SCOPE};
}
