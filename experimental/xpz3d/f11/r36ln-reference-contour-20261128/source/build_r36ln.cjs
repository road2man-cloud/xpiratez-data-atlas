'use strict';
/**
 * R36LN: build a real integrated full-character GLB from published R36KZ STABLE.
 * No separate pelvis mesh, no new bones, no destructive overwrite.
 *
 * Usage: node source/build_r36ln.cjs input.glb output.glb --variant=balanced
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {sculpt}=require('./center_contour.cjs');
const clip=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{const t=clip((x-a)/(b-a));return t*t*(3-2*t)};
const len=x=>Math.hypot(...x);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=x=>{const n=len(x)||1;return x.map(v=>v/n)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const need=(test,msg)=>{if(!test)throw Error(msg)};
function build(input,output,{variant='balanced'}={}){
  need(variant==='balanced'||variant==='soft','unsupported variant');
  need(fs.existsSync(input),'input missing');
  need(!fs.existsSync(output),'output already exists');
  const src=load(input),g=src.g;
  need(g.skins?.some(s=>s.joints.length===63),'63 joint source rig missing');
  const mi=g.meshes.findIndex(m=>/R36KP_CONTINUOUS_SKIN/.test(m.name||''));
  need(mi>=0,'integrated body mesh missing');
  const prim=g.meshes[mi].primitives[0],orig=extract(src,mi,0);
  need(orig.indices.length===3360,'expected 1120 body triangles');
  let head=0;
  for(let i=0;i<g.meshes.length;i++)if(i!==mi)
    for(const p of g.meshes[i].primitives||[])head+=g.accessors[p.indices].count/3;
  need(head===968,'head/hair changed: '+head);
  const strength=variant==='balanced'?.95:.57;
  const a=sculpt(orig,orig,{strength});
  const positions=a.positions,normals=[],tangents=[];
  const oldT=prim.attributes.TANGENT==null?null:values(src,prim.attributes.TANGENT);
  const moved=positions.filter((v,i)=>Math.abs(v[1]-orig.positions[i][1])>1e-7).length;
  need(moved>=8,'source contour produced too few moved render vertices');
  for(let i=0;i<positions.length;i++){
    const [x,y,z]=positions[i],f=(1-smooth(.126,.209,Math.abs(x)))*
      smooth(.71,.79,z)*(1-smooth(1.040,1.11,z))*(1-smooth(-.045,.074,y));
    const n=unit(orig.normals[i].map((v,j)=>v*(1-f)+a.normals[i][j]*f));
    normals.push(n);
    if(oldT){
      const t=oldT[i],raw=t.slice(0,3),projection=dot(raw,n);
      const perp=raw.map((v,j)=>v-n[j]*projection);
      const fallback=Math.abs(n[2])<.89?[0,0,1]:[0,1,0];
      const fbDot=dot(fallback,n),fb=fallback.map((v,j)=>v-n[j]*fbDot);
      tangents.push([...unit(len(perp)>1e-7?perp:fb),t[3]>=0?1:-1]);
    }
  }
  const builder=new Builder(src),dest=builder.g;
  const dprim=dest.meshes[mi].primitives[0];
  dprim.attributes.POSITION=builder.addAccessor(positions,'VEC3',5126,34962);
  dprim.attributes.NORMAL=builder.addAccessor(normals,'VEC3',5126,34962);
  if(oldT)dprim.attributes.TANGENT=builder.addAccessor(tangents,'VEC4',5126,34962);
  const mat=dest.materials[dprim.material],normalScale=variant==='balanced'?.26:.18;
  need(mat?.pbrMetallicRoughness,'body PBR material absent');
  if(mat.normalTexture)mat.normalTexture.scale=normalScale;
  if(mat.occlusionTexture)mat.occlusionTexture.strength=variant==='balanced'?.36:.25;
  mat.pbrMetallicRoughness.roughnessFactor=1;
  dest.asset.generator='R36LN integrated 2088-triangle full character; original R36KZ preserved';
  dest.extras={...(dest.extras||{}),r36ln:{
    version:'R36LN',variant,base:'R36KZ_STABLE_2088_TORSO_CENTER.glb',
    sourceSHA256:src.sha,strength,
    bodyTriangles:1120,headAndHairTriangles:968,totalTriangles:2088,
    joints:63,normalTextureScale:normalScale,
    morphology:'integrated exterior local contour and seam-coherent normals',
    reference:'user supplied qualitative 2D image; no metric inference',
    preservation:'head hair skeleton skin weights UV and original textures retained',
    caveats:['not an anatomical scan','game engine appearance not yet confirmed']
  }};
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const result=builder.save(output);
  const report={
    version:'R36LN',variant,input:path.basename(input),sourceSHA256:src.sha,
    output:path.basename(output),outputSHA256:result.sha,bytes:result.bytes,
    bodyTriangles:1120,headAndHairTriangles:968,totalTriangles:2088,
    skeletonJoints:63,changedRenderVertices:moved,
    contour:a.stats.r36ln,normalTextureScale:normalScale,
    sourceMaterialsPreservedExceptSkinLighting:true,
    skinWeightsPreserved:true,UVPreserved:true,headHairPreserved:true,
    renderQA:'not run; requires reference-matched 0 and 35 degree images'
  };
  const reportPath=output.replace(/\.glb$/i,'.report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,reportPath,hash:result.sha,moved},null,2));
  return report;
}
if(require.main===module){
  try{
    const [input,output,...opts]=process.argv.slice(2);
    need(input&&output,'usage: node source/build_r36ln.cjs input.glb output.glb --variant=balanced|soft');
    const variant=(opts.find(x=>x.startsWith('--variant='))||'--variant=balanced').split('=')[1];
    build(input,output,{variant});
  }catch(e){console.error(e.stack||String(e));process.exitCode=1}
}
module.exports={build};
