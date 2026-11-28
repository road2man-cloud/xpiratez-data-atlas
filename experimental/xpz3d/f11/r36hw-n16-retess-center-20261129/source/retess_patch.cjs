'use strict';
// Modify exactly the connected central patch of an existing original-HW pelvis.
// No photo projection, full-body reconstruction, separate overlay or extra triangles.
module.exports=function retess({positions,triangles,innerIds,oldNormals}){
 const original=positions.map(v=>v.slice()),originalFaces=triangles.map(f=>f.slice());
 const inside=f=>f.some(id=>innerIds.includes(id)),removed=triangles.filter(inside),outside=triangles.filter(f=>!inside(f));
 const edges=f=>[[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]],key=(a,b)=>a<b?a+','+b:b+','+a;
 const counts=new Map();for(const f of removed)for(const [a,b] of edges(f)){const k=key(a,b);counts.set(k,(counts.get(k)||0)+1)}
 const outer=[...counts].filter(([,v])=>v===1).map(([k])=>k.split(',').map(Number));
 const adjacency=new Map();for(const [a,b] of outer){if(!adjacency.has(a))adjacency.set(a,[]);if(!adjacency.has(b))adjacency.set(b,[]);adjacency.get(a).push(b);adjacency.get(b).push(a)}
 if(removed.length!==44||outer.length!==40||[...adjacency.values()].some(v=>v.length!==2))throw Error('N15 center patch topology mismatch: '+removed.length+'/'+outer.length);
 const ring=[],start=Math.min(...adjacency.keys());let cur=start,prev=null;
 for(let t=0;t<41;t++){if(t>0&&cur===start)break;ring.push(cur);
 const nb=adjacency.get(cur),next=prev===null?Math.min(...nb):nb.find(x=>x!==prev);
 prev=cur;cur=next}
 if(cur!==start||ring.length!==40)throw Error('Unclosed 40-point patch rim');
 const xz=id=>[positions[id][0],positions[id][2]];
 const orient=(a,b,c)=>{const A=xz(a),B=xz(b),C=xz(c);return(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0])};
 const sign=Math.sign(ring.reduce((s,a,i)=>{const A=xz(a),B=xz(ring[(i+1)%ring.length]);return s+A[0]*B[1]-B[0]*A[1]},0));
 if(sign===0)throw Error('Flat rim projection');
 function bary(p,a,b,c){
  const A=xz(a),B=xz(b),C=xz(c),den=orient(a,b,c);if(Math.abs(den)<1e-12)return null;
  const wa=((B[0]-p[0])*(C[1]-p[1])-(B[1]-p[1])*(C[0]-p[0]))/den;
  const wb=((C[0]-p[0])*(A[1]-p[1])-(C[1]-p[1])*(A[0]-p[0]))/den;
  return [wa,wb,1-wa-wb];
 }
 const quality=f=>{const a=xz(f[0]),b=xz(f[1]),c=xz(f[2]);
 const L=(p,q)=>(p[0]-q[0])**2+(p[1]-q[1])**2;
 return Math.abs(orient(...f))/(L(a,b)+L(b,c)+L(c,a)+1e-15)};
 const polygon=ring.slice(),patch=[];
 while(polygon.length>3){
  let best=null;
  for(let i=0;i<polygon.length;i++){
   const f=[polygon[(i+polygon.length-1)%polygon.length],polygon[i],polygon[(i+1)%polygon.length]];
   if(orient(...f)*sign<1e-11)continue;
   if(polygon.some(k=>!f.includes(k)&&((v)=>v&&Math.min(...v)>1e-8)(bary(xz(k),...f))))continue;
   const q=quality(f);if(!best||q>best.q)best={i,f,q};
  }
  if(!best){
   // Projected 2D ring can contain shallow self-overlaps even though the
   // original 3D surface is manifold. Prefer minimum-overlap forward ear;
   // the 3D manifold, non-zero area and orientation checks below still apply.
   let fallback=null;
   for(let i=0;i<polygon.length;i++){
    const f=[polygon[(i+polygon.length-1)%polygon.length],polygon[i],polygon[(i+1)%polygon.length]];
    const signed=orient(...f)*sign;
    if(signed<1e-12)continue;
    let overlap=0;for(const k of polygon){
     if(f.includes(k))continue;
     const w=bary(xz(k),...f);
     if(w&&Math.min(...w)>1e-7)overlap++;
    }
    const q=score(f)-overlap*1e3;
    if(!fallback||q>fallback.q)fallback={i,f,q};
   }
   if(!fallback)throw Error('No forward nondegenerate ear at '+polygon.length);
   best=fallback;
  }
  patch.push(best.f);polygon.splice(best.i,1);
 }
 patch.push(polygon);
 if(patch.length!==38)throw Error('Wrong face count after ear clipping');
 function inPoly(x,z){
  let hits=0;
  for(let i=0;i<ring.length;i++){const A=xz(ring[i]),B=xz(ring[(i+1)%ring.length]);
   if((A[1]>z)!==(B[1]>z)&&x<(B[0]-A[0])*(z-A[1])/(B[1]-A[1])+A[0])hits++;
  }return hits%2===1;
 }
 // Each existing inner pole now occupies an independent polygon triangle.
 // Vertical separation replaces the dense N14 radial pole convergence.
 const hub=original[innerIds[0]],plans=[[-.011,.028,.002],[.005,.000,.006],[.008,-.027,.002]],locations=[];
 for(let i=0;i<3;i++){
  const id=innerIds[i],p=plans[i];let best=null;
  for(let s=1;s>=.0625;s*=.5){
   for(let jitter=-2;jitter<=2;jitter++){
    const x=hub[0]+p[0]*s+jitter*.001,z=hub[2]+p[1]*s;
    if(!inPoly(x,z))continue;
    for(let t=0;t<patch.length;t++){
     const B=bary([x,z],...patch[t]);if(!B)continue;const m=Math.min(...B);
     if(m>.009&&(!best||m>best.margin))best={t,x,z,B,margin:m,scale:s};
    }
   }
   if(best&&best.margin>.045)break;
  }
  if(!best)throw Error('Unable to place inner pole '+id);
  const f=patch[best.t],Y=f.reduce((s,v,k)=>s+positions[v][1]*best.B[k],0);
  positions[id]=[best.x,Y+p[2]*best.scale,best.z];
  const [a,b,c]=f;
  patch.splice(best.t,1,[a,b,id],[b,c,id],[c,a,id]);
  locations.push({id,scale:best.scale,x:best.x,z:best.z,margin:best.margin});
 }
 if(patch.length!==44)throw Error('Patch vertex insertion changed triangle budget');
 function direction(f,a,b){for(const [u,v] of edges(f)){if(u===a&&v===b)return 1;if(u===b&&v===a)return -1}return 0}
 const [ra,rb]=outer[0],old=removed.find(f=>direction(f,ra,rb)),now=patch.find(f=>direction(f,ra,rb));
 if(!old||!now)throw Error('Original outer edge lost');
 if(direction(old,ra,rb)!==direction(now,ra,rb))for(const f of patch)[f[1],f[2]]=[f[2],f[1]];
 const final=outside.concat(patch);
 function map(faces){
  const E=new Map();
  for(const f of faces)for(const [a,b] of edges(f)){const k=key(a,b),v=E.get(k)||{n:0,dir:0};v.n++;v.dir+=a<b?1:-1;E.set(k,v)}
  return E;
 }
 const eb=map(originalFaces),ea=map(final),border=E=>[...E].filter(([,v])=>v.n===1).map(([k])=>k).sort();
 const boundaryPreserved=JSON.stringify(border(eb))===JSON.stringify(border(ea));
 if(!boundaryPreserved||[...ea.values()].some(v=>v.n>2||(v.n===2&&v.dir!==0)))throw Error('Retriangulated patch not sewn to original perimeter');
 const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const length=v=>Math.hypot(...v),unit=v=>v.map(x=>x/(length(v)||1)),dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0);
 const normal=f=>{const [a,b,c]=f.map(i=>positions[i]);return cross(sub(b,a),sub(c,a))};
 const ref=removed.reduce((s,f)=>{const [a,b,c]=f.map(i=>original[i]),n=cross(sub(b,a),sub(c,a));return s.map((v,k)=>v+n[k])},[0,0,0]);
 let invalid=0,minArea=Infinity;
 for(const f of patch){const n=normal(f);minArea=Math.min(minArea,length(n)*.5);if(length(n)<2e-11||dot(unit(n),unit(ref))<-.1)invalid++}
 if(invalid)throw Error('Patch contains collapsed/backward faces: '+invalid);
 const sums=positions.map(()=>[0,0,0]);for(const f of final){const n=normal(f);for(const i of f)for(let k=0;k<3;k++)sums[i][k]+=n[k]}
 const touched=new Set([...ring,...innerIds]),newNormals=oldNormals.map(r=>r.slice());
 for(const i of touched){let n=unit(sums[i]),old=unit(oldNormals[i]);if(dot(n,old)<0)n=n.map(x=>-x);newNormals[i]=unit(n.map((x,k)=>.88*x+.12*old[k]))}
 return {faces:final,positions,newNormals,metrics:{originalCenterTriangles:removed.length,newCenterTriangles:patch.length,ringVertices:ring.length,boundaryPreserved,innerPolePlacements:locations,minPatchArea:minArea,nonmanifoldEdges:0,faceFlips:invalid}};
};
