# R209 pair-pruned grenade TU search

Date: 2026-11-23 KST

Parent: R208 ALLPATCH grenade adaptive search.
Parent executable SHA256: BA2811F0A1D58EDC105693CA9247C64A35434DE7CF459AAE29A69191E9DFDE78

## Actual changes
1. src/Battlescape/GrenadeTuLabel.h: r184BestClearPlan now checks candidate TU and drops/preservation tie-break before rectangle overlap, rejecting pairs unable to improve the best plan. Tie behavior remains the same.
2. src/Battlescape/InventoryState.cpp: theoreticalMoveMin(first/second) computed once per two-hand clearance branch, reused for the 4->32->64 candidate decision points.
3. src/main.cpp: R209 title.
4. build_r209.ps1: rebuild InventoryState.cpp and main.cpp against R208 413-member archive.

## Native outcome
- Windows C++ compilation/link successful.
- 413 archive members preserved.
- Output D:\daphne_auto\XPZ_R209_GRENADE_PAIR_PRUNING_20261123\build\openxcom_R209_ALLPATCH_GRENADE_PAIR_PRUNING.exe
- Size 27,627,584 bytes.
- SHA256 C5173274C0A266CE67E4BCA2846D283E2B85EE9162B723A7ABDD1AEC93A0BEC0
- Installed separate executable C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R209_ALLPATCH_GRENADE_PAIR_PRUNING.exe and verified matching SHA.
- Dedicated launcher XPZ_R209_ALLPATCH_START.cmd.
- Existing common launcher, earlier EXEs and saves unmodified.

## Limitations
- In-game interactive performance, native grenade action TU correctness, and HUD QA not yet measured.
- Collision pruning is equivalent to the earlier candidate ordering given the exact same (TU, number of ground drops) preference.
- Broader path completeness and global TU optimality are not proven.
