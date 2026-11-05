# F11 / Silent Storm - r22-Q collaborative ornaments-only patch

Goal: Participate in F11 art development without overwriting other workers' code, models or game resources. This is a deliberately narrow independent material pass.

Native S2 test: PASS, observed on 2026-11-05 with real front/quarter screenshots and SMG visual aim/fire/reload probes.

## Changed visuals

- Double gold hairpin on one side of F11's existing green S2 hair.
- Silver skull clasp on a dark mounting plate on the cropped top.
- Four fine X laces with metal eyelets on the upper garment.
- Narrow diagonal leather strap with metallic trim and stitches.

All decorations are rasterized from the actual low-poly S2 triangles onto the original donor UV atlas, never merely drawn over a screenshot. Original F11 head and Adventurer/Ganger top source assets are SHA-256 verified before authoring.

## Non-overlap contract

- Not touched: face, eyes, skin tone, breasts, abdominal muscles, silhouette, shoulder geometry, hair mesh, skeleton, weapons, gameplay, save, animations.
- No added geometry: 1,553 vertices / 2,410 triangles; 63 original S2 bones.
- Byte-identical original S2 vertex buffer, UVs, and authored model JSON.
- Face/eye and weapon atlas tiles unchanged.
- No existing project code modified: only new standalone tool scripts in experiments/xpiratez3d/tools.
- No original EXE modified: isolated test executable is a copy of a source-built r21E EXE with one 64-byte expected atlas SHA-256 string replaced; this is not an installable patch.

## Test outputs on authorized Windows host

- Art: D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\stage32i-art-r22q-collab-native-f11
- Isolated engine: D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\stage32i-r22q-collab-native-engine
- Isolated S2 runtime: D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-f11-r22q-collab-native
- Before/after actual S2 image: F11-r22o-vs-r21e-native-S2-review-PRIVATE.png in the art directory
- Formal QA: R22Q_NATIVE_COLLAB_QA.json in the art directory

## Reproduce on an authorized Windows host

1. Run python experiments/xpiratez3d/tools/f11-ornaments-r22o.py --revision r22q.
2. Run python experiments/xpiratez3d/tools/f11-ornaments-r22o-native-prep.py with --art and --dest paths pointing to your unique private art/engine directory.
3. Run PowerShell -File experiments/xpiratez3d/tools/smoke-f11-ornaments-r22o.ps1 with -Art, -EngineReceipt, -Runtime, -PortraitQA.
4. Run python experiments/xpiratez3d/tools/test-f11-ornaments-r22q.py.
5. Inspect native screenshots as well as the unchanged 63-bone rig and mesh hashes.

Every author/prep/test command refuses to overwrite an existing output directory or QA receipt. Use separate variant paths if reproducing.

## Collaboration

Other workers can apply the additive pass to their own completed r21-family candidate by specifying --source to the patch script, provided the candidate still has the exact original S2 1,553-vertex/2,410-triangle and 63-bone contract. If they changed UVs or body topology, do not force merge: the patch rejects the mismatched mesh.

The source-built baseline engine and actual game installation remain unchanged. Private isolated native smoke validates F11 visual following and visual SMG motion, not X-Piratez damage/projectile or full campaign implementation. User art signoff remains pending.
