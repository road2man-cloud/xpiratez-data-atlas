'use strict';
/** r26: actual visual material unification of remaining authored 529-face core
 * and the already physically fused posterior 1074-face generated skin mesh.
 * Preserve exact binary vertex streams, UV, morph, 63-bone skinning.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const src='r21AO-F11-user101-integrated-oval-r26-smoothed-gentle.glb';
const expected='b7f323838518b4e89945df74c72c1d3804fcb2b59fde8c213b7c17cdf501b6d0';
const dest='r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb';
const audit='REV96_USER101_R26_UNIFIED_SKIN_V2_BUILD.json';
if([dest,audit].some(f=>fs.existsSync(path.join(root,f))))throw Error('Refuse overwrite');
const raw=fs.readFileSync(path.join(root,src));if(hash(raw)!==expected)throw Error('Wrong r26 source');
const len=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+len)),bo=20+len,bin=Buffer.from(raw.subarray(bo+8,bo+8+raw.readUInt32LE(bo)));
const p=doc.meshes[0].primitives;
if(p.length!==24||p[13].material!==3||p[23].material!==5)throw Error('Different revision');
const before=p[13].material;
p[13].material=5;
p[13].extras={...p[13].extras,rev96r26UnifyingOuterSkinMaterial:5,originalAuthoredTissueAttributesPreserved:true};
p[23].extras={...p[23].extras,rev96r26MaterialUnifiedWithAuthoredCore:true};
doc.extras={...doc.extras,revision:'rev96-user101-r26-unified-skin-v2',unifiedAuthoredAndPerinealSkinMaterial:true,materialIndex:5,originalAuthored908GeometryUnchanged:true,proceduralCavityAndTissueAttributesRetained:true,wholeBodyWatertight:false,visualAcceptance:'candidate-not-approved'};
const j=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const head=Buffer.alloc(12),a=Buffer.alloc(8),b=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);
a.writeUInt32LE(jp.length,0);a.write('JSON',4);b.writeUInt32LE(bp.length,0);b.write('BIN\0',4);
const out=Buffer.concat([head,a,jp,b,bp]);fs.writeFileSync(path.join(root,dest),out,{flag:'wx'});
const report={file:dest,sha256:hash(out),source:src,sourceSha256:expected,authorCoreMaterialBefore:before,authorCoreMaterialAfter:p[13].material,skinMaterial:p[23].material,nonMaterialVertexDataUnchanged:true,triangles:p.reduce((n,pi)=>n+doc.accessors[pi.indices].count/3,0),boneCount:doc.skins[0].joints.length,individualGarmentFaces:p.reduce((n,pi)=>n+(pi.extras?.layer==='garment'?doc.accessors[pi.indices].count/3:0),0),visualApproved:false};
fs.writeFileSync(path.join(root,audit),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report);
