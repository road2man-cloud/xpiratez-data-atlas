// Conservative tie-breaker for already replay-compatible origin candidates.
// It does not certify global optimality or invent resource/time costs.
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
export function compareEqualScoreOriginRoutes(a, b) {
  if (!a) return 1;
  if (!b) return -1;
  const exclusions = excludedTrainingCount(a) - excludedTrainingCount(b);
  if (exclusions) return exclusions;
  const steps = transformationCount(a) - transformationCount(b);
  if (steps) return steps;
  // Unknown comparative research burden, resources, and time are NOT estimated.
  // Preserve source order when available evidence does not break the tie.
  return 0;
}
export function preferredOriginCandidate(current, candidate, score) {
  if (!current) return candidate;
  if (!candidate) return current;
  const candidateScore = score(candidate), currentScore = score(current);
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;
  return compareEqualScoreOriginRoutes(candidate, current) < 0 ? candidate : current;
}
