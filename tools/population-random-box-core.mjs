// Exact maximal-outcome quotient for the currently supported random action
// family: independent integer flat changes. Reject other RNG families rather
// than silently treating a representative roll as exhaustive.
import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {createClosureModel,ruleList} from "./population-closure-core.mjs";
import {createSimulationChecker} from "./population-antichain-core.mjs";
export const MODEL="BIRTH_AND_FLAT_ROLL_BOX_ANTICHAIN_V1";
export function createRandomBoxModel(data,snapshot){
 const original=ruleList(data),bodies=new Map(data.soldiers.map(b=>[b.id,b])),changes=new Map(),changed=[];
 for(let i=0;i<original.length;i++){
  const r=original[i];
  assert(["percentGainedStatChange","percentGainedMin","percentGainedMax"].every(f=>STAT_KEYS.every(k=>Number(r[f]?.[k]||0)<=0)),"Birth dominance coefficient changed "+r.id);
  const dest=r.allowedSoldierTypes.map(k=>bodies.get(r.producedSoldierType||k));
  assert(dest.every(Boolean),"Unknown body "+r.id);
  if(deterministicRule(r,dest))continue;
  const lo={},hi={};let combinations=1n;
  for(const k of STAT_KEYS){
   assert(Number(r.percentMin?.[k]||0)===Number(r.percentMax?.[k]||0),"Unsupported random percent "+r.id);
   assert(Number(r.percentGainedMin?.[k]||0)===Number(r.percentGainedMax?.[k]||0),"Unsupported random gained percent "+r.id);
   assert(!r.rerollStats?.[k]||dest.every(b=>b.minStats[k]===b.maxStats[k]),"Unsupported random reroll "+r.id);
   lo[k]=Number(r.flatMin?.[k]||0);hi[k]=Number(r.flatMax?.[k]||0);
   assert(Number.isSafeInteger(lo[k])&&Number.isSafeInteger(hi[k])&&lo[k]<=hi[k],"Invalid flat interval "+r.id);
   combinations*=BigInt(hi[k]-lo[k]+1);
  }
  assert(combinations>1n);
  // At fixed raw/initial the engine's change rounding, lower clipping and
  // hard/soft upper clipping are monotone in the additive flat change.
  // All-max is a member of the explicitly independent integer roll box.
  // Its successor therefore dominates every valid smaller outcome, at
  // unchanged discrete fields and unchanged initial stats.
  changes.set(r.id,{...r,flatMin:hi,flatMax:hi});
  changed.push({index:i,id:r.id,lower:lo,upper:hi,independentRollCount:combinations.toString()});
 }
 const modified={...data,transformations:data.transformations.map(r=>changes.get(r.id)||r)};
 const model=createClosureModel(modified,snapshot),checker=createSimulationChecker(modified,model);
 assert.deepEqual(model.rules.map(r=>r.id),original.map(r=>r.id));
 assert(model.rules.every(r=>deterministicRule(r,r.allowedSoldierTypes.map(k=>bodies.get(r.producedSoldierType||k)))));
 const changedIds=new Set(changed.map(r=>r.index)),changedMask=changed.reduce((m,r)=>m|model.bits[r.index],0n);
 return {model,checker,changed,changedIds,changedMask};
}
