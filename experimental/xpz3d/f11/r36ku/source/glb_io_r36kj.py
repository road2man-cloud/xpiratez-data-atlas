#!/usr/bin/env python3
"""R36KJ: Repack R36KI skin UVs to full-width islands and bake skin PBR maps.

- 2100 triangles, R36HW face/hair/hands untouched, 63 joints unchanged.
- Five skin islands expand horizontally 2x; UVs change, positions don't.
- Procedural non-erotic external skin field: chest/waist/pelvis/shoulder/knee shading.
- 1024 quality variant and 512 compact variant, each complete standalone GLB.
- No high-density R36JB mesh is embedded in either game GLB.
"""
from __future__ import annotations
import io
import json
import hashlib
import math
import struct
from pathlib import Path
from typing import Any
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

HERE=Path(__file__).resolve().parent
SOURCE=HERE/'SOURCE_R36KI_F11_TEXTURED_SKIN_2100TRI.glb'
HW=HERE/'SOURCE_R36HW_F11_CLOTHED.glb'
SPRITE=HERE/'body500_F11_pir.gif'
DT={5126:np.dtype('<f4'),5123:np.dtype('<u2'),5121:np.dtype('u1'),5125:np.dtype('<u4')}
DIMS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
TILES={
 7: ('torso',.012,.488,.012,.988),
 8: ('left-shoulder',.512,.748,.796,.988),
 9: ('right-shoulder',.762,.988,.796,.988),
 10: ('left-leg',.512,.748,.012,.770),
 11: ('right-leg',.762,.988,.012,.770),
}

def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()

def glb_open(p:Path)->tuple[bytes,dict,bytearray]:
 raw=p.read_bytes()
 assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
 n=struct.unpack_from('<I',raw,12)[0]
 g=json.loads(raw[20:20+n]);off=20+n
 assert struct.unpack_from('<I',raw,off+4)[0]==0x004e4942
 length=struct.unpack_from('<I',raw,off)[0]
 B=bytearray(raw[off+8:off+8+length]);assert len(B)==length
 return raw,g,B

def a_read(g:dict,B:bytearray,i:int)->np.ndarray:
 a=g['accessors'][i];bv=g['bufferViews'][a['bufferView']]
 dtype=DT[a['componentType']];dim=DIMS[a['type']]
 assert not a.get('sparse'),'Sparse accessor unsupported'
 return np.ndarray((a['count'],dim),dtype=dtype,buffer=B,
  offset=bv.get('byteOffset',0)+a.get('byteOffset',0),
  strides=(bv.get('byteStride',dim*dtype.itemsize),dtype.itemsize)).copy()

def a_append(g,B,arr:np.ndarray,type_name,component_type,target=None)->int:
 values=np.ascontiguousarray(arr,dtype=DT[component_type])
 assert values.ndim==2 and values.shape[1]==DIMS[type_name]
 B.extend(b'\0'*((-len(B))%4));pos=len(B);B.extend(values.tobytes())
 bv={'buffer':0,'byteOffset':pos,'byteLength':values.nbytes}
 if target is not None:bv['target']=target
 bv_i=len(g['bufferViews']);g['bufferViews'].append(bv)
 ac={'bufferView':bv_i,'componentType':component_type,'count':len(values),'type':type_name}
 if type_name=='VEC3':ac.update(min=values.min(axis=0).astype(float).tolist(),max=values.max(axis=0).astype(float).tolist())
 ac_i=len(g['accessors']);g['accessors'].append(ac)
 return ac_i

def image_append(g,B,png:bytes,name:str)->int:
 B.extend(b'\0'*((-len(B))%4));off=len(B);B.extend(png)
 view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(png)})
 out=len(g.setdefault('images',[]));g['images'].append({'bufferView':view,'mimeType':'image/png','name':name})
 return out

def map_save(img:np.ndarray,p:Path)->bytes:
 buffer=io.BytesIO();Image.fromarray(img.astype(np.uint8),'RGB').save(buffer,format='PNG',optimize=True)
 data=buffer.getvalue();p.write_bytes(data);return data

