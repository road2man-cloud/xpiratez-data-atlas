#!/usr/bin/env node
'use strict';
// R36HW V13-based exposed-body prototype: V13 is the only full-body source.
// N21 contributes local central-anatomy surface, never N-series body or silhouette.
// All generation happens in GitHub Actions using Node.js, not on the user's PC.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [v13file,n21file,outfile]=process.argv.slice(2);
if(!outfile)throw Error('usage: node build.cjs V13.glb N21.glb OUTPUT.glb');
const v13=load(v13file),n=load(n21file);
const expectedV13='b48db6db2cdf0bdc40ba684550125a339167a2c6';
const glbGitBlob=(data)=>crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
if(glbGitBlob(v13.raw)!==expectedV13)throw Error('V13 source does not match user-selected immutable commit');
const g=v13.g;
if(g.meshes.length!==1||g.meshes[0].primitives.length!==6||g.meshes[0].primitives[5].material!==18)throw Error('unexpected V13 layout');
if(g.skins[0].joints.length!==63||n.g.skins[0].joints.length!==63)throw Error('incompatible rig joint count');
const tri=q=>q.g.meshes.reduce((s,m)=>s+m.primitives.reduce((p,a)=>p+q.g.accessors[a.indices].count/3,0),0);
if(tri(v13)!==2100||tri(n)!==2099)throw Error('unexpected base budgets');
// Compare skeleton reference by joint node names. Transform identities must also agree.
const sig=q=>q.g.skins[0].joints.map(i=>q.g.nodes[i]?.name??'').join('|');
if(sig(v13)!==sig(n))throw Error('joint index mapping differs: cannot transplant skinned N center safely');
const refsV=values(v13,v13.g.skins[0].inverseBindMatrices),refsN=values(n,n.g.skins[0].inverseBindMatrices);
if(refsV.length!==refsN.length||refsV.some((m,i)=>m.some((x,k)=>Math.abs(x-refsN[i][k])>1e-5)))
  throw Error('inverse bind matrices mismatch');
const base=extract(v13,0,5),center=extract(n,0,3),model=extract(v13,0,2);
if(base.positions.length!==706||center.indices.length!==1089||center.positions.length!==240)
  throw Error('unexpected V13 or center geometry');
const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const minus=(a,b)=>a.map((v,k)=>v-b[k]);
const norm=v=>Math.hypot(...v);
const sign=(a,b)=>{let aa=cross(minus(a[1],a[0]),minus(a[2],a[0])),bb=cross(minus(b[1],b[0]),minus(b[2],b[0]));return aa.reduce((s,v,i)=>s+v*bb[i],0)/(norm(aa)*norm(bb)||1)};
// Preserve the full V13 garment-derived surface topology and contours.
// Reassign its material to skin. V13's separate 112-triangle exposed-skin primitive stays.
// V13 textile's UV/TANGENT are no longer needed by the skin material, but are retained as source data.
const builder=new Builder(v13),pr=builder.g.meshes[0].primitives,body=pr[5];
body.material=8;
const rawColors=base.colors;
if(!rawColors||!model.colors)throw Error('missing skin colors');
const meanSkin=Array.from({length:4},(_,k)=>model.colors.reduce((s,c)=>s+c[k],0)/model.colors.length);
const colorRows=rawColors.map((c)=>c.map((v,k)=>k===3?1:clamp(meanSkin[k],0,1)));
body.attributes.COLOR_0=builder.addAccessor(colorRows,'VEC4',5126,34962);
// Remove textile-only normal mapping via skin material. The V13 geometry is unmodified here.
// Isolate an N-series center patch (pelvic front), avoiding N-series torso/leg surfaces.
// The patch lies in front of V13, using N21 actual positions, UV, rig weights and normals.
const mid=[-.145,.145],zmin=.780,zmax=1.023;
const cInd=center.indices,cp=center.positions;
const patchFaces=[];
for(let t=0;t<cInd.length;t+=3){
 const ids=cInd.slice(t,t+3),p=ids.map(i=>cp[i]);
 const centroid=[0,1,2].map(k=>p.reduce((s,v)=>s+v[k],0)/3);
 if(Math.abs(centroid[0])>.105||centroid[2]<.795||centroid[2]>.995||centroid[1]>-.022)continue;
 if(p.some(v=>v[0]<mid[0]||v[0]>mid[1]||v[2]<zmin||v[2]>zmax||v[1]>.018))continue;
 patchFaces.push(ids);
}
if(patchFaces.length<6)throw Error('N center region extraction yielded too few triangles: '+patchFaces.length);
// All V13 body faces overlapping the narrow front central region are eligible for removal.
// Keep the entire outside silhouette and all V13 body positions, skin weights, UV.
const bInd=base.indices,bP=base.positions;
const cut=new Set();
for(let t=0;t<bInd.length;t+=3){
 const ids=bInd.slice(t,t+3),P=ids.map(i=>bP[i]);
 const c=[0,1,2].map(k=>P.reduce((s,v)=>s+v[k],0)/3);
 if(Math.abs(c[0])<.11&&c[2]>.800&&c[2]<1.020&&c[1]<-.017)cut.add(t/3);
}
if(cut.size<6)throw Error('V13 front-center fabric cut selected too few triangles: '+cut.size);
// Limit patch growth to 2,100 triangle budget. Keep patches prioritized at anatomical center.
// A sparse extracted patch is explicitly reported as an open topological seam pending repair.
const available=cut.size;
const ordered=patchFaces.slice().sort((a,b)=>{
 const score=f=>{const p=f.map(i=>cp[i]),c=[0,1,2].map(k=>p.reduce((s,x)=>s+x[k],0)/3);return Math.abs(c[0])*.65+Math.abs(c[2]-.893)*.35};
 return score(a)-score(b);
});
const retained=ordered.slice(0,Math.min(available,ordered.length));
if(retained.length<6)throw Error('insufficient patch faces under triangle budget');
const bodyIndices=[];
for(let t=0;t<bInd.length;t+=3)if(!cut.has(t/3))bodyIndices.push(...bInd.slice(t,t+3));
body.indices=builder.addAccessor(bodyIndices.map(i=>[i]),'SCALAR',5125,34963);
// Center faces share their source N21 coordinates and skinning values without remapping.
// New accessor arrays are emitted into V13's buffer; no N21 body primitive is copied.
const used=[...new Set(retained.flat())].sort((a,b)=>a-b),remap=new Map(used.map((id,i)=>[id,i]));
const copy=rows=>used.map(i=>rows[i]);
const patch={
 attributes:{
  POSITION:builder.addAccessor(copy(center.positions),'VEC3',5126,34962),
  NORMAL:builder.addAccessor(copy(center.normals),'VEC3',5126,34962),
  JOINTS_0:builder.addAccessor(copy(center.joints),'VEC4',5123,34962),
  WEIGHTS_0:builder.addAccessor(copy(center.weights),'VEC4',5126,34962),
  COLOR_0:builder.addAccessor(copy(center.colors||center.positions.map(()=>meanSkin)).map(c=>c.map(v=>clamp(v,0,1))),'VEC4',5126,34962)
 },
 indices:builder.addAccessor(retained.flatMap(f=>f.map(i=>[remap.get(i)])),'SCALAR',5125,34963),
 material:8,mode:4,
 extras:{origin:'R36HW N21 center only',sourcePrimitive:3,fullBodySource:'V13 WARM OCHRE immutable bde014a9',visibleTopologyMayBeOpen:true}
};

