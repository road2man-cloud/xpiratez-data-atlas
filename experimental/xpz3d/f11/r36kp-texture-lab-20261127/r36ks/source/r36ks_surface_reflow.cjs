'use strict';
/* R36KS: expose the donor-derived central relief by reflowing existing closed
 * skinned body vertices, never creating new geometry. Same 2,088 triangles,
 * skin data, UV atlas and high-poly texture maps as R36KR.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,values}=require('./glb_io.cjs');
const {projector}=require('./surface_patch.cjs');
const {normal,cross,dot,v3,length,mix}=require('./mesh_qem.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function need(x,s){if(!x)throw Error(s);}
function fmt(p){return p.map(x=>Math.round(x*1e7)).join(',');}
function make(source,donor,dest,{strength=.75,maxMove=.022}={}){
 need(!fs.existsSync(dest),'dest exists');
 const q=load(source),h=load(donor),g=q.g,bodyPrim=g.meshes[1].primitives[0],a=bodyPrim.attributes;
 const positions=values(q,a.POSITION),normals=values(q,a.NORMAL),tangents=values(q,a.TANGENT);
 const indices=values(q,bodyPrim.indices).flat();
 need(indices.length===3360,'1120 body tris expected');
 const highBody=projector(extract(h,2,0)),coreA=extract(h,3,0),coreB=extract(h,3,1);
 const core={positions:[...coreA.positions,...coreB.positions],indices:[...coreA.indices,...coreB.indices.map(i=>i+coreA.positions.length)]};
 const highCore=projector(core),before=positions.map(p=>p.slice());
 const groups=new Map();
 positions.forEach((p,i)=>{const key=fmt(p);let group=groups.get(key);if(!group){group={p:p.slice(),indices:[]};groups.set(key,group)}group.indices.push(i)});
 let moveCount=0,sum=0,max=0;
 for(const group of groups.values()){
  const p=group.p,[x,y,z]=p;
  if(Math.abs(x)>.14||z<.785||z>1.12)continue;
  const s=highBody.sample(x,z),c=highCore.sample(x,z-.026);
  if(!s||!c||y-s.y>.064||y-s.y<-.07)continue;
  const elevated=s.y-(c.y+.020);if(elevated<.006)continue;
  const taper=(1-smooth(.05,.13,Math.abs(x)))*smooth(.788,.854,z)*(1-smooth(1.045,1.12,z));
  const desired=clamp(elevated*.81-.006,0,maxMove)*taper*strength;
  if(desired<=.00002)continue;
  for(const id of group.indices)positions[id][1]-=desired;
  moveCount++;sum+=desired;max=Math.max(max,desired);
 }
 need(moveCount>=3,'too few vertices affected');
 // Preserve edge topology by identical displacement of all equal-position UV duplicates.
 let inverted=0,tiny=0,areaRatio=1e9,areaMax=0;
 const areaWeighted=new Map();
 for(let k=0;k<indices.length;k+=3){
  const ids=indices.slice(k,k+3),A=ids.map(i=>positions[i]),B=ids.map(i=>before[i]);
  const cr=cross(v3(A[1],A[0]),v3(A[2],A[0])),old=cross(v3(B[1],B[0]),v3(B[2],B[0]));
  const len=length(cr),orig=length(old),ratio=len/(orig||1);
  areaRatio=Math.min(areaRatio,ratio);areaMax=Math.max(areaMax,ratio);
  if(len<1e-12)tiny++;
  if(dot(cr,old)<.02*len*orig)inverted++;
  for(const id of ids){const key=fmt(positions[id]);let target=areaWeighted.get(key);if(!target){target=[0,0,0];areaWeighted.set(key,target)}
   for(let j=0;j<3;j++)target[j]+=cr[j];
  }
 }
 need(inverted===0&&tiny===0,'geometry inverted or degenerate '+JSON.stringify({inverted,tiny,areaRatio}));
 for(let i=0;i<normals.length;i++)normals[i]=normal(areaWeighted.get(fmt(positions[i]))||normals[i]);
 // Recompute tangent orthogonal to changed normal; per-triangle islands retain
 // source UV directions and handedness.
 for(let k=0;k<indices.length;k+=3){
  const ids=indices.slice(k,k+3),A=ids.map(i=>positions[i]);
  const d=v3(A[1],A[0]);
  for(const id of ids){
   const n=normals[id],oldT=tangents[id],oldDir=oldT.slice(0,3);
   const tx=normal(v3(oldDir,n.map(z=>z*dot(oldDir,n))));
   tangents[id]=[...tx,oldT[3]];
  }
 }
 // Rewrite three accessor slices without modifying the rest of the binary GLB.
 const changed=new Map();
 const data=Buffer.from(q.bin);
 function change(id,valuesArray){
  const accessor=g.accessors[id],view=g.bufferViews[accessor.bufferView],offset=(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||valuesArray[0].length*4;
  need(accessor.componentType===5126,'must be floats');
  for(let i=0;i<valuesArray.length;i++)for(let j=0;j<valuesArray[i].length;j++)data.writeFloatLE(valuesArray[i][j],offset+i*stride+j*4);
  changed.set(id,valuesArray.length);
 }
 change(a.POSITION,positions);change(a.NORMAL,normals);change(a.TANGENT,tangents);
 g.accessors[a.POSITION].min=[0,1,2].map(c=>Math.min(...positions.map(p=>p[c])));
 g.accessors[a.POSITION].max=[0,1,2].map(c=>Math.max(...positions.map(p=>p[c])));
 const extras={strength,maxMove,sourceDonorSha:h.sha,baseSha:q.sha,movedVertices:moveCount,movedRenderVertices:moveCount&&[...groups.values()].filter(g=>g.indices.some(i=>positions[i][1]!==before[i][1])).reduce((n,g)=>n+g.indices.length,0),
  meanMove:sum/moveCount,maxAppliedMove:max,minFaceAreaRatio:areaRatio,maxFaceAreaRatio:areaMax,
  originalTriangleCount:2088,addedTriangles:0,invertedFaces:inverted,tinyFaces:tiny};
 g.asset.generator='R36KS continuous body center reflow + R36KR projected microtexture';
 g.extras.r36ks=extras;
 const json=Buffer.from(JSON.stringify(g),'utf8'),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4)]);
 const out=Buffer.alloc(28+jp.length+bp.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jp.length,12);out.write('JSON',16);jp.copy(out,20);
 const off=20+jp.length;out.writeUInt32LE(bp.length,off);out.write('BIN\0',off+4,'binary');bp.copy(out,off+8);
 fs.writeFileSync(dest,out);
 return {...extras,file:dest,bytes:out.length,sha256:sha(out)};
}
function main(){
 const [source,donor,outDir]=process.argv.slice(2);need(source&&donor&&outDir,'usage node r36ks_surface_reflow.cjs R36KR.glb R36JB.glb NEWDIR');
 need(!fs.existsSync(outDir),'fresh output directory required');fs.mkdirSync(outDir,{recursive:true});
 const mild=make(source,donor,path.join(outDir,'R36KS_F11_MILD_RELIEF_2088TRI.glb'),{strength:.52,maxMove:.012});
 const strong=make(source,donor,path.join(outDir,'R36KS_F11_RELIEF_2088TRI.glb'),{strength:1,maxMove:.023});
 const report={version:'R36KS',triangleBudget:2100,bodyTriangles:1120,faceHairTriangles:968,totalTriangles:2088,
  continuousSkin:true,posterior:.020,superior:.026,highDetailTexturesFrom:'R36KR',mild,strong};
 fs.writeFileSync(path.join(outDir,'PRODUCTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
try{main()}catch(e){console.error(e.stack||e);process.exit(1);}
