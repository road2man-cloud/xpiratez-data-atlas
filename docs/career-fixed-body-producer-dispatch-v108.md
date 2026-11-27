# Fixed-body producer dispatch (V106 / V108)

The wrapper previously hardcoded V106 even after the V113/V114 migrations. The dispatcher now uses the input ledger schema, defaults to V106 for V111/V112 unless V108-only functionality is requested, and uses V108 for V113/V114. Explicit V106 is rejected on migrated ledgers. Unknown schemas fail closed. The selected engine retains all original fingerprint and source evidence checks.

Focused hero production, source-free supply mode (requires existing consistent supply evidence):

```sh
node --max-old-space-size=12288 tools/produce-atlas-fixed-body-batch.mjs --phase=produce --producer=v108 --supply-mode=preserve --seconds=85 --wave=64 --bodies=STR_SOLDIER_HERO --graphs=auto --graph-limit=6 --exact-leaves=5 --chain-quantum=12 --root-attempts=20 --rule-attempts=4 --fragment-ms=2200
```

Run in an isolated checkout. Keep the exact same producer and supply mode for subsequent indexing and recruitment continuations. Attach and finalize using the existing independent replay/admission workflow. Queue filtering remains optional and does not certify closure. Do not publish counts until the merged ledger and completion archive have been generated.

```sh
node tools/test-atlas-fixed-body-producer-policy.mjs
```

The dispatcher is tested on 17 cases. This change does not itself produce any career routes or final admissions.
