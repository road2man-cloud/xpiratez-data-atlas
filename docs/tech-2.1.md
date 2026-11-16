# X-Piratez v.o2 (2.1) research and manufacture catalogues

The standalone `public/research-v2/` and `public/manufacture-v2/` readers use *only*
`public/data/research-v2-index.json` and `public/data/manufacture-v2-index.json`.

Both are derived from the same locally verified v.o2 mod source manifest and
`Language/ko.yml` as the independent 2.1 item index. The original mod
`.rul` / translation `.yml` source files are **not published** here.

- Research: 4,629 unique mod-defined names, 4,619 Korean names.
- Manufacture: 2,175 unique mod-defined names, 2,172 Korean names.
- Source IDs and rule-file provenance are retained for every record.
- Explicitly present rule fields are preserved without synthesizing engine defaults.
- Research prerequisites and direct manufacture/item links are derived from
  literal IDs **only**. Unsupported references remain unresolved, not guessed.
- Manufacture required item IDs are checked against the independent 2.1 item
  index; no v.o1.1.1 database is imported.

## Rebuild

```powershell
node tools/build-v2-tech.mjs --source "C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez"
node tools/build-v2-tech.mjs --source "C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez" --check
npm run check:tech:v2
npm run check:tech:v2:browser
```

The builder first checks the 16 rules, matching Korean translation, mod
metadata, and 2.1 item index source hashes. It refuses to generate if the
installed files differ from the recorded v.o2 sources.

## Limits

These are **mod-defined entries** only. The vanilla game rules, optional mods,
load order, conditions from event scripts, and the full OXCE runtime state
may change actual outcomes. The direct-ID links are descriptive rather than
proof that research has been achieved or manufacturing is currently possible.
Produced-item links are inferred from matching manufacture name IDs only when
no explicit `producedItems` is present. That convention should not be
confused with a complete execution simulation. The prior 1.1 research and
manufacture catalogues remain isolated at their original URLs.
