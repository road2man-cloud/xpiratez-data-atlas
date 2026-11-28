# V57 conditional career production (X-Piratez v.o2)

Source index commit: a7e64ad8b071c557a0194f26e811dcfc460a1b50. The production bootstrap checked the local v.o2 rule hashes against the index. Raw game rules are not included.

## Outputs
- campaign-forward-tree-v14-nepotism-career.json: 1817 states, 3576 edges, 193 distinct completed research IDs. SHA-256 9391fb272c48f0d2200898c58c2aa6db07448a112c866ececa0c515029cfeaff.
- career-permutations-v57-nepotism.json: 27 attempts, 12 successful, 15 rejected for minimum rank 3. SHA-256 80f4fca8a2fe972858a6081222e8e31cc96b20200c2e6b1f10d27b15f2879bf5.
- career-permutations-v57-nepotism-promotion.json: 45 attempts, 45 successful, 0 rejected, 0 pending; 15 distinct profile/ordered training/body/effective-vector keys, of which 11 include STR_NEPOTISM. SHA-256 277374ac07d6947cc0dec3c1c57354c6c859498a281af1cbd10c84aad2fde99c.

STR_NEPOTISM requires rank 3. Optional --conditionalPromotion=1 applies one explicit conditionalPromotion step for each rank, using the existing body-specific rank gate. Default remains off. No native achievement or calendar is simulated; this is conditional evidence, not a certified result or a global maximum. The three selected graph states are 1721,1774,1775; other states and branches remain unexplored. Finance policy excludes affordability for new paid actions, not other prerequisites. Funded career replay now rejects an unlimited graph.

## Reproduce (Node.js, js-yaml, local hashed v.o2 source)
From the workspace root, use the existing V13 graph and the pinned source ref:

```sh
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v14-nepotism-career.json --forwardResume=campaign-forward-tree-v13-finance-repair.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT --forwardFinanceMode=unlimited --forwardDepth=50 --forwardNodes=2600 --forwardFocusNodes=1499 --forwardPriorityResearch=STR_LOOT_DISTRIBUTION,STR_NEPOTISM,STR_GYMNASTICS,STR_GYM_OUTFIT,STR_DOGE_PROCUREMENT,STR_SHOTGUNS_SUMMARY --forwardPriorityOnly=1
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v14-nepotism-career.json --careerOut=career-permutations-v57-nepotism-promotion.json --states=1721,1774,1775 --maxTrainings=4 --maxAttempts=1000 --financeMode=unlimited --conditionalPromotion=1
```

Use a new output name when preserving the supplied files. Node.js was executed in the existing DevSpace; js-yaml was resolved using the installed dependency in D:/xpiratez-data-atlas/node_modules. No local Python was used. Shared registry integration and native game replay remain incomplete.
