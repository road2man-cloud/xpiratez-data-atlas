# Soldier DB conditional growth increment — 2026-11-20

## Produced, not assumed
- `public/soldiers/modern/conditional-growth-math.js`: exact finite-state conditional growth distribution with explicitly supplied event kernel, attempts, effective-stat bonus offset, per-stat expected value, total convolution only when all 12 stats have specified kernels, and threshold probability.
- `public/soldiers/modern/app.js`: the existing birthplace-detail birth-distribution screen now contains a clearly labeled conditional growth experiment with a shared number of independent trials per stat and user-entered success rate. Successful trial adds +1, applies current body's combat cap to *raw* stats before the trial, preserves overshoot and already-high values.
- `tools/check-conditional-growth.mjs`: deterministic tests for last-event overshoot, cap preservation, trait bonus separation, missing kernels, partial distributions and probability invariants.

## Important scope boundary
The UI inputs are hypothetical; **they do not represent verified OXCE experience accumulation or training success probability**. Only the newborn distribution is source-derived. In particular this is not a completed probabilistic transformation path calculator or a claim of achievable campaign outcomes. When some of the twelve growth kernels are absent the total is not produced. No stochastic approximation is silently substituted when the exact state space exceeds the safety bound.

## Evidence
`node tools/check-conditional-growth.mjs`: passed.
`node --check public/soldiers/modern/app.js`: passed.
`node tools/check-route-table-compare.mjs`: passed.
`node tools/check-soldier-birth-rng.mjs`: passed (72 origins).
`node tools/check-route-table-browser.mjs`: passed.
`node tools/check-soldier-modern-browser.mjs`: passed.
`node tools/check-training-order-evidence.mjs`: passed (4,123 candidates).

## Unfinished
- Source-backed OXCE combat XP/recovery gain kernel and opportunities per stat.
- Full chronological probabilistic transformations / reset and training eligibility.
- Cost-aware global training order search and incomplete research routes.
- Browser test specifically exercising new conditional-growth inputs.
- Commit and remote push; intentionally not done because checkout has broad concurrent unrelated dirty changes.

## Checkout conservation
Current checkout: `D:\\xpiratez-data-atlas`, `main`, starting HEAD `f575458`. Existing dirty working tree and all other projects preserved. No branch/reset/checkout performed.
