# V27 face lighting GLB

Direct V26 revision: conservative local face-normal adjustment and separate roughness response for face, exposed skin, hair and eyes. The recognizable opaque outfit, geometry, pose, rig, weights, colors and original textures are preserved. Material values are artistic choices, not calibrated sprite matching. No native render or browser run performed.

- output/R36HW_F11_ATHLETIC_SUIT_V27_FACE.glb
- review/compare.html: paired actual GLB browser comparison with pinned model-viewer CDN, fixed cameras, exposure and optional local file selectors. Not an S2 renderer. Download and open the HTML, select V26 and V27 if network or relative paths fail. Requires CDN connectivity.
- source/build.cjs: dependency-free exporter; run `node source/build.cjs /path/to/V26.glb`.
- reports/build.json: measurements and limitations.
