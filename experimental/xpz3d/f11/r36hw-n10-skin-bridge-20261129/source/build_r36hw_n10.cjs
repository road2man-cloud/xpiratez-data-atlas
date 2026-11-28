#!/usr/bin/env node
'use strict';
/*
 * R36HW N10 surface bridge: remove clothing-origin upper/lower cap surfaces
 * and reshape existing original-HW derived waist / thigh geometry toward
 * exposed source skin boundaries. No R36JB substitution, no photo projection.
 * Mesh topology is modified, but this is not a final fully undressed character.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n9-direct-skin-front-20261128/output/R36HW_N9_DIRECT_SKIN_FRONT.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N10_SKIN_BRIDGE.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N10_SKIN_BRIDGE.json');
const expected='402bc489d3696518f81adc996d3f755b4a71bfd0582fc956668d0fef7a9d98d7';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync(input);
if(sha(source)!==expected)throw Error('R36HW N9 input hash changed: '+sha(source));
if(source.toString('ascii',0,4)!=='glTF'||source.readUInt32LE(4)!==2||source.readUInt32LE(8)!==source.length)throw Error('Invalid GLB2');
const jsonLen=source.readUInt32LE(12),g=JSON.parse(source.toString('utf8',20,20+jsonLen)),bh=20+jsonLen;
if(source.toString('ascii',bh+4,bh+8)!=='BIN\0')throw Error('Invalid GLB BIN');
const bin=source.subarray(bh+8,bh+8+source.readUInt32LE(bh));
const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},width={5121:1,5123:2,5125:4,5126:4};
function read(id){
 const a=g.accessors[id],v=g.bufferViews[a.bufferView],dim=comps[a.type],w=width[a.componentType],step=v.byteStride||dim*w,off=(v.byteOffset||0)+(a.byteOffset||0);
 if(a.sparse)throw Error('Sparse accessor unsupported '+id);
 const rows=[];for(let i=0;i<a.count;i++){const row=[];for(let j=0;j<dim;j++){
  const p=off+i*step+j*w;if(p+w>bin.length)throw Error('Accessor OOB');
  row.push(a.componentType===5126?bin.readFloatLE(p):a.componentType===5125?bin.readUInt32LE(p):a.componentType===5123?bin.readUInt16LE(p):bin.readUInt8(p));
 }rows.push(row)}return rows;
}
const mesh=g.meshes[0],prims=mesh.primitives;
if(g.meshes.length!==1||prims.length!==10||g.skins[0].joints.length!==63)throw Error('Unexpected N9 structure');
const before=prims.reduce((s,p)=>s+g.accessors[p.indices].count/3,0);
if(before!==2098)throw Error('Original budget changed');
const pelvis=prims[3],skin=prims[6],attrs=pelvis.attributes;
const pos=read(attrs.POSITION),sourcePos=pos.map(v=>v.slice()),oriNorm=read(attrs.NORMAL);
const joints=read(attrs.JOINTS_0),weights=read(attrs.WEIGHTS_0),colors=read(attrs.COLOR_0),uv=read(attrs.TEXCOORD_0);
const indices=read(pelvis.indices).map(r=>r[0]);
const skinPos=read(skin.attributes.POSITION),skinIds=read(skin.indices).map(r=>r[0]);
if(pos.length!==183||indices.length!==362*3)throw Error('Unexpected N9 pelvis geometry');
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const gauss=(x,c,s)=>Math.exp(-.5*((x-c)/s)**2);
const midrange=skin.extras?.ranges?.find(r=>r.name==='Visible midriff');
if(!midrange)throw Error('No original skin midriff range');
const torsoUnique=[...new Set(skinIds.slice(midrange.startTriangle*3,(midrange.startTriangle+midrange.triangles)*3))];
const waistSkin=torsoUnique.map(i=>skinPos[i]).filter(v=>Math.abs(v[2]-1.015)<.002);
if(waistSkin.length!==10)throw Error('Original midriff ring changed '+waistSkin.length);
const torsoCenter=[0,.009],torsoAngles=waistSkin.map(v=>({angle:Math.atan2(v[1]-torsoCenter[1],v[0]),p:v})).sort((a,b)=>a.angle-b.angle);
function contour(target,origin){
 const [cx,cy]=origin;let ang=Math.atan2(target[1]-cy,target[0]-cx);
 if(ang<target.length-1e9){} // intentional no-op removed in later authoring
 let a=target[0].angle;while(ang<a)ang+=2*Math.PI;
 for(let i=0;i<target.length;i++){
  const l=target[i],r=i+1<target.length?target[i+1]:{angle:target[0].angle+2*Math.PI,p:target[0].p};
  if(ang>=l.angle-1e-10&&ang<=r.angle+1e-10){const t=clamp((ang-l.angle)/(r.angle-l.angle));
   return [0,1,2].map(k=>l.p[k]*(1-t)+r.p[k]*t);
  }
 }
 throw Error('No contour interpolation');
}
function legContour(side){
 const name=side>0?'L leg below shorts':'R leg below shorts';
 const rg=skin.extras.ranges.find(r=>r.name===name);
 if(!rg)throw Error('Leg ring '+name+' missing');
 const ids=[...new Set(skinIds.slice(3*rg.startTriangle,3*(rg.startTriangle+rg.triangles)))];
 const cx=side*.09,cy=-.031;
 const entries=ids.map(i=>skinPos[i]).filter(v=>Math.abs(v[2]-.815)<.002&&Math.hypot(v[0]-cx,v[1]-cy)>.044);
 if(entries.length!==7)throw Error('Leg contour ring expected 7, got '+entries.length);
 return entries.map(p=>({angle:Math.atan2(p[1]-cy,p[0]-cx),p})).sort((a,b)=>a.angle-b.angle);
}
const legRings={1:legContour(1),'-1':legContour(-1)};
const topMatches=[],bottomMatches=[];
for(let i=0;i<pos.length;i++){
 const p=pos[i],old=p.slice(),z=p[2],x=p[0];
 if(z>1.044&&z<1.046&&i!==48){
  const target=contour(torsoAngles,p,torsoCenter);
  // Join the current top opening directly to the 10-point visible-HW midriff ring.
  for(let a=0;a<3;a++)p[a]=target[a];
  topMatches.push({index:i,delta:Math.hypot(...p.map((v,k)=>v-old[k]))});
 }else if(z>=.807&&z<=.831&&Math.abs(x)>.025){
  const side=x>0?1:-1,cx=side*.09;
  const target=contour(legRings[side],p,[cx,-.031]);
  const frac=1-smooth((z-.814)/.018);
  const delta=target.map((v,k)=>(v-p[k])*frac),length=Math.hypot(...delta);
  const factor=length>.012?.012/length:1;
  for(let a=0;a<3;a++)p[a]+=delta[a]*factor;
  if(length>.00001)bottomMatches.push({index:i,delta:Math.hypot(...p.map((v,k)=>v-old[k]))});
 }
}
// Keep central fold as actual geometry with bounded smooth profile.
// Reduce broad diamond facets using local adjacency-dependent relaxation.
const connectivity=Array.from({length:pos.length},()=>new Set());
for(let k=0;k<indices.length;k+=3){const [a,b,c]=indices.slice(k,k+3);for(const [u,v] of [[a,b],[b,c],[c,a]]){connectivity[u].add(v);connectivity[v].add(u)}}
function fold(v){
 const [x,y,z]=v,mask=smooth((z-.849)/.037)*(1-smooth((z-.965)/.041))*(1-smooth((Math.abs(x)-.05)/.065));
 const shift=-.005+.006*Math.sin((z-.86)*15);
 return mask*(.0032*gauss(x,shift,.012)*gauss(z,.897,.05)-.0018*gauss(x,shift-.03,.015)*gauss(z,.890,.056)-.0017*gauss(x,shift+.03,.014)*gauss(z,.884,.053));
}
let relaxed=0;
for(let turn=0;turn<3;turn++){
 const next=pos.map(p=>p[1]);
 for(let i=0;i<pos.length;i++){
  const p=pos[i],z=p[2],x=p[0],y=p[1];
  if(z<.837||z>1.008||connectivity[i].size<3)continue;
  const front=1-smooth((y+.016)/.09),height=smooth((z-.84)/.035)*(1-smooth((z-.986)/.050));
  const mask=clamp(front*height*(1-smooth((Math.abs(x)-.075)/.095)));
  if(mask<.005)continue;
  let w=0,sum=0;for(const id of connectivity[i]){const q=pos[id];
   const dx=(x-q[0])/.072,dz=(z-q[2])/.080,wt=Math.exp(-.5*(dx*dx+dz*dz));
   sum+=wt*q[1];w+=wt;
  }
  if(w>0){next[i]+=.45*mask*(sum/w-y);relaxed++}
 }
 for(let i=0;i<pos.length;i++)pos[i][1]=next[i];
}
for(let i=0;i<pos.length;i++){
 const [x,y,z]=pos[i];if(z>.84&&z<.995&&y<-.027)pos[i][1]+=fold(pos[i])*.65;
}
// Remove original 'closed clothing' cap at top, and planar underside patches.
// These currently occlude the retained skin underneath.
const kept=[],removed={top:[],legUnder:[]};let bottomResidual=0;
for(let t=0;t<indices.length/3;t++){
 const ids=indices.slice(t*3,t*3+3),orig=ids.map(i=>sourcePos[i]),z=orig.map(p=>p[2]),x=orig.map(p=>p[0]);
 const topCap=z.every(v=>v>1.043);
 const lowCap=z.every(v=>v<.8172)&&Math.max(...z)-Math.min(...z)<.0055;
 if(topCap){removed.top.push(t);continue}
 if(lowCap){removed.legUnder.push(t);continue}
 kept.push(ids);if(z.every(v=>v<.83))bottomResidual++;
}
if(removed.top.length!==16||removed.legUnder.length<70)throw Error('Unexpected N9 cap classification '+removed.top.length+'/'+removed.legUnder.length);
const targetVertices=pos.length;
const newIndices=kept.flat();
const targetTriangles=before-removed.top.length-removed.legUnder.length;
if(targetTriangles>2100||targetTriangles<1900)throw Error('Budget after cap removal unexpected '+targetTriangles);
// Smooth face normals with weighted area to preserve original HW surface orientation.
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function unit(a){const n=Math.hypot(...a)||1;return a.map(v=>v/n)}
const normalAcc=Array.from({length:pos.length},()=>[0,0,0]);
let minArea=Infinity;
for(const ids of kept){const [a,b,c]=ids.map(i=>pos[i]),n=cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));
 const area=Math.hypot(...n)/2;if(area>0)minArea=Math.min(minArea,area);
 for(const j of ids)for(let d=0;d<3;d++)normalAcc[j][d]+=n[d];
}
const normals=normalAcc.map((v,i)=>{
 let n=unit(v),old=unit(oriNorm[i]);if(n.reduce((s,q,k)=>s+q*old[k],0)<0)n=n.map(x=>-x);
 return unit(n.map((q,k)=>.85*q+.15*old[k]));
});
const chunks=[Buffer.from(bin)];
function size(){return chunks.reduce((n,b)=>n+b.length,0)}
function align(){if(size()%4)chunks.push(Buffer.alloc(4-size()%4))}
function append(rows,type,component,target=34962,normalized=false){
 align();const offset=size(),dim=comps[type],w=width[component],data=Buffer.alloc(rows.length*dim*w);
 for(let i=0;i<rows.length;i++)for(let j=0;j<dim;j++){const val=rows[i][j],p=(i*dim+j)*w;
  if(!Number.isFinite(val))throw Error('Invalid numeric buffer value');
  if(component===5126)data.writeFloatLE(val,p);else if(component===5123)data.writeUInt16LE(Math.round(val),p);else if(component===5125)data.writeUInt32LE(Math.round(val),p);else data.writeUInt8(clamp(Math.round(val),0,255),p);
 }
 chunks.push(data);const view=g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target})-1;
 const acc={bufferView:view,componentType:component,count:rows.length,type};if(normalized)acc.normalized=true;
 if(type==='VEC3'&&component===5126){acc.min=[0,1,2].map(k=>Math.min(...rows.map(v=>v[k])));acc.max=[0,1,2].map(k=>Math.max(...rows.map(v=>v[k])))}
 return g.accessors.push(acc)-1;
}
attrs.POSITION=append(pos,'VEC3',5126);
attrs.NORMAL=append(normals,'VEC3',5126);
pelvis.indices=append(newIndices.map(x=>[x]),'SCALAR',5123,34963);
g.accessors[pelvis.indices].min=[0];g.accessors[pelvis.indices].max=[pos.length-1];
pelvis.extras={...pelvis.extras,stage:'N10_ORIGINAL_SKIN_EDGE_BRIDGING',topCapTrianglesRemoved:removed.top.length,underShortsTrianglesRemoved:removed.legUnder.length,notFullUndress:true};
align();const finalBin=Buffer.concat(chunks);g.buffers[0].byteLength=finalBin.length;
const jb=Buffer.from(JSON.stringify(g)),jpad=Buffer.alloc(Math.ceil(jb.length/4)*4,32);jb.copy(jpad);
const out=Buffer.alloc(20+jpad.length+8+finalBin.length);out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jpad.length,12);out.write('JSON',16,'ascii');jpad.copy(out,20);
const op=20+jpad.length;out.writeUInt32LE(finalBin.length,op);out.write('BIN\0',op+4,'ascii');finalBin.copy(out,op+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(output,out);
const delta=pos.map((v,i)=>Math.hypot(...v.map((q,k)=>q-sourcePos[i][k])));
const audit={stage:'N10 original-R36HW upper skin edge realignment and closed garment cap removal',inputSha256:sha(source),outputSha256:sha(out),trianglesBefore:before,trianglesAfter:targetTriangles,originalPelvisTriangles:362,newPelvisTriangles:newIndices.length/3,removedUpperCapTriangles:removed.top.length,removedLegUndercapTriangles:removed.legUnder.length,boundaryWaistMatched:topMatches.length,waistMaxMoveMeters:Math.max(...topMatches.map(x=>x.delta)),modifiedLegBoundaryVertices:bottomMatches.length,legMaxMoveMeters:Math.max(...bottomMatches.map(x=>x.delta)),remainingLowTriangles:bottomResidual,frontRelaxationPasses:3,frontRelaxationOperations:relaxed,sourceJointCount:63,faceTrianglesUnchanged:644,hairTrianglesUnchanged:294,originalBINBytes:bin.length,newBINBytes:finalBin.length,originalPelvisVertexCount:targetVertices,pelvisVertexCount:pos.length,maxVertexMovementMeters:Math.max(...delta),smallestNonzeroTriangleArea:minArea,limitations:['UV topology for pelvis remains garment-derived','Waist/leg skin contours have different vertex counts and are geometrically aligned, not topologically welded','Visible shorts-like side silhouette may remain','Not native S2 UV/normal/animated skinning','Reference photo has not been used as a texture or exact depth map']};
fs.writeFileSync(reportFile,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({output,triangles:targetTriangles,removed:removed.top.length+removed.legUnder.length,sha256:audit.outputSha256,waistEdges:topMatches.length}));
