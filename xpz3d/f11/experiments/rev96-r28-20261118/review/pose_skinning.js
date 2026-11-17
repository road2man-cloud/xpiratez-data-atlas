'use strict';
/*
 XPZ3D F11 r21-AM joint-pose evaluation, shared by both GLB viewports.
 Matrices are column-major glTF: local TRS -> parent world -> inverse bind.
 An identical 63-joint float texture is sampled for every skinned vertex.
 No screenshot tricks: joints 2 and 3 drive L/R thigh, their descendants
 and the pelvis skin/connected anatomy via original JOINTS_0/WEIGHTS_0.
*/
const XPZPose=(()=>{
 const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 function multiply(a,b){
  const o=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)
   for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];
  return o;
 }
 function quaternionMultiply(a,b){
  const [x,y,z,w]=a,[i,j,k,l]=b;
  return [w*i+x*l+y*k-z*j,w*j-x*k+y*l+z*i,w*k+x*j-y*i+z*l,w*l-x*i-y*j-z*k];
 }
 function fromTRS(t,q,s){
  const [x,y,z,w]=q,[sx,sy,sz]=s||[1,1,1];
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,yy=y*y2,zz=z*z2,
   xy=x*y2,xz=x*z2,yz=y*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return new Float32Array([
   (1-yy-zz)*sx,(xy+wz)*sx,(xz-wy)*sx,0,
   (xy-wz)*sy,(1-xx-zz)*sy,(yz+wx)*sy,0,
   (xz+wy)*sz,(yz-wx)*sz,(1-xx-yy)*sz,0,
   t[0],t[1],t[2],1
  ]);
 }
 function build(joints, inverseBind, degrees){
  const c=joints.length;
  if(c!==63||inverseBind.length!==c*16)throw Error('F11: invalid 63-bone skin data');
  const rad=degrees*Math.PI/180;
  const worlds=new Array(c),flat=new Float32Array(c*16);
  // Parent-first order in original F11 S2 skeleton. Named joints, not
  // arbitrary vertex coordinate offsets.
  for(let i=0;i<c;i++){
   const j=joints[i];
   let rotation=j.rotation||[0,0,0,1];
   if(j.name==='L_Thigh'||j.name==='R_Thigh'){
    const angle=(j.name==='L_Thigh'?-rad:rad);
    const swing=[0,Math.sin(angle/2),0,Math.cos(angle/2)];
    rotation=quaternionMultiply(rotation,swing);
   }
   const local=fromTRS(j.translation||[0,0,0],rotation,j.scale||[1,1,1]);
   if(j.parent>=i)throw Error('Non-topological F11 skeleton: '+j.name);
   worlds[i]=j.parent<0?local:multiply(worlds[j.parent],local);
   flat.set(multiply(worlds[i],inverseBind.subarray(i*16,(i+1)*16)),i*16);
  }
  return flat;
 }
 function fromGltf(doc,bytes){
  const skin=doc.skins?.[0];
  if(!skin)throw Error('No GLB skin');
  const index=new Map(skin.joints.map((n,i)=>[n,i]));
  const parent=new Int16Array(skin.joints.length).fill(-1);
  for(const [j,source] of skin.joints.entries()){
   for(const child of doc.nodes[source].children||[])
    if(index.has(child))parent[index.get(child)]=j;
  }
  return {joints:skin.joints.map((id,i)=>({...doc.nodes[id],parent:parent[i]})),
          inverseBind:bytes(skin.inverseBindMatrices)};
 }
 return {build,fromGltf,multiply,fromTRS};
})();
