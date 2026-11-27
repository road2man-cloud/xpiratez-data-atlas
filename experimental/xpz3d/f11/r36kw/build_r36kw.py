#!/usr/bin/env python3
"""R36KW: repair 70 collapsed normal-map UV faces without altering base color UVs.

R36KV is the immutable input. Geometry/skin/face/base-color are protected.
Hair cap detail is reprojected from the existing authored tangent frame.
Previously undefined leg-cap normal mapping gets conservative supplementary
rest-space relief, NOT recovered high-poly detail. Body uses pinned MikkTSpace.
"""
from __future__ import annotations
import argparse, copy, json, subprocess
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates
from glb_tools import load,arr,accessor,primitive,replace,image,image_bytes,png,replace_image,pack,sha,unit
from prepare_r36kw import LOCK,COMMIT
ROOT=Path(__file__).resolve().parent
CHANGED=(1,7,8,9,10,11)

def uvdet(uv):
 a=uv[:,1]-uv[:,0];b=uv[:,2]-uv[:,0]
 return a[:,0]*b[:,1]-a[:,1]*b[:,0]

def frame(n,t):
 n=unit(n);tt=unit(t[...,:3]-n*np.sum(t[...,:3]*n,axis=-1,keepdims=True))
 bb=unit(np.cross(n,tt))*np.where(t[...,3:4]<0,-1.,1.)
 return n,tt,bb

def sample(im,uv):
 # glTF UV origin is the first image row. Preserve texel-center sampling.
 hh,ww=im.shape[:2];xy=np.array([uv[...,1]*hh-.5,uv[...,0]*ww-.5])
 return np.stack([map_coordinates(im[...,i].astype(float),xy,order=1,mode='nearest') for i in range(3)],axis=-1)

def geometric_patch(p,x,y,tile,padding,W,H):
 e1=p[1]-p[0];e2=p[2]-p[0];t=unit(e1);n=unit(np.cross(e1,e2));b=np.cross(n,t)
 q=np.array([[0,0],[np.linalg.norm(e1),0],[np.dot(e2,t),np.dot(e2,b)]])
 if abs(np.cross(q[1]-q[0],q[2]-q[0]))<1e-12:raise ValueError('Geometric zero-area face cannot be UV repaired')
 q-=q.min(axis=0);span=tile-2*padding-1
 q*=span/max(q.max(),1e-12)
 # Each face has an isolated padded chart. Every corner is at a texel center.
 return ((q+[x+padding+.5,y+padding+.5])/[W,H]).astype('<f4')

def bary_for_pixels(uv,x,y,tile,W,H):
 yy,xx=np.mgrid[y:y+tile,x:x+tile];pp=np.stack([(xx+.5)/W,(yy+.5)/H],axis=-1)
 a=uv[1]-uv[0];b=uv[2]-uv[0];d=a[0]*b[1]-a[1]*b[0]
 dx=pp-uv[0];s=(dx[...,0]*b[1]-dx[...,1]*b[0])/d;t=(a[0]*dx[...,1]-a[1]*dx[...,0])/d
 w=np.stack([1-s-t,s,t],axis=-1)
 # Extend edge samples into the entire chart gutter, never paint unrelated charts.
 w=np.maximum(w,0);w/=np.maximum(w.sum(axis=-1,keepdims=True),1e-12)
 return w

def relief(p,n):
 # Gentle material microdetail for formerly undefined leg UVs; <= 2 degrees.
 directions=unit(np.array([[.6,.7,.3],[-.2,.9,.6],[.7,-.2,.8],[.3,.1,.95]]))
 frequency=np.array([7.,13.,23.,37.]);phase=np.array([.3,1.7,3.,2.1])
 arg=np.einsum('...c,kc->...k',p,directions)*frequency*(2*np.pi)+phase
 grad=np.einsum('...k,kc->...c',np.cos(arg)*np.array([.012,.009,.006,.004]),directions)
 grad-=n*np.sum(grad*n,axis=-1,keepdims=True)
 return unit(n-grad)

def dedup_corners(values):
 # Exact attribute bytes only: no approximation, welding by position, or weight loss.
 flat={k:np.ascontiguousarray(v.reshape(-1,v.shape[-1])) for k,v in values.items()}
 unique=[];ids=[];cache={};keys=sorted(flat)
 for i in range(len(next(iter(flat.values())))):
  k=b''.join(flat[a][i].tobytes() for a in keys)
  if k not in cache:cache[k]=len(unique);unique.append(i)
  ids.append(cache[k])
 return {k:v[unique] for k,v in flat.items()},np.asarray(ids,dtype='uint16').reshape(-1,3)

