#!/usr/bin/env python3
"""R36KP: R36HW-authoritative non-clothing head/materials with a softer,
non-explicit central exterior and medial hip/thigh surface matching.

Operates on real R36KO GLBs (1024 + 512). Texture atlas changes apply ONLY
within replacement skin material islands; original R36HW material, UV, skin,
head and hair are immutable. The geometry budget is exactly 2,100 triangles.
"""
from pathlib import Path
import copy, json, io, hashlib
import numpy as np
import trimesh
from PIL import Image
from scipy.ndimage import gaussian_filter
from glb_io_r36kj import glb_open, a_read, a_append, image_append, pack, sha
from compact_gltf import compact
from build_r36kk import rasterize

BASE=Path(__file__).resolve().parent
SOURCE={n:BASE/f'R36KO_F11_HW_MATERIAL_LOCK_RECESSED_{n}_2100TRI.glb' for n in (1024,512)}
SOURCE_HASH={1024:'60258bcc845e4063710dd20872f8df12cbe97f493f235885d9ec11adf4ad2ba4',
             512:'dbc17138a9674fbbe03f95aa0d153e65fd7f30d464b6a00a77a74246771b21cf'}
R36HW='a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732'


def safe_norm(v):
 length=np.linalg.norm(v)
 return v/length if length>1e-9 else np.array([0.,-1.,0.])


def attributes(g,B,p):
 return {k:a_read(g,B,i).copy() for k,i in p['attributes'].items()}


def update_attributes(g,B,p,attrs,names):
 for k in names:
  ac=g['accessors'][p['attributes'][k]]
  new=a_append(g,B,attrs[k],ac['type'],ac['componentType'],34962)
  if ac.get('normalized'):g['accessors'][new]['normalized']=True
  p['attributes'][k]=new


def near_body(q,triangles,P,N,J,W):
 candidates=trimesh.triangles.closest_point(P[triangles],np.broadcast_to(q,(len(triangles),3)).copy())
 distance=np.linalg.norm(candidates-q,axis=1)
 chosen=int(np.argmin(distance));projected=candidates[chosen]
 bary=trimesh.triangles.points_to_barycentric(P[triangles[chosen:chosen+1]],projected.reshape(1,3))[0]
 bary=np.clip(bary,0,1);bary/=max(bary.sum(),1e-8)
 t=triangles[chosen]
 norm=safe_norm(np.sum(N[t]*bary[:,None],axis=0))
 influences={}
 for i,f in zip(t,bary):
  for k,v in zip(J[i],W[i]):
   if v>1e-8:influences[int(k)]=influences.get(int(k),0)+float(v*f)
 return projected,norm,influences,float(distance[chosen])


def adjust_geometry(g,B):
 prim=g['meshes'][0]['primitives']
 torso=prim[7];b=attributes(g,B,torso)
 bp=b['POSITION'].astype(np.float64);bn=b['NORMAL'].astype(np.float64)
 bj=b['JOINTS_0'].astype(int);bw=b['WEIGHTS_0'].astype(np.float64)
 faces=a_read(g,B,torso['indices']).astype(int).reshape(-1,3)
 candidate=faces[np.all((bp[faces][:,:,2]>.846)&(bp[faces][:,:,2]<1.06),axis=1)]
 candidate=candidate[np.any(np.abs(bp[candidate][:,:,0])>.07,axis=1)]
 if len(candidate)<30:raise RuntimeError('No 3D hip candidates')
 report={'thighs':{},'central':{}}
 for pi,side in ((10,-1),(11,1)):
  p=prim[pi];a=attributes(g,B,p)
  P=a['POSITION'].astype(np.float64);N=a['NORMAL'].astype(np.float64)
  J=a['JOINTS_0'].astype(int);W=a['WEIGHTS_0'].astype(np.float64)
  only=candidate[np.mean(bp[candidate][:,:,0],axis=1)*side>.055]
  changed=[];maxMove=0.;distance=[];dest=[]
  for i in list(range(30,50)):
   x,y,z=P[i];inside=np.clip((.122-abs(x))/.092,0,1)
   upper=np.clip((z-.891)/(.962-.891),0,1)
   upper=upper*upper*(3-2*upper)
   power=.86*inside*upper
   if power<.018:continue
   q,normal,inf,dist=near_body(P[i],only,bp,bn,bj,bw)
   if dist>.055:continue
   # Pull the top medial thigh shell underneath the shared hip shell.
   to=q-np.array([0.,0.,.0])
   v=(to-P[i])*power
   d=np.linalg.norm(v)
   if d>.028:v*=.028/d
   P[i]+=v
   n=safe_norm(.66*N[i]+.34*normal)
   if np.dot(n,N[i])>0:N[i]=n
   influence={}
   for k,w in zip(J[i],W[i]):influence[int(k)]=influence.get(int(k),0)+float(w)*(1-.65*power)
   for k,w in inf.items():influence[k]=influence.get(k,0)+float(w)*(.65*power)
   take=sorted(influence.items(),key=lambda v:-v[1])[:4]
   total=sum(v for k,v in take)
   J[i]=[take[k][0] if k<len(take) else 0 for k in range(4)]
   W[i]=[take[k][1]/total if k<len(take) else 0 for k in range(4)]
   changed.append(i);maxMove=max(maxMove,float(np.linalg.norm(v)));distance.append(dist)
   _,_,_,post=near_body(P[i],only,bp,bn,bj,bw);dest.append(post)
  # The original low-poly model duplicates ring endpoints only for UV wrapping.
  for i,j in ((20,92),(30,93),(40,94)):
   P[j]=P[i];N[j]=N[i];J[j]=J[i];W[j]=W[i]
  a.update(POSITION=P.astype('float32'),NORMAL=N.astype('float32'),JOINTS_0=J.astype('uint16'),WEIGHTS_0=W.astype('float32'))
  update_attributes(g,B,p,a,['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'])
  report['thighs'][str(pi)]={'innerUpperVerticesChanged':len(changed),'indices':changed,
    'maxMove':maxMove,'meanGapBefore':float(np.mean(distance)) if distance else None,
    'meanGapAfter':float(np.mean(dest)) if dest else None,'welded':False}
 # Keep exactly the previous 40△ central exterior; improve posterior curvature
 # and vertex-normal continuity across the 4 rows. Anchors [2,3] fixed.
 P=bp.copy();N=bn.copy();original=P.copy()
 field=np.zeros_like(P)
 for face in faces[-40:]:
  va,vb,vc=P[face];cross=np.cross(vb-va,vc-va)
  for i in face:field[i]+=cross
 for i in range(164,189):
  if i==188: continue
  x,y,z=P[i]
  # Laterally and vertically localized recess; no outward-moving bulges.
  recess=.0055*np.exp(-((z-.807)/.046)**2)*np.exp(-(x/.046)**4)
  P[i,1]+=recess
  P[i,2]+=.002*np.exp(-((z-.781)/.047)**2)
 for face in faces[-40:]:
  va,vb,vc=P[face];cross=np.cross(vb-va,vc-va)
  for i in face:field[i]+=cross
 for i in range(164,189):
  target=safe_norm(field[i])
  if np.dot(target,N[i])<0:target=-target
  N[i]=safe_norm(.5*N[i]+.5*target)
 b['POSITION']=P.astype(np.float32);b['NORMAL']=N.astype(np.float32)
 update_attributes(g,B,torso,b,['POSITION','NORMAL'])
 report['central']={'patchVerticesAdjusted':24,'triangles':40,
   'maxAdditionalPosterior':float(np.max(P[164:188,1]-original[164:188,1])),
   'maxAdditionalSuperior':float(np.max(P[164:188,2]-original[164:188,2])),
   'anchor2and3Unchanged':bool(np.array_equal(P[[2,3]],original[[2,3]]))}
 return report


def original_image(g,B,texid):
 tex=g['textures'][texid];img=g['images'][tex['source']]
 v=g['bufferViews'][img['bufferView']];start=v.get('byteOffset',0)
 return bytes(B[start:start+v['byteLength']])


def bake_skin(g,B,size):
 xyz,normals,cov,parts,stats=rasterize(g,B,size)
 skinmat=g['materials'][g['meshes'][0]['primitives'][7]['material']]
 texrefs={'ALBEDO':skinmat['pbrMetallicRoughness']['baseColorTexture']['index'],
          'NORMAL':skinmat['normalTexture']['index'],'ORM':skinmat['occlusionTexture']['index']}
 atlas={k:np.array(Image.open(io.BytesIO(original_image(g,B,t))).convert('RGB')).copy() for k,t in texrefs.items()}
 x=xyz[...,0];z=xyz[...,2]
 valid=(cov>0)&(parts>=7)&(parts<=11)
 # Soft continuous material transition across the independent torso and leg UV islands.
 hip=np.exp(-((np.abs(x)-.091)/.067)**2-((z-.949)/.060)**2)*valid
 inset=np.exp(-((x/.054)**4))-0.0
 inset*=np.exp(-((z-.802)/.063)**4)*valid*(parts==7)
 field=gaussian_filter((hip*.58+inset*.42).astype(np.float32),sigma=1.3)
 col=atlas['ALBEDO'].astype(np.float32)
 # Restore a little local brightness in overly dark hip/crotch seams.
 col+=(255-col)*field[...,None]*.042
 atlas['ALBEDO']=np.clip(np.rint(col),0,255).astype(np.uint8)
 n=atlas['NORMAL'].astype(np.float32)/255*2-1
 dy,dx=np.gradient(field)
 n[...,0]-=.34*dx;n[...,1]-=.34*dy
 n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-6)
 atlas['NORMAL']=np.clip(np.rint((n*.5+.5)*255),0,255).astype(np.uint8)
 orm=atlas['ORM'].astype(np.float32)
 orm[...,0]=np.minimum(255,orm[...,0]+11*field)
 orm[...,1]=np.minimum(255,orm[...,1]+2*field)
 atlas['ORM']=np.clip(np.rint(orm),0,255).astype(np.uint8)
 sampler=len(g['samplers']);g['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071,'name':f'R36KP skin seam {size}'})
 newtex={}
 for k,data in atlas.items():
  file=BASE/f'R36KP_{size}_SKIN_{k}.png';Image.fromarray(data,'RGB').save(file,optimize=True)
  image=image_append(g,B,file.read_bytes(),f'R36KP_{size}_{k}')
  index=len(g['textures']);g['textures'].append({'source':image,'sampler':sampler,'name':f'R36KP_{size}_{k}'})
  newtex[k]=index
 for i in range(7,12):
  mat=g['materials'][g['meshes'][0]['primitives'][i]['material']]
  mat['pbrMetallicRoughness']['baseColorTexture']={'index':newtex['ALBEDO'],'texCoord':0}
  mat['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':newtex['ORM'],'texCoord':0}
  mat['normalTexture']={'index':newtex['NORMAL'],'texCoord':0,'scale':.4 if i==7 else .33}
  mat['occlusionTexture']={'index':newtex['ORM'],'texCoord':0,'strength':.5}
  mat.setdefault('extras',{})['revision']='R36KP_medial_joint_surface'
 return {'modifiedSkinTexels':int((field>.005).sum()),'texelFieldPeak':float(field.max()),'raster':stats,
   'maps':{k:{'file':f'R36KP_{size}_SKIN_{k}.png','sha256':sha((BASE/f'R36KP_{size}_SKIN_{k}.png').read_bytes())} for k in atlas}}


def build(size):
 source=SOURCE[size];raw,g,B=glb_open(source)
 if sha(raw)!=SOURCE_HASH[size]:raise RuntimeError('Source sha mismatch '+sha(raw))
 if sha((BASE/'SOURCE_R36HW_F11_CLOTHED.glb').read_bytes())!=R36HW:raise RuntimeError('R36HW source differs')
 pristine=[(a_read(g,B,p['indices']),{k:a_read(g,B,v) for k,v in p['attributes'].items()},copy.deepcopy(g['materials'][p['material']])) for p in g['meshes'][0]['primitives'][:7]]
 rig=copy.deepcopy(g['skins']);nodes=copy.deepcopy(g['nodes']);bind=a_read(g,B,g['skins'][0]['inverseBindMatrices']).copy()
 geometry=adjust_geometry(g,B);tex=bake_skin(g,B,size)
 g['asset']['generator']='XPZ3D R36KP source-locked 2,100tri medial hip and recessed skin'
 g['meshes'][0]['name']='R36KP F11 / R36HW immutable original nonclothing / 2100tris'
 g['extras']={**g.get('extras',{}),'revision':'R36KP','sourceR36KOsha256':SOURCE_HASH[size],
 'authoritativeR36HWsha256':R36HW,'skinContinuity':'top medial thigh reposition + rig blend',
 'highDensityR36JBEmbedded':False,'triangles':2100,'bones':63,
 'limitations':['thigh/torso UV primitive border not welded',
 'central anatomy is a non-explicit 40 triangle exterior surface, not 6044 triangle high density donor',
 'game runtime S2/S3 integration not completed']}
 compacted,bin,comp=compact(g,B)
 assert compacted['nodes']==nodes
 assert len(compacted['skins'])==len(rig)==1
 assert np.array_equal(a_read(compacted,bin,compacted['skins'][0]['inverseBindMatrices']),bind)
 count=sum(compacted['accessors'][p['indices']]['count']//3 for p in compacted['meshes'][0]['primitives'])
 if count!=2100:raise RuntimeError('Wrong triangle count '+str(count))
 for idx,(inds,attrs,mat) in enumerate(pristine):
  p=compacted['meshes'][0]['primitives'][idx]
  if not np.array_equal(a_read(compacted,bin,p['indices']),inds):raise RuntimeError('Protected index mismatch '+str(idx))
  for name,arr in attrs.items():
   if not np.array_equal(a_read(compacted,bin,p['attributes'][name]),arr):raise RuntimeError('Protected data mismatch '+str(idx)+name)
  if compacted['materials'][p['material']]!=mat:raise RuntimeError('Protected material mismatch '+str(idx))
 for i in range(7,12):
  p=compacted['meshes'][0]['primitives'][i];w=a_read(compacted,bin,p['attributes']['WEIGHTS_0'])
  if np.abs(w.sum(axis=1)-1).max()>1e-5:raise RuntimeError('Invalid weights')
 outfile=BASE/f'R36KP_F11_MEDIAL_HIP_BLEND_{size}_2100TRI.glb'
 outfile.write_bytes(pack(compacted,bin))
 result={'version':'R36KP','file':outfile.name,'size':size,'bytes':outfile.stat().st_size,
   'sha256':sha(outfile.read_bytes()),'source':source.name,'sourceSha256':SOURCE_HASH[size],
   'R36HWsha256':R36HW,'triangles':count,'bones':63,'protectedOriginalNonclothingPrimitives':[0,1,2,3,4,5,6],
   'geometry':geometry,'textures':tex,'compaction':comp,'gameEngineApplied':False,'highPolyDonorMerged':False}
 (BASE/f'R36KP_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
 print(json.dumps({'file':outfile.name,'bytes':outfile.stat().st_size,'sha256':result['sha256'],
  'geometry':geometry},ensure_ascii=False,indent=2))
 return result

if __name__=='__main__':
 results=[build(size) for size in (1024,512)]
 (BASE/'R36KP_SUMMARY.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
