#!/usr/bin/env python3
"""R36KY: lossless base-texel POT compatibility alternative to R36KX.
Split only the repaired faces into dedicated normal textures; do not resample.
Pad the eye atlas by edge extension. Preserve original geometry and rig.
More primitives/materials are the deliberate cost of using standard POT pages.
"""
from __future__ import annotations
import copy,json,argparse
from pathlib import Path
import numpy as np
from glb_tools import load,arr,accessor,primitive,replace,image,image_bytes,png,replace_image,view,pack,sha
from prepare_r36ky import ROOT,LOCK,COMMIT
REPORT_LOCK={1024:'3eaec704e3d8d1676ac19c35294e101ecc8d59f3e78c0df1bb955f9aca674998',512:'54deb09c4be2ae6ab1a92301c8e65ad9fd5dc8e5729f66df14a152ddf3f95caf'}
PARTS=(1,7,8,9,10,11)
def pot(n):return n>0 and n&(n-1)==0
def area(g,b):return sum(int(np.prod(image(g,b,i).shape[:2]))*4 for i in range(len(g['images'])))
def uvbad(uv):
 a=uv[:,1]-uv[:,0];d=uv[:,2]-uv[:,0]
 return int((np.abs(a[:,0]*d[:,1]-a[:,1]*d[:,0])<1e-10).sum())
def bilinear(im,uv,repeat=False):
 h,w=im.shape[:2];x=uv[...,0]*w-.5;y=uv[...,1]*h-.5
 x0=np.floor(x).astype(int);y0=np.floor(y).astype(int);a=x-x0;c=y-y0
 def sample(ix,iy):
  ix=ix%w if repeat else np.clip(ix,0,w-1)
  return im[np.clip(iy,0,h-1),ix].astype(float)
 return (sample(x0,y0)*(1-a)[...,None]+sample(x0+1,y0)*a[...,None])*(1-c)[...,None]+(sample(x0,y0+1)*(1-a)[...,None]+sample(x0+1,y0+1)*a[...,None])*c[...,None]
def texture(g,b,im,name,sampler,out):
 data=png(im);i=len(g['images'])
 g['images'].append({'bufferView':view(g,b,data),'mimeType':'image/png','name':name})
 t=len(g['textures']);g['textures'].append({'source':i,'sampler':sampler,'name':name})
 (out/(name+'.png')).write_bytes(data);return t
def replace_png(g,b,i,im,name,out):
 data=png(im);replace_image(g,b,i,data,name);(out/(name+'.png')).write_bytes(data)
def material_copy(g,mi,tex):
 m=copy.deepcopy(g['materials'][mi]);m['name']=m.get('name','material')+' / R36KY patch page'
 m['normalTexture']['index']=tex
 i=len(g['materials']);g['materials'].append(m);return i
