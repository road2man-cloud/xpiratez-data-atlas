#!/usr/bin/env python3
"""R36LB: add two contact-constrained walking clips; preserve all original assets.

Solves the real two-link leg geometry in the local Z-up sagittal plane.
Ankle targets are stationary during stance in a translating reference frame.
Baked 60 Hz rotations, not an engine IK controller or full sole collision solve.
"""
import math,json
import numpy as np
from glb_tools import load,arr,accessor,primitive,image_bytes,pack,sha
from prepare_r36lb import ROOT,COMMIT,LOCK,prepare
DURATION=1.2
STEPS=72
DUTY=42/72
STRIDE=.60
LIFT=.095
DROP=.065
def rx(a):
 return np.array([math.sin(a/2),0,0,math.cos(a/2)],dtype=float)
def rot(a,v):
 x,y,z=v;c=math.cos(a);s=math.sin(a);return np.array([x,c*y-s*z,s*y+c*z])
def qrotate(q,v):
 xyz=q[:3];return v+2*np.cross(xyz,np.cross(xyz,v)+q[3]*v)
def direction(v):return math.atan2(v[1],-v[2])
def track(g,b,clip,node,path):
 ch=next(c for c in clip['channels'] if c['target']=={'node':node,'path':path})
 s=clip['samplers'][ch['sampler']]
 return arr(g,b,s['input'])[:,0],arr(g,b,s['output'])
def sample(g,b,clip,node,path,t):
 times,v=track(g,b,clip,node,path)
 t=float(np.clip(t,times[0],times[-1]));j=min(len(times)-2,max(0,int(np.searchsorted(times,t,side='right')-1)))
 f=(t-times[j])/(times[j+1]-times[j]);a=v[j].astype(float);c=v[j+1].astype(float)
 if path=='rotation':
  if np.dot(a,c)<0:c=-c
  q=a*(1-f)+c*f;return q/np.linalg.norm(q)
 return a*(1-f)+c*f
def trajectory(u):
 # Local ankle Y travels backward in stance, exactly cancelling root travel.
 # Cubic Hermite swing keeps first derivative continuous at both boundaries.
 p=u%1.;half=STRIDE*DUTY/2
 if p<=DUTY+1e-9:return -half+STRIDE*p,0.,True
 t=(p-DUTY)/(1-DUTY);d=STRIDE*(1-DUTY)
 y=(2*t**3-3*t**2+1)*half+(t**3-2*t**2+t)*d+(-2*t**3+3*t**2)*(-half)+(t**3-t**2)*d
 return y,LIFT*math.sin(math.pi*t)**2,False
