# V61 default-rank and hard-knocks career production

Parent: 1905c1dd2f7ed2fdbd64e60b3b843d3e1331b0a8 (V60). Source: X-Piratez v.o2 pinned index a7e64ad8b071c557a0194f26e811dcfc460a1b50, local rules checked by bootstrap.

## Rank correction
STR_SOLDIER_S has no custom rankStrings and allowPromotion is true in the index. The local v.o2 soldier rule has neither rankStrings nor refNode; the standard soldiers.rul has no STR_SOLDIER_S override. The retained OXCE 8.7.1 source archive (SHA-256 4319b0ee922adf9b97ecdc8984b881a6b351b60ca5f3ea921839fb4c30aa02fb) contains SoldierRank (rookie through commander), Soldier::getRankString, Soldier::promoteRank and SavedGame::handlePromotions. Custom rank strings limit promotion if present. Added opt-in --defaultRankEvidence=1 for the specific verified body only, with source hash evidence and rank bound 5. No general fallback for unknown bodies. The retained source has an RC18 overlay and is not proven byte-identical to the installed executable. Promotion achievements and staffing thresholds remain conditional, not simulated.

## Produced
- V17 graph: 2417 states, 5019 edges, 222 distinct research IDs, max depth 61; 2257 frontier states, not exhaustive.
- Brawler: 24/24 successful, 4 distinct ordered training sequences, 6 distinct effective vectors. All six previously rejected V60 max-band candidate keys succeeded. Best single witness total 1131 (previous 1116), state 1875, basic firearms training then nepotism, growth slot 0.
- Slave: 1420/1420 successful across two graph states, 1264 distinct profile/body/ordered training/growth placement/effective keys, 64 distinct training sequences, 30 distinct vectors. 1240 rows include STR_SCHOOL_OF_HARD_KNOCKS. Best single witness total 1093 (previous 1070), state 1923, STR_BASIC_FIREARMS_TRAINING, STR_BONDING_CEREMONY, STR_SCHOOL_OF_HARD_KNOCKS, STR_NEPOTISM, growth slot 0.
- All results remain conditional, not native verified or global optima. Growth-only enabled sequences: zero. Both new ledgers use max roll mode with a min birth vector. Results are not merged into the older ledger and may contain logically overlapping routes. Shared registry and canonical branch mapping remain incomplete.

## Artifacts
- campaign-forward-tree-v17-hard-knocks.json SHA-256 57002f411e14a596dd1520dfae0cb80228aeda403981096df496454a5e24825b
- career-growth-v61-brawler.json.gz SHA-256 0e4b1d22eb11d9878c75d7aa9bde28aed98077e23c13e00f5eb86ad24be7351f
- career-growth-v61-brawler-index.json SHA-256 ff50e3595b79b9ac346296c904958bf9a09059d8e148c9c1db18806f2205ec44
- career-growth-v61-hard-knocks.json.gz SHA-256 129772e3e91ab63c7337ff459681219751e45b4fcaa4da38a654fbde8756cca6
- career-growth-v61-hard-knocks-index.json SHA-256 041085bf542b4d134eebda082d31f69fa4a7c72fda20ac97ef6085ffd309aa15

## Reproduce
Use Node.js, js-yaml and the original local v.o2 source. Use fresh output names to preserve results.
```sh
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v17-hard-knocks.json --forwardResume=campaign-forward-tree-v16-revolution-supply.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT,STR_MOONSHINE_XXX --forwardFinanceMode=unlimited --forwardDepth=75 --forwardNodes=3300 --forwardFocusNodes=1874,1875,1873 --forwardPriorityResearch=STR_SCHOOL_OF_HARD_KNOCKS,STR_SS_OPERATIONS,STR_BONDING_CEREMONY,STR_PARTY,STR_ANIMAL_TAMING,STR_EXPLORE_TUNNELS,STR_CONTACT_SCAVENGERS,STR_LOOTBOX_SCAVENGING,STR_CONTACT_ROMANICA,STR_SUN_WARRIORS_TRAINING_PREQ,STR_SUN_WARRIORS_TRAINING --forwardPriorityOnly=1
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v16-revolution-supply.json --growthSearch=1 --careerOut=career-growth-v61-brawler.json --states=1875 --profiles=direct:STR_SOLDIER_S --maxTrainings=4 --maxAttempts=1000 --financeMode=unlimited --conditionalPromotion=1 --rollBand=max --defaultRankEvidence=1
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v17-hard-knocks.json --growthSearch=1 --careerOut=career-growth-v61-hard-knocks.json --states=1900,1923 --profiles=direct:STR_SOLDIER_SLAVE --maxTrainings=4 --maxAttempts=2000 --financeMode=unlimited --conditionalPromotion=1 --rollBand=max --defaultRankEvidence=1
node tools/atlas-v58-career-growth-index.mjs career-growth-v61-brawler.json campaign-forward-tree-v16-revolution-supply.json career-growth-v61-brawler.json.gz career-growth-v61-brawler-index.json
node tools/atlas-v58-career-growth-index.mjs career-growth-v61-hard-knocks.json campaign-forward-tree-v17-hard-knocks.json career-growth-v61-hard-knocks.json.gz career-growth-v61-hard-knocks-index.json
```
No local Python was used. Native promotion, further direct hire branches, and shared registry/UI integration remain pending.
