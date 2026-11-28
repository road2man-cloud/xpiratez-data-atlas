#!/usr/bin/env node
'use strict';
/*
  R36HW N6: rebase central geometry to ACTUAL original R36HW pants positions;
  remove earlier acute centroid spikes, taper original shorts hem toward exposed
  leg cross sections, then regenerate normals and vertex-color guide.
  2080 triangles unchanged. Not a finished undressed character.
*/
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const workRoot=path.resolve(__dirname,'../..');
const inFile=process.argv[2]||path.join(workRoot,'r36hw-n5-skin-seams-20261128/output/R36HW_N5_SEAM_LINK.glb');
const sourceFile=process.argv[3]||path.join(workRoot,'r36kp/reference/R36HW_F11_CLOTHED.glb');
const n3ReportFile=process.argv[4]||path.join(workRoot,'r36hw-n3-curvature-20261128/reports/R36HW_N3_CURVATURE.json');
const outFile=process.argv[5]||path.resolve(__dirname,'../output/R36HW_N6_REBASED_SURFACE.glb');
const reportFile=process.argv[6]||path.resolve(__dirname,'../reports/R36HW_N6_REBASED_SURFACE.json');
const hashes={
 n5:'428fb74aae696a6e904313c80d944ceb9a0564a5016453195818588f8e841702',
 hw:'a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732'
};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)},gauss=(x,c,w)=>Math.exp(-.5*((x-c)/w)**2);
function load(file,wanted){
 const b=fs.readFileSync(file);
 if(sha(b)!==wanted)throw Error('source GLB SHA mismatch: '+file+': '+sha(b));
 if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB');
 const jl=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+jl)),offset=20+jl;
 if(b.toString('ascii',offset+4,offset+8)!=='BIN\0')throw Error('Missing BIN chunk');
 return {g,bin:b.subarray(offset+8,offset+8+b.readUInt32LE(offset)),b};
}
const inModel=load(inFile,hashes.n5),hw=load(sourceFile,hashes.hw),report=JSON.parse(fs.readFileSync(n3ReportFile,'utf8'));
const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},widths={5121:1,5123:2,5125:4,5126:4};
function rows(src,id){
 const a=src.g.accessors[id],v=src.g.bufferViews[a.bufferView],dim=comps[a.type],w=widths[a.componentType],step=v.byteStride||dim*w,off=(v.byteOffset||0)+(a.byteOffset||0);
 if(a.sparse)throw Error('Sparse GLB accessor unsupported');
 const out=[];for(let i=0;i<a.count;i++){
  const row=[];for(let j=0;j<dim;j++){
   const q=off+i*step+j*w;
   row.push(a.componentType===5126?src.bin.readFloatLE(q):a.componentType===5125?src.bin.readUInt32LE(q):a.componentType===5123?src.bin.readUInt16LE(q):src.bin.readUInt8(q));
  }out.push(row);
 }return out;
}
const pants=inModel.g.meshes[0].primitives[3],original=hw.g.meshes[0].primitives[3];
if(inModel.g.skins[0].joints.length!==63||inModel.g.meshes[0].primitives.length!==10)throw Error('Unexpected N5 source');
const beforeTriangles=inModel.g.meshes[0].primitives.reduce((n,p)=>n+inModel.g.accessors[p.indices].count/3,0);
if(beforeTriangles!==2080)throw Error('N5 triangle budget changed');
const srcPos=rows(hw,original.attributes.POSITION),srcNorm=rows(hw,original.attributes.NORMAL),srcIdx=rows(hw,original.indices).map(v=>v[0]);
const inPos=rows(inModel,pants.attributes.POSITION),inNorm=rows(inModel,pants.attributes.NORMAL),inIdx=rows(inModel,pants.indices).map(v=>v[0]),inCol=rows(inModel,pants.attributes.COLOR_0);
if(srcPos.length!==92||inPos.length!==174||inIdx.length!==344*3)throw Error('N3 topology changed');
const bases=[],baseNormals=[];
for(let i=0;i<inPos.length;i++){
 if(i<srcPos.length){bases.push(srcPos[i].slice());baseNormals.push(srcNorm[i].slice());continue}
 const r=report.triangles.find(t=>t.centroidIndex===i);
 if(!r)throw Error('Missing original source triangle for centroid '+i);
 const inds=srcIdx.slice(r.originalTriangle*3,r.originalTriangle*3+3);
 if(inds.length!==3)throw Error('Invalid source triangle for centroid '+i);
 bases.push([0,1,2].map(k=>inds.reduce((s,p)=>s+srcPos[p][k],0)/3));
 baseNormals.push([0,1,2].map(k=>inds.reduce((s,p)=>s+srcNorm[p][k],0)/3));
}
// 9 x 15 low-resolution luminance landmarks, never the full image or a texture.
const lightGrid=[
 [102,96,73,93,74,54,74,77,75],[99,84,68,99,77,47,68,76,74],
 [89,64,65,100,76,41,58,73,73],[78,50,68,100,73,40,50,71,73],
 [69,45,72,102,70,42,47,70,75],[63,44,66,97,70,45,45,67,77],
 [58,47,53,79,73,49,43,60,76],[45,50,53,63,80,56,43,53,73],
 [35,53,65,56,78,70,48,53,68],[34,55,66,58,65,78,63,59],
 [35,56,62,57,54,64,70,64,69],[39,50,61,51,47,44,56,61,67],
 [51,42,56,57,46,42,49,54,62],[63,48,51,68,63,52,52,55,59],
 [66,65,54,63,72,58,53,55,58]
];
function light(x,z){
 const xx=clamp((x+.15)/.3,0,1)*8,yy=clamp((1.04-z)/.24,0,1)*14,i=Math.min(7,Math.floor(xx)),j=Math.min(13,Math.floor(yy)),u=xx-i,v=yy-j;
 return ((1-u)*(1-v)*lightGrid[j][i]+u*(1-v)*lightGrid[j][i+1]+(1-u)*v*lightGrid[j+1][i]+u*v*lightGrid[j+1][i+1])/255;
}
function relief(v){
 const [x,y,z]=v;
 const off= -.006+.007*Math.sin((z-.834)*17);
 const maskX=1-smooth((Math.abs(x)-.070)/.089),maskZ=smooth((z-.802)/.025)*(1-smooth((z-.988)/.047)),front=1-smooth((y+.057)/.105);
 const mask=clamp(maskX*maskZ*front,0,1);
 const core=gauss(x,off,.016)*gauss(z,.888,.060);
 const ridge1=gauss(x,off-.028,.014)*gauss(z,.899,.064),ridge2=gauss(x,off+.026,.014)*gauss(z,.884,.062);
 const roll=gauss(x,off-.011,.021)*gauss(z,.931,.029);
 const shade=(light(x,z)-.29)*.0013;
 return mask*(.0064*core-.0031*ridge1-.0028*ridge2-.0013*roll-shade);
}
function retouch(v){
 const p=[...v],z=p[2],lo=1-smooth((z-.797)/.060),hi=smooth((z-1.000)/.048);
 // Shrink recognizable shorts edge toward the source model's bare leg radius.
 if(Math.abs(p[0])>.067){const leg=p[0]<0?-.085:.085;p[0]=leg+(p[0]-leg)*(1-.18*lo-.026*hi)}
 p[1]*=(1-.115*lo-.055*hi);
 // Front-only actual fold/recess on the R36HW original surface, not centroid spikes.
 p[1]+=relief(v);
 return p;
}
const positions=bases.map(retouch);
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
const normalSums=Array.from({length:positions.length},()=>[0,0,0]);
for(let k=0;k<inIdx.length;k+=3){
 const [a,b,c]=inIdx.slice(k,k+3),p=positions[a],q=positions[b],r=positions[c],n=cross(q.map((v,k)=>v-p[k]),r.map((v,k)=>v-p[k]));
 for(const t of [a,b,c])for(let d=0;d<3;d++)normalSums[t][d]+=n[d];
}
function normalized(a){const len=Math.hypot(...a)||1;return a.map(x=>x/len)}
const normals=normalSums.map((n,i)=>{
 let nn=normalized(n),base=normalized(baseNormals[i]);
 if(nn.reduce((s,x,k)=>s+x*base[k],0)<0)nn=nn.map(x=>-x);
 return normalized(nn.map((x,k)=>.60*x+.40*base[k]));
});
// Average same-position duplicates for cleaner weld-like shading without altering original topology.
const clusters=new Map();
for(let i=0;i<positions.length;i++){const key=positions[i].map(x=>Math.round(x*100000)).join(',');if(!clusters.has(key))clusters.set(key,[]);clusters.get(key).push(i)}
for(const grp of clusters.values()){if(grp.length<2)continue;const avg=normalized([0,1,2].map(k=>grp.reduce((s,i)=>s+normals[i][k],0)));for(const i of grp)normals[i]=avg.slice()}
const colors=bases.map((p,i)=>{
 const off=relief(p),dark=clamp(off/.0065,0,1);
 return [255,255,255,255].map((v,k)=>k===3?v:clamp(Math.round(v-dark*[20,27,31][k]),211,255));
});
const binary=[Buffer.from(inModel.bin)];
function length(){return binary.reduce((n,b)=>n+b.length,0)}
function align(){if(length()%4)binary.push(Buffer.alloc(4-length()%4))}
function writeRows(row,type,comp,normalizedColor=false){
 align();const dim=comps[type],width=widths[comp],size=length(),data=Buffer.alloc(row.length*dim*width);
 for(let i=0;i<row.length;i++)for(let j=0;j<dim;j++){const off=(i*dim+j)*width,v=row[i][j];if(comp===5126)data.writeFloatLE(v,off);else if(comp===5123)data.writeUInt16LE(v,off);else data.writeUInt8(Math.round(clamp(v,0,255)),off)}
 binary.push(data);const view=inModel.g.bufferViews.push({buffer:0,byteOffset:size,byteLength:data.length,target:34962})-1;
 const ac={bufferView:view,componentType:comp,count:row.length,type};if(normalizedColor)ac.normalized=true;
 if(type==='VEC3'&&comp===5126){ac.min=[0,1,2].map(k=>Math.min(...row.map(v=>v[k])));ac.max=[0,1,2].map(k=>Math.max(...row.map(v=>v[k])))}
 return inModel.g.accessors.push(ac)-1;
}
pants.attributes.POSITION=writeRows(positions,'VEC3',5126);
pants.attributes.NORMAL=writeRows(normals,'VEC3',5126);
pants.attributes.COLOR_0=writeRows(colors,'VEC4',5121,true);
pants.extras={...pants.extras,stage:'R36HW_N6_ORIGINAL_SURFACE_REBASE',r36hwPristineOriginalVertices:92,centroidsReconstructedFromPristineHW:82,centroidSpikeRemoval:true,shortsEdgeBlend:true};
align();const bin=Buffer.concat(binary);inModel.g.buffers[0].byteLength=bin.length;
const jb=Buffer.from(JSON.stringify(inModel.g),'utf8'),jpad=Buffer.alloc(Math.ceil(jb.length/4)*4,32);jb.copy(jpad);
const out=Buffer.alloc(20+jpad.length+8+bin.length);
out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jpad.length,12);out.write('JSON',16,'ascii');jpad.copy(out,20);
const off=20+jpad.length;out.writeUInt32LE(bin.length,off);out.write('BIN\0',off+4,'ascii');bin.copy(out,off+8);
const differences=positions.map((p,i)=>Math.hypot(...p.map((x,k)=>x-inPos[i][k])));
const origDifferences=positions.map((p,i)=>Math.hypot(...p.map((x,k)=>x-bases[i][k])));
const result={stage:'R36HW-N6 source-surface rebase and shorts edge relaxation, does not complete concealed skin reconstruction',inputSha256:sha(inModel.b),hwSourceSha256:sha(hw.b),outputSha256:sha(out),triangles:beforeTriangles,originalSourcePantsVertices:srcPos.length,centroidVerticesReconstructed:82,totalPantsVertices:positions.length,unchangedSourceSkeletonJoints:inModel.g.skins[0].joints.length,faceAndHairGeometryUnchanged:true,edgeShrinkMaxMeters:Math.max(...origDifferences),deltaFromN5MaxMeters:Math.max(...differences),modifiedVertices:origDifferences.filter(d=>d>1e-6).length,originalBinaryPreservedBytes:inModel.bin.length,limitations:['Triangles remain 2080; not an added level of topology','Closed shorts, boots and gloves are not completely removed','Depth derived from guide features is not photogrammetry','Neither native S2 UV/normal nor dynamic skinning applied']};
fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
fs.writeFileSync(outFile,out);fs.writeFileSync(reportFile,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({outFile,triangles:beforeTriangles,rebased:positions.length,maxDelta:result.deltaFromN5MaxMeters,sha256:result.outputSha256}));