def mikk(parts):
 payload=[{'position':p['POSITION'].astype(float).reshape(-1).tolist(),'normal':p['NORMAL'].astype(float).reshape(-1).tolist(),'uv':p['TEXCOORD_1'].astype(float).reshape(-1).tolist()} for p in parts]
 r=subprocess.run(['node',str(ROOT/'mikktspace_stage.mjs')],input=json.dumps(payload),text=True,capture_output=True,encoding='utf8',check=True,cwd=ROOT)
 return [np.asarray(t,dtype='<f4').reshape(-1,3,4) for t in json.loads(r.stdout)]

def normal_uv_counts(g,b):
 rows=[]
 for pi,p in enumerate(g['meshes'][0]['primitives']):
  mat=g['materials'][p['material']];nt=mat.get('normalTexture')
  if nt is None:continue
  a,f=primitive(g,b,pi);key='TEXCOORD_'+str(nt.get('texCoord',0))
  uv=a[key][f];n=int((np.abs(uvdet(uv))<1e-10).sum())
  rows.append({'primitive':pi,'normalUV':key,'degenerateFaces':n,'hasTangent':'TANGENT' in a})
 return rows

def verify(src,dest):
 g0,b0=load(src);g1,b1=load(dest);raw=dest.read_bytes();rows=[];changed_zero=0
 for k in ('nodes','scenes','scene','animations'):
  if g0.get(k)!=g1.get(k):raise AssertionError(k+' changed')
 for a,b in zip(g0['skins'],g1['skins']):
  assert {k:v for k,v in a.items() if k!='inverseBindMatrices'}=={k:v for k,v in b.items() if k!='inverseBindMatrices'}
  assert np.array_equal(arr(g0,b0,a['inverseBindMatrices']),arr(g1,b1,b['inverseBindMatrices']))
 v0=v1=tris=0
 for pi in range(len(g0['meshes'][0]['primitives'])):
  a,f=primitive(g0,b0,pi);b,h=primitive(g1,b1,pi);assert f.shape==h.shape
  for key in a:
   if key=='TANGENT' and pi in CHANGED:continue
   if key=='JOINTS_0':
    ww=a['WEIGHTS_0'][f];diff=a[key][f]!=b[key][h]
    assert not (diff & (ww!=0)).any();changed_zero+=int(diff.sum());continue
   assert np.array_equal(a[key][f],b[key][h]),(pi,key)
  if 'TANGENT' in b:
   nn=unit(b['NORMAL']);tt=b['TANGENT'];assert np.isfinite(tt).all()
   assert np.max(np.abs(np.linalg.norm(tt[:,:3],axis=1)-1))<2e-5
   assert np.max(np.abs(np.sum(nn*tt[:,:3],axis=1)))<2e-5
   assert set(np.unique(tt[:,3]))<={-1.,1.}
  v0+=len(a['POSITION']);v1+=len(b['POSITION']);tris+=len(f)
  rows.append({'primitive':pi,'verticesBefore':len(a['POSITION']),'verticesAfter':len(b['POSITION']),'triangles':len(f)})
 for i,(a,b) in enumerate(zip(g0['materials'],g1['materials'])):
  ac=copy.deepcopy(a);bc=copy.deepcopy(b)
  for m in (ac,bc):
   if i in (1,2,3,5):m['normalTexture'].pop('texCoord',None)
  assert ac==bc,('material',i)
 # All color, ORM and other normal images untouched. Only body/hair normal atlases repacked.
 same=[]
 for i in range(len(g0['images'])):
  if i not in (3,7):assert image_bytes(g0,b0,i)==image_bytes(g1,b1,i);same.append(i)
 body0=image(g0,b0,3);body1=image(g1,b1,3);hair0=image(g0,b0,7);hair1=image(g1,b1,7)
 assert np.array_equal(body0,body1[:,:body0.shape[1]])
 assert np.array_equal(hair0,hair1[:,4:4+hair0.shape[1]])
 before=normal_uv_counts(g0,b0);after=normal_uv_counts(g1,b1)
 assert sum(r['degenerateFaces'] for r in before)==70
 assert all(r['degenerateFaces']==0 and r['hasTangent'] for r in after)
 assert tris==2100 and len(g1['skins'][0]['joints'])==63
 mem0=sum(image(g0,b0,i).shape[0]*image(g0,b0,i).shape[1]*4 for i in range(len(g0['images'])))
 mem1=sum(image(g1,b1,i).shape[0]*image(g1,b1,i).shape[1]*4 for i in range(len(g1['images'])))
 return {'triangles':tris,'bones':63,'verticesBefore':v0,'verticesAfter':v1,'primitivesBefore':12,'primitivesAfter':len(g1['meshes'][0]['primitives']),
  'bytes':len(raw),'sourceBytes':src.stat().st_size,'sha256':sha(raw),'perPrimitive':rows,
  'normalUVBefore':before,'normalUVAfter':after,'normalUVDegenerateBefore':70,'normalUVDegenerateAfter':0,
  'originalColorUVsUnchanged':True,'originalColorsAndRoughnessUnchanged':True,'originalTriangleCornerAttributesPreserved':True,
  'unchangedImageIndices':same,'originalNormalAtlasPixelsRetained':True,'changedZeroWeightJointCornerSlots':changed_zero,
  'estimatedRGBA8TextureBytesNoMipsBefore':mem0,'estimatedRGBA8TextureBytesNoMipsAfter':mem1,
  'textureMemoryEstimateNotMeasuredGPUAllocation':True,'engineApplied':False,'highPolyRecoveryClaimed':False}

