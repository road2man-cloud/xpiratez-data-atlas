# X-Piratez v.o2 local source verification

The [source manifest](../public/ruleset/manifest.json) records **metadata only**, not downloadable ruleset files. It identifies the locally inspected X-Piratez v.o2 (2.1) installation: 16 `Ruleset/*.rul` files, matching `Language/ko.yml`, and `metadata.yml`. The expected engine version in the project source policy is OXCE 8.7.1.

## Verify the committed manifest

```sh
npm run check:no-legacy-rules
```

This checks that the retired publicly served ruleset source has not been restored, validates the v.o2 manifest schema and entries, and runs regression tests. **It does not verify a live game installation.**

## Verify an installed game copy

Supply the mod directory that contains `Ruleset/`, `Language/`, and `metadata.yml`:

```powershell
node tools/check-v2-source-manifest.mjs --source-root "C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez"
```

The command exits nonzero if an expected file is missing, has a different byte length or SHA-256, or if a new `.rul` file appears in that directory. It does not edit game files.

Successful verification shows that these *individual files* match the recorded installation. It does **not** establish which optional mods are enabled, their load order, or the complete effective merged ruleset. Check actual game configuration and current OXCE build separately. Never use cached v.o1.1.1 atlas indexes to fill gaps in v.o2 gameplay evidence.

The current 1.1-derived catalogues are not silently upgraded by this tool. Migration of each catalogue requires separate v.o2 extraction and explicit version tagging.
