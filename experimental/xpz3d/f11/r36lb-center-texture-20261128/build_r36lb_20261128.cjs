'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=__dirname,repo=path.join(root,'github_publish_stage');
const stem=path.join('experimental','xpz3d','f11');
const old=path.join(repo,stem,'r36la-surface-flow-20261128');
const newer=path.join(repo,stem,'r36lb-center-texture-20261128');
const src=path.join(newer,'source'),out=path.join(newer,'output');
const hw=path.resolve(root,'..','R36HW-CLOTH-PANEL','R36HW_F11_CLOTHED.glb');
const jb=path.join(repo,stem,'r36kp','reference','F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb');
function ok(test,reason){if(!test)throw Error(reason)}
function replace(file,a,b){const f=path.join(src,file),s=fs.readFileSync(f,'utf8');ok(s.includes(a),'pattern missing '+file+': '+a.slice(0,50));fs.writeFileSync(f,s.replace(a,b))}
function processNode(args,timeout=300000){console.log('NODE',args.join(' '));const r=cp.spawnSync(process.execPath,args,{stdio:'inherit',timeout});ok(!r.error&&r.status===0,'Node failed '+(r.error?.message||r.status))}
function prepare(){
 ok(fs.existsSync(path.join(old,'source','build_floor.cjs')),'Missing R36LA source');
 ok(!fs.existsSync(newer),'R36LB dir exists; preserve existing');
 fs.mkdirSync(src,{recursive:true});fs.mkdirSync(out,{recursive:true});
 for(const name of fs.readdirSync(path.join(old,'source'))){if(name.endsWith('.cjs'))fs.copyFileSync(path.join(old,'source',name),path.join(src,name))}
 const f=path.join(src,'reference_sculpt.cjs'),before=fs.readFileSync(f,'utf8');
 const start=before.indexOf('function field(x,z){'),end=before.indexOf('function stats(mesh){');
 ok(start>=0&&end>start,'Unexpected sculpt format');
 const field=[
 'function field(x,z){',
 ' const ax=Math.abs(x),clip=smooth(.753,.802,z)*(1-smooth(.995,1.043,z))*(1-smooth(.079,.138,ax));',
 ' const t=clamp((z-.77)/(.998-.77),0,1),sign=x>=0?1:-1;',
 ' const ridgeX=.027+.009*Math.sin(t*Math.PI*.93)+.0027*sign*Math.sin(t*5.6);',
 ' const outerX=.064+.012*Math.sin(t*Math.PI);',
 ' const bilateral=gauss(ax,ridgeX,.020)*gauss(z,.885+sign*.003,.12);',
 ' const innerContour=gauss(ax,.016+sign*.001,.011)*gauss(z,.895,.105);',
 ' const valley=gauss(x,.002*Math.sin(t*5.2),.010)*gauss(z,.885,.108);',
 ' const outer=gauss(ax,outerX,.019)*gauss(z,.872,.11);',
 ' const tip=gauss(x,-.001,.021)*gauss(z,.973,.038);',
 ' const base=gauss(ax,.02,.046)*gauss(z,.790,.035);',
 ' const sculpted=(.0100*bilateral+.0041*outer+.0024*innerContour-.0036*valley+.0028*tip+.0022*base)*clip;',
 ' return {sculpted,envelope:clip,components:{bilateral,outer,valley,innerContour,tip,base}};',
 '}',
 ''
 ].join('\n');
 fs.writeFileSync(f,before.slice(0,start)+field+before.slice(end));
 replace('designed_skin_art.cjs',
 'const ink=.092*M.contourShadow+.087*M.groinShadow+.048*M.chestFold;',
 'const centerLine=.002*Math.sin((z-.77)*23); const midFold=M.pelvis*gauss(Math.abs(x-centerLine),.028,.021)*gauss(z,.885,.108); const midValley=M.pelvis*gauss(x-centerLine,0,.011)*gauss(z,.886,.108); const ink=.092*M.contourShadow+.087*M.groinShadow+.048*M.chestFold+.040*midValley;');
 replace('designed_skin_art.cjs',
 'const edgeLight=.067*M.contourLip+.045*M.groinLip+.034*M.chestLowerLight;',
 'const edgeLight=.067*M.contourLip+.045*M.groinLip+.034*M.chestLowerLight+.025*midFold;');
 replace('designed_skin_art.cjs',
 'const texture=.028*clay+.014*marble+.006*fine-.007*Math.max(0,pore);',
 'const texture=.028*clay+.014*marble+.006*fine-.007*Math.max(0,pore)+.006*noise(x*120+3,y*120-7,z*120+2);');
 replace('bake_atlas.cjs',
 'if(u+v>0.92){const f=0.92/(u+v);u*=f;v*=f;}',
 'const limit=1-1.5/span;if(u+v>limit){const f=limit/(u+v);u*=f;v*=f;}');
 for(const name of ['build_floor.cjs','pelvis_skin_anchor.cjs']){
  const f=path.join(src,name);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('R36LA','R36LB'));
 }
 fs.writeFileSync(path.join(newer,'README.md'),[
 '# R36LB | 2100-triangle continuous surface and 2048 texture refinement',
 '',
 'Derived non-destructively from R36LA main source. R36LA binaries and source remain unchanged.',
 'Reference-guided shallow asymmetric 3D relief, painted fold shading and micropigment, diagonal UV gutter improvement.',
 'Constraints: 968 head + 1132 body triangles; 63 bones; 2048 color, normal, ORM and relief maps.',
 'Known issues: 2D target is not a 3D metric source; game rendering unverified; independent UV islands remain.',
 'Build script: build_r36lb_20261128.cjs. No Windows Python used.',
 ''
 ].join('\n'));
 console.log('PREPARED',newer);
}
function build(){
 ok(fs.existsSync(src),'Run prepare first');
 ok(fs.existsSync(hw)&&fs.existsSync(jb),'Reference source GLB missing');
 const balanced=path.join(out,'balanced'),stabilized=path.join(out,'stable');
 ok(!fs.existsSync(balanced)&&!fs.existsSync(stabilized),'Refusing overwrite');
 processNode([path.join(src,'build_floor.cjs'),hw,jb,balanced,'--variant=balanced','--atlas=2048'],600000);
 processNode([path.join(src,'pelvis_skin_anchor.cjs'),path.join(balanced,'R36LB_BALANCED_2100_SURFACE_FLOW.glb'),stabilized],90000);
 const report=JSON.parse(fs.readFileSync(path.join(balanced,'GEOMETRY_REPORT.json'),'utf8'));
 ok(report.budget.total===2100&&report.budget.head===968&&report.budget.body===1132,'Triangle budget mismatch');
 ok(report.body.boundaryEdges===0&&report.body.nonmanifoldEdges===0,'Topology failed');
 const manifest={version:'R36LB',budget:report.budget,bones:63,atlas:2048,
  generated:[path.join(balanced,'R36LB_BALANCED_2100_SURFACE_FLOW.glb'),path.join(stabilized,'R36LB_BALANCED_SKIN_2100TRI.glb')],
  engineApplied:false,referenceMatchedExactly:false};
 fs.writeFileSync(path.join(out,'BUILD_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('R36LB_BUILT',JSON.stringify(manifest));
}
const mode=process.argv[2]||'prepare';
try{if(mode==='prepare')prepare();else if(mode==='build')build();else throw Error('use prepare or build')}catch(e){console.error(e.stack||e);process.exitCode=1}

