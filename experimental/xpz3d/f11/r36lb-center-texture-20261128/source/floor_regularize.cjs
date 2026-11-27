'use strict';
/*
 * R36KX pelvic-floor triangulation cleanup.
 * Reconnect skinny triangle diagonals and mildly relax bind-space positions
 * without adding faces, detaching skin, changing joint arrays or UV layout.
 * Full texture rebake is required after a diagonal flip.
 */
const {cross,dot,length,normal}=require('./mesh_qem.cjs');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(a,t)=>a.map(x=>x*t);
const triangleNormal=tri=>normal(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])));
const triangleArea=tri=>length(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])))*.5;
function quality(tri) {
 const [a,b,c]=tri,ab=sub(b,a),ac=sub(c,a),bc=sub(c,b);
 const e2=dot(ab,ab)+dot(ac,ac)+dot(bc,bc);
 return e2<1e-14?0:clamp(2*Math.sqrt(3)*length(cross(ab,ac))/e2);
}
function floorMask(p){
 const x=p[0],y=p[1],z=p[2];
 return (1-smooth(.10,.205,Math.abs(x)))*smooth(.716,.77,z)*(1-smooth(1.035,1.115,z))*(1-smooth(-.02,.11,y));
}
function statistics(m){
 const q=[],floor=[];
 for(let i=0;i<m.indices.length;i+=3){
  const tri=m.indices.slice(i,i+3).map(j=>m.positions[j]);
  const v=quality(tri);q.push(v);
  const p=scale(add(add(tri[0],tri[1]),tri[2]),1/3);
  if(floorMask(p)>.27)floor.push(v);
 }
 function summary(values){
  const sorted=values.slice().sort((a,b)=>a-b);
  const at=x=>sorted[Math.floor(x*(sorted.length-1))]||0;
  return {count:values.length,mean:values.reduce((s,x)=>s+x,0)/(values.length||1),min:sorted[0]||0,
   p05:at(.05),p10:at(.10),p25:at(.25),below028:values.filter(x=>x<.28).length,
   below045:values.filter(x=>x<.45).length};
 }
 return {whole:summary(q),floor:summary(floor)};
}
function edgesOf(indices){
 const edges=new Map();
 for(let fi=0;fi<indices.length/3;fi++){
  const f=indices.slice(fi*3,fi*3+3);
  for(let k=0;k<3;k++){
   const a=f[k],b=f[(k+1)%3],c=f[(k+2)%3];
   const key=a<b?a+':'+b:b+':'+a;
   if(!edges.has(key))edges.set(key,{key,refs:[]});
   edges.get(key).refs.push({fi,a,b,c});
  }
 }
 return edges;
}
function assess(m,edge,minGain,allKeys){
 if(edge.refs.length!==2)return null;
 const [one,two]=edge.refs;
 if(one.a!==two.b||one.b!==two.a)return null;
 const a=one.a,b=one.b,c=one.c,d=two.c;
 if(new Set([a,b,c,d]).size!==4)return null;
 const key=c<d?c+':'+d:d+':'+c;
 if(allKeys.has(key))return null;
 const p=[a,b,c,d].reduce((out,id)=>add(out,scale(m.positions[id],.25)),[0,0,0]);
 const region=floorMask(p);if(region<.27)return null;
 const P=m.positions,old1=[P[a],P[b],P[c]],old2=[P[b],P[a],P[d]],
       new1=[P[c],P[a],P[d]],new2=[P[d],P[b],P[c]];
 const oldQ=Math.min(quality(old1),quality(old2)),newQ=Math.min(quality(new1),quality(new2));
 const gain=newQ-oldQ;if(gain<minGain)return null;
 const n1=triangleNormal(old1),n2=triangleNormal(old2),reference=normal(add(n1,n2));
 if(dot(n1,n2)<.1)return null;
 const dn=Math.min(dot(triangleNormal(new1),reference),dot(triangleNormal(new2),reference));
 if(dn<.84||Math.min(triangleArea(new1),triangleArea(new2))<1e-12)return null;
 return {fi1:one.fi,fi2:two.fi,tri1:[c,a,d],tri2:[d,b,c],gain,score:gain*region,
  minDot:dn,oldQ,newQ,key:edge.key};
}
function flip(m,{flips=30,minGain=.034}={}){
 const log=[];
 for(let k=0;k<flips;k++){
  const edges=edgesOf(m.indices),keys=new Set(edges.keys());let best=null;
  for(const edge of edges.values()){
   const candidate=assess(m,edge,minGain,keys);
   if(candidate&&(!best||candidate.score>best.score))best=candidate;
  }
  if(!best)break;
  m.indices.splice(best.fi1*3,3,...best.tri1);
  m.indices.splice(best.fi2*3,3,...best.tri2);
  log.push({edge:best.key,qualityBefore:best.oldQ,qualityAfter:best.newQ,gain:best.gain,minDot:best.minDot});
 }
 return log;
}
function recalc(m){
 const n=m.positions.map(()=>[0,0,0]);
 for(let k=0;k<m.indices.length;k+=3){
  const [a,b,c]=m.indices.slice(k,k+3),p=m.positions;
  const f=cross(sub(p[b],p[a]),sub(p[c],p[a]));
  for(const j of [a,b,c])n[j]=add(n[j],f);
 }
 m.normals=n.map(normal);
}
function relax(m,{passes=5,alpha=.27,maxDisplacement=.0042,stepCap=.0017}={}){
 const orig=m.positions.map(x=>x.slice()),n=m.positions.length,
       neighbor=Array.from({length:n},()=>new Set()),
       incident=Array.from({length:n},()=>new Set());
 for(let fi=0;fi<m.indices.length/3;fi++){
  const ids=m.indices.slice(fi*3,fi*3+3);
  for(let k=0;k<3;k++){
   const a=ids[k],b=ids[(k+1)%3],c=ids[(k+2)%3];
   neighbor[a].add(b);neighbor[a].add(c);incident[a].add(fi);
  }
 }
 let accepted=0,rejected=0,maxMoved=0;
 for(let pass=0;pass<passes;pass++){
  recalc(m);
  for(let i=0;i<n;i++){
   const p=m.positions[i],relevance=floorMask(p);
   if(relevance<.18||neighbor[i].size<4)continue;
   const ref=m.normals[i];let center=[0,0,0],wt=0;
   for(const j of neighbor[i]){
    const q=m.positions[j],w=1/Math.sqrt(Math.max(length(sub(q,p)),1e-6));
    center=add(center,scale(q,w));wt+=w;
   }
   center=scale(center,1/wt);
   let move=sub(center,p);move=sub(move,scale(ref,dot(move,ref)));
   const size=length(move),remaining=Math.max(0,maxDisplacement-length(sub(p,orig[i])));
   if(size<1e-8||remaining<1e-8)continue;
   move=scale(move,Math.min(size*alpha*relevance,stepCap,remaining)/size);
   const oldFaces=[...incident[i]].map(fi=>m.indices.slice(fi*3,fi*3+3).map(j=>m.positions[j]));
   const oldQ=oldFaces.map(quality),minQ=Math.min(...oldQ);
   const oldEnergy=oldQ.reduce((s,q)=>s+1/(.075+q*q),0);
   let success=false;
   for(let t=1;t>=.0625;t/=2){
    const trial=add(p,scale(move,t));m.positions[i]=trial;
    const newFaces=[...incident[i]].map(fi=>m.indices.slice(fi*3,fi*3+3).map(j=>m.positions[j]));
    const newQ=newFaces.map(quality),newEnergy=newQ.reduce((s,q)=>s+1/(.075+q*q),0);
    let good=Math.min(...newQ)>=minQ*.985 && newEnergy<oldEnergy-1e-7;
    if(good)for(let j=0;j<oldFaces.length;j++){
     if(dot(triangleNormal(oldFaces[j]),triangleNormal(newFaces[j]))<.88||
        triangleArea(newFaces[j])<triangleArea(oldFaces[j])*.68){good=false;break;}
    }
    if(good){accepted++;maxMoved=Math.max(maxMoved,length(sub(trial,orig[i])));success=true;break;}
    m.positions[i]=p;
   }
   if(!success)rejected++;
  }
 }
 recalc(m);
 return {accepted,rejected,changedUniqueVertices:orig.filter((p,i)=>length(sub(p,m.positions[i]))>1e-8).length,maxMoved};
}
function regularize(original,options={}){
 const m={...original};
 for(const field of ['positions','normals','uvs','colors','joints','weights','indices']){
  const val=original[field];m[field]=Array.isArray(val)?val.map(x=>Array.isArray(x)?x.slice():x):val;
 }
 const before=statistics(m),tri=m.indices.length;
 const flipped=flip(m,options),relaxed=relax(m,options);
 const edges=edgesOf(m.indices),bad=[...edges.values()].filter(x=>x.refs.length!==2);
 if(bad.length)throw Error('open/nonmanifold edges='+bad.length);
 if(m.indices.length!==tri)throw Error('triangle budget changed');
 const after=statistics(m);
 m.stats={...m.stats,floorRegularize:{version:'R36KX',before,after,flips:flipped.length,
  flipsLog:flipped,relaxed,originalTriangles:tri/3,remainingTriangles:tri/3,closedManifold:true,
  limitation:'Cannot fill pre-existing negative space between thighs'}};
 return m;
}
module.exports={regularize,statistics,floorMask,edgesOf,quality};