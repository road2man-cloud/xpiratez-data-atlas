'use strict';
/*
 * R36LC continuous world-space gutters + verifiable seam metrics.
 * Operates on pinned R36LB (local Git commit) without modifying it.
 * Uses Node.js only, no Windows Python.
 */
const fs=require('fs'), path=require('path'), child=require('child_process'), zlib=require('zlib'), crypto=require('crypto');
const repo='D:/daphne_auto/F11_Web_Review_ghpages_20261105/f11/r36ko-seam-integrated-20261127/github_publish_stage';
const home='D:/daphne_auto/R36LC_ATLAS_20261128';
const ref='42514903828cb464a67be0320187cf16c4e48c22';
const prior='experimental/xpz3d/f11/r36lb-center-texture-20261128';
const sourceDir=path.join(home,'source'), outputDir=path.join(home,'output');
const hw='D:/daphne_auto/F11_Web_Review_ghpages_20261105/f11/R36HW-CLOTH-PANEL/R36HW_F11_CLOTHED.glb';
const donor=path.join(repo,'experimental/xpz3d/f11/r36kp/reference/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb');
function need(v,msg){if(!v)throw Error(msg);}
function git(args){return child.execFileSync('git',['-c','safe.directory=*','-C',repo].concat(args),{maxBuffer:25*1024*1024});}
function gitFile(rel){const full=prior+'/'+rel;return git(['show',ref+':'+full]);}
function change(file,before,after) {
 const p=path.join(sourceDir,file),s=fs.readFileSync(p,'utf8');
 need(s.includes(before),'Source signature missing: '+file+': '+before.slice(0,80));
 need(s.indexOf(before)===s.lastIndexOf(before),'Ambiguous replacement: '+file);
 fs.writeFileSync(p,s.replace(before,after));
}
function prepare(){
 need(!fs.existsSync(sourceDir),'R36LC source exists: refuse to overwrite');
 fs.mkdirSync(sourceDir,{recursive:true});
 const names=git(['ls-tree','-r','--name-only',ref,prior+'/source']).toString('utf8').split(/\r?\n/).filter(Boolean);
 for(const name of names){need(name.startsWith(prior+'/source/'),'Unexpected source path');
   fs.writeFileSync(path.join(sourceDir,path.basename(name)),git(['show',ref+':'+name]));
 }
 fs.mkdirSync(path.join(home,'baseline'),{recursive:true});
 for(const f of ['body_color_2048.png','body_orm_2048.png']){
  fs.writeFileSync(path.join(home,'baseline',f),gitFile('output/balanced/textures/'+f));
 }
 const b=path.join(sourceDir,'build_floor.cjs');
 fs.writeFileSync(b,fs.readFileSync(b,'utf8').replaceAll('R36LB','R36LC'));
 const a=path.join(sourceDir,'pelvis_skin_anchor.cjs');
 fs.writeFileSync(a,fs.readFileSync(a,'utf8').replaceAll('R36LB','R36LC'));
 const begin='  // Fill unused atlas pixels with the nearest texel on this triangle, so';
 const end='  if(onProgress&&fi%100===0)';
 const f=path.join(sourceDir,'bake_atlas.cjs');let s=fs.readFileSync(f,'utf8');
 const start=s.indexOf(begin),finish=s.indexOf(end,start);
 need(start>=0&&finish>start,'R36LB bake gutter block changed');
 const improved=[
 '  // R36LC: bake albedo + ORM across UV gutters from the SAME bind-space',
 '  // world position on the nearest triangle boundary, rather than copying',
 '  // arbitrary interior texels 1-2 pixels away. This makes adjacent UV',
 '  // islands evaluate the same pigment where their geometry meets.',
 '  for(let dy=0;dy<tile;dy++)for(let dx=0;dx<tile;dx++){',
 '   const origU=(dx+0.5-pad)/span,origV=(dy+0.5-pad)/span;',
 '   if(origU>=0&&origV>=0&&origU+origV<=1)continue;',
 '   const projected=nearestSimplex(origU,origV);',
 '   const u=projected[0],v=projected[1],w=[1-u-v,u,v];',
 '   const pos=[0,1,2].map(j=>P.reduce((acc,p,k)=>acc+p[j]*w[k],0));',
 '   const ln=normal([0,1,2].map(j=>N.reduce((acc,n,k)=>acc+n[j]*w[k],0)));',
 '   const dest=((y0+dy)*size+(x0+dx))*4;',
 '   if(artStyle){',
 '    const pigment=art.palette(pos,ln,null,coreBVH?art.coreRegion(pos):0,0);',
 '    for(let j=0;j<3;j++)color[dest+j]=encode(art.colorLinearToSRGB(pigment.linear[j]));',
 '    color[dest+3]=255;',
 '    orm[dest]=encode(pigment.ao);orm[dest+1]=encode(pigment.rough);',
 '    orm[dest+2]=0;orm[dest+3]=255;',
 '    stats.worldGutterPixels++;',
 '   }',
 '   // Keep high-poly donor detail in normal/height via nearest inward',
 '   // sample; do not flatten the normal map at independent UV boundaries.',
 '   let interiorU=Math.max(0,u),interiorV=Math.max(0,v);',
 '   const limit=1-1.5/span;',
 '   if(interiorU+interiorV>limit){const factor=limit/(interiorU+interiorV);interiorU*=factor;interiorV*=factor;}',
 '   const sx=Math.max(pad,Math.min(tile-pad-1,Math.floor(pad+interiorU*span)));',
 '   const sy=Math.max(pad,Math.min(tile-pad-1,Math.floor(pad+interiorV*span)));',
 '   const from=((y0+sy)*size+(x0+sx))*4;',
 '   for(const map of [normalData,heightData])map.copy(map,dest,from,from+4);',
 '   if(!artStyle)for(const map of [color,orm])map.copy(map,dest,from,from+4);',
 '  }',
 ''
 ].join('\n');
 s=s.slice(0,start)+improved+s.slice(finish);
 const helper=[
 '// Project any 2-D atlas texel onto the closed barycentric triangle.',
 '// Orthogonal Euclidean projection avoids collapsing diagonal gutters',
 '// towards a fixed 0.92 simplex radius, which caused edge pixel shifts.',
 'function nearestSimplex(u,v){',
 ' if(u>=0&&v>=0&&u+v<=1)return [u,v];',
 ' const cu=clamp(u),cv=clamp(v),t=clamp((1+u-v)*.5);',
 ' const possibilities=[[cu,0],[0,cv],[t,1-t]];',
 ' let best=Infinity,chosen=null;',
 ' for(const p of possibilities){const d=(u-p[0])**2+(v-p[1])**2;',
 '  if(d<best){best=d;chosen=p;}}',
 ' return chosen;',
 '}',
 ''
 ].join('\n');
 const marker='function bake(low,high,';
 need(s.includes(marker),'Cannot inject closest simplex helper');
 s=s.replace(marker,helper+marker);
 s=s.replace('  artPixels:0,corePixels:0,','  artPixels:0,corePixels:0,worldGutterPixels:0,');
 s=s.replace('artPixels:stats.artPixels,corePixels:stats.corePixels,','artPixels:stats.artPixels,corePixels:stats.corePixels,worldGutterPixels:stats.worldGutterPixels,');
 fs.writeFileSync(f,s);
 fs.writeFileSync(path.join(home,'README.md'),[
 '# R36LC - world-space UV gutter production',
 '',
 'Based on real R36LB source and GLB from local pinned commit '+ref+'.',
 'No change to triangle budget, source rig or inherited R36LB center sculpt.',
 'Changes: true closest-point projection of each gutter texel to triangle;',
 'evaluates same bind-space palette for baseColor and ORM around every UV island;',
 'preserves normal + relief from donor high-poly via nearest safe interior texel.',
 'R36LB source and output are retained. Node.js only (no Windows Python).',
 '',
 'Source: source/bake_atlas.cjs and source/build_floor.cjs.',
 'Data: output/balanced/*.glb, output/stable/*.glb, output/balanced/textures/*.png.',
 'QA: output/R36LC_SEAM_METRICS.json compares edge discontinuities to R36LB.',
 'Limit: independent UV island tangent spaces and true geometric dark cavities remain.',
 'S2 game engine integration not verified.'
 ].join('\n')+'\n');
 console.log('R36LC_PREPARE',JSON.stringify({sourceCount:names.length,sourceDir,old:ref}));
}
function pngRead(f){
 const buf=fs.readFileSync(f);need(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Bad PNG header');
 let cursor=8,width=0,height=0,parts=[];
 while(cursor<buf.length){
   const len=buf.readUInt32BE(cursor),tag=buf.toString('ascii',cursor+4,cursor+8),payload=buf.subarray(cursor+8,cursor+8+len);
   if(tag==='IHDR'){width=payload.readUInt32BE(0);height=payload.readUInt32BE(4);need(payload[9]===6&&payload[8]===8,'Unexpected PNG type');}
   if(tag==='IDAT')parts.push(payload);
   cursor+=len+12;
 }
 const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*4,data=Buffer.alloc(width*height*4);
 // Our PNG exporter uses unfiltered RGBA rows.
 for(let y=0;y<height;y++){const o=y*(stride+1);need(raw[o]===0,'Unsupported PNG filter at row '+y);raw.copy(data,y*stride,o+1,o+1+stride);}
 return {width,height,data};
}
function sample(im,uv){
 let x=Math.min(im.width-1,Math.max(0,uv[0]*im.width-.5));
 let y=Math.min(im.height-1,Math.max(0,(1-uv[1])*im.height-.5));
 const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
 const nextX=Math.min(im.width-1,ix+1),nextY=Math.min(im.height-1,iy+1);
 const pix=(a,b,k)=>im.data[(b*im.width+a)*4+k];
 return [0,1,2].map(k=>(1-ty)*((1-tx)*pix(ix,iy,k)+tx*pix(nextX,iy,k))+ty*((1-tx)*pix(ix,nextY,k)+tx*pix(nextX,nextY,k)));
}
function measure(image,shared){
 const diffs=[];
 for(const edges of shared.values()){
  if(edges.length!==2)continue;
  for(const ratio of [.12,.26,.41,.59,.74,.88]){
   const sampleEdge=e=>{
    const r=e.uv0.map((v,k)=>v*(1-ratio)+e.uv1[k]*ratio);
    return sample(image,r);
   };
   const a=sampleEdge(edges[0]),b=sampleEdge(edges[1]);
   const delta=(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]))/3;
   if(Number.isFinite(delta))diffs.push(delta);
  }
 }
 diffs.sort((a,b)=>a-b);
 const mean=diffs.reduce((a,b)=>a+b,0)/Math.max(1,diffs.length);
 return {samples:diffs.length,meanRgb8:+mean.toFixed(4),p95Rgb8:+diffs[Math.floor(.95*(diffs.length-1))].toFixed(4),p99Rgb8:+diffs[Math.floor(.99*(diffs.length-1))].toFixed(4),over10:diffs.filter(x=>x>10).length};
}
function seamReport(){
 const {load,values}=require(path.join(sourceDir,'glb_io.cjs'));
 const glb=load(path.join(outputDir,'balanced','R36LC_BALANCED_2100_SURFACE_FLOW.glb'));
 const g=glb.g,bodyMesh=g.meshes.find(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN_WITH_POSTERIOR_SUPERIOR_CORE'));
 need(bodyMesh,'missing continuous body mesh');
 const prim=bodyMesh.primitives[0], pos=values(glb,prim.attributes.POSITION),uv=values(glb,prim.attributes.TEXCOORD_0);
 const ids=values(glb,prim.indices).map(v=>v[0]),shared=new Map();
 const key=i=>pos[i].map(v=>Math.round(v*1e6)).join(',');
 for(let fi=0;fi<ids.length;fi+=3){
  const tri=ids.slice(fi,fi+3);
  for(let j=0;j<3;j++){
   const i=tri[j],k=tri[(j+1)%3],ki=key(i),kk=key(k);
   if(ki===kk)continue;
   const flip=ki>kk;
   const keyPair=flip?kk+'|'+ki:ki+'|'+kk;
   const [a,b]=flip?[k,i]:[i,k];
   if(!shared.has(keyPair))shared.set(keyPair,[]);
   shared.get(keyPair).push({uv0:uv[a],uv1:uv[b]});
  }
 }
 const colorBefore=measure(pngRead(path.join(home,'baseline','body_color_2048.png')),shared);
 const colorAfter=measure(pngRead(path.join(outputDir,'balanced','textures','body_color_2048.png')),shared);
 const ormBefore=measure(pngRead(path.join(home,'baseline','body_orm_2048.png')),shared);
 const ormAfter=measure(pngRead(path.join(outputDir,'balanced','textures','body_orm_2048.png')),shared);
 const budget=g.extras?.r36kp?.budget;
 need(budget?.total===2100&&budget.head===968&&budget.body===1132,'Model budget changed');
 const bones=g.skins[g.nodes.find(n=>n.name==='R36KP_GAME_SKIN_WITH_EMBEDDED_ANATOMY')?.skin||0].joints.length;
 need(bones===63,'Skeleton joint count != 63');
 const result={format:'R36LC_SEAM_METRICS_V1',baseline:'R36LB',candidate:'R36LC',
  sharedEdges:[...shared.values()].filter(v=>v.length===2).length,
  before:{color:colorBefore,orm:ormBefore},
  after:{color:colorAfter,orm:ormAfter},
  meanColorRelativeReduction:+((1-colorAfter.meanRgb8/Math.max(0.00001,colorBefore.meanRgb8))*100).toFixed(2),
  meanOrmRelativeReduction:+((1-ormAfter.meanRgb8/Math.max(0.00001,ormBefore.meanRgb8))*100).toFixed(2),
  budget,bones,
  referenceFit:'unverified; no metric 3D ground truth',
  engineApplied:false};
 fs.writeFileSync(path.join(outputDir,'R36LC_SEAM_METRICS.json'),JSON.stringify(result,null,2)+'\n');
 console.log('R36LC_SEAM_MEASURE',JSON.stringify(result));
 return result;
}
function run(command,args,timeout){const r=child.spawnSync(command,args,{stdio:'inherit',timeout});need(!r.error&&r.status===0,'Child failed: '+command+' '+(r.error?.message||r.status));}
function build(){
 need(fs.existsSync(path.join(sourceDir,'build_floor.cjs')),'Prepare R36LC first');
 need(!fs.existsSync(outputDir),'Do not overwrite existing output');
 need(fs.existsSync(hw)&&fs.existsSync(donor),'Pinned R36HW R36JB sources missing');
 fs.mkdirSync(outputDir,{recursive:true});
 run(process.execPath,[path.join(sourceDir,'build_floor.cjs'),hw,donor,
  path.join(outputDir,'balanced'),'--variant=balanced','--atlas=2048'],600000);
 run(process.execPath,[path.join(sourceDir,'pelvis_skin_anchor.cjs'),
  path.join(outputDir,'balanced','R36LC_BALANCED_2100_SURFACE_FLOW.glb'),
  path.join(outputDir,'stable')],120000);
 return seamReport();
}
function verify(){
 const v=seamReport(); need(v.sharedEdges>1200,'Too few closed shared edges');
 console.log('R36LC_VERIFY_OK',JSON.stringify({colorChange:v.meanColorRelativeReduction,ormChange:v.meanOrmRelativeReduction}));
}
try{
 const sub=process.argv[2]||'prepare';
 if(sub==='prepare')prepare();
 else if(sub==='build')build();
 else if(sub==='verify')verify();
 else throw Error('Usage: node build_r36lc.cjs prepare|build|verify');
}catch(error){console.error(error.stack||error);process.exitCode=1;}

