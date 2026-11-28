# S2 neutral rendering probe — 2026-11-28

A generic non-human calibration sphere was actually rasterized in an isolated Node.js 22 environment. This is a **CPU source-math diagnostic**, not native S2 execution and not a game-character capture.

## Confirmed source facts

- `Main/Gfx.cpp` includes D3D9.h and initializes Direct3DCreate9.
- `Main/GfxRender.cpp` supplies c3 = (2*255/254, -256/254, 0, 0), used in the packed-normal decoding expression.
- `Main/GfxShaders.txt`: CalcNormal; CalcDirAmbLightDO; LightPlusAmbient. Directional contribution = max(0, dot(normal, lightDirection)) * lightColor + ambientColor.
- Source files were read locally; no engine source or private assets are republished.

Source SHA-256:
- GfxShaders.txt: d2bb1b1ef4a15f87b1bfa28a0238dfdf65c59f4e89e632471d141cb5c89e063a
- GfxRender.cpp: 4ea17902e998da687e4ed77ea64b68d8d4075914613d4af847dabdcf7826fef6

## Actual diagnostic output

- 120 triangles, 62 vertices, same mesh and orthographic camera across three panels.
- Left: constant geometric face normal; middle: packed normal decode + source directional/ambient expression at vertices + interpolation; right: per-pixel interpolated normal diagnostic.
- 1080x400 PNG, 36,333 bytes; SHA-256 6909cf54a020dbe53beaec02b81943306f6717657f5691c4f7fcb8a67f706765.
- PNG and executable Node source delivered separately in chat. Neither is claimed to be hosted in this directory.
- Camera and light values were synthetic. No native S2 shader binary, skinning, normal-map/bump path, or game scene was executed. The right panel is a diagnostic comparison, not a claim of a selected S2 rendering pass.

## Native execution blocker

The verified existing native build is Game-r138d-same-XPZ3D-IGScene.exe (build receipt SHA-256 b99c4def2d6e9e68674262a7105b187d1e90952084dbbd450fc37dbcaaee6b38). The remote shell runs in Windows Session 0, whereas the existing launcher requires an interactive desktop session. Native render capture remains unperformed. No game binary, save file, or local source was modified; no Python was run on the user's computer.
