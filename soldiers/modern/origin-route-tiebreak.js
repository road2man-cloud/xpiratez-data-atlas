// Conservative source-witness tie evaluation for conditional 12-stat soldier ceilings.
// A matching total is NOT evidence that the same tactical stat vector is achievable.
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
export function routeStats(candidate, metric = 'growth') {
  const stats = metric === 'growth' && candidate?.growth?.kind === 'conditional-upper-envelope'
    ? candidate.growth.stats : metric === 'provisional' ? candidate?.display?.stats : null;
  return stats && DISPLAY_STATS.every(k => Number.isInteger(stats[k])) ? stats : null;
}
export function sameRouteStatVector(a, b, metric = 'growth') {
  // A numeric vector cannot stand in for a different final soldier body.
  // The body also determines armor, perks and future eligibility.
  if (!a?.finalSoldierType || a.finalSoldierType !== b?.finalSoldierType) return false;
  const left = routeStats(a, metric), right = routeStats(b, metric);
  return !!(left && right && DISPLAY_STATS.every(k => left[k] === right[k]));
}
export function compareEqualScoreOriginRoutes(a, b) {
  if (!a) return 1;
  if (!b) return -1;
  const exclusions = excludedTrainingCount(a) - excludedTrainingCount(b);
  if (exclusions) return exclusions;
  const steps = transformationCount(a) - transformationCount(b);
  if (steps) return steps;
  // Unknown research, resource and time burden must never become an invented ranking.
  return 0;
}
export function preferredOriginCandidate(current, candidate, score, metric = 'growth') {
  if (!current) return candidate;
  if (!candidate) return current;
  const candidateScore = score(candidate), currentScore = score(current);
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;
  // Same aggregate ceiling but different skill distribution is a trade-off, NOT a tie.
  if (!sameRouteStatVector(current, candidate, metric)) return current;
  return compareEqualScoreOriginRoutes(candidate, current) < 0 ? candidate : current;
}
export function routeTieEvidence(candidates, selected, score, metric = 'growth') {
  if (!selected || !routeStats(selected, metric))
    return {sameVector:[],differentVector:[],equalTotal:[]};
  const equalTotal = candidates.filter(c =>
    score(c) === score(selected) && routeStats(c, metric));
  const sameVector = equalTotal.filter(c => sameRouteStatVector(c, selected, metric));
  const differentVector = equalTotal.filter(c => !sameRouteStatVector(c, selected, metric));
  return {sameVector,differentVector,equalTotal};
}
