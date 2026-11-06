// Conservative tie-breaker for already replay-compatible origin candidates.
// Equal 12-stat SUMS are not equivalent if their stat vectors differ.
// It does not certify global optimality or invent resource/time costs.
import {DISPLAY_STATS} from './score-12.js';
export function excludedTrainingCount(candidate) {
  const excluded = new Set();
  for (const rule of candidate?.trainingExclusions || [])
    for (const entry of rule.excludes || [])
      if (entry.id) excluded.add(entry.id);
  return excluded.size;
}
export function transformationCount(candidate) {
  return (candidate?.steps || []).filter(step => step.type === 'transform').length;
}
export function sameRouteStatVector(a,b,metric='growth') {
  const projected=c=>metric==='growth'&&c?.growth?.kind==='conditional-upper-envelope'
    ?c.growth.stats:metric==='provisional'?c?.display?.stats:null;
  const x=projected(a),y=projected(b);
  return !!(x&&y&&DISPLAY_STATS.every(k=>
    Number.isInteger(x[k])&&Number.isInteger(y[k])&&x[k]===y[k]));
}
export function compareEqualScoreOriginRoutes(a, b, metric='growth') {
  if (!a) return 1;
  if (!b) return -1;
  // A different distribution can offer a genuinely different tactical role.
  // Do not call it a shorter equivalent route merely because SUM(total) ties.
  if (!sameRouteStatVector(a,b,metric)) return 0;
  const exclusions = excludedTrainingCount(a) - excludedTrainingCount(b);
  if (exclusions) return exclusions;
  const steps = transformationCount(a) - transformationCount(b);
  if (steps) return steps;
  // Unknown comparative research burden, resources, and time are NOT estimated.
  // Preserve source order when available evidence does not break the tie.
  return 0;
}
export function preferredOriginCandidate(current, candidate, score, metric='growth') {
  if (!current) return candidate;
  if (!candidate) return current;
  const candidateScore = score(candidate), currentScore = score(current);
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;
  return compareEqualScoreOriginRoutes(candidate, current, metric) < 0 ? candidate : current;
}
