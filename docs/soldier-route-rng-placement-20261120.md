# XPZ soldier DB — route RNG propagation and growth insertion explorer (2026-11-20)

## Produced in-place on main
- `public/soldiers/modern/birth-rng-math.js`: exports raw current/initial paired birth rolls, including fixed current overrides and different initial rolls; indexed min/max consistency is required.
- `public/soldiers/modern/route-roll-math.js`: propagates each of the 12 *per-stat* raw/initial joint finite distributions through the exact chronological transformation IDs of a registered witness. No fixed profile-specific path exceptions.
- `public/soldiers/modern/route-growth-placement.js`: exhaustive comparison of N+1 possible insertion boundaries for **one** explicitly hypothetical growth batch in **one** registered transformation sequence. Objectives: 12-stat expected sum or any of the 12 individual stat expectations.
- `public/soldiers/modern/app.js`, `index.html`, `origin-catalog.css`: existing 12-stat table receives a conditional route-RNG mean option, before-vs-after growth controls, reference deltas, conditional independent-birth pair odds, detail distributions, source-research links, and a per-candidate growth-boundary objective explorer. Nothing was moved to a second dashboard.
- `tools/check-route-roll-math.mjs` and extended `tools/check-route-table-browser.mjs`: source-population and interactive UI tests.

## Propagated mechanics and invariants
- Explicit original body, `producedSoldierType`, `allowedSoldierTypes`, required/forbidden transformation history, and direct flat changes.
- Uniform integer flat-range and percent-range effects when present; integer-truncating fixed/ranged percent changes on raw current and the *correlated* original initial stat. This preserves accumulated-growth sensitivity.
- Bravery changes rounded to tens. Min/max constraints, soft/hard upper-bound type, reroll masks and the new body's `maxStats` vs `statCaps` are kept separate. An inherited raw value above a cap is left alone by soft bounds. An explicit hard transformation cap can alter the original raw value per engine.
- Initial profile trait bonus ids, transformation history, `soldierBonusType`, `reset`, and selective `removeTransformations` are tracked chronologically; raw stats are NOT wiped by bonus resets. A duplicated bonus type is not accidentally double counted.
- Each stat's required minimum and maximum gate, optionally including soldier bonuses, conditions the surviving distribution. The product of the per-stat gate pass fractions is reported separately as a *stat-only* eligibility probability.
- Hypothetical event growth accepts exact integer increment kernels and counts at selected sequence boundaries; only raw current values below the current body's combat cap receive an event, allowing last-event cap overshoot. Original initial values remain unchanged.
- Each produced total distribution is the discrete convolution of the independent per-stat effective distributions; expected values, p10/p50/p90, selected threshold tails and conditional pair odds are derived from it.
- Failed source references, unknown source-to-initial correlation, invalid kernel, zero stat-gate chance, excess state space or unsupported same-body transformation fail closed rather than silently substituting a ceiling or an average.

## Explicit limitations
1. Transformation stochastic assumptions (independent uniform draws and independent per-stat constructor rolls) and non-stat research/material/facility/rank/wound/commendation eligibility are **conditions**, not proofs of campaign acquisition.
2. Real OXCE combat XP gain opportunities and gain probabilities are NOT automatically inferred. User-entered growth attempts and independent success rate are hypothetical; they cannot be presented as true final expected stats.
3. The `N+1` placement search optimizes the **one provided candidate's insertion boundary**, not the order of transformations, all research paths or overall campaign cost. A larger conditional expected mean can correspond to rare stat-gate eligibility; that separate probability remains visible.
4. Six source origins still have no registered research-complete candidate. Their route-RNG numbers stay uncomputed.
5. Exact per-stat propagation does not prove independence of all outcomes from stochastic events outside the indexed stat-change engine.

## Evidence (executed)
- `node tools/check-route-roll-math.mjs`: 72 origin newborn-parity cases; 66 first registered paths produced distribution; explicit growth-position, last-event cap, soft/hard bounds, history reset, removal, correlated initial/current, random change and stat-gate cases passed.
- `node tools/check-conditional-growth.mjs`: passed.
- `node tools/check-soldier-birth-rng.mjs`: 72 passed.
- `node tools/check-training-order-evidence.mjs`: 4,123 registered candidates / 11,416 steps passed.
- `node tools/check-route-table-browser.mjs`: passed with new route-mean mode, controls, route detail, threshold tails and per-candidate placement explorer.
- `node tools/check-soldier-modern-browser.mjs`: passed incl. mobile scroll/source integrity.
- See Git status and log for commit and remote deployment; no other families should be included in the commit.
