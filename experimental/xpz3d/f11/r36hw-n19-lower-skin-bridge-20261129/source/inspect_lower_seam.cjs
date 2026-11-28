#!/usr/bin/env node
'use strict';
// Source-informed seam discovery; writes no model and is not an art approval.
const fs=require('fs'),path=require('path'),{load,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const src=process.argv[2],dest=process.argv[3];const q=load(src),a=extract(q,0,3),b=extract(q,0,6),F=a.indices,P=a.positions,SP=b.positions,SI=b.indices,regions=q.g.meshes[0].primitives[6].extras?.ranges||[];
const map=new Map();
for(let t=0;t<F.length;t+=3){const f=F.slice(t,t+3);for(const [x,y] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){const k=x<y?x+','+y:y+','+x;map.set(k,(map.get(k)||0)+1)}}
const border=[...map].filter(([k,n])=>n===1).map(([k])=>k.split(',').map(Number)),vBorder=[...new Set(border.flat())];
const legSections=regions.filter(r=>/leg below shorts/i.test(r.name)).map(r=>{
 const indices=[...new Set(SI.slice(r.startTriangle*3,3*(r.startTriangle+r.triangles)))];
 const candidates=indices.filter(i=>Math.abs(SP[i][2]-.815)<.002);
 return {name:r.name,vertices:indices.length,rim:candidates.map(i=>({i,position:SP[i]}))};
});
const nearest=pt=>{let best=null;for(let j=0;j<SP.length;j++){const dist=Math.hypot(...pt.map((v,k)=>v-SP[j][k]));if(!best||dist<best.d)best={index:j,d:dist,pt:SP[j]}}return best};
const ordered=vBorder.map(i=>{const pt=P[i],n=nearest(pt);return {i,pt:pt.map(v=>+v.toFixed(5)),nearest:{id:n.index,d:+n.d.toFixed(5),pt:n.pt.map(v=>+v.toFixed(5))}}});
const report={input:q.sha,pelvisTriangles:F.length/3,pelvisVertices:P.length,skinTriangles:b.indices.length/3,skinVertices:SP.length,boundaryVertices:vBorder.length,boundaryEdges:border.length,lowerBoundary:ordered.filter(v=>v.pt[2]<.857).sort((a,b)=>a.pt[2]-b.pt[2]),topBoundary:ordered.filter(v=>v.pt[2]>1),legSections};
fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pelvisTriangles:report.pelvisTriangles,lower:report.lowerBoundary.length,rims:legSections.map(r=>({name:r.name,count:r.rim.length})),medianGap:report.lowerBoundary.map(v=>v.nearest.d).sort((a,b)=>a-b)[Math.floor(report.lowerBoundary.length/2)]}));
