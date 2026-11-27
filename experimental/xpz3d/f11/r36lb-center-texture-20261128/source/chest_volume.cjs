'use strict';
/**
 * R36KZ adult-neutral torso silhouette refinement.
 * Work exclusively on the existing skinned body: bilateral soft chest volume,
 * inferior fold transition, smooth lateral connection and subtle gravity.
 * No separate parts, attachments, materials or explicit detail are added.
 */
const {projector}=require('./surface_patch.cjs');
const {cross,dot,length,normal}=require('./mesh_qem.cjs');
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const exp=(x,c,r)=>Math.exp(-Math.pow((x-c)/r,2));
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]);
function field(x,z) {
 const ax=Math.abs(x),side=x>=0?1:.955;
 const center=.165,top=1.355;
 const lateral=exp(ax,center,.130);
 const vertical=exp(z,top,.122);
 const lowerWeight=exp(z,1.268,.087)*exp(ax,center+.008,.118);
 const lowerBand=exp(z,1.221,.017)*exp(ax,.165,.125);
 const liftSide=exp(ax,.285,.070)*exp(z,1.338,.12);
 const edge=(1-smooth(.29,.36,ax))*smooth(1.15,1.225,z)*(1-smooth(1.435,1.51,z));
 const bulge=(.027*lateral*vertical+.010*lowerWeight-.0042*lowerBand+
             .0034*liftSide)*edge*side;
 return {bulge,lowerBand:lowerBand*edge,upperForm:lateral*vertical*edge,envelope:edge};
}
function recalcNormals(m){
 const n=m.positions.map(()=>[0,0,0]);
 for(let f=0;f<m.indices.length;f+=3){
  const ids=m.indices.slice(f,f+3),p=ids.map(i=>m.positions[i]);
  const v=cross(sub(p[1],p[0]),sub(p[2],p[0]));
  for(const i of ids)for(let k=0;k<3;k++)n[i][k]+=v[k];
 }
 m.normals=n.map(normal);
}
function sculptChest(input,source,{strength=1,maxMove=.042}={}){
 if(strength<=0||strength>2)throw Error('invalid chest sculpt strength');
 const m={...input};
 for(const f of ['positions','normals','uvs','colors','joints','weights','indices']){
  const a=input[f];m[f]=Array.isArray(a)?a.map(x=>Array.isArray(x)?x.slice():x):a;
 }
 const front=projector(source),orig=m.positions.map(x=>x.slice());
 const faceN=[],faceA=[],incident=Array.from({length:orig.length},()=>[]);
 for(let f=0;f<m.indices.length;f+=3){
  const fi=f/3,ids=m.indices.slice(f,f+3),p=ids.map(i=>orig[i]),
        n=cross(sub(p[1],p[0]),sub(p[2],p[0]));
  faceN.push(normal(n));faceA.push(length(n));
  for(const i of ids)incident[i].push(fi);
 }
 const desired=orig.map(p=>{
  const [x,y,z]=p,{bulge,envelope}=field(x,z);
  if(envelope<1e-5||Math.abs(x)<.024)return 0;
  const shell=front.sample(x,z);
  if(!shell||Math.abs(y-shell.y)>.044)return 0; // front visible shell
  const f=(1-smooth(.010,.049,Math.abs(y-shell.y)))*
    (1-smooth(-.015,.090,y)); // avoid moving the back of the torso
  return -clamp(bulge*strength*f,-maxMove,maxMove); // -Y = anterior
 });
 const order=desired.map((v,i)=>({i,size:Math.abs(v)})).filter(x=>x.size>1e-7).sort((a,b)=>b.size-a.size);
 let accepted=0,rejected=0,minDot=1,minRatio=Infinity,maxDisplacement=0;
 for(const {i} of order) {
  const old=m.positions[i][1];let done=false;
  for(const scale of [1,.82,.67,.52,.36,.23,.13,.06]){
   m.positions[i][1]=orig[i][1]+desired[i]*scale;
   let safe=true,rmin=Infinity,dmin=1;
   for(const fi of incident[i]){
    const inds=m.indices.slice(fi*3,fi*3+3),p=inds.map(k=>m.positions[k]),
          crossNow=cross(sub(p[1],p[0]),sub(p[2],p[0])),
          a=length(crossNow),ratio=a/(faceA[fi]||1),n=normal(crossNow),
          orient=dot(n,faceN[fi]);
    if(a<1e-12||ratio<.43||orient<.61){safe=false;break;}
    rmin=Math.min(rmin,ratio);dmin=Math.min(dmin,orient);
   }
   if(safe){done=true;accepted++;minRatio=Math.min(minRatio,rmin);
    minDot=Math.min(minDot,dmin);maxDisplacement=Math.max(maxDisplacement,Math.abs(desired[i]*scale));break;}
   m.positions[i][1]=old;
  }
  if(!done)rejected++;
 }
 if(accepted<22)throw Error('Too few visible torso vertices to shape: '+accepted);
 recalcNormals(m);
 m.stats={...m.stats,chestVolume:{
  version:'R36KZ',sourceTriangles:input.indices.length/3,outputTriangles:m.indices.length/3,
  eligibleVertices:order.length,modifiedVertices:accepted,rejectedVertices:rejected,
  maxMove:maxDisplacement,minIncidentNormalDot:minDot,minIncidentAreaRatio:minRatio,
  area:'front upper torso',method:'integrated chest mass and inferior transition',
  caveat:'Non-graphic exterior chest silhouette only; 3D reference is not metrically calibrated'
 }};
 return m;
}
module.exports={sculptChest,field};