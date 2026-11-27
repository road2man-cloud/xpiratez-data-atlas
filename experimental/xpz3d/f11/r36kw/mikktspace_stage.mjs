// Use the exact MikkTSpace implementation shipped with pinned three.js r170.
// Input/output are build data only. No model, material, or file mutation here.
import fs from 'node:fs';
import * as MikkTSpace from './viewer_deps/node_modules/three/examples/jsm/libs/mikktspace.module.js';
await MikkTSpace.ready;
const data=JSON.parse(fs.readFileSync(0,'utf8'));
const result=data.map(p=>{
 const t=MikkTSpace.generateTangents(new Float32Array(p.position),new Float32Array(p.normal),new Float32Array(p.uv));
 // Same glTF sign convention as r170 BufferGeometryUtils.computeMikkTSpaceTangents.
 for(let i=3;i<t.length;i+=4)t[i]*=-1;
 if(Array.from(t).some(x=>!Number.isFinite(x)))throw new Error('Nonfinite tangent');
 return Array.from(t);
});
process.stdout.write(JSON.stringify(result));
