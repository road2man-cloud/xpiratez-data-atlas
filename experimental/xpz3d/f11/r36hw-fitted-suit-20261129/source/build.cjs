#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
function build(src){
 const check=(b,m)=>{if(!b)throw Error(m)},rnd=x=>Math.round(x*1e6)/1e6;
 const h=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=h.getUint32(12,true);
 check(h.getUint32(0,true)===0x46546c67&&h.getUint32(4,true)===2&&h.getUint32(8,true)===src.length&&h.getUint32(16,true)===0x4e4f534a&&h.getUint32(24+jl,true)===0x004e4942,"GLB header");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+jl))), bin=src.slice(28+jl,28+jl+h.getUint32(20+jl,true)),d=new DataView(bin.buffer);
 check(j.meshes.length===1&&j.meshes[0].primitives.length===15&&j.skins[0].joints.length===63,"source shape");
 const ps=j.meshes[0].primitives, st=ps.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);
 check(st===2098,"source triangles "+st);
 const rig=JSON.stringify([j.nodes,j.skins,j.animations]);
 const sizes={5121:1,5123:2,5125:4,5126:4},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 function layout(k){let a=j.accessors[k],v=j.bufferViews[a.bufferView],dim=dims[a.type],sz=sizes[a.componentType];check(!a.sparse&&v.buffer===0&&sz&&dim,"accessor format");return {a,dim,sz,off:(v.byteOffset||0)+(a.byteOffset||0),stride:v.byteStride||sz*dim}}
 function read(k){let {a,dim,sz,off,stride}=layout(k),get={5121:"getUint8",5123:"getUint16",5125:"getUint32",5126:"getFloat32"}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:dim},(_,q)=>d[get](off+i*stride+q*sz,true)))}
 function write(k,arr){let {a,dim,sz,off,stride}=layout(k),set={5121:"setUint8",5123:"setUint16",5125:"setUint32",5126:"setFloat32"}[a.componentType];check(arr.length===a.count,"count mismatch");arr.forEach((v,i)=>v.forEach((x,q)=>d[set](off+i*stride+q*sz,x,true)));if(a.min)a.min=Array.from({length:dim},(_,q)=>Math.min(...arr.map(v=>v[q])));if(a.max)a.max=Array.from({length:dim},(_,q)=>Math.max(...arr.map(v=>v[q])))}
 function groups(v,idx){let root=v.map((_,i)=>i);function f(i){return root[i]===i?i:root[i]=f(root[i])}function u(a,b){root[f(a)]=f(b)}let weld=new Map();v.forEach((p,i)=>{let key=p.map(x=>Math.round(x*1e5)).join(",");if(weld.has(key))u(i,weld.get(key));else weld.set(key,i)});for(let i=0;i<idx.length;i+=3){u(idx[i],idx[i+1]);u(idx[i],idx[i+2])}let out=new Map();v.forEach((_,i)=>{let k=f(i);if(!out.has(k))out.set(k,[]);out.get(k).push(i)});return [...out.values()]}
 const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a),unit=a=>len(a)>1e-10?a.map(x=>x/len(a)):[0,0,1];
 const clamp=x=>Math.max(0,Math.min(1,x)),sm=(a,b,x)=>{let t=clamp((x-a)/(b-a));return t*t*(3-2*t)},mix=(a,b,t)=>a+(b-a)*t;
 const bounds=v=>({min:[0,1,2].map(q=>rnd(Math.min(...v.map(p=>p[q])))),max:[0,1,2].map(q=>rnd(Math.max(...v.map(p=>p[q]))))});
 const deg=(v,idx)=>{let c=0;for(let i=0;i<idx.length;i+=3)if(len(cross(sub(v[idx[i+1]],v[idx[i]]),sub(v[idx[i+2]],v[idx[i]])))<1e-9)c++;return c};
 function normals(v,orig,old,idx){let sums=v.map(()=>[0,0,0]);for(let i=0;i<idx.length;i+=3){let ids=idx.slice(i,i+3),n=cross(sub(v[ids[1]],v[ids[0]]),sub(v[ids[2]],v[ids[0]])),ref=ids.reduce((a,id)=>a.map((x,q)=>x+old[id][q]),[0,0,0]);if(dot(n,ref)<0)n=n.map(x=>-x);for(let id of ids)sums[id]=sums[id].map((x,q)=>x+n[q])}let buckets=new Map(),keys=orig.map((p,i)=>p.map(x=>Math.round(x*1e5)).join(",")+"|"+old[i].map(x=>Math.round(x*10)).join(","));keys.forEach((k,i)=>{let s=buckets.get(k)||[0,0,0];buckets.set(k,s.map((x,q)=>x+sums[i][q]))});return keys.map((k,i)=>{let s=buckets.get(k);if(len(s)<1e-9)return old[i];return unit(unit(s).map((x,q)=>0.62*x+0.38*old[i][q]))})}
 function material(name,color){let n=j.materials.length;j.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:0,roughnessFactor:0.96},alphaMode:"OPAQUE",doubleSided:false});return n}
 const suit=material("R36HW_FITTED_SUIT_OPAQUE_SAND_TEXTILE",[0.68,0.49,0.34]),edge=material("R36HW_FITTED_SUIT_SEAM",[0.48,0.31,0.20]),foot=material("R36HW_FITTED_SUIT_FLEX_FOOTWEAR",[0.57,0.40,0.27]);
 let extras=[],offset=bin.length;function add(b){extras.push(b);offset+=b.length}function align(){let n=(4-offset%4)%4;if(n)add(new Uint8Array(n))}
 function addIndices(idx){align();let b=new Uint8Array(idx.length*2),dv=new DataView(b.buffer);idx.forEach((x,i)=>dv.setUint16(i*2,x,true));let vi=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length,target:34963});add(b);let ai=j.accessors.length;j.accessors.push({bufferView:vi,byteOffset:0,componentType:5123,count:idx.length,type:"SCALAR",min:[Math.min(...idx)],max:[Math.max(...idx)]});return ai}
 const removed=new Set([7,9,10,13,14]),protect=new Set([0,1,11,12]),result=[],metrics=[],removedNames=[],immutable=new Map();
 for(let p of ps){
   let m=p.material,name=j.materials[m].name,idx=read(p.indices).flat(),v=read(p.attributes.POSITION);
   if(removed.has(m)){removedNames.push({name,triangles:idx.length/3});continue}
   if(protect.has(m)){result.push(p);for(let k of [...Object.values(p.attributes),p.indices])immutable.set(k,JSON.stringify(read(k)));continue}
   let cols=read(p.attributes.COLOR_0),old=read(p.attributes.NORMAL),moved=v.map(a=>a.slice());const color=(i,f)=>{cols[i]=cols[i].map((x,q)=>q===3?255:Math.round(255*clamp(f)))};
   if(m===8){
     let clothed=new Set(),exposed=new Set();
     for(let ids of groups(v,idx)){let z=Math.min(...ids.map(i=>v[i][2])),x=Math.max(...ids.map(i=>Math.abs(v[i][0]))),cloth=!(z>1.48&&x<0.1)&&!(x>0.80);for(let id of ids)(cloth?clothed:exposed).add(id)}
     check(clothed.size===166&&exposed.size===64,"component split");let ci=[],ei=[];
     for(let i=0;i<idx.length;i+=3){let t=idx.slice(i,i+3),n=t.filter(k=>clothed.has(k)).length;check(n===0||n===3,"mixed triangle");(n===3?ci:ei).push(...t)}
     for(let id of clothed){let [x,y,z]=v[id];color(id,Math.abs(x)>0.18&&z>1.3?mix(0.92,1,sm(0.20,0.35,Math.abs(x))):1)}
     write(p.attributes.COLOR_0,cols);result.push({...p,indices:addIndices(ei)},{...p,material:suit,indices:addIndices(ci)});
     metrics.push({name:"existing skin panels assigned opaque cloth; neck and hands unchanged",garmentTriangles:ci.length/3,exposedTriangles:ei.length/3,garmentVertices:clothed.size,exposedVertices:exposed.size,positionChanges:0});continue;
   }
   if(m===2){for(let ids of groups(v,idx)){let torso=ids.length===60;for(let i of ids){let [x,y,z]=v[i];if(torso){let t=sm(1.205,1.32,z),u=sm(1.46,1.526,z),sx=mix(mix(0.99,0.91,t),0.96,u),sy=mix(mix(0.94,0.85,t),0.96,u);moved[i]=[x*sx,0.005+(y-0.005)*sy,z];color(i,mix(1,0.79,sm(1.49,1.526,z)))}else{let t=sm(0.10,0.22,Math.abs(x));moved[i]=[x,0.006+(y-0.006)*mix(0.94,0.77,t),1.414+(z-1.414)*mix(0.95,0.76,t)];color(i,0.98)}}}}
   else if(m===3){for(let i=0;i<v.length;i++){let [x,y,z]=v[i],low=1-sm(0.83,0.90,z),top=sm(0.96,1.045,z),cx=Math.sign(x)*0.09*low;moved[i]=[cx+(x-cx)*mix(mix(0.94,0.86,low),0.99,top),0.005+(y-0.005)*mix(0.90,0.96,top),z];color(i,1)}}
   else if(m===4){for(let i=0;i<v.length;i++){let [x,y,z]=v[i],t=sm(0.12,0.22,z),top=sm(0.32,0.443,z),cx=Math.sign(x)*0.092,cy=-0.04;moved[i]=[cx+(x-cx)*mix(1,mix(0.82,0.90,top),t),cy+(y-cy)*mix(1,mix(0.84,0.91,top),t),z];color(i,z<0.045?0.70:mix(0.9,1,t))}}
   else if(m===5){for(let i=0;i<v.length;i++){let [x,y,z]=v[i];moved[i]=[x,0.009+(y-0.009)*0.93,1.414+(z-1.414)*0.94];color(i,Math.abs(x)>0.73?0.86:1)}}
   else if(m===6){for(let i=0;i<v.length;i++){let [x,y,z]=v[i];moved[i]=[x*0.973,0.008+(y-0.008)*0.962,1.029+(z-1.028)*0.31];color(i,1)}}
   else throw Error("unknown material "+m);
   check(deg(moved,idx)<=deg(v,idx),"new degenerate triangles");
   write(p.attributes.POSITION,moved);write(p.attributes.NORMAL,normals(moved,v,old,idx));write(p.attributes.COLOR_0,cols);
   result.push({...p,material:m===6?edge:m===4?foot:suit});
   metrics.push({name,triangles:idx.length/3,vertices:v.length,changedPositions:moved.filter((a,i)=>len(sub(a,v[i]))>1e-7).length,maxDisplacement:rnd(Math.max(...moved.map((a,i)=>len(sub(a,v[i]))))),before:bounds(v),after:bounds(moved),degenerateBefore:deg(v,idx),degenerateAfter:deg(moved,idx)});
 }
 for(let [k,s] of immutable)check(JSON.stringify(read(k))===s,"protected geometry modified");
 check(JSON.stringify([j.nodes,j.skins,j.animations])===rig,"rig modified");
 const ot=result.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);
 check(ot===st-removedNames.reduce((s,x)=>s+x.triangles,0)&&ot===1936,"triangle mismatch "+ot);
 j.meshes[0].primitives=result;j.meshes[0].name="R36HW_F11_FITTED_OPAQUE_SAND_SUIT";j.asset.generator="R36HW fitted suit derivative v1";j.extras={...(j.extras||{}),fittedSuit:{purpose:"Opaque warm-beige compression garment; original character identity and rig preserved.",sourceTriangleCount:st,outputTriangleCount:ot}};
 align();let ob=new Uint8Array(offset);ob.set(bin);let pos=bin.length;for(let x of extras){ob.set(x,pos);pos+=x.length}j.buffers[0].byteLength=ob.length;
 let js=[];for(let c of JSON.stringify(j)){let n=c.codePointAt(0);if(n<128)js.push(n);else if(n<2048)js.push(192|(n>>6),128|(n&63));else if(n<65536)js.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else js.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}while(js.length%4)js.push(32);
 let out=new Uint8Array(28+js.length+ob.length),dv=new DataView(out.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,out.length,true);dv.setUint32(12,js.length,true);dv.setUint32(16,0x4e4f534a,true);out.set(js,20);dv.setUint32(20+js.length,ob.length,true);dv.setUint32(24+js.length,0x004e4942,true);out.set(ob,28+js.length);
 for(let p of result){let a=j.accessors[p.attributes.POSITION],ix=j.accessors[p.indices];check(ix.count%3===0&&ix.max[0]<a.count,"index range");check(j.accessors[p.attributes.JOINTS_0].count===a.count&&j.accessors[p.attributes.WEIGHTS_0].count===a.count,"weight count")}
 for(let v of j.bufferViews)check((v.byteOffset||0)+v.byteLength<=ob.length,"buffer range");
 return {out,report:{sourceBytes:src.length,outputBytes:out.length,sourceTriangles:st,outputTriangles:ot,sourceJoints:63,outputJoints:j.skins[0].joints.length,sourcePrimitives:ps.length,outputPrimitives:result.length,removed:removedNames,metrics,unchanged:{protectedFaceHairEyeAccessors:immutable.size,nodeHierarchy:true,skinDefinition:true,animations:true},validation:{glbHeader:true,indexRanges:true,skinAttributeCounts:true,bufferBounds:true,noNewDegenerateTriangles:true,nativeS2Rendering:false,visualInspection:false},limitations:["No global remesh; garment intersection and skinning in poses need visual inspection.","No native S2 rendering performed."]}};
}
const input=process.argv[2]||path.resolve(__dirname,"../../r36kp/reference/R36HW_F11_CLOTHED.glb"),output=process.argv[3]||path.resolve(__dirname,"../output/R36HW_F11_FITTED_SUIT.glb");
const source=fs.readFileSync(input),sha=crypto.createHash("sha1").update("blob "+source.length+"\0").update(source).digest("hex");if(sha!=="6bb853074804086a73bc82d81950f3614b954e72")throw Error("Source blob mismatch "+sha);
const b=build(source);b.report.sourceGitBlob=sha;b.report.baseCommit="28da5dd08d27d227b857758d1c2d638521e4de1a";fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,b.out);const r=path.resolve(path.dirname(output),"../reports/build.json");fs.mkdirSync(path.dirname(r),{recursive:true});fs.writeFileSync(r,JSON.stringify(b.report,null,2)+"\n");console.log(JSON.stringify(b.report,null,2));
