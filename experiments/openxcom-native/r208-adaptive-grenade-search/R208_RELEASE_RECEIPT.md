# R208 adaptive grenade clearance search — native release receipt

Date: 2026-11-23 KST

## Based on
- Parent: R207 integrated, retaining R206 AutoAll/CQC/mission HUD features and R190 grenade lower-bound logic.
- Parent EXE SHA256: 0931AE5675E073597DAED96D925E3257C9FA8E5733AB53C89A5956D4FC005CD0.

## Actual source improvement
- Modified src/Battlescape/InventoryState.cpp to add a conditional 64-candidate-per-ground-page search after the existing 32-candidate expanded two-handed clearance search.
- The second search executes only when the first expanded plan remains invalid or more expensive than the optimistic movement lower bound.
- Existing first-pass limits, inventory placement collision checks, TU calculation rules, R206 equipment automation, HUD and CQC behavior are kept.
- Updated src/main.cpp title to R208.
- Other translation units are inherited from the 413-object R207 archive without recompilation.

## Build
- Two translation units compiled: InventoryState and main.
- Windows native compilation and linking succeeded.
- Cumulative archive retains 413 object members.
- Built EXE: D:\daphne_auto\XPZ_R208_GRENADE_ADAPTIVE_SEARCH_20261123\build\openxcom_R208_ALLPATCH_GRENADE_ADAPTIVE_SEARCH.exe
- EXE size: 27,627,584 bytes
- SHA256: BA2811F0A1D58EDC105693CA9247C64A35434DE7CF459AAE29A69191E9DFDE78
- Installed separate EXE under C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez; copy hash matched.
- Dedicated launcher: XPZ_R208_ALLPATCH_START.cmd.
- Common launcher, saves and earlier EXEs remain unchanged.

## Verification limits
- Native build success and install hash match confirmed.
- No in-game interactive TU or UI checks have been performed.
- This widens a bounded search; it does not prove global optimality or change actual battle TU deduction behavior.
