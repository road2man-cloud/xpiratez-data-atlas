# V24 chestnut hair atlas correction

Direct GLB revision of static V21, not an XPZC conversion. The 256x256 embedded hair PNG is decoded, its green cast changed to chestnut while retaining source luminance variation, and the replacement image is embedded in the GLB. All other buffer views, original materials, geometry, UVs, skeleton and opaque garment are preserved. No face/skin or body modifications. The selected palette is an artistic variant, not a calibrated sprite color match. No actual engine or viewer render was performed.

Reproduce: `node source/build.cjs /path/to/V21.glb`.

Files: GLB, separate hair PNG, dependency-free source and build report.
