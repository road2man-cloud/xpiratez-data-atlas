#!/usr/bin/env node
'use strict';
function build(src){
 const ck=(x,m)=>{if(!x)throw Error(m)},h=new DataView(src.buffer,src.byteOffset,src.length),l=h.getUint32(12,true);
 ck(h.getUint32(0,true)===0x46546c67&&h.getUint32(4,true)===2&&h.getUint32(8,true)===src.length&&h.getUint32(16,true)===0x4e4f534a&&h.getUint32(24+l,true)===0x004e4942,"GLB format");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+l))),bin=src.slice(28+l,28+l+h.getUint32(20+l,true)),original=bin.slice(),d=new DataView(bin.buffer,bin.byteOffset,bin.length),mesh=j.meshes[0],g=mesh.primitives.find(p=>p.material===18),skin=j.skins[0],N=skin.joints.length;
 ck(g.attributes.POSITION===34&&g.attributes.JOINTS_0===36&&g.attributes.WEIGHTS_0===37&&N===63,"V13 expected");
 const preserved=JSON.stringify([j.nodes,j.skins,j.meshes,j.materials,j.accessors,j.bufferViews,j.images,j.samplers,j.textures]);
 const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},size={5121:1,5123:2,5125:4,5126:4},get={5121:"getUint8",5123:"getUint16",5125:"getUint32",5126:"getFloat32"};
 function layout(id){let a=j.accessors[id],b=j.bufferViews[a.bufferView],n=dim[a.type],s=size[a.componentType],o=(a.byteOffset||0)+(b.byteOffset||0),st=b.byteStride||n*s;ck(!a.sparse&&b.buffer===0&&o+(a.count-1)*st+n*s<=bin.length,"accessor");return {a,n,s,o,st}}
 function read(id){let {a,n,s,o,st}=layout(id);return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>d[get[a.componentType]](o+i*st+k*s,true)))}
 const P=read(g.attributes.POSITION),J=read(g.attributes.JOINTS_0),W=read(g.attributes.WEIGHTS_0),I=read(g.indices).flat(),F=Array.from({length:I.length/3},(_,i)=>I.slice(i*3,i*3+3)),ib=read(skin.inverseBindMatrices);
 ck(P.length===706&&F.length===1032&&ib.length===63,"geometry");
 const add=(a,b)=>a.map((x,k)=>x+b[k]),sub=(a,b)=>a.map((x,k)=>x-b[k]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),norm=a=>Math.hypot(...a),key=p=>p.map(x=>Math.round(x*1e6)).join(",");
 const names=skin.joints.map(i=>j.nodes[i].name),ids=Object.fromEntries(names.map((n,i)=>[n,i])),parent=Array(N).fill(-1);
 for(let k=0;k<N;k++)for(let n of j.nodes[skin.joints[k]].children||[]){let q=skin.joints.indexOf(n);if(q>=0)parent[q]=k}
 const piv=ib.map(a=>[-(a[0]*a[12]+a[1]*a[13]+a[2]*a[14]),-(a[4]*a[12]+a[5]*a[13]+a[6]*a[14]),-(a[8]*a[12]+a[9]*a[13]+a[10]*a[14])]);
 function dense(js,w){let a=Array(N).fill(0);for(let k=0;k<4;k++)a[js[k]]+=w[k];return a}
 const old=J.map((js,i)=>dense(js,W[i])),groups=[],lut=new Map(),vg=[];
 for(let i=0;i<P.length;i++){let k=key(P[i]),id=lut.get(k);if(id===undefined){id=groups.length;lut.set(k,id);groups.push({p:P[i],w:old[i].slice(),ids:[]})}ck(norm(sub(groups[id].w,old[i]))<1e-5,"UV seam weights");groups[id].ids.push(i);vg.push(id)}
 const points=groups.map(g=>g.p),base=groups.map(g=>g.w),cur=base.map(w=>w.slice()),edges=new Map();
 for(let f of F)for(let k=0;k<3;k++){let a=vg[f[k]],b=vg[f[(k+1)%3]];if(a===b)continue;let lo=Math.min(a,b),hi=Math.max(a,b);edges.set(lo+":"+hi,{a:lo,b:hi,len:norm(sub(points[lo],points[hi]))})}
 const E=[...edges.values()].filter(e=>e.len>1e-7),desc=(k,a)=>{while(k>=0){if(k===a)return true;k=parent[k]}return false};
 const regions=[],poses=[];
 for(let side of [1,-1]){
  let s=side===1?"L_":"R_",ch=ids.Chest,cl=ids[s+"Clavicle"],ua=ids[s+"UArm"],bone=[ch,cl,ua],eligible=[];
  for(let i=0;i<points.length;i++){let [x,y,z]=points[i],a=x*side,w=base[i];if(a>.095&&a<.405&&z>1.255&&z<1.515&&w[cl]+w[ua]>.025&&w[ch]+w[cl]+w[ua]>.55)eligible.push(i)}
  let eligibleSet=new Set(eligible),scope=E.filter(e=>eligibleSet.has(e.a)||eligibleSet.has(e.b));
  const region={side:s.slice(0,1),bone,eligible,scope};regions.push(region);
  for(let [joint,axis,deg] of [[ua,1,35],[ua,1,65],[ua,1,-30],[ua,2,35],[ua,2,-45],[ua,0,25],[cl,1,15],[cl,1,-15],[cl,2,15],[cl,2,-15]]){
   let th=deg*Math.PI/180*(axis===0?1:side),c=Math.cos(th),sine=Math.sin(th),pivot=piv[joint],mask=Array.from({length:N},(_,i)=>desc(i,joint)),rot=points.map(p=>{let a=sub(p,pivot),u=(axis+1)%3,v=(axis+2)%3,q=a.slice();q[u]=a[u]*c-a[v]*sine;q[v]=a[u]*sine+a[v]*c;return sub(add(pivot,q),p)});
   poses.push({region:region.side,joint:names[joint],axis,angle:deg,mask,rot,scope,importance:joint===ua?1:.65})
  }
 }
 const weight=(w,mask)=>{let s=0;for(let k=0;k<N;k++)if(mask[k])s+=w[k];return s};
 const deformed=(i,w,t)=>add(points[i],mul(t.rot[i],weight(w,t.mask)));
 const strain=(a,b,len)=>Math.log(Math.max(1e-7,norm(sub(a,b))/len));
 const penalty=x=>x*x+.2*Math.pow(Math.max(0,Math.abs(x)-.40),2);
 function evaluate(ws){let sum=0,n=0,peak=0,loss=0,per={};for(let t of poses){let p=points.map((_,i)=>deformed(i,ws[i],t)),r=per[t.region]??={sum:0,n:0,peak:0};for(let e of t.scope){let x=strain(p[e.a],p[e.b],e.len);sum+=x*x;n++;peak=Math.max(peak,Math.abs(x));loss+=t.importance*penalty(x);r.sum+=x*x;r.n++;r.peak=Math.max(r.peak,Math.abs(x))}}for(let r of Object.values(per)){r.rms=Math.sqrt(r.sum/r.n);delete r.sum}return {rms:Math.sqrt(sum/n),peak,edgeSamples:n,weightedLoss:loss,by:per}}
 const before=evaluate(base);
 // Fixed candidate graph and physically bounded local three-bone transfers. No shape or joint edits.
 const eligibleAll=new Set(regions.flatMap(r=>r.eligible)),incident=points.map(()=>[]),adj=points.map(()=>new Set());
 for(let t of poses)for(let e of t.scope){incident[e.a].push({t,other:e.b,len:e.len});incident[e.b].push({t,other:e.a,len:e.len})}
 for(let e of E){adj[e.a].add(e.b);adj[e.b].add(e.a)}
 function local(i,w){let v=0;for(let e of incident[i]){let s=strain(deformed(i,w,e.t),deformed(e.other,cur[e.other],e.t),e.len);v+=e.t.importance*penalty(s)}
  let reg=0;for(let k=0;k<N;k++)reg+=(w[k]-base[i][k])**2;
  v+=.55*reg;
  // Preserve smooth transitions relative to the original weight gradient.
  for(let k of adj[i]){let delta=sub(sub(w,cur[k]),sub(base[i],base[k]));v+=.075*dot(delta,delta)}return v
 }
 let accepted=0,passes=[];
 for(let step of [.075,.045,.025,.0125]){
  for(let pass=0;pass<3;pass++){
   let updates=0;
   for(let region of regions){let order=region.eligible.slice();if(pass%2)order.reverse();
    for(let i of order){let now=cur[i],score=local(i,now),best=now,bc=score;
     for(let a of region.bone)for(let b of region.bone){if(a===b||now[a]<1e-7)continue;let delta=Math.min(step,now[a],.30+now[a]-base[i][a],.30+base[i][b]-now[b]);if(delta<1e-6)continue;let w=now.slice();w[a]-=delta;w[b]+=delta;if(w.filter(x=>x>1e-7).length>4)continue;let c=local(i,w);if(c<bc-1e-9){bc=c;best=w}}
     if(best!==now){cur[i]=best;updates++;accepted++}
    }
   }
   passes.push({step,pass,updates});if(!updates)break;
  }
 }
 const candidate=evaluate(cur);
 ck(accepted>0&&candidate.rms<before.rms&&candidate.weightedLoss<before.weightedLoss,"no improved shoulder solution");
 // Global peak is tracked separately. If it increases, blend toward the original until non-worse.
 let gain=1,chosen=cur,metrics=candidate;while((metrics.peak>before.peak+1e-6||metrics.rms>=before.rms)&&gain>.03125){gain*=.5;chosen=base.map((w,i)=>w.map((v,k)=>v+(cur[i][k]-v)*gain));metrics=evaluate(chosen)}
 ck(metrics.rms<before.rms&&metrics.peak<=before.peak+1e-6,"peak guard");
 function pack(w){let a=w.map((v,k)=>[k,v]).filter(x=>x[1]>1e-7).sort((a,b)=>b[1]-a[1]||a[0]-b[0]);ck(a.length<=4,"too many weights");let s=a.reduce((s,x)=>s+x[1],0);while(a.length<4)a.push([0,0]);return [a.map(x=>x[0]),a.map(x=>x[1]/s)]}
 let changed=[],changedGroups=new Set(),ranges=[];
 const jl=layout(g.attributes.JOINTS_0),wl=layout(g.attributes.WEIGHTS_0);ck(jl.a.componentType===5123&&wl.a.componentType===5126&&jl.st===8&&wl.st===16,"skin layout");
 for(let i=0;i<P.length;i++){let w=chosen[vg[i]];if(norm(sub(w,old[i]))<1e-7)continue;ck(eligibleAll.has(vg[i]),"outside shoulder");let [js,ws]=pack(w);for(let k=0;k<4;k++){d.setUint16(jl.o+i*jl.st+k*2,js[k],true);d.setFloat32(wl.o+i*wl.st+k*4,ws[k],true)}changed.push(i);changedGroups.add(vg[i])}
 ranges.push([jl.o,jl.o+jl.a.count*jl.st],[wl.o,wl.o+wl.a.count*wl.st]);
 let changedBytes=0;for(let i=0;i<bin.length;i++)if(bin[i]!==original[i]){ck(ranges.some(([a,b])=>i>=a&&i<b),"non-weight binary changed");changedBytes++}
 const J1=read(g.attributes.JOINTS_0),W1=read(g.attributes.WEIGHTS_0),D1=J1.map((js,i)=>dense(js,W1[i]));for(let i=0;i<P.length;i++){ck(Math.abs(W1[i].reduce((s,x)=>s+x,0)-1)<1e-5&&W1[i].every(v=>v>=0),"normalized weights");if(!eligibleAll.has(vg[i]))ck(norm(sub(D1[i],old[i]))<1e-8,"protected weight")}
 for(let group of groups){for(let i of group.ids)ck(norm(sub(D1[i],D1[group.ids[0]]))<1e-5,"UV seam mismatch")}
 const after=evaluate(groups.map(g=>D1[g.ids[0]]));
 ck(after.rms<before.rms&&after.peak<=before.peak+1e-6&&changed.length>0,"stored solution guard");
 ck(JSON.stringify([j.nodes,j.skins,j.meshes,j.materials,j.accessors,j.bufferViews,j.images,j.samplers,j.textures])===preserved,"protected JSON");
 const tri=mesh.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);ck(tri===2100&&j.materials[18].alphaMode==="OPAQUE","budget");
 j.asset.generator="R36HW V14 shoulder three-bone constrained optimization";j.extras={...(j.extras||{}),athleticSuitV14:{source:"V13",shoulderWeightsOnly:true,syntheticPoseProxy:true}};
 let js=[];for(let c of JSON.stringify(j)){let n=c.codePointAt(0);if(n<128)js.push(n);else if(n<2048)js.push(192|(n>>6),128|(n&63));else if(n<65536)js.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else js.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}while(js.length%4)js.push(32);
 let out=new Uint8Array(28+js.length+bin.length),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,js.length,true);v.setUint32(16,0x4e4f534a,true);out.set(js,20);v.setUint32(20+js.length,bin.length,true);v.setUint32(24+js.length,0x004e4942,true);out.set(bin,28+js.length);
 return {out,report:{sourceBlob:"b48db6db2cdf0bdc40ba684550125a339167a2c6",triangles:tri,joints:N,garmentVertices:P.length,changedSkinVertices:changed.length,changedWeldedPoints:changedGroups.size,protectedVertices:P.length-[...eligibleAll].reduce((s,i)=>s+groups[i].ids.length,0),eligibleBySide:regions.map(r=>({side:r.side,points:r.eligible.length,changed:r.eligible.filter(i=>changedGroups.has(i)).length})),changedBinaryBytes:changedBytes,acceptedTransfers:accepted,blend:gain,passes,syntheticPoses:poses.length,proxyBefore:before,proxyAfter:after,rmsReductionPercent:100*(before.rms-after.rms)/before.rms,peakReductionPercent:100*(before.peak-after.peak)/before.peak,allNonWeightBytesPreserved:true,geometryPreserved:true,materialPreserved:true,rigPreserved:true,uvSeamWeightsMatched:true,outputBytes:out.length,nativeS2Rendered:false,visualAcceptance:false,limitations:["Synthetic single-joint rotations and fixed edge-strain proxy, not native S2 animations.","No claim of actual posed clipping or volume preservation.","Only existing mesh skin weights within a bounded shoulder region were optimized."]}}
}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-athletic-v13-warm-ochre-20261129/output/R36HW_F11_ATHLETIC_SUIT_V13_WARM_OCHRE.glb'),output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_F11_ATHLETIC_SUIT_V14_SHOULDER.glb');
const src=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');if(hash!=='b48db6db2cdf0bdc40ba684550125a339167a2c6')throw Error('V13 blob mismatch');const r=build(src);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,r.out);const report=path.resolve(path.dirname(output),'../reports/build.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));
