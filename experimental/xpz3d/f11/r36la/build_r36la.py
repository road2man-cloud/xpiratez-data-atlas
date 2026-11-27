#!/usr/bin/env python3
"""Produce R36LA in-place motion clips for the existing F11 rig.
Original rig and mesh are untouched. Synthetic motion, not an engine port.
"""
import json,math,copy
from pathlib import Path
import numpy as np
from glb_tools import load,arr,accessor,pack,sha,image_bytes,primitive
from prepare_r36la import ROOT,prepare
FPS=30
CHANNELS=['Spine','Chest','Neck','Head','L_UArm','R_UArm','L_LArm','R_LArm','L_Thigh','R_Thigh','L_Leg','R_Leg','L_Foot','R_Foot','L_Toe','R_Toe']
CLIPS=[('F11_Idle_Loop',3.0),('F11_Walk_InPlace_Loop',1.2),('F11_LookAround_Loop',4.0),('F11_Ready_Reset',1.5)]
def qmul(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return np.array([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z])
def quat(axis,angle):
 q=np.zeros(4);a=math.radians(angle)/2;q[axis]=math.sin(a);q[3]=math.cos(a);return q
def euler(x=0,y=0,z=0):
 return qmul(quat(0,x),qmul(quat(1,y),quat(2,z)))
def pose(name,u):
 w=2*math.pi*u;s=math.sin(w);c=math.cos(w)
 # Local skeleton is Z-up, with forward -Y and left +X.
 # Same neutral stance at start/end for idle/look/ready. Walk is cyclic.
 a={k:(0.,0.,0.) for k in CHANNELS}
 a['L_UArm']=(0,68,0);a['R_UArm']=(0,-68,0)
 a['L_LArm']=(0,0,-14);a['R_LArm']=(0,0,14)
 bob=0.
 if name=='F11_Idle_Loop':
  a['Chest']=(1.2*s,0,0);a['Spine']=(.6*s,0,0);a['Head']=(-.8*s,0,.5*math.sin(2*w));bob=.003*(1-c)
  a['L_UArm']=(1.5*s,68+1.1*s,0);a['R_UArm']=(-1.5*s,-68-1.1*s,0)
 elif name=='F11_Walk_InPlace_Loop':
  a['Spine']=(1.5,1.5*s,-3*s);a['Chest']=(0,0,5*s);a['Head']=(-1.5,-s,-2*s)
  bob=.013*(1-math.cos(2*w))
  for side,sign in [('L',1),('R',-1)]:
   t=sign*s;phase=sign*c
   thigh=-22*t;knee=8+30*max(0,-phase);foot=-(thigh+knee)*.60
   a[side+'_Thigh']=(thigh,0,0);a[side+'_Leg']=(knee,0,0)
   a[side+'_Foot']=(foot,0,0);a[side+'_Toe']=(-5*max(0,phase),0,0)
   a[side+'_UArm']=(15*t,sign*68,0);a[side+'_LArm']=(0,0,-sign*(18+4*t))
 elif name=='F11_LookAround_Loop':
  a['Head']=(-3*(1-c)/2,0,28*s);a['Neck']=(0,0,5*s);a['Chest']=(0,0,3*s)
 elif name=='F11_Ready_Reset':
  # Neutral standing to alert stance and back. No root displacement.
  f=(1-c)/2;bob=-.018*f
  a['Chest']=(5*f,0,0);a['Head']=(-3*f,0,0)
  a['L_UArm']=(-9*f,68-8*f,0);a['R_UArm']=(-9*f,-68+8*f,0)
  a['L_LArm']=(0,0,-14-30*f);a['R_LArm']=(0,0,14+30*f)
  a['L_Thigh']=(-6*f,0,0);a['R_Thigh']=(-6*f,0,0)
  a['L_Leg']=(10*f,0,0);a['R_Leg']=(10*f,0,0)
  a['L_Foot']=(-4*f,0,0);a['R_Foot']=(-4*f,0,0)
 return a,bob
def build(size):
 src=prepare(size);g,b=load(src);original,ob=load(src)
 assert not g.get('animations')
 joints=g['skins'][0]['joints'];names={g['nodes'][i]['name']:i for i in joints}
 assert len(names)==63 and len(joints)==63
 for k in CHANNELS+['Hip']:assert k in names and 'matrix' not in g['nodes'][names[k]]
 # Bind rotations are not overwritten; multiply normalized rest orientation by local delta.
 rest={k:np.array(g['nodes'][names[k]].get('rotation',[0,0,0,1]),float) for k in CHANNELS}
 rest={k:v/np.linalg.norm(v) for k,v in rest.items()}
 hip=np.array(g['nodes'][names['Hip']]['translation'],float)
 out=ROOT/'output';out.mkdir(exist_ok=True)
 g['animations']=[]
 reports=[]
 for name,duration in CLIPS:
  times=np.linspace(0,duration,int(round(duration*FPS))+1,dtype='<f4');tidx=accessor(g,b,times.reshape(-1,1),typ='SCALAR',target=None)
  # Animation input accessors require min/max (glTF 2.0).
  g['accessors'][tidx]['min']=[float(times[0])];g['accessors'][tidx]['max']=[float(times[-1])]
  clip={'name':name,'samplers':[],'channels':[]}
  poses=[pose(name,float(t)/duration) for t in times]
  # Set exact endpoints for seamless loops, independent of floating rounding.
  poses[-1]=poses[0]
  def channel(k,path,data,typ):
   idx=accessor(g,b,np.array(data,dtype='<f4'),typ=typ,target=None)
   si=len(clip['samplers']);clip['samplers'].append({'input':tidx,'output':idx,'interpolation':'LINEAR'})
   clip['channels'].append({'sampler':si,'target':{'node':names[k],'path':path}})
  for k in CHANNELS:
   qs=np.array([qmul(rest[k],euler(*p[0][k])) for p in poses])
   qs/=np.linalg.norm(qs,axis=1,keepdims=True)
   for i in range(1,len(qs)):
    if np.dot(qs[i-1],qs[i])<0:qs[i]*=-1
   channel(k,'rotation',qs,'VEC4')
  channel('Hip','translation',[hip+[0,0,p[1]] for p in poses],'VEC3')
  g['animations'].append(clip)
  reports.append({'clip':name,'durationSeconds':duration,'frames':len(times),'channels':len(clip['channels']),'loopEndpointEqual':True})
 g['asset']['generator']='XPZ3D R36LA synthetic in-place motion clips'
 g['extras']={**g.get('extras',{}),'revision':'R36LA','sourceSha256':sha(src.read_bytes()),'motionOrigin':'new procedural clips; not actual game animations','engineApplied':False}
 dst=out/f'R36LA_F11_MOTION_POT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b))
 final,fb=load(dst)
 for key in ('nodes','scenes','scene','materials','textures','samplers'):
  assert original.get(key)==final.get(key),key
 for a,c in zip(original['skins'],final['skins']):
  assert {k:v for k,v in a.items() if k!='inverseBindMatrices'}=={k:v for k,v in c.items() if k!='inverseBindMatrices'}
  assert np.array_equal(arr(original,ob,a['inverseBindMatrices']),arr(final,fb,c['inverseBindMatrices']))
 tris=verts=0
 for pi in range(len(original['meshes'][0]['primitives'])):
  a,f=primitive(original,ob,pi);c,h=primitive(final,fb,pi)
  assert np.array_equal(f,h) and set(a)==set(c)
  for k in a:assert np.array_equal(a[k],c[k]),(pi,k)
  tris+=len(h);verts+=len(c['POSITION'])
 for i in range(len(original['images'])):assert image_bytes(original,ob,i)==image_bytes(final,fb,i)
 assert tris==2100 and verts==2047
 for clip in final['animations']:
  for ch in clip['channels']:
   s=clip['samplers'][ch['sampler']];t=arr(final,fb,s['input']);v=arr(final,fb,s['output'])
   assert np.all(np.diff(t[:,0])>0) and len(t)==len(v) and np.isfinite(v).all()
   assert np.array_equal(v[0],v[-1])
   if ch['target']['path']=='rotation':
    assert np.max(np.abs(np.linalg.norm(v,axis=1)-1))<1e-6
   else:assert np.array_equal(v[:,:2],np.broadcast_to(v[0,:2],v[:,:2].shape))
 result={'version':'R36LA','source':src.name,'sourceSha256':sha(src.read_bytes()),'output':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size,'sourceBytes':src.stat().st_size,'triangles':tris,'vertices':verts,'bones':len(joints),'primitives':15,'imagesByteIdentical':len(original['images']),'geometryRigAndMaterialsIdentical':True,'clips':reports,'engineApplied':False,'limitations':['Synthetic local-space motion; no original game animation source.','No ground-contact IK or measured foot sliding correction.','No game-engine import or animation playback verified.']}
 (out/f'R36LA_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 # Machine-readable rig link map, stable node names and hierarchy.
 if size==512:
  parents={j:i for i,n in enumerate(final['nodes']) for j in n.get('children',[])}
  rig={'version':'R36LA','coordinateConvention':'local Z-up, root conversion retained; +X left, -Y forward','engineMappingVerified':False,'joints':[{'skinIndex':j,'nodeIndex':i,'name':final['nodes'][i]['name'],'parent':final['nodes'][parents[i]].get('name') if i in parents else None,'animated':final['nodes'][i]['name'] in CHANNELS+['Hip']} for j,i in enumerate(joints)],'clipNames':[x['clip'] for x in reports]}
  (out/'R36LA_RIG_MAP.json').write_text(json.dumps(rig,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':
 for size in (512,1024):build(size)
