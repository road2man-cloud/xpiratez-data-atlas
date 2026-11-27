'use strict';
/* Read-only, dependency-free R36LA/R36LC GLB geometry comparison. Node.js only.
 * Run: node compare_models.cjs <path-to-R36LA.glb> <path-to-R36LC.glb>
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {load,values}=require('../r36lc-atlas-20261128/source/glb_io.cjs');
const root=path.resolve(__dirname,'..');
const defaults=[
 path.join(root,'r36la-surface-flow-20261128','output','R36LA_STABLE_2100_SURFACE_FLOW.glb'),
 path.join(root,'r36lc-atlas-20261128','output','stable','R36LC_BALANCED_SKIN_2100TRI.glb')
];
function sha(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function fail(msg){throw Error(msg);}
function loadSelected(file,isLC){
 if(fs.existsSync(file))return load(file);
 if(!isLC)fail('R36LA GLB not found: '+file);
 const dir=path.join(root,'r36lc-atlas-20261128');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'ARTIFACTS.json'),'utf8'));
 const wanted=manifest.files.find(x=>x.output.endsWith('R36LC_BALANCED_SKIN_2100TRI.glb'));
 if(!wanted)fail('Missing expected R36LC archive declaration');
 const chunks=wanted.parts.map(x=>fs.readFileSync(path.join(dir,x.path)));
 const binary=Buffer.concat(chunks);
 if(binary.length!==wanted.bytes||sha(binary)!==wanted.sha256)fail('R36LC archive checksum mismatch');
 // Temporary output is kept in the R36LD local working folder, not the original archive.
 const scratch=path.join(__dirname,'.r36ld_compare_cache');
 fs.mkdirSync(scratch,{recursive:true});
 const target=path.join(scratch,'R36LC_BALANCED_SKIN_2100TRI.glb');
 if(!fs.existsSync(target)){fs.writeFileSync(target,binary);}
 else if(sha(fs.readFileSync(target))!==wanted.sha256)fail('Refusing mismatched existing R36LD cache');
 return load(target);
}
function inspect(q){
 const candidates=[];
 for(let mi=0;mi<(q.g.meshes||[]).length;mi++){
  const mesh=q.g.meshes[mi];
  for(let pi=0;pi<(mesh.primitives||[]).length;pi++){
   const p=mesh.primitives[pi];
   if(p.indices==null||p.attributes.POSITION==null)continue;
   const inds=values(q,p.indices).map(a=>a[0]);
   const pos=values(q,p.attributes.POSITION);
   candidates.push({name:mesh.name||'',mi,pi,triangles:inds.length/3,vertexCount:pos.length,pos,
    normals:p.attributes.NORMAL==null?null:values(q,p.attributes.NORMAL),
    uv:p.attributes.TEXCOORD_0==null?null:values(q,p.attributes.TEXCOORD_0),
    indices:inds,skinned:p.attributes.JOINTS_0!=null&&p.attributes.WEIGHTS_0!=null});
  }
 }
 const body=candidates.find(x=>x.triangles===1132)||candidates.sort((a,b)=>b.triangles-a.triangles)[0];
 if(!body)fail('No mesh found in '+q.file);
 const budget=q.g.extras?.r36kp?.budget||null;
 return {file:q.file,bytes:q.raw.length,sha256:q.sha,body,candidates,budget,skinJoints:(q.g.skins||[]).map(x=>x.joints?.length||0)};
}
function vecDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
function statistics(v){
 if(!v.length)return {count:0};
 const sorted=v.slice().sort((a,b)=>a-b),sum=v.reduce((a,b)=>a+b,0);
 const at=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
 return {count:v.length,mean:sum/v.length,median:at(.5),p95:at(.95),max:at(1)};
}
function comparison(a,b){
 const aligned=a.body.vertexCount===b.body.vertexCount &&
 a.body.indices.length===b.body.indices.length &&
 a.body.indices.every((v,i)=>v===b.body.indices[i]);
 const result={format:'R36LD_MODEL_COMPARISON_V1',source:'actual GLB geometry, not render',timestamp:new Date().toISOString(),
  LA:{file:a.file,bytes:a.bytes,sha256:a.sha256,budget:a.budget,
    mesh:a.body.name,bodyTriangles:a.body.triangles,bodyVertices:a.body.vertexCount,
    skins:a.skinJoints,bodySkinned:a.body.skinned},
  LC:{file:b.file,bytes:b.bytes,sha256:b.sha256,budget:b.budget,
    mesh:b.body.name,bodyTriangles:b.body.triangles,bodyVertices:b.body.vertexCount,
    skins:b.skinJoints,bodySkinned:b.body.skinned},
  alignedTopology:aligned,engineApplied:false,
  note:'Mesh-space comparison. No proof of runtime lighting, texture shading, deformation stability, or S2 engine correctness.'};
 if(aligned){
  result.vertexDelta=statistics(a.body.pos.map((v,i)=>vecDist(v,b.body.pos[i])));
  if(a.body.normals&&b.body.normals&&a.body.normals.length===b.body.normals.length){
   result.normalAngleDeg=statistics(a.body.normals.map((v,i)=>{
    const w=b.body.normals[i],dot=v.reduce((acc,t,k)=>acc+t*w[k],0);
    const length=Math.hypot(...v)*Math.hypot(...w);
    return Math.acos(Math.max(-1,Math.min(1,length?dot/length:1)))*180/Math.PI;
   }));
  }
  if(a.body.uv&&b.body.uv&&a.body.uv.length===b.body.uv.length)
   result.uvDelta=statistics(a.body.uv.map((v,i)=>Math.hypot(v[0]-b.body.uv[i][0],v[1]-b.body.uv[i][1])));
 }else{
  result.unalignedNote='Topology/index order differs: do not assume vertex-to-vertex correspondence; inspect via a spatial nearest-surface metric.';
 }
 return result;
}
try{
 const args=process.argv.slice(2),a=inspect(loadSelected(path.resolve(args[0]||defaults[0]),false)),
 b=inspect(loadSelected(path.resolve(args[1]||defaults[1]),true));
 const out=comparison(a,b);
 if(process.argv.includes('--write')){const target=path.join(__dirname,'R36LD_GEOMETRY_COMPARE.json');fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n');console.log('WROTE',target);}
 console.log(JSON.stringify(out,null,2));
}catch(e){console.error(e.stack||e);process.exitCode=1;}