pr.push(patch);
builder.g.asset.generator='R36HW V13 BODY + N21 LOCAL CENTER v1';
builder.g.extras={...builder.g.extras,r36hwV13NCenter:{bodySource:'V13 compact @bde014a9',anatomySource:'N21 primitive 3 only',nBodyPrimitivesCopied:0,visualAcceptance:false}};
const newTris=pr.reduce((s,p)=>s+builder.g.accessors[p.indices].count/3,0);
if(newTris>2100)throw Error('triangle budget exceeded: '+newTris);
if(pr[0].material!==0||pr[1].material!==1||pr[2].material!==8)throw Error('V13 identity material changed');
if(pr[5].attributes.POSITION!==v13.g.meshes[0].primitives[5].attributes.POSITION)throw Error('V13 body POS accessor replaced');
for(const name of ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']){
 if(pr[5].attributes[name]!==v13.g.meshes[0].primitives[5].attributes[name])throw Error('V13 body '+name+' replaced');
}
fs.mkdirSync(path.dirname(outfile),{recursive:true});const saved=builder.save(outfile);
const boundaryCounts=(faces)=>{const e=new Map();for(const f of faces)for(const [a,b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){let k=Math.min(a,b)+','+Math.max(a,b);e.set(k,(e.get(k)||0)+1)}return [...e.values()].filter(v=>v===1).length};
// Preserve an exact record of the V13 silhouette and the N-only center edit.
const sourceV13Positions=base.positions.length,sourceV13Indices=base.indices.length;
const outputCenterIsDistinctPrimitive=pr[pr.length-1].extras?.sourcePrimitive===3;
if(!outputCenterIsDistinctPrimitive)throw Error('N21 center source tracking lost');
const audit={profile:'R36HW V13 BODY + N21 CENTRAL ANATOMY',version:1,bodySourceCommit:'8c68b4ddde2696674a533216c20bbb62d46242d3',v13SourceSha256:v13.sha,n21SourceSha256:n.sha,outputSha256:saved.sha,outputBytes:saved.bytes,bodyPrimitive5PositionsExactlyPreserved:true,bodyPrimitive5NormalsExactlyPreserved:true,bodyPrimitive5RigExactlyPreserved:true,nonBodyHeadHairExactlyPreserved:true,NSeriesBodyCopied:false,centralPatchFromN21:true,rigJoints:63,trianglesBefore:tri(v13),trianglesAfter:newTris,V13RemovedFrontCenterTriangles:cut.size,N21CenterPatchTriangles:retained.length,N21EligibleTriangles:patchFaces.length,N21PatchVertices:used.length,patchOpenEdges:boundaryCounts(retained),V13SkinMaterialApplied:true,V13SkinVertexColorsFromV13ExposedSkin:true, limitations:['V13 is an outfit-derived silhouette: skin material conversion alone does not guarantee anatomical body topology','Central-patch perimeter is not welded into V13 base; N21 geometry may produce boundary discontinuities','Patch currently uses extracted N21 triangles within a budget, not a seamless body retopology','Normals and UV bake not reauthored; native S2 posed render and artistic acceptance pending']};
const report=path.resolve(path.dirname(outfile),'../reports/build.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit,null,2));
