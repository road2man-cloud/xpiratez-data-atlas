'use strict';
/**
 * R36LZ source-indexed OBJ cage fairing.
 * Smoothes existing R36LY sculpt displacement across real, physically
 * coincident mesh vertices, not across unrelated UV-chart coordinates.
 * Edits the OBJ's geometry in-place in a NEW output directory. Never paints.
 *
 * node refine_cage.cjs R36LY.glb R36LY_EDIT.obj R36LY_EDIT.json OUTPUT_DIR flow|guarded
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const check=(v,msg)=>{if(!v)throw Error(msg)};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const key=p=>p.map(x=>Math.round(x*100000)).join(':');
const length=p=>Math.hypot(...p);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function gate(p) {
 const [x,y,z]=p;
 return smooth((-0.025-y)/.055)*smooth((.094-Math.abs(x))/.028)*
        smooth((z-.749)/.055)*smooth((.980-z)/.060);
}
function parseOBJ(input){
 const lines=fs.readFileSync(input,'utf8').split(/\r?\n/);
 const vertices=[],faceRows=[];let n=0;
 for(const line of lines){
  if(/^v\s/.test(line)){
   const a=line.trim().split(/\s+/).slice(1).map(Number);
   check(a.length===3&&a.every(Number.isFinite),'bad OBJ vertex '+n);
   vertices.push(a);
  }
  if(/^f\s/.test(line)){
   const refs=line.trim().split(/\s+/).slice(1).map(s=>Number(s.split('/')[0]));
   check(refs.length===3&&refs.every(i=>Number.isInteger(i)&&i>0),'OBJ must retain original triangle topology');
   faceRows.push(refs);
  }
 }
 return {lines,vertices,faceRows};
}
function validate(source,ledger,obj){
 check(ledger.version==='R36LY-EDIT-CAGE','wrong input cage ledger');
 check(source.sha===ledger.sculptSHA256,'R36LY source GLB not matching ledger');
 const mi=source.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 check(mi>=0,'continuous skinned body not found');
 const mesh=extract(source,mi,0);
 check(mesh.indices.length===3396&&source.g.skins.some(s=>s.joints.length===63),'expected 1132 body triangles / 63 bones');
 check(obj.vertices.length===ledger.vertices.length,'OBJ vertex correspondence changed');
 check(obj.faceRows.length===ledger.triangles.length,'OBJ face correspondence changed');
 const byId=new Map(ledger.vertices.map(v=>[v.originalVertexIndex,v]));
 check(byId.size===ledger.vertices.length,'duplicate original vertex indices');
 for(const v of ledger.vertices){
  check(v.cageVertexIndex>=1&&v.cageVertexIndex<=obj.vertices.length,'bad ledger OBJ index');
  const i=v.originalVertexIndex,b=mesh.positions[i],a=obj.vertices[v.cageVertexIndex-1];
  check(length(a.map((x,j)=>x-v.sculptedPosition[j]))<2e-6,'OBJ differs from baseline; fair only untouched cage');
  check(length(b.map((x,j)=>x-v.sculptedPosition[j]))<2e-6,'source GLB mismatched sculpted control cage');
 }
 for(let f=0;f<ledger.triangles.length;f++){
  const a=obj.faceRows[f].map(j=>ledger.vertices[j-1].originalVertexIndex);
  const b=ledger.triangles[f].ids;
  check(a.length===3&&a.every((v,j)=>v===b[j]),'OBJ triangle order/connectivity changed '+f);
 }
 return {mesh,byId};
}
function build(sourceFile,objFile,ledgerFile,outDir,mode) {
 check(['flow','guarded'].includes(mode),'mode must be flow or guarded');
 for(const x of [sourceFile,objFile,ledgerFile])check(fs.existsSync(x),'input not found '+x);
 check(!fs.existsSync(outDir),'refusing overwrite '+outDir);
 const source=load(sourceFile),ledger=JSON.parse(fs.readFileSync(ledgerFile,'utf8'));
 const obj=parseOBJ(objFile);validate(source,ledger,obj);
 const groups=new Map(),fromOriginal=new Map();
 for(const row of ledger.vertices){
  const k=key(row.originalPosition);
  if(!groups.has(k))groups.set(k,{key:k,original:row.originalPosition.slice(),rows:[],neighbors:new Set()});
  const g=groups.get(k);g.rows.push(row);
  fromOriginal.set(row.originalVertexIndex,k);
 }
 for(const g of groups.values()){
  g.delta=g.rows.reduce((s,v)=>s+v.sculptedPosition[1]-v.originalPosition[1],0)/g.rows.length;
  g.initial=g.delta;
  g.weight=gate(g.original);
  g.next=g.delta;
 }
 const edges=new Set();
 for(const f of ledger.triangles){
  const keys=f.ids.map(id=>fromOriginal.get(id));
  check(keys.every(k=>k!=null),'face has no vertex mapping');
  for(let i=0;i<3;i++){
   const a=keys[i],b=keys[(i+1)%3];
   if(a===b)continue;
   const pair=[a,b].sort().join('|');
   if(edges.has(pair))continue;
   const g1=groups.get(a),g2=groups.get(b);
   if(length(g1.original.map((x,j)=>x-g2.original[j]))>.14)continue;
   edges.add(pair);g1.neighbors.add(b);g2.neighbors.add(a);
  }
 }
 check(edges.size>=90,'not enough physical mesh edges for refinement');
 function energy(){
  let e=0;
  for(const pair of edges){
   const at=pair.indexOf('|'),u=groups.get(pair.slice(0,at)),v=groups.get(pair.slice(at+1));
   e+=(u.delta-v.delta)**2;
  }return e;
 }
 const before=energy(),lambda=mode==='flow'?.39:.29;
 for(let pass=0;pass<3;pass++){
  for(const g of groups.values()){
   if(g.weight<.002||g.neighbors.size<2){g.next=g.delta;continue}
   let sum=0,total=0;
   for(const k of g.neighbors){
    const v=groups.get(k);
    const dist=Math.max(.008,length(g.original.map((x,j)=>x-v.original[j])));
    // Edge-aware weighting protects designed paired ridges while
    // reducing abrupt low-poly displacement differences.
    const diff=g.delta-v.delta;
    const w=Math.exp(-.5*(diff/.0026)**2)/dist;
    sum+=w*v.delta;total+=w;
   }
   if(total<1e-12){g.next=g.delta;continue}
   const maxChange=.00125;
   const smoothD=g.delta+lambda*g.weight*(sum/total-g.delta);
   g.next=clamp(smoothD,g.initial-maxChange,g.initial+maxChange);
   g.next=clamp(g.next,-.007,.007);
  }
  for(const g of groups.values())g.delta=g.next;
 }
 let changed=0,changedVertices=0,maxDeltaFromCage=0;
 const edited=obj.vertices.map(v=>v.slice());
 for(const g of groups.values()){
  const dy=g.delta-g.initial;
  if(Math.abs(dy)<5e-9)continue;
  changed++;maxDeltaFromCage=Math.max(maxDeltaFromCage,Math.abs(dy));
  for(const row of g.rows){
   edited[row.cageVertexIndex-1][1]=row.sculptedPosition[1]+dy;
   changedVertices++;
  }
 }
 const after=energy();
 check(changed>=20&&changedVertices>=70,'no meaningful edit cage improvement');
 check(after<before,'edge-aware fairing did not lower displacement gradient energy');
 check(maxDeltaFromCage<.001251,'unbounded cage edit');
 let n=0;
 const newLines=obj.lines.map(line=>{
  if(!/^v\s/.test(line))return line;
  const p=edited[n++];
  return 'v '+p.map(x=>x.toFixed(9)).join(' ');
 });
 check(n===edited.length,'OBJ point rewrite mismatch');
 fs.mkdirSync(outDir,{recursive:true});
 const filename='R36LZ_'+ledger.label+'_REFINED_CAGE.obj';
 const output=path.join(outDir,filename);fs.writeFileSync(output,newLines.join('\n'));
 const report={version:'R36LZ-FAIR-OBJ',mode,label:ledger.label,
  sourceModel:path.basename(sourceFile),sourceModelSHA256:source.sha,
  sourceOBJSHA256:sha(fs.readFileSync(objFile)),sourceLedgerSHA256:sha(fs.readFileSync(ledgerFile)),
  editedOBJ:filename,editedOBJsha256:sha(fs.readFileSync(output)),
  trianglesKept:ledger.triangles.length,OBJVertices:edited.length,physicalGroups:groups.size,
  graphEdges:edges.size,passes:3,lambda,
  changedPhysicalGroups:changed,changedOBJVertices:changedVertices,
  maxAdditionalYDisplacement:maxDeltaFromCage,
  displacementGradientEnergyBefore:before,displacementGradientEnergyAfter:after,
  relativeEnergyReduction:1-after/before,
  topologyPreserved:true,uvMappingPreserved:true,
  note:'Fairing of existing R36LY Y-displacements; not image-measured anatomical geometry'};
 fs.writeFileSync(path.join(outDir,'R36LZ_'+ledger.label+'_FAIR.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({label:ledger.label,mode,physicalGroups:changed,vertices:changedVertices,
  energyReduction:report.relativeEnergyReduction,maxAdditionalMove:maxDeltaFromCage}));
 return report;
}
if(require.main===module)try{
 check(process.argv.length===7,'usage: node refine_cage.cjs SOURCE.glb CAGE.obj CAGE.json OUT_DIR flow|guarded');
 build(...process.argv.slice(2));
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,parseOBJ,validate,gate};
