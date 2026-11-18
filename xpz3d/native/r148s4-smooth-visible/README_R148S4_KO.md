XPZ3D R148S4 F11 SMOOTH + VISIBLE VIEWFIX
2026-11-19

R148S4 modifies the actual native S2 3D renderer:
- Original R147 F11 63 bone weighted CPU skinning is preserved.
- 190ms smoothstep interpolation of OXCE actor tile positions.
- 150ms shortest-path 8-way facing rotation interpolation.
- Large teleports or cross-level jumps snap to their actual position.
- Up to ~18Hz mesh refresh while moving; no idle mesh uploads.
- Original R148S3 cumulative allpatch OXCE untouched.

For interactive Windows desktop use:
1. START_XPZ3D_R148S4_GAME_AND_3D.cmd - isolated OXCE and S2 simultaneously
2. START_XPZ3D_R148S4_3D_ONLY.cmd - attach native S2 to already active R148S3
3. SHOW_XPZ3D_R148S4_WINDOW.cmd - reveal an existing hidden S2 (no input focus)

No mouse, keyboard or OS cursor injection. Sealed passive S2 startup is kept.
The safe window script now waits up to 8s for the hidden render HWND.
S2 and OXCE still run as two windows; direct in-game 3D toggle is not done.
This is a local native paired candidate, not a standalone game installer.
Live 3D scene successful display is NOT claimed from compilation alone.
Old EXEs, project source GLBs and official saves remain untouched.