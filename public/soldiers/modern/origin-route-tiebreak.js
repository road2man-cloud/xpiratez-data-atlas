// Conservative tie-breaker among source-backed, replay-compatible candidates.
// Equal totals alone do NOT establish equal 12-stat performance.
import {DISPLAY_STATS} from './score-12.js';

const growthVector=c=>c?.growth?.kind==='conditional-upper-envelope'?c.growth.stats:null;
export function sameStatVector(a,b,statVector=growthVector){
  if(!a||!b||a.finalSoldierType!==b.finalSoldierType||typeof statVector!=='function')
    return false;
  const left=statVector(a),right=statVector(b);
  return DISPLAY_STATS.every(k=>Number.isFinite(left?.[k])&&left[k]===right?.[k]);
}
export function excludedTrainingCount(candidate){
  const excluded=new Set();
  for(const rule of candidate?.trainingExclusions||[])
    for(const entry of rule.excludes||[])
      if(entry.id)excluded.add(entry.id);
  return excluded.size;
}
export function transformationCount(candidate){
  return (candidate?.steps||[]).filter(step=>step.type==='transform').length;
}
export function compareEqualScoreOriginRoutes(a,b,statVector=growthVector){
  if(!a)return 1;
  if(!b)return -1;
  // If either final body or ANY of the 12 stat ceilings differs, the routes
  // have no established dominance based on stage count. Preserve source order.
  if(!sameStatVector(a,b,statVector))return 0;
  const exclusions=excludedTrainingCount(a)-excludedTrainingCount(b);
  if(exclusions)return exclusions;
  const steps=transformationCount(a)-transformationCount(b);
  if(steps)return steps;
  // Unverified research, material, training time and probability costs are
  // never assigned a made-up numeric value.
  return 0;
}
export function preferredOriginCandidate(current,candidate,score,statVector=growthVector){
  if(!current)return candidate;
  if(!candidate)return current;
  const a=score(candidate),b=score(current);
  if(a>b)return candidate;
  if(a<b)return current;
  return compareEqualScoreOriginRoutes(candidate,current,statVector)<0?candidate:current;
}
