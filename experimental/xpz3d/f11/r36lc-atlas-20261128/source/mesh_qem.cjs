'use strict';
// R36KO LP2100 ? per-edge quadric simplifier.
// This production code is intentionally standalone: no native Blender or npm dependencies.
const v3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=a=>Math.hypot(a[0],a[1],a[2]);
const normal=a=>{const m=length(a)||1;return a.map(x=>x/m)};
const mix=(a,b,t)=>a.map((x,i)=>x*(1-t)+b[i]*t);
class Heap{constructor(){this.a=[]}push(x){const a=this.a;let i=a.length;a.push(x);while(i){let p=(i-1)>>1;if(a[p].cost<=x.cost)break;a[i]=a[p];i=p;}a[i]=x}pop(){const a=this.a;if(!a.length)return null;const top=a[0],last=a.pop();if(!a.length)return top;let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].cost<a[child].cost)child++;if(a[child].cost>=last.cost)break;a[i]=a[child];i=child;}a[i]=last;return top}}
function addQuad(dst,src){for(let i=0;i<10;i++)dst[i]+=src[i]}
function evalQuad(q,p){let [x,y,z]=p;return q[0]*x*x+q[4]*y*y+q[7]*z*z+q[9]+2*(q[1]*x*y+q[2]*x*z+q[3]*x+q[5]*y*z+q[6]*y+q[8]*z)}
function quadFromFace(p0,p1,p2){
 const cr=cross(v3(p1,p0),v3(p2,p0)),area=length(cr);
 if(area<1e-14)return Array(10).fill(0);
 const [nx,ny,nz]=cr.map(x=>x/area),d=-dot([nx,ny,nz],p0),w=Math.sqrt(area);
 return [nx*nx,nx*ny,nx*nz,nx*d,ny*ny,ny*nz,ny*d,nz*nz,nz*d,d*d].map(x=>x*w);
}
function choose(q,a,b){
 // Stable minimum on edge segment; unlike unrestricted QEM this cannot create long spikes.
 const d=v3(b,a), aa=evalQuad(q,a),bb=evalQuad(q,b),mid=mix(a,b,.5),mm=evalQuad(q,mid);
 const curvature=2*(aa+bb-2*mm);
 let t=curvature>1e-20?(3*aa+bb-4*mm)/curvature: .5; // minimize evaluated quadratic
 t=Math.max(0,Math.min(1,t));
 const samples=[{t:0,p:a},{t:1,p:b},{t:.5,p:mid},{t,p:mix(a,b,t)}];
 let best=null;for(const s of samples){let val=Math.max(0,evalQuad(q,s.p));if(!best||val<best.val)best={...s,val};}
 return best;
}
function simplify(mesh,target,opt={}){
 const start=Date.now();
 const {positions,indices,normals,uvs,colors,joints,weights}=mesh;
 if(indices.length%3)throw Error('not triangle mesh');
 let activeTris=indices.length/3;
 if(target>=activeTris)return {...mesh,stats:{startTriangles:activeTris,endTriangles:activeTris,collapses:0}};
 const verts=positions.map((p,i)=>({
  p:p.slice(),uv:uvs[i].slice(),c:colors?colors[i].slice():[1,1,1],
  js:joints[i].slice(),ws:weights[i].slice(),
  n:normals[i].slice(),q:new Float64Array(10),faces:new Set(),adj:new Set(),live:true,version:0
 }));
 const faces=[];
 for(let k=0;k<indices.length;k+=3){
  const ids=indices.slice(k,k+3),f={v:ids,live:true};
  faces.push(f);const fid=faces.length-1;
  for(let j=0;j<3;j++){verts[ids[j]].faces.add(fid);verts[ids[j]].adj.add(ids[(j+1)%3]);verts[ids[j]].adj.add(ids[(j+2)%3]);}
  const q=quadFromFace(...ids.map(i=>verts[i].p));
  for(const id of ids)addQuad(verts[id].q,q);
 }
 const heap=new Heap(), regionMultiplier=opt.regionMultiplier||1,normalLimit=opt.normalLimit??-.05;
 let skipped=0,flipped=0,collapses=0;
 function cost(a,b){
  const va=verts[a],vb=verts[b];const q=Array.from(va.q,(n,k)=>n+vb.q[k]);
  const {p,t,val}=choose(q,va.p,vb.p);
  const dx=length(v3(va.p,vb.p));
  // Preserve bone boundaries & UV detail. Error is in square world units.
  const jA=va.js[0],jB=vb.js[0],jointPenalty=jA===jB?1:1.15;
  let reg=1;
  if(opt.focusPelvis){const x=(va.p[0]+vb.p[0])/2,z=(va.p[2]+vb.p[2])/2;
   if(Math.abs(x)<.22&&z>.69&&z<1.13)reg=regionMultiplier;}
  const uvErr=Math.hypot(va.uv[0]-vb.uv[0],va.uv[1]-vb.uv[1]);
  return {a,b,p,t,cost:(val+dx*dx*1e-10+uvErr*uvErr*1e-7)*jointPenalty*reg,av:va.version,bv:vb.version};
 }
 function push(a,b){if(a===b||!verts[a].live||!verts[b].live)return;heap.push(cost(a,b));}
 verts.forEach((v,i)=>{for(const j of v.adj)if(i<j)push(i,j)});
 function canCollapse(a,b,p){
  const va=verts[a],vb=verts[b];
  const union=new Set([...va.faces,...vb.faces]);
  const efaces=[...va.faces].filter(x=>vb.faces.has(x)).length;
  if(!efaces||efaces>2)return false;
  // avoid joining disconnected sheets (manifold link condition)
  const common=[...va.adj].filter(x=>vb.adj.has(x)).length;
  if(opt.strictLink&&common!==efaces)return false;
  for(const fi of union){
   const f=faces[fi];if(!f.live)continue;
   const ids=f.v.map(x=>x===b?a:x);
   if((new Set(ids)).size<3)continue;
   const old= f.v.map(id=>verts[id].p);
   const now=ids.map(id=>id===a?p:verts[id].p);
   const before=cross(v3(old[1],old[0]),v3(old[2],old[0]));
   const after=cross(v3(now[1],now[0]),v3(now[2],now[0]));
   const d=dot(before,after),mag=length(before)*length(after);
   if(mag<1e-20||d/mag<normalLimit)return false;
  }
  return true;
 }
 function mergeAttrib(a,b,t){
  const A=verts[a],B=verts[b];
  A.p=mix(A.p,B.p,t);A.uv=mix(A.uv,B.uv,t);A.c=mix(A.c,B.c,t);A.n=normal(mix(A.n,B.n,t));
  const w=new Map();
  for(let k=0;k<4;k++){if(A.ws[k]>0)w.set(A.js[k],(w.get(A.js[k])||0)+A.ws[k]*(1-t));if(B.ws[k]>0)w.set(B.js[k],(w.get(B.js[k])||0)+B.ws[k]*t);}
  const top=[...w].sort((x,y)=>y[1]-x[1]).slice(0,4),sum=top.reduce((s,x)=>s+x[1],0)||1;
  A.js=Array.from({length:4},(_,k)=>top[k]?.[0]||0);A.ws=Array.from({length:4},(_,k)=>(top[k]?.[1]||0)/sum);
  addQuad(A.q,B.q);
 }
 while(activeTris>target){
  const e=heap.pop();if(!e)throw Error('simplification stalled at '+activeTris+'/'+target+' after '+collapses+' collapses');
  const a=e.a,b=e.b,A=verts[a],B=verts[b];
  if(!A.live||!B.live||A.version!==e.av||B.version!==e.bv||!A.adj.has(b)){skipped++;continue;}
  if(!canCollapse(a,b,e.p)){flipped++;continue;}
  const impactedFaces=[...new Set([...A.faces,...B.faces])];
  const touched=new Set([a,b,...A.adj,...B.adj]);
  for(const fi of impactedFaces){
   const f=faces[fi];if(!f.live)continue;
   f.v=f.v.map(id=>id===b?a:id);
   if(new Set(f.v).size<3){f.live=false;activeTris--;for(const id of f.v)verts[id].faces.delete(fi);}
   else A.faces.add(fi);
  }
  B.faces.clear();B.adj.clear();B.live=false;
  mergeAttrib(a,b,e.t);collapses++;
  // Rebuild immediate adjacency from live face memberships and invalidate stale edge costs.
  for(const id of touched){const V=verts[id];if(!V.live)continue;
   const adjacent=new Set(),valid=new Set();
   for(const fi of V.faces){const f=faces[fi];if(!f.live||!f.v.includes(id))continue;valid.add(fi);for(const j of f.v)if(j!==id&&verts[j].live)adjacent.add(j);}
   V.faces=valid;V.adj=adjacent;V.version++;
  }
  for(const id of touched){const V=verts[id];if(!V.live)continue;for(const j of V.adj){if(id<j)push(id,j);}}
  if(opt.logEvery&&collapses%opt.logEvery===0)console.log('QEM',opt.name||'',activeTris,'collapses',collapses,'ms',Date.now()-start);
 }
 const remap=new Map(),out={positions:[],normals:[],uvs:[],colors:[],joints:[],weights:[],indices:[]};
 function get(id){if(!remap.has(id)){let i=out.positions.length,v=verts[id];remap.set(id,i);out.positions.push(v.p);out.uvs.push(v.uv);out.colors.push(v.c);out.joints.push(v.js);out.weights.push(v.ws);out.normals.push([0,0,0]);}return remap.get(id);}
 for(const f of faces)if(f.live){const ids=f.v.map(get);out.indices.push(...ids);const n=cross(v3(out.positions[ids[1]],out.positions[ids[0]]),v3(out.positions[ids[2]],out.positions[ids[0]]));for(const id of ids){let v=out.normals[id];v[0]+=n[0];v[1]+=n[1];v[2]+=n[2];}}
 out.normals=out.normals.map((v,i)=>normal(length(v)>1e-12?v:verts[[...remap][i]?.[0]]?.n||[0,0,1]));
 out.stats={startTriangles:indices.length/3,endTriangles:out.indices.length/3,vertices:out.positions.length,collapses,skipped,flipped,elapsedMs:Date.now()-start};
 return out;
}
module.exports={simplify,normal,cross,dot,v3,add:(a,b)=>a.map((v,i)=>v+b[i]),mix,length};