def build(size):
 src=ROOT/'input'/f'R36KV_F11_SHARED_UV_{size}_2100TRI.glb';data=src.read_bytes()
 if sha(data)!=LOCK[size]:raise ValueError('Pinned source mismatch')
 g,b=load(src);originals={pi:primitive(g,b,pi) for pi in CHANGED}
 out=ROOT/'output';out.mkdir(exist_ok=True)
 oldbody=image(g,b,3);oldhair=image(g,b,7);N=oldbody.shape[0]
 assert oldbody.shape==(N,N,3) and oldhair.shape==(256,256,3)
 body=np.full((N,N*2,3),[128,128,255],dtype='uint8');body[:,:N]=oldbody
 hair=np.full((256,512,3),[128,128,255],dtype='uint8');hair[:,4:260]=oldhair;hair[:,:4]=oldhair[:,-4:];hair[:,260:264]=oldhair[:,:4]
 corner={};patches=[];counters={'hair':0,'body':0}
 for pi in CHANGED:
  a,f=originals[pi];values={k:v[f].copy() for k,v in a.items()}
  uv0=values['TEXCOORD_0'];uv1=uv0.copy()
  if pi==1:uv1[...,0]=(uv0[...,0]*256+4)/512
  else:uv1[...,0]*=.5
  bad=np.where(np.abs(uvdet(uv0))<1e-10)[0]
  for fi in bad:
   kind='hair' if pi==1 else 'body';c=counters[kind];counters[kind]+=1
   if kind=='hair':tile=32;pad=4;W=512;H=256;x=280+(c%7)*tile;y=8+(c//7)*tile
   else:tile=48 if size==1024 else 24;pad=5 if size==1024 else 3;W=N*2;H=N;x=N+8+(c%8)*tile;y=8+(c//8)*tile
   if x+tile>W or y+tile>H:raise AssertionError('Patch atlas overflow')
   uv1[fi]=geometric_patch(values['POSITION'][fi].astype(float),x,y,tile,pad,W,H)
   patches.append({'primitive':pi,'face':int(fi),'kind':kind,'x':x,'y':y,'tile':tile,'width':W,'height':H})
  values['TEXCOORD_1']=uv1;corner[pi]=values
 # Hair's valid tangent frames are preserved exactly. Invalid UV caps get a proper frame.
 ha=corner[1];hair_mikk=mikk([ha])[0]
 hair_bad={p['face'] for p in patches if p['primitive']==1}
 for fi in hair_bad:ha['TANGENT'][fi]=hair_mikk[fi]
 for pi,t in zip(CHANGED[1:],mikk([corner[i] for i in CHANGED[1:]])):corner[pi]['TANGENT']=t
 angles=[]
 for p in patches:
  pi=p['primitive'];fi=p['face'];v=corner[pi]
  w=bary_for_pixels(v['TEXCOORD_1'][fi],p['x'],p['y'],p['tile'],p['width'],p['height'])
  pos=np.einsum('...k,kc->...c',w,v['POSITION'][fi]);n=unit(np.einsum('...k,kc->...c',w,v['NORMAL'][fi]));t=np.einsum('...k,kc->...c',w,v['TANGENT'][fi]);n,ta,bt=frame(n,t)
  if pi==1:
   a,f=originals[1];oldt=np.einsum('...k,kc->...c',w,a['TANGENT'][f[fi]])
   _,ot,ob=frame(n,oldt);uv=np.einsum('...k,kc->...c',w,a['TEXCOORD_0'][f[fi]])
   nv=unit(sample(oldhair,uv)/127.5-1)
   target=unit(ot*nv[...,:1]+ob*nv[...,1:2]+n*nv[...,2:3])
  else:target=relief(pos,n)
  nt=unit(np.stack([np.sum(target*ta,axis=-1),np.sum(target*bt,axis=-1),np.sum(target*n,axis=-1)],axis=-1))
  atlas=hair if pi==1 else body
  atlas[p['y']:p['y']+p['tile'],p['x']:p['x']+p['tile']]=np.clip(np.rint((nt+1)*127.5),0,255).astype('uint8')
  angles.append(float(np.degrees(np.arccos(np.clip(nt[...,2],-1,1))).max()))
 for pi,values in corner.items():
  values,indices=dedup_corners(values);replace(g,b,pi,values,indices)
 # Zero-weight joint identifiers are semantically unused. Canonicalizing is lossless.
 zero_slots=0
 for pi,p in enumerate(g['meshes'][0]['primitives']):
  a,f=primitive(g,b,pi);mask=(a['WEIGHTS_0']==0)&(a['JOINTS_0']!=0)
  if mask.any():
   j=a['JOINTS_0'].copy();zero_slots+=int(mask.sum());j[mask]=0
   p['attributes']['JOINTS_0']=accessor(g,b,j,g['accessors'][p['attributes']['JOINTS_0']])
 for mi in (1,2,3,5):g['materials'][mi]['normalTexture']['texCoord']=1
 for ii,im,name in [(3,body,f'R36KW_BODY_NORMAL_{size}'),(7,hair,'R36KW_HAIR_NORMAL_512x256')]:
  pdata=png(im);replace_image(g,b,ii,pdata,name);(out/(name+'.png')).write_bytes(pdata)
 g['asset']['generator']='XPZ3D R36KW normal-UV repair / pinned MikkTSpace / original color preserved'
 g['extras']={**g.get('extras',{}),'revision':'R36KW','sourceSha256':LOCK[size],
  'normalUVRepair':{'faces':70,'hair':14,'legs':56,'originalColorUVRetained':True,'originalBodyAndHairNormalPixelsRetained':True},
  'highPolyRecoveryClaimed':False,'engineApplied':False}
 dest=out/f'R36KW_F11_NORMAL_UV_REPAIR_{size}_2100TRI.glb';dest.write_bytes(pack(g,b))
 report=verify(src,dest);report.update(version='R36KW',output=dest.name,sourceSha256=LOCK[size],sourceCommit=COMMIT,
  hairFacesReprojected=14,legFacesNewSupplementaryRelief=56,zeroWeightJointSlotsCanonicalized=zero_slots,
  tangentGenerator='MikkTSpace from pinned three.js r170 with glTF W sign inversion; valid hair tangents retained',
  maxPatchNormalAngleDegrees=max(angles),patches=patches,
  limitations=['Original degenerate color UVs are intentionally retained; only normal UVs repaired.','Expanded body/hair normal atlases increase decoded texture memory.','No geometry repair, topology weld, engine installation, combat animation or FPS measurement.'])
 (out/f'R36KW_{size}_BUILD_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
 print(json.dumps({k:report[k] for k in ('version','output','bytes','verticesBefore','verticesAfter','triangles','bones','normalUVDegenerateBefore','normalUVDegenerateAfter','zeroWeightJointSlotsCanonicalized','estimatedRGBA8TextureBytesNoMipsBefore','estimatedRGBA8TextureBytesNoMipsAfter','sha256')},indent=2),flush=True)
 return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--size',choices=['1024','512','both'],default='both');a=p.parse_args()
 for s in ((1024,512) if a.size=='both' else (int(a.size),)):build(s)
