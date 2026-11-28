// V21 constrained sleeve and shin mesh relaxation. Node.js, no dependencies.
function build(src){
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,k)=>a.map(x=>x*k),len=a=>Math.hypot(...a),unit=a=>{const l=len(a);return l>1e-12?mul(a,1/l):[0,0,0]},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angle=(a,b)=>Math.acos(clamp(dot(unit(a),unit(b)),-1,1)),same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 const dv=new DataView(src.buffer,src.byteOffset,src.byteLength),l=dv.getUint32(12,true),base=28+l;
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==src.length||dv.getUint32(16,true)!==0x4e4f534a||dv.getUint32(24+l,true)!==0x004e4942||base+dv.getUint32(20+l,true)!==src.length)throw Error("Bad GLB");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+l))),orig=JSON.parse(JSON.stringify(j)),bin=src.slice(base),dvout=new DataView(bin.buffer);
 const prim=j.meshes[0].primitives.find(p=>p.material===18);if(!prim||prim.attributes.POSITION!==34||prim.attributes.NORMAL!==35||prim.attributes.TANGENT!==40||prim.indices!==41||j.materials[18].alphaMode!=="OPAQUE"||j.skins[0].joints.length!==63)throw Error("Unexpected source model");
 const triangles=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);if(triangles!==2100)throw Error("Triangle budget");
 function accessor(id){const a=j.accessors[id],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sz={5121:1,5123:2,5126:4}[a.componentType];const addr=(i,k)=>(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*sz)+k*sz;return {read:i=>Array.from({length:n},(_,k)=>{const o=base+addr(i,k);return sz===1?dv.getUint8(o):sz===2?dv.getUint16(o,true):dv.getFloat32(o,true)}),all:()=>Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{const o=base+addr(i,k);return sz===1?dv.getUint8(o):sz===2?dv.getUint16(o,true):dv.getFloat32(o,true)})),write:(i,val)=>{if(sz!==4)throw Error("not float");val.forEach((x,k)=>dvout.setFloat32(addr(i,k),x,true))},view:a.bufferView}}
 const pa=accessor(34),na=accessor(35),ta=accessor(40),p=pa.all(),n0=na.all(),t0=ta.all(),indices=accessor(41).all().flat();
 // Weld exact-position UV copies for geometric edits, retaining all original vertex IDs.
 const groupMap=new Map(),g=[],gid=p.map((q,i)=>{const k=q.map(x=>Math.round(x*1e5)).join(",");if(!groupMap.has(k)){groupMap.set(k,g.length);g.push({p:q.slice(),source:q.slice(),ids:[],neighbors:new Set(),faces:[]})}const id=groupMap.get(k);g[id].ids.push(i);return id});
 const edges=new Map(),faces=[];
 const edgeKey=(a,b)=>a<b?a+","+b:b+","+a;
 function geom(a,b,c){const ab=sub(b,a),bc=sub(c,b),ca=sub(a,c),nn=cross(ab,sub(c,a)),area=len(nn),den=dot(ab,ab)+dot(bc,bc)+dot(ca,ca);return {normal:unit(nn),area,quality:den>0?2*Math.sqrt(3)*area/den:0}}
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),gs=ids.map(i=>gid[i]),m=geom(...ids.map(i=>p[i]));if(new Set(gs).size!==3||m.area<1e-10)throw Error("Degenerate source face");const id=faces.length;faces.push({ids,gs,m});for(let k=0;k<3;k++){const a=gs[k],b=gs[(k+1)%3];g[a].faces.push(id);g[a].neighbors.add(b);g[b].neighbors.add(a);const e=edgeKey(a,b);edges.set(e,(edges.get(e)||0)+1)}}
 const open=new Set();for(const [k,v] of edges)if(v!==2)k.split(",").forEach(x=>open.add(+x));
 const other=[];for(const q of j.meshes[0].primitives)if(q!==prim)other.push(...accessor(q.attributes.POSITION).all());
 // Restrict edits to sleeves and shin fabric, explicitly excluding torso/pelvis and cuffs.
 function region(q){const [x,y,z]=q,ax=Math.abs(x);if(ax>.31&&ax<.59&&z>1.28&&z<1.53)return x>0?"leftSleeve":"rightSleeve";if(z>.20&&z<.59&&ax>.025&&ax<.23)return x>0?"leftShin":"rightShin";return null}
 const allowed=new Set(),blocked={outside:0,edge:0,contact:0,crease:0};
 for(let i=0;i<g.length;i++){const a=g[i];a.region=region(a.source);if(!a.region){blocked.outside++;continue}if(open.has(i)){blocked.edge++;continue}if(other.some(p=>len(sub(p,a.source))<.012)){blocked.contact++;continue}
 let sharp=false;for(let x=0;x<a.faces.length;x++)for(let y=x+1;y<a.faces.length;y++)if(dot(faces[a.faces[x]].m.normal,faces[a.faces[y]].m.normal)<Math.cos(70*Math.PI/180))sharp=true;
 if(sharp){blocked.crease++;continue}allowed.add(i)}
 const points=g.map(a=>a.p.slice());
 function fm(f,overrideId=-1,override=null){return geom(...f.gs.map(k=>k===overrideId?override:points[k]))}
 function objective(id,override=null){const a=g[id],vals=a.faces.map(k=>fm(faces[k],id,override||points[id]));return {score:vals.reduce((s,v)=>s+v.quality,0)/vals.length+.35*Math.min(...vals.map(v=>v.quality)),worst:Math.min(...vals.map(v=>v.quality)),vals}}
 let accepted=0;
 // Small tangent-plane relocations to redistribute long/thin triangles, not inflate the figure.
 for(let pass=0;pass<5;pass++)for(const id of allowed){const a=g[id],q=points[id],old=objective(id),avg=mul([...a.neighbors].reduce((s,k)=>add(s,points[k]),[0,0,0]),1/a.neighbors.size),d=sub(avg,q),ref=unit(a.ids.reduce((s,i)=>add(s,n0[i]),[0,0,0])),t=sub(d,mul(ref,dot(d,ref))),bit=unit(cross(ref,t)),steps=[mul(t,.25),mul(t,.12),mul(t,-.10),mul(bit,.0015),mul(bit,-.0015)];
   let best=null;for(let delta of steps){if(len(delta)>.002)delta=mul(unit(delta),.002);const next=add(q,delta),disp=sub(next,a.source);if(len(disp)>.004||Math.abs(dot(disp,ref))>.0008)continue;
   const o=objective(id,next);if(o.score<=old.score+1e-7||o.worst<old.worst-.005)continue;
   if(o.vals.some((v,i)=>{const f=faces[a.faces[i]].m;return v.area<f.area*.75||dot(v.normal,f.normal)<.985}))continue;
   if(!best||o.score>best.o.score)best={next,o}}
   if(best){points[id]=best.next;accepted++}
 }
 let changedGroups=0,changedVertices=0,maxDisplacement=0,byRegion={};
 const moved=new Set();for(const id of allowed){const dist=len(sub(points[id],g[id].source));if(dist>1e-7){moved.add(id);changedGroups++;changedVertices+=g[id].ids.length;maxDisplacement=Math.max(maxDisplacement,dist);byRegion[g[id].region]=(byRegion[g[id].region]||0)+g[id].ids.length;for(const i of g[id].ids)pa.write(i,points[id])}}
 if(changedGroups<6)throw Error("Not enough actual geometry changes");
 // Update smooth normals/tangents only in the permitted moved-neighbor region.
 const affected=new Set();for(const id of moved){affected.add(id);for(const n of g[id].neighbors)if(allowed.has(n))affected.add(n)}
 let normalsUpdated=0,maxTangentDot=0;
 for(const id of affected){const a=g[id];let sum=[0,0,0];for(const fidx of a.faces){const f=faces[fidx],k=f.gs.indexOf(id),pp=f.gs.map(i=>points[i]),nn=fm(f).normal,w=angle(sub(pp[(k+1)%3],pp[k]),sub(pp[(k+2)%3],pp[k]));sum=add(sum,mul(nn,w))}
 const target=unit(sum),old=unit(n0[a.ids[0]]);if(dot(target,old)<.98)continue;const nn=unit(add(mul(old,.25),mul(target,.75)));
 for(const i of a.ids){const t=t0[i].slice(0,3),tt=unit(sub(t,mul(nn,dot(t,nn))));if(len(tt)<.9)throw Error("Bad tangent");na.write(i,nn);ta.write(i,[...tt,t0[i][3]]);normalsUpdated++;maxTangentDot=Math.max(maxTangentDot,Math.abs(dot(nn.map(Math.fround),tt.map(Math.fround))))}
 }
 // Recompute POSITION bounds from exact float32 output.
 const a=j.accessors[34],v=j.bufferViews[a.bufferView],off=(v.byteOffset||0)+(a.byteOffset||0),outP=p.map((_,i)=>Array.from({length:3},(_,k)=>dvout.getFloat32(off+i*(v.byteStride||12)+k*4,true)));
 a.min=[0,1,2].map(k=>Math.min(...outP.map(v=>v[k])));a.max=[0,1,2].map(k=>Math.max(...outP.map(v=>v[k])));
 const changedFaces=faces.filter(f=>f.gs.some(k=>moved.has(k)));
 const oldQ=changedFaces.map(f=>f.m.quality),newQ=changedFaces.map(f=>geom(...f.ids.map(i=>outP[i])).quality),avg=x=>x.reduce((s,v)=>s+v,0)/x.length;
 const minFaceCos=Math.min(...faces.map(f=>dot(f.m.normal,geom(...f.ids.map(i=>outP[i])).normal)));
 const minAreaRatio=Math.min(...faces.map(f=>geom(...f.ids.map(i=>outP[i])).area/f.m.area));
 const changedViews=[];for(let i=0;i<j.bufferViews.length;i++){const v=j.bufferViews[i],o=v.byteOffset||0;if(!same(bin.subarray(o,o+v.byteLength),src.subarray(base+o,base+o+v.byteLength)))changedViews.push(i)}
 if(avg(newQ)<=avg(oldQ)||minFaceCos<.98||minAreaRatio<.74||maxTangentDot>1e-6||changedViews.join(",")!==[pa.view,na.view,ta.view].join(","))throw Error("Quality guard");
 if(JSON.stringify(j.nodes)!==JSON.stringify(orig.nodes)||JSON.stringify(j.skins)!==JSON.stringify(orig.skins)||JSON.stringify(j.meshes)!==JSON.stringify(orig.meshes)||JSON.stringify(j.materials)!==JSON.stringify(orig.materials))throw Error("Unrelated changes");
 for(let i=0;i<p.length;i++){if(!moved.has(gid[i])&&!same(outP[i],p[i]))throw Error("Protected position changed")}
 j.asset.generator="R36HW V21 constrained sleeve and shin mesh relaxation";
 const s=JSON.stringify(j),jb=new Uint8Array((s.length+3)&~3).fill(32);for(let i=0;i<s.length;i++){if(s.charCodeAt(i)>127)throw Error("non ASCII");jb[i]=s.charCodeAt(i)}
 const out=new Uint8Array(28+jb.length+bin.length),h=new DataView(out.buffer);[0x46546c67,2,out.length,jb.length,0x4e4f534a].forEach((x,i)=>h.setUint32(i*4,x,true));out.set(jb,20);h.setUint32(20+jb.length,bin.length,true);h.setUint32(24+jb.length,0x004e4942,true);out.set(bin,28+jb.length);
 return {glb:out,report:{schema:"r36hw-v21-limb-mesh-v1",sourceBlob:"189f94cedaaf751ba1379af550eacc9bed579a6b",sourceVersion:"V19 static",sourceBytes:src.length,outputBytes:out.length,triangles,joints:j.skins[0].joints.length,garmentVertices:p.length,weldedGroups:g.length,eligibleGroups:allowed.size,blocked,acceptedRelaxationSteps:accepted,changedGroups,changedVertices,changedVerticesByRegion:byRegion,normalsUpdated,affectedFaces:changedFaces.length,maxDisplacementModelUnits:maxDisplacement,meanTriangleQualityBefore:avg(oldQ),meanTriangleQualityAfter:avg(newQ),meanQualityIncreasePercent:100*(avg(newQ)/avg(oldQ)-1),minTriangleQualityBefore:Math.min(...oldQ),minTriangleQualityAfter:Math.min(...newQ),minFaceOrientationCosine:minFaceCos,minFaceAreaRatio:minAreaRatio,maxTangentDot,changedViews,unchangedViews:j.bufferViews.length-changedViews.length,materialsAndRigUnchanged:true,torsoPelvisPositionsUnchanged:true,opaque:true,nativeRender:false,nativeS2:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.join(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V19.glb [output dir]');const b=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(hash!=='189f94cedaaf751ba1379af550eacc9bed579a6b')throw Error('Wrong input '+hash);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V21_LIMBS.glb'),r.glb);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