def build(size):
 src=ROOT/'input'/f'R36KX_F11_COMPACT_NORMAL_{size}_2100TRI.glb'
 rp=ROOT/'input'/f'R36KX_{size}_BUILD_REPORT.json'
 assert sha(src.read_bytes())==LOCK[size] and sha(rp.read_bytes())==REPORT_LOCK[size]
 report=json.loads(rp.read_text(encoding='utf8'));g,b=load(src);g0,b0=load(src)
 assert len(g['meshes'])==1 and len(g['meshes'][0]['primitives'])==12
 assert not any(p.get('targets') for p in g['meshes'][0]['primitives'])
 out=ROOT/'output';out.mkdir(exist_ok=True)
 old_body=image(g,b,3);old_hair=image(g,b,7);old_eye=image(g,b,1)
 body=old_body[:,:size].copy();hair=old_hair[:256,4:260].copy()
 assert old_eye.shape==(96,192,3)
 eye=np.pad(old_eye,((0,32),(0,64),(0,0)),mode='edge')
 bp=np.full((size//2,size//2,3),[128,128,255],dtype=np.uint8)
 hp=np.full((128,128,3),[128,128,255],dtype=np.uint8)
 patches={};counters={'body':0,'hair':0}
 for p in report['patches']:
  kind=p['kind'];i=counters[kind];counters[kind]+=1;t=p['tile']
  dst=hp if kind=='hair' else bp;source=old_hair if kind=='hair' else old_body
  cols=4 if kind=='hair' else 8
  x=(i%cols)*t;y=(i//cols)*t;ox=p['newX'];oy=p['newY']
  assert x+t<=dst.shape[1] and y+t<=dst.shape[0]
  dst[y:y+t,x:x+t]=source[oy:oy+t,ox:ox+t]
  patches[(p['primitive'],p['face'])]={**p,'dstX':x,'dstY':y,'dstW':dst.shape[1],'dstH':dst.shape[0]}
 assert counters=={'body':56,'hair':14}
 replace_png(g,b,3,body,f'R36KY_BODY_BASE_NORMAL_{size}',out)
 replace_png(g,b,7,hair,'R36KY_HAIR_BASE_NORMAL_256',out)
 replace_png(g,b,1,eye,'R36KY_EYE_POT_256x128',out)
 # Base hair retains original repeat-S sampler. Patch hair uses clamp to avoid
 # page edge wrapping. All other material parameters are unchanged.
 clamp=copy.deepcopy(g['samplers'][0]);clamp['wrapS']=33071;clamp['wrapT']=33071
 sampler=len(g['samplers']);g['samplers'].append(clamp)
 bt=texture(g,b,bp,f'R36KY_BODY_PATCH_NORMAL_{size//2}',g['textures'][3]['sampler'],out)
 ht=texture(g,b,hp,'R36KY_HAIR_PATCH_NORMAL_128',sampler,out)
 mats={1:material_copy(g,5,ht),10:material_copy(g,3,bt)}
 mats[11]=mats[10]
 mapping={i:{'sourcePrimitive':i,'sourceFaces':list(range(len(primitive(g0,b0,i)[1])))} for i in range(12)}
 p_list=g['meshes'][0]['primitives']
 for pi in PARTS:
  a,f=primitive(g0,b0,pi);old=old_hair if pi==1 else old_body
  pix=a['TEXCOORD_1'][f].astype(float)*[old.shape[1],old.shape[0]]
  ispatch=np.array([(pi,j) in patches for j in range(len(f))])
  uv=pix.copy()
  if pi==1:uv-=np.array([4.,0.]);uv/=256
  else:uv/=size
  for fi in np.flatnonzero(ispatch):
   p=patches[(pi,int(fi))]
   uv[fi]=(pix[fi]+[p['dstX']-p['newX'],p['dstY']-p['newY']])/[p['dstW'],p['dstH']]
  def subset(ids,target):
   # All attributes other than TEXCOORD_1 are copied byte for byte.
   used,inv=np.unique(f[ids].reshape(-1),return_inverse=True);newf=inv.reshape(-1,3)
   vals={k:v[used].copy() for k,v in a.items()}
   newuv=np.empty((len(used),2),dtype='<f4');seen={}
   for vi,q in zip(newf.reshape(-1),uv[ids].reshape(-1,2).astype('<f4')):
    v=int(vi)
    if v in seen and not np.array_equal(seen[v],q):raise ValueError('Shared UV crosses atlas relocation')
    seen[v]=q;newuv[v]=q
   vals['TEXCOORD_1']=newuv
   replace(g,b,target,vals,newf)
   mapping[target]={'sourcePrimitive':pi,'sourceFaces':ids.tolist()}
  if ispatch.any():
   target=len(p_list);p_list.append(copy.deepcopy(p_list[pi]))
   p_list[target]['material']=mats[pi]
   subset(np.flatnonzero(ispatch),target)
   subset(np.flatnonzero(~ispatch),pi)
  else:subset(np.arange(len(f)),pi)
 # All original eye pixels retained; clamp extension maintains base samples.
 for pi in (5,6):
  a,f=primitive(g,b,pi);p=p_list[pi];uv=(a['TEXCOORD_0'].astype(float)*[192/256,96/128]).astype('<f4')
  old=p['attributes']['TEXCOORD_0'];p['attributes']['TEXCOORD_0']=accessor(g,b,uv,g['accessors'][old])
 g['asset']['generator']='XPZ3D R36KY POT texture pages'
 g['extras']={**g.get('extras',{}),'revision':'R36KY','sourceCommit':COMMIT,'sourceSha256':LOCK[size],
  'potCompatibilityAlternative':True,'engineApplied':False,'highPolyRecoveryClaimed':False}
 dst=out/f'R36KY_F11_POT_COMPAT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b))
 g1,b1=load(dst)
 for key in ('nodes','scenes','scene','animations'):
  assert g0.get(key)==g1.get(key)
 for a,c in zip(g0['skins'],g1['skins']):
  assert {k:v for k,v in a.items() if k!='inverseBindMatrices'}=={k:v for k,v in c.items() if k!='inverseBindMatrices'}
  assert np.array_equal(arr(g0,b0,a['inverseBindMatrices']),arr(g1,b1,c['inverseBindMatrices']))
 # Full triangle-corner proof plus deterministic base-level sampler comparison.
 rng=np.random.default_rng(36025)
 bary=np.concatenate([np.eye(3),np.array([[.5,.5,0],[.5,0,.5],[0,.5,.5]]),rng.dirichlet(np.ones(3),size=9)])
 rows=[];seen={i:[] for i in range(12)};tris=verts=0;maxerr=0;bad=0
 for i,p in enumerate(g1['meshes'][0]['primitives']):
  m=mapping[i];pi=m['sourcePrimitive'];ids=np.array(m['sourceFaces'],dtype=int);seen[pi]+=ids.tolist()
  a,f=primitive(g0,b0,pi);c,h=primitive(g1,b1,i);assert len(ids)==len(h)
  for k in a:
   if k=='TEXCOORD_1' and pi in PARTS or k=='TEXCOORD_0' and pi in (5,6):continue
   assert np.array_equal(a[k][f[ids]],c[k][h]),(i,k)
  oldmat=g0['materials'][g0['meshes'][0]['primitives'][pi]['material']]
  newmat=g1['materials'][p['material']]
  aa=copy.deepcopy(oldmat);bb=copy.deepcopy(newmat)
  for mm in (aa,bb):
   mm.pop('name',None)
   if mm.get('normalTexture'):mm['normalTexture'].pop('index',None)
  assert aa==bb,(i,'material parameters')
  def samples(key):return (np.einsum('sk,fkc->fsc',bary,a[key][f[ids]].astype(float)),np.einsum('sk,fkc->fsc',bary,c[key][h].astype(float)))
  err=0.;count=0
  nt=newmat.get('normalTexture')
  if nt:
   key='TEXCOORD_'+str(nt.get('texCoord',0));bad+=uvbad(c[key][h])
   if pi in PARTS:
    u,v=samples(key)
    oi=g0['textures'][oldmat['normalTexture']['index']]['source'];t=g1['textures'][nt['index']];ni=t['source']
    oldi=image(g0,b0,oi);newi=image(g1,b1,ni)
    repeat=g1['samplers'][t['sampler']].get('wrapS',10497)==10497
    err=float(np.abs(bilinear(oldi,u,pi==1)-bilinear(newi,v,repeat)).max());count=int(np.prod(u.shape[:-1]))
  if pi in (5,6):
   u,v=samples('TEXCOORD_0');err=float(np.abs(bilinear(old_eye,u)-bilinear(eye,v)).max());count=int(np.prod(u.shape[:-1]))
  assert err<.02,(i,err)
  maxerr=max(maxerr,err);tris+=len(h);verts+=len(c['POSITION'])
  rows.append({'primitive':i,'sourcePrimitive':pi,'triangles':len(h),'samples':count,'maxBaseSampleRGBByteError':err})
 for i,ids in seen.items():assert sorted(ids)==list(range(len(primitive(g0,b0,i)[1])))
 assert tris==2100 and bad==0 and len(g1['skins'][0]['joints'])==63
 same=[]
 for i in range(9):
  if i in (1,3,7):continue
  assert image_bytes(g0,b0,i)==image_bytes(g1,b1,i);same.append(i)
 # Verify exact copied texels for all atlas regions including patch gutters.
 assert np.array_equal(image(g1,b1,3),body) and np.array_equal(image(g1,b1,7),hair)
 assert np.array_equal(image(g1,b1,1)[:96,:192],old_eye)
 for p in patches.values():
  kind=p['kind'];old=old_hair if kind=='hair' else old_body;new=image(g1,b1,g1['textures'][ht if kind=='hair' else bt]['source'])
  x,y,t=p['newX'],p['newY'],p['tile'];nx,ny=p['dstX'],p['dstY']
  assert np.array_equal(old[y:y+t,x:x+t],new[ny:ny+t,nx:nx+t])
 dims=[list(reversed(image(g1,b1,i).shape[:2])) for i in range(len(g1['images']))]
 assert all(pot(w) and pot(h) for w,h in dims)
 result={'version':'R36KY','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'output':dst.name,'sha256':sha(dst.read_bytes()),'bytesBefore':src.stat().st_size,'bytesAfter':dst.stat().st_size,'triangles':tris,'bones':63,'verticesBefore':sum(len(primitive(g0,b0,i)[0]['POSITION']) for i in range(12)),'verticesAfter':verts,'primitivesBefore':12,'primitivesAfter':len(p_list),'materialsBefore':len(g0['materials']),'materialsAfter':len(g1['materials']),'imagesBefore':9,'imagesAfter':len(dims),'imageDimensions':dims,'allImagesPOT':True,'basePatchTexelsRetained':70,'normalUVDegenerateFaces':bad,'originalTriangleCornerAttributesPreservedExceptRemappedUVs':True,'unchangedImageIndices':same,'eyeOriginalPixelsRetained':True,'maxBaseSampleRGBByteError':maxerr,'sampleComparisons':rows,'textureRGBA8BytesNoMipsBefore':area(g0,b0),'textureRGBA8BytesNoMipsAfter':area(g1,b1),'mipmapsIdentical':False,'engineApplied':False,'actualGPUAllocationMeasured':False}
 (out/f'R36KY_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 print(json.dumps({k:v for k,v in result.items() if k!='sampleComparisons'},indent=2),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--size',choices=['1024','512','both'],default='both');a=p.parse_args()
 for s in ((1024,512) if a.size=='both' else (int(a.size),)):build(s)
