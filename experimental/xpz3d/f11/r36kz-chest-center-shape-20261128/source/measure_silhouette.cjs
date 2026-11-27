'use strict';
/* R36KZ: source-space front-shell silhouette sampling.
 * Comparisons are not a replacement for visual inspection, just an exact
 * measure of where the exterior 3D surface moved relative to R36KY.
 */
const fs=require('fs'),path=require('path');
const {load,extract}=require('./glb_io.cjs'),{projector}=require('./surface_patch.cjs');
const [oldPath,newPath,boldPath,output]=process.argv.slice(2);
if(!oldPath||!newPath||!boldPath||!output)throw Error('usage: node measure_silhouette.cjs old.glb new.glb bold.glb report.json');
const all=[oldPath,newPath,boldPath].map(f=>{const loaded=load(f);return {source:f,sha256:loaded.sha,mesh:extract(loaded,1,0)}});
const maps=all.map(x=>projector(x.mesh)),zList=[1.22,1.25,1.28,1.31,1.34,1.37,1.40,1.43],
      xList=[-.26,-.22,-.18,-.14,-.10,.10,.14,.18,.22,.26],rows=[];
for(const z of zList)for(const x of xList){
 const y=maps.map(p=>p.sample(x,z)?.y??null);
 if(y.some(v=>v===null))continue;
 rows.push({x,z,yOld:y[0],yBalanced:y[1],yBold:y[2],
            balancedForward:y[0]-y[1],boldForward:y[0]-y[2]});
}
function summarize(key){
 const a=rows.map(v=>v[key]);
 return {samples:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,
  min:Math.min(...a),max:Math.max(...a),
  advancedSamples:a.filter(x=>x>0.001).length,
  withdrawnSamples:a.filter(x=>x<-.001).length};
}
const report={version:'R36KZ',method:'frontmost Y of existing low-poly body at common X/Z positions in bind space',
 sources:all.map(x=>({file:x.source,sha256:x.sha256,triangles:x.mesh.indices.length/3})),
 bodyTriangles:all[1].mesh.indices.length/3,
 chestTargets:{zMin:Math.min(...zList),zMax:Math.max(...zList),xList},
 balanced:summarize('balancedForward'),bold:summarize('boldForward'),rows};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sampleCount:rows.length,balanced:report.balanced,bold:report.bold},null,2));
