# V58 conditional growth placement production

Parent: V57 publication 39fd7c3e6c8e3656fc6fa22fb52fcc49e2c65cc0. Source rules were checked by the existing v.o2 bootstrap at pinned index commit a7e64ad8b071c557a0194f26e811dcfc460a1b50.

## Production
- 45 previously successful direct-hire routes, three graph states.
- 468 checkpoint-subset replays, 468 successful, 0 failed, 0 unprocessed, 0 excluded.
- 156 distinct profile/body/ordered training/growth placement/effective-vector keys; 16 distinct profile/body/effective-vector keys.
- All 45 no-growth baselines matched the original final-state hashes.
- Each growth checkpoint uses the existing explicit conditionalCapGrowth action. Promotions are conditional and rank-validated. No native RNG, combat opportunity, promotion achievement or calendar proof is provided.
- The initial uncached command timed out after 120 seconds without an output observed. The improved producer reuses cloned, state-hash-checked research prefixes and completed a separate output file.

## Artifacts
- career-growth-v58-nepotism.json.gz: complete replay ledger, gzip SHA-256 059696aab38ecf708b7eb47d8ecbb56990ff98eb52365864ed79f72b1e55e3fd; uncompressed SHA-256 2f725fe843e1a5c1bd2a3396bf0bfb5f81a4dd66fbfb7a64e5ca2e3f053f3aba.
- career-growth-v58-witness-index.json: route-level witness index, SHA-256 11299f8f6365f261699346c3f1c54061253e1ad6b8e29cafb3144cc15f5cb7af.
- Canonical branch IDs are deliberately null until mapped to the existing canonical filter contract. No shared registry or UI has been modified. Do not display these as game-certified or globally optimal results.
- In this bounded set a single witness at state 1721, growth slot [0], ordered STR_BASIC_FIREARMS_TRAINING, STR_MILITIA_TRAINING, STR_NEPOTISM has effective total 1104 and mana 176 (raw 160, bonus 16).

## Reproduce
Use Node.js, js-yaml, the local hash-verified v.o2 source, and a fresh output name:
```sh
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v14-nepotism-career.json --growthSeed=career-permutations-v57-nepotism-promotion.json --careerOut=career-growth-v58-nepotism-cached.json --maxAttempts=1000
node tools/atlas-v58-career-growth-index.mjs career-growth-v58-nepotism-cached.json campaign-forward-tree-v14-nepotism-career.json career-growth-v58-nepotism.json.gz career-growth-v58-witness-index.json
```
No local Python was used. The growth enumeration is restricted to previously successful training sequences; it does not explore training sequences unlocked only by prior growth. Future work must generate these additional candidate sequences and integrate conditionally evidenced witnesses through the shared registry without changing its default one-row-per-body comparison.
