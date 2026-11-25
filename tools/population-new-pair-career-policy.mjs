// Explicitly distinguish permanent bonuses from assumed medal decoration.
// Default rank list is the existing conditional OXCE policy, not proof of
// the exact installed engine build.
import {createCareerReplay} from "./population-chronological-career-core.mjs";
import {createGrowthReplay} from "./population-growth-replay-core.mjs";
import {defaultRankData,RANK_POLICY} from "./population-frontier-default-rank.mjs";
export const POLICY={id:"NEW_PAIR_CONDITIONAL_RANK_MEDAL_V1",rankPolicy:RANK_POLICY,medalDecorationExcluded:true};
export function createNewPairCareerPolicy(data){
 const indexed=defaultRankData(data),g=createCareerReplay(indexed.data),legacy=createGrowthReplay(data);
 const hasCareer=steps=>steps.some(a=>a.type==="conditionalPromotion"||a.type==="conditionalMedal");
 function finish(w,steps){
  if(!hasCareer(steps))return legacy.finish(w);
  const f=g.finish(w);
  return {body:f.body,raw:f.raw,bonus:f.permanentBonus,vector:f.permanentVector,capRaw:f.capRaw,capVector:f.permanentCapVector,medalInclusiveBonus:f.bonus,medalInclusiveVector:f.vector,rank:f.rank,medals:f.medals,careerPolicy:POLICY.id};
 }
 return {g,finish,hasCareer,rankDefaultBodies:indexed.indexed};
}
