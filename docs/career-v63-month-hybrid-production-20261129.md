# V63 month-one acquisition and focused hybrid research production

Parent: 54ad9f3700bbe3358189307edad437c8d034da5a (V62). Pinned v.o2 source index: a7e64ad8b071c557a0194f26e811dcfc460a1b50. Bootstrap checks the local source rule hashes.

## Implementation
- A new explicit conditionalMonth action advances only month 0 to 1 and assumes rating zero when no score is known. It does not simulate monthly income, upkeep, rating achievement, or intervening events.
- STR_SECRET_DOOR_MEDICAL_SUPPLIES: ten medical supplies, conditional on the source-indexed early event script and active research/geography/time requirements.
- STR_DELINQUENT_SPORTS_BAD: full fixed item bundle plus native randomMultiItemList entry index 3, three STR_SECTOWEED and one STR_CRACK. Explicit conditional random choice; score gate -300 through 999, first month 1, execution odds 85%. The indexed script weights and original reward fields are checked. The native scheduler and delivery are not proven.
- Event-policy expansion is monotonic and opt-in. Prior state hashes and actions are preserved. Focused scheduling can deprioritize supply actions; no prerequisite bypass.
- Focus-seed tool projects exact parent chains, preserving original state hashes, original edge indices and SHA-256 of the parent graph. Replaying projected nodes uses the existing source-backed gate. Omitted branches are not represented as expanded.

## Produced
- V19 full continuation: 4500 states, 9682 edges, 237 distinct completed research IDs, 64 conditionalMonth edges, 191 delinquent and 210 medical event edges across alternative states. Node bound reached; zero rejected actions, 4078 frontier states.
- Whole V19 resume attempt for V20 timed out at 120 seconds with no output observed. Compact seed: 65 states, 64 edges, original targets 3865 and 3888 remapped to 63 and 64.
- V20 focused continuation: 650 states, 1093 edges, 166 distinct research IDs, 627 frontier states. Not a full continuation of all 4500 states. Its source projection remains embedded.
- Cross-graph research witness index: 306 distinct completed IDs, all with at least one resolved active witness, 69 IDs beyond V19 and 76 beyond V18. These are independent campaign paths, NOT a simultaneously completed state.
- New milestone witnesses: STR_MEDICINE, STR_SOLDIER_TYPE_PEA, STR_HYBRID_PATH, STR_CONTACT_RETICULANS. STR_HYBRID_RECRUITMENT and STR_CAT_PATH/STR_CATGIRL_RECRUITMENT not reached.
- Source-backed next acquisition candidate: STR_HYBRID_LONER_RECRUITMENT requires STR_HYBRID_PATH and eight STR_MOONSHINE; source recipe 200 hours, cost 10000, STR_SOCIALLY_AWKWARD_TRAIT. Existing five-unit moonshine recipe requires two batches; one-batch exploration and manufactured-origin career replay are still blockers. No new soldier recruitment or career ledger produced in this turn.

## Artifacts
- campaign-forward-tree-v19-month-one.json SHA256 057867e1253a49c9c9889898b3f8ac4fdbe2f55a7a33e2bd9468cafd93b25ebe
- campaign-forward-tree-v19-focus-seed.json SHA256 4bbcfa9927ddb1ade4f16d816cb8c7581472749a7c23a0844506335b29e95c0a
- campaign-forward-tree-v20-hybrid-medicine.json SHA256 46299b31ed99ebe707ec3fac261d15a358c5d2c4ed1bedae7d78f97025281de0
- research-witness-v63-month-hybrid-index.json SHA256 136bb456ead6a160fb90d86f6da7239ebadd0707435d1ae5c5d551da4489301c

## Reproduce
Requires Node.js, js-yaml, and hash-checked local v.o2 rules. Use fresh output filenames.

```sh
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v19-month-one.json --forwardResume=campaign-forward-tree-v18-lamia.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE,STR_SECRET_DOOR_MEDICAL_SUPPLIES,STR_DELINQUENT_SPORTS_BAD --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT,STR_MOONSHINE_XXX --forwardFinanceMode=unlimited --forwardDepth=85 --forwardNodes=4500 --forwardFocusNodes=1721 --forwardPriorityResearch=STR_EXPLORE_TUNNELS,STR_MEDICAL_SUPPLIES,STR_BEER,STR_SECTOWEED,STR_CRACK,STR_MEDICINE,STR_RECRUITMENT,STR_DIVERGING_PATHS,STR_TAKE_ME_TO_YOUR_DEALER,STR_HYBRID_PATH_PREQ,STR_HYBRID_PATH,STR_CONTACT_RETICULANS --forwardPriorityOnly=1 --forwardBlessings=1 --forwardAllowEventExpansion=1 --forwardMonthScenario=1
node tools/atlas-v63-focus-seed.mjs campaign-forward-tree-v19-month-one.json campaign-forward-tree-v19-focus-seed.json 3865,3888
node tools/atlas-v54-forward-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardOut=campaign-forward-tree-v20-hybrid-medicine.json --forwardResume=campaign-forward-tree-v19-focus-seed.json --forwardFixedItems=1 --forwardFixedEventFilter=STR_KNOCK_KNOCK_WILLING_SLAVE,STR_SECRET_DOOR_MEDICAL_SUPPLIES,STR_DELINQUENT_SPORTS_BAD --forwardManufacture=1 --forwardManufactureFocus=supply --forwardSupplyTargets=STR_FIRST_AID_KIT,STR_MOONSHINE_XXX --forwardFinanceMode=unlimited --forwardDepth=90 --forwardNodes=650 --forwardFocusNodes=63,64 --forwardPriorityResearch=STR_MEDICINE,STR_SOLDIER_TYPE_PEA,STR_SOLDIER_TYPE_SS,STR_HYBRID_PATH_PREQ,STR_HYBRID_PATH,STR_CONTACT_RETICULANS,STR_TAKE_ME_TO_YOUR_DEALER,STR_RETICULAN_GENETICS,STR_SMALL_RADAR_SYSTEM,STR_COMMUNICATIONS --forwardPriorityOnly=1 --forwardBlessings=1 --forwardMonthScenario=1 --forwardPreferSupply=0
node tools/atlas-v63-research-witness-index.mjs research-witness-v63-month-hybrid-index.json campaign-forward-tree-v19-month-one.json campaign-forward-tree-v20-hybrid-medicine.json
```

No local Python used. DevSpace Node.js was needed for source access. Native timing, rank/score/economy certification, full research tree, manufactured-origin recruitment/transfer and shared comparison UI remain incomplete.
