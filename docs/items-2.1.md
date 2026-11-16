# X-Piratez 2.1 independent item index

The standalone [2.1 item reader](../public/items-v2/) is backed exclusively by
`public/data/items-v2-index.json`. It **does not join** or overwrite any
historical v.o1.1.1 item, weapon, research or manufacture indexes.

## What is included

- X-Piratez **v.o2** definitions from the 16 locally verified mod
  `Ruleset/*.rul` files, with merge/redefinition/delete handling.
- Item IDs, the same installation's `Language/ko.yml` Korean names and
  `Language/en-US.yml` English names where present.
- Selected **explicitly declared** item rule fields, including cost, weight,
  damage, accuracy and action-cost objects, without guessing OXCE defaults.
- Ordered rule-file provenance for each item, plus SHA-256 references for all
  files used to confirm the version.

The raw, derived item index includes game-internal entries and virtual items.
It is **not** an inventory-only list, and does **not** prove what is purchasable
in a particular save game.

## Rebuild from verified local 2.1 sources

Install the project dependencies as usual, then point to the actual v.o2
`user/mods/Piratez` directory. Use either an explicit argument or the
`XPIRATEZ_MOD_PATH` environment variable.

```powershell
node tools/build-v2-items.mjs --source "C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez"
node tools/build-v2-items.mjs --source "C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez" --check
npm run check:items:v2
```

The generator refuses a missing or incompatible source, changed SHA-256,
additional untracked `.rul` overrides, or a non-v.o2 `metadata.yml`.
`--check` compares regenerated output with committed JSON without writing.

## Limits

The index represents **mod-defined** items only. Vanilla XCOM base item
definitions, optional additional mods, user mod load order, dynamic
scripts, and engine runtime default values remain outside this phase.
Source fields such as `costThrow.time` are stored as declared, not
converted to measured TU totals. A missing source field is `null`/absent,
**not zero**. The Korean translation is never filled from legacy 1.1 data.

Do not join this index with the old research or manufacture catalogue.
Modern research and manufacture migrations must be versioned independently
against the full v.o2 installed source.

The original `.rul` and `.yml` text files are not republished here.
