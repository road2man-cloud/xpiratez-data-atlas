#!/usr/bin/env node
'use strict';
/**
 * R36HW N14 — replace the 40-triangle star-pole with a sewn 3-center patch.
 *
 * This edits the actual original-HW-derived pelvic primitive. There is no
 * projected reference image, standalone sticker mesh, full-body re-model,
 * substitute R36JB body or regenerated face/hair.
 *
 * 1 original interior vertex -> 3 connected pole vertices.
 * Existing 40 fan faces redistributed over 3 sectors.
 * 3 seam triangles + 1 filled center triangle = 4 total added triangles.
 * The same original ring/outer surface faces remain attached.
 */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n13-center-topology-20261129/output/R36HW_N13_CENTER_TOPOLOGY.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N14_THREE_POLE_CENTER.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N14_THREE_POLE_CENTER.json');
const inputHash='1bef905242461912a91853b6802ab8564ce6ad0f19e549754035a4d7314f7f19';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src=fs.readFileSync(input);
if(sha(src)!==inputHash)throw Error('Unexpected N13 GLB SHA256: '+sha(src));
if(src.toString('ascii',0,4)!=='glTF'||src.readUInt32LE(4)!==2||src.readUInt32LE(8)!==src.length)throw Error('Invalid GLB 2.0');
const jsonBytes=src.readUInt32LE(12),g=JSON.parse(src.toString('utf8',20,20+jsonBytes)),binOffset=20+jsonBytes;
if(src.toString('ascii',binOffset+4,binOffset+8)!=='BIN\0')throw Error('Missing GLB BIN');
const origBin=src.subarray(binOffset+8,binOffset+8+src.readUInt32LE(binOffset));
const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const widths={5121:1,5123:2,5125:4,5126:4};
function unpack(accessorIndex){
 const a=g.accessors[accessorIndex],view=g.bufferViews[a.bufferView];
 if(!a||!view||a.sparse)throw Error('Unexpected sparse or missing accessor '+accessorIndex);
 const n=dimensions[a.type],w=widths[a.componentType],step=view.byteStride||n*w,off=(view.byteOffset||0)+(a.byteOffset||0),rows=[];
 for(let i=0;i<a.count;i++){
  const row=[];for(let j=0;j<n;j++){
   const at=off+i*step+j*w;if(at+w>origBin.length)throw Error('Accessor overrun');
   row.push(a.componentType===5126?origBin.readFloatLE(at):a.componentType===5125?origBin.readUInt32LE(at):a.componentType===5123?origBin.readUInt16LE(at):origBin.readUInt8(at));
  }rows.push(row);
 }return rows;
}
const parts=g.meshes[0].primitives,prim=parts[3];
if(g.meshes.length!==1||parts.length!==10||g.skins[0].joints.length!==63)throw Error('Original-R36HW lineage mismatch');
const countBefore=parts.reduce((sum,p)=>sum+g.accessors[p.indices].count/3,0);
const A=prim.attributes,oldPositions=unpack(A.POSITION),positions=oldPositions.map(v=>v.slice());
const oldNormals=unpack(A.NORMAL),normals=oldNormals.map(v=>v.slice()),uv=unpack(A.TEXCOORD_0),color=unpack(A.COLOR_0);
const joints=unpack(A.JOINTS_0),weights=unpack(A.WEIGHTS_0),idx=unpack(prim.indices).flat();
if(countBefore!==2095||idx.length!==359*3||positions.length!==238)throw Error('N13 model geometry changed');
const targetHub=32,centers=[32,positions.length,positions.length+1],origCenter=positions[targetHub].slice();
const triangles=Array.from({length:idx.length/3},(_,i)=>idx.slice(i*3,i*3+3));
const star=triangles.map((f,t)=>({f,t})).filter(x=>x.f.includes(targetHub));
const neighbors=new Map();
for(const {f} of star){
 const others=f.filter(i=>i!==targetHub);
 if(others.length!==2)throw Error('Non-manifold duplicated pole');
 const [a,b]=others;
 if(!neighbors.has(a))neighbors.set(a,[]);
 if(!neighbors.has(b))neighbors.set(b,[]);
 neighbors.get(a).push(b);neighbors.get(b).push(a);
}
if(star.length!==40||neighbors.size!==40||[...neighbors.values()].some(v=>v.length!==2))throw Error('Expected closed 40-face center star');
const anchor=185;
if(!neighbors.has(anchor)||!neighbors.get(anchor).includes(200))throw Error('N13 ring anchor orientation changed');
let vertex=anchor,previous=186,ring=[];
do{
 ring.push(vertex);
 const n=neighbors.get(vertex).find(i=>i!==previous);
 if(n===undefined)throw Error('Open star ring');
 previous=vertex;vertex=n;
}while(vertex!==anchor&&ring.length<=40);
if(ring.length!==40||vertex!==anchor)throw Error('Pole ring not closed');
const segmentFace=new Map();
for(const {f,t} of star){
 const [a,b]=f.filter(i=>i!==targetHub),key=[a,b].sort((a,b)=>a-b).join(',');
 if(segmentFace.has(key))throw Error('Overlapping fan face');
 segmentFace.set(key,t);
}
const sectorBreaks=[0,13,31];
const sector=position=>position<13?0:position<31?1:2;
const zoneForFace=new Map();
for(let i=0;i<ring.length;i++){
 const a=ring[i],b=ring[(i+1)%ring.length],t=segmentFace.get([a,b].sort((x,y)=>x-y).join(','));
 if(t===undefined)throw Error('Ring does not map all N13 center faces');
 zoneForFace.set(t,sector(i));
}
if(zoneForFace.size!==40)throw Error('Ring sector face mismatch');
const offsets=[
 [-.008,-.010,.007],  // left/upper, shallow raised rim
 [ .000, .007,-.011], // interior/lower, recessed transition
 [ .009,-.011,.006]  // right/upper, asymmetric raised rim
];
for(let k=0;k<3;k++){
 const v=origCenter.map((x,j)=>x+offsets[k][j]);
 if(k===0)positions[targetHub]=v;
 else positions.push(v);
}
const beforeFaces=triangles.map(x=>x.slice());
for(const [t,zone] of zoneForFace)triangles[t]=triangles[t].map(i=>i===targetHub?centers[zone]:i);
function directedEdge(face,a,b){
 for(let j=0;j<3;j++){
  if(face[j]===a&&face[(j+1)%3]===b)return 1;
  if(face[j]===b&&face[(j+1)%3]===a)return -1;
 }return 0;
}
const bridges=[];
for(const at of sectorBreaks){
 const prev=(at+ring.length-1)%ring.length,next=at;
 const previousFace=segmentFace.get([ring[prev],ring[at]].sort((a,b)=>a-b).join(','));
 const nextFace=segmentFace.get([ring[at],ring[(at+1)%ring.length]].sort((a,b)=>a-b).join(','));
 const pcenter=centers[zoneForFace.get(previousFace)],ncenter=centers[zoneForFace.get(nextFace)],edgeVertex=ring[at];
 if(pcenter===ncenter)throw Error('Seam has no split');
 const s=directedEdge(triangles[previousFace],pcenter,edgeVertex);
 const bridge=s===1?[edgeVertex,pcenter,ncenter]:[pcenter,edgeVertex,ncenter];
 if(directedEdge(bridge,pcenter,edgeVertex)!==-s||directedEdge(bridge,ncenter,edgeVertex)!==-directedEdge(triangles[nextFace],ncenter,edgeVertex))throw Error('Seam orientation invalid');
 bridges.push({at,vertex:edgeVertex,face:bridge});
 triangles.push(bridge);
}
const proposedCenterTriangles=[
 [centers[0],centers[1],centers[2]],
 [centers[0],centers[2],centers[1]]
];
const centerTriangle=proposedCenterTriangles.find(test=>bridges.every(({face})=>{
 for(let j=0;j<3;j++){
  const a=face[j],b=face[(j+1)%3];
  if(centers.includes(a)&&centers.includes(b))return directedEdge(test,a,b)===-1;
 }return false;
}));
if(!centerTriangle)throw Error('Center face winding incompatible with seam');
triangles.push(centerTriangle);
function mean(rows,ids){return Array.from({length:rows[0].length},(_,k)=>ids.reduce((s,i)=>s+rows[i][k],0)/ids.length)}
function mixRows(a,b,t){return a.map((v,k)=>v*(1-t)+b[k]*t)}
function jointMix(base,zone){
 const nearby=ring.filter((_,i)=>sector(i)===zone);
 const weightMap=new Map();
 function accumulate(id,mult){for(let k=0;k<4;k++)weightMap.set(joints[id][k],(weightMap.get(joints[id][k])||0)+weights[id][k]*mult)}
 accumulate(targetHub,.88);
 for(const id of nearby)accumulate(id,.12/nearby.length);
 const top=[...weightMap].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,x)=>s+x[1],0)||1;
 return {joints:Array.from({length:4},(_,i)=>top[i]?.[0]||0),weights:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/sum)};
}
const baseUV=uv[targetHub].slice(),baseColor=color[targetHub].slice(),baseNormal=normals[targetHub].slice();
for(let zone=1;zone<=2;zone++){
 const adjacent=ring.filter((_,i)=>sector(i)===zone);
 const avgUV=mean(uv,adjacent),avgColor=mean(color,adjacent);
 uv.push(mixRows(baseUV,avgUV,.13));
 color.push(mixRows(baseColor,avgColor,.13));
 const skin=jointMix(targetHub,zone);
 joints.push(skin.joints);weights.push(skin.weights);
 normals.push(baseNormal.slice());
}
const beforeBoundary=new Map();
function edgeMap(faces){
 const map=new Map();
 for(const face of faces)for(let i=0;i<3;i++){
  const a=face[i],b=face[(i+1)%3],key=a<b?a+','+b:b+','+a;
  const item=map.get(key)||{count:0,direction:0};item.count++;item.direction+=a<b?1:-1;map.set(key,item);
 }return map;
}
const edgesBefore=edgeMap(beforeFaces),edgesAfter=edgeMap(triangles);
if([...edgesAfter.values()].some(q=>q.count>2||(q.count===2&&q.direction!==0)))throw Error('Nonmanifold or inconsistently wound internal edges');
const boundaryKeys=m=>[...m].filter(([key,v])=>v.count===1).map(([key])=>key).sort();
const oldBoundary=boundaryKeys(edgesBefore),newBoundary=boundaryKeys(edgesAfter);
if(JSON.stringify(oldBoundary)!==JSON.stringify(newBoundary))throw Error('Perimeter boundary changed; center is not stitched');
const adjacency=Array.from({length:positions.length},()=>new Set());
for(const f of triangles)for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3];adjacency[a].add(b);adjacency[b].add(a)}
const centerDegrees=centers.map(id=>adjacency[id].size);
if(Math.max(...centerDegrees)>24||centerDegrees.some(v=>v<7))throw Error('Star distribution insufficient '+centerDegrees);
const sub=(a,b)=>a.map((x,k)=>x-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const unit=v=>v.map(x=>x/(len(v)||1));
const faceNormal=face=>{const [a,b,c]=face.map(i=>positions[i]);return cross(sub(b,a),sub(c,a))};
let minArea=Infinity;
for(const f of triangles){const area=len(faceNormal(f))*.5;minArea=Math.min(minArea,area);if(area<1e-10)throw Error('N14 created a zero-area triangle');}
const originalChangedFaces=[...zoneForFace.keys()];
function invertedCount(){
 return originalChangedFaces.reduce((n,i)=>{
  const old=beforeFaces[i],newFace=triangles[i];
  const A=old.map(k=>k===targetHub?origCenter:oldPositions[k]);
  const oldN=cross(sub(A[1],A[0]),sub(A[2],A[0])),newN=faceNormal(newFace);
  return n+(dot(unit(oldN),unit(newN))<=.02?1:0);
 },0);
}
// Keep the center patch connected, but adapt all three offsets if this
// particular N13 surface would invert or nearly collapse an old face.
let displacementScale=1,initialInversions=invertedCount(),inverseFaces=initialInversions;
for(let attempt=0;inverseFaces>0&&attempt<14;attempt++){
 displacementScale*=.5;
 for(let zone=0;zone<3;zone++){
  const q=origCenter.map((x,j)=>x+offsets[zone][j]*displacementScale);
  positions[centers[zone]]=q;
 }
 inverseFaces=invertedCount();
}
if(inverseFaces>0)throw Error('No non-inverting sewn patch at 14 scaled positions: '+inverseFaces);
const editedVertices=new Set([...ring,...centers]);
const sums=positions.map(()=>[0,0,0]);
for(const f of triangles){const n=faceNormal(f);for(const i of f)for(let k=0;k<3;k++)sums[i][k]+=n[k];}
for(const id of editedVertices){
 const n=unit(sums[id]),origN=unit(normals[id]);const corrected=dot(n,origN)<0?n.map(x=>-x):n;
 normals[id]=unit(corrected.map((x,k)=>x*.84+origN[k]*.16));
}
const newIndices=triangles.flat();
const origAttr={...prim.attributes},extra=[Buffer.from(origBin)];
function bytesNow(){return extra.reduce((s,b)=>s+b.length,0)}
function append(data,originalId,target){
 if(bytesNow()%4)extra.push(Buffer.alloc(4-bytesNow()%4));
 const acc=g.accessors[originalId],n=dimensions[acc.type],w=widths[acc.componentType];
 const buf=Buffer.alloc(data.length*n*w);
 for(let i=0;i<data.length;i++)for(let j=0;j<n;j++){
  const x=data[i][j],off=(i*n+j)*w;
  if(!Number.isFinite(x))throw Error('Non-finite exported vertex');
  if(acc.componentType===5126)buf.writeFloatLE(x,off);
  else if(acc.componentType===5125)buf.writeUInt32LE(Math.round(x),off);
  else if(acc.componentType===5123)buf.writeUInt16LE(Math.round(x),off);
  else buf.writeUInt8(Math.min(255,Math.max(0,Math.round(x))),off);
 }
 const begin=bytesNow();extra.push(buf);
 const view=g.bufferViews.push({buffer:0,byteOffset:begin,byteLength:buf.length,target})-1;
 const next={bufferView:view,componentType:acc.componentType,count:data.length,type:acc.type};
 if(acc.normalized)next.normalized=true;
 if(acc.type==='VEC3'&&acc.componentType===5126){
  next.min=[0,1,2].map(k=>Math.min(...data.map(v=>v[k])));
  next.max=[0,1,2].map(k=>Math.max(...data.map(v=>v[k])));
 }
 if(acc.type==='SCALAR'){
  next.min=[Math.min(...data.map(v=>v[0]))];
  next.max=[Math.max(...data.map(v=>v[0]))];
 }
 return g.accessors.push(next)-1;
}
for(const [name,values] of Object.entries({
 POSITION:positions,NORMAL:normals,JOINTS_0:joints,WEIGHTS_0:weights,COLOR_0:color,TEXCOORD_0:uv
})){
 prim.attributes[name]=append(values,origAttr[name],34962);
}
prim.indices=append(newIndices.map(v=>[v]),prim.indices,34963);
prim.extras={...prim.extras,stage:'N14_TRUE_THREE_POLE_CONNECTED_CENTER',originalStarPole:32,originalStarValence:40,redistributedCenterDegrees:centerDegrees,sewnInternalPatch:true,nonFloating:true,landmarksQualitative:true};
if(bytesNow()%4)extra.push(Buffer.alloc(4-bytesNow()%4));
const finalBin=Buffer.concat(extra);g.buffers[0].byteLength=finalBin.length;
const newJson=Buffer.from(JSON.stringify(g),'utf8'),padded=Buffer.alloc(Math.ceil(newJson.length/4)*4,0x20);newJson.copy(padded);
const glb=Buffer.alloc(20+padded.length+8+finalBin.length),off=20+padded.length;
glb.write('glTF',0,'ascii');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(padded.length,12);glb.write('JSON',16,'ascii');padded.copy(glb,20);
glb.writeUInt32LE(finalBin.length,off);glb.write('BIN\0',off+4,'ascii');finalBin.copy(glb,off+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(output,glb);
const after=parts.reduce((s,p)=>s+g.accessors[p.indices].count/3,0);
if(after!==2099)throw Error('Final triangle budget should be 2099, got '+after);
const report={
 stage:'R36HW-N14 true sewn center-pole split, no separate anatomical overlay',
 inputSHA256:sha(src),outputSHA256:sha(glb),
 trianglesBefore:countBefore,trianglesAfter:after,addedTriangles:4,
 originalHubVertex:targetHub,originalHubDegree:40,newHubVertices:centers,centerDegrees,
 originalPelvisVertices:238,newPelvisVertices:positions.length,
 relocatedExistingVertices:1,appendedNewVertices:2,
 changedOriginalVertexMovementMeters:len(sub(positions[targetHub],origCenter)),
 originalBoundaryEdgeCount:oldBoundary.length,boundaryEdgesPreserved:true,
 manifoldInternalEdges:true,faceOrientationFlips:inverseFaces,initialInversions,displacementScale,
 skinJoints:63,sourceFaceHairUnmodified:true,
 originalBINbytes:origBin.length,newBINbytes:finalBin.length,
 minimumTriangleAreaSqMeters:minArea,
 materialPhotoEmbedded:false,modelArtApproved:false,nativeS2Rendered:false,
 sourceRigging:'JOINTS_0 and WEIGHTS_0 conserved; two added vertices interpolated from source hub and region',
 remainingIssues:['Target-photo likeness not confirmed','Entire pre-existing pelvis side/front clothing-derived surface is not fully reconstructed','Visible waist/upper-thigh seam welding remains incomplete','CPU preview cannot prove native S2 material/skinning performance']
};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({glb:output,report:reportFile,triangles:after,splitDegrees:centerDegrees,boundary:oldBoundary.length,sha256:report.outputSHA256}));
