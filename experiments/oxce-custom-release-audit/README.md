# OXCE custom R131–R134 source preservation and R135 candidate

Source project on Windows:
`D:\daphne_auto\XPZ_R43_RC87_RELEASE_20261102` (registered as `xpz_hud`).
This is the modified **2D OpenXcom/OXCE** executable project, not the unrelated XPZ3D rendering engine.

## What was recovered

- `R131/InventoryState.cpp`: 127,733 UTF-8 bytes, SHA-256 `97d58d7fb0a1187f451a26aa42a8da5a535b1730d763f3bb3016dd176f440f59`
- `R132/InventoryState.cpp`: SHA-256 `7ec8f425bf483a4ac3bc0673bb0e74430f1ba37a10d4dba087567657ab29328c`
- `R133/InventoryState.cpp`: SHA-256 `f70816545331fc26e6a4e2f2ebe2aa8af15b0160087fec4743139a6f3a24a9e9`
- `R134/InventoryState.cpp`: 140,138 UTF-8 bytes, SHA-256 `fb2ac7d9ce52c5ae4435a502a43c15152d3af3d0db94ef7af9d67e5bafb36130`
- `R134/BattlescapeState.cpp`: SHA-256 `7631c43c9b8d74232ff2e14d7bc127c551aded86d01d00d410f814a9b4a86008`
- Additional R134 `InventoryState.h`, `UnitWalkBState.cpp`, `ExperienceOverviewState.cpp`, `main.cpp` archived here.
- `R134/Map.cpp` is **not** archived here due to transfer-size limit; still on local Windows host. The R134 compile/receipt identifies it as one of the six compiled units.

Executable hashes measured on actual installed files:
| Version | SHA-256 |
| --- | --- |
| R131 | `D5AA51610395424FFFD0C0846A10BA87AA2777FC5EAA46E0742938B45C289ADA` |
| R132 | `B5286DE8287A5CA982791B3486A2204B315ED9B92031606574A4E59D33B2F232` |
| R133 (stage build, not installed) | `26952C0758C2C5F83B09FDCF961729F9FB773B9007A7EC1A6ED8486D53149C4B` |
| R134 | `638D4F172D392A51F1B01EF1ABA3C239D93C91943ABE9DB94485A41846011416` |

The local BUILD_RECEIPT indicates R134 compiled six edited translation units over a 413-member object archive and explicitly states `GAMEPLAY_VISUAL_TESTS=NOT PERFORMED`. The actual toolchain in `build_r134.ps1` is **MinGW-w64 GCC 14.3, GNU C++17**, not the previously supposed MSVC C++14. Building under a different toolchain without verifying ABI would be erroneous.

## Confirmed source-level UI regression and candidate fix

R131 allocated a 40px low-TU button labelled `저TU` and a 40px squad `전원자동` control.
R132/R134 reduced the toolbar and low-TU control to 19px, while changing its low-TU label to the less recognizable `低`. The AUTO control became 19px `자동`, with a new 19px `해제` control adjacent.

`R135-candidate/InventoryState.cpp` makes a narrowly scoped **source-only** correction:
- Low-TU button width 19 → 40 pixels at (230,125), leaving adjacent x251,y138 `해제` unchanged (different row).
- Low-TU button text `低` → `저TU`.
- It does not revert R132 clear button, R133 optimization, or R134 medical/offhand/wear improvements.

For ordinary AUTO, `자동` is still the current 19px label because expanding it without rearranging the adjacent clear button would create a real overlap. The distinction from `전원자동` must be resolved separately with a measured layout, not blindly restored.

## Functional lineage observed in source (NOT runtime certification)

- R131: AutoAll callback, lowTU button, R128 15-shot quantity handling.
- R132: clear-button callback and several squad/tile UI patches.
- R133: physical rule indexing, cached ammunition counts, soldier-aware action TU, timing log.
- R134: health kit priority, one-handed free-offhand selection, hat and jewelry slot fill, firing-mode filtering.

A source anchor being present does **not** demonstrate that an item was equipped correctly, that auto-all is performant, or that a game UI loaded without overlap. R131 also needs prior-version feature auditing as requested.

## Release policy

No R135 executable has been built or shipped by this source preservation activity. The candidate is not production-certified. Before release: verify actual native build and linker, replay prior features and representative campaign save, run timed large-team AUTO tests, and obtain runtime evidence matching executable SHA-256.

Issue #64 is the tracking issue. The source-anchor test is `node --test tools/check-oxce-source-census.test.mjs`; it is not a substitute for gameplay validation.
