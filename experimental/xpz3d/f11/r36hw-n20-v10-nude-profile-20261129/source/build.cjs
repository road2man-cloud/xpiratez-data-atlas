#!/usr/bin/env node
'use strict';
// N20: N19 is the anatomical source of truth. V9->V10 garment contour deltas
// are an indirect, bounded reference for non-pelvic body surfaces ONLY.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [n19file,v9file,v10file,outfile]=process.argv.slice(2);
if(!outfile)throw Error('usage: node build.cjs N19.glb V9.glb V10.glb N20.glb');
const n19=load(n19file),v9=load(v9file),v10=load(v10file);
const prim=q=>q.g.meshes[0].primitives.findIndex(p=>p.material===18);
const gi9=prim(v9),gi10=prim(v10);
if(gi9<0||gi10<0)throw Error('missing athletic garment material');
const old=extract(v9,0,gi9),now=extract(v10,0,gi10);
if(old.positions.length!==674||now.positions.length!==706)throw Error('unexpected athletic garment topology');
const tris=q=>q.g.meshes[0].primitives.reduce((s,p)=>s+q.g.accessors[p.indices].count/3,0);
if(tris(n19)!==2099||tris(v10)!==2100||n19.g.skins[0].joints.length!==63)throw Error('source budget or rig mismatch');
const deltas=old.positions.map((p,i)=>now.positions[i].map((x,k)=>x-p[k]));
const mag=x=>Math.hypot(...x),sub=(a,b)=>a.map((x,k)=>x-b[k]);
const b=new Builder(n19),audit={profile:'R36HW N20 V10-BODY N19-CENTER',baseSha256:n19.sha,v9Sha256:v9.sha,v10Sha256:v10.sha,sourceBodyPrimitive:6,protectedCenterPrimitive:3,originalTriangles:tris(n19),rigJoints:63,changedVertices:0,maxMoveMeters:0,meanMoveMeters:0,unmatchedVertices:0,unchangedPelvis:true,clothGeometryNotCopied:true,method:'four-nearest inverse-distance V9-to-V10 offsets; bounded anatomy-region transfer'};
const target=6,body=extract(n19,0,target);const P=body.positions.map(p=>p.slice()),N=body.normals;
let sum=0;
for(let i=0;i<P.length;i++){
 const p=P[i],x=Math.abs(p[0]),z=p[2];
 // Protect complete pelvic band and its connection zones.
 if(z<.16||z>1.52||(z>.79&&z<1.095)||x>.66)continue;
 const candidates=[];
 for(let j=0;j<old.positions.length;j++){
  const a=old.positions[j];if(Math.abs(a[2]-z)>.085)continue;
  const d=mag(sub(a,p));
  if(d>.072)continue;
  if(candidates.length<4){candidates.push([d,j]);candidates.sort((a,b)=>a[0]-b[0]);}
  else if(d<candidates[3][0]){candidates[3]=[d,j];candidates.sort((a,b)=>a[0]-b[0]);}
 }
 if(candidates.length<3){audit.unmatchedVertices++;continue;}
 const closest=candidates[0][0];if(closest>.045){audit.unmatchedVertices++;continue;}
 let v=[0,0,0],weight=0;
 for(const [d,j] of candidates){const w=1/Math.pow(d+.006,2);weight+=w;for(let k=0;k<3;k++)v[k]+=deltas[j][k]*w;}
 v=v.map(c=>c/weight);
 // Skin body shaping is conservative: do not transfer fabric-only protrusions.
 let fade=1;
 if(z<.23)fade=Math.max(0,(z-.16)/.07);
 if(z>.70&&z<.79)fade=Math.max(0,(z-.70)/.09);
 if(z>1.095&&z<1.15)fade=Math.max(0,(z-1.095)/.055);
 if(z>1.46)fade*=Math.max(0,(1.52-z)/.06);
 if(x>.57)fade*=Math.max(0,(.66-x)/.09);
 // Mean depth transfer only; sharp textile contour ridges are suppressed.
 let step=v.map(c=>c*.58*fade);
 const limit=.0055,size=mag(step);
 if(size>limit)step=step.map(c=>c*limit/size);
 const dist=mag(step);if(dist<.00001)continue;
 P[i]=p.map((c,k)=>c+step[k]);
 audit.changedVertices++;audit.maxMoveMeters=Math.max(audit.maxMoveMeters,dist);sum+=dist;
}
audit.meanMoveMeters=audit.changedVertices?sum/audit.changedVertices:0;
if(audit.changedVertices<8)throw Error('Body not modified; incompatible V9/N19 coordinates: '+JSON.stringify(audit));
b.g.meshes[0].primitives[target].attributes.POSITION=b.addAccessor(P,'VEC3',5126,34962);
b.g.meshes[0].primitives[target].extras={...b.g.meshes[0].primitives[target].extras,n20:'V10 contour adaptation only, pelvic primitive protected'};
b.g.asset.generator='R36HW N20 V10 profile over N19 anatomy';
b.g.extras={...b.g.extras,r36hwN20:{source:'N19',bodyContour:'V10 via V9',centralAnatomy:'N19 unmodified',visualAcceptance:false}};
if(tris({g:b.g})!==2099)throw Error('triangle count modified');
fs.mkdirSync(path.dirname(outfile),{recursive:true});
const saved=b.save(outfile);
audit.outputSHA256=saved.sha;audit.outputBytes=saved.bytes;
audit.limitations=['N19 pelvic topology and V-shaped inherited artifacts remain; separate patch required','V10 garment contours are artistic estimates, not a nude anatomy ground truth','No new skin UV/texture bake; normal re-bake and native S2 render pending','Body primitive only; pose-dependent clipping not tested'];
const report=path.resolve(path.dirname(outfile),'../reports/build.json');
fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit,null,2));