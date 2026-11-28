# R36HW F11 V20 diagnostic motion kit

Adds four actual glTF 2.0 animation clips to V19: shoulder/elbow, knee/ankle, torso/head, and combined bend. Each runs 4 seconds and returns to rest. All 21 diagnostic joints and hip translation are keyed per clip. No gameplay animation, IK, S2-specific data or engine conversion is claimed. The original opaque garment, mesh, textures, rig and binary prefix are preserved.

- output/R36HW_F11_ATHLETIC_SUIT_V20_MOTION.glb
- output/motion-clips.json (joint-local motion specification)
- source/build.cjs
- reports/build.json

Reproduce with `node source/build.cjs /path/to/V19.glb`. Open with a glTF 2.0 viewer that supports skeletal animation. Original model is unchanged and native S2 rendering remains untested.
