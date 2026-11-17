# R135-r2 Native Build, Regression Tests, and Runtime Blocker

KST: 2026-11-17. **TEST CANDIDATE ONLY — NO GAMEPLAY SIGN-OFF.**

## Source changes preserved

Canonical isolated Windows workspace: `D:\daphne_auto\oxce-r135-ammo-whip-backspace-20261117`.

- `Battlescape/InventoryState.cpp`: stop adding spare ammo to *every* firearm once physical inventory already covers 15 completed attacks, removing the old unrelated two-spare path. Keep the primary 15-attack minimum and per-magazine complete-burst math. Whip/stun-rod spare pass moved ahead of optional spare ammo/grenades. Existing manually-equipped items are not removed.
- `Basescape/SoldierTransformationState.cpp`, `.h`, `SoldiersState.cpp`: Backspace from the individual transformation-detail screen returns to the transformation overview using the parent soldier selector. Escape/cancel semantics and the independent transform picker remain.
- `Basescape/SoldierTransformState.cpp`: unchanged source archived because it is another caller of the amended transformation constructor.
- Inherited R135 low-TU visible label `저TU` and R132/R133/R134 functionality retained in source.

SHA-256 of local source copies:

| File | SHA-256 |
| --- | --- |
| Battlescape/InventoryState.cpp | `83DE6710B710C44E84472AB45A19E4529E5D7CB310D8BAB8F7EC53847A7E624D` |
| Basescape/SoldiersState.cpp | `2361EA7AD9457BEA655D5743C854D95B178C1CB08E41541A08AF9D36D632D84B` |
| Basescape/SoldierTransformationState.cpp | `56954CFC9D0E5EF9C5D9781609CCEC59681E5BD3198216DC1B30584A3569881D` |
| Basescape/SoldierTransformationState.h | `97869138D5C6CF259804C1EA219B570B15B95584A4614E499E4C98AA27032FC6` |
| Basescape/SoldierTransformState.cpp | `42B682648E90106A4FE0D16281C55291B342CC0996AB76B8F74B4ACF0AB705F7` |

All five GitHub snapshots were re-fetched and their normalized text confirmed identical with local source.

## Windows compile and native PE link evidence

Toolchain: MinGW-w64 GCC 14.3.0, GNU++17. Not MSVC x86.

- All four modified C++ translation units compiled successfully on Windows.
- Unmodified `SoldierTransformState.cpp` was also recompiled for ABI compatibility.
- Original R134 complete native object archive cloned in isolation; **413 original archive members retained**, no additions/missing members.
- Link output: `D:\daphne_auto\oxce-r135-ammo-whip-backspace-20261117\build\openxcom_R135_R2_UNVERIFIED_AMMO_WHIP_BACKSPACE.exe`
- Size: **27,228,889 bytes**
- SHA-256: `059F382A04128F3EBCB8F5C165C1FF79B0D37A52098F4E3801D5EBE46A0EB56C`
- Format: PEI x86-64.

Do **not** install this unverified EXE into the live game directory yet.

## Source regression audit

The branch now runs `node --test tools/check-oxce-source-census.test.mjs tools/check-oxce-r135-r2.test.mjs`.

Result on Windows isolated checkout: **9 passed, 0 failed**. These are source-anchor tests, *not* real gameplay/GUI tests.

## R131 / prior R135 startup diagnosis

- Previously installed broken `openxcom_R135_UNVERIFIED_LOW_TU_CANDIDATE.exe` created four hanging processes. All four targeted processes were terminated earlier (no other games killed).
- Existing R131/R132/R134 executable hashes remain unchanged.
- `road4` is the interactive Windows user in session 1; remote Thin MCP runs under `daphne_mcp` in session 0. Launching a GUI in service session 0 cannot certify visible game operation.
- Using a temporary Task Scheduler interactive-token diagnostic in session 1, R131 started loading data, reported `OpenXcom started successfully!` in game log, displayed a responding top-level window through 12 seconds, then had a zero top-level window handle when checked after the diagnostic launcher exited. A second persistent WScript parent test also left a background game process with zero top-level window handle. **The persistent GUI/startup problem is NOT YET SOLVED.** Diagnostic launch PIDs were terminated without touching other user game processes, and temporary tasks removed.
- No current R135 game processes observed; no direct game EXE repair/install was applied.
- An optional launch wrapper was created in the live game directory, `launch_R131_preserved.cmd`, with a desktop shortcut `XPZ R131 - 안정 실행.lnk`, to enforce the correct game working directory and keep a console parent until game exits. This wrapper is **not certified** as solving the suspension problem; user-visible launch needs confirmation.
- Windows Event Viewer and Defender inspection showed no fresh OXCE-specific blocking event. Audio `No free channels available` warnings are pre-existing and not established as root cause.

## Do not claim full completion

Mandatory next steps: reproduce direct **Explorer** double-click startup on user desktop, inspect suspended process thread counts and window lifecycle, compare known-good R131 startup with R134/R135-r2 in a controlled clean environment, verify 15-attack cap/whip inventory and Backspace screen navigation with representative save. No automatic production promotion, no overwriting game install, no removal of R131.

Tracking: GitHub PR #66 / issue #64.