def solve(v1,v2,target):
 assert abs(v1[0])+abs(v2[0])+abs(target[0])<1e-6
 l1=np.linalg.norm(v1);l2=np.linalg.norm(v2);d=np.linalg.norm(target)
 if not abs(l1-l2)+1e-7<d<l1+l2-1e-7:raise ValueError('Unreachable ankle target '+str(d))
 # The forward knee is the negative-Y solution.
 alpha=direction(target)-math.acos(np.clip((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1))
 a=alpha-direction(v1);k=rot(a,v1);beta=direction(target-k)
 b=beta-direction(v2)-a;c=-a-b
 return a,b,c
def leg_setup(g,names,side):
 t,l,f=(names[side+'_'+x] for x in ('Thigh','Leg','Foot'))
 tr=lambda i:np.array(g['nodes'][i]['translation'],float)
 r=lambda i:np.array(g['nodes'][i].get('rotation',[0,0,0,1]),float)
 assert all(abs(r(i)[1])+abs(r(i)[2])<1e-7 for i in (t,l,f))
 v1=tr(l);v2=tr(f);ank=tr(t)+qrotate(r(t),v1)+qrotate(r(t),qrotate(r(l),v2))
 return t,l,f,tr(t),v1,v2,ank
def add(g,b,og,ob,names,old,root_motion):
 hip=names['Hip'];resthip=np.array(g['nodes'][hip]['translation'],float)
 legs={side:leg_setup(g,names,side) for side in ('L','R')}
 times=np.linspace(0,DURATION,STEPS+1,dtype='<f4')
 ti=accessor(g,b,times.reshape(-1,1),typ='SCALAR',target=None)
 g['accessors'][ti]['min']=[0.];g['accessors'][ti]['max']=[float(times[-1])]
 name='F11_Walk_Contact_RootMotion' if root_motion else 'F11_Walk_Contact_InPlace'
 clip={'name':name,'channels':[],'samplers':[]}
 values={};frames=[];target_error=0.;old_stance={s:[] for s in legs};new_stance={s:[] for s in legs}
 for i in range(STEPS+1):
  u=i/STEPS;t=u*DURATION
  bob=.006*(1-math.cos(4*math.pi*u));z=resthip[2]-DROP+bob
  h=np.array([resthip[0],resthip[1]-(STRIDE*u if root_motion else 0),z])
  refh=h.copy();refh[1]=resthip[1]-STRIDE*u
  values.setdefault((hip,'translation'),[]).append(h)
  for ch in old['channels']:
   n=ch['target']['node'];path=ch['target']['path'];label=og['nodes'][n]['name']
   if n==hip or any(label==side+'_'+part for side in legs for part in ('Thigh','Leg','Foot','Toe')):continue
   # Copy original upper-body walk at new sample times.
   values.setdefault((n,path),[]).append(sample(og,ob,old,n,path,t))
  row={'time':t,'referenceRootY':float(refh[1]),'feet':{}}
  for side,(th,le,fo,offset,v1,v2,ank) in legs.items():
   p=(u+(0.5 if side=='R' else 0))%1
   y,lift,stance=trajectory(p)
   desired=np.array([ank[0],ank[1]+y,resthip[2]+ank[2]+lift-z])-offset
   a,beta,c=solve(v1,v2,desired)
   for n,q in ((th,rx(a)),(le,rx(beta)),(fo,rx(c)),(names[side+'_Toe'],np.array([0,0,0,1],float))):
    values.setdefault((n,'rotation'),[]).append(q)
   # Evaluate baked float32 keys (not only analytic solver).
   q1,q2,q3=[rx(v).astype('<f4').astype(float) for v in (a,beta,c)]
   q1/=np.linalg.norm(q1);q2/=np.linalg.norm(q2);q3/=np.linalg.norm(q3)
   # Use stored hip precision; root displacement for in-place is supplied externally.
   hh=h.astype('<f4').astype(float)
   if not root_motion:hh[1]-=STRIDE*u
   world=hh+offset+qrotate(q1,v1+qrotate(q2,v2))
   target=refh+offset+desired
   err=float(np.linalg.norm(world-target));target_error=max(target_error,err)
   # Baseline comparison under exactly the same virtual root speed and stance mask.
   oldh=sample(og,ob,old,hip,'translation',t);oldh[1]-=STRIDE*u
   oq1=sample(og,ob,old,th,'rotation',t);oq2=sample(og,ob,old,le,'rotation',t)
   baseline=oldh+offset+qrotate(oq1,v1+qrotate(oq2,v2))
   new_stance[side].append((stance,world));old_stance[side].append((stance,baseline))
   row['feet'][side]={'stance':bool(stance),'ankle':world.tolist(),'target':target.tolist(),'oldAnkleSameVirtualRoot':baseline.tolist(),'targetError':err}
  frames.append(row)
 for (n,path),v in sorted(values.items()):
  data=np.asarray(v,dtype='<f4')
  if path=='rotation':
   data/=np.linalg.norm(data,axis=1,keepdims=True)
   for j in range(1,len(data)):
    if np.dot(data[j-1],data[j])<0:data[j]*=-1
   data[-1]=data[0]
  elif not root_motion:data[-1]=data[0]
  else:data[-1,0]=data[0,0];data[-1,2]=data[0,2]
  ai=accessor(g,b,data,typ='VEC4' if path=='rotation' else 'VEC3',target=None)
  si=len(clip['samplers']);clip['samplers'].append({'input':ti,'output':ai,'interpolation':'LINEAR'})
  clip['channels'].append({'sampler':si,'target':{'node':n,'path':path}})
 def drift(seq):
  out=[];anchor=None
  for stance,point in seq:
   if not stance:anchor=None;continue
   if anchor is None:anchor=point
   out.append(float(np.linalg.norm(point-anchor)))
  return max(out)
 metrics={s:{'oldMaxAnkleDriftSameReference':drift(old_stance[s]),'newMaxAnkleDrift':drift(new_stance[s])} for s in legs}
 assert target_error<1e-5
 assert all(m['newMaxAnkleDrift']<1e-5 for m in metrics.values())
 g['animations'].append(clip)
 return {'name':name,'duration':DURATION,'samples':len(times),'channels':len(values),'rootMotion':root_motion,'strideLocalUnits':STRIDE,'referenceSpeedLocalUnitsPerSecond':STRIDE/DURATION,'stanceFraction':DUTY,'maxAnkleTargetError':target_error,'stanceDrift':metrics,'frames':frames}
def build(size):
 src=prepare(size);g,b=load(src);og,ob=load(src)
 assert len(g['animations'])==4
 names={g['nodes'][i]['name']:i for i in g['skins'][0]['joints']}
 old=next(a for a in og['animations'] if a['name']=='F11_Walk_InPlace_Loop')
 records=[add(g,b,og,ob,names,old,r) for r in (False,True)]
 g['asset']['generator']='XPZ3D R36LB contact-constrained walking'
 g['extras']={**g.get('extras',{}),'revision':'R36LB','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'engineApplied':False,'motionOrigin':'procedural sagittal-plane ankle IK; no original game clip recovery'}
 out=ROOT/'output';out.mkdir(exist_ok=True)
 dst=out/f'R36LB_F11_CONTACT_MOTION_POT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b));ng,nb=load(dst)
 for k in ('nodes','scenes','scene','materials','textures','samplers'):assert og.get(k)==ng.get(k)
 for a,c in zip(og['skins'],ng['skins']):
  assert {k:v for k,v in a.items() if k!='inverseBindMatrices'}=={k:v for k,v in c.items() if k!='inverseBindMatrices'}
  assert np.array_equal(arr(og,ob,a['inverseBindMatrices']),arr(ng,nb,c['inverseBindMatrices']))
 for pi in range(15):
  a,f=primitive(og,ob,pi);c,h=primitive(ng,nb,pi);assert np.array_equal(f,h)
  for k in a:assert np.array_equal(a[k],c[k])
 for i in range(11):assert image_bytes(og,ob,i)==image_bytes(ng,nb,i)
 for a,c in zip(og['animations'],ng['animations'][:4]):
  assert a['name']==c['name'] and a['channels']==c['channels']
  for s,t in zip(a['samplers'],c['samplers']):
   for k in ('input','output'):assert np.array_equal(arr(og,ob,s[k]),arr(ng,nb,t[k]))
 for clip in ng['animations'][4:]:
  for ch in clip['channels']:
   s=clip['samplers'][ch['sampler']];v=arr(ng,nb,s['output']);t=arr(ng,nb,s['input'])
   assert len(v)==STEPS+1 and np.isfinite(v).all() and np.all(np.diff(t[:,0])>0)
   if ch['target']['path']=='rotation':assert np.array_equal(v[0],v[-1]) and np.max(np.abs(np.linalg.norm(v,axis=1)-1))<1e-6
   elif clip['name'].endswith('InPlace'):assert np.array_equal(v[0],v[-1])
   else:assert abs(float(v[-1,1]-v[0,1])+STRIDE)<1e-6
 result={'version':'R36LB','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'output':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size,'sourceBytes':src.stat().st_size,'triangles':2100,'vertices':2047,'bones':63,'originalClipsPreserved':4,'clipsTotal':6,'originalMeshRigAnd11ImagesPreserved':True,'newClips':[{k:v for k,v in r.items() if k!='frames'} for r in records],'engineApplied':False,'limitations':['Ankle anchors in local model units, not skinned sole collision.','Drift measured only on baked samples and reference translation; in-place requires matching external root speed.','Root-motion clip advances 0.60 local units and must accumulate translation across repeats.','No terrain IK, rendered visual review, engine playback, or actual game install.']}
 (out/f'R36LB_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 if size==512:(out/'R36LB_CONTACT_TRACKS.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':
 for s in (512,1024):build(s)
