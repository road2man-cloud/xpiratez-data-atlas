'use strict';
// R36KP -> pelvis anchor. Only body JOINTS_0/WEIGHTS_0 accessors change.
// UV duplicates at the same position get identical weights; face/hair/texture
// and all 2088 triangles are inherited untouched.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,values}=require('./glb_io.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const need=(x,s)=>{if(!x)throw Error(s)};
function influence([x,y,z]){
 // +Y is posterior; donor bind is Z-up, left is +X.
 return (1-smooth(.025,.150,Math.abs(x)))*smooth(.745,.890,z)*
   (1-smooth(1.015,1.110,z))*(1-smooth(-.055,.046,y));
}
function skinMap(js,ws){
 const m=new Map();let sum=0;
 for(let i=0;i<4;i++){if(ws[i]>0)m.set(js[i],(m.get(js[i])||0)+ws[i]);sum+=ws[i];}
 need(sum>0&&Number.isFinite(sum),'invalid skin weights');
 for(const [j,w]of m)m.set(j,w/sum);return m;
}
function packed(map){
 const arr=[...map].filter(([,w])=>w>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4);
 const sum=arr.reduce((s,[,w])=>s+w,0)||1;
 return {j:Array.from({length:4},(_,i)=>arr[i]?.[0]||0),
 w:Array.from({length:4},(_,i)=>(arr[i]?.[1]||0)/sum)};
}
function anchor(p,joints,weights,strength,hipIndex){
 need(strength>=0&&strength<=1,'bad strength');
 need(p.length===joints.length&&p.length===weights.length,'vertex count mismatch');
 const groups=new Map();
 for(let i=0;i<p.length;i++){
  const key=p[i].map(x=>Math.round(x*1e6)).join(',');
  if(!groups.has(key))groups.set(key,{p:p[i],ids:[]});
  groups.get(key).ids.push(i);
 }
 const outJ=joints.map(x=>x.slice()),outW=weights.map(x=>x.slice());
 const summary=new Map();let unique=0,touched=0,maxHipBoost=0,hipSum=0;
 for(const group of groups.values()){
  const mix=strength*influence(group.p);
  if(mix<.00001)continue;
  const avg=new Map();
  for(const id of group.ids)for(const [j,w]of skinMap(joints[id],weights[id]))
    avg.set(j,(avg.get(j)||0)+w/group.ids.length);
  const hipBefore=avg.get(hipIndex)||0,thighBefore=(avg.get(2)||0)+(avg.get(3)||0);
  for(const [j,w]of avg)avg.set(j,w*(1-mix));
  avg.set(hipIndex,(avg.get(hipIndex)||0)+mix);
  const result=packed(avg);
  const hipAfter=result.j.reduce((s,j,k)=>s+(j===hipIndex?result.w[k]:0),0);
  const thighAfter=result.j.reduce((s,j,k)=>s+((j===2||j===3)?result.w[k]:0),0);
  for(const id of group.ids){outJ[id]=result.j.slice();outW[id]=result.w.slice();touched++;}
  unique++;maxHipBoost=Math.max(maxHipBoost,hipAfter-hipBefore);hipSum+=hipAfter-hipBefore;
  const z=(Math.floor(group.p[2]*20)/20).toFixed(2);
  const t=summary.get(z)||{n:0,hipBefore:0,hipAfter:0,thighBefore:0,thighAfter:0};
  t.n++;t.hipBefore+=hipBefore;t.hipAfter+=hipAfter;t.thighBefore+=thighBefore;t.thighAfter+=thighAfter;summary.set(z,t);
 }
 for(const row of outW)need(row.every(x=>Number.isFinite(x)&&x>=-1e-8)&&Math.abs(row.reduce((s,v)=>s+v,0)-1)<1e-5,'non-normalized weights');
 return {joints:outJ,weights:outW,stats:{uniqueSourcePositions:groups.size,changedPositions:unique,
 changedRenderVertices:touched,maxHipBoost,meanHipBoost:unique?hipSum/unique:0,
 byHeight:[...summary].sort((a,b)=>+a[0]-+b[0]).map(([z,r])=>({z,positions:r.n,
 hipBefore:r.hipBefore/r.n,hipAfter:r.hipAfter/r.n,
 thighBefore:r.thighBefore/r.n,thighAfter:r.thighAfter/r.n}))}};
}
function writeVec4(q,id,rows,target){
 const a=q.g.accessors[id],v=q.g.bufferViews[a.bufferView],w=a.componentType===5126?4:a.componentType===5123?2:0;
 need(w&&a.type==='VEC4'&&rows.length===a.count,'unsupported skin attribute');
 const base=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||4*w;
 for(let i=0;i<rows.length;i++)for(let k=0;k<4;k++){
  const x=rows[i][k],at=base+i*stride+k*w;
  if(w===4)target.writeFloatLE(x,at);else target.writeUInt16LE(x,at);
 }
}
function serialize(g,bin){
 g.buffers[0].byteLength=bin.length;
 const json=Buffer.from(JSON.stringify(g),'utf8'),
 jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),
 bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const out=Buffer.alloc(28+jp.length+bp.length);
 out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(jp.length,12);out.write('JSON',16);jp.copy(out,20);
 const off=20+jp.length;out.writeUInt32LE(bp.length,off);out.write('BIN\0',off+4,'binary');bp.copy(out,off+8);
 return out;
}
function produce(source,directory){
 need(!fs.existsSync(directory),'output dir already exists');
 const q=load(source),g=q.g;
 const meshId=g.meshes.findIndex(m=>(m.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 need(meshId>=0,'R36KP continuous skin mesh missing');
 const mesh=g.meshes[meshId],prim=mesh.primitives[0],a=prim.attributes,
 p=values(q,a.POSITION),j=values(q,a.JOINTS_0),w=values(q,a.WEIGHTS_0);
 need(values(q,prim.indices).length===3396&&g.extras?.r36kp?.budget?.total===2100,
 'R36LA 2100-triangle source budget changed');
 const body=g.nodes.find(n=>n.mesh===meshId&&Number.isInteger(n.skin)),
 skin=g.skins[body.skin],hip=skin.joints.findIndex(i=>g.nodes[i].name==='Hip');
 need(hip>=0&&skin.joints.length===63,'incompatible source skeleton');
 fs.mkdirSync(directory,{recursive:true});
 const report={format:'R36KP_PELVIS_SKINLAB_20261128',source,sourceSHA256:q.sha,
 triangleBudget:2100,renderTriangles:2100,bodyTriangles:1132,
 geometryChanged:false,textureChanged:false,uvChanged:false,rigJointCount:skin.joints.length,
 variants:[]};
 for(const variant of [{name:'SOFT',strength:.50},{name:'BALANCED',strength:.73}]){
  const result=anchor(p,j,w,variant.strength,hip),binary=Buffer.from(q.bin);
  writeVec4(q,a.JOINTS_0,result.joints,binary);
  writeVec4(q,a.WEIGHTS_0,result.weights,binary);
  const meta=JSON.parse(JSON.stringify(g));
  meta.asset.generator='R36LA pelvis skin anchor; 2100 triangles unchanged';
  meta.extras={...meta.extras,pelvisSkinLab:{baseSHA256:q.sha,strength:variant.strength,
   pelvisBone:hip,meshAndUVPreserved:true,textureUnchanged:true,renderTriangles:2100,
   remainingIssue:'Open space between thighs cannot be filled by weight changes alone'}};
  const output=serialize(meta,binary);
  const name='R36LA_'+variant.name+'_SKIN_2100TRI.glb';
  fs.writeFileSync(path.join(directory,name),output);
  report.variants.push({name,file:name,bytes:output.length,sha256:hash(output),
   strength:variant.strength,stats:result.stats});
 }
 fs.writeFileSync(path.join(directory,'PRODUCTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({sourceSHA256:report.sourceSHA256,variants:report.variants},null,2));
 return report;
}
if(require.main===module){try{produce(process.argv[2],process.argv[3])}catch(e){console.error(e.stack||e);process.exit(1)}}
module.exports={influence,anchor,produce};
