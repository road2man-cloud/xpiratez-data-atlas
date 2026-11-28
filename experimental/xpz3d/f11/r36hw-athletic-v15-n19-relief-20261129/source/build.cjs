'use strict';
const fs=require('fs'),path=require('path');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [baseFile,donorFile,outFile]=process.argv.slice(2);
if(!outFile)throw Error('usage: build.cjs V14.glb N20.glb output.glb');
const base=load(baseFile),donor=load(donorFile),b=new Builder(base),prims=b.g.meshes[0].primitives;
const ci=prims.findIndex(p=>p.material===18);if(ci<0)throw Error('V14 garment absent');
const g=extract(base,0,ci),d=extract(donor,0,3),Q=d.positions;
if(g.positions.length!==706||base.g.skins[0].joints.length!==63||b.g.materials[18].alphaMode!=='OPAQUE')throw Error('unexpected source');
const minX=Math.min(...Q.map(p=>p[0])),maxX=Math.max(...Q.map(p=>p[0])),minZ=Math.min(...Q.map(p=>p[2])),maxZ=Math.max(...Q.map(p=>p[2]));
const candidate=[];
function source(p){let best=[],n=Q.length;for(let i=0;i<n;i++){const q=Q[i],dist=Math.hypot(q[0]-p[0],q[2]-p[2]);if(best.length<6){best.push([dist,q[1]]);best.sort((a,b)=>a[0]-b[0]);}else if(dist<best[5][0]){best[5]=[dist,q[1]];best.sort((a,b)=>a[0]-b[0]);}}
let y=0,s=0;for(let [dist,v] of best){let w=1/((dist+.005)**2);s+=w;y+=w*v}return {dist:best[0][0],y:y/s};}
for(let i=0;i<g.indices.length;i+=3){let ids=g.indices.slice(i,i+3),p=[0,1,2].map(k=>ids.reduce((s,id)=>s+g.positions[id][k],0)/3);
if(p[0]<minX-.015||p[0]>maxX+.015||p[2]<minZ-.015||p[2]>maxZ+.015)continue;
let v=source(p);if(v.dist<.065)candidate.push({ids,p,v});}
if(candidate.length<3)throw Error('no clothing faces adjacent to N19 center '+JSON.stringify({minX,maxX,minZ,maxZ,candidate:candidate.length}));
const offset=candidate.reduce((s,t)=>s+t.p[1]-t.v.y,0)/candidate.length;
const P=[],N=[],UV=[],C=[],J=[],W=[],I=[];
const clamp=(a,l,h)=>Math.max(l,Math.min(h,a)),norm=v=>{let s=Math.hypot(...v)||1;return v.map(x=>x/s)};
function emit(ids,bary){
let p=[0,0,0],n=[0,0,0],uv=[0,0],weights=new Map();
for(let t=0;t<3;t++){let id=ids[t],v=bary[t];for(let k=0;k<3;k++){p[k]+=g.positions[id][k]*v;n[k]+=g.normals[id][k]*v}for(let k=0;k<2;k++)uv[k]+=g.uvs[id][k]*v;
for(let k=0;k<4;k++){let j=g.joints[id][k];weights.set(j,(weights.get(j)||0)+v*g.weights[id][k]);}}
n=norm(n);let ds=source(p),rel=clamp((ds.y+offset-p[1])*.35,-.006,.010),h=.0025+Math.max(0,rel);
P.push(p.map((x,k)=>x+n[k]*h));N.push(n);UV.push(uv);
let shade=clamp(.58+rel*25,.38,.85);C.push([.75*shade+.20,.48*shade+.12,.26*shade+.08,1]);
let arr=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4);let total=arr.reduce((s,t)=>s+t[1],0)||1;while(arr.length<4)arr.push([0,0]);
J.push(arr.map(x=>x[0]));W.push(arr.map(x=>x[1]/total));return P.length-1;}
for(let t of candidate){let a=emit(t.ids,[1,0,0]),b=emit(t.ids,[0,1,0]),c=emit(t.ids,[0,0,1]),ab=emit(t.ids,[.5,.5,0]),bc=emit(t.ids,[0,.5,.5]),ca=emit(t.ids,[.5,0,.5]);I.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
const mat=JSON.parse(JSON.stringify(b.g.materials[18]));mat.name='N19-inspired opaque woven panel';mat.alphaMode='OPAQUE';mat.doubleSided=true;mat.pbrMetallicRoughness={baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.9};
let mi=b.g.materials.push(mat)-1;
prims.push({material:mi,indices:b.addAccessor(I,'SCALAR',5123,34963),attributes:{POSITION:b.addAccessor(P,'VEC3',5126,34962),NORMAL:b.addAccessor(N,'VEC3',5126,34962),TEXCOORD_0:b.addAccessor(UV,'VEC2',5126,34962),COLOR_0:b.addAccessor(C,'VEC4',5126,34962),JOINTS_0:b.addAccessor(J,'VEC4',5123,34962),WEIGHTS_0:b.addAccessor(W,'VEC4',5126,34962)},extras:{opaqueFabric:true,source:'N19 center geometry',donorMeshIncluded:false}});
b.g.asset.generator='R36HW athletic V15 N19 relief';b.g.extras={...(b.g.extras||{}),athleticV15:{base:'V14',source:'N19 center',opaqueFabric:true}};
fs.mkdirSync(path.dirname(outFile),{recursive:true});let saved=b.save(outFile),tri=prims.reduce((s,p)=>s+b.g.accessors[p.indices].count/3,0);
const report={baseSha256:base.sha,donorSha256:donor.sha,baseTriangles:2100,triangles:tri,addedTriangles:I.length/3,panelVertices:P.length,sourceFaces:candidate.length,donorCenterVertices:Q.length,opaque:true,originalV14PrimitivesRetained:true,rigJoints:63,outputSha256:saved.sha,nativeS2Rendered:false,visualAcceptance:false};
let rp=path.resolve(path.dirname(outFile),'../reports/build.json');fs.mkdirSync(path.dirname(rp),{recursive:true});fs.writeFileSync(rp,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));