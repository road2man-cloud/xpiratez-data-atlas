'use strict';
/** r24: posteriorly relocate blind anal cavity, extend the labial/vestibular
 * median cleft over the intervening perineal epidermis. Physically separate
 * vaginal and anal openings. Source r23 lbsweld unchanged.
 * Avoid editing the 908 original authored anatomy vertices, manual deleted
 * triangles, and four body UV split weight corrections.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,variant=process.argv.includes('--wide')?'elliptic-wide':'elliptic-soft',
    stem='r21AO-F11-user101-native-retopo-r24-posterior-opening-'+variant;
const source='r21AO-F11-user101-native-retopo-r23-lbsweld.glb',
    target=stem+'.glb',audit='REV96_USER101_R24_'+variant.toUpperCase()+'_BUILD.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync(path.join(root,source));
const sourceHash='f7e0a3d16712abfa21ce4b3a4faedea55b3fb77dac0400f64575423838db7132';
if(sha(raw)!==sourceHash)throw Error('Immutable r23 source mismatch');
for(const n of [target,audit])if(fs.existsSync(path.join(root,n)))throw Error('Refuse overwrite '+n);
const jl=raw.readUInt32LE(12),g=JSON.parse(raw.toString('utf8',20,20+jl));
let bin=Buffer.from(raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)));
const pp=g.meshes[0].primitives,sz={5121:1,5123:2,5125:4,5126:4},
     op={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},
     dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
if(pp.length!==24||g.skins[0].joints.length!==63)throw Error('Unexpected source rig/primitive count');
function read(i){
 const a=g.accessors[i],v=g.bufferViews[a.bufferView],d=dims[a.type],z=sz[a.componentType],
 off=(a.byteOffset||0)+(v.byteOffset||0),step=v.byteStride||d*z,rows=[];
 for(let j=0;j<a.count;j++){const r=[];for(let k=0;k<d;k++)r.push(bin[op[a.componentType]](off+j*step+k*z));rows.push(d===1?r[0]:r)}
 return rows;
}
const core=pp[13],skin=pp[23];
const C=read(core.attributes.POSITION),M=read(core.targets[0].POSITION),
      K=read(skin.attributes.POSITION),KM=read(skin.targets[0].POSITION),
      CI=read(core.indices),KI=read(skin.indices);
const cOriginal=C.map(p=>p.slice()),kOriginal=K.map(p=>p.slice());
if(C.length!==2268||CI.length!==921*3||KI.length!==682*3)throw Error('Wrong r23 shape');
const p0=pp[0];
const bodyPosAcc=p0.attributes.POSITION,bodyIndexAcc=p0.indices;
const conf=variant==='elliptic-soft'?{move:.020,rim1:.010,rim2:.014,depth:.65,skinBulge:.0008,ring1YShrink:.66,ring2YShrink:.74,ring1XScale:1.04,ring2XScale:1.08}
                                         :{move:.022,rim1:.012,rim2:.016,depth:.72,skinBulge:.0008,ring1YShrink:.60,ring2YShrink:.68,ring1XScale:1.10,ring2XScale:1.12};
const clamp=x=>Math.min(1,Math.max(0,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},
  sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),
  mul=(a,k)=>a.map(x=>x*k),norm=a=>{let m=Math.hypot(...a)||1;return a.map(x=>x/m)},
  cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const log=[];
/* Local channel in the GENERATED posterior anatomy grid. The original 908
 * authored points are completely untouched; the collar seam row 1041..1059
 * is constrained to zero displacement, preserving 19 material joins.
 */
const depths=[.0035,.0068,.0095,.0098,.0090,.0071,.0040,0];
for(let row=0;row<8;row++){
 const centerX=cOriginal[908+row*19+9][0];
 for(let col=0;col<19;col++){
  const i=908+row*19+col,p=cOriginal[i],x=p[0]-centerX;
  const channel=Math.exp(-Math.pow(x/.0069,2)),
        shoulder=Math.exp(-Math.pow((Math.abs(x)-.0105)/.0042,2)),
        offset=conf.depth*(depths[row]*channel-.0016*shoulder)*(row===7?0:1);
  if(Math.abs(offset)>1e-6){
   C[i]=p.slice();C[i][2]=Math.fround(p[2]+offset);
   log.push({id:i,region:'intervening-perineal-cleft',deltaZ:offset});
  }
 }
}
/* Blind anal cavity: Y positive is posterior, verified from r22 design.
 * Gradual posterior translation across two concentric rings is intentional:
 * it preserves the original grid/annulus boundary and avoids a cavity lip
 * jumping 20 mm relative to the original side skin.
 */
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const outerCenterY=mean(cOriginal.slice(1060,1068).map(v=>v[1]));
const innerCenterY=mean(cOriginal.slice(1068,1076).map(v=>v[1]));
const outerCenterX=mean(cOriginal.slice(1060,1068).map(v=>v[0]));
const innerCenterX=mean(cOriginal.slice(1068,1076).map(v=>v[0]));
for(let id=1060;id<=1076;id++){
 C[id]=C[id].slice();
 const ring1=id<1068,ring2=id<1076;
 let p=cOriginal[id],offsetY=conf.move;
 if(ring1){
  C[id][1]=Math.fround(outerCenterY+conf.rim1+(p[1]-outerCenterY)*conf.ring1YShrink);
  C[id][0]=Math.fround(outerCenterX+(p[0]-outerCenterX)*conf.ring1XScale);
  offsetY=C[id][1]-p[1];
 }else if(ring2){
  C[id][1]=Math.fround(innerCenterY+conf.rim2+(p[1]-innerCenterY)*conf.ring2YShrink);
  C[id][0]=Math.fround(innerCenterX+(p[0]-innerCenterX)*conf.ring2XScale);
  offsetY=C[id][1]-p[1];
 }else C[id][1]=Math.fround(p[1]+conf.move);
 const dep=ring1?.0004:ring2?.0015:.0022;
 C[id][2]=Math.fround(p[2]+dep*conf.depth);
 log.push({id,region:'posterior-oval-anal-recess',deltaY:offsetY,deltaZ:dep*conf.depth});
}
/* Recurve only INTERIOR r23 skirt vertices; all existing boundary vertices
 * remain byte-identical to their material-adjacent faces. The fan-shaped
 * skirt stays topology-preserving but gets a gentle convex skin relief
 * on the 55 degree view rather than a flat broad triangle diaphragm.
 */
