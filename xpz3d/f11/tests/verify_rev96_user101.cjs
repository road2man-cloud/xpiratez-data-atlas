'use strict';
// Independent immutable-trim verification for the exact 2026-11-16 15:28 user JSON.
// Tests exact source face IDs, 754 rest/open55 coordinates, 63-bone rig, garment,
// and non-restoration of any of the 101 original removed triangles.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname;
const basename='r21AO-F11-skin-separated-rev92-base.glb';
const basePath=path.resolve(root,'../F11_Web_Review_ghpages_20261105/f11/r21al',basename);
const inputPath=path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function getGLB(file){
 const raw=fs.readFileSync(file);
 if(raw.toString('ascii',0,4)!=='glTF')throw Error('Invalid GLB '+file);
 const len=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+len));
 const at=28+len,bin=raw.subarray(at,at+raw.readUInt32LE(20+len));
 return {raw,doc,bin,file};
}
const comp={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function read(g,id){
 const a=g.doc.accessors[id],v=g.doc.bufferViews[a.bufferView],sz=comp[a.componentType][0],fn=comp[a.componentType][1],n=dims[a.type],offset=(a.byteOffset||0)+(v.byteOffset||0),stride=v.byteStride||sz*n;
 const r=[];
 for(let i=0;i<a.count;i++){
  let row=[];for(let k=0;k<n;k++)row.push(g.bin[fn](offset+i*stride+k*sz));
  r.push(n===1?row[0]:row);
 }return r;
}
const original=getGLB(basePath),userBytes=fs.readFileSync(inputPath),input=JSON.parse(userBytes.toString('utf8'));
if(sha(original.raw)!=='c6d1665cab6b9ad185090843b53e4973e5115c343e96c02de7a5599557ca3783')throw Error('Original source mismatch');
if(sha(userBytes)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Canonical JSON mutated');
if(input.deletedFaces.length!==101||input.positions.length!==754||Object.keys(input.controls).length!==106)throw Error('User snapshot cardinality incorrect');
const op=original.doc.meshes[0].primitives,origIdx=op.map(p=>read(original,p.indices));
const mask=op.map(()=>new Set());
for(const f of input.deletedFaces){
 const i=f.primitive,t=f.triangle,p=op[i];
 if(p.extras?.layer==='garment'||mask[i].has(t))throw Error('Garment/duplicate user deletion '+i+':'+t);
 const sourceTriple=origIdx[i].slice(t*3,t*3+3);
 if(sourceTriple.join(',')!==f.vertices.join(','))throw Error('Face IDs not anchored to rev92 GLB '+i+':'+t);
 mask[i].add(t);
}
const expected=origIdx.map((arr,pi)=>{
 const remaining=[];for(let t=0;t<arr.length/3;t++)if(!mask[pi].has(t))remaining.push(...arr.slice(t*3,t*3+3));
 return remaining;
});
const triangleKey=t=>t.slice().sort((a,b)=>a-b).join(':');
const garments=op.flatMap((p,i)=>p.extras?.layer==='garment'?[i]:[]);
const expectedCounts={13:100,18:1};
if(mask[13].size!==100||mask[18].size!==1||mask.reduce((s,m)=>s+m.size,0)!==101)throw Error('Mask distribution incorrect');
const outputFiles=[
 ['base','r21AO-F11-user-trim-rev96-base.glb',3546,0],
 ['minimal','r21AO-F11-user-trim-rev96-bridge-minimal-r4.glb',3552,6],
 ['smooth','r21AO-F11-user-trim-rev96-bridge-smooth-r4.glb',3566,20]
];
const reports=[];
for(const [kind,file,expectedTri,expectedAdded] of outputFiles){
 const g=getGLB(path.join(root,file)),ps=g.doc.meshes[0].primitives;
 if(ps.length!==op.length||g.doc.skins[0].joints.length!==63)throw Error('Rig/topology altered '+kind);
 const indexArrays=ps.map(p=>read(g,p.indices));
 const counted=indexArrays.reduce((a,x)=>a+x.length/3,0);
 const garmentTriangles=garments.reduce((a,i)=>a+indexArrays[i].length/3,0);
 if(counted!==expectedTri||garmentTriangles!==370)throw Error('Face/garment count incorrect '+kind);
 let seamFaces=0;
 for(let pi=0;pi<ps.length;pi++){
  const ids=indexArrays[pi],expectedBase=expected[pi];
  if(ids.length<expectedBase.length)throw Error('Surviving originals lost in '+kind+':'+pi);
  if(ids.slice(0,expectedBase.length).join(',')!==expectedBase.join(','))throw Error('Surviving face index order changed '+kind+':'+pi);
  if(ids.length>expectedBase.length && ![17,18].includes(pi))throw Error('Added faces outside lateral skin '+kind+':'+pi);
  const newFaces=(ids.length-expectedBase.length)/3;
  seamFaces+=newFaces;
  const forbidden=new Set([...mask[pi]].map(t=>triangleKey(origIdx[pi].slice(t*3,t*3+3))));
  for(let t=0;t<ids.length;t+=3){
   if(forbidden.has(triangleKey(ids.slice(t,t+3))))throw Error('User deleted face reappeared '+kind+':'+pi+':'+t/3);
  }
  const accessor=g.doc.accessors[ps[pi].indices];
  if(accessor.componentType!==5123)throw Error('Unexpected 32-bit index GLB renderer incompatibility '+kind+':'+pi);
 }
 if(seamFaces!==expectedAdded)throw Error('Wrong seam count '+kind);
 let editCount=0;
 for(const e of input.positions){
  const p=ps[e.primitive],R=read(g,p.attributes.POSITION),D=read(g,p.targets[0].POSITION),at=e.id;
  if(at>=R.length)throw Error('Missing sculpt vertex '+kind+':'+e.primitive+':'+at);
  for(let k=0;k<3;k++){
   if(Math.abs(R[at][k]-e.restXYZ[k])>1e-5||Math.abs(R[at][k]+D[at][k]-e.open55XYZ[k])>1e-5)
    throw Error('Sculpt coordinate change '+kind+':'+e.primitive+':'+at+':'+k);
  }
  editCount++;
 }
 reports.push({kind,file,sha256:sha(g.raw),triangles:counted,addedFaces:seamFaces,retainedUserDeletions:101,matchedSculptVertices:editCount,rigBones:63,garmentTriangles:370});
}
const render=JSON.parse(fs.readFileSync(path.join(root,'rev96-user101-render-report.json'),'utf8'));
if(render.captures.length!==24||render.errors.length!==0)throw Error('Render capture incomplete or browser errors');
const out={
 schema:'xpz3d-f11/rev96-user101/independent-verification-v1',
 status:'structural-validity-passed-not-visual-approved',
 sourceSha256:sha(original.raw),userSnapshotSha256:sha(userBytes),
 originalFaces:3647,deletedFaces:101,removedByPrimitive:expectedCounts,
 originalRestAndOpen55Edits:754,controlSettings:106,
 outputs:reports,render:{captures:render.captures.length,errors:render.errors.length,angles:[0,25,40,55]},
 constraints:{all101DeletedFacesRemainAbsent:true,garmentSeparate:true,rig63Bones:true,forbidRestoration:true},
 warnings:['Actual 3D silhouette still has older lateral flare structures; seam aesthetic completion not claimed',
           'Small bridge addition is experimental and should not be promoted without user review']
};
const dest=path.join(root,'REV96_USER101_INDEPENDENT_CHECK.json');
fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(out,null,2));
