# R135-r2 cumulative source / native build receipt (2026-11-17)

**Status: BUILD EXISTS, NOT RELEASED. GAMEPLAY/RUNTIME UNVERIFIED.**

## User-requested changes

1. AutoAll should not keep adding spare ammunition after an equipped firearm already supports **at least 15 complete firing actions**. Each magazine is counted as `floor(rounds / full-action-round-cost)`, so a complete automatic burst counts once. Whole magazines can unavoidably exceed 15 due to remainder/rounding. Previously, manually equipped guns could still receive up to two spare magazines even with sufficient shots.
2. Physically present leather whip or stun rod gets a dedicated chance **before additional spare ammunition**. Physical item eligibility respects research, battle environment and tag restrictions.
3. In `SoldierTransformationState`, Backspace routes to the transformations overview `SoldierTransformationListState` when invoked from the soldier-list selector; Escape retains the Cancel behavior. Unrelated standalone popup context falls back to ordinary Pop. All constructor callers are recompiled.

## Local source, build and test

Build root:
`D:\daphne_auto\oxce-r135-ammo-whip-backspace-20261117`

Native base: R134 integrated archive compiled on MinGW-w64 GCC 14.3 using C++17, PE64 Windows (not x86). The isolated candidate replaces exactly:
- `InventoryState.cpp.obj`
- `SoldiersState.cpp.obj`
- `SoldierTransformationState.cpp.obj`
- `SoldierTransformState.cpp.obj`

All four translation units compiled successfully; native EXE linked successfully. Original 413 archive member names were preserved with zero missing or added members. The game installation and existing R131–R134 EXEs were not overwritten.

**Candidate EXE:** `D:\daphne_auto\oxce-r135-ammo-whip-backspace-20261117\build\openxcom_R135_R2_UNVERIFIED_AMMO_WHIP_BACKSPACE.exe`

**SHA-256:** `059F382A04128F3EBCB8F5C165C1FF79B0D37A52098F4E3801D5EBE46A0EB56C`

**Size:** 27,228,889 bytes. **Format:** PEI x86-64.

Static source checks: five tests passed locally on November 17 using `node --test tools/check-oxce-r135-r2-source.test.mjs`. These check preserved anchors and intended ordering; **they do not establish real gameplay correctness.** A CI workflow now runs this test with the prior source census.

## Runtime incident, separated from release

The **earlier** `openxcom_R135_UNVERIFIED_LOW_TU_CANDIDATE.exe` failed to display a usable game, and 4 instances were forcibly terminated (IDs 47116, 48452, 42072, 49068). That binary is **REJECTED** and still exists in the install directory only as a diagnostic artifact.

The user subsequently reported previously working versions appearing in Windows Task Manager as "Suspended". Current live diagnostics (2026-11-17 approx 13:55 local) indicate:
- Native R131 installed EXE SHA-256 `D5AA51610395424FFFD0C0846A10BA87AA2777FC5EAA46E0742938B45C289ADA`, unchanged.
- Its process PID 21664, **session 1**, recorded `Data loaded successfully` and `OpenXcom started successfully!` in `user\openxcom.log` at 13:55:36.
- CPU time advanced, and enumerated threads waited on ordinary events/delays; none of the sampled threads had `Suspended` wait reason. `MainWindowHandle` observed as 0 **from the remote bridge account**, which does not prove whether the different-user desktop window exists.
- No game process was present at earlier checks; no reported contemporaneous Defender detections or app crash events. Windows Audio services were running and free physical RAM was ~40GB. `No free channels available` audio warnings occurred in previous log history but no causal link has been established.
- The remote Thin MCP account is `daphne_mcp`, whereas the active interactive console user is `road4`. Automated GUI tests from a noninteractive bridge are **not an acceptable simulation** of the user's desktop.

**Conclusion:** No reliable evidence that the R131 binary itself is corrupt. An environment/window focus or initialization problem remains to be confirmed on the interactive desktop. Do not blindly reset settings, delete user saves, or disable Defender. Do not mistake a CPU-idle/waiting thread for a truly suspended process. The R135-r2 EXE has **not** passed an interactive startup, normal exit, or savegame smoke test and must NOT be installed as a normal release.

## Outstanding gates

- Interactive startup on the actual game PC under the console user, window visible, menu responsive, normal exit: **UNVERIFIED**.
- Full R131 and R134 functionality audit: **UNVERIFIED**.
- Real 15-shot auto loadout + whip on screenshot scenario, plus large-squad speed: **UNVERIFIED**.
- Backspace shortcut navigates to overview without damaging selection state: **UNVERIFIED**.
- Only after these pass should a versioned production EXE be promoted, with its source/build/game-test provenance recorded.
