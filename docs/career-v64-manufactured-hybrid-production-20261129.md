# V64 manufactured Bugeye origins

Parent: 61475e624850f4853a49f0dfa338cb49867fd2a2 (V63). Pinned source index: a7e64ad8b071c557a0194f26e811dcfc460a1b50. The existing bootstrap checks local v.o2 rules. Source rule Piratez.rul SHA-256 ac42ed92d3f86f8414e5a1451dc207b0f3eee9e15bac0b949e93371e172b32f6.

## Production
Replayed the research prefix to V20 state 79, including the hybrid path and contact with Reticulans. Implemented opt-in manufactured origins in the career suffix rather than altering the historical research graph. Both recruitment recipes have their raw inputs, outputs, cost, hours, spawned body, armor, initial trait and profile checked; the birth witness must exist. The arrival step claims a previously completed personnel order once, without a second fee or material consumption. Existing one-batch recipe policy remains the default; only the source-checked moonshine recipe is allowed a second batch with an explicit ordinal in the manufactured-origin mode. All acquisition actions use the existing purchase/manufacture gates. The engine archive's Production.cpp shows item outputs and personnel transfers as separate effects, with a default 24-hour personnel transfer. The actual calendar and RNG are not replayed.

- Loner (STR_HYBRID_LONER_RECRUITMENT): produce 5 + 5 STR_MOONSHINE, consume 8, retain 2, receive one STR_HIDEOUT_CLEANING_BILL and one conditional personnel order. Work 600 hours (400 supply + 200 recruitment), recipe cost 10000, no purchased supply cost. Trait STR_SOCIALLY_AWKWARD_TRAIT.
- Hiver (STR_HYBRID_HIVER_RECRUITMENT): 3 STR_SECTOWEED already present in the replayed inventory, purchase missing 47 at raw 3250 each, consume all 50, receive one STR_RETICULAN_CORPSE and one conditional personnel order. Work 400 hours; raw purchase cost 152750 plus recipe cost 15000 = 167750, excluding training and modifiers. Trait STR_HIVER_TRAIT.
- Unlimited finance is used, not a funded cash-flow proof. Inventory consumption, research, purchase limits and quarters gates are still applied. Funded manufactured career mode is explicitly rejected. No external item or research grant was added.
- 48/48 successful paths, 24 per origin, 48 distinct placement/vector keys, eight distinct ordered training sequences, 12 distinct effective vectors. Zero failed or unprocessed. Both best-total witnesses use initial conditional cap growth then STR_BASIC_FIREARMS_TRAINING and STR_NEPOTISM; conditional rank promotion applied. Best total Loner 1009 (mana 106), Hiver 1005 (mana 91). Neither is a global or native-certified maximum.
- Direct STR_SOLDIER_HYBRID recruitment research not reached. Both manufactured profiles yield that body, not two independent body types. No new research graph was produced; V20 is the parent graph and the additional supply and recruitment actions are in the full career trace. Canonical shared registry/UI and native validation remain pending.

## Artifacts
- career-growth-v64-hybrid-manufactured.json.gz SHA-256 eaf9a71d822078b42c9be700f0a30d33031c9c6cf7214c4049375f628e5e10ce
- career-growth-v64-hybrid-manufactured-index.json SHA-256 1e3a399117a219660ce3b28670aa83313108d2a411dc2ced4e3e42b0b1c53d96

## Reproduce
Requires the existing hash-checked local rules, Node.js and js-yaml. Use fresh output names.
```sh
node tools/atlas-v53-career-run.mjs --ref=a7e64ad8b071c557a0194f26e811dcfc460a1b50 --region=STR_SIBERIA --forwardManufacture=1 --forwardRecruitment=1 --graph=campaign-forward-tree-v20-hybrid-medicine.json --growthSearch=1 --careerOut=career-growth-v64-hybrid-manufactured.json --states=79 --profiles=manufacture:STR_HYBRID_LONER_RECRUITMENT,manufacture:STR_HYBRID_HIVER_RECRUITMENT --maxTrainings=4 --maxAttempts=1000 --financeMode=unlimited --conditionalPromotion=1 --rollBand=max --manufacturedOrigins=1
node tools/atlas-v58-career-growth-index.mjs career-growth-v64-hybrid-manufactured.json campaign-forward-tree-v20-hybrid-medicine.json career-growth-v64-hybrid-manufactured.json.gz career-growth-v64-hybrid-manufactured-index.json
```
Local Node.js was used for access to raw rules. No local Python used. The full earlier suite and native executable have not been re-run in this increment.
