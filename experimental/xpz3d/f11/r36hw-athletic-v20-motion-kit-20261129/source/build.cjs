// V20 glTF animation diagnostic kit. Node.js, no dependencies.
function build(src){
 const dv=new DataView(src.buffer,src.byteOffset,src.byteLength),l=dv.getUint32(12,true),base=28+l;
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==src.length||dv.getUint32(16,true)!==0x4e4f534a||dv.getUint32(24+l,true)!==0x004e4942||base+dv.getUint32(20+l,true)!==src.length)throw Error("Invalid source GLB");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+l))),original=JSON.parse(JSON.stringify(j)),bin=src.slice(base);
 if(j.animations?.length||j.skins.length!==1||j.skins[0].joints.length!==63||j.materials[18].alphaMode!=="OPAQUE")throw Error("Unexpected source");
 const triangles=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);if(triangles!==2100)throw Error("Triangle budget");
 const byName=new Map(j.nodes.map((n,i)=>[n.name,i]));
 const animated=["Hip","Spine","Chest","Neck","Head","L_Clavicle","R_Clavicle","L_UArm","R_UArm","L_LArm","R_LArm","L_Hand","R_Hand","L_Thigh","R_Thigh","L_Leg","R_Leg","L_Foot","R_Foot","L_Toe","R_Toe"];
 for(const n of animated)if(!byName.has(n)||!j.skins[0].joints.includes(byName.get(n)))throw Error("Missing joint "+n);
 const norm=q=>{const d=Math.hypot(...q);if(d<1e-9)throw Error("Bad quaternion");return q.map(x=>x/d)};
 const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
 const axis=(k,d)=>{const a=d*Math.PI/360,q=[0,0,0,Math.cos(a)];q[k]=Math.sin(a);return q};
 const euler=([x,y,z])=>norm(mul(mul(axis(2,z),axis(1,y)),axis(0,x)));
 const frames=[0,.5,1,1.5,2,2.5,3,3.5,4];
 // Every clip includes every diagnostic rotation joint and hip translation. Omitted
 // values are rest pose, so changing clips cannot leave stale rotations on these joints.
 const clipSpecs=[
  {name:"V20_Shoulder_Elbow_Sweep",purpose:"Mirrored shoulder lowering and forward elbow bend",frames:[
   {},{L_UArm:[0,25,0],R_UArm:[0,-25,0],L_Clavicle:[0,3,0],R_Clavicle:[0,-3,0]},
   {L_UArm:[0,55,0],R_UArm:[0,-55,0],L_LArm:[0,0,-40],R_LArm:[0,0,40],L_Clavicle:[0,5,0],R_Clavicle:[0,-5,0]},
   {L_UArm:[0,75,0],R_UArm:[0,-75,0],L_LArm:[0,0,-75],R_LArm:[0,0,75],L_Clavicle:[0,7,0],R_Clavicle:[0,-7,0]},
   {L_UArm:[0,45,-20],R_UArm:[0,-45,20],L_LArm:[0,0,-55],R_LArm:[0,0,55],L_Hand:[0,0,-10],R_Hand:[0,0,10]},
   {L_UArm:[0,25,-35],R_UArm:[0,-25,35],L_LArm:[0,0,-25],R_LArm:[0,0,25]},
   {L_UArm:[0,15,0],R_UArm:[0,-15,0]}, {},{}
  ]},
  {name:"V20_Knee_Ankle_Sweep",purpose:"Alternating hip, knee and ankle articulation; no foot contact solver",frames:[
   {},{L_Thigh:[-18,0,0],L_Leg:[35,0,0],L_Foot:[-12,0,0]},
   {L_Thigh:[-32,0,0],L_Leg:[70,0,0],L_Foot:[-25,0,0],L_Toe:[8,0,0]},
   {L_Thigh:[-18,0,0],L_Leg:[35,0,0],L_Foot:[-12,0,0]},
   {},{R_Thigh:[-18,0,0],R_Leg:[35,0,0],R_Foot:[-12,0,0]},
   {R_Thigh:[-32,0,0],R_Leg:[70,0,0],R_Foot:[-25,0,0],R_Toe:[8,0,0]},
   {R_Thigh:[-18,0,0],R_Leg:[35,0,0],R_Foot:[-12,0,0]},{}
  ]},
  {name:"V20_Torso_Head_Sweep",purpose:"Spine, chest, neck and head flexion and rotation",frames:[
   {},{Spine:[-5,0,8],Chest:[-5,0,9],Neck:[2,0,-4],Head:[0,0,8]},
   {Spine:[-10,0,15],Chest:[-8,0,15],Neck:[4,0,-8],Head:[0,0,15]},
   {Spine:[-5,0,8],Chest:[-5,0,9],Neck:[2,0,-4],Head:[0,0,8]}, {},
   {Spine:[5,0,-8],Chest:[5,0,-9],Neck:[-2,0,4],Head:[0,0,-8]},
   {Spine:[10,0,-15],Chest:[8,0,-15],Neck:[-4,0,8],Head:[0,0,-15]},
   {Spine:[5,0,-8],Chest:[5,0,-9],Neck:[-2,0,4],Head:[0,0,-8]},{}
  ]},
  {name:"V20_Combined_Bend",purpose:"Combined symmetric knee bend, torso lean and lowered arms; diagnostic not a gameplay clip",frames:[
   {},{L_UArm:[0,25,0],R_UArm:[0,-25,0],L_Thigh:[-10,0,0],R_Thigh:[-10,0,0],L_Leg:[20,0,0],R_Leg:[20,0,0],L_Foot:[-10,0,0],R_Foot:[-10,0,0],Spine:[-4,0,0]},
   {L_UArm:[0,50,0],R_UArm:[0,-50,0],L_LArm:[0,0,-25],R_LArm:[0,0,25],L_Thigh:[-20,0,0],R_Thigh:[-20,0,0],L_Leg:[40,0,0],R_Leg:[40,0,0],L_Foot:[-20,0,0],R_Foot:[-20,0,0],Spine:[-7,0,0],Chest:[-3,0,0]},
   {L_UArm:[0,60,-15],R_UArm:[0,-60,15],L_LArm:[0,0,-45],R_LArm:[0,0,45],L_Thigh:[-30,0,0],R_Thigh:[-30,0,0],L_Leg:[60,0,0],R_Leg:[60,0,0],L_Foot:[-30,0,0],R_Foot:[-30,0,0],Spine:[-10,0,0],Chest:[-5,0,0],Head:[10,0,0]},
   {L_UArm:[0,60,-15],R_UArm:[0,-60,15],L_LArm:[0,0,-45],R_LArm:[0,0,45],L_Thigh:[-30,0,0],R_Thigh:[-30,0,0],L_Leg:[60,0,0],R_Leg:[60,0,0],L_Foot:[-30,0,0],R_Foot:[-30,0,0],Spine:[-10,0,0],Chest:[-5,0,0],Head:[10,0,0]},
   {L_UArm:[0,50,0],R_UArm:[0,-50,0],L_LArm:[0,0,-25],R_LArm:[0,0,25],L_Thigh:[-20,0,0],R_Thigh:[-20,0,0],L_Leg:[40,0,0],R_Leg:[40,0,0],L_Foot:[-20,0,0],R_Foot:[-20,0,0],Spine:[-7,0,0],Chest:[-3,0,0]},
   {L_UArm:[0,25,0],R_UArm:[0,-25,0],L_Thigh:[-10,0,0],R_Thigh:[-10,0,0],L_Leg:[20,0,0],R_Leg:[20,0,0],L_Foot:[-10,0,0],R_Foot:[-10,0,0],Spine:[-4,0,0]},
   {},{}
  ],hipZ:[0,-.014,-.055,-.12,-.12,-.055,-.014,0,0]}
 ];
 const chunks=[bin];let offset=bin.length;const addFloats=(values,type,min,max)=>{const a=new Uint8Array(values.length*4),d=new DataView(a.buffer);values.forEach((v,i)=>{if(!Number.isFinite(v))throw Error("NaN");d.setFloat32(i*4,v,true)});const vi=j.bufferViews.length; j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:a.length});chunks.push(a);offset+=a.length;const n={SCALAR:1,VEC3:3,VEC4:4}[type],ac={bufferView:vi,componentType:5126,count:values.length/n,type};if(min)ac.min=min;if(max)ac.max=max;const i=j.accessors.length;j.accessors.push(ac);return i};
 const time=addFloats(frames,"SCALAR",[0],[4]);j.animations=[];let maxNormErr=0,animatedKeys=0,changingTracks=0;
 const specs=[];
 for(const spec of clipSpecs){
   const animation={name:spec.name,samplers:[],channels:[]},tracks=[];
   function channel(node,path,output){const sampler=animation.samplers.length;animation.samplers.push({input:time,output,interpolation:"LINEAR"});animation.channels.push({sampler,target:{node,path}})}
   for(const name of animated){
    const idx=byName.get(name),rest=norm(j.nodes[idx].rotation||[0,0,0,1]),qs=spec.frames.map(f=>norm(mul(rest,euler(f[name]||[0,0,0]))));
    for(let i=1;i<qs.length;i++){if(qs[i].reduce((s,v,k)=>s+v*qs[i-1][k],0)<0)qs[i]=qs[i].map(v=>-v)}
    const active=spec.frames.some(f=>f[name]?.some(v=>v!==0));if(active)changingTracks++;
    for(const q of qs){const f=q.map(Math.fround);maxNormErr=Math.max(maxNormErr,Math.abs(Math.hypot(...f)-1))}
    if(qs[0].some((x,i)=>Math.abs(x-rest[i])>1e-7)||qs.at(-1).some((x,i)=>Math.abs(x-rest[i])>1e-7))throw Error("Non-rest endpoints");
    channel(idx,"rotation",addFloats(qs.flat(),"VEC4"));animatedKeys+=qs.length;
    if(active)tracks.push({joint:name,node:idx,localDeltaEulerDegrees:spec.frames.map(f=>f[name]||[0,0,0])})
   }
   const hip=byName.get("Hip"),t=j.nodes[hip].translation||[0,0,0],tz=spec.hipZ||frames.map(()=>0);
   channel(hip,"translation",addFloats(tz.flatMap(z=>[t[0],t[1],t[2]+z]),"VEC3"));animatedKeys+=frames.length;
   j.animations.push(animation);specs.push({name:spec.name,purpose:spec.purpose,durationSeconds:4,keyTimes:frames,rotationChannels:animated.length,translationChannels:1,activeRotationTracks:tracks,hipLocalZDelta:tz});
 }
 const newBin=new Uint8Array(offset);let pos=0;for(const a of chunks){newBin.set(a,pos);pos+=a.length}j.buffers[0].byteLength=offset;j.asset.generator="R36HW V20 standard glTF diagnostic motion kit";
 if(!bin.every((x,i)=>x===newBin[i])||JSON.stringify(j.meshes)!==JSON.stringify(original.meshes)||JSON.stringify(j.skins)!==JSON.stringify(original.skins)||JSON.stringify(j.nodes)!==JSON.stringify(original.nodes)||JSON.stringify(j.materials)!==JSON.stringify(original.materials)||JSON.stringify(j.accessors.slice(0,original.accessors.length))!==JSON.stringify(original.accessors)||JSON.stringify(j.bufferViews.slice(0,original.bufferViews.length))!==JSON.stringify(original.bufferViews))throw Error("Original model changed");
 const s=JSON.stringify(j),jb=new Uint8Array((s.length+3)&~3).fill(32);for(let i=0;i<s.length;i++){if(s.charCodeAt(i)>127)throw Error("non ASCII");jb[i]=s.charCodeAt(i)}
 const out=new Uint8Array(28+jb.length+newBin.length),h=new DataView(out.buffer);[0x46546c67,2,out.length,jb.length,0x4e4f534a].forEach((x,i)=>h.setUint32(i*4,x,true));out.set(jb,20);h.setUint32(20+jb.length,newBin.length,true);h.setUint32(24+jb.length,0x004e4942,true);out.set(newBin,28+jb.length);
 if(maxNormErr>1e-6)throw Error("Bad normalized rotations");
 const manifest={schema:"r36hw-motion-kit-v1",sourceBlob:"189f94cedaaf751ba1379af550eacc9bed579a6b",format:"glTF 2.0 animations",nativeS2:false,space:"joint-local; source Z-up scene root retained",rotationComposition:"rest * (Rz * Ry * Rx)",clipCount:specs.length,clips:specs,notes:["Each clip begins and ends at rest pose.","All 21 test joints and hip translation are keyed in every clip.","Synthetic diagnostic motion only; no S2 animation data or foot IK."]};
 return {glb:out,manifest,report:{schema:"r36hw-v20-motion-build-v1",sourceBlob:manifest.sourceBlob,sourceBytes:src.length,outputBytes:out.length,triangles,joints:j.skins[0].joints.length,animationClips:j.animations.length,channels:j.animations.reduce((s,a)=>s+a.channels.length,0),keyframesPerTrack:frames.length,totalKeyedValues:animatedKeys,nonconstantRotationTracks:changingTracks,appendedAnimationBytes:newBin.length-bin.length,originalBinaryBytesPreserved:bin.length,originalViewsPreserved:original.bufferViews.length,newViews:j.bufferViews.length-original.bufferViews.length,maxFloat32QuaternionNormError:maxNormErr,geometryRigMaterialsUnchanged:true,opaque:true,nativeS2:false,actualRender:false,actualGameAnimation:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.join(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V19.glb [output dir]');const b=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(hash!=='189f94cedaaf751ba1379af550eacc9bed579a6b')throw Error('Wrong input '+hash);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V20_MOTION.glb'),r.glb);fs.writeFileSync(path.join(out,'motion-clips.json'),JSON.stringify(r.manifest,null,2)+'\n');const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
