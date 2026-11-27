# V107 / V24 overcap timing integration

Restores both replayable growth-before/after timings for catalogued body/rule pairs, preserving V23 exact-leaf, passive-armor, ready-graph, material/context and final-admission gates. Compare same roll bands only, excluding medal-assisted outcomes. Aliases are not new states. V106 and V23 remain immutable; V107 verifies V112/V111 source fingerprints and graph digest, migrates to policy V113. Optional `--closure-overcap-only=1` is scheduling only, not closure evidence.

Run `node tools/test-population-overcap-passive-armor-v24.mjs` and V107 in a disposable copy of the current ledger before publishing output. Do not run V106 on a migrated V113 ledger. No public data or final counts are changed by this source commit.
