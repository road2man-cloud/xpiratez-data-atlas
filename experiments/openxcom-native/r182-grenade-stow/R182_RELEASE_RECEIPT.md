# R182 grenade stow TU: native release receipt

Date: 2026-11-20. Based on R181 ALLPATCH GRENADE HANDS.

## Built and installed
Windows EXE:
C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R182_ALLPATCH_GRENADE_STOW.exe

Size: 27534908 bytes
SHA-256: 9FE10739876B32DA977A89AF57BA60173FB7E7EA3431A0260452E626F78B1B11
Archive: build/objects_r182_cumulative_grenade_stow.a (413 total members)
Byte-identical inherited objects from R181: 411
Updated objects: InventoryState.cpp.obj, main.cpp.obj
Launcher: XPZ_R182_ALLPATCH_START.cmd
Latest entrypoint XPZ_LATEST_INTEGRATED.cmd updated to R182.
Old launcher preserved as XPZ_LATEST_INTEGRATED.before_R182-grenade-stow-20261120.cmd.

## Actual gameplay improvement
R181 accounted for dropping held items to ground when a grenade requires an occupied hand.
R182 additionally checks all mod-defined INV_SLOT inventory regions (belt/backpack/quickdraw,
other mod sections) as legal locations for stowing the currently held item.

Each actual grid slot is checked using fitItemInSlot() for the complete item rectangle,
canBePlacedIntoInventorySection() for ruleset allowability, and occupiesSlot() against
all other carried items to prevent overlap. A candidate contributes the native
getMoveToCost(section) TU cost. Ground dropping remains an alternative when the actor
is standing on a valid tile. For all legal hands/clearance options, the engine's
minimum preparation TU is selected; on equal TU, safe inventory stow wins over drop.

The HUD distinguishes storage ('bo'/보) from dropping ('noh'/놓), adds retrieve,
prime (unless already primed) and throw TU, warns when remaining tactical TU is low,
and compresses the label to fit the 66px panel.

This is an informational UI preview. It does not auto-move gear.
If no legal clearance path exists, the HUD reports a blocked path.

## Test and integration receipts
MinGW g++ C++ build/link: successful.
Grenade label C++ test cases: 14 PASS.
R182 source/inherited feature gate: 34 PASS.
Release manager parent EXE SHA check and 413-member archive check: PASS.
Installed SHA-256: matched build output.
Cumulative 411 unchanged members. No prior EXE or .sav overwritten.

Not yet gameplay-confirmed: actual UI rendering, real movement TU spending,
especially mod-specific slot handling, and save/load in the game.

## Source / reproduction
D:\daphne_auto\XPZ_R182_GIT_WORKTREE_20261120\experiments\openxcom-native\r182-grenade-stow

Build command: build_r182.ps1 (fails safely if output EXE already exists).
Feature gate: feature_gate_r182.py
C++ tests: tests/grenade_tu_label_test.cpp
The binary archive and EXE are excluded from Git; the source and build instructions are tracked.
