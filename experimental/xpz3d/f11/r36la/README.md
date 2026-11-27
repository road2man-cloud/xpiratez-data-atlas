# R36LA — F11 motion-ready GLBs

2026-11-27. Input: R36KY POT-compatible 512/1024 GLBs, commit b0a2626acd479123a919ab5b2bfd8039098df5a2. This version adds authored procedural skeletal clips. It is not a recovered original S2/S3 animation set, not a mesh redesign and not an installed engine mod.

## Actual outputs

- [1024 GLB](output/R36LA_F11_MOTION_POT_1024_2100TRI.glb?raw=1)
- [512 GLB](output/R36LA_F11_MOTION_POT_512_2100TRI.glb?raw=1)
- [Complete bundle](R36LA_COMPLETE_BUNDLE.zip?raw=1)
- [Rig mapping](output/R36LA_RIG_MAP.json)

Both variants retain 2,100 triangles, 2,047 vertices, 63 joints, 15 primitives and all 11 original embedded image byte streams. Existing node hierarchy, bind transforms, vertex attributes, material parameters and indices are unchanged. No high-poly restoration is claimed. The R36KY source had no embedded animations.

| Clip | Duration | Samples | Channels |
|---|---:|---:|---:|
| F11_Idle_Loop | 3.0 s | 91 | 17 |
| F11_Walk_InPlace_Loop | 1.2 s | 37 | 17 |
| F11_LookAround_Loop | 4.0 s | 121 | 17 |
| F11_Ready_Reset | 1.5 s | 46 | 17 |

Each clip includes rotation tracks on 16 joints and hip vertical translation. Local rotations multiply the rest orientation, quaternions are normalized and endpoints match. There is no horizontal root motion. The clips intentionally do not overwrite equipment socket transforms. Exact node mapping is provided in the rig JSON. Actual engine bone-name compatibility, transitions, playback and IK/contact have not been tested. Walking is a synthetic in-place cycle, not foot-locked locomotion.

## Build

Python 3.9+ with numpy and Pillow. The ZIP includes both input GLBs. Run python prepare_r36la.py to fetch pinned inputs if absent. Then python build_r36la.py creates both GLBs and rig JSON. python publish_r36la.py packages the bundle. Explicit --publish requires authenticated gh and creates a new append-only GitHub directory; never force-pushes.

Build reports verify original vertex attributes, indices, rig, image bytes and keyframe properties. No actual S2/S3 game run or visual review has been performed, and the game installation folder has not been changed. The internal ChatGPT environment could not resolve GitHub DNS; actual build used isolated C:\mnt\data\r36la_work.
