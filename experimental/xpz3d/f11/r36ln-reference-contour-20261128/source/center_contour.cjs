'use strict';
/**
 * R36LN local integrated contour enhancement for the R36KZ production flow.
 * Intended insertion: after chest sculpt and before 2048 atlas bake.
 * Does NOT create an overlay, a new material, a new mesh or new triangles.
 * Reference 2D image gives only qualitative contours, not metric 3D depth.
 */
const {projector}=require('../../r36kz-chest-center-shape-20261128/source/surface_patch.cjs');
const {cross,dot,length,normal}=require('../../r36kz-chest-center-shape-20261128/source/mesh_qem.cjs');
const clip=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{let t=clip((x-a)/(b-a));return t*t*(3-2*t)};
const bell=(x,c,r)=>Math.exp(-.5*Math.pow((x-c)/r,2));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function contourField(x,z) {
  const ax=Math.abs(x),t=clip((z-.79)/.24);
  const support=(1-smooth(.085,.146,ax))*smooth(.755,.826,z)*(1-smooth(.995,1.065,z));
  const medial=.026+.010*Math.sin(t*Math.PI*.88);
  const side=bell(ax,medial,.021)*bell(z,.886,.10)*.0098;
  const outer=bell(ax,.066,.022)*bell(z,.869,.105)*.0038;
  const medialRidge=bell(ax,.014,.012)*bell(z,.897,.087)*.0036;
  const centralDepression=bell(ax,0,.009)*bell(z,.886,.09)*.0046;
  const lowerBridge=bell(ax,.035,.048)*bell(z,.812,.034)*.0025;
  return support*(x>=0?1:.95)*(side+outer+medialRidge-centralDepression+lowerBridge);
}
function sculpt(input,frontSource,{strength=.85}={}){
  if(!(strength>=0&&strength<=1.6))throw Error('invalid strength');
  const m={...input};
  for(const f of ['positions','normals','uvs','colors','joints','weights','indices'])
    m[f]=Array.isArray(input[f])?input[f].map(v=>Array.isArray(v)?v.slice():v):input[f];
  const source=projector(frontSource),before=m.positions.map(v=>v.slice());
  const face=[],incident=Array.from({length:before.length},()=>[]);
  for(let k=0;k<m.indices.length;k+=3){
    const ids=m.indices.slice(k,k+3),p=ids.map(i=>before[i]),c=cross(sub(p[1],p[0]),sub(p[2],p[0]));
    const n=length(c);if(n<1e-12)throw Error('degenerate source triangle');
    const fi=face.length;face.push({ids,n,normal:normal(c)});
    ids.forEach(i=>incident[i].push(fi));
  }
  const groups=new Map();
  before.forEach((p,i)=>{const key=p.map(v=>Math.round(v*1e6)).join(':');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i)});
  const candidates=[];
  for(const ids of groups.values()){
    const [x,y,z]=before[ids[0]],s=source.sample(x,z);
    if(!s)continue;
    const front=1-smooth(.010,.065,Math.abs(y-s.y));
    const back=1-smooth(-.025,.055,y);
    const offset=-contourField(x,z)*front*back*strength;
    if(Math.abs(offset)>1e-7)candidates.push({ids,offset});
  }
  candidates.sort((a,b)=>Math.abs(b.offset)-Math.abs(a.offset));
  let moved=0,rejected=0,maxMove=0,minDot=1,minRatio=1;
  for(const {ids,offset} of candidates){
    const affected=new Set(ids.flatMap(id=>incident[id]));let accepted=false;
    for(const factor of [1,.76,.52,.34,.2,.1,.04]){
      ids.forEach(i=>m.positions[i][1]=before[i][1]+offset*factor);
      let good=true,d=1,r=1;
      for(const fi of affected){
        const f=face[fi],p=f.ids.map(i=>m.positions[i]),c=cross(sub(p[1],p[0]),sub(p[2],p[0])),a=length(c);
        const ratio=a/f.n,dir=dot(normal(c),f.normal);
        r=Math.min(r,ratio);d=Math.min(d,dir);
        if(a<1e-12||ratio<.53||dir<.68){good=false;break}
      }
      if(good){moved++;maxMove=Math.max(maxMove,Math.abs(offset*factor));minRatio=Math.min(minRatio,r);minDot=Math.min(minDot,d);accepted=true;break}
    }
    if(!accepted){ids.forEach(i=>m.positions[i][1]=before[i][1]);rejected++}
  }
  if(moved<8)throw Error('contour affected too few positions: '+moved);
  const accum=m.positions.map(()=>[0,0,0]);
  for(const f of face){
    const p=f.ids.map(i=>m.positions[i]),c=cross(sub(p[1],p[0]),sub(p[2],p[0]));
    for(const id of f.ids)for(let k=0;k<3;k++)accum[id][k]+=c[k];
  }
  for(const ids of groups.values()){
    const sum=[0,0,0];ids.forEach(i=>{for(let k=0;k<3;k++)sum[k]+=accum[i][k]});
    const n=normal(sum);ids.forEach(i=>m.normals[i]=n.slice());
  }
  m.stats={...m.stats,r36ln:{changedUniquePositions:moved,rejected,maxMove,minDot,minRatio,trianglesBefore:input.indices.length/3,trianglesAfter:m.indices.length/3,
    addedMeshes:0,uvPreserved:true,skinPreserved:true,referenceIsMetric:false}};
  return m;
}
module.exports={contourField,sculpt};