def wrap_distance(u:np.ndarray,center:float)->np.ndarray:
 return np.abs((u-center+.5)%1-.5)

def gaussian(u:np.ndarray,c:float,w:float)->np.ndarray:
 return np.exp(-(wrap_distance(u,c)/w)**2)

def surface_fields(group:str,u:np.ndarray,v:np.ndarray,seed:int):
 """Smooth periodic anatomical light/height fields, UV seam continuous."""
 fr=gaussian(u,.25,.195)
 bk=gaussian(u,.75,.195)
 side=np.sin(2*np.pi*u)**2
 co=np.cos(2*np.pi*u)
 shade=.01*co
 h=np.zeros_like(u)
 rough=np.full_like(u,.92)
 ao=np.full_like(u,.985)
 if group=='torso':
  # Top-to-bottom V orientation follows the protected R36HW/R36KH body.
  chest=gaussian(u,.161,.064)+gaussian(u,.339,.064)
  high=np.exp(-((v-.755)/.115)**2)
  lower=np.exp(-((v-.662)/.044)**2)
  clavicle=np.exp(-((v-.87)/.025)**2)*fr
  under=.076*chest*lower
  sternum=gaussian(u,.25,.025)*np.exp(-((v-.75)/.17)**2)
  waist=fr*np.exp(-((v-.444)/.059)**2)
  navel=gaussian(u,.25,.017)*np.exp(-((v-.329)/.023)**2)
  pelvis=fr*np.exp(-((v-.095)/.085)**2)
  lower_back=bk*np.exp(-((v-.26)/.23)**2)
  spine=gaussian(u,.75,.027)*np.exp(-((v-.67)/.30)**2)
  scapula=(gaussian(u,.64,.055)+gaussian(u,.86,.055))*np.exp(-((v-.76)/.11)**2)
  # First-order highlights/shadows are part of diffuse texture, not geometry.
  shade+=.092*chest*high - under -.034*sternum + .031*clavicle
  shade+=-.040*waist-.073*navel-.019*pelvis-.026*spine+.028*scapula+.015*lower_back
  h+=.22*chest*high-.18*chest*lower-.12*sternum+.12*pelvis-.042*waist-.035*navel+.045*scapula
  rough-=.037*high*fr;rough+=.018*lower_back
  ao-=.125*chest*lower+.10*navel+.045*waist+.055*sternum
 elif group.endswith('shoulder'):
  cap=np.exp(-((v-.80)/.31)**2)
  armpit=np.exp(-((v-.055)/.19)**2)
  tricep=gaussian(u,.74,.16)
  shade+=.055*cap+.018*side-.065*armpit*(.4+.6*fr)-.013*tricep
  h+=.14*cap-.105*armpit+.02*tricep
  rough+=.021*armpit;ao-=.082*armpit
 else:
  quad=np.exp(-((v-.78)/.23)**2)
  knee=np.exp(-((v-.455)/.067)**2)
  calf=np.exp(-((v-.29)/.11)**2)
  ankle=np.exp(-((v-.085)/.08)**2)
  iliac=np.exp(-((v-.93)/.052)**2)
  shade+=.032*quad*fr-.045*knee*fr+.028*calf*(.6+side*.4)-.029*ankle+.026*iliac
  h+=.095*quad-.10*knee+.04*calf-.04*ankle+.035*iliac
  rough+=.018*knee+.014*ankle;ao-=.075*knee+.045*iliac
 # Lightweight softly varying color breaks up mechanical horizontal rings.
 # Gaussian-filter random noise with seam wrap preserves continuity at u=0 and u=1.
 rng=np.random.default_rng(seed)
 hh,ww=u.shape
 noise=rng.normal(0,1,(hh,ww))
 low=gaussian_filter(noise,sigma=(max(1.5,hh/46),max(1.5,ww/31)),mode=('reflect','wrap'))
 low/=max(low.std(),1e-6)
 micro=rng.normal(0,1,(hh,ww))
 med=gaussian_filter(micro,sigma=(max(.8,hh/310),max(.8,ww/290)),mode=('reflect','wrap'))
 med/=max(med.std(),1e-6)
 shade+=.009*low+.0035*med
 h+=.003*med+.014*low
 rough+=.012*low+.004*med
 shade=np.clip(shade,-.16,.12)
 rough=np.clip(rough,.82,.975)
 ao=np.clip(ao,.77,1.0)
 return shade,h,rough,ao

