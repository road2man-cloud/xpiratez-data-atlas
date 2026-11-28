// R36HW V17 reproducible normal/tangent-only patch, Node.js without external dependencies.
function build(src){
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),len=a=>Math.sqrt(dot(a,a)),unit=a=>{let l=len(a);if(l<1e-12)throw Error("zero vector");return mul(a,1/l)},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),angle=(a,b)=>Math.acos(clamp(dot(unit(a),unit(b)),-1,1)),deg=a=>a*180/Math.PI,eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 const dv=new DataView(src.buffer,src.byteOffset,src.byteLength);
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==src.length)throw Error("bad GLB");
 const l=dv.getUint32(12,true),binlen=dv.getUint32(20+l,true),base=28+l;
 if(dv.getUint32(16,true)!==0x4e4f534a||dv.getUint32(24+l,true)!==0x004e4942||base+binlen!==src.length)throw Error("bad chunks");
 // GLB JSON is retained byte-for-byte; only float data is changed.
 const json=JSON.parse(String.fromCharCode(...src.subarray(20,20+l)));
 const prim=json.meshes[0].primitives.find(p=>p.material===18),attrs=prim.attributes;
 if(attrs.POSITION!==34||attrs.NORMAL!==35||attrs.TANGENT!==40||prim.indices!==41||json.materials[18].alphaMode!=="OPAQUE"||json.skins[0].joints.length!==63)throw Error("unexpected input");
 const triangles=json.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+json.accessors[p.indices].count/3,0);
 if(triangles!==2100)throw Error("triangle budget");
 const output=src.slice(),ov=new DataView(output.buffer);
 function accessor(id,view=dv){const a=json.accessors[id],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sz={5121:1,5123:2,5126:4}[a.componentType];if(!sz||!n)throw Error("type");const addr=(i,k)=>base+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*sz)+k*sz;return {id,count:a.count,viewId:a.bufferView,read:i=>Array.from({length:n},(_,k)=>sz===1?view.getUint8(addr(i,k)):sz===2?view.getUint16(addr(i,k),true):view.getFloat32(addr(i,k),true)),all:()=>Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>sz===1?view.getUint8(addr(i,k)):sz===2?view.getUint16(addr(i,k),true):view.getFloat32(addr(i,k),true))),write:(i,arr)=>{if(sz!==4)throw Error("not float");for(let k=0;k<n;k++)ov.setFloat32(addr(i,k),arr[k],true)}}}
 const p=accessor(34).all(),n0=accessor(35).all(),t0=accessor(40).all(),ix=accessor(41).all().flat(),normAcc=accessor(35),tanAcc=accessor(40);
 const key=x=>x.map(y=>Math.round(y*1e5)).join(",");
 const groups=new Map(),groupOf=p.map((x,i)=>{let k=key(x);if(!groups.has(k))groups.set(k,{indices:[],corners:[],neighbors:new Set()});groups.get(k).indices.push(i);return k});
 // Protect shared contact points with other materials and actual open boundaries.
 const otherPositions=[];for(const pr of json.meshes[0].primitives)if(pr!==prim)otherPositions.push(...accessor(pr.attributes.POSITION).all());
 const edges=new Map(),faces=[];
 function edge(a,b){const s=a<b?a+"|"+b:b+"|"+a;edges.set(s,(edges.get(s)||0)+1)}
 for(let i=0;i<ix.length;i+=3){
   const ids=ix.slice(i,i+3),ks=ids.map(v=>groupOf[v]),a=p[ids[0]],b=p[ids[1]],c=p[ids[2]],fn=unit(cross(sub(b,a),sub(c,a)));faces.push(fn);
   if(new Set(ks).size!==3)throw Error("degenerate welded face");
   for(let k=0;k<3;k++){const v=ids[k],prev=ids[(k+2)%3],next=ids[(k+1)%3],w=angle(sub(p[prev],p[v]),sub(p[next],p[v]));const g=groups.get(ks[k]);g.corners.push({v,fn,w});g.neighbors.add(ks[(k+1)%3]);g.neighbors.add(ks[(k+2)%3]);edge(ks[k],ks[(k+1)%3])}
 }
 const boundary=new Set();for(const [s,c] of edges)if(c!==2)s.split("|").forEach(k=>boundary.add(k));
 const contact=new Set(),crease=new Set(),protectedGroups=new Set(boundary);
 for(const [k,g] of groups){
   const q=p[g.indices[0]];
   if(otherPositions.some(v=>dot(sub(v,q),sub(v,q))<0.000025)){contact.add(k);protectedGroups.add(k)}
   // Keep intentional hard turns (soles/caps, sharp seams) rather than averaging across them.
   for(let a=0;a<g.corners.length;a++)for(let b=a+1;b<g.corners.length;b++)if(dot(g.corners[a].fn,g.corners[b].fn)<Math.cos(75*Math.PI/180)){crease.add(k);protectedGroups.add(k)}
   for(const i of g.indices)if(angle(n0[i],n0[g.indices[0]])>1e-4)throw Error("unexpected source seam");
 }
 const oldNormals=n0.map(unit),newNormals=oldNormals.map(a=>a.slice());
 let changed=0,changedGroups=0,largestTurn=0,maxSeam=0,localImproved=0;
 const maxTurn=12*Math.PI/180;
 const cost=(g,arr)=>g.corners.reduce((s,c)=>s+c.w*(1-dot(arr[c.v],c.fn)),0);
 for(const [k,g] of groups){
   if(protectedGroups.has(k)||!g.corners.length)continue;
   const ref=oldNormals[g.indices[0]];
   const sum=g.corners.reduce((s,c)=>add(s,mul(c.fn,c.w)),[0,0,0]);if(len(sum)<1e-10)continue;
   const target=unit(sum),a=angle(ref,target);if(a<1e-4)continue;
   // Conservative 70% move toward corner-angle weighted target, clamped at 12 degrees.
   const move=Math.min(a*.7,maxTurn),t=move/a;
   let next;
   if(a<1e-5)next=target;else next=unit(add(mul(ref,Math.sin((1-t)*a)/Math.sin(a)),mul(target,Math.sin(t*a)/Math.sin(a))));
   const before=cost(g,oldNormals);
   const after=g.corners.reduce((s,c)=>s+c.w*(1-dot(next,c.fn)),0);
   if(after>=before-1e-9)continue;
   changedGroups++;localImproved++;largestTurn=Math.max(largestTurn,deg(angle(ref,next)));
   for(const i of g.indices){newNormals[i]=next;changed++}
 }
 if(changed<20)throw Error("no meaningful shading work");
 // Project existing UV tangent onto the new normal plane, retain source sign.
 for(let i=0;i<p.length;i++){
   if(newNormals[i]===oldNormals[i]||eq(newNormals[i],oldNormals[i]))continue;
   const nn=newNormals[i],t=t0[i].slice(0,3),t1=unit(sub(t,mul(nn,dot(t,nn))));
   normAcc.write(i,nn);tanAcc.write(i,[...t1,t0[i][3]]);
 }
 const n1=accessor(35,ov).all(),t1=accessor(40,ov).all();
 function metrics(ns,ts){
   let w=0,error=0,chord=0,max=0;for(const g of groups.values())for(const c of g.corners){const a=angle(ns[c.v],c.fn);w+=c.w;error+=c.w*a*a;chord+=c.w*(1-dot(unit(ns[c.v]),c.fn));max=Math.max(max,a)}
   return {cornerWeightedRmsDegrees:deg(Math.sqrt(error/w)),cornerWeightedChordError:chord/w,maxCornerAngleDegrees:deg(max),maxNormalLengthError:Math.max(...ns.map(n=>Math.abs(len(n)-1))),maxTangentDot:Math.max(...ts.map((t,i)=>Math.abs(dot(t.slice(0,3),ns[i])))),maxTangentLengthError:Math.max(...ts.map(t=>Math.abs(len(t.slice(0,3))-1)))};
 }
 const before=metrics(n0,t0),after=metrics(n1,t1);
 for(const g of groups.values())for(const i of g.indices)maxSeam=Math.max(maxSeam,deg(angle(n1[i],n1[g.indices[0]])));
 if(after.cornerWeightedChordError>=before.cornerWeightedChordError||maxSeam>.001||after.maxTangentDot>1e-6||after.maxNormalLengthError>1e-6)throw Error("shading QA");
 const modified=[],preserved=[];
 json.bufferViews.forEach((v,i)=>{const a=base+(v.byteOffset||0),b=a+v.byteLength;(eq(src.subarray(a,b),output.subarray(a,b))?preserved:modified).push(i)});
 if(modified.join(",")!==[normAcc.viewId,tanAcc.viewId].sort((a,b)=>a-b).join(",")||!eq(src.subarray(0,base),output.subarray(0,base)))throw Error("unexpected binary changes");
 for(let i=0;i<t0.length;i++)if(t0[i][3]!==t1[i][3])throw Error("tangent sign changed");
 for(const k of protectedGroups)for(const i of groups.get(k).indices)if(!eq(n0[i],n1[i])||!eq(t0[i],t1[i]))throw Error("protected vertex changed");
 return {output,report:{schema:"r36hw-v17-shading-v1",sourceBlob:"fdb982500bed8f9773f62516b5f4b0323812aba3",bytes:output.length,triangles,joints:json.skins[0].joints.length,garmentVertices:p.length,weldedGroups:groups.size,changedVertices:changed,changedWeldedGroups:changedGroups,protectedGroups:protectedGroups.size,boundaryGroups:boundary.size,nearOtherMaterialGroups:contact.size,sharpCreaseGroups:crease.size,largestNormalTurnDegrees:largestTurn,maxSeamMismatchDegrees:maxSeam,metricsBefore:before,metricsAfter:after,chordErrorReductionPercent:100*(1-after.cornerWeightedChordError/before.cornerWeightedChordError),rmsReductionPercent:100*(1-after.cornerWeightedRmsDegrees/before.cornerWeightedRmsDegrees),modifiedBufferViews:modified,preservedBufferViews:preserved,jsonByteIdentical:true,geometryAndWeightsUnchanged:true,tangentSignsUnchanged:true,nativeS2:false,visualRender:false,method:"corner-angle weighted face normal fit, 70% spherical interpolation capped at 12 degrees; preserve open edges, contacts and sharp creases; reproject existing tangents"}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const inFile=process.argv[2],out=process.argv[3]||path.join(__dirname,'../output');if(!inFile)throw Error('Usage: node build.cjs V16.glb [output dir]');const src=fs.readFileSync(inFile);const hash=crypto.createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');if(hash!=='fdb982500bed8f9773f62516b5f4b0323812aba3')throw Error('Unexpected input blob '+hash);const r=build(src);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V17_SHADING.glb'),r.output);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));}
