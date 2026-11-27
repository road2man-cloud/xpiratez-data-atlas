# R36LL integrated static package producer

Run from this directory with Python 3, NumPy, Pillow and a C++17 compiler. Requires sibling r36lh, r36lj, r36lk from the same repository (included in standalone ZIP).

```
python fixture.py fixture.glb
python stage.py fixture.glb output/multi
python stage.py ../r36lf/output/R36LF_F11_KNEE_HELPER_POT_512_2100TRI.glb output/f11_rest
python stage.py ../r36lf/output/R36LF_F11_KNEE_HELPER_POT_512_2100TRI.glb output/f11_pose --clip 0 --time 0.5
```

Output is a static-pose package, not a Silent Storm database or installed model. Each active scene mesh-node/primitive instance gets vertices32.bin, indices16.bin, polys16.bin and pose.obj. Material MMP files are shared by material ID; package.json connects instance, material, texture, candidate alpha/wrap and warnings, with hashes for all payload files. The default axis is identity and scale is 1; engine world convention remains unverified. Existing output directories are rejected. Staging is transactional within the output parent. Original source never modified. Native binary normal packing uses a reference round-to-nearest implementation; the engine adapter must use actual CalcCompactVector. UV0 is required and unsupported material features are recorded rather than silently mapped.

Produced in the GPT container with g++ 14.2.0: three synthetic test packages (instanced multi-material scene, articulated morph beam at 0.5s, helper75 at 0.5s). The 75-bone fixture is NOT the R36LF character. Active scene filtering, primitive/material matching, payload sizes, and output collision rejection exercised. No real F11 GLB downloaded: container DNS unavailable. No engine compilation, native material registration, live display or game install claimed.
