// Conditional replay-model equivalence, NOT equality of the original game
// world. In eligibility.js, history is read by presence except when a
// removal subtracts its count from a bonus. Bonuses contribute by ID;
// steps is an append-only explanation trace. Preserve all other fields,
// including map/set iteration order, resources, research and initial stats.
import {exactWorld,member} from "./population-growth-replay-core.mjs";
export const POLICY="NONREMOVABLE_PRESENCE_COUNTERS_V1";
export function createRepeatQuotient(data){
 const rules=data.transformations,byId=new Map(rules.map(r=>[r.id,r]));
 const removed=new Set(rules.flatMap(r=>r.removeTransformations||[]));
 const removableBonuses=new Set([...removed].map(id=>byId.get(id)?.soldierBonusType).filter(Boolean));
 const safeHistory=new Set(rules.map(r=>r.id).filter(id=>!removed.has(id)));
 const safeBonus=new Set(rules.map(r=>r.soldierBonusType).filter(id=>id&&!removableBonuses.has(id)));
 const proof={policy:POLICY,removed:[...removed].sort(),removableBonuses:[...removableBonuses].sort(),safeHistory:[...safeHistory].sort(),safeBonus:[...safeBonus].sort(),auditOnlyFields:["origin.state.steps"],scope:"Indexed conditional fixed-research live-transform/growth model only. No count-based acquisition or gameplay claim."};
 function project(w){
  const s=member(w)?.state;
  if(!(s?.history instanceof Map)||!(s?.bonusCounts instanceof Map)||!(s?.bonusIds instanceof Set)||!Array.isArray(s?.steps))return exactWorld(w);
  if([...s.history.values(),...s.bonusCounts.values()].some(n=>!Number.isSafeInteger(n)||n<=0))return exactWorld(w);
  if(s.bonusIds.size!==s.bonusCounts.size||[...s.bonusCounts.keys()].some(k=>!s.bonusIds.has(k)))return exactWorld(w);
  const copy=structuredClone(w),q=member(copy).state;
  for(const [id,n] of q.history)if(n>1&&safeHistory.has(id))q.history.set(id,1);
  for(const [id,n] of q.bonusCounts)if(n>1&&safeBonus.has(id))q.bonusCounts.set(id,1);
  q.steps=[];
  return exactWorld(copy);
 }
 return {project,proof};
}
