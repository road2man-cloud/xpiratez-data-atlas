# XPZ3D F11 R36KL — 2,100-triangle central skin bridge

Experimental 2026-11-27 F11 3D character build, based on R36KK and authoritative R36HW head/face.

## Actual generated outputs

| Output | Triangle count | Rig | SHA-256 | GitHub binary uploaded |
| --- | ---: | --- | --- | --- |
| R36KL_F11_DONOR_SAMPLED_CENTRAL_1024_2100TRI.glb | 2,100 | 63 bones | `af5faf202a32e901d4ede64c120f003a9f7e8f6912582bb5ac0e76054dd76f65` | NO |
| R36KL_F11_DONOR_SAMPLED_CENTRAL_512_2100TRI.glb | 2,100 | 63 bones | `aa2f7a9d2375fe0077c3ac1d5fbd69536760e5e472c6a62315ba4179b547ef14` | NO |
| XPZ3D_R36KL_CENTRAL_SKIN_2100TRI_20261127.zip | — | — | `1d11c1efb8fa4a769a1cd01eb0dcdad61c4ceebcd6fdfa44aac770dd5f3de1e3` | NO |

The actual files, sources and images are distributed as a 30-entry ZIP in the accompanying ChatGPT conversation, produced in the local artifact container. This branch records provenance, **not a binary upload**.

## Source-derived implementation

- Source R36KK 1024/512 PBR GLBs with 2,100 triangles and 63 bones.
- R36HW authoritative GLB SHA: `a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732`
- R36JB high-resolution donor SHA: `f6b53320cc9eb43f870957a8d3db6b067a18aaa3a3feb2a85463cfc3e36c041d`
- 37 actual donor central-surface samples are saved in `R36JB_DONOR_SAMPLES.json` in the artifact package.
- Retessellate one redundant torso ring: replace 40 old triangles with 20; use the reclaimed **20 triangles** for a new central low-poly skin patch **inside the existing torso primitive**, sharing original torso vertex indices 2 and 3.
- Add 13 new skin vertices; align low-poly center depth with donor samples and rebake the 1024/512 albedo, tangent-space normal and ORM maps.
- Source R36HW face 644 triangles, hair 294 triangles, eye and hand data and all 63 bones are **unchanged**.
- Total game mesh remains exactly **2,100 triangles**. High-density 6,044-triangle donor geometry is **not embedded**.
- The low-poly result is partial. Thigh/hip seams remain, and no claim of full donor-detail reconstruction, full animation robustness, or S2/S3 engine readiness is made.

## Artifact contents

The ZIP contains two GLBs, source and authority GLBs, generation script `build_r36kl.py`, dependencies, actual donor measurements, PNG texture maps, five actual-GLB software renders, comparison PNG, and a fully embedded offline HTML comparison dashboard.

This path is under `experimental/xpz3d/f11/` so that game-data mainline files remain untouched.
