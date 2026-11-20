# X-Piratez v.o2 soldier DB — source-wide conditional path expectation comparison

**Date**: 2026-11-20
**Source policy**: 2.1 v.o2 rules and matching Korean catalog; no legacy Piratez.rul fallback.
**Scope**: Existing `public/soldiers/modern` dashboard, not a second route planner.

## Actual implementation

- `public/soldiers/modern/route-candidate-expectation.js`: compute a memory-bounded summary of ONE signed registered candidate via `registeredRouteDistribution`, then rank summaries from one origin. The module returns expected 12-stat total, all 12 marginal expectations, probability of passing stat gates, final body, research/transform counts, explicit unsupported and zero-gate results.
- `public/soldiers/modern/app.js`: in the existing detail view's `route-expected` mode, the user may scan ALL registered origin-compatible routes and compare them by total or any individual stat. Candidate buttons open original chronological research evidence. The separate Chort terminal group is never included in the ordinary birth ranking.
- User filters: goal among 12 stat targets or total; minimum stat-only eligibility 0 / 50 / 90 / almost 100 percent; final body. The result also identifies the two-dimensional nondominated choices **within each final body only** on the axes of target expected value and stat-only eligibility. Neither stat-gate probability nor expected value is arbitrarily multiplied by the other.
- The comparison preserves current global hypothetical combat growth timing, attempts and success probability by applying the *same requested assumption* to each registered route (the end boundary is relative to each candidate). These inputs DO NOT pretend to reproduce real OXCE XP rules.
- Responsive output shows first 15 matching candidates, remaining candidates in an expandable table, distinct exact zero-probability stat-gate cases and unresolved model cases. A cancelled/closed view cancels incomplete scans, and async chunks keep the browser responsive. Refiltering or changing the goal re-ranks cached summaries immediately without repeating source probability computations.
- `origin-catalog.css` and `index.html`: styles, loader cache versions and methodology text updated.
- `tools/check-route-candidate-expectation.mjs`: deterministic source-connected and synthetic no-imputation tests.
- `tools/check-route-table-browser.mjs`: end-to-end scanner, filter changes and source candidate navigation.

## Semantics / must-not-claim
- The ranking is conditional on **stat gate success AND non-stat prerequisites being satisfied**, not the absolute probability of achieving a campaign route.
- A path with low gate chance may have high final conditional average, so chances are shown separately. A candidate with zero stat gate success does not get a fake final value. An unknown rule results in a separate unverified record, not a zero score.
- 2D frontier uses only one chosen expectation target and the stat-only pass probability, grouped by final soldier type. It does NOT establish superiority across all 12 stats, combat traits, research costs, abilities, equipment, rank, events, time, or acquisition.
- The records are the current **registered** campaign-compatible finite set; missing paths or incomplete global search are not impossibility proofs.
- No source-index transformation, game executable, save, or other worker-owned feature files are changed.

## Executed evidence before publication
- `node tools/check-route-candidate-expectation.mjs`: passed, including same-source roll parity, 12 goals, separate body groups, conditional risk tradeoffs, duplicate IDs, missing-stat sources, explicit unsupported growth assumptions.
- `node tools/check-route-table-browser.mjs`: passed across original 12-stat comparison, new source-wide candidate scanner, re-filtering without rerunning probability propagation, candidate opening, and separate Chort group.
- `node tools/check-route-roll-math.mjs`: passed across 72 source origins and transformation/growth cases.
- Commit status and remote push should be recorded only after successful Git operations.
