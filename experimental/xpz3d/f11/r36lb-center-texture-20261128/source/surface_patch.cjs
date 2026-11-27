'use strict';
/* R36KO seamless-on-surface low-poly patch. This is a visually continuous,
 * skinned *overlay*, not topologically welded geometry.
 * Coordinates are in the raw R36JB donor bind space (Z-up, front = negative Y).
 */
const {cross,dot,v3,normal,length}=require('./mesh_qem.cjs');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function smoothstep(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function projector(mesh){
 const p=mesh.positions,ix=mesh.indices,list=[];
 for(let t=0;t<ix.length;t+=3){
  const ids=ix.slice(t,t+3),v=ids.map(i=>p[i]);const [a,b,c]=v;
  const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(d)<1e-10)continue;
  list.push({ids,v,d,minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),
   minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2])});
 }
 function sample(x,z){
  let best=null,bestY=Infinity;
  for(const tri of list){
   if(x<tri.minX-1e-5||x>tri.maxX+1e-5||z<tri.minZ-1e-5||z>tri.maxZ+1e-5)continue;
   const [a,b,c]=tri.v;
   const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/tri.d;
   const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/tri.d;
   const w=1-u-v;
   if(Math.min(u,v,w)<-1e-4)continue;
   const y=u*a[1]+v*b[1]+w*c[1];
   if(y<bestY){bestY=y;best={y,bary:[u,v,w],ids:tri.ids};}
  }
  return best;
 }
 return {sample,count:list.length};
}
function blendSkin(mesh,hit){
 const group=new Map();
 for(let k=0;k<3;k++){
  const id=hit.ids[k],c=hit.bary[k];
  for(let j=0;j<4;j++){
   const joint=mesh.joints[id][j],w=mesh.weights[id][j]*c;
   if(w>1e-7)group.set(joint,(group.get(joint)||0)+w);
  }
 }
 const sorted=[...group].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,x)=>s+x[1],0)||1;
 return {js:[0,1,2,3].map(k=>sorted[k]?.[0]||0),ws:[0,1,2,3].map(k=>(sorted[k]?.[1]||0)/sum)};
}
function makePatch(body,core,{nx=10,nz=12,xmin=-.090,xmax=.090,zmin=.820,zmax=1.085,feather=.032,scale=.62,posterior=.020,superior=.026,embed=.0012,maxRelief=.013}={}){
 const B=projector(body),C=projector(core),positions=[],normals=[],uvs=[],colors=[],joints=[],weights=[],indices=[],diagnostics=[];
 for(let j=0;j<=nz;j++){
  const z=zmin+(zmax-zmin)*j/nz;
  for(let i=0;i<=nx;i++){
   const x=xmin+(xmax-xmin)*i/nx,bs=B.sample(x,z),cs=C.sample(x,z-superior);
   if(!bs)throw Error('Body front surface undefined near '+x+','+z);
   let delta=0;
   if(cs){
    // +Y is posterior, +Z is superior. Move donor reference posterior/superior,
    // then constrain the displacement against the actual continuous body surface.
    const coreBackY=cs.y+posterior;
    const candidate=clamp(bs.y-coreBackY,0,maxRelief);
    const fade=Math.min(
     smoothstep(xmin,xmin+feather,x),
     1-smoothstep(xmax-feather,xmax,x),
     smoothstep(zmin,zmin+feather,z),
     1-smoothstep(zmax-feather,zmax,z)
    );
    delta=candidate*fade*scale;
   }
   // The perimeter is embedded *behind* the skin rather than floating in
   // front of it. The interior rises only where the translated donor is
   // actually superficial to the local skin.
   const y=bs.y+embed-delta;
   positions.push([x,y,z]);normals.push([0,-1,0]);uvs.push([i/nx,j/nz]);colors.push([1,1,1]);
   const skin=blendSkin(body,bs);joints.push(skin.js);weights.push(skin.ws);
   diagnostics.push({x,z,bodyY:bs.y,coreY:cs==null?null:cs.y+posterior,push:delta,embed});
  }
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
  indices.push(a,b,c,b,d,c);
 }
 for(let k=0;k<indices.length;k+=3){
  const ids=indices.slice(k,k+3),P=ids.map(i=>positions[i]);
  const n=cross(v3(P[1],P[0]),v3(P[2],P[0]));
  for(const id of ids)for(let d=0;d<3;d++)normals[id][d]+=n[d];
 }
 for(let i=0;i<normals.length;i++)normals[i]=normal(normals[i]);
 return {positions,normals,uvs,colors,joints,weights,indices,stats:{
  type:'continuous_pelvic_surface_patch',points:positions.length,triangles:indices.length/3,bodySurfaceTriangles:B.count,coreSourceTriangles:C.count,
  minPush:Math.min(...diagnostics.map(x=>x.push)),maxPush:Math.max(...diagnostics.map(x=>x.push)),
  samplesWithCore:diagnostics.filter(x=>x.coreY!=null).length,xmin,xmax,zmin,zmax,
  maxBodyPositionVariance:0,posterior,superior,embed,maxRelief,feather,
  attachedBySurfaceProjection:true,topologicallyWelded:false
 }};
}
module.exports={makePatch,projector};