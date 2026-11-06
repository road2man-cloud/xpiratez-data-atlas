// Source-backed tie-breaking only among ALREADY recorded, replay-compatible routes.
// A 12-stat sum is not a full performance identity; different stat distributions
// or final soldier bodies are deliberately left unordered.
import {DISPLAY_STATS} from './score-12.js';

const viewFor=(candidate,metric)=>metric==='provisional'?candidate?.display:candidate?.growth;
// A caller must state WHICH numeric projection it is comparing. The score
// alone cannot establish equivalence across different ability distributions.
export function sameStatVector(a,b,statVector){
  if(!a||!b||a.finalSoldierType!==b.finalSoldierType||typeof statVector!=='function')return false;
  const left=statVector(a),right=statVector(b);
  return DISPLAY_STATS.every(key=>Number.isFinite(left?.[key])&&left[key]===right?.[key]);
}

export function sameProjectedOutcome(a,b,metric='growth'){
  if(!a||!b||a.finalSoldierType!==b.finalSoldierType)return false;
  const left=viewFor(a,metric),right=viewFor(b,metric);
  if(!left||!right||!Number.isFinite(left.total)||left.total!==right.total)return false;
  if(metric==='growth'&&(left.kind!=='conditional-upper-envelope'||right.kind!=='conditional-upper-envelope'))
    return false;
  return DISPLAY_STATS.every(key=>Number.isFinite(left.stats?.[key])&&left.stats[key]===right.stats?.[key]);
}
export function excludedTrainingCount(candidate) {
  const excluded=new Set();
  for(const rule of candidate?.trainingExclusions||[])
    for(const entry of rule.excludes||[])
      if(entry.id)excluded.add(entry.id);
  return excluded.size;
}
export function transformationCount(candidate){
  return (candidate?.steps||[]).filter(step=>step.type==='transform').length;
}
export function compareEqualScoreOriginRoutes(a,b,statVector){
  if(!a)return 1;
  if(!b)return -1;
  // Equal sums across different stats, or different final bodies, do not
  // establish equal combat performance. Retain original ordering instead.
  if(!sameStatVector(a,b,statVector))return 0;
  const exclusions=excludedTrainingCount(a)-excludedTrainingCount(b);
  if(exclusions)return exclusions;
  const steps=transformationCount(a)-transformationCount(b);
  if(steps)return steps;
  // We cannot rank unspecified resource, availability or research cost.
  return 0;
}
export function preferredOriginCandidate(current,candidate,score,statVector){
  if(!current)return candidate;
  if(!candidate)return current;
  const candidateScore=score(candidate),currentScore=score(current);
  if(candidateScore>currentScore)return candidate;
  if(candidateScore<currentScore)return current;
  return compareEqualScoreOriginRoutes(candidate,current,statVector)<0?candidate:current;
}
export function auditEqualOutcomeRoutes(selected,candidates,metric='growth'){
  const all=(candidates||[]).filter(c=>viewFor(c,metric)?.total===viewFor(selected,metric)?.total);
  const equivalent=all.filter(c=>sameProjectedOutcome(selected,c,metric));
  const differing=all.length-equivalent.length;
  const selectedSteps=transformationCount(selected);
  const minSteps=Math.min(selectedSteps,...equivalent.map(transformationCount));
  const longer=equivalent.filter(c=>transformationCount(c)>selectedSteps);
  return {
    equivalentCount:equivalent.length,
    differingOutcomeSameTotalCount:differing,
    selectedSteps,minSteps,
    longerCount:longer.length,
    shorterCount:equivalent.filter(c=>transformationCount(c)<selectedSteps).length,
    longerExamples:longer.slice(0,3).map(c=>({id:c.id,transforms:[...(c.transforms||[])]}))
  };
}