const edgeCounts=new Map();
for(let i=0;i<KI.length;i+=3)for(const [a,b] of [[KI[i],KI[i+1]],[KI[i+1],KI[i+2]],[KI[i+2],KI[i]]]){
 const key=a<b?a+':'+b:b+':'+a;edgeCounts.set(key,(edgeCounts.get(key)||0)+1);}
const borders=new Set();
for(const [key,n]of edgeCounts)if(n===1)for(const id of key.split(':'))borders.add(Number(id));
const borderPoints=[...borders].map(i=>K[i]);
let movedPatch=0;
for(let i=0;i<K.length;i++){
 if(borders.has(i))continue;
 const p=kOriginal[i],abx=Math.abs(p[0]);
 if(p[2]<.72||p[2]>1.045||abx>.14)continue;
 const nearest=Math.min(...borderPoints.map(b=>Math.hypot((p[0]-b[0]),(p[1]-b[1]),(p[2]-b[2]))));
 const fade=smooth(nearest/.025),
       swell=Math.exp(-Math.pow((abx-.050)/.050,2)),
       lateral=smooth((abx-.013)/.024),
       foreaft=Math.exp(-Math.pow((p[1]+.027)/.13,2));
 const dz=-conf.skinBulge*fade*swell*lateral*foreaft;
 if(Math.abs(dz)>1e-6){
  K[i]=p.slice();K[i][2]=Math.fround(p[2]+dz);
  movedPatch++;log.push({id:i,region:'local-skirt-interior',deltaZ:dz});
 }
}
function normals(P,I){let out=P.map(()=>[0,0,0]);for(let i=0;i<I.length;i+=3){const[a,b,c]=I.slice(i,i+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a]));for(const v of [a,b,c])out[v]=add(out[v],n);}return out.map(norm);}
function recalc(P,M,I){
 const a=normals(P,I),b=normals(P.map((p,i)=>add(p,M[i])),I);
 return {normal:a,morphNormal:a.map((n,i)=>sub(b[i],n))};
}
const CN=recalc(C,M,CI),KN=recalc(K,KM,KI);
function topologyQuality(oldP,newP,I){
 let flips=0,zero=0,minA=Infinity,maxMove=0,count=0;
 for(let i=0;i<oldP.length;i++){let d=Math.hypot(...sub(oldP[i],newP[i]));maxMove=Math.max(maxMove,d);if(d>1e-7)count++;}
 for(let i=0;i<I.length;i+=3){
  const [a,b,c]=I.slice(i,i+3),originalN=cross(sub(oldP[b],oldP[a]),sub(oldP[c],oldP[a])),
    newN=cross(sub(newP[b],newP[a]),sub(newP[c],newP[a])),area=Math.hypot(...newN)/2;
  if(area<1e-10)zero++;
  if(Math.hypot(...originalN)>1e-9&&originalN.reduce((s,x,k)=>s+x*newN[k],0)<0)flips++;
  minA=Math.min(minA,area);
 }
 return{flips,zero,minArea:minA,maxMove,changedVertices:count};
}
const coreQ=topologyQuality(cOriginal,C,CI),skirtQ=topologyQuality(kOriginal,K,KI);
function flips(a,b,I){let arr=[];for(let j=0;j<I.length;j+=3){const ids=I.slice(j,j+3),[u,v,w]=ids;let n0=cross(sub(a[v],a[u]),sub(a[w],a[u])),n1=cross(sub(b[v],b[u]),sub(b[w],b[u]));if(n0.reduce((s,x,k)=>s+x*n1[k],0)<0)arr.push({face:j/3,ids,old:ids.map(i=>a[i]),new:ids.map(i=>b[i])})}return arr};console.log(JSON.stringify({conf,coreQ,skirtQ,flips:flips(cOriginal,C,CI)},null,2));process.exit(3);
const deformedC=topologyQuality(cOriginal.map((p,i)=>add(p,M[i])),C.map((p,i)=>add(p,M[i])),CI);
const deformedK=topologyQuality(kOriginal.map((p,i)=>add(p,KM[i])),K.map((p,i)=>add(p,KM[i])),KI);
if(deformedC.flips||deformedC.zero||deformedK.flips||deformedK.zero)throw Error('Invalid morph geometry '+JSON.stringify({deformedC,deformedK}));
for(let i=0;i<908;i++)if(JSON.stringify(C[i])!==JSON.stringify(cOriginal[i]))throw Error('Protected author vertex moved');
for(let i=1041;i<1060;i++)if(JSON.stringify(C[i])!==JSON.stringify(cOriginal[i]))throw Error('Body/material collar seam moved');
for(const id of borders)if(JSON.stringify(K[id])!==JSON.stringify(kOriginal[id]))throw Error('Patch boundary moved');
function write(rows,template){
 const a=g.accessors[template],d=dims[a.type],size=sz[a.componentType],data=Buffer.alloc(rows.length*d*size),off=(bin.length+3)&~3;
 for(let i=0;i<rows.length;i++)for(let j=0;j<d;j++){
  const v=d===1?rows[i]:rows[i][j],o=(i*d+j)*size;
  if(!Number.isFinite(v))throw Error('Nonfinite accessor value');
  if(a.componentType===5126)data.writeFloatLE(v,o);
  else if(a.componentType===5123)data.writeUInt16LE(v,o);
  else if(a.componentType===5125)data.writeUInt32LE(v,o);
  else if(a.componentType===5121)data.writeUInt8(v,o);
 }
 bin=Buffer.concat([bin,Buffer.alloc(off-bin.length),data]);
 const v=g.bufferViews.push({buffer:0,byteOffset:off,byteLength:data.length})-1,
   obj={bufferView:v,componentType:a.componentType,count:rows.length,type:a.type};
 if(a.normalized!==undefined)obj.normalized=a.normalized;
 if(a.min||a.max)for(const k of ['min','max'])if(a[k])obj[k]=Array.from({length:d},(_,j)=>k==='min'?Math.min(...rows.map(x=>d===1?x:x[j])):Math.max(...rows.map(x=>d===1?x:x[j])));
 return g.accessors.push(obj)-1;
}
for(const [p,P,N]of [[core,C,CN],[skin,K,KN]]){
 p.attributes.POSITION=write(P,p.attributes.POSITION);
 p.attributes.NORMAL=write(N.normal,p.attributes.NORMAL);
 p.targets[0].NORMAL=write(N.morphNormal,p.targets[0].NORMAL);
}
const originalAnalY=cOriginal[1076][1],newAnalY=C[1076][1];
g.extras={...g.extras,revision:'rev96-user101-r24-'+variant,
 r24BasedOnR23LbsweldSHA256:sourceHash,original101DeletionInvariant:true,
 original754SculptAndFirst908AnatomyPositionsPreserved:true,
 r24AnalCenterY:newAnalY,r24AnalPosteriorShift:newAnalY-originalAnalY,
 r24InterveningPerinealCleftSculpted:true,r24SeparateVaginalAnalOpenings:true,
 r24LocalBroadSkinSkirtCurved:true,r24VisualAccepted:false,
 crossPrimitiveIndexWelded:false,wholeBodyWatertight:false};
