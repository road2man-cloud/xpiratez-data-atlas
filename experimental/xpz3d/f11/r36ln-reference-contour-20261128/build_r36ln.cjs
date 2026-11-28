'use strict';
/**
 * R36LN reproducible R36KZ-derived build launcher.
 * Makes an isolated temp copy of the published R36KZ source, injects the
 * integrated center-contour step after chest shaping, and runs its standard
 * GLB/2048 atlas pipeline with the same authoritative R36HW/R36JB inputs.
 * Source tree is never overwritten.
 *
 * Usage:
 *   node build_r36ln.cjs R36HW.glb R36JB.glb NEW_OUTPUT_DIR
 *                         [--variant=balanced|bold|soft] [--atlas=2048]
 *                         [--geometry-only] [--contour=.85]
 */
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const base=path.resolve(__dirname,'../r36kz-chest-center-shape-20261128/source');
const original=path.join(base,'build_floor.cjs');
const contour=path.resolve(__dirname,'source/center_contour.cjs');
const args=process.argv.slice(2);
if(args.length<3)throw Error('usage: node build_r36ln.cjs HW.glb JB.glb new_output_dir [--contour=.85]');
const strength=Number((args.find(x=>x.startsWith('--contour='))||'--contour=.85').split('=')[1]);
if(!Number.isFinite(strength)||strength<0||strength>1.6)throw Error('invalid contour strength');
const output=path.resolve(args[2]);
if(fs.existsSync(output))throw Error('output already exists: '+output);
if(!fs.existsSync(original)||!fs.existsSync(contour))throw Error('missing published source');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'r36ln-')),source=path.join(scratch,'source');
try{
 fs.cpSync(base,source,{recursive:true});
 const file=path.join(source,'build_floor.cjs'),src=fs.readFileSync(file,'utf8');
 const from='const m=sculptChest(center,bodySource,{strength:variant===\'bold\'?1.20:variant===\'balanced\'?1:.70,maxMove:.038});';
 const to=from.replace('const m=','const shaped=')+
  '\n const m=require('+JSON.stringify(contour)+').sculpt(shaped,bodySource,{strength:'+strength+'});'+
  '\n console.log(\'R36LN_CONTOUR\',JSON.stringify(m.stats.r36ln));';
 if(!src.includes(from))throw Error('R36KZ build hook changed; refusing unsupported patch');
 let patched=src.replace(from,to);
 patched=patched.replace(/R36KZ_\+variant\.toUpperCase\(\)\+'_2088_TORSO_CENTER\.glb'/g,
   'R36LN_'+"variant.toUpperCase()"+'_2088_TORSO_CENTER.glb');
 patched=patched.replace("g.asset.generator='R36KZ reference-guided chest silhouette + center-surface sculpt, 2,088 triangles';",
 "g.asset.generator='R36LN R36KZ-derived integrated center contour, 2,088 triangles';");
 fs.writeFileSync(file,patched);
 const filtered=args.filter(x=>!x.startsWith('--contour='));
 const result=cp.spawnSync(process.execPath,[file,...filtered],{stdio:'inherit',timeout:3000000});
 if(result.error)throw result.error;
 if(result.status!==0)process.exitCode=result.status||1;
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
