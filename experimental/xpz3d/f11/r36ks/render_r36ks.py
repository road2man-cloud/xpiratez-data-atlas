#!/usr/bin/env python3
"""Rasterize actual GLB geometry and interpolated basecolor/normal/ORM UV textures.
A stand-alone software preview, NOT an S2/S3 game engine validation.
"""
import io, math, sys, json, struct
from pathlib import Path
import numpy as np, cv2
from PIL import Image,ImageDraw,ImageFont
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parent
DT={5126:'<f4',5123:'<u2',5121:'u1',5125:'<u4'};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def load(file):
 raw=Path(file).read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);return g,raw[28+n:]

def read(g,B,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];D=np.dtype(DT[a['componentType']]);m=NC[a['type']];return np.ndarray((a['count'],m),D,buffer=B,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',m*D.itemsize),D.itemsize)).copy()

def skin(g,B,degrees=65,spread=6):
 # glTF 63-bone RPG rig: authored rest transformations, inverse bind matrices.
 parents={child:i for i,n in enumerate(g['nodes']) for child in n.get('children',[])}
 bind=read(g,B,g['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
 world={}
 def chain(i):
  if i in world:return world[i]
  node=g['nodes'][i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(node.get('rotation',[0,0,0,1])).as_matrix();m[:3,3]=node.get('translation',[0,0,0])
  if node.get('name') in ('R_UArm','L_UArm','L_Thigh','R_Thigh'):
   angle={'R_UArm':-degrees,'L_UArm':degrees,'L_Thigh':-spread,'R_Thigh':spread}[node['name']]
   r=np.eye(4);r[:3,:3]=Rotation.from_euler('y',angle,degrees=True).as_matrix();m=m@r
  parent=parents.get(i)
  if parent is not None and parent!=64:m=chain(parent)@m
  world[i]=m;return m
 return np.array([chain(int(j))@bind[k] for k,j in enumerate(g['skins'][0]['joints'])],dtype=np.float32)

def images(g,B):
 output={}
 for i,t in enumerate(g.get('textures',[])):
  try:
   bv=g['bufferViews'][g['images'][t['source']]['bufferView']];s=bv.get('byteOffset',0)
   output[i]=np.array(Image.open(io.BytesIO(B[s:s+bv['byteLength']])).convert('RGB'))
  except (KeyError,ValueError,IndexError):pass
 return output

def norm(v):return v/(np.linalg.norm(v)+1e-12)

def render(file,out,yaw=0,zoom=1,pose=True, crop=None, spread_angle=6):
 g,B=load(file);mats=skin(g,B,degrees=65 if pose else 0,spread=spread_angle if pose else 0)
 tex=images(g,B);W=1080;H=1080
 bg=np.zeros((H,W,3),dtype=np.uint8);bg[:]=[20,31,41]
 zbuf=np.full((H,W),np.inf,dtype=np.float32)
 light=norm(np.array([.27,-.55,.79],dtype=np.float32))
 prims=g['meshes'][0]['primitives']
 face_count=0;skin_pixels=0
 for pi,p in enumerate(prims):
  attr=p['attributes'];P=read(g,B,attr['POSITION']);J=read(g,B,attr['JOINTS_0']);K=read(g,B,attr['WEIGHTS_0']);
  UV=read(g,B,attr['TEXCOORD_0']) if 'TEXCOORD_0' in attr else None
  C=read(g,B,attr['COLOR_0'])[:,:3] if 'COLOR_0' in attr else np.full((len(P),3),255,dtype=np.uint8)
  factor=float(255) if C.dtype==np.uint8 else 1.
  C=np.clip(C.astype(np.float32)/factor,0,1)
  hv=np.hstack((P,np.ones((len(P),1),dtype=np.float32)))
  V=np.zeros_like(P,dtype=np.float32)
  for k in range(4):
   ww=K[:,k];keep=ww>1e-7
   if keep.any():V[keep]+=np.einsum('nij,nj->ni',mats[J[keep,k],:3,:],hv[keep])*ww[keep,None]
  t=math.radians(yaw)
  sx=V[:,0]*math.cos(t)-V[:,1]*math.sin(t)
  sd=V[:,0]*math.sin(t)+V[:,1]*math.cos(t)
  perspective=3.9/(3.9+sd)
  screen=np.column_stack([W/2+sx*405*zoom*perspective,H/2-(V[:,2]-1.)*405*zoom*perspective]).astype(np.float32)
  idx=read(g,B,p['indices']).reshape(-1,3).astype(np.int32)
  material=g['materials'][p['material']];pb=material.get('pbrMetallicRoughness',{})
  tint=np.array(pb.get('baseColorFactor',[1,1,1,1])[:3],np.float32)
  alb=tex.get(pb.get('baseColorTexture',{}).get('index'))
  texnormal=tex.get(material.get('normalTexture',{}).get('index'))
  texorm=tex.get(material.get('occlusionTexture',{}).get('index'))
  bump_scale=material.get('normalTexture',{}).get('scale',1.)
  for tri in idx:
   xyz=V[tri];pts=screen[tri]
   if not np.all(np.isfinite(pts)):continue
   minx=max(0,int(np.floor(pts[:,0].min())));maxx=min(W,int(np.ceil(pts[:,0].max()))+1)
   miny=max(0,int(np.floor(pts[:,1].min())));maxy=min(H,int(np.ceil(pts[:,1].max()))+1)
   if maxx<=minx or maxy<=miny:continue
   v0=pts[1]-pts[0];v1=pts[2]-pts[0]
   den=v0[0]*v1[1]-v0[1]*v1[0]
   if abs(den)<1e-5:continue
   yy,xx=np.mgrid[miny:maxy,minx:maxx].astype(np.float32)
   u=((xx-pts[0,0])*v1[1]-(yy-pts[0,1])*v1[0])/den
   v=(v0[0]*(yy-pts[0,1])-v0[1]*(xx-pts[0,0]))/den
   mask=(u>=-.0001)&(v>=-.0001)&(u+v<=1.0001)
   if not mask.any():continue
   w=1-u-v
   depth=w*sd[tri[0]]+u*sd[tri[1]]+v*sd[tri[2]]
   zi=zbuf[miny:maxy,minx:maxx]
   mask&=(depth<zi)
   if not mask.any():continue
   geomN=norm(np.cross(xyz[1]-xyz[0],xyz[2]-xyz[0])).astype(np.float32)
   base_diff=max(0,float(np.dot(geomN,light)))
   # glTF double sided skin: preserve readable back-facing surfaces.
   shade=.43+.57*base_diff
   block=np.empty((maxy-miny,maxx-minx,3),np.float32);block[:]=tint*shade
   vertCol=C[tri[0]][None,None,:]*w[:,:,None]+C[tri[1]][None,None,:]*u[:,:,None]+C[tri[2]][None,None,:]*v[:,:,None]
   block*=vertCol
   if alb is not None and UV is not None:
    uvp=UV[tri];tx=w*uvp[0,0]+u*uvp[1,0]+v*uvp[2,0];ty=w*uvp[0,1]+u*uvp[1,1]+v*uvp[2,1]
    ipx=np.clip(tx*(alb.shape[1]-1),0,alb.shape[1]-1).astype(np.float32)
    ipy=np.clip((1-ty)*(alb.shape[0]-1),0,alb.shape[0]-1).astype(np.float32)
    sampled=cv2.remap(alb,ipx,ipy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    block*=(sampled.astype(np.float32)/255)
    if texnormal is not None and pi>=7:
     # Approximate tangent frame computed from the skinned triangle and its UV.
     dp1=xyz[1]-xyz[0];dp2=xyz[2]-xyz[0];dt1=uvp[1]-uvp[0];dt2=uvp[2]-uvp[0]
     d=dt1[0]*dt2[1]-dt1[1]*dt2[0]
     if abs(d)>1e-7:
      T=norm((dp1*dt2[1]-dp2*dt1[1])/d).astype(np.float32)
      Bt=norm(np.cross(geomN,T)).astype(np.float32)
      # Map from stored normal texels; sample same UV as albedo.
      npixel=cv2.remap(texnormal,ipx,ipy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).astype(np.float32)/255*2-1
      worldnormal=(npixel[:,:,0:1]*T+npixel[:,:,1:2]*Bt)*bump_scale+npixel[:,:,2:3]*geomN
      worldnormal/=np.maximum(np.linalg.norm(worldnormal,axis=2,keepdims=True),1e-6)
      tex_light=np.clip(np.sum(worldnormal*light,axis=2),0,1)
      block*=((.43+.57*tex_light)/max(shade,.01))[:,:,None]
    if texorm is not None and pi>=7:
     oc=cv2.remap(texorm,ipx,ipy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).astype(np.float32)[:,:,0]/255
     block*=((1-.67)+.67*oc)[:,:,None]
   col=np.clip(np.round(block*255),0,255).astype(np.uint8)
   img=bg[miny:maxy,minx:maxx]
   img[mask]=col[mask]
   zi[mask]=depth[mask]
   face_count+=1
   if pi>=7:skin_pixels+=int(mask.sum())
 if crop is not None:
  bg=bg.crop(crop)
 Image.fromarray(bg).save(out)
 print('render',Path(out).name,'triangles drawn',face_count,'skin pixels',skin_pixels,'yaw',yaw)
 return Image.fromarray(bg)

if __name__=='__main__':
 from argparse import ArgumentParser
 a=ArgumentParser();a.add_argument('glb');a.add_argument('output');a.add_argument('--yaw',type=float,default=0);a.add_argument('--zoom',type=float,default=1);a.add_argument('--rest',action='store_true');a.add_argument('--spread',type=float,default=6)
 args=a.parse_args();render(args.glb,args.output,args.yaw,args.zoom,not args.rest, spread_angle=args.spread)
