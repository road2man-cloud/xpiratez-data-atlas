# R36HW Athletic V16 — integrated N19 fabric

V14 shoulder-optimized, opaque athletic suit is the immutable source. V16 integrates N19-derived relief directly into the existing garment mesh, rather than adding V15's second shell. It locally splits marked edges and their neighboring triangles, preserves existing garment material, UV charts, skeletal weights and the other V14 primitives. N19 vertex colors, when available, influence fabric tonality; N19 geometry informs bounded relief. Anatomical donor geometry is never copied to the render mesh. Triangle budget may exceed 2100 where useful.

Build: Node.js source/build.cjs with V14 and N20 GLB inputs. Output: output/R36HW_F11_ATHLETIC_SUIT_V16_INTEGRATED_N19.glb. Report: reports/build.json. Native S2 visual acceptance remains pending.
