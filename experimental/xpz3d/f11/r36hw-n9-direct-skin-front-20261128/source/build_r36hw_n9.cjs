#!/usr/bin/env node
'use strict';
/* F11 R36HW-N9: original-HW-derived pelvis front re-surface.
 * Recomputes the former shorts anterior shell as a smooth, bounded skin-like
 * surface with a narrow local fold, and draws its low hem toward *actual* HW
 * source bare leg rings. No R36JB donor, no projected photograph.
 * This is a working prototype of concealed-skin reconstruction, NOT complete
 * undressing of all HW garment shell regions.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n8-soft-legfit-20261128/output/R36HW_N8_SOFT_LEGFIT.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N9_DIRECT_SKIN_FRONT.glb');
const report=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N9_DIRECT_SKIN_FRONT.json');
const expected='6b2ec60c3f14332ee5242644871e22c1598c91c5807c9fbfc0d2b552ac5b1a60';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync(input);
if(sha(source)!==expected)throw Error('Input N8 does not match retained HW lineage: '+sha(source));
if(source.toString('ascii',0,4)!=='glTF'||source.readUInt32LE(4)!==2||source.readUInt32LE(8)!==source.length)throw Error('Invalid GLB2');
const jl=source.readUInt32LE(12),g=JSON.parse(source.toString('utf8',20,20+jl)),bh=20+jl;
if(source.toString('ascii',bh+4,bh+8)!=='BIN\0')throw Error('Missing BIN');
const bin=source.subarray(bh+8,bh+8+source.readUInt32LE(bh));
const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},width={5121:1,5123:2,5125:4,5126:4};
function unpack(id){
 const a=g.accessors[id],v=g.bufferViews[a.bufferView],dim=comps[a.type],w=width[a.componentType],stride=v.byteStride||dim*w,offset=(v.byteOffset||0)+(a.byteOffset||0);
 if(a.sparse)throw Error('Sparse accessor not supported');
 const arr=[];for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<dim;k++){const j=offset+i*stride+k*w;if(j+w>bin.length)throw Error('Accessor overrun');row.push(a.componentType===5126?bin.readFloatLE(j):a.componentType===5125?bin.readUInt32LE(j):a.componentType===5123?bin.readUInt16LE(j):bin.readUInt8(j));}arr.push(row)}return arr;
}
const meshes=g.meshes;if(meshes.length!==1||g.skins[0].joints.length!==63||meshes[0].primitives.length!==10)throw Error('Unexpected N8 rig');
const tris=meshes[0].primitives.reduce((t,p)=>t+g.accessors[p.indices].count/3,0);
if(tris!==2098)throw Error('Not N8 triangle budget');
const shorts=meshes[0].primitives[3],skin=meshes[0].primitives[6],attrs=shorts.attributes;
const old=unpack(attrs.POSITION),p=old.map(row=>row.slice()),norm=unpack(attrs.NORMAL),idx=unpack(shorts.indices).map(r=>r[0]),skinPos=unpack(skin.attributes.POSITION),skinIds=unpack(skin.indices).map(x=>x[0]);
if(old.length!==183||idx.length!==362*3)throw Error('Unexpected existing pelvis primitive');
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const gauss=(x,c,s)=>Math.exp(-.5*((x-c)/s)**2);
const skinRanges=skin.extras?.ranges||[];
function contour(side){
 const rg=skinRanges.find(x=>x.name===(side>0?'L leg below shorts':'R leg below shorts'));
 if(!rg)throw Error('Missing HW skin bare-leg subset');
 const ids=[...new Set(skinIds.slice(rg.startTriangle*3,(rg.startTriangle+rg.triangles)*3))],cx=side*.090,cy=-.031;
 const v=ids.map(i=>skinPos[i]).filter(x=>Math.abs(x[2]-.815)<.002&&Math.hypot(x[0]-cx,x[1]-cy)>.044);
 if(v.length!==7)throw Error('Unexpected original leg loop count '+v.length);
 return v.map(p=>({a:Math.atan2(p[1]-cy,p[0]-cx),p})).sort((a,b)=>a.a-b.a);
}
const rings={1:contour(1),'-1':contour(-1)};
function ringTarget(xyz){
 const side=xyz[0]>=0?1:-1,ring=rings[side],cx=side*.090,cy=-.031;
 let theta=Math.atan2(xyz[1]-cy,xyz[0]-cx);
 if(theta<ring[0].a)theta+=Math.PI*2;
 for(let i=0;i<ring.length;i++){
  const l=ring[i],r=i+1<ring.length?ring[i+1]:{a:ring[0].a+2*Math.PI,p:ring[0].p};
  if(theta>=l.a-1e-9&&theta<=r.a+1e-9){
    const t=clamp((theta-l.a)/(r.a-l.a||1));
    return [0,1,2].map(j=>l.p[j]*(1-t)+r.p[j]*t);
  }
 }
 throw Error('Could not locate bare-leg ring target');
}
function localFold(x,z){
 // Mild, asymmetric raised edges framing the central inset, bounded by 4mm.
 const shift=-.007+.005*Math.sin((z-.84)*18);
 const core=gauss(x,shift,.014)*gauss(z,.893,.051);
 const left=gauss(x,shift-.027,.012)*gauss(z,.894,.056);
 const right=gauss(x,shift+.024,.013)*gauss(z,.881,.052);
 const lower=gauss(x,.006,.035)*gauss(z,.837,.024);
 return .0034*core-.0023*left-.0019*right-.0009*lower;
}
const changes={front:0,hem:0,centroid:0};const beforeExtent={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
for(let i=0;i<p.length;i++){
 const v=p[i],orig=old[i],x=v[0],y=v[1],z=v[2];
 beforeExtent.minX=Math.min(beforeExtent.minX,x);beforeExtent.maxX=Math.max(beforeExtent.maxX,x);
 beforeExtent.minY=Math.min(beforeExtent.minY,y);beforeExtent.maxY=Math.max(beforeExtent.maxY,y);
 // Existing HW shell is still the source, but its frontal garment facets
 // are relaxed toward a smooth ellipse-like body silhouette.
 const zGate=smooth((z-.826)/.065)*(1-smooth((z-1.011)/.048));
 const frontGate=1-smooth((y+.027)/.065);
 const xRad=.156- .008*smooth((z-1.00)/.06);
 const r=Math.sqrt(Math.max(0,1-(x/xRad)**2));
 const yTarget=-.019-(.082+.004*gauss(z,.895,.11))*r;
 const strength=.84*zGate*frontGate;
 v[1]=y+(yTarget-y)*strength;
 const local=localFold(x,z)*zGate*frontGate*(1-smooth((Math.abs(x)-.044)/.09));
 v[1]+=local;
 if(Math.abs(v[1]-orig[1])>1e-6)changes.front++;
 // Lower hem is pulled toward the ACTUAL preserved HW bare leg rim;
 // avoid moving medial pelvic structures to the wrong thigh.
 const hemGate=(1-smooth((z-.807)/.074))*(smooth((Math.abs(x)-.039)/.035));
 if(hemGate>.001){
  const ring=ringTarget(v);
  const delta=ring.map((t,k)=>(t-v[k])*hemGate);
  const dist=Math.hypot(...delta),factor=dist>.027?.027/dist:1;
  for(let k=0;k<3;k++)v[k]+=delta[k]*factor;
  changes.hem++;
 }
}
// The N3 82 + N7B 9 centroid vertices should be close to the already
// transformed surrounding HW surface, not isolated triangular spikes.
const adjacent=Array.from({length:p.length},()=>new Set());
for(let t=0;t<idx.length;t+=3){const [a,b,c]=idx.slice(t,t+3);for(const [u,v] of [[a,b],[b,c],[c,a]]){adjacent[u].add(v);adjacent[v].add(u)}}
for(let i=92;i<p.length;i++){
 const neighbors=[...adjacent[i]];
 if(neighbors.length<3)continue;
 const mean=[0,1,2].map(k=>neighbors.reduce((sum,q)=>sum+p[q][k],0)/neighbors.length);
 const z=p[i][2],fade=smooth((z-.820)/.052)*(1-smooth((z-.990)/.063));
 const off=localFold(mean[0],z)*fade*.32;
 const originalY=p[i][1],targetY=mean[1]+off;
 p[i][1]=originalY*.08+targetY*.92;
 p[i][0]=p[i][0]*.48+mean[0]*.52;
 if(Math.abs(p[i][1]-originalY)>1e-6)changes.centroid++;
}
// Smooth anterior vertices without erasing the rounded outer silhouette.
for(let turn=0;turn<2;turn++){
 const update=p.map(v=>v[1]);
 for(let i=0;i<p.length;i++){
  const [x,y,z]=p[i],gate=smooth((z-.830)/.075)*(1-smooth((z-1.007)/.046))*(1-smooth((y+.045)/.11));
  if(gate<.01||adjacent[i].size<3)continue;
  let wsum=0,ysum=0;
  for(const n of adjacent[i]){
   const q=p[n],dx=(x-q[0])/.08,dz=(z-q[2])/.085,wt=Math.exp(-.5*(dx*dx+dz*dz));
   wsum+=wt;ysum+=wt*q[1];
  }
  if(wsum>0)update[i]+=.22*gate*(ysum/wsum-y);
 }
 for(let i=0;i<p.length;i++)p[i][1]=update[i];
}
const maxMove=Math.max(...p.map((v,i)=>Math.hypot(...v.map((q,k)=>q-old[i][k]))));
if(maxMove>.055)throw Error('Protect HW silhouette: exceeded 55mm max movement '+maxMove);
if(p.some(v=>v.some(x=>!Number.isFinite(x))))throw Error('Nonfinite N9 position');
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function unit(a){const q=Math.hypot(...a)||1;return a.map(x=>x/q)}
const normals=Array.from({length:p.length},()=>[0,0,0]),areas=[];
for(let t=0;t<idx.length;t+=3){
 const [i,j,k]=idx.slice(t,t+3),u=p[i],v=p[j],w=p[k],face=cross(v.map((a,q)=>a-u[q]),w.map((a,q)=>a-u[q]));
 areas.push(Math.hypot(...face)/2);
 for(const id of [i,j,k])for(let k=0;k<3;k++)normals[id][k]+=face[k];
}
const normalResult=normals.map((n,i)=>{
 let v=unit(n),ref=unit(norm[i]);
 if(v.reduce((s,q,k)=>s+q*ref[k],0)<0)v=v.map(q=>-q);
 return unit(v.map((q,k)=>.94*q+.06*ref[k]));
});
const minArea=Math.min(...areas);
if(minArea<=1e-9)throw Error('Degenerate N9 triangle '+minArea);
const buffers=[Buffer.from(bin)];
function length(){return buffers.reduce((s,b)=>s+b.length,0)}
function pad(){const p=length()%4;if(p)buffers.push(Buffer.alloc(4-p))}
function add(rows,type,component,normalized=false){
 pad();const dim=comps[type],w=width[component],position=length(),data=Buffer.alloc(rows.length*dim*w);
 for(let i=0;i<rows.length;i++)for(let k=0;k<dim;k++){const v=rows[i][k],o=(i*dim+k)*w;if(component===5126)data.writeFloatLE(v,o);else if(component===5123)data.writeUInt16LE(Math.round(v),o);else data.writeUInt8(Math.round(clamp(v,0,255)),o)}
 buffers.push(data);const view=g.bufferViews.push({buffer:0,byteOffset:position,byteLength:data.length,target:34962})-1;
 const a={bufferView:view,componentType:component,count:rows.length,type};if(normalized)a.normalized=true;
 if(type==='VEC3'){a.min=[0,1,2].map(k=>Math.min(...rows.map(q=>q[k])));a.max=[0,1,2].map(k=>Math.max(...rows.map(q=>q[k])))}
 return g.accessors.push(a)-1;
}
const preserved={face:JSON.stringify(meshes[0].primitives[0]),hair:JSON.stringify(meshes[0].primitives[1])};
shorts.attributes.POSITION=add(p,'VEC3',5126);
shorts.attributes.NORMAL=add(normalResult,'VEC3',5126);
shorts.extras={...shorts.extras,stage:'R36HW_N9_SKIN_FRONT_RESHAPE',skirtSilhouetteReduced:true,sourceBareLegRingCount:2,sourceHWBodyNotReplaced:true};
if(preserved.face!==JSON.stringify(meshes[0].primitives[0])||preserved.hair!==JSON.stringify(meshes[0].primitives[1]))throw Error('Face/hair protection violated');
pad();const newBin=Buffer.concat(buffers);g.buffers[0].byteLength=newBin.length;
const txt=Buffer.from(JSON.stringify(g)),json=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(json);
const out=Buffer.alloc(20+json.length+8+newBin.length);out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.write('JSON',16,'ascii');json.copy(out,20);const end=20+json.length;out.writeUInt32LE(newBin.length,end);out.write('BIN\0',end+4,'ascii');newBin.copy(out,end+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(output,out);
const stat={stage:'N9 regional replacement of clothing-origin front by modeled skin-like curvature',inputSHA256:sha(source),outputSHA256:sha(out),triangles:tris,sourceJointCount:63,faceAndHairOriginal:true,pelvisVertexCount:p.length,pelvisTriangleCount:idx.length/3,hemVerticesAdjusted:changes.hem,frontVerticesAdjusted:changes.front,centroidVerticesRelaxed:changes.centroid,maxMovementMeters:maxMove,minTriangleArea:minArea,originalBinBytes:bin.length,outputBinBytes:newBin.length,limitations:['Closed clothing-origin shell topology still remains, especially side/back and hem','UV and skinning weights inherited from garment, not retopologized all around','Image is NOT a pasted texture; single-photo depth not recovered','N9 not yet native S2 rendered or artist approved']};
fs.writeFileSync(report,JSON.stringify(stat,null,2)+'\n');console.log(JSON.stringify({output,sha256:stat.outputSHA256,triangles:tris,hem:changes.hem,front:changes.front,centroids:changes.centroid,maxMovement:maxMove,minTriangleArea:minArea}));