def skin_maps(N:int):
 sprite=np.asarray(Image.open(SPRITE).convert('RGB'),dtype=np.uint8).reshape((-1,3))
 pix=sprite[(sprite[:,0]>=68)&(sprite[:,0]<=178)&(sprite[:,1]<155)&(sprite[:,2]<90)&(sprite[:,0]>sprite[:,1]*1.08)]
 if len(pix)<500:raise RuntimeError('Missing F11 skin reference pixels')
 colors=np.median(pix,axis=0).astype(int).tolist()
 img=np.full((N,N,3),[220,220,210],dtype=np.uint8)
 norm=np.full((N,N,3),[128,128,255],dtype=np.uint8)
 orm=np.full((N,N,3),[255,236,0],dtype=np.uint8)
 base=np.array([230,205,157],float)
 report={}
 for j,(name,u0,u1,v0,v1) in TILES.items():
  x0=round(u0*N);x1=round(u1*N);y0=round((1-v1)*N);y1=round((1-v0)*N)
  hh,ww=y1-y0,x1-x0
  yy,xx=np.mgrid[0:hh,0:ww]
  u=(xx+.5)/ww;v=1-(yy+.5)/hh
  shade,height,rough,ao=surface_fields(name,u,v,seed=20261127+30*j)
  # Calibrated against F11's brown ochre skin; baseColorFactor on the GLB
  # additionally modulates these sRGB RGB texels.
  shifts=np.array([1.0,.88,.76])
  rgb=base[None,None,:]*(1+shade[:,:,None]*shifts[None,None,:])
  # The values are full RGB skin shades, not skin surface transparency.
  img[y0:y1,x0:x1]=np.clip(np.round(rgb),0,255).astype(np.uint8)
  # Bake tactile depth variation as tangent-space normals, no triangles.
  grady,gradx=np.gradient(height.astype('float32'))
  # Larger UV coverage yields more detailed texel gradients; amplify cautiously.
  grad_scale=13*(1024/N)
  nx=-gradx*grad_scale;ny=-grady*grad_scale
  nn=np.stack((nx,ny,np.ones_like(nx)),axis=-1)
  nn/=np.linalg.norm(nn,axis=2,keepdims=True)
  norm[y0:y1,x0:x1]=np.uint8(np.clip(np.round((nn*.5+.5)*255),0,255))
  orm[y0:y1,x0:x1,0]=np.uint8(np.clip(np.round(255*ao),0,255))
  orm[y0:y1,x0:x1,1]=np.uint8(np.clip(np.round(255*rough),0,255))
  orm[y0:y1,x0:x1,2]=0
  report[str(j)]={'area':name,'rect':[(x0,y0),(x1,y1)],'sampledPixels':hh*ww,'meanAlbedo':np.rint(np.mean(img[y0:y1,x0:x1],axis=(0,1))).astype(int).tolist(),'meanRoughness':float(np.mean(rough))}
 # Quantize high-frequency PBR channels to reduce GPU upload/storage cost.
 # Keep albedo continuous; normals use 4/4/4 LSB steps and ORM uses 3/3 steps.
 norm[:,:,:2]=((norm[:,:,:2].astype(np.uint16)+2)//4*4).clip(0,255).astype(np.uint8)
 norm[:,:,2]=((norm[:,:,2].astype(np.uint16)+2)//4*4).clip(0,255).astype(np.uint8)
 orm[:,:,:2]=((orm[:,:,:2].astype(np.uint16)+2)//4*4).clip(0,255).astype(np.uint8)
 maps={}
 for name,arr in [('ALBEDO',img),('NORMAL',norm),('ORM',orm)]:
  p=HERE/('R36KJ_'+str(N)+'_SKIN_'+name+'.png')
  maps[name]={'filename':p.name,'bytes':map_save(arr,p),'path':p}
 return maps,{'spriteMedianRGB':colors,'referenceSprite':SPRITE.name,'tiles':report,'atlasResolution':N,'fullIslandWidth':True}

def pack(g,B)->bytes:
 g['buffers'][0]['byteLength']=len(B)
 js=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode('utf-8')
 js+=b' '*((-len(js))%4);B.extend(b'\0'*((-len(B))%4))
 return struct.pack('<4sII',b'glTF',2,28+len(js)+len(B))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(B),0x004e4942)+B

def build(N:int,src_raw:bytes,hw_raw:bytes):
 source_sha=sha(src_raw)
 raw,g,B=glb_open(SOURCE)
 assert sha(raw)==source_sha
 original_binary=bytes(B)
 prot_before=json.dumps(g['meshes'][0]['primitives'][:7],sort_keys=True)
 original_joint_def=json.dumps(g['skins'],sort_keys=True)
 originals=[a_read(g,B,g['meshes'][0]['primitives'][k]['attributes']['POSITION']) for k in range(7)]
 src_uv={}
 for k,(name,u0,u1,v0,v1) in TILES.items():
  p=g['meshes'][0]['primitives'][k]
  old=a_read(g,B,p['attributes']['TEXCOORD_0'])
  scale_uv=np.copy(old)
  # R36KI mapped only half the available U width. Stretch within the exact
  # allocated island, preserving seam duplicate vertices and face indices.
  scale_uv[:,0]=u0+(old[:,0]-u0)*2.
  if np.any(scale_uv[:,0]<u0-1e-4) or np.any(scale_uv[:,0]>u1+1e-4):
   raise AssertionError(f'UV island out of bounds: {k} {scale_uv.min(0)} {scale_uv.max(0)}')
  acc=a_append(g,B,scale_uv,'VEC2',5126,34962)
  p['attributes']['TEXCOORD_0']=acc
  src_uv[k]={'minU_before':round(float(old[:,0].min()),5),'maxU_before':round(float(old[:,0].max()),5),
   'minU_after':round(float(scale_uv[:,0].min()),5),'maxU_after':round(float(scale_uv[:,0].max()),5),
   'islandWidthUsageBefore':round(float((old[:,0].max()-old[:,0].min())/(u1-u0)),4),
   'islandWidthUsageAfter':round(float((scale_uv[:,0].max()-scale_uv[:,0].min())/(u1-u0)),4),
   'vertices':len(old)}
 maps,stats=skin_maps(N)
 sampler_i=len(g['samplers'])
 g['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071,'name':f'R36KJ {N} atlas CLAMP'})
 textures={}
 for name,s in maps.items():
  im=image_append(g,B,s['bytes'],f'R36KJ {N} PBR {name}')
  tex=len(g['textures']);g['textures'].append({'source':im,'sampler':sampler_i,'name':f'R36KJ {N} {name}'})
  textures[name]=tex
 new_mats={}
 for group in ['torso','shoulder','leg']:
  old_id={'torso':15,'shoulder':16,'leg':17}[group]
  mat=json.loads(json.dumps(g['materials'][old_id]))
  mat['name']=f'R36KJ {N}px sprite ochre skin / {group}'
  pb=mat.setdefault('pbrMetallicRoughness',{})
  pb['baseColorTexture']={'index':textures['ALBEDO'],'texCoord':0}
  pb['metallicRoughnessTexture']={'index':textures['ORM'],'texCoord':0}
  pb['roughnessFactor']=1.0;pb['metallicFactor']=0.0
  mat['normalTexture']={'index':textures['NORMAL'],'texCoord':0,'scale':{'torso':.67,'shoulder':.53,'leg':.60}[group]}
  mat['occlusionTexture']={'index':textures['ORM'],'texCoord':0,'strength':.67}
  mat.setdefault('extras',{}).update({'revision':'R36KJ','lod':'quality' if N==1024 else 'compact',
   'authoritativeExternalHead':'R36HW','atlasCoverage':1.0,'noAddedTriangles':True})
  new_mats[group]=len(g['materials']);g['materials'].append(mat)
 for k in TILES:
  group='torso' if k==7 else ('shoulder' if k in [8,9] else 'leg')
  g['meshes'][0]['primitives'][k]['material']=new_mats[group]
  g['meshes'][0]['primitives'][k].setdefault('extras',{}).update({'revision':'R36KJ','sourcePrimitive':'R36KI','fullWidthSkinIsland':True})
 g['asset']['generator']='XPZ3D R36KJ full UV atlas / 3-channel skin PBR'
 g['meshes'][0]['name']=f'R36KJ F11 protected R36HW face / textured skin {N}px / 2100 triangles'
 g['extras']={**g.get('extras',{}),'revision':'R36KJ','skinAtlasResolution':[N,N],
  'fullIslandUsage':True,'sourceR36KIsha256':source_sha,'sourceR36HWsha256':sha(hw_raw),
  'originalProtectedPrimitiveIds':list(range(7)),'trianglesAdded':0,'rigBoneCount':63,
  'detailedR36JBanatomyEmbedded':False,
  'limits':['No detailed high-poly anatomical donor inside game GLB','Visual surface improvement only',
            'Shoulder and pelvis disconnected seams remain mechanically unresolved',
            'S2/S3 engine not yet integrated']}
 triangles=sum(g['accessors'][p['indices']]['count']//3 for p in g['meshes'][0]['primitives'])
 assert triangles==2100 and len(g['skins'][0]['joints'])==63
 assert json.dumps(g['skins'],sort_keys=True)==original_joint_def
 assert json.dumps(g['meshes'][0]['primitives'][:7],sort_keys=True)==prot_before
 assert all(np.array_equal(a_read(g,B,g['meshes'][0]['primitives'][k]['attributes']['POSITION']),originals[k]) for k in range(7))
 assert bytes(B[:len(original_binary)])==original_binary
 blob=pack(g,B)
 out=HERE/f'R36KJ_F11_TEXTURED_SKIN_{N}_2100TRI.glb';out.write_bytes(blob)
 res={'version':'R36KJ','sizePx':N,'glb':out.name,'sizeBytes':len(blob),'sha256':sha(blob),'sourceSHA256':source_sha,
  'authoritativeR36HWSHA256':sha(hw_raw),'triangles':triangles,'bones':63,
  'protectedR36HWfaceTriangles':644,'protectedR36HWhairTriangles':294,
  'geometryChanges':0,'UVspanPerIsland':src_uv,'materialIndices':new_mats,
  'atlas':stats,'maps':{k:{'file':v['filename'],'bytes':len(v['bytes']),'sha256':sha(v['bytes'])}for k,v in maps.items()},
  'sourceBufferPrefixPreserved':True,'detailedAnatomyDonorIncluded':False}
 (HERE/f'R36KJ_{N}_BUILD_REPORT.json').write_text(json.dumps(res,indent=2,ensure_ascii=False),encoding='utf-8')
 print(f'R36KJ {N}: {len(blob)} bytes, {triangles} triangles, {sha(blob)[:16]}')
 return res

def main():
 src,_,_=glb_open(SOURCE);hw,_,_=glb_open(HW)
 assert sha(src)=='c9d6650b4addf24412d512f1d00844cd861be74bcbe821c640f62be5ff8f3d0c','R36KI source SHA changed'
 assert sha(hw)=='a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732','R36HW authority mismatch'
 reports=[build(n,src,hw) for n in [1024,512]]
 (HERE/'R36KJ_SUMMARY.json').write_text(json.dumps(reports,indent=2,ensure_ascii=False),encoding='utf-8')
if __name__=='__main__':main()
