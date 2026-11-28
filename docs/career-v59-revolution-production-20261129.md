# V59 forward research, supply and career-growth production

Source: v.o2 index at a7e64ad8b071c557a0194f26e811dcfc460a1b50, local source hashes checked by the production bootstrap. Parent publication: 47dcd02287ecfbda8880e95c8715f489d59edc6e.

## Produced
- V15: 1873 states, 3667 edges, 209 distinct research IDs. Three separate recruitment branches were reached from the V14 graph, including STR_PEASANT_REVOLUTION_PREQ / STR_REVOLUTIONARY_TRAINING, STR_WE_NEED_MALE_TOUCH_PREQ, and STR_GALS_ARE_SUPERIOR_PREQ. These branches are not combined.
- V16: 1897 states, 3712 edges, 209 research IDs. Adds STR_MOONSHINE_XXX as a deterministic supply recipe; initial STR_STILL provides ALKO. The raw recipe requires ALKO, produces five STR_MOONSHINE, costs zero, and has 200 work hours. The training STR_REVOLUTIONARY_TRAINING requires three STR_MOONSHINE. Graph edges produce stock before career replay; no external grant.
- Growth-aware search now tries both initial growth/no growth and extends successful prefixes with and without intermediate growth; it does not require previously successful full training sequences. 988 attempts, 718 successful, 270 rejected, zero pending, 406 distinct ordered-placement/effective-vector keys, 58 distinct effective-vector keys, 50 distinct profile/training/body sequences. 222 successful rows include STR_REVOLUTIONARY_TRAINING.
- Three distinct successful direct-hire profiles: STR_SOLDIER_PEASANT (690 rows), STR_SOLDIER_SLAVE (24), STR_SOLDIER_S (4). The best single-witness totals in this bounded production are respectively 1104, 1070 and 1116. These are not global or native-certified maxima.
- Rejections: 264 career-action-requires-live-exact-state, six promotion-rank-list-unindexed. No growth-only-enabled sequence was demonstrated in this run. Conditional growth and rank promotions remain assumptions; random transformation outcomes and other unresolved gates must not be bypassed.

## Artifacts
- campaign-forward-tree-v15-revolution.json SHA-256 ba8484c000c1e05f499d484e05e2b19c87652888c6f244f60cf057b2bd1f51d6
- campaign-forward-tree-v16-revolution-supply.json SHA-256 28c73b17f45cb187e5891c305244dea7da534f4d001319367ed6763e75ad2683
- career-growth-v59-revolution.json.gz SHA-256 ae34e3fb7edf3bd7c34a1b1134fa9a988fb5d1a99508fdcd01a67f5dc068d4c3
- career-growth-v59-witness-index.json SHA-256 1792b65905e7a82cb365b324f028549c8fe90100ef41ae3ba46cd0e27d1ecf50

## Reproduction
Requires Node.js, js-yaml, and local hash-verified v.o2 source. Use distinct fresh output names to preserve earlier artifacts.
```sh
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v15-revolution.json --forwardResume=campaign-forward-tree-v14-nepotism-career.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT --forwardFinanceMode=unlimited --forwardDepth=65 --forwardNodes=3000 --forwardFocusNodes=1721 --forwardPriorityResearch=STR_RECRUITMENT,STR_DIVERGING_PATHS,STR_PEASANT_REVOLUTION_PREQ,STR_PEASANT_REVOLUTION,STR_REVOLUTIONARY_TRAINING,STR_WE_NEED_MALE_TOUCH_PREQ,STR_WE_NEED_MALE_TOUCH,STR_SLAVE_SOLDIERS,STR_GALS_ARE_SUPERIOR_PREQ,STR_GALS_ARE_SUPERIOR,STR_CAT_PATH_PREQ,STR_CAT_PATH,STR_HYBRID_PATH_PREQ,STR_HYBRID_PATH --forwardPriorityOnly=1
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v16-revolution-supply.json --forwardResume=campaign-forward-tree-v15-revolution.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT,STR_MOONSHINE_XXX --forwardAllowSupplyExpansion=1 --forwardFinanceMode=unlimited --forwardDepth=70 --forwardNodes=3100 --forwardFocusNodes=1840,1841,1826 --forwardPriorityResearch=STR_REVOLUTIONARY_TRAINING,STR_PEASANT_REVOLUTION --forwardPriorityOnly=1
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v16-revolution-supply.json --growthSearch=1 --careerOut=career-growth-v59-revolution.json --states=1873,1874,1875 --maxTrainings=4 --maxAttempts=3000 --financeMode=unlimited --conditionalPromotion=1
node tools/atlas-v58-career-growth-index.mjs career-growth-v59-revolution.json campaign-forward-tree-v16-revolution-supply.json career-growth-v59-revolution.json.gz career-growth-v59-witness-index.json
```
Supply expansion is explicitly opt-in, retains existing targets and historical edges, and marks inherited expansion metadata stale until reevaluated. Unvisited states are not certified as fully expanded. The canonical branch mapping and shared comparison registry/UI remain unresolved. Local Node.js was required to access the source rules; no local Python was run.
