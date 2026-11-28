#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
function build(src){
 const ck=(c,m)=>{if(!c)throw Error(m)},round=x=>Math.round(x*1e6)/1e6;
 const h=new DataView(src.buffer,src.byteOffset,src.length),jl=h.getUint32(12,true);
 ck(h.getUint32(0,true)===0x46546c67&&h.getUint32(4,true)===2&&h.getUint32(8,true)===src.length&&h.getUint32(16,true)===0x4e4f534a&&h.getUint32(24+jl,true)===0x004e4942,"GLB header");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+jl))),bin=src.slice(28+jl,28+jl+h.getUint32(20+jl,true)),d=new DataView(bin.buffer),ps=j.meshes[0].primitives;
 ck(ps.length===11&&j.skins[0].joints.length===63,"V1 expected");const tri=ps.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);ck(tri===1936,"triangle count");
 const sizes={5121:1,5123:2,5125:4,5126:4},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 function layout(k){let a=j.accessors[k],v=j.bufferViews[a.bufferView],dim=dims[a.type],sz=sizes[a.componentType];ck(!a.sparse&&v.buffer===0&&dim&&sz,"accessor");return {a,dim,off:(v.byteOffset||0)+(a.byteOffset||0),sz,stride:v.byteStride||sz*dim}}
 function read(k){let {a,dim,off,sz,stride}=layout(k),get={5121:"getUint8",5123:"getUint16",5125:"getUint32",5126:"getFloat32"}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:dim},(_,q)=>d[get](off+i*stride+q*sz,true)))}
 function write(k,arr){let {a,dim,off,sz,stride}=layout(k),set={5121:"setUint8",5123:"setUint16",5125:"setUint32",5126:"setFloat32"}[a.componentType];ck(a.count===arr.length,"count");arr.forEach((v,i)=>v.forEach((x,q)=>d[set](off+i*stride+q*sz,x,true)));if(a.min)a.min=Array.from({length:dim},(_,q)=>Math.min(...arr.map(v=>v[q])));if(a.max)a.max=Array.from({length:dim},(_,q)=>Math.max(...arr.map(v=>v[q])))}
 const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len=a=>Math.hypot(...a),unit=a=>len(a)>1e-12?a.map(x=>x/len(a)):[0,0,1],clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a+(b-a)*t,sm=(a,b,x)=>{let t=clamp((x-a)/(b-a));return t*t*(3-2*t)},bump=(a,b,c,x)=>sm(a,b,x)*(1-sm(b,c,x));
 function groups(v,idx){let r=v.map((_,i)=>i),used=new Set(idx),w=new Map();function f(i){return r[i]===i?i:r[i]=f(r[i])}function u(a,b){r[f(a)]=f(b)}for(let i of used){let k=v[i].map(x=>Math.round(x*1e5)).join(",");if(w.has(k))u(i,w.get(k));else w.set(k,i)}for(let i=0;i<idx.length;i+=3){u(idx[i],idx[i+1]);u(idx[i],idx[i+2])}let out=new Map();for(let i of used){let k=f(i);if(!out.has(k))out.set(k,[]);out.get(k).push(i)}return [...out.values()]}
 function bounds(v,ids){return {min:[0,1,2].map(q=>round(Math.min(...ids.map(i=>v[i][q])))),max:[0,1,2].map(q=>round(Math.max(...ids.map(i=>v[i][q]))) )}}
 function normals(v,orig,old,ix,used){let a=v.map(()=>[0,0,0]);for(let i=0;i<ix.length;i+=3){let ids=ix.slice(i,i+3),n=cross(sub(v[ids[1]],v[ids[0]]),sub(v[ids[2]],v[ids[0]]));let ref=ids.reduce((s,k)=>s.map((x,q)=>x+old[k][q]),[0,0,0]);if(dot(n,ref)<0)n=n.map(x=>-x);for(let k of ids)a[k]=a[k].map((x,q)=>x+n[q])}let w=new Map();let keys=orig.map((p,i)=>p.map(x=>Math.round(x*1e5)).join(",")+"|"+old[i].map(x=>Math.round(x*8)).join(","));keys.forEach((k,i)=>{if(!used.has(i))return;let n=w.get(k)||[0,0,0];w.set(k,n.map((x,q)=>x+a[i][q]))});return keys.map((k,i)=>!used.has(i)||len(w.get(k))<1e-10?old[i]:unit(unit(w.get(k)).map((x,q)=>.78*x+.22*old[i][q])))}
 function torso(p){let [x,y,z]=p,shoulder=bump(1.27,1.455,1.54,z),upper=bump(1.23,1.34,1.49,z),waist=bump(1.03,1.155,1.30,z),collar=1-sm(1.49,1.53,z);return [x*mix(1,1+.20*shoulder+.10*upper-.10*waist,collar),.005+(y-.005)*mix(1,1-.08*upper-.06*waist,collar),z]}
 function arm(p){let [x,y,z]=p,a=Math.abs(x),upper=bump(.17,.30,.45,a),fore=bump(.40,.54,.70,a),tip=1-sm(.64,.755,a),rad=1+.30*upper+.23*fore;return [x+Math.sign(x)*.014*sm(.10,.20,a)*tip,.008+(y-.008)*rad,1.414+(z-1.414)*rad]}
 function leg(p){let [x,y,z]=p,cx=Math.sign(x)*.09,cy=-.035,thigh=bump(.55,.80,.99,z),calf=bump(.20,.48,.68,z),w=sm(.17,.34,z)*(1-sm(.93,1.045,z));return [mix(x,cx+(x-cx)*(1+.26*thigh+.20*calf),w),mix(y,cy+(y-cy)*(1+.13*thigh+.12*calf),w),z]}
 function checkMesh(orig,v,ix){let bad=0,deg=0,origDeg=0;for(let k=0;k<ix.length;k+=3){let [a,b,c]=ix.slice(k,k+3),n0=cross(sub(orig[b],orig[a]),sub(orig[c],orig[a])),n1=cross(sub(v[b],v[a]),sub(v[c],v[a]));if(len(n0)<1e-9)origDeg++;if(len(n1)<1e-9)deg++;if(dot(n0,n1)<0)bad++}return {bad,deg,origDeg}}
 const protectedArrays=new Map(),rig=JSON.stringify([j.nodes,j.skins,j.animations]);for(let p of ps){for(let k of [p.indices,p.attributes.JOINTS_0,p.attributes.WEIGHTS_0,p.attributes.TEXCOORD_0].filter(x=>x!==undefined))protectedArrays.set(k,JSON.stringify(read(k)));if([0,1,11,12].includes(p.material))for(let k of Object.values(p.attributes))protectedArrays.set(k,JSON.stringify(read(k)))}
 let exposed=ps.find(p=>p.material===8),exIdx=[...new Set(read(exposed.indices).flat())];function exposedData(){let a=read(exposed.attributes.POSITION),b=read(exposed.attributes.NORMAL),c=read(exposed.attributes.COLOR_0);return JSON.stringify(exIdx.map(i=>[a[i],b[i],c[i]]))}let beforeEx=exposedData();
 let metrics=[],changes=0,newDeg=0;
 for(let p of ps.filter(p=>[15,16,17].includes(p.material))){
  let a=p.attributes.POSITION,orig=read(a),old=read(p.attributes.NORMAL),col=read(p.attributes.COLOR_0),ix=read(p.indices).flat(),ids=[...new Set(ix)],used=new Set(ids),target=orig.map(p=>p.slice()),types=[];
  for(let g of groups(orig,ix)){let type;if(a===101)type=g.length===60?"torso":"shoulder";else if(a===34){let z=Math.min(...g.map(i=>orig[i][2])),x=Math.max(...g.map(i=>Math.abs(orig[i][0])));type=x>.5?"arm":z<.85?"leg":"torso"}else type=({0:"shorts",7:"boot",14:"cuff",21:"seam"})[a];ck(type,"unknown group");types.push(type);
   for(let i of g){let p0=orig[i],[x,y,z]=p0,q=p0.slice(),tone=1;
    if(type==="torso"){q=torso(p0);if(a===101)tone=1-.30*sm(1.49,1.525,z)-.10*sm(.10,.17,Math.abs(x))}
    else if(type==="shoulder"){let t=sm(.11,.21,Math.abs(x)),ta=torso(p0),ar=arm(p0);q=ta.map((v,k)=>mix(v,ar[k],t));q[1]=.008+(q[1]-.008)*.91;tone=.92}
    else if(type==="arm"){q=arm(p0);tone=1-.10*sm(.60,.68,Math.abs(x))}
    else if(type==="leg"||type==="shorts"){q=leg(p0);if(type==="shorts")q[1]=.005+(q[1]-.005)*(1-.06*bump(.80,.89,1.045,z));tone=1-.10*sm(.12,.18,Math.abs(x))}
    else if(type==="boot"){q=leg(p0);let t=1-sm(.11,.24,z),cx=Math.sign(x)*.092;q[0]=mix(q[0],cx+(q[0]-cx)*.93,t);q[1]=mix(q[1],-.045+(q[1]+.045)*.91,t);tone=.91-.25*(1-sm(.035,.09,z))}
    else if(type==="cuff"){q=arm(p0);let t=sm(.68,.755,Math.abs(x));q[1]=.008+(q[1]-.008)*(1-.09*t);q[2]=1.414+(q[2]-1.414)*(1-.09*t);tone=1-.24*sm(.69,.75,Math.abs(x))}
    else if(type==="seam"){q=leg(p0);q[2]=1.029+(z-1.029)*.55;q[0]*=.99;q[1]=.005+(q[1]-.005)*.98;tone=.95}
    target[i]=q;col[i]=col[i].map((x,k)=>k===3?255:Math.round(255*clamp(tone)));
   }
  }
  let alpha=1,v=target,m=checkMesh(orig,v,ix);while((m.bad||m.deg>m.origDeg)&&alpha>.025){alpha*=.75;v=orig.map((p,i)=>p.map((x,k)=>mix(x,target[i][k],alpha)));m=checkMesh(orig,v,ix)}
  ck(m.bad===0&&m.deg<=m.origDeg,"deformation failed "+a);
  let n=normals(v,orig,old,ix,used);write(a,v);write(p.attributes.NORMAL,n);write(p.attributes.COLOR_0,col);
  let changed=ids.filter(i=>len(sub(orig[i],v[i]))>1e-7).length;changes+=changed;newDeg+=m.deg-m.origDeg;
  metrics.push({accessor:a,groups:types,vertices:ids.length,changed,triangles:ix.length/3,acceptedBlend:round(alpha),before:bounds(orig,ids),after:bounds(v,ids),maxDisplacement:round(Math.max(...ids.map(i=>len(sub(orig[i],v[i]))))),normalReversals:m.bad,newDegenerate:m.deg-m.origDeg});
 }
 ck(JSON.stringify([j.nodes,j.skins,j.animations])===rig,"rig changed");for(let [k,v] of protectedArrays)ck(JSON.stringify(read(k))===v,"protected accessor modified "+k);ck(exposedData()===beforeEx,"neck/hands changed");
 for(let [id,name,color] of [[15,"R36HW_V2_SAND_COMPRESSION_TEXTILE",[.66,.48,.34,1]],[16,"R36HW_V2_FLAT_SEAM",[.45,.29,.19,1]],[17,"R36HW_V2_FLEX_FOOTWEAR",[.52,.37,.25,1]]]){let m=j.materials[id];m.name=name;m.alphaMode="OPAQUE";m.pbrMetallicRoughness={baseColorFactor:color,metallicFactor:0,roughnessFactor:.96}}
 j.asset.generator="R36HW V2 athletic compression outfit";j.meshes[0].name="R36HW_F11_ATHLETIC_SUIT_V2";j.extras={...(j.extras||{}),athleticSuitV2:{base:"R36HW fitted suit V1",purpose:"Athletic broad-shouldered silhouette in visibly opaque compression clothing",triangleCount:tri}};
 let js=[];for(let c of JSON.stringify(j)){let n=c.codePointAt(0);if(n<128)js.push(n);else if(n<2048)js.push(192|(n>>6),128|(n&63));else if(n<65536)js.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else js.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}while(js.length%4)js.push(32);
 let out=new Uint8Array(28+js.length+bin.length),dv=new DataView(out.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,out.length,true);dv.setUint32(12,js.length,true);dv.setUint32(16,0x4e4f534a,true);out.set(js,20);dv.setUint32(20+js.length,bin.length,true);dv.setUint32(24+js.length,0x004e4942,true);out.set(bin,28+js.length);
 return {out,report:{sourceBytes:src.length,outputBytes:out.length,triangles:tri,joints:63,changedPositions:changes,newDegenerate:newDeg,protectedAccessors:protectedArrays.size,faceHairEyesNeckHandsUnchanged:true,rigAndWeightsUnchanged:true,metrics,nativeS2Rendered:false,visualAcceptance:false,limitations:["Existing disconnected mesh topology retained; visual pose/seam inspection remains necessary.","Muscle-volume profile is an artistic approximation of the sprite, not a measured 3D reconstruction."]}};
}
const input=process.argv[2]||path.resolve(__dirname,"../../r36hw-fitted-suit-20261129/output/R36HW_F11_FITTED_SUIT.glb"),output=process.argv[3]||path.resolve(__dirname,"../output/R36HW_F11_ATHLETIC_SUIT_V2.glb");
const src=fs.readFileSync(input),hash=crypto.createHash("sha1").update("blob "+src.length+"\0").update(src).digest("hex");if(hash!=="5c23527f2776776492486624361d4e9f2c1dcc7a")throw Error("V1 source mismatch");const b=build(src);b.report.sourceBlob=hash;b.report.parentCommit="a4fbae824de53988f4626e2014a92d963733b0ab";fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,b.out);const report=path.resolve(path.dirname(output),"../reports/build.json");fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(b.report,null,2)+"\n");console.log(JSON.stringify(b.report,null,2));
