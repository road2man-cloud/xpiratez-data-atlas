# V62 mixed-event and Lamia career production

Parent: 1fede11cd9594e0eab361ba3a0ed505568bf18cd (V61). Source: X-Piratez v.o2 pinned index a7e64ad8b071c557a0194f26e811dcfc460a1b50 and local source rules checked by the bootstrap.

## Implementation
The STR_BLESSINGS event can grant STR_WASTELAND_PRIESTESS and STR_MUTANT_BLESSINGS x1 together. Its raw reward, interruptResearch, timer, difficulty, script weights and negative research trigger were checked against the local rules and indexed event route. The dedicated mixed-event executor preserves pre-event trigger checks and rejects repeated or interrupted events. The source archive confirms event item transfer and research award handling; actual event scheduler, item delivery and timing are conditional. Event execution odds are 23%, not an unconditional guarantee. No external item or research injection was used. The graph continuation supports explicit monotonic event-policy expansion and marks inherited expansion metadata stale until reevaluated.

## Production
- V18: 2561 states, 5309 edges, 230 distinct research IDs, max depth 62; 2529 frontier states. Not exhaustive.
- 32 STR_BLESSINGS eventResearch edges across alternative campaign states, not 32 events within one campaign.
- 32 non-pending states with active STR_LAMIA_RECRUITMENT among newly generated states, split across two alternative training sets.
- Lamia: 312/312 successes, zero failures or pending; 288 unique ordered placement/effective-vector keys, 26 distinct training sequences, 33 distinct effective vectors. Selected state 2472 (156 paths), state 2488 (156 paths).
- Best single witness: state 2472, basic firearms training, nepotism, revolutionary training; growth slots 0 and 3; max conditional roll, min birth, conditional promotion, unlimited finance. Effective total 1191. TU 105, stamina 200, health 100, bravery 110, reactions 70, firing 100, throwing 90, strength 65, psiStrength 65, psiSkill 30, melee 110, mana 146.
- Growth-only enabled sequences: zero. Existing mutually exclusive paths are not merged. The new index does not certify native promotion, RNG, or global maximum.

## Artifacts
- campaign-forward-tree-v18-lamia.json SHA-256 897d48c3e91ab711fd1f76bd03e59116a62a79d9ff2d9e6a7d78b6fa9999be6f
- career-growth-v62-lamia.json.gz SHA-256 916fcbfa39e6381937ae701449a8e10583120582fe5a2d991a95e36f10d92c91
- career-growth-v62-lamia-index.json SHA-256 a8c672a6e7aac04edcff2704b62de3442028e1a3d5fdcd4562ac9c7e8164b11b

## Reproduce
Use Node.js, js-yaml and the hash-checked v.o2 local rules. Use fresh output names to preserve earlier artifacts.

```sh
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v18-lamia.json --forwardResume=campaign-forward-tree-v17-hard-knocks.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT,STR_MOONSHINE_XXX --forwardFinanceMode=unlimited --forwardDepth=80 --forwardNodes=3500 --forwardFocusNodes=1907,1925 --forwardPriorityResearch=STR_WASTELAND_PRIESTESS,STR_MUTANT_BLESSINGS,STR_LAMIA_RECRUITMENT,STR_EXCAVATION --forwardPriorityOnly=1 --forwardBlessings=1 --forwardAllowEventExpansion=1
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v18-lamia.json --growthSearch=1 --careerOut=career-growth-v62-lamia.json --states=2472,2488 --profiles=direct:STR_SOLDIER_LAMIA --maxTrainings=4 --maxAttempts=2000 --financeMode=unlimited --conditionalPromotion=1 --rollBand=max --defaultRankEvidence=1
node tools/atlas-v58-career-growth-index.mjs career-growth-v62-lamia.json campaign-forward-tree-v18-lamia.json career-growth-v62-lamia.json.gz career-growth-v62-lamia-index.json
```

Hybrid and catgirl recruitment were investigated but not unlocked. Their resource and research prerequisites remain to be modeled, including lawful event branches, item supply, and elapsed month gates. Canonical shared registry and UI integration remain incomplete. Local Node.js was used for raw rules access; no local Python was run.