core.extras={...core.extras,r24PosteriorAnalShiftY:newAnalY-originalAnalY,r24CleftSculpted:true};
skin.extras={...skin.extras,r24SkirtConvexity:true};
if(p0.attributes.POSITION!==bodyPosAcc||p0.indices!==bodyIndexAcc)throw Error('Body accessor changed');
g.buffers[0].byteLength=bin.length;
const jb=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const output=Buffer.concat([h,jh,jp,bh,bp]);
fs.writeFileSync(path.join(root,target),output,{flag:'wx'});
const report={schema:'xpz3d/f11/r24-oval-anal-opening/v1',createdUTC:new Date().toISOString(),
 input:source,inputSHA256:sourceHash,file:target,sha256:sha(output),
 variant,analPit:{oldY:originalAnalY,newY:newAnalY,posteriorShift:newAnalY-originalAnalY},
 cleft:{startY:-.09,endY:.024,originalAuthoredVerticesChanged:0,originalManualFacesReintroduced:0},
 areas:{coreRest:coreQ,coreMorph:deformedC,skinRest:skirtQ,skinMorph:deformedK},skinInteriorMoved:movedPatch,
 patchBoundaryVerticesPreserved:borders.size,bodyAndRigUnchanged:true,originalGarment370FacesPreserved:true,
 topologicalFullClosure:false,visualReview:'pending',log};
 fs.writeFileSync(path.join(root,audit),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output:target,sha256:report.sha256,anal:report.analPit,coreQ,skirtQ,deformedC,deformedK,skinInteriorMoved:movedPatch,borders:borders.size},null,2));
