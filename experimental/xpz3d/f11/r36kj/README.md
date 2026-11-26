# XPZ3D F11 — R36KJ skin UV efficiency (experimental)

Produced in the ChatGPT internal artifact workspace on 2026-11-27 (Asia/Seoul). This branch builds on **R36KI** and changes the **actual GLB**, not merely a design mockup.

## Production changes
- Preserves all **2,100 triangles**, **63 rig bones**, and untouched R36HW source face (644△), hair (294△), eyes and hands.
- Corrects a specific R36KI UV layout inefficiency: five skin islands (torso, both shoulders, both legs) were using **only 50% of allocated horizontal atlas width**. New UVs use the full width (100%). Face indices, skin weights, positions, and normals are retained.
- Rebakes sprite-palette skin appearance into **Albedo / tangent-space Normal / AO-Roughness-Metallic** maps, with body-part-specific shading and soft transitions.
- Builds both **1024px quality** and **512px compact** GLBs; both have self-contained texture payloads and complete material bindings.
- Includes source-reproducible Python builder, PNG maps, actual GLB render comparisons, and an offline side-by-side dashboard in the conversation ZIP.

| Build | Triangles | Bones | GLB bytes | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| R36KJ 1024px | 2,100 | 63 | 1,264,312 | `f40231b0be8fd1d1ea2f6736f2864d733c6410b08f23127ee1485023b4949635` |
| R36KJ 512px | 2,100 | 63 | 899,508 | `429ef61ca23b7be493014233348f0efc2673c56e1228d229cf5ca50321bef2d2` |

## Authoritative provenance
- R36HW original GLB SHA-256: `a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732`
- R36KI input SHA-256: `c9d6650b4addf24412d512f1d00844cd861be74bcbe821c640f62be5ff8f3d0c`
- Package ZIP SHA-256: `e829b7dc8d05ff2249aabc224fc7d06fa598902fcf61dcb2ed0b24f2c9804771`

## Limitations
- Detailed R36JB high-density anatomical geometry **is not embedded** in the 2,100-triangle game model. This release improves texture-level external anatomy only.
- Detached shoulder/thigh junctions remain a geometry issue; no false claim of watertight welding or engine readiness.
- Offline viewport samples approximate diffuse texture and does not implement full real-time glTF PBR normal/ORM shading.
- Browser runtime inspection was blocked by the local execution environment. Source and GLB were produced and checked structurally; screenshots are software-raster previews, not a real S2/S3 render.
- The full ZIP, GLB binaries and PNGs were generated as ChatGPT sandbox files. **These binaries are not committed to this GitHub branch** (GitHub's text-file connector does not accept sandbox-local binary paths).

The branch is for experimental F11 model development, separate from the official game ruleset DB.
