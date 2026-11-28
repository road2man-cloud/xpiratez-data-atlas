#!/usr/bin/env node
'use strict';
/* Extract only actual connected N18 pelvic-center triangles.
 * The result is a LOCAL EDITING ASSET, not a detached final character,
 * and preserves original coordinates, UV, joints and vertex weights.
 */
const fs=require('fs'),path=require('path');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const input=process.argv[2]||path.resolve(__dirname,'../output/R36HW_N18_FRONT_SKIN_RESTORED.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N18_CENTER_EDITING_SUBMESH.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N18_CENTER_EDITING_SUBMESH.json');
const expected='cbf436a41905d1278697ad1520b8000318ea1130485ed1c325d87341483516a9';
const q=load(input);if(q.sha!==expected)throw Error('N18 GLB SHA changed '+q.sha);
if(q.g.skins[0].joints.length!==63)throw Error('Original rig missing');
const m=extract(q,0,3),ids=m.indices,positions=m.positions;
const keep=[],range=[],include=f=>{
 const p=f.map(i=>positions[i]),c=[0,1,2].map(k=>p.reduce((s,v)=>s+v[k],0)/3);
 return Math.abs(c[0])<.102&&c[2]>.832&&c[2]<.974&&c[1]<-.025;
};
for(let i=0;i<ids.length;i+=3){const f=ids.slice(i,i+3);if(include(f)){keep.push(...f);range.push(i/3)}}
if(keep.length<110||keep.length>800)throw Error('Unexpected center-only patch selection '+keep.length/3);
const b=new Builder(q),source=q.g.meshes[0].primitives[3],dest=JSON.parse(JSON.stringify(source));
dest.indices=b.addAccessor(keep.map(v=>[v]),'SCALAR',5123,34963);
dest.extras={...dest.extras,stage:'N18_CENTER_EDITING_ASSET',localOnly:true,connectedToOriginalPelvisCoordinates:true,originalRig63:true};
b.g.meshes[0].primitives=[dest];
for(let i=1;i<b.g.meshes.length;i++)b.g.meshes[i].primitives=[];
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
const result=b.save(output);
const report={type:'center-only editing derivative from N18 original HW pelvis',sourceSHA256:q.sha,outputSHA256:result.sha,triangles:keep.length/3,originalPrimitiveTriangles:ids.length/3,skinJoints:q.g.skins[0].joints.length,materialPreserved:true,positionsUnchanged:true,sourceUVPreserved:true,originalJointsWeightsPreserved:true,selectedTriangleIDs:range,limitations:['Open crop borders are intentional editing boundaries','This is not the standalone 2,099-triangle full character and is not a finished welded anatomical patch','No native S2 capture']};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,sha:result.sha,centerTriangles:report.triangles,skinJoints:report.skinJoints}));
