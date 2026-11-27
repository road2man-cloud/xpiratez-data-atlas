'use strict';
/**
 * R36LA / 2100 triangle skin surface-flow stage.
 * Samples high-density donor normals at existing model vertices, then
 * regularizes per-vertex normals across the continuous watertight shell.
 * Independent of UV-island boundaries; never adds floating surface.
 * Preserves all positions, face indices, UV topology and skin bindings.
 */
const {buildBVH}=require('./bake_atlas.cjs');
const {normal,dot,length}=require('./mesh_qem.cjs');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
function gain(p){
 const [x,y,z]=p,ax=Math.abs(x);
 const floor=(1-smooth(.13,.26,ax))*smooth(.70,.785,z)*
   (1-smooth(1.01,1.12,z))*(1-smooth(-.025,.105,y));
 const torso=smooth(1.18,1.25,z)*(1-smooth(1.47,1.56,z))*
   (1-smooth(.20,.36,ax))*(1-smooth(-.045,.12,y));
 return clamp(Math.max(floor,torso*.8));
}
function flow(input,high,{weight=.32,iterations=2,edgeMinDot=.26}={}){
 if(weight<0||weight>1)throw Error('weight outside [0,1]');
 const mesh={...input,normals:input.normals.map(x=>x.slice())};
 const bv=buildBVH(high),neighbor=mesh.positions.map(()=>new Map());
 const I=mesh.indices;
 for(let i=0;i<I.length;i+=3){
  for(let k=0;k<3;k++){
   let a=I[i+k],b=I[i+(k+1)%3],p=mesh.positions[a],q=mesh.positions[b];
   const d=length(p.map((x,j)=>x-q[j]));
   if(d>1e-7){neighbor[a].set(b,d);neighbor[b].set(a,d);}
  }
 }
 const original=mesh.normals.map(x=>normal(x)),regions=mesh.positions.map(gain);
 let projected=0,reflected=0,maxAngle=0;
 const blend=(a,b,t)=>normal(a.map((x,k)=>x*(1-t)+b[k]*t));
 const sample=original.map((base,i)=>{
  const region=regions[i];if(region<.01)return base;
  let projectedNormal=bv.nearest(mesh.positions[i]).normal;
  const align=dot(base,projectedNormal);
  if(align<0){projectedNormal=projectedNormal.map(x=>-x);reflected++;}
  let t=weight*region;
  // Do not violate abrupt genuine silhouette/crease boundaries.
  if(Math.abs(align)<edgeMinDot)t*=.3;
  const result=blend(base,projectedNormal,t);
  const angle=Math.acos(clamp(dot(base,result),-1,1))*180/Math.PI;
  maxAngle=Math.max(maxAngle,angle);projected++;
  return result;
 });
 let current=sample;
 for(let pass=0;pass<iterations;pass++){
  current=current.map((n,i)=>{
   const region=regions[i];if(region<.02)return n;
   let sum=[0,0,0],weights=0;
   for(const [j,d] of neighbor[i]){
    if(dot(n,current[j])<edgeMinDot)continue;
    const wt=1/Math.sqrt(Math.max(d,.00001));
    weights+=wt;for(let k=0;k<3;k++)sum[k]+=current[j][k]*wt;
   }
   if(weights<1e-8)return n;
   const average=normal(sum.map(x=>x/weights));
   return blend(n,average,.21*region);
  });
 }
 let affected=0,sumDegrees=0;
 for(let i=0;i<current.length;i++){
  const before=original[i],after=current[i];
  const angle=Math.acos(clamp(dot(before,after),-1,1))*180/Math.PI;
  if(angle>.01){affected++;sumDegrees+=angle;}
 }
 mesh.normals=current;
 mesh.stats={...input.stats,surfaceFlow:{version:'R36LA',projectedVertices:projected,
    smoothingPasses:iterations,donorWeight:weight,donorTriangles:high.indices.length/3,
    affectedVertices:affected,meanNormalChangeDeg:affected?sumDegrees/affected:0,
    maxProjectionAngleDeg:maxAngle,reflectedSamples:reflected,
    positionsChanged:false,faceIndicesChanged:false,skinningChanged:false,
    warning:'Normal change reduces faceting but does not fill actual missing geometry or alter silhouette'}};
 return mesh;
}
module.exports={flow,gain};
