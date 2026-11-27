#!/usr/bin/env python3
"""R36LC: baked two-link IK constrained by actual skinned foot geometry.
Flat ground, smooth heel-to-toe sole roll, no runtime terrain solver.
"""
import json,math
import numpy as np
from scipy.optimize import root
from glb_tools import load,arr,accessor,primitive,image_bytes,pack,sha
from prepare_r36lc import ROOT,COMMIT,LOCK,prepare
STRIDE=.60
DURATION=1.2
DUTY=42/72
def qmat(q):
 x,y,z,w=np.asarray(q,dtype=float)/np.linalg.norm(q)
 return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def rx(a):return np.array([math.sin(a/2),0,0,math.cos(a/2)])
def mat(t,q):
 m=np.eye(4);m[:3,:3]=qmat(q);m[:3,3]=t;return m
def rot(a,v):return qmat(rx(a))@v
def direction(v):return math.atan2(v[1],-v[2])
def solve(v1,v2,target):
 l1=np.linalg.norm(v1);l2=np.linalg.norm(v2);d=np.linalg.norm(target)
 if not abs(l1-l2)+1e-7<d<l1+l2-1e-7:raise ValueError('Unreachable ankle '+str(d))
 alpha=direction(target)-math.acos(np.clip((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1))
 a=alpha-direction(v1);beta=direction(target-rot(a,v1));b=beta-direction(v2)-a
 return a,b,-a-b
def tracks(g,b,clip):
 out={}
 for ch in clip['channels']:
  s=clip['samplers'][ch['sampler']]
  out[(ch['target']['node'],ch['target']['path'])]=(arr(g,b,s['input'])[:,0].astype(float),arr(g,b,s['output']).astype(float))
 return out
def interpolate(t,v,x,rotation=False):
 j=min(len(t)-2,max(0,np.searchsorted(t,x,side='right')-1));u=np.clip((x-t[j])/(t[j+1]-t[j]),0,1)
 a,b=v[j],v[j+1]
 if not rotation:return a*(1-u)+b*u
 d=np.dot(a,b)
 if d<0:b=-b;d=-d
 d=np.clip(d,-1,1)
 if d>.9995:q=a*(1-u)+b*u
 else:
  w=math.acos(d);q=(math.sin((1-u)*w)*a+math.sin(u*w)*b)/math.sin(w)
 return q/np.linalg.norm(q)
class Rig:
 def __init__(self,g,b):
  self.g=g;self.nodes=g['nodes'];self.ids=g['skins'][0]['joints'];self.names={self.nodes[i]['name']:i for i in self.ids}
  self.parents={j:i for i in self.ids for j in self.nodes[i].get('children',[]) if j in self.ids}
  self.T={i:np.asarray(self.nodes[i].get('translation',[0,0,0]),float) for i in self.ids}
  self.Q={i:np.asarray(self.nodes[i].get('rotation',[0,0,0,1]),float) for i in self.ids}
  assert self.ids==list(range(63)) and all('matrix' not in self.nodes[i] and 'scale' not in self.nodes[i] for i in self.ids)
  self.IB=arr(g,b,g['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
  self.rest=self.fk({})
  assert np.max(np.abs(self.rest@self.IB-np.eye(4)))<2e-5
  self.feet={};self.ground=None
  # Select anatomical foot region by local mesh coordinates; use actual skin
  # influences, not just bone position. Deduplicate UV-split vertex records.
  for side in ('L','R'):
   sign=1 if side=='L' else -1
   allrows=[]
   for pi in (10,11,13,14):
    a,_=primitive(g,b,pi);p=a['POSITION'];mask=(p[:,0]*sign>0)&(p[:,2]<.22)
    allrows.extend(np.concatenate((p[mask],a['JOINTS_0'][mask],a['WEIGHTS_0'][mask]),axis=1))
   rows=np.unique(np.asarray(allrows,dtype=float),axis=0)
   P=np.c_[rows[:,:3],np.ones(len(rows))];J=rows[:,3:7].astype(int);W=rows[:,7:11]
   assert len(P)>8 and np.max(np.abs(W.sum(axis=1)-1))<2e-5
   foot={'P':P,'J':J,'W':W}
   xyz=self.skin(self.rest,foot);assert np.max(np.abs(xyz-P[:,:3]))<2e-5
   floor=float(xyz[:,2].min());sole=xyz[:,2]<=floor+.008
   assert sole.sum()>=3
   ys=xyz[sole,1]
   foot.update(sole=sole,restFloor=floor,restSupportY=float(ys.mean()),restXYZ=xyz,
               heel=sole&(xyz[:,1]>=np.quantile(ys,.65)),toe=sole&(xyz[:,1]<=np.quantile(ys,.35)))
   self.feet[side]=foot
  self.ground=min(x['restFloor'] for x in self.feet.values())
  assert abs(self.feet['L']['restFloor']-self.feet['R']['restFloor'])<1e-5
 def fk(self,pose):
  out=np.empty((63,4,4));done=set()
  def get(i):
   if i not in done:
    m=mat(pose.get((i,'translation'),self.T[i]),pose.get((i,'rotation'),self.Q[i]))
    out[i]=get(self.parents[i])@m if i in self.parents else m;done.add(i)
   return out[i]
  for i in self.ids:get(i)
  return out
 def skin(self,fk,foot):
  M=(fk@self.IB)[foot['J']]
  v=np.einsum('vkij,vj->vki',M,foot['P'])
  return np.einsum('vk,vki->vi',foot['W'],v)[:,:3]
 def pivot_y(self,xyz,side,theta):
  foot=self.feet[side];base=xyz[foot['sole'],1].mean()
  # Negative pitch: heel down. Positive pitch: toe down (forward is -Y).
  group=foot['heel'] if theta<0 else foot['toe']
  mix=smooth(min(1.,abs(theta)/math.radians(8)))
  return float((1-mix)*base+mix*xyz[group,1].mean())
 def support(self,pose,side,theta=0.):
  foot=self.feet[side];p=self.skin(self.fk(pose),foot)
  return np.array([self.pivot_y(p,side,theta),p[:,2].min()])
 def correction(self,pose,side,target,theta):
  n=self.names;hip=n['Hip'];th,le,fo,to=[n[side+'_'+k] for k in ('Thigh','Leg','Foot','Toe')]
  h=pose[(hip,'translation')];v1=self.T[le];v2=self.T[fo];off=self.T[th]
  baseline=self.fk(pose)[fo,:3,3]
  def candidate(yz):
   a,b,c=solve(v1,v2,np.array([0.,yz[0]-h[1]-off[1],yz[1]-h[2]-off[2]]))
   return {(th,'rotation'):rx(a),(le,'rotation'):rx(b),(fo,'rotation'):rx(c+theta),(to,'rotation'):np.array([0.,0.,0.,1.])}
  def fun(yz):return self.support({**pose,**candidate(yz)},side,theta)-target
  guess=baseline[1:].copy()
  # Initial correction is small; solve for support centroid Y and lowest Z.
  guess+=target-self.support(pose,side,theta)
  sol=root(fun,guess,tol=1e-10)
  if np.linalg.norm(fun(sol.x))>2e-7:raise ValueError('Sole solve failed: '+str(sol.message))
  return candidate(sol.x)
def phase(u,side):return (u+(0.5 if side=='R' else 0))%1.
def stance(u,side):return phase(u,side)<=DUTY+1e-9
def smooth(x):return x*x*(3-2*x)
def pitch(u,side):
 p=phase(u,side)
 if p<.19*DUTY:return math.radians(-12*(1-smooth(p/(.19*DUTY))))
 if p<.72*DUTY:return 0.
 if p<=DUTY:return math.radians(18*smooth((p-.72*DUTY)/(.28*DUTY)))
 return math.radians(18-30*smooth((p-DUTY)/(1-DUTY)))
def evaluate(rig,tr,root_motion,dense=1,ref=None):
 count=72*dense;rows=[];ts=np.linspace(0,DURATION,count+1)
 for t in ts:
  u=t/DURATION;pose={k:interpolate(times,v,t,k[1]=='rotation') for k,(times,v) in tr.items()}
  if not root_motion:pose[(rig.names['Hip'],'translation')][1]-=STRIDE*u
  row={'time':float(t),'feet':{}}
  fk=rig.fk(pose)
  reference=rig.fk({k:interpolate(times,v,t,k[1]=='rotation') for k,(times,v) in ref.items()}) if ref is not None else None
  for side in rig.feet:
   fo=rig.names[side+'_Foot'];theta=pitch(u,side) if ref is not None else 0.
   p=rig.support(pose,side,theta)
   actual=math.atan2(fk[fo,2,1],fk[fo,1,1])
   targetY=float(reference[fo,1,3]+rig.pivot_y(rig.feet[side]['restXYZ'],side,theta)-rig.rest[fo,1,3]) if reference is not None else float(p[0])
   row['feet'][side]={'stance':bool(stance(u,side)),'supportY':float(p[0]),'lowestZ':float(p[1]),'heightAboveGround':float(p[1]-rig.ground),'pivotYError':float(p[0]-targetY),'footPitchDegrees':math.degrees(actual)}
  rows.append(row)
 result={}
 for side in rig.feet:
  supports=[];drifts=[];anchor=None;allz=[];pivots=[];angles=[]
  for row in rows:
   f=row['feet'][side];allz.append(f['heightAboveGround']);angles.append(f['footPitchDegrees'])
   if not f['stance']:anchor=None;continue
   if anchor is None:anchor=f['supportY']
   drifts.append(abs(f['supportY']-anchor));supports.append(f['heightAboveGround']);pivots.append(abs(f['pivotYError']))
  result[side]={'maxStanceSupportYDrift':max(drifts),'maxAbsStanceFloorError':max(map(abs,supports)),'maxPenetrationAllSamples':max(0,-min(allz)),'maxSwingOrStanceClearance':max(allz),'minFootPitchDegrees':min(angles),'maxFootPitchDegrees':max(angles)}
  if ref is not None:result[side]['maxStancePivotYError']=max(pivots)
 return result,rows
def add_clip(g,b,original,ob,rig,old):
 oldtr=tracks(original,ob,old);times=next(iter(oldtr.values()))[0]
 assert len(times)==73
 vals={k:[] for k in oldtr};hip=rig.names['Hip'];maxerr=0.
 for i,t in enumerate(times):
  u=i/72;pose={k:v[i].copy() for k,(_,v) in oldtr.items()}
  fk=rig.fk(pose)
  for side,foot in rig.feet.items():
   fo=rig.names[side+'_Foot'];ank=fk[fo,:3,3];restank=rig.rest[fo,:3,3]
   lift=0 if stance(u,side) else max(0.,float(ank[2]-restank[2]))
   theta=pitch(u,side)
   target=np.array([ank[1]+rig.pivot_y(foot['restXYZ'],side,theta)-restank[1],rig.ground+lift])
   pose.update(rig.correction(pose,side,target,theta))
   maxerr=max(maxerr,float(np.linalg.norm(rig.support(pose,side,theta)-target)))
  for k in vals:vals[k].append(pose[k])
 for k in vals:
  a=np.asarray(vals[k],dtype='<f4')
  if k[1]=='rotation':
   a/=np.linalg.norm(a,axis=1,keepdims=True)
   for i in range(1,len(a)):
    if np.dot(a[i-1],a[i])<0:a[i]*=-1
   a[-1]=a[0]
  vals[k]=a
 assert maxerr<2e-7
 for root_motion in (False,True):
  clip={'name':'F11_Walk_Rollover_RootMotion' if root_motion else 'F11_Walk_Rollover_InPlace','samplers':[],'channels':[]}
  ti=accessor(g,b,times.astype('<f4').reshape(-1,1),typ='SCALAR',target=None);g['accessors'][ti].update(min=[0.],max=[float(times[-1])])
  for (n,path),data in sorted(vals.items()):
   data=data.copy()
   if (n,path)==(hip,'translation') and not root_motion:
    data[:,1]+=np.linspace(0,STRIDE,len(data),dtype='<f4');data[-1]=data[0]
   ai=accessor(g,b,data,typ='VEC4' if path=='rotation' else 'VEC3',target=None)
   si=len(clip['samplers']);clip['samplers'].append({'input':ti,'output':ai,'interpolation':'LINEAR'});clip['channels'].append({'sampler':si,'target':{'node':n,'path':path}})
  g['animations'].append(clip)
 return maxerr
def build(size):
 src=prepare(size);g,b=load(src);og,ob=load(src);assert len(g['animations'])==6
 rig=Rig(og,ob)
 old=next(c for c in og['animations'] if c['name']=='F11_Walk_Contact_RootMotion')
 maxerr=add_clip(g,b,og,ob,rig,old)
 g['asset']['generator']='XPZ3D R36LC baked skinned-sole heel-to-toe rollover'
 g['extras']={**g.get('extras',{}),'revision':'R36LC','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'engineApplied':False}
 out=ROOT/'output';out.mkdir(exist_ok=True);dst=out/f'R36LC_F11_SOLE_MOTION_POT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b))
 ng,nb=load(dst)
 for key in ('nodes','scenes','scene','materials','textures','samplers'):assert og.get(key)==ng.get(key)
 for a,c in zip(og['skins'],ng['skins']):
  assert {k:v for k,v in a.items() if k!='inverseBindMatrices'}=={k:v for k,v in c.items() if k!='inverseBindMatrices'}
  assert np.array_equal(arr(og,ob,a['inverseBindMatrices']),arr(ng,nb,c['inverseBindMatrices']))
 for pi in range(15):
  a,f=primitive(og,ob,pi);c,h=primitive(ng,nb,pi);assert np.array_equal(f,h)
  for k in a:assert np.array_equal(a[k],c[k])
 for i in range(11):assert image_bytes(og,ob,i)==image_bytes(ng,nb,i)
 for a,c in zip(og['animations'],ng['animations'][:6]):
  assert a['name']==c['name'] and a['channels']==c['channels']
  for key,(t,v) in tracks(og,ob,a).items():
   nt,nv=tracks(ng,nb,c)[key];assert np.array_equal(t,nt) and np.array_equal(v,nv)
 metrics={};details={}
 ref=tracks(og,ob,old)
 for name in ['F11_Walk_Contact_RootMotion','F11_Walk_Rollover_RootMotion','F11_Walk_Rollover_InPlace']:
  clip=next(a for a in ng['animations'] if a['name']==name)
  tr=tracks(ng,nb,clip)
  use_ref=ref if 'Rollover' in name else None
  keys,_=evaluate(rig,tr,not name.endswith('InPlace'),1,use_ref);dense,rows=evaluate(rig,tr,not name.endswith('InPlace'),4,use_ref)
  metrics[name]={'baked73':keys,'interpolated289':dense};details[name]=rows
  if 'Rollover' in name:
   for side in rig.feet:
    assert keys[side]['maxAbsStanceFloorError']<2e-5
    assert keys[side]['maxStancePivotYError']<2e-5
    assert dense[side]['maxAbsStanceFloorError']<.003
 result={'version':'R36LC','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'output':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size,'sourceBytes':src.stat().st_size,'triangles':2100,'vertices':2047,'bones':63,'imagesUnchanged':11,'existingClipsPreserved':6,'clipsTotal':8,'groundLocalZ':rig.ground,'footCandidates':{s:{'uniqueFootVertices':len(f['P']),'soleSupportVertices':int(f['sole'].sum())} for s,f in rig.feet.items()},'analyticSolverMaxError':maxerr,'measurements':metrics,'engineApplied':False,'limitations':['Flat ground at rest minimum Z; candidate region below 0.22 local Z, unique weighted vertices.','Support pivot is a pitch-dependent blend of rest-selected heel/center/toe vertices; rolling contact is not full no-slip collision.','CPU linear blend skinning and quaternion slerp at 73/289 samples, not renderer or terrain collision.','Root-motion accumulation and external matching in-place speed still required.']}
 (out/f'R36LC_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 if size==512:(out/'R36LC_SOLE_TRACKS.json').write_text(json.dumps(details,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':
 for s in (512,1024):build(s)
