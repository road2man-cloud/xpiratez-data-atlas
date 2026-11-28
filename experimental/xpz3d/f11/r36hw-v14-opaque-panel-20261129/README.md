# V14 opaque garment hip-wrap panel

Base: V14 shoulder, commit ae22741b095601ce6a6cfe42e12815d7d3fc3453. Independent opaque athletic textile panel, not an N19 anatomical transfer.

- Existing garment faces are partitioned into 934 main textile triangles and 98 panel triangles.
- Total model triangle count: 2100. Existing vertex, skinning, animation-related, and image buffer bytes are unchanged.
- Existing textile normal atlas reused with strength 0.29 (base 0.22). No vertex displacement or anatomy-derived texture.
- GLB size: 410128 bytes. Structural invariants checked; visual and native engine validation not performed.

Build: `node build.mjs <V14.glb> <output.glb>`.
