# V60 conditional transformation endpoint production

Parent: 6d1975ccb828c2a4a69562d6f4d8953263a1385b (V59). Source: v.o2 index a7e64ad8b071c557a0194f26e811dcfc460a1b50; production bootstrap checked local source rule hashes.

## Implementation
V59 had 264 rejections from the exact-state guard after STR_REVOLUTIONARY_TRAINING, caused by unresolved random stat changes rather than wounds. Added an opt-in conditionalTransformRoll action with explicit min/max endpoint selection for indexed flat, percent and gained-percent ranges. The action validates the source fingerprint and integer ranges, invokes the same transactional transformation gates and records the selected vector on the member. Ordinary transformation behavior is unchanged. Random rerollStats are rejected rather than guessed. Endpoint scenarios do not prove joint native RNG reachability, frequency, calendar, or actual achieved growth/promotion.

## Results
Same graph V16, states 1873,1874,1875; all direct profiles, up to four distinct trainings, min birth vector, conditional promotion and unlimited finance.
- Each band: 1610 attempts, 1604 successes, six rejections, zero pending. All 264 V59 exact-state rejections recovered in both bands. Six remaining rejections: promotion-rank-list-unindexed for STR_SOLDIER_S.
- Each band: 1108 rows with a conditional transformation roll, 69 distinct profile/ordered training/body sequences, 1292 distinct profile/body/ordered training/growth placement/effective vector keys.
- Combined: 2712 distinct action/state route identities, 496 common routes counted once, 141 distinct profile/body/effective vectors.
- Best single-witness totals: farmer 1144 (max endpoint), slave 1070, STR_SOLDIER_S 1116. V59 farmer best 1104. Farmer max-endpoint witness trains STR_BASIC_FIREARMS_TRAINING, STR_MILITIA_TRAINING, STR_NEPOTISM, STR_REVOLUTIONARY_TRAINING with growth checkpoints 0 and 4. No global maximum or native certification claimed.
- Growth-only-enabled sequences: zero in this search.

## Artifacts
- career-growth-v60-revolution-min.json.gz SHA256 f2ac4bbe812ee32a88bbc8e36e4533147d89d31ee01eaf33f302773153e2858c
- career-growth-v60-revolution-max.json.gz SHA256 2687baf278f140bd51858d196bf4d223277c02f90d8da823341847b0efdbaad7
- career-growth-v60-min-witness-index.json SHA256 c0d6d3637111b97940b23e22a523c5bb8da4053fba33433ae0229f3410d628c8
- career-growth-v60-max-witness-index.json SHA256 b5ed216ed8444f362e35b096f16b7e416fecfe4e6096237e60257411fe9aab12
- career-growth-v60-combined-witness-index.json SHA256 97269d37e1ffdc7d3bbdd9d95d7963750ec9b358fb2b5d23fe9f830c1b987f1f

## Reproduction
Use existing v.o2 local source and Node.js/js-yaml. Run both bands, preserving previous outputs.
```sh
for band in min max; do
  node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v16-revolution-supply.json --growthSearch=1 --careerOut=career-growth-v60-revolution-$band.json --states=1873,1874,1875 --maxTrainings=4 --maxAttempts=4000 --financeMode=unlimited --conditionalPromotion=1 --rollBand=$band
  node tools/atlas-v58-career-growth-index.mjs career-growth-v60-revolution-$band.json campaign-forward-tree-v16-revolution-supply.json career-growth-v60-revolution-$band.json.gz career-growth-v60-$band-witness-index.json
done
node tools/atlas-v60-roll-witness-merge.mjs career-growth-v60-min-witness-index.json career-growth-v60-max-witness-index.json career-growth-v60-combined-witness-index.json
```
No local Python. Canonical branch mapping and shared registry/UI integration are still pending; the merged index is an intermediate route-level artifact with both ledger references retained. Do not treat independent maxima as a simultaneous vector. No changes to main intended.
