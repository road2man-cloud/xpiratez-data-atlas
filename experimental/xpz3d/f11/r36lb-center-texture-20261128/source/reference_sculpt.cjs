'use strict';
/**
 * R36KY: integrated, reference-guided center anatomy contour sculpt.
 *
 * User-supplied visual target: distinguishable continuous raised bilateral
 * forms, an interior central contour, and smoothly feathered connection into
 * anterior pelvic-floor skin. This script does NOT attach a second patch,
 * does NOT alter triangle count or create skinless geometry.
 *
 * NOTE: the supplied 2D reference cannot establish 3D metric depth.
 * Donor high-density center coordinates are used where locally consistent.
 * The remaining form is deliberately authored with shallow, bounded relief.
 */
const {projector}=require('./surface_patch.cjs');
const {cross,dot,length,normal}=require('./mesh_qem.cjs');
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const gauss=(x,c,r)=>Math.exp(-Math.pow((x-c)/r,2));
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const SCALE=(a,s)=>a.map(v=>v*s);
function field(x,z){
 const ax=Math.abs(x),clip=smooth(.753,.802,z)*(1-smooth(.995,1.043,z))*(1-smooth(.079,.138,ax));
 const t=clamp((z-.77)/(.998-.77),0,1),sign=x>=0?1:-1;
 const ridgeX=.027+.009*Math.sin(t*Math.PI*.93)+.0027*sign*Math.sin(t*5.6);
 const outerX=.064+.012*Math.sin(t*Math.PI);
 const bilateral=gauss(ax,ridgeX,.020)*gauss(z,.885+sign*.003,.12);
 const innerContour=gauss(ax,.016+sign*.001,.011)*gauss(z,.895,.105);
 const valley=gauss(x,.002*Math.sin(t*5.2),.010)*gauss(z,.885,.108);
 const outer=gauss(ax,outerX,.019)*gauss(z,.872,.11);
 const tip=gauss(x,-.001,.021)*gauss(z,.973,.038);
 const base=gauss(ax,.02,.046)*gauss(z,.790,.035);
 const sculpted=(.0100*bilateral+.0041*outer+.0024*innerContour-.0036*valley+.0028*tip+.0022*base)*clip;
 return {sculpted,envelope:clip,components:{bilateral,outer,valley,innerContour,tip,base}};
}
function stats(mesh){
 let min=Infinity,max=0,neg=0;
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3),v=ids.map(j=>mesh.positions[j]);
  const c=cross(sub(v[1],v[0]),sub(v[2],v[0])),a=length(c)*.5;
  min=Math.min(min,a);max=Math.max(max,a);if(a<1e-13)neg++;
 }
 return {minFaceArea:min,maxFaceArea:max,degenerate:neg};
}
function normals(mesh){
 const out=mesh.positions.map(()=>[0,0,0]);
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3),v=ids.map(j=>mesh.positions[j]);
  const n=cross(sub(v[1],v[0]),sub(v[2],v[0]));
  for(const j of ids)for(let k=0;k<3;k++)out[j][k]+=n[k];
 }
 mesh.normals=out.map(normal);
}
function sculpt(input,bodySource,coreSource,{strength=1,posterior=.020,superior=.026,maxRelief=.015}={}){
 const m={...input};
 for(const k of ['positions','normals','uvs','colors','joints','weights','indices'])
  m[k]=Array.isArray(input[k])?input[k].map(v=>Array.isArray(v)?v.slice():v):input[k];
 const B=projector(bodySource),C=projector(coreSource);
 const before=m.positions.map(p=>p.slice()),originalAreas=[],originalNormals=[];
 for(let i=0;i<m.indices.length;i+=3){
  const ids=m.indices.slice(i,i+3),tri=ids.map(j=>before[j]);
  const cr=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));
  originalAreas.push(length(cr));originalNormals.push(normal(cr));
 }
 const def=m.positions.map((p,i)=>{
  const [x,y,z]=p,surface=B.sample(x,z),donor=C.sample(x,z-superior);
  const reg=field(x,z);
  if(!surface||reg.envelope<1e-6)return 0;
  const front=Math.max(0,1-smooth(.012,.072,Math.abs(y-surface.y)));
  if(front<.02)return 0;
  const oriented=1-smooth(-.075,.055,y);
  const visual=reg.sculpted*front*oriented;
  let donorRelief=0;
  if(donor){
   const coreY=donor.y+posterior,delta=coreY-surface.y;
   // Only use the high-poly depth if it is close enough to represent the
   // exterior shell, not an internal core or the back side of the torso.
   if(Math.abs(delta)<.045){
    donorRelief=clamp(-delta,-.012,.012)*.21*reg.envelope*front*oriented;
   }
  }
  const elevation=clamp(visual+donorRelief,-maxRelief,maxRelief);
  return -elevation*strength; // front (-Y) is closer to the camera
 });
 // Use per-vertex backtracking: the existing low-poly body contains a few
 // narrow faces that can invert under even a globally tiny full-field move.
 // Reject only unsafe local steps instead of suppressing the entire sculpt.
 const incident=Array.from({length:m.positions.length},()=>[]);
 for(let i=0;i<m.indices.length;i+=3){
  const fi=i/3;for(const id of m.indices.slice(i,i+3))incident[id].push(fi);
 }
 let accepted=0,rejected=0,minFaceRatio=Infinity,minNormalDot=1,maxLocalFactor=0;
 const order=def.map((x,i)=>({i,magnitude:Math.abs(x)})).filter(x=>x.magnitude>1e-8)
  .sort((a,b)=>b.magnitude-a.magnitude);
 for(const {i} of order){
  let ok=false;
  for(const factor of [1,.8,.6,.42,.28,.16,.08,.04]){
   const old=m.positions[i][1];m.positions[i][1]=before[i][1]+def[i]*factor;
   let safe=true,localRatio=Infinity,localDot=1;
   for(const face of incident[i]){
    const ids=m.indices.slice(face*3,face*3+3),tri=ids.map(j=>m.positions[j]);
    const cr=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])),v=length(cr);
    const ratio=v/(originalAreas[face]||1),nd=dot(normal(cr),originalNormals[face]);
    localRatio=Math.min(localRatio,ratio);localDot=Math.min(localDot,nd);
    if(v<1e-12||ratio<.42||nd<.56){safe=false;break;}
   }
   if(safe){
    ok=true;accepted++;maxLocalFactor=Math.max(maxLocalFactor,factor);
    minFaceRatio=Math.min(minFaceRatio,localRatio);minNormalDot=Math.min(minNormalDot,localDot);
    break;
   }
   m.positions[i][1]=old;
  }
  if(!ok)rejected++;
 }
 if(accepted<8)throw Error('reference sculpt modified too few vertices: '+accepted);
 normals(m);
 const nonzero=def.filter(x=>Math.abs(x)>1e-8),maxChange=m.positions.reduce((mx,p,i)=>Math.max(mx,Math.abs(p[1]-before[i][1])),0);
 const result={version:'R36KY',sourceTriangles:m.indices.length/3,outputTriangles:m.indices.length/3,
  eligibleVertices:nonzero.length,shiftedVertices:accepted,rejectedVertices:rejected,maxMove:maxChange,blendStrength:strength,maxAcceptedLocalScale:maxLocalFactor,
  minFaceAreaRatio:minFaceRatio,minFaceNormalDot:minNormalDot,posterior,superior,maxRelief,
  metrics:stats(m),donorReferenceTriangles:coreSource.indices.length/3,
  continuousSkin:true,isolatedAdditionalMesh:false,
  note:'Reference-guided stylized relief. Source photograph does not define physical 3D dimensions.'};
 m.stats={...m.stats,centerSculpt:result};
 return m;
}
module.exports={sculpt,field};