'use strict';
const state={angle:0,tilt:0,zoom:2.6,focus:'full',wire:false,tint:false,mode:'anatomy',spread:0,garments:true,hideGarment:false,clothingVisible:true,pan:[0,0,0],focusPoint:null};
const $=id=>document.getElementById(id);
function mul(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function perspective(fov,aspect,n,f){const t=1/Math.tan(fov/2),m=new Float32Array(16);m[0]=t/aspect;m[5]=t;m[10]=(f+n)/(n-f);m[11]=-1;m[14]=2*f*n/(n-f);return m;}
function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function lookAt(eye,target,up){const z=norm(eye.map((v,i)=>v-target[i])),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);}
function yaw(deg){let a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);}
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in float aChange;
layout(location=4) in float aTissue;
layout(location=5) in uvec4 aJoints;
layout(location=6) in vec4 aWeights;
layout(location=7) in float aRegion;
layout(location=8) in float aCavity;
uniform highp sampler2D uBoneTex;
mat4 boneMatrix(int joint){
 return mat4(
  texelFetch(uBoneTex,ivec2(0,joint),0),
  texelFetch(uBoneTex,ivec2(1,joint),0),
  texelFetch(uBoneTex,ivec2(2,joint),0),
  texelFetch(uBoneTex,ivec2(3,joint),0)
 );
}
uniform mat4 uMVP;
uniform mat4 uRotate;
out vec2 vUV;out vec3 vNormal;out float vChange;out float vTissue;out vec3 vPosition;out float vRegion;out vec3 vRestPosition;out float vCavity;
void main(){
 vec4 posed=vec4(aPos,1.0);
 gl_Position=uMVP*posed;
 vNormal=normalize(mat3(uRotate)*aNormal);
 vUV=aUV;vChange=aChange;vTissue=aTissue;vPosition=posed.xyz;
 vRegion=aRegion;vRestPosition=aPos;vCavity=aCavity;
}`;
const FS=`#version 300 es
precision highp float;
in vec2 vUV;in vec3 vNormal;in float vChange;in float vTissue;in vec3 vPosition;in float vRegion;in vec3 vRestPosition;in float vCavity;
uniform sampler2D uAtlas;uniform float uOpening;uniform bool uTint;uniform bool uWire;uniform bool uPatch;uniform bool uBody;uniform bool uGarment;uniform bool uSkinLink;uniform bool uPickedFace;uniform int uMode;
out vec4 color;
void main(){
  if(uPickedFace){color=vec4(1.0,.70,.11,1.0);return;}
  if(uWire){color=vec4(.64,.93,.72,1.0);return;}
  vec3 base=texture(uAtlas,vUV).rgb;
  float tissue=smoothstep(.04,.84,vTissue);
  // Physical cloth shell gets its own material color rather than inherited skin UV pixels.
  if(uGarment)base=vec3(.38,.35,.33);
  if(uSkinLink)base=vec3(.60,.395,.285);
  // Only in explicit diagnostic cutaway: recolor the old clothing pixels on the actual
  // native pelvic skin. External/clothed mode keeps the source atlas intact.
  float pelvic=smoothstep(.765,.842,vRestPosition.z)*(1.0-smoothstep(.960,1.035,vRestPosition.z));
  float sides=1.0-smoothstep(.115,.205,abs(vRestPosition.x));
  float anterior=1.0-smoothstep(-.055,.092,vRestPosition.y);
  // r21-AO rev4: separate garment shell is the ONLY cloth layer at the groin.
  // Replace baked-in cloth pixels on the underlying body with a skin tone;
  // never recolor the independent garment primitive or other equipment.
  float clothUnderShell=pelvic*sides*anterior;
  if(uBody && clothUnderShell>0.0){
    vec3 underlyingSkin=vec3(.60,.395,.285);
    base=mix(base,underlyingSkin,clamp(clothUnderShell,0.0,1.0));
  }
  // Never discard the front pelvis or clothing: the dark clear color would show through as a black patch.
  float section=(abs(vPosition.x)<.114 && vPosition.y<-.06 && vPosition.z>.80 && vPosition.z<1.06) ? 1.0 : 0.0;
  // Natural skin; pink tint is confined to _ANATREGION central mucosa.
  if(uPatch){
    vec3 skin=vec3(.60,.395,.285);
    float mucosa=smoothstep(.30,.80,clamp(vRegion,0.0,1.0));
    base=mix(skin,vec3(.77,.395,.435),uMode==0 ? .28*mucosa : .76*mucosa);
    base*=1.0-.045*clamp(vTissue,0.0,1.0)*(1.0-mucosa);
    // The shaded cavity is real skinned geometry; this attribute shades its depth, not a cutout overlay.
    float recess=smoothstep(.13,.85,clamp(vCavity,0.0,1.0));
    float exposure=smoothstep(.08,.65,uOpening);
    base=mix(base,vec3(.27,.12,.145),(.16+.52*exposure)*recess);
  }
  if(uTint)base=mix(base,vec3(.98,.31,.16),smoothstep(.1,.9,vChange)*.82);
  vec3 n=normalize(vNormal);
  float shading=abs(dot(n,normalize(vec3(.38,-.79,.48))));
  float smoothSkin=uPatch?1.0:0.0;
  float light=mix(.66+.34*shading,.49+.51*shading,smoothSkin);
  float opacity=1.0;
  if(uMode==2 && tissue<.1 && abs(vPosition.x)<.19 && vPosition.z>.76 && vPosition.z<1.09)opacity=.62;
  // AO: no color overlay on intact clothing; depth-tested anatomy only
  color=vec4(base*light,uPatch ? 1.0 : opacity);
}`;
async function loadGlb(path){
  const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw Error(path+' HTTP '+res.status);
  const buf=await res.arrayBuffer(),dv=new DataView(buf);
  if(dv.getUint32(0,true)!==0x46546c67)throw Error('GLB magic mismatch');
  if(dv.getUint32(8,true)!==buf.byteLength)throw Error('GLB length mismatch');
  const jsonLen=dv.getUint32(12,true),jsonType=dv.getUint32(16,true);
  if(jsonType!==0x4e4f534a)throw Error('JSON chunk missing');
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,jsonLen)));
  const binOffset=20+jsonLen+8;
  const binSize=dv.getUint32(20+jsonLen,true);
  if(binOffset+binSize>buf.byteLength)throw Error('Binary chunk truncated');
  function bytes(index){
    const a=doc.accessors[index],v=doc.bufferViews[a.bufferView];
    const typeCount={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const size={5126:4,5123:2,5121:1,5125:4}[a.componentType];
    if(!typeCount||!size)throw Error('Unsupported accessor');
    const offset=binOffset+(v.byteOffset||0)+(a.byteOffset||0);
    const stride=v.byteStride||typeCount*size,number=a.count*typeCount;
    const result=new (a.componentType===5126?Float32Array:a.componentType===5123?Uint16Array:a.componentType===5125?Uint32Array:Uint8Array)(number);
    if(offset+((a.count-1)*stride)+typeCount*size>binOffset+binSize)throw Error('Accessor outside binary');
    for(let row=0;row<a.count;row++)for(let j=0;j<typeCount;j++){
      const at=offset+row*stride+j*size;
      const value=a.componentType===5126?dv.getFloat32(at,true):a.componentType===5123?dv.getUint16(at,true):a.componentType===5125?dv.getUint32(at,true):dv.getUint8(at);
      result[row*typeCount+j]=value;
    }
    return result;
  }
  const views=doc.meshes[0].primitives.map(pr=>{
    const at=pr.attributes;
    return {positions:bytes(at.POSITION),normals:bytes(at.NORMAL),uv:bytes(at.TEXCOORD_0),
      tissue:at._TISSUE!==undefined?bytes(at._TISSUE):null,
      region:at._ANATREGION!==undefined?bytes(at._ANATREGION):null,
      cavity:at._ANATCAVITY!==undefined?bytes(at._ANATCAVITY):null,
      joints:bytes(at.JOINTS_0),weights:bytes(at.WEIGHTS_0),
      morphPositions:pr.targets?.[0]?.POSITION!==undefined ? bytes(pr.targets[0].POSITION) : null,
      morphNormals:pr.targets?.[0]?.NORMAL!==undefined ? bytes(pr.targets[0].NORMAL) : null,
      indices:bytes(pr.indices),isPatch:pr.extras?.type==='connected-anatomy',side:pr.extras?.side||null,isSkinReplacement:!!pr.extras?.skinReplacement,isBodyContinuation:pr.extras?.type==='connected-body-continuation',
      isGarment:pr.extras?.type==='separate-garment-shell'||pr.extras?.type==='separate-garment-hem'};
  });
  const image=doc.images[0],v=doc.bufferViews[image.bufferView];
  const png=new Blob([buf.slice(binOffset+v.byteOffset,binOffset+v.byteOffset+v.byteLength)],{type:'image/png'});
  const bitmap=await createImageBitmap(png,{imageOrientation:'none'});
  const tris=views.reduce((n,v)=>n+v.indices.length/3,0);
  return {views,bitmap,tris,bones:doc.skins?.[0]?.joints?.length||0,pose:XPZPose.fromGltf(doc,bytes)};
}
function gpuBuffer(gl,data,target=gl.ARRAY_BUFFER){const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;}
class Viewer{
 constructor(canvas){
  this.canvas=canvas;
  this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});
  if(!this.gl)throw Error('WebGL2 not available');
  const gl=this.gl;this.shader=program(gl,VS,FS);
  this.mvp=gl.getUniformLocation(this.shader,'uMVP');this.rotate=gl.getUniformLocation(this.shader,'uRotate');
  this.wire=gl.getUniformLocation(this.shader,'uWire');this.tint=gl.getUniformLocation(this.shader,'uTint');this.mode=gl.getUniformLocation(this.shader,'uMode');this.isPatch=gl.getUniformLocation(this.shader,'uPatch');this.isBody=gl.getUniformLocation(this.shader,'uBody');this.isGarment=gl.getUniformLocation(this.shader,'uGarment');this.isSkinLink=gl.getUniformLocation(this.shader,'uSkinLink');this.pickedUniform=gl.getUniformLocation(this.shader,'uPickedFace');this.selectedIndexBuffer=gl.createBuffer();this.opening=gl.getUniformLocation(this.shader,'uOpening');this.bones=gl.getUniformLocation(this.shader,'uBoneTex');
  this.tex=gl.createTexture();this.boneTex=gl.createTexture();this.parts=[];
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.boneTex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.enable(gl.DEPTH_TEST);gl.clearColor(.05,.08,.11,1);
 }
 async init(path){
  const model=await loadGlb(path);const gl=this.gl;
  // The bone texture was initialized on TEXTURE1. Atlas must be on TEXTURE0.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,this.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,model.bitmap);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  for(const [pi,part] of model.views.entries()){
   const vao=gl.createVertexArray();gl.bindVertexArray(vao);
   const buffers=[];
   function attr(loc,data,size){
    const buf=gpuBuffer(gl,data);buffers.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);
    return buf;
   }
   const posBuffer=attr(0,part.positions,3);
   const normalBuffer=attr(1,part.normals,3);
   attr(2,part.uv,2);
   const highlight=new Float32Array(part.positions.length/3);
   if(pi===0){
    for(let i=0;i<highlight.length;i++){
      const j=i*3,x=part.positions[j],y=part.positions[j+1],z=part.positions[j+2];
      const left=Math.abs(x),forward=-y;
      if(z>.79&&z<1.08&&forward>.072&&left<.14){
        highlight[i]=Math.max(0,1-Math.abs(z-.94)/.15)*Math.max(0,1-left/.14);
      }
    }
   }
   attr(3,highlight,1);
   attr(4,part.tissue||new Float32Array(part.positions.length/3),1);
   const jointBuffer=gpuBuffer(gl,part.joints);buffers.push(jointBuffer);
   gl.bindBuffer(gl.ARRAY_BUFFER,jointBuffer);
   gl.enableVertexAttribArray(5);gl.vertexAttribIPointer(5,4,gl.UNSIGNED_SHORT,0,0);
   attr(6,part.weights,4);
   attr(7,part.region||new Float32Array(part.positions.length/3),1);
   attr(8,part.cavity||new Float32Array(part.positions.length/3),1);
   const triBuffer=gpuBuffer(gl,part.indices,gl.ELEMENT_ARRAY_BUFFER);buffers.push(triBuffer);
   const edges=new Uint16Array(part.indices.length*2);
   for(let i=0;i<part.indices.length;i+=3){
    const a=part.indices[i],b=part.indices[i+1],c=part.indices[i+2],k=2*i;
    edges.set([a,b,b,c,c,a],k);
   }
   const edgeBuffer=gpuBuffer(gl,edges,gl.ELEMENT_ARRAY_BUFFER);buffers.push(edgeBuffer);
   this.parts.push({
    vao,buffers,triBuffer,edgeBuffer,posBuffer,normalBuffer,primitiveIndex:pi,
    sourcePositions:part.positions,sourceNormals:part.normals,sourceMorph:part.morphPositions,sourceMorphNormals:part.morphNormals,
    skinJoints:part.joints,skinWeights:part.weights,
    indexCount:part.indices.length,edgeCount:edges.length,isBody:pi===0,isPatch:part.isPatch,isGarment:part.isGarment,isSkinReplacement:part.isSkinReplacement,isBodyContinuation:part.isBodyContinuation,side:part.side,sourceIndices:part.indices
   });
  }
  this.meta=model;this.lastSpread=null;
  if(this.canvas.id==='viewAfter'){window.XPZManual?.bind(this.parts,$('modelVariant')?.value);window.XPZPolygon?.bind(this.parts,$('modelVariant')?.value);this.lastPolyRevision=-1;}
  model.bitmap.close?.();
 }
 async switchModel(path){
  // Dispose every attribute and index buffer of the previous GLB.
  // Repeated clothing/anatomy comparisons must not leak GPU memory.
  for(const part of this.parts){
   for(const buffer of part.buffers)this.gl.deleteBuffer(buffer);
   this.gl.deleteVertexArray(part.vao);
  }
  this.parts=[];this.meta=null;
  await this.init(path);
  this.draw();
 }
 draw(){
  if(!this.meta)return;
  const gl=this.gl,c=this.canvas;
  const w=Math.max(1,Math.round(c.clientWidth*devicePixelRatio)),h=Math.max(1,Math.round(c.clientHeight*devicePixelRatio));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const pelvis=state.focus==='pelvis',detail=state.focus==='detail';
  const target=(state.focusPoint?[...state.focusPoint]:[0,detail ? -.10 : 0,detail ? .915 : (pelvis ? .94 : 1.0)]).map((v,i)=>v+(state.pan?.[i]||0));
  const distance=(detail ? .34 : (pelvis ? .62 : 2.68))/state.zoom*2.6;
  const r=state.angle*Math.PI/180,t=state.tilt*Math.PI/180;
  const eye=[target[0]+distance*Math.sin(r)*Math.cos(t),target[1]-distance*Math.cos(r)*Math.cos(t),target[2]+distance*Math.sin(t)];
  const mvp=mul(perspective(Math.PI/4,w/h,.005,80),lookAt(eye,target,[0,0,1]));
  this.lastMvp=mvp;
  if(this.canvas.id==='viewAfter'){
    const marker=$('anatomyLocator');
    if(marker){
      const v=[0,-.111,.9075,1],clip=new Float32Array(4);
      for(let row=0;row<4;row++)for(let col=0;col<4;col++)clip[row]+=mvp[col*4+row]*v[col];
      const cRect=c.getBoundingClientRect(),pRect=c.parentElement.getBoundingClientRect();
      const visible=clip[3]>0&&Math.abs(clip[0]/clip[3])<=1&&Math.abs(clip[1]/clip[3])<=1&&state.focus==='full'&&state.mode!=='external';
      marker.style.display=visible?'block':'none';
      if(visible){marker.style.left=(cRect.left-pRect.left+(clip[0]/clip[3]*.5+.5)*cRect.width)+'px';marker.style.top=(cRect.top-pRect.top+(.5-clip[1]/clip[3]*.5)*cRect.height)+'px';}
    }
  }
  gl.depthMask(!(this.canvas.id==='viewAfter'&&state.mode==='ghost'));
  gl.useProgram(this.shader);
  gl.uniformMatrix4fv(this.mvp,false,mvp);
  gl.uniform1f(this.opening,Math.max(0,Math.min(1,state.spread/55)));

  // CPU-side LBS is intentional for this low-poly review model: it
  // produces auditable per-vertex movement and avoids browser-specific
  // misrendering of the float-bone texture sampler.
  if(this.lastSpread!==(state.spread) || (this.canvas.id==='viewAfter' && this.lastEditorRevision!==window.XPZManual?.state.changed)){
    const bones=XPZPose.build(this.meta.pose.joints,this.meta.pose.inverseBind,state.spread);
    const spreadForMorph=state.spread;
    const morphFactor=Math.max(0,Math.min(1,spreadForMorph/55));
    const openWeight=morphFactor*morphFactor*(3-2*morphFactor);
    for(const part of this.parts){
      const len=part.sourcePositions.length/3;
      const newPos=new Float32Array(len*3),newNormals=new Float32Array(len*3);
      const P=part.sourcePositions,N=part.sourceNormals,J=part.skinJoints,W=part.skinWeights,M=part.sourceMorph,MN=part.sourceMorphNormals;
      for(let i=0;i<len;i++){
        // True neutral mesh closure -> glTF open-position morph -> 63-bone LBS.
        const k=i*3,j=i*4;
        let x=P[k]+(M?M[k]*openWeight:0);
        let y=P[k+1]+(M?M[k+1]*openWeight:0);
        let z=P[k+2]+(M?M[k+2]*openWeight:0);
        if(this.canvas.id==='viewAfter'&&window.XPZManual){
          [x,y,z]=window.XPZManual.apply(part.primitiveIndex,i,x,y,z,openWeight);
        }
        const nx=N[k]+(MN?MN[k]*openWeight:0),ny=N[k+1]+(MN?MN[k+1]*openWeight:0),nz=N[k+2]+(MN?MN[k+2]*openWeight:0);
        let px=0,py=0,pz=0,dx=0,dy=0,dz=0;
        for(let t=0;t<4;t++){
          const w=W[j+t];
          if(w<=.00001)continue;
          const off=J[j+t]*16;
          px+=w*(bones[off]*x+bones[off+4]*y+bones[off+8]*z+bones[off+12]);
          py+=w*(bones[off+1]*x+bones[off+5]*y+bones[off+9]*z+bones[off+13]);
          pz+=w*(bones[off+2]*x+bones[off+6]*y+bones[off+10]*z+bones[off+14]);
          dx+=w*(bones[off]*nx+bones[off+4]*ny+bones[off+8]*nz);
          dy+=w*(bones[off+1]*nx+bones[off+5]*ny+bones[off+9]*nz);
          dz+=w*(bones[off+2]*nx+bones[off+6]*ny+bones[off+10]*nz);
        }
        newPos[k]=px;newPos[k+1]=py;newPos[k+2]=pz;
        const length=Math.hypot(dx,dy,dz)||1;
        newNormals[k]=dx/length;newNormals[k+1]=dy/length;newNormals[k+2]=dz/length;
      }
      // r21-AN corrective deformation: distribute skin tension around the
      // lateral groin only; keep the midline vestibule nearly stationary.
      const spread=state.spread;
      const tension=Math.sin(Math.min(55,Math.max(0,spread))*Math.PI/110)**2;
      if((tension>0 || window.XPZManual?.state.changed>1) && (part.isBody || part.isPatch || part.isSkinReplacement || part.isBodyContinuation || part.isGarment)){
        for(let i=0;i<len;i++){
          if(part.isGarment)continue;
          const k=i*3,x=P[k],z=P[k+2],ax=Math.abs(x);
          if(z<.78||z>1.10||ax>.21)continue;
          const groin=Math.exp(-(((ax-.10)/.065)**2)-(((z-.925)/.10)**2));
          // AP-oriented vestibular floor must not be pulled upright by abduction.
          // Shift the lateral groin; keep central floor tied to the Hip joint.
          const vestibule=Math.exp(-((ax/.033)**2)-(((z-.919)/.045)**2));
          const fade=Math.sin(Math.PI*(z-.78)/.32)**2;
          const edge=Math.max(0,Math.min(1,(.21-ax)/.06));
          const influence=tension*fade*edge*(1-.98*vestibule);
          newPos[k]+=Math.sign(x)*.012*influence*groin;
          newPos[k+1]-=.007*influence*groin;
          newPos[k+2]-=.0015*influence*groin;
        }
        // Rebuild normals from the deformed triangles, not bind-pose normals.
        const accumulated=new Float32Array(len*3), ids=window.XPZPolygon?.filteredIndices(part.primitiveIndex,part.sourceIndices)??part.sourceIndices;
        for(let q=0;q<ids.length;q+=3){
          const a=ids[q]*3,b=ids[q+1]*3,c=ids[q+2]*3;
          const ux=newPos[b]-newPos[a],uy=newPos[b+1]-newPos[a+1],uz=newPos[b+2]-newPos[a+2];
          const vx=newPos[c]-newPos[a],vy=newPos[c+1]-newPos[a+1],vz=newPos[c+2]-newPos[a+2];
          const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
          for(const at of [a,b,c]){accumulated[at]+=nx;accumulated[at+1]+=ny;accumulated[at+2]+=nz;}
        }
        for(let i=0;i<len;i++){
          const k=i*3,d=Math.hypot(accumulated[k],accumulated[k+1],accumulated[k+2]);
          if(d>1e-9){newNormals[k]=accumulated[k]/d;newNormals[k+1]=accumulated[k+1]/d;newNormals[k+2]=accumulated[k+2]/d;}
        }
      }
      part.posedPositions=newPos;
      gl.bindBuffer(gl.ARRAY_BUFFER,part.posBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,newPos);
      gl.bindBuffer(gl.ARRAY_BUFFER,part.normalBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,newNormals);
    }
    // The body and connected anatomy share EXACT vertex indices in the GLB.
    // At pose time, recompute their normals together; per-primitive smoothing
    // made false shadow creases on the eight stitched skin border edges.
    const skinSurfaces=this.parts.filter(p=>p.isBody||p.isPatch);
    if(skinSurfaces.length===2 &&
       skinSurfaces[0].sourcePositions.length===skinSurfaces[1].sourcePositions.length){
      const count=skinSurfaces[0].sourcePositions.length/3;
      const accumulated=new Float32Array(count*3);
      for(const surface of skinSurfaces){
        const P=surface.posedPositions,I=window.XPZPolygon?.filteredIndices(surface.primitiveIndex,surface.sourceIndices)??surface.sourceIndices;
        for(let q=0;q<I.length;q+=3){
          const a=I[q]*3,b=I[q+1]*3,c=I[q+2]*3;
          const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2];
          const vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
          const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
          for(const k of [a,b,c]){
            accumulated[k]+=nx;accumulated[k+1]+=ny;accumulated[k+2]+=nz;
          }
        }
      }
      for(let i=0;i<count;i++){
        const k=i*3,m=Math.hypot(accumulated[k],accumulated[k+1],accumulated[k+2]);
        if(m>1e-9){accumulated[k]/=m;accumulated[k+1]/=m;accumulated[k+2]/=m;}
      }
      for(const surface of skinSurfaces){
        gl.bindBuffer(gl.ARRAY_BUFFER,surface.normalBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER,0,accumulated);
      }
    }
    // Observable proof from the *actual uploaded GPU vertex arrays*.
    // A numeric test alone is not enough: report the posed feet and
    // thigh positions in the live dashboard.
    if(this.canvas.id==='viewAfter'){
      const body=this.parts[0];
      const P=body.sourcePositions,J=body.skinJoints,W=body.skinWeights;
      let left=-1,right=-1,bestL=0,bestR=0;
      for(let i=0;i<P.length/3;i++){
        const z=P[i*3+2],x=P[i*3];
        // Upper-thigh sample: follow the actual four-component JOINTS/WEIGHTS.
        if(z<.70||z>.88||Math.abs(x)<.095)continue;
        const targetBone=x>0?2:3;
        let influence=0;
        for(let k=0;k<4;k++)if(J[i*4+k]===targetBone)influence+=W[i*4+k];
        if(x>0&&influence>bestL){left=i;bestL=influence;}
        if(x<0&&influence>bestR){right=i;bestR=influence;}
      }
      const status=$('poseDiagnostic');
      if(status){
        const delta=i=>{
          if(i<0)return null;
          const a=P[i*3],b=this.parts[0].posedPositions?.[i*3];
          return b===undefined?null:(b-a)*100;
        };
        const dl=delta(left),dr=delta(right);
        status.textContent='실제 메시 이동 · 왼다리 '+(dl===null?'측정 불가':dl.toFixed(1)+'cm')+
          ' / 오른다리 '+(dr===null?'측정 불가':dr.toFixed(1)+'cm')+
          ' · '+state.spread+'°';
        // Real posed positions, not a hard-coded status: central AP section.
        if(body.sourceMorph && body.posedPositions.length>(409*3+2)){
          const a=357*3,b=409*3,Q=body.posedPositions;
          const dy=Q[b+1]-Q[a+1],dz=Q[b+2]-Q[a+2];
          const inclination=Math.atan2(Math.abs(dz),Math.abs(dy))*180/Math.PI;
          status.textContent+=' · 중앙 AP 단면 경사 '+inclination.toFixed(1)+'° (수평 기준)';
        }
      }
    }
    this.lastSpread=state.spread;
    this.lastEditorRevision=window.XPZManual?.state.changed;
  }
  gl.uniformMatrix4fv(this.rotate,false,yaw(0));gl.uniform1i(this.wire,0);gl.uniform1i(this.pickedUniform,0);gl.uniform1i(this.tint,state.tint?1:0);
  gl.uniform1i(this.mode,this.canvas.id==='viewAfter' ? ({external:0,anatomy:1,ghost:2,cutaway:3}[state.mode] ?? 1) : 0);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(gl.getUniformLocation(this.shader,'uAtlas'),0);
  if(this.canvas.id==='viewAfter' && this.lastPolyRevision !== (window.XPZPolygon?.state.revision??-1))this.refreshPolygonBuffers();
  for(const part of this.parts){
   if(this.canvas.id==='viewAfter' && (!state.clothingVisible || state.hideGarment) && part.isGarment)continue;

   gl.uniform1i(this.isPatch,part.isPatch?1:0);gl.uniform1i(this.isBody,part.isBody?1:0);gl.uniform1i(this.isGarment,part.isGarment?1:0);gl.uniform1i(this.isSkinLink,part.isSkinReplacement||part.isBodyContinuation?1:0);
   // The physical pelvic tissue is stitched to the native rim. Draw its
   // diagnostic color pass last, without clothing depth occlusion. This
   // pass does not add an unattached scene object.
   if(part.isPatch){gl.enable(gl.DEPTH_TEST);gl.depthMask(true);}
   else{gl.enable(gl.DEPTH_TEST);gl.depthMask(true);}
   gl.bindVertexArray(part.vao);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.triBuffer);
   gl.drawElements(gl.TRIANGLES,part.previewIndexCount??part.indexCount,gl.UNSIGNED_SHORT,0);
   if(state.wire){
    gl.uniform1i(this.wire,1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.edgeBuffer);
    gl.drawElements(gl.LINES,part.previewEdgeCount??part.edgeCount,gl.UNSIGNED_SHORT,0);
    gl.uniform1i(this.wire,0);
   }
  }
  const sel=this.canvas.id==='viewAfter'?window.XPZPolygon?.state.selected:null;
  if(sel && !window.XPZPolygon.isDeleted(sel.primitive,sel.triangle)){
    const chosen=this.parts.find(p=>p.primitiveIndex===sel.primitive);
    if(chosen && (!chosen.isGarment || state.clothingVisible)){
      gl.bindVertexArray(chosen.vao);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.selectedIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(sel.vertices),gl.DYNAMIC_DRAW);
      gl.uniform1i(this.wire,0);gl.uniform1i(this.pickedUniform,1);
      gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);
      gl.drawElements(gl.TRIANGLES,3,gl.UNSIGNED_SHORT,0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.drawElements(gl.LINE_LOOP,3,gl.UNSIGNED_SHORT,0);
      gl.uniform1i(this.pickedUniform,0);
    }
  }
  gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
 }
}
// Triangles are keyed by their immutable input GLB (primitive, face) indices.
Viewer.prototype.refreshPolygonBuffers=function(){
 const picker=window.XPZPolygon;if(!picker)return;
 const gl=this.gl;
 for(const part of this.parts){
  const visible=picker.filteredIndices(part.primitiveIndex,part.sourceIndices);
  const I=new Uint16Array(visible),edges=new Uint16Array(visible.length*2);
  for(let i=0;i<visible.length;i+=3){const a=visible[i],b=visible[i+1],c=visible[i+2];edges.set([a,b,b,c,c,a],i*2);}
  gl.bindVertexArray(part.vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.triBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.edgeBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,edges,gl.DYNAMIC_DRAW);
  part.previewIndexCount=I.length;part.previewEdgeCount=edges.length;
 }
 this.lastPolyRevision=picker.state.revision;
};
Viewer.prototype.pickFace=function(clientX,clientY){
 if(!this.lastMvp||!this.parts.length)return null;
 const rect=this.canvas.getBoundingClientRect();
 const px=2*(clientX-rect.left)/rect.width-1,py=1-2*(clientY-rect.top)/rect.height,m=this.lastMvp;
 function project(P,index){
  const k=index*3,x=P[k],y=P[k+1],z=P[k+2],w=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(w<=.000001)return null;
  return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];
 }
 let best=null,depth=Infinity;
 for(const part of this.parts){
  if(part.isGarment && !state.clothingVisible)continue;
  const P=part.posedPositions,I=part.sourceIndices;if(!P)continue;
  const cache=new Map();const pt=id=>{if(!cache.has(id))cache.set(id,project(P,id));return cache.get(id);};
  for(let face=0;face<I.length/3;face++){
   if(window.XPZPolygon?.isDeleted(part.primitiveIndex,face))continue;
   const a=I[face*3],b=I[face*3+1],c=I[face*3+2],v0=pt(a),v1=pt(b),v2=pt(c);
   if(!v0||!v1||!v2)continue;
   const x0=v0[0],y0=v0[1],x1=v1[0],y1=v1[1],x2=v2[0],y2=v2[1];
   const denom=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
   if(Math.abs(denom)<1e-11)continue;
   const u=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))/denom;
   const v=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))/denom,ww=1-u-v;
   if(u<-.0001||v<-.0001||ww<-.0001)continue;
   const z=u*v0[2]+v*v1[2]+ww*v2[2];
   if(z< -1||z>1||z>=depth)continue;
   depth=z;best={primitive:part.primitiveIndex,triangle:face,vertices:[a,b,c],depth:z};
  }
 }
 return best;
};
$('anatomyLocator')?.addEventListener('click',()=>{$('focus').value='pelvis';$('zoom').value='2.6';update();});
const viewers=[];
window.XPZEditorBridge={getModel:()=>viewers.find(v=>v.canvas.id==='viewAfter'),
 pickAt:(clientX,clientY)=>viewers.find(v=>v.canvas.id==='viewAfter')?.pickFace(clientX,clientY)||null,
 focusFace:(face)=>{
  const viewer=viewers.find(v=>v.canvas.id==='viewAfter'),part=viewer?.parts.find(p=>p.primitiveIndex===face.primitive);
  if(!part?.posedPositions)return;
  const pt=[0,0,0];for(const id of face.vertices)for(let j=0;j<3;j++)pt[j]+=part.posedPositions[id*3+j]/3;
  state.focusPoint=pt;state.pan=[0,0,0];$('focus').value='detail';$('zoom').value='7';update();
 }};
document.addEventListener('xpz-polygon-change',()=>{const v=viewers.find(q=>q.canvas.id==='viewAfter');if(v){v.lastPolyRevision=-1;v.draw();}window.XPZPolygon?.update();});
document.addEventListener('xpz-manual-update',()=>{for(const v of viewers)if(v.canvas.id==='viewAfter')v.lastSpread=null;redraw();});
function redraw(){for(const v of viewers)v.draw();}
function update(){
 state.angle=Number($('rotation').value);
 state.zoom=Number($('zoom').value);
 state.focus=$('focus').value;
 state.wire=$('wire').checked;state.tint=$('tint').checked;state.mode=$('anatomyMode').value;
 state.spread=Number($('legSpread').value); state.clothingVisible=($('garmentVisible')?.checked ?? true) && ($('clothingVisible')?.checked ?? true) && !($('hideGarment')?.checked ?? false);
 $('spreadLabel').textContent=state.spread+'° / side';
 $('rotationLabel').textContent=state.angle+'°';$('zoomLabel').textContent=state.zoom.toFixed(1)+'×';
 redraw();
}
for(const id of ['rotation','zoom','focus','wire','tint','legSpread','garmentVisible','clothingVisible','hideGarment'])$(id)?.addEventListener('input',update);
$('focus')?.addEventListener('change',()=>{state.focusPoint=null;state.pan=[0,0,0];update();});
$('polyPickMode')?.addEventListener('change',()=>document.body.classList.toggle('poly-picking',$('polyPickMode').checked));
$('polyLarge')?.addEventListener('click',()=>{const expanded=document.body.classList.toggle('wide-edit');$('polyLarge').textContent=expanded?'비교 화면으로':'편집 화면 크게';requestAnimationFrame(redraw);});
document.body.classList.toggle('poly-picking',$('polyPickMode')?.checked??false);
// Review-only explicit version selector; never alters the main dashboard.
$('modelVariant')?.addEventListener('change',async()=>{
 const after=viewers.find(v=>v.canvas.id==='viewAfter');
 if(!after)return;
 const path=$('modelVariant').value;
 $('modelVariant').disabled=true;
 try{
  await after.switchModel(path);
  const baseline=viewers.find(v=>v.canvas.id==='viewBefore');
  if(baseline){await baseline.switchModel(path);$('metaBefore').textContent=baseline.meta.tris.toLocaleString()+' Tri · '+baseline.meta.bones+' joints';}
  $('anatomyMode').dataset.current=path;
  $('metaAfter').textContent=after.meta.tris.toLocaleString()+' Tri · '+after.meta.bones+' joints';
  $('status').textContent='비교 모델 적용: '+path;
  redraw();
 }catch(e){$('status').textContent='모델 적용 실패: '+e.message;console.error(e);}
 finally{$('modelVariant').disabled=false;}
});
$('anatomyMode').addEventListener('change',async()=>{
 update();
 const after=viewers.find(v=>v.canvas.id==='viewAfter');
 if(!after)return;
 const path=$('modelVariant')?.value||'r21AO-F11-skin-separated-rev92-base.glb';
 const req=($('anatomyMode').dataset.current||'r21AO-F11-skin-separated-rev92-base.glb');
 if(path===req)return;
 $('anatomyMode').disabled=true;
 try{
  await after.switchModel(path);
  const baseline=viewers.find(v=>v.canvas.id==='viewBefore');
  if(baseline){await baseline.switchModel(path);$('metaBefore').textContent=baseline.meta.tris.toLocaleString()+' Tri · '+baseline.meta.bones+' joints';}
  $('anatomyMode').dataset.current=path;
  $('metaAfter').textContent=after.meta.tris.toLocaleString()+' Tri · '+after.meta.bones+' joints';
  $('status').textContent='GLB 전신 모델 전환 완료';
 }catch(e){$('status').textContent='모델 전환 실패: '+e.message;console.error(e);}
 finally{$('anatomyMode').disabled=false;}
});
$('preset').addEventListener('change',()=>{
 const p=$('preset').value;
 const angles={front:[0,0],three:[40,12],bottom:[0,-55],inferior:[0,-73],posterior:[145,-73],side:[90,0]};
 state.tilt=angles[p][1];$('rotation').value=angles[p][0];update();
});
$('reset').addEventListener('click',()=>{state.focusPoint=null;state.pan=[0,0,0];$('preset').value='front';$('rotation').value=0;$('zoom').value='2.6';$('legSpread').value='0';$('focus').value='full';$('anatomyMode').value='anatomy';$('wire').checked=false;$('tint').checked=false;state.tilt=0;update();$('anatomyMode').dispatchEvent(new Event('change'));});
function drag(canvas){
 let active=false,lastX=0,lastY=0,startX=0,startY=0,moved=false,pan=false;
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==2)return;
  active=true;moved=false;pan=e.button===2||e.shiftKey;
  startX=lastX=e.clientX;startY=lastY=e.clientY;
  canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointerup',e=>{
  if(!active)return;
  const wasClick=!moved&&Math.hypot(e.clientX-startX,e.clientY-startY)<5;
  active=false;try{canvas.releasePointerCapture(e.pointerId);}catch{}
  if(wasClick&&!pan&&canvas.id==='viewAfter'&&$('polyPickMode')?.checked){
    const viewer=viewers.find(v=>v.canvas===canvas),face=viewer?.pickFace(e.clientX,e.clientY);
    window.XPZPolygon?.select(face);
  }
 });
 canvas.addEventListener('pointercancel',()=>{active=false;});
 canvas.addEventListener('pointermove',e=>{
  if(!active)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;
  if(!moved&&Math.hypot(e.clientX-startX,e.clientY-startY)<5)return;
  moved=true;lastX=e.clientX;lastY=e.clientY;
  if(pan){
    const r=state.angle*Math.PI/180,t=state.tilt*Math.PI/180;
    const dist=(state.focus==='detail'?.34:(state.focus==='pelvis'?.62:2.68))/state.zoom*2.6;
    const scale=2*dist*Math.tan(Math.PI/8)/Math.max(1,canvas.clientHeight);
    const right=[Math.cos(r),Math.sin(r),0],up=[-Math.sin(r)*Math.sin(t),Math.cos(r)*Math.sin(t),Math.cos(t)];
    for(let j=0;j<3;j++)state.pan[j]+=(-dx*right[j]+dy*up[j])*scale;
  }else{
    $('rotation').value=Math.max(-180,Math.min(180,Number($('rotation').value)+dx*.45));
    state.tilt=Math.max(-83,Math.min(83,state.tilt+dy*.4));
  }
  update();
 });
 canvas.addEventListener('wheel',e=>{e.preventDefault();$('zoom').value=Math.max(1,Math.min(12,Number($('zoom').value)-Math.sign(e.deltaY)*.4));update();},{passive:false});
}
(async()=>{
 try{
  $('focus').value='detail'; $('preset').value='bottom'; $('rotation').value='0'; $('legSpread').value='55'; $('garmentVisible').checked=false; state.tilt=-55;
  const pairs=[['viewBefore','r21AO-F11-skin-separated-rev92-base.glb','metaBefore'],['viewAfter','r21AO-F11-skin-separated-rev92-base.glb','metaAfter']];
  for(const [canvas,file,meta] of pairs){
   const v=new Viewer($(canvas));viewers.push(v);drag($(canvas));
   await v.init(file);
   $(meta).textContent=v.meta.tris.toLocaleString()+' Tri · '+v.meta.bones+' joints';
   if(canvas==='viewAfter')window.XPZPolygon?.update();
  }
  $('status').textContent='전신 연결형 해부학 GLB 로드 완료 · WebGL2';
  update();new ResizeObserver(redraw).observe($('viewBefore'));new ResizeObserver(redraw).observe($('viewAfter'));
 }catch(e){$('status').textContent='뷰어 오류: '+e.message;console.error(e);}
})();
