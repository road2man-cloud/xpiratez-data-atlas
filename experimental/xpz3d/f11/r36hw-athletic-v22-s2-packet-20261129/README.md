# V22 static XPZC v2 export

Actual binary based on V21 opaque model. The known R138G/H XPZC v2 format is reused. All 2100 triangles are retained with exact coordinate roundtrip. Four color strata per material are built from vertex color and base color factors only; image sampling is omitted, so hair and eye appearance may differ. This is a static packet, not a full native textured/skinned model. No engine run or capture was performed. Original GLB unchanged.

Rebuild: `node source/build.cjs /path/to/V21.glb`.

Format reference: commit `31ce14586b53a7fb1c9893de70b412f34298b1f1`. Earlier native runtime evidence for another model: `8ccffa792576cc921841e00af7aef648dbf28209`.
