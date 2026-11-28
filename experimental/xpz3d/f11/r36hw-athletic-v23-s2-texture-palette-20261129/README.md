# V23 texture-sampled XPZC v2 export

V21 source geometry, opaque outfit and all 2100 triangles unchanged. Unlike V22, decodes embedded base-color PNG images and samples four points per textured triangle; multiplies linearized texture RGB with vertex RGB and material factors. Four color strata per primitive, 24 groups. The packet preserves the existing XPZC v2 static layout. This is a flat-color approximation, not GPU UV mapping. No native run, skinning or alpha blending. Color packing uses linear RGB bytes as a working convention; actual S2 response remains unverified.

Rebuild: `node source/build.cjs /path/to/V21.glb`.

See `reports/build.json` for source and decoded texture audit. Format reference: commit `31ce14586b53a7fb1c9893de70b412f34298b1f1`. Runtime evidence for a different model: `8ccffa792576cc921841e00af7aef648dbf28209`.
