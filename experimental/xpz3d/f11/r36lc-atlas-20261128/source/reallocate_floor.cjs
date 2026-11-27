'use strict';
// R36KO continuous anatomical surface: split edges of a closed manifold,
// then embed posterior/superior translated donor reference into the SAME
// skinned body mesh. No detached central-anatomy render object.
const {projector}=require('./surface_patch.cjs');
const {cross,dot,v3,length,normal,mix}=require('./mesh_qem.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function smooth(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function blendJoints(A,B,t){
 const w=new Map();
 for(let k=0;k<4;k++){w.set(A.joints[k],(w.get(A.joints[k])||0)+(1-t)*A.weights[k]);w.set(B.joints[k],(w.get(B.joints[k])||0)+t*B.weights[k]);}
 const v=[...w].filter(x=>x[1]>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=v.reduce((s,x)=>s+x[1],0)||1;
 return {joints:Array.from({length:4},(_,i)=>v[i]?.[0]||0),weights:Array.from({length:4},(_,i)=>(v[i]?.[1]||0)/sum)};
}
function refineAttachedBody(input,bodySource,coreSource,{edgeSplits=120,chestSplits=28,posterior=.020,superior=.026,reliefMax=.008,embed=.001,xExtent=.135,zmin=.77,zmax=1.04}={}){
 const m={};
 for(const k of ['positions','normals','uvs','colors','joints','weights','indices'])m[k]=input[k]?.map(v=>Array.isArray(v)?v.slice():v)??null;
 if(!m.colors)m.colors=Array.from({length:m.positions.length},()=>[1,1,1]);
 const B=projector(bodySource),C=projector(coreSource);
 let split=0;const allocation={floor:0,transition:0,upper:0,chest:0};
 if(chestSplits<0||chestSplits>=edgeSplits)throw Error('invalid chest triangle allocation');
 function eachEdge(){
  const map=new Map();
  for(let face=0;face<m.indices.length/3;face++){
   const base=face*3,ids=m.indices.slice(base,base+3);
   for(let k=0;k<3;k++){
    const a=ids[k],b=ids[(k+1)%3],key=(a<b?a+','+b:b+','+a);
    let edge=map.get(key);if(!edge){edge={a:Math.min(a,b),b:Math.max(a,b),faces:[]};map.set(key,edge);}
    edge.faces.push(face);
   }
  }return map;
 }
 function score(edge,zone){
  if(edge.faces.length!==2)return -Infinity;
  const a=m.positions[edge.a],b=m.positions[edge.b],p=mix(a,b,.5),x=p[0],z=p[2];
  if(zone==='floor'&&(Math.abs(x)>.19||z<.72||z>1.16))return -Infinity;
  if(zone==='chest'&&(Math.abs(x)<.045||Math.abs(x)>.33||z<1.16||z>1.49))return -Infinity;
  const base=B.sample(x,z);
  if(!base||Math.abs(p[1]-base.y)>.065)return -Infinity;
  const distance=length(v3(a,b));
  if(zone==='chest'){
   // Additional vertices are selected on the visible upper front torso, not
   // at its back or at garment/hair. Chest and lower pelvis share 120 splits.
   const front=1-smooth(-.095,.025,p[1]);
   const lateral=Math.exp(-Math.pow((Math.abs(x)-.17)/.105,2));
   const height=Math.exp(-Math.pow((z-1.315)/.13,2));
   return distance*front*lateral*height;
  }
  const xWeight=1-smooth(.058,.145,Math.abs(x));
  const floorWeight=smooth(.738,.792,z)*(1-smooth(.905,.978,z));
  const upperWeight=smooth(.91,.98,z)*(1-smooth(1.035,1.11,z));
  const highC=C.sample(x,z-superior);
  const region=highC?1.25:.65;
  return distance*region*Math.max(.000001,xWeight*(floorWeight*12+upperWeight*.14));
 }
 for(let t=0;t<edgeSplits;t++){
  const zone=t<edgeSplits-chestSplits?'floor':'chest';
  const edges=eachEdge();
  let best=null;
  for(const e of edges.values()){
   const s=score(e,zone);
   if(s===-Infinity)continue;
   if(!best||s>best.score)best={...e,score:s};
  }
  if(!best)throw Error('No eligible manifold edge at step '+t);
  const {a,b,faces}=best,pa=m.positions[a],pb=m.positions[b],mid=mix(pa,pb,.5),idx=m.positions.length;
  const vA={joints:m.joints[a],weights:m.weights[a]},vB={joints:m.joints[b],weights:m.weights[b]};
  const skin=blendJoints(vA,vB,.5);
  m.positions.push(mid);m.normals.push(normal(mix(m.normals[a],m.normals[b],.5)));
  m.uvs.push(mix(m.uvs[a],m.uvs[b],.5));m.colors.push(mix(m.colors[a],m.colors[b],.5));
  m.joints.push(skin.joints);m.weights.push(skin.weights);
  // Split both neighbouring faces in-place, maintaining winding and a
  // watertight edge on the closed body surface.
  for(const fi of faces){
   const ids=m.indices.slice(fi*3,fi*3+3);
   let offset=-1;
   for(let j=0;j<3;j++)if((ids[j]===a&&ids[(j+1)%3]===b)||(ids[j]===b&&ids[(j+1)%3]===a)){offset=j;break;}
   if(offset<0)throw Error('Stale edge linkage');
   const u=ids[offset],v=ids[(offset+1)%3],w=ids[(offset+2)%3];
   m.indices.splice(fi*3,3,u,idx,w);
   m.indices.push(idx,v,w);
  }
  const z=(pa[2]+pb[2])*.5;
  allocation[zone==='chest'?'chest':z<.945?'floor':z<1.015?'transition':'upper']++;
  split++;
 }
 // Update body topology (a single closed sheet), never add a separate patch.
 let impacted=0,minRelief=Infinity,maxRelief=0,samples=0,shifted=0;
 for(let i=0;i<m.positions.length;i++){
  const p=m.positions[i],x=p[0],z=p[2];
  if(Math.abs(x)>xExtent||z<zmin||z>zmax)continue;
  const bs=B.sample(x,z),cs=C.sample(x,z-superior);
  if(!bs||!cs||Math.abs(p[1]-bs.y)>.075)continue;
  // Posterior translation (+Y) and superior (+Z) are applied to the
  // high-density donor reference, not as a free-standing object transform.
  const referenceY=cs.y+posterior;
  const fade=(1-smooth(.055,xExtent,Math.abs(x)))*smooth(zmin,zmin+.042,z)*(1-smooth(zmax-.044,zmax,z));
  const requested=clamp(bs.y-referenceY,0,reliefMax);
  const displace=requested*fade;
  if(displace<=1e-8)continue;
  // Only nudge vertices already lying on the front part of the same body
  // surface. No added faces, no detached overlay, no open boundary.
  p[1]-=displace;impacted++;maxRelief=Math.max(maxRelief,displace);minRelief=Math.min(minRelief,displace);
  samples++;shifted+=displace;
 }
 // Refresh area weighted normals after edge splits/deformations.
 const normals=m.positions.map(()=>[0,0,0]);
 let minArea=Infinity;
 for(let k=0;k<m.indices.length;k+=3){
  const ids=m.indices.slice(k,k+3),[a,b,c]=ids.map(j=>m.positions[j]);
  const n=cross(v3(b,a),v3(c,a)),area=length(n)*.5;
  if(area<1e-13)throw Error('Degenerate triangle after attachment '+k/3);
  minArea=Math.min(minArea,area);
  for(const id of ids){normals[id][0]+=n[0];normals[id][1]+=n[1];normals[id][2]+=n[2];}
 }
 m.normals=normals.map(normal);
 const edgeMap=eachEdge(),bad=[...edgeMap.values()].filter(x=>x.faces.length!==2);
 if(bad.length)throw Error('Body mesh nonmanifold after edit '+bad.length);
 m.stats={
  method:'posterior-superior-embedded-continuous-surface',
  before:input.indices.length/3,after:m.indices.length/3,extraTriangles:m.indices.length/3-input.indices.length/3,
  edgeSplits:split,chestSplits,splitAllocation:allocation,boundaryEdges:0,nonmanifoldEdges:0,watertight:true,vertices:m.positions.length,
  posterior,superior,reliefMax,reliefVertexCount:impacted,minAppliedRelief:Number.isFinite(minRelief)?minRelief:0,maxAppliedRelief:maxRelief,
  avgAppliedRelief:samples?shifted/samples:0,minArea,
  limitation:'Topology continuous; not an exact reconstruction of the full 6044-triangle internal anatomy'
 };
 return m;
}
module.exports={refineAttachedBody};
