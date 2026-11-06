// A matching 12-stat total is not proof of the same soldier performance.
// Only compare source-replayed routes with the SAME final body and complete
// 12-stat projection; research/material/growth-time costs remain unranked.
import {DISPLAY_STATS} from './score-12.js';

export function excludedTrainingCount(candidate){
  // When original v.o2 rules are loaded, count only future options for the
  // SAME final body and include prerequisite cascades after any history reset.
  // The archived unfiltered exclusions remain as a legacy fallback for tests.
  if(candidate?.futureOptions?.kind==='structural-only'&&
      Number.isInteger(candidate.futureOptions.total))return candidate.futureOptions.total;
  const excluded=new Set();
  for(const rule of candidate?.trainingExclusions||[])
    for(const entry of rule.excludes||[])
      if(entry.id)excluded.add(entry.id);
  return excluded.size;
}
export function transformationCount(candidate){
  return (candidate?.steps||[]).filter(step=>step.type==='transform').length;
}
export function routeStats(candidate,metric='growth'){
  const stats=metric==='growth'&&candidate?.growth?.kind==='conditional-upper-envelope'
    ?candidate.growth.stats:metric==='provisional'?candidate?.display?.stats:null;
  return stats&&DISPLAY_STATS.every(key=>Number.isFinite(stats[key]))?stats:null;
}
export function sameStatVector(a,b,statVector){
  if(!a?.finalSoldierType||a.finalSoldierType!==b?.finalSoldierType||
    typeof statVector!=='function')return false;
  const left=statVector(a),right=statVector(b);
  return DISPLAY_STATS.every(key=>Number.isFinite(left?.[key])&&left[key]===right?.[key]);
}
export function sameRouteStatVector(a,b,metric='growth'){
  if(!a?.finalSoldierType||a.finalSoldierType!==b?.finalSoldierType)return false;
  const left=routeStats(a,metric),right=routeStats(b,metric);
  return !!(left&&right&&DISPLAY_STATS.every(key=>left[key]===right[key]));
}
export function sameProjectedOutcome(a,b,metric='growth'){
  const left=metric==='growth'?a?.growth:a?.display;
  const right=metric==='growth'?b?.growth:b?.display;
  return !!(Number.isFinite(left?.total)&&left.total===right?.total&&
    sameRouteStatVector(a,b,metric));
}
export function compareEqualScoreOriginRoutes(a,b,metric='growth'){
  if(!a)return 1;
  if(!b)return -1;
  if(!sameRouteStatVector(a,b,metric))return 0;
  const exclusions=excludedTrainingCount(a)-excludedTrainingCount(b);
  if(exclusions)return exclusions;
  const stages=transformationCount(a)-transformationCount(b);
  if(stages)return stages;
  // Unknown research, resource and growth effort cannot become a fake ranking.
  return 0;
}
export function preferredOriginCandidate(current,candidate,score,metric='growth'){
  if(!current)return candidate;
  if(!candidate)return current;
  const candidateScore=score(candidate),currentScore=score(current);
  if(candidateScore>currentScore)return candidate;
  if(candidateScore<currentScore)return current;
  // Equal totals from different bodies or stat allocations retain input order.
  return compareEqualScoreOriginRoutes(candidate,current,metric)<0?candidate:current;
}
export function routeTieEvidence(candidates,selected,score,metric='growth'){
  if(!selected||!routeStats(selected,metric))
    return {sameVector:[],differentVector:[],equalTotal:[]};
  const equalTotal=(candidates||[]).filter(c=>
    score(c)===score(selected)&&routeStats(c,metric));
  const sameVector=equalTotal.filter(c=>sameProjectedOutcome(c,selected,metric));
  const differentVector=equalTotal.filter(c=>!sameProjectedOutcome(c,selected,metric));
  return {sameVector,differentVector,equalTotal};
}
export function auditEqualOutcomeRoutes(selected,candidates,metric='growth'){
  const view=c=>metric==='growth'?c?.growth:c?.display;
  const all=(candidates||[]).filter(c=>view(c)?.total===view(selected)?.total);
  const equivalent=all.filter(c=>sameProjectedOutcome(selected,c,metric));
  const selectedSteps=transformationCount(selected);
  const longer=equivalent.filter(c=>transformationCount(c)>selectedSteps);
  return {
    equivalentCount:equivalent.length,
    differingOutcomeSameTotalCount:all.length-equivalent.length,
    selectedSteps,
    minSteps:Math.min(selectedSteps,...equivalent.map(transformationCount)),
    longerCount:longer.length,
    shorterCount:equivalent.filter(c=>transformationCount(c)<selectedSteps).length,
    longerExamples:longer.slice(0,3).map(c=>({id:c.id,transforms:[...(c.transforms||[])]}))
  };
}
