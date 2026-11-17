# R135-r3: cumulative native build / startup diagnostics (2026-11-17)

**BUILD COMPLETE (TEST-ONLY) — NOT GAMEPLAY-CERTIFIED AND NOT A PRODUCTION RELEASE.**

## Changes carried over from R131–R135-r2

- Preserve R131 `저TU` button, R132 clear button, R133 physical-inventory caching, R134 medical/offhand/wear logic and firing-mode filtering.
- AutoAll **stops adding spare ammunition** when the firearm already supports at least 15 complete firing actions. Loaded clips and loose clips are counted by integer division of rounds by the complete action cost. Magazine granularity can cause 15+ actual ready actions, but subsequent extra clips are no longer intentionally added. Manually equipped primary gear is left intact.
- Whip and stun-rod are prioritized ahead of **optional grenade fill** while medical slots and the mandatory/remaining ammo stage retain their order. Source order: primary weapon / 15 attacks → existing primary ammo completion → R134 medical/offhand/wear → whip/stun-rod → grenades.
- Backspace from the **soldier-list transformation/training selection** (`SoldiersState`) navigates to `SoldierTransformationListState` only when a specific transformation option is selected. The original Escape cancellation remains; the existing T shortcut remains. This corrects the earlier R135-r2 patch, which affected only `SoldierTransformationState` detail view.
- R135-r2 detailed transformation popup Backspace handler is retained without changes.

## Native Windows evidence

Build root: `D:\daphne_auto\oxce-r135-r3-med-whip-backspace-20261117`

Built on the full 413-member R134 object archive (original members preserved, none lost or added). MinGW-w64 GCC 14.3, GNU C++17, x86-64 PE. R135-r3 `InventoryState.cpp` and `SoldiersState.cpp` independently recompiled; two unchanged transformation-related object files reused byte-for-byte from the R135-r2 tested compile.

- `InventoryState.cpp.obj` SHA-256 `E4AEAF8741C71B620B3041B0298E2E68017E2DF70F0A6838222149348B5F08E8` (478,880 bytes)
- `SoldiersState.cpp.obj` SHA-256 `CD3916E6441507E68137575D8D9622BE10977B7C902931A93C4BF477EF3DB00F` (135,196 bytes)
- Complete test EXE: `D:\daphne_auto\oxce-r135-r3-med-whip-backspace-20261117\build\openxcom_R135_R3_UNVERIFIED_MED_WHIP_BACKSPACE.exe`
- PE64 EXE size **27,227,961 bytes**
- SHA-256 **`9F640CFF2099FF0AF39C0015B0EE9EB29F8DED873AA0890CC44BBDF7D1408A0D`**

No installed EXE, save or options file was replaced by this build.

## Source tests

All **14** source tests passed locally in isolated source worktree:
`D:\daphne_auto\oxce-r135-r3-static-test-20261117`.

Command: `node --test tools/check-oxce-r135-r3-integrated.test.mjs tools/check-oxce-r135-r2-source.test.mjs tools/check-oxce-source-census.test.mjs`

This is a static-code test; a passing result is **not** equivalent to successful game execution or acceptance of the feature behavior.

## Interactive Windows startup incident

User reported earlier working EXEs as Task Manager "Suspended." Rather than blindly unsuspending all processes or resetting user settings, the following was observed:

- Original installed R131 executable remained the correct SHA-256 `D5AA51610395424FFFD0C0846A10BA87AA2777FC5EAA46E0742938B45C289ADA`.
- A test launched under the actual console account `DESKTOP-HDMLU0F\road4`, session 1, produced `diagnose-r131-visible.json`.
- PID **45920** had a **non-zero main window handle (6629204)** and **Responding=true** across 12 samples, with CPU progress. The diagnostic marked it `visible-responsive-left-running`. The game log reported `OpenXcom started successfully!` for a preceding R131 launch.
- No collected sample showed every thread in `WaitReason=Suspended`. `ExecutionDelay`, `EventPairLow`, and `UserRequest` are normal wait categories and do not by themselves prove a suspended process.
- No contemporaneous Defender threat detections or application crash events were established; audio service was running and substantial free RAM remained.
- Earlier R135-r1 `openxcom_R135_UNVERIFIED_LOW_TU_CANDIDATE.exe` had hung; four specific instances were terminated. That **earlier** EXE is rejected.

**Conclusion:** R131 successfully started and displayed a responsive window during the road4-console diagnostic. The origin of the user's earlier Task Manager suspended indication is still not proven, and **R132/R134 as well as R135-r3 have not received equivalent interactive acceptance tests**.

## Remaining release gates

- Real R135-r3 startup, menu, exit, representative save smoke: NOT DONE.
- Real 15-shot loadout, whip presence and medical priority on user's unit/gear: NOT DONE.
- Transformation overview Backspace through both list and detail views: NOT DONE.
- R131–R134 full feature census / 3–4 minute auto-equip performance: NOT DONE.

Do not copy this unverified EXE into the regular game installation or call R135 integrated stable until these gates pass.
