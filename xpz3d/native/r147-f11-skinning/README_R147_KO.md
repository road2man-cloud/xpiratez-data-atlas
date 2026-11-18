# XPZ3D R147 F11 63-BONE LIVE SKINNING / 2026-11-19

## Production delivered
- New native S2 executable compiling original F11 GLB 63-bone, float4-weight CPU skinning into S2 IGScene triangle meshes.
- R144 static bind-pose upgraded to a procedurally joint-bent stance based on the REAL OXCE kneeled flag.
- Motion from actual OXCE tile changes initiates a short gait cycle; animated GPU rebuild rate bounded to 120ms.
- Three nearest eligible allied actors to the currently selected camera actor have F11 GLB geometry; other actors keep R143 proxies. Selected first-person actor is excluded from camera occlusion.
- R144 legacy native assets and EXE untouched. Original F11 GLB untouched.
- Default R34Q skin 6218 triangles, experimental R34X skin 6842 triangles. 63 glTF joints and original inverseBindMatrices are carried in BOTH formats. No decimation.

## Running (interactive Windows only)
RUN_R147_F11_SKIN_PAIR.ps1 is an isolated local paired candidate.
For R34X: set process environment XPZ3D_R147_F11_SKIN to full s2-native\assets\f11_r34x.skin.
Default is r34q. Do not run in Session 0. The run launcher creates isolated-user and copies the selected .sav; it does not alter original installed saves.
The S2 runtime still depends on already installed local XPZ3D Direct3D/S2 fixtures.

## Known constraints (not complete)
- This is real CPU skinning with 63 original glTF joints, and procedural animation of selected thigh/leg/arm joints. It is NOT imported authored game motion or full 63-bone animation clip playback.
- No original GLB UV textures/shader material fidelity, morph targets or LOD animation.
- OXCE executable here is R143 cumulative (R140 HUD + R142 terrain). Concurrent R145/R146 HUD recovery lines are NOT silently merged.
- Actual MCD/LOFT 3D geometry remains schematic.
- Native compile/link success does NOT establish live gameplay successful frame rendering.
- Existing original game, previous EXEs, source GLB and saves preserved.