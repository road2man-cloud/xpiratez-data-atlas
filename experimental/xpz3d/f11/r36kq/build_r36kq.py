#!/usr/bin/env python3
"""R36KQ: reversible, constrained R36KP upper-thigh transition refinement.

Works directly from authenticated R36KP 1024/512 GLBs. It only changes
POSITION and NORMAL in leg primitives 10 and 11, preserving the protected
head/hair/hands, torso/center surface, skin weights, UV, PBR images, colors,
indices, rig, and all existing materials. Polygon count remains 2,100.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
import trimesh
from glb_io_r36kj import glb_open, a_read, a_append, pack

ROOT=Path(__file__).resolve().parent
SOURCE_HASH={1024:'285d9c17848992231da5ffc10ebc6d807b52da1e577c64147bb5408a53584829',
             512:'1a89353c3a2b15cf1e0073be2c72c2b962bd263622b3288e1f678c39e6112c04'}

def sha(data): return hashlib.sha256(data).hexdigest()

def unit(a):
 n=np.linalg.norm(a,axis=-1,keepdims=True)
 return a/np.maximum(n,1e-10)

def nearest_skin(q,triangles,positions):
 tri=positions[triangles]
 projected=trimesh.triangles.closest_point(tri,np.broadcast_to(q,(len(tri),3)).copy())
 d=np.linalg.norm(projected-q,axis=1)
 i=int(np.argmin(d))
 return projected[i],float(d[i])

def seam_edges(faces):
 edges={}
 for a,b,c in faces:
  for i,j in ((a,b),(b,c),(c,a)):
   edge=tuple(sorted((int(i),int(j))))
   edges[edge]=edges.get(edge,0)+1
 return {v for edge,count in edges.items() if count==1 for v in edge}

def build(size):
 source=ROOT/f'R36KP_F11_MEDIAL_HIP_BLEND_{size}_2100TRI.glb'
 original,g,B=glb_open(source)
 if sha(original)!=SOURCE_HASH[size]:raise ValueError('Unexpected R36KP source SHA256')
 prim=g['meshes'][0]['primitives']
 torso=a_read(g,B,prim[7]['attributes']['POSITION']).astype('float64')
 all_faces=a_read(g,B,prim[7]['indices']).reshape(-1,3)
 # Exclude center patch and far-field torso triangles from the seam guidance.
 candidate=all_faces[np.all((torso[all_faces][:,:,2]>.83)&(torso[all_faces][:,:,2]<1.06),axis=1)]
 candidate=candidate[np.max(np.abs(torso[candidate][:,:,0]),axis=1)>.08]
 changes=[]
 for pi in [10,11]:
  p=prim[pi];P=a_read(g,B,p['attributes']['POSITION']).astype('float64')
  N=a_read(g,B,p['attributes']['NORMAL']).astype('float64')
  I=a_read(g,B,p['indices']).reshape(-1,3)
  boundaries=seam_edges(I)
  # Only the externally adjacent upper-thigh ring is allowed to move.
  # The x cap eliminates the central open gap; winding/mirrored coordinates
  # are handled identically for both legs.
  sid=-1 if pi==10 else 1
  triangles=candidate[np.mean(torso[candidate][:,:,0],axis=1)*sid>.055]
  new=P.copy();seed=[]
  for idx in sorted(boundaries):
   x,y,z=P[idx]
   if not (.955<=z<=.975 and .072<=abs(x)<=.181): continue
   target,dist=nearest_skin(P[idx],triangles,torso)
   if not (.0035<dist<.031): continue
   # Move only towards the skin surface with maximum .0028 model units.
   move=np.clip(.25*(dist-.0035),0,.0028)
   if move>1e-7:
    new[idx]=P[idx]+(target-P[idx])*(move/dist)
    seed.append({'idx':idx,'original':P[idx].tolist(),'move':(new[idx]-P[idx]).tolist(),'gapBefore':dist})
  # Blend a small fraction into the next ring to avoid a hard crease.
  for idx in range(len(P)):
   if idx in boundaries or not (.887<P[idx,2]<.949):continue
   candidates=[s for s in seed if np.linalg.norm(P[idx,:2]-np.array(s['original'])[:2])<.031]
   if not candidates:continue
   s=min(candidates,key=lambda ss:np.linalg.norm(P[idx,:2]-np.array(ss['original'])[:2]))
   factor=.19*np.exp(-((P[idx,2]-.918)/.027)**2)
   new[idx]+=factor*np.asarray(s['move'])
  # Split vertex at U-wrap must stay coincident with its counterpart.
  for a,b in ((20,92),(30,93),(40,94)):
   new[b]=new[a]
  revised_normals=N.copy()
  smooth=np.zeros_like(N)
  for a,b,c in I:
   cross=np.cross(new[b]-new[a],new[c]-new[a]);smooth[a]+=cross;smooth[b]+=cross;smooth[c]+=cross
  smooth=unit(smooth)
  moved=np.linalg.norm(new-P,axis=1)>1e-9
  for idx in np.where(moved)[0]:
   if np.dot(smooth[idx],N[idx])>.45:
    revised_normals[idx]=unit(.78*N[idx]+.22*smooth[idx])
  for a,b in ((20,92),(30,93),(40,94)):revised_normals[b]=revised_normals[a]
  # Only append attributes and rebind, preserving all other GLB data.
  p['attributes']['POSITION']=a_append(g,B,new.astype('<f4'),'VEC3',5126,34962)
  p['attributes']['NORMAL']=a_append(g,B,revised_normals.astype('<f4'),'VEC3',5126,34962)
  after=[]
  for s in seed:
   _,d=nearest_skin(new[s['idx']],triangles,torso);after.append(d)
  changes.append({'primitive':pi,'ringVerticesAdjusted':len(seed),'verticesMovedTotal':int(moved.sum()),
                  'meanRingGapBefore':float(np.mean([s['gapBefore'] for s in seed])) if seed else None,
                  'meanRingGapAfter':float(np.mean(after)) if seed else None,
                  'maxVertexDisplacement':float(np.max(np.linalg.norm(new-P,axis=1))),
                  'ringIndices':[s['idx'] for s in seed]})
 g['asset']['generator']='XPZ3D R36KQ conservative seam-v2 source locked to R36KP'
 g['extras']={**g.get('extras',{}),'revision':'R36KQ','R36KPsha256':SOURCE_HASH[size],
              'work':'leg position/normal refinement only; unchanged PBR/albedo + head/hair + rig'}
 output=ROOT/f'R36KQ_F11_HIP_TRANSITION_{size}_2100TRI.glb'
 data=pack(g,B);output.write_bytes(data)
 other,gg,bb=glb_open(output)
 assert len(gg['skins'][0]['joints'])==63
 assert sum(gg['accessors'][p['indices']]['count']//3 for p in gg['meshes'][0]['primitives'])==2100
 # Confirm protected meshes untouched, and skinning, UV, and original assets identical.
 _,sourceg,sourceb=glb_open(source)
 for pi in range(12):
  pp=sourceg['meshes'][0]['primitives'][pi];qq=gg['meshes'][0]['primitives'][pi]
  assert np.array_equal(a_read(sourceg,sourceb,pp['indices']),a_read(gg,bb,qq['indices']))
  for attr in pp['attributes']:
   if pi in (10,11) and attr in ('POSITION','NORMAL'):continue
   assert np.array_equal(a_read(sourceg,sourceb,pp['attributes'][attr]),a_read(gg,bb,qq['attributes'][attr])),(pi,attr)
 assert sourceg['materials']==gg['materials'] and sourceg['images']==gg['images'] and sourceg['textures']==gg['textures']
 report={'version':'R36KQ','source':source.name,'sourceSha256':SOURCE_HASH[size],
         'output':output.name,'sha256':sha(data),'bytes':len(data),'triangles':2100,'bones':63,
         'changes':changes,'protectedGeometry':True,'originalTexturesAndMaterials':True,
         'UVWeightsJointsIndicesUnchanged':True,'gameEngineApplied':False,
         'limitations':['Geometry not fully welded','Animation poses not yet tested','No new high density anatomy']}
 (ROOT/f'R36KQ_{size}_REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
 for s in (1024,512):build(s)
