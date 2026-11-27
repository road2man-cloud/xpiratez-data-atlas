'use strict';
// R36KP: posterior/superior anatomy embedded in a single watertight skinned body.
// Runtime budget: exact R36HW head 968 + body 1120 = 2088 triangles.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,values,extract,Builder}=require('./glb_io.cjs');
const {simplify}=require('./mesh_qem.cjs');
const {refineAttachedBody}=require('./reallocate_floor.cjs');
const {regularize}=require('./floor_regularize.cjs');
const {sculpt}=require('./reference_sculpt.cjs');
const {sculptChest}=require('./chest_volume.cjs');
const {flow}=require('./surface_flow.cjs');
const {bake,buildBVH}=require('./bake_atlas.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const shaFile=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function ensure(x,s){if(!x)throw Error(s);}
async function build(){
 const [hwFile,donorFile,folder,...opts]=process.argv.slice(2);
 ensure(hwFile&&donorFile&&folder,'usage: node build_r36kp.cjs R36HW.glb R36JB.glb OUT_DIR [--atlas=2048] [--geometry-only]');
 const atlas=Number((opts.find(x=>x.startsWith('--atlas='))||'--atlas=2048').split('=')[1]);
 const variant=(opts.find(x=>x.startsWith('--variant='))||'--variant=balanced').split('=')[1];
 ensure(['balanced','soft','bold'].includes(variant),'variant must be balanced, soft, or bold');
 ensure([512,1024,2048].includes(atlas),'invalid resolution');
 ensure(!fs.existsSync(folder),'output already exists');
 const dir=path.resolve(folder);fs.mkdirSync(dir,{recursive:true});
 const a=load(hwFile),b=load(donorFile);
 ensure(a.sha==='a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732','R36HW source changed');
 ensure(b.sha==='f6b53320cc9eb43f870957a8d3db6b067a18aaa3a3feb2a85463cfc3e36c041d','R36JB source changed');
 const headParts=[0,1,7,11,12],headTris=headParts.reduce((s,k)=>s+a.g.accessors[a.g.meshes[0].primitives[k].indices].count/3,0);
 ensure(headTris===968&&a.g.skins[0].joints.length===63,'authoritative head/rig mismatch');
 const bodySource=extract(b,2,0),highA=extract(b,3,0),highB=extract(b,3,1);
 const merge=(u,v)=>{const z={};for(const k of ['positions','normals','uvs','colors','joints','weights'])z[k]=[...(u[k]||[]),...(v[k]||[])];z.indices=[...u.indices,...v.indices.map(x=>x+u.positions.length)];return z;};
 const core=merge(highA,highB);
 const reduction=simplify(bodySource,880,{strictLink:true,focusPelvis:true,regionMultiplier:5,normalLimit:-.2});
 const raw=refineAttachedBody(reduction,bodySource,core,{edgeSplits:126,chestSplits:24,posterior:.020,superior:.026,reliefMax:.008});
 const tuning=variant==='soft'?{flips:20,minGain:.040,passes:3,alpha:.20,maxDisplacement:.0025,stepCap:.0011}:{flips:42,minGain:.027,passes:7,alpha:.29,maxDisplacement:.006,stepCap:.0018};
 const cleaned=regularize(raw,tuning);
 ensure(cleaned.stats.floorRegularize.after.floor.mean>=cleaned.stats.floorRegularize.before.floor.mean-.0001,'floor-quality regression');
 const center=sculpt(cleaned,bodySource,core,{strength:variant==='bold'?1.7:variant==='balanced'?1:.55,posterior:.020,superior:.026,maxRelief:.015});
 const chest=sculptChest(center,bodySource,{strength:variant==='bold'?1.20:variant==='balanced'?1:.70,maxMove:.038});
 const m=flow(chest,bodySource,{weight:variant==='bold'?.45:.32,iterations:variant==='bold'?3:2});
 console.log('SURFACE_FLOW',JSON.stringify(m.stats.surfaceFlow));
 console.log('CENTER_SCULPT',JSON.stringify(m.stats.centerSculpt));
 console.log('CHEST_VOLUME',JSON.stringify(m.stats.chestVolume));
 const budget={head:headTris,body:m.indices.length/3,total:headTris+m.indices.length/3,limit:2100};
 ensure(budget.total===2100&&budget.body===1132&&m.stats.boundaryEdges===0,'2,100 watertight triangle target failed');
 fs.writeFileSync(path.join(dir,'GEOMETRY_REPORT.json'),JSON.stringify({budget,body:m.stats,sources:{head:a.sha,donor:b.sha}},null,2)+'\n');
 console.log('R36KP_BODY',JSON.stringify({budget,topology:m.stats}));
 if(opts.includes('--geometry-only'))return;
 const textureDir=path.join(dir,'textures');
 const result=bake(m,bodySource,{name:'body',folder:textureDir,size:atlas,artStyle:'R36HW-DESIGNED-INK-EDGES',coreSource:core,onProgress:x=>{if(x.trianglesDone%280===0)console.log('BAKE',x.trianglesDone,'/',x.trianglesTotal)}});
 const builder=new Builder(a),g=builder.g;
 ensure(g.meshes.length===1&&g.nodes[64].children.join(',')==='0,63'&&g.nodes[63].skin===0,'R36HW hierarchy changed');
 g.meshes[0].primitives=headParts.map(i=>clone(g.meshes[0].primitives[i]));
 g.meshes[0].name='R36KP_R36HW_FACE_HAIR_UNALTERED';
 const ibm=values(b,b.g.skins[0].inverseBindMatrices).slice(0,63);
 const skinId=g.skins.push({name:'R36KP_BODY_R36JB_63_JOINTS',joints:g.skins[0].joints.slice(),skeleton:g.skins[0].skeleton,inverseBindMatrices:builder.addAccessor(ibm,'MAT4',5126)})-1;
 const map={};for(const type of ['color','normal','orm'])map[type]=builder.addTexture('body_'+type,fs.readFileSync(result.paths[type]));
 const mat=g.materials.push({name:'R36KP_BAKED_SKIN_2048',doubleSided:true,
  pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:map.color},metallicFactor:0,roughnessFactor:1,metallicRoughnessTexture:{index:map.orm}},
  normalTexture:{index:map.normal},occlusionTexture:{index:map.orm,strength:.65}})-1;
 const d=result.inputs;
 const attributes={POSITION:builder.addAccessor(d.positions,'VEC3',5126,34962),NORMAL:builder.addAccessor(d.normals,'VEC3',5126,34962),
  TANGENT:builder.addAccessor(d.tangents,'VEC4',5126,34962),TEXCOORD_0:builder.addAccessor(d.uvs,'VEC2',5126,34962),
  JOINTS_0:builder.addAccessor(d.joints,'VEC4',5123,34962),WEIGHTS_0:builder.addAccessor(d.weights,'VEC4',5126,34962)};
 const mesh=g.meshes.push({name:'R36KP_CONTINUOUS_SKIN_WITH_POSTERIOR_SUPERIOR_CORE',primitives:[{attributes,indices:builder.addAccessor(d.indices,'SCALAR',5123,34963),material:mat,mode:4}]})-1;
 const node=g.nodes.push({name:'R36KP_GAME_SKIN_WITH_EMBEDDED_ANATOMY',mesh,skin:skinId})-1;
 g.nodes[64].children.push(node);g.scene=0;
 g.asset.generator='R36LC 2100 triangle continuous silhouette and smooth donor-normal flow';
 g.extras={...(g.extras||{}),r36kp:{version:'R36KP',budget,method:'single manifold body + posterior/superior donor reference',
  posterior:+.020,superior:+.026,coreSourceTriangles:6044,atlasResolution:atlas,topologicallyClosedBody:true,
  looseCenterAnatomySurface:false,bodyNode:node,headPrimitivesPreserved:true,
  caveats:['Anatomical surface is approximated within 1120 body triangles','No exact 6044-triangle core silhouette preserved','Game engine animation and shading unverified'],
  sourceSHA256:{head:a.sha,donor:b.sha}},r36la:{version:'R36LC',variant,stage:'2100-triangle remapped floor and high-poly normal-flow candidate',
  surfaceFlow:m.stats.surfaceFlow,
  chestVolume:m.stats.chestVolume,
  centerSculpt:m.stats.centerSculpt,
  optimization:m.stats.floorRegularize,artSource:'R36KW',
  floorAllocation:m.stats.splitAllocation,triangles:budget.total,materialTextures:['2048 color','2048 high-poly tangent normals','2048 ORM'],
  painter:'R36KW authored bind-space contours + high-poly source rebake',
  visualQA:'pending actual camera comparison',artStatistics:result.artReport,productionIntent:'5 deliberately drawn color layers + bind-space contours + high-poly normals',
  caveats:['UV triangle islands remain; texture seams are mitigated by world-space painting','High-poly source not fully recreated as geometry','Do not promote without comparing 35-degree abduction to R36KP']}};
 const glb=builder.save(path.join(dir,'R36LC_'+variant.toUpperCase()+'_2100_SURFACE_FLOW.glb'));
 const report={version:'R36LC',variant,glb,budget,topology:m.stats,atlas,bakeStats:{...result,inputs:undefined},
  sourceSHA256:{head:a.sha,donor:b.sha},engineApplied:false};
 fs.writeFileSync(path.join(dir,'PRODUCTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log('R36KP_OUTPUT',JSON.stringify({glb,budget,atlas}));
}
build().catch(e=>{console.error(e.stack||e);process.exitCode=1});
