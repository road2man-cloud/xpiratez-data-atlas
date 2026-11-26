# XPZ3D F11 — R36KM central-skin and thigh-weight build

Produced in the ChatGPT container on **2026-11-27**. Experimental character model build; does not modify the official X-Piratez ruleset database.

## Actual models produced

| Asset | Triangles | Bones | Bytes | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `R36KM_F11_CENTER_AND_THIGH_SKIN_1024_2100TRI.glb` | 2,100 | 63 | 408,272 | `02999db6b39eb364a65b39375dda14e13557271d579d0b187d2ffa7d06652503` |
| `R36KM_F11_CENTER_AND_THIGH_SKIN_512_2100TRI.glb` | 2,100 | 63 | 295,776 | `e6acdee480c99adf57168f0726a385afec66ff32ff175996663cc29df423c1de` |

### Actual geometry, rig, and texture changes
- Replaced R36KL's 20-triangle central skin patch with a new, more evenly tessellated **40-triangle** patch attached to original torso vertex indices 2 and 3.
- Recovered the 20-triangle budget by deleting an upper torso circumferential ring's 40 faces and reconnecting with 20 faces.
- Adjusted both upper-leg skin primitives' 55 top-region vertices each; blending Hip with corresponding thigh bone across the hip/thigh boundary.
- Refreshed skin **albedo / normal / ORM** 1024- and 512-pixel maps and embedded them in the corresponding GLBs.
- Preserved R36HW-derived face (644△), hair (294△), eyes/hands and 63-bone rig. Protected primitives were verified bytewise at accessor/material/indices level against R36KL input.
- R36JB's 6,044△ editor anatomy is **not embedded**; only measured depth samples guide low-poly exterior skin approximation.

### Limits
**Not** a finished fully fused central anatomy: independent hip/thigh mesh boundaries remain; all-pose stability and S2/S3 runtime integration remain unverified. Render PNGs are GLB-driven software previews, not game-engine screen captures.

### Distribution
The full 33-entry archive `XPZ3D_R36KM_CENTRAL_AND_THIGH_2100TRI_20261127.zip` was generated in the ChatGPT artifact sandbox and is available in the corresponding conversation. **GitHub branch has build metadata only; GLB/PNG/ZIP binaries are not committed.**

Archive SHA-256: `c29fd4a87cb21baaa43fca4a75ae3cc72ee78232213d12358454f31065aa586c`.

Reproduction scripts in the ZIP: `build_r36km.py`, `build_r36kk.py`, `glb_io_r36kj.py`, `compact_gltf.py`, `render_r36kj.py`, `make_dashboard_r36km.py`.
