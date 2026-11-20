# X-Piratez 2.1 (v.o2) — observed newborn / minimum recruitment criteria

Date: 2026-11-20
Placement: existing `public/soldiers/modern` registered-route comparison detail. No independent premium dashboard and no separate Git branch.

## Shipped implementation

1. `public/soldiers/modern/birth-selection.js`: conditional filtering of the SAME per-stat joint `(current raw, original initial raw)` newborn draws. Two distinct criteria:
   - `{mode:'exact',stats:{tu:...,firing:...}}`: exactly the on-screen newborn effective values the player measured, with missing keys unconstrained.
   - `{mode:'atLeast',stats:{tu:...,firing:...}}`: initial recruiting policy requiring at least each specified effective value.
   The filter maps raw stats to effective displayed stats using inherited bonuses and the PsiSkill/Health floor rules. All retained joint raw/initial probabilities are normalized. No float interpolation, clamping to a “plausible” value, or invented roll when an exact observed stat is impossible.
2. `public/soldiers/modern/route-roll-math.js`: applies birth selection BEFORE hypothetical combat-growth and BEFORE every registered chronological transformation and stat gate. For each path, returns:
   - `birthSelectionProbability`: probability a fresh recruit from that source would satisfy the initial filter;
   - `statGateProbability`: probability of passing *stat requirements* of the path, **conditional on the initial filter**;
   - `jointStatEligibilityProbability`: the product of those two conditioned probabilities, still excluding research/material/time/rank/event feasibility;
   - exact per-stat marginal and total distributions, expectations, quantiles, in the conditional surviving cohort.
   Improbable initial observations and impossible training stat gates are distinct results. The original initial raw value stays associated with the correct current raw value for earned-percent transformations.
3. `public/soldiers/modern/route-candidate-expectation.js`: propagates the caller's selection into each source-compatible candidate separately. Inconsistent initial observations become `birth-incompatible` rather than quietly turning into minimum performance or 0-gate paths.
4. `public/soldiers/modern/app.js` / `origin-catalog.css` / `index.html`: user enters up to 12 newborn stats, selecting exact observed values or minimum recruiting thresholds; can auto-fill original min values or clear. Unsupported newborn outcomes explain the impossible stat and the documented source range. Separate columns show stage stat-eligibility given birth selection and new-random-recruit chance of clearing both selection and stage stat gates. A per-selected-candidate 12-stat before/after comparison isolates the selection effect from added training. A per-origin input map retains observation values when switching candidates; the route ranking and goal filters are cached while the underlying source and growth scenario remain unchanged.
5. `tools/check-soldier-birth-selection.mjs`: source-compatible synthetic and parent/child initial-raw correlation examples, exact/min gates, impossible bravery rolls, post-bonus PsiSkill special handling, and zero-probability classification.
6. `tools/check-route-table-browser.mjs`: interactive source-wide ranking, conditional observation, impossible source roll rejection, selection fields persisting across route navigation, and original Chort isolation.
7. `package.json`: includes the new probability checks in `check:soldiers:modern` and the interactive route table in `check:soldiers:modern:browser`.

## Practical reading / exceptions

- **Observed newborn** mode answers, “Given that this newly generated recruit is observed to have effective TU X, what are the remaining uncertainty and selected path stat requirements?” This is a conditional distribution, not the probability of spawning that very same known recruit.
- **Recruit minimum** mode answers, “How often would newly generated recruits satisfy this hiring policy, and, among those passing, what fraction would meet each registered route's stat prerequisites?” It does NOT include acquiring the recruit source or paying the training costs.
- A boosted soldier's current values AFTER combat, training, transformations, armor or commendations are not necessarily valid newborn observations. Do not back-infer a birth roll from those values; that would require a full chronological inverse model.
- Unsupported birth inputs must fail closed; an unregistered research path remains unproved, not impossible.
- Selection-conditioned math requires the established source generation rules: the origin profile, Soldier constructor roll ranges and inherited SoldierBonus type/count. If the underlying game source contradicts the indexed original-initial correlation or generated stat distribution, the probability model must be rederived, not “corrected” with a heuristic.
- The stat gate probability and the expected final stats are **not** multiplied into a made-up quality index. A candidate with high expected output but low gate chance is visible as a distinct risk/benefit tradeoff.
- Probability calculations assume constructor stats and subsequent transformation draws independent **per stat** as reflected in the currently indexed model. These are not proofs of overall game-campaign completion or global route optimality.

## Evidence executed
- `node tools/check-soldier-birth-selection.mjs`: passed.
- `node tools/check-route-candidate-expectation.mjs`: passed.
- `node tools/check-route-roll-math.mjs`: passed.
- `node tools/check-route-table-browser.mjs`: passed with newborn selection, impossible exact values, per-origin retained inputs, threshold filters, and same-origin cached route selection.
- Existing source-first soldier browser tests: passed.

Git and deployment status must be reported separately from these tests; a passing test alone is not deployment.
