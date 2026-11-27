#!/usr/bin/env python3
"""R36LD: localized pose-scored shoulder/elbow/knee weight refinement.

No topology, texture, bind pose or clip changes. Only accept a regional
candidate when local edge-strain metrics improve without large worst-case
regression. Near shoulder seams use an explicit cross-piece pair objective.
"""
import math,json
from collections import defaultdict
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.spatial import cKDTree
from glb_tools import load,arr,primitive,accessor,pack,sha,image_bytes
from prepare_r36ld import ROOT,COMMIT,LOCK,prepare
PARTS=(2,4,7,8,9,10,11,13,14)
def smooth(x):
 x=np.clip(x,0,1);return x*x*(3-2*x)
def qmul(a,b):
 return (Rotation.from_quat(a)*Rotation.from_quat(b)).as_quat()
def quat(axis,angle):
 v=np.zeros(3);v[axis]=angle;return Rotation.from_rotvec(np.deg2rad(v)).as_quat()
class Model:
 def __init__(self,g,b):
  self.g=g;self.b=b;self.ids=g['skins'][0]['joints']
  assert self.ids==list(range(63))
  self.parents={c:i for i in self.ids for c in g['nodes'][i].get('children',[]) if c in self.ids}
  self.T=np.array([g['nodes'][i].get('translation',[0,0,0]) for i in self.ids],float)
  self.Q=np.array([g['nodes'][i].get('rotation',[0,0,0,1]) for i in self.ids],float)
  self.IB=arr(g,b,g['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
  self.rest=self.fk({})
  assert np.max(np.abs(self.rest@self.IB-np.eye(4)))<2e-5
  self.groups={};self.members=[];P=[];W=[];self.local={};edges=set()
  for pi in PARTS:
   a,f=primitive(g,b,pi);ids=[]
   for vi,(p,js,ws) in enumerate(zip(a['POSITION'],a['JOINTS_0'],a['WEIGHTS_0'])):
    w=np.zeros(63);np.add.at(w,js,ws)
    assert abs(w.sum()-1)<2e-5
    w/=w.sum()
    # Group only identical position and skin weights; UV splits share updates.
    key=(tuple(np.round(p.astype(float),6)),tuple(np.round(w,6)))
    if key not in self.groups:
     self.groups[key]=len(P);P.append(p);W.append(w);self.members.append([])
    j=self.groups[key];ids.append(j);self.members[j].append((pi,vi))
   self.local[pi]=np.array(ids)
   for x,y,z in f:
    for u,v in ((x,y),(y,z),(z,x)):
     j,k=ids[u],ids[v]
     if j!=k:edges.add(tuple(sorted((j,k))))
  self.P=np.array(P,float);self.W=np.array(W);self.E=np.array(sorted(edges),int)
  self.dist=np.linalg.norm(self.P[self.E[:,0]]-self.P[self.E[:,1]],axis=1)
  ok=self.dist>.003
  self.E=self.E[ok];self.dist=self.dist[ok]
 def fk(self,over):
  mats=np.empty((63,4,4));done=set()
  def get(i):
   if i not in done:
    m=np.eye(4);m[:3,:3]=Rotation.from_quat(over.get((i,'rotation'),self.Q[i])).as_matrix();m[:3,3]=over.get((i,'translation'),self.T[i])
    mats[i]=get(self.parents[i])@m if i in self.parents else m;done.add(i)
   return mats[i]
  for i in self.ids:get(i)
  return mats
 def pose(self,changes):
  return self.fk({(i,'rotation'):qmul(self.Q[i],quat(axis,deg)) for i,axis,deg in changes})@self.IB
 def anim_poses(self):
  out=[]
  for clip in self.g['animations']:
   if clip['name'] not in ('F11_Idle_Loop','F11_Walk_Rollover_InPlace','F11_Ready_Reset'):continue
   channels=[]
   for ch in clip['channels']:
    s=clip['samplers'][ch['sampler']];channels.append(((ch['target']['node'],ch['target']['path']),arr(self.g,self.b,s['output'])))
   count=len(channels[0][1])
   for i in np.linspace(0,count-1,5).astype(int):
    out.append(self.fk({k:v[i] for k,v in channels})@self.IB)
  return out
 def transformed(self,mats):
  ph=np.c_[self.P,np.ones(len(self.P))]
  return np.einsum('sbxy,vy->svbx',np.array(mats),ph)[...,:3]
 def positions(self,T,w):
  return np.einsum('svbc,vb->svc',T,w,optimize=True)
def scores(m,T,w,edge_ids,pairs):
 q=m.positions(T,w)
 e=m.E[edge_ids];dist=m.dist[edge_ids]
 length=np.linalg.norm(q[:,e[:,0]]-q[:,e[:,1]],axis=2)
 log=np.log(np.clip(length/dist[None,:],.001,1000))
 row={'edgeRMSLogStrain':float(np.sqrt(np.mean(log**2))),'edgeMaxAbsLogStrain':float(np.max(np.abs(log))),'edgeWorstPoseRMS':float(np.max(np.sqrt(np.mean(log**2,axis=1))))}
 if len(pairs):
  p=np.array(pairs);base=np.linalg.norm(m.P[p[:,0]]-m.P[p[:,1]],axis=1);d=np.linalg.norm(q[:,p[:,0]]-q[:,p[:,1]],axis=2)
  err=d-base[None,:]
  row.update(seamRMSGapChange=float(np.sqrt(np.mean(err**2))),seamMaxGapChange=float(np.max(np.abs(err))))
 return row
def accept(base,cand,pairs):
 if cand['edgeRMSLogStrain']>base['edgeRMSLogStrain']*1.015+1e-7:return False
 if cand['edgeMaxAbsLogStrain']>base['edgeMaxAbsLogStrain']*1.05+1e-7:return False
 if cand['edgeWorstPoseRMS']>base['edgeWorstPoseRMS']*1.03+1e-7:return False
 if len(pairs) and cand['seamRMSGapChange']>base['seamRMSGapChange']*1.015+1e-7:return False
 return True
def objective(score,pairs):
 return score['edgeRMSLogStrain']+.15*score['edgeWorstPoseRMS']+(8*score.get('seamRMSGapChange',0) if len(pairs) else 0)
def fit_pair(w,ids,parent,child,t,alpha):
 new=w.copy();old=w[ids];total=old[:,parent]+old[:,child]
 new[ids,child]=(1-alpha)*old[:,child]+alpha*total*t
 new[ids,parent]=total-new[ids,child]
 for i in ids:
  # Do not create a fifth influence. Preserve any other nonzero weights.
  if (new[i]>1e-9).sum()>4:new[i]=w[i]
 return new
def seam_pairs(m,cap):
 trunk=m.local[7];outer=m.local[cap]
 d,j=cKDTree(m.P[trunk]).query(m.P[outer]);pairs=set()
 for a,b,dist in zip(outer,trunk[j],d):
  if .0001<dist<=.028 and np.abs(m.W[a]-m.W[b]).sum()>.015:pairs.add((int(a),int(b)))
 return sorted(pairs)
def align(w,pairs,strength):
 out=w.copy()
 # Average the target's weight vectors by unique near-neighbor group.
 sums=defaultdict(list)
 for a,b in pairs:
  avg=(w[a]+w[b])*.5;sums[a].append(avg);sums[b].append(avg)
 for i,a in sums.items():
  q=w[i]*(1-strength)+np.mean(a,axis=0)*strength
  ix=np.argsort(-q)[4:]
  if q[ix].sum()>1e-5:continue
  q[ix]=0;out[i]=q/q.sum()
 return out
def refine(m):
 w=m.W.copy();records=[];all_anim=m.anim_poses()
 configs=[('R_shoulder',4,13,18,8,-1),('L_shoulder',4,14,20,9,1),('R_elbow',13,18,24,None,-1),('L_elbow',14,20,26,None,1),('L_knee',2,5,10,None,1),('R_knee',3,6,11,None,-1)]
 for label,parent,joint,nextbone,cap,sign in configs:
  center=m.rest[joint,:3,3];axis=m.rest[nextbone,:3,3]-center;axis/=np.linalg.norm(axis)
  delta=m.P-center;rad=np.linalg.norm(delta,axis=1);ax=delta@axis
  # Limit to locally adjacent bone pair, and stay away from hands/feet.
  region=(rad<(.145 if cap else .125))&((w[:,parent]+w[:,joint])>.65)
  ids=np.flatnonzero(region);pairs=seam_pairs(m,cap) if cap is not None else []
  touched=np.unique(np.r_[ids,np.array(pairs,int).reshape(-1)]).astype(int)
  edge_ids=np.flatnonzero(np.isin(m.E[:,0],touched)|np.isin(m.E[:,1],touched))
  poses=[]
  if cap is not None:
   poses=[m.pose([(joint,1,sign*a)]) for a in (20,45,68,85)]+[m.pose([(joint,2,-sign*a)]) for a in (-25,25,50)]
  elif 'elbow' in label:
   poses=[m.pose([(parent,1,sign*60),(joint,2,-sign*a)]) for a in (25,50,80,105)]+[m.pose([(joint,1,sign*a)]) for a in (25,55)]
  else:
   poses=[m.pose([(parent,0,-a*.45),(joint,0,a)]) for a in (15,30,50,75,95)]
  T=m.transformed(poses+all_anim)
  base=scores(m,T,w,edge_ids,pairs);best=base;bestw=w;param={'kind':'unchanged'}
  candidates=[]
  if pairs:
   for alpha in (.25,.5,.75,1.):candidates.append((align(w,pairs,alpha),{'kind':'near_seam_weight_alignment','strength':alpha}))
  for width in (.045,.07,.10,.13):
   for shift in (-.025,0,.025):
    t=smooth((ax[ids]-shift+width)/(2*width))
    for strength in (.2,.4,.6,.8):
     nw=fit_pair(w,ids,parent,joint,t,strength)
     candidates.append((nw,{'kind':'local_pair_weight_profile','width':width,'shift':shift,'strength':strength}))
     if pairs:candidates.append((align(nw,pairs,.5),{'kind':'pair_profile_and_seam','width':width,'shift':shift,'strength':strength,'seamStrength':.5}))
  for candidate,p in candidates:
   s=scores(m,T,candidate,edge_ids,pairs)
   if accept(base,s,pairs) and objective(s,pairs)<objective(best,pairs)-1e-7:
    best=s;bestw=candidate;param=p
  if objective(best,pairs)>objective(base,pairs)*.995:
   best=base;bestw=w;param={'kind':'unchanged_no_material_gain'}
  changed=np.flatnonzero(np.max(np.abs(bestw-w),axis=1)>1e-7)
  records.append({'region':label,'joint':m.g['nodes'][joint]['name'],'candidateVertices':len(touched),'meshEdges':len(edge_ids),'nearSeamPairs':len(pairs),'poseCount':len(poses)+len(all_anim),'before':base,'after':best,'selected':param,'changedUniqueVertices':len(changed),'changedVertexRecords':sum(len(m.members[i]) for i in changed)})
  w=bestw
 return w,records
def build(size):
 src=prepare(size);g,b=load(src);og,ob=load(src);m=Model(og,ob)
 w,records=refine(m);changed=np.flatnonzero(np.max(np.abs(w-m.W),axis=1)>1e-7)
 if not len(changed):raise RuntimeError('No accepted improvement')
 changed_set=set(changed);updated=0
 for pi in PARTS:
  a,f=primitive(og,ob,pi);js=a['JOINTS_0'].copy();ws=a['WEIGHTS_0'].copy()
  count=0
  for vi,i in enumerate(m.local[pi]):
   if i not in changed_set:continue
   q=w[i];ix=np.argsort(-q)[:4];assert q[np.argsort(-q)[4:]].sum()<1e-6
   vals=q[ix];vals/=vals.sum();js[vi]=np.where(vals>0,ix,0);ws[vi]=vals.astype(ws.dtype);count+=1
  if count:
   p=g['meshes'][0]['primitives'][pi];p['attributes']['JOINTS_0']=accessor(g,b,js,g['accessors'][p['attributes']['JOINTS_0']]);p['attributes']['WEIGHTS_0']=accessor(g,b,ws,g['accessors'][p['attributes']['WEIGHTS_0']]);updated+=count
 g['asset']['generator']='XPZ3D R36LD localized pose-scored joint weights'
 g['extras']={**g.get('extras',{}),'revision':'R36LD','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'engineApplied':False}
 out=ROOT/'output';out.mkdir(exist_ok=True);dst=out/f'R36LD_F11_JOINT_WEIGHTS_POT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b));ng,nb=load(dst)
 for k in ('nodes','scenes','scene','materials','textures','samplers'):assert og.get(k)==ng.get(k)
 for i in range(11):assert image_bytes(og,ob,i)==image_bytes(ng,nb,i)
 assert np.array_equal(arr(og,ob,og['skins'][0]['inverseBindMatrices']),arr(ng,nb,ng['skins'][0]['inverseBindMatrices']))
 for a,c in zip(og['animations'],ng['animations']):
  assert a['name']==c['name'] and a['channels']==c['channels']
  for s,t in zip(a['samplers'],c['samplers']):
   for k in ('input','output'):assert np.array_equal(arr(og,ob,s[k]),arr(ng,nb,t[k]))
 for pi in range(15):
  a,f=primitive(og,ob,pi);c,h=primitive(ng,nb,pi);assert np.array_equal(f,h)
  for k in a:
   if k not in ('WEIGHTS_0','JOINTS_0'):assert np.array_equal(a[k],c[k])
  assert np.max(np.abs(c['WEIGHTS_0'].sum(axis=1)-1))<2e-5 and np.all(c['WEIGHTS_0']>=0)
  if pi in PARTS:
   for vi,i in enumerate(m.local[pi]):
    if i not in changed_set:
     assert np.array_equal(a['WEIGHTS_0'][vi],c['WEIGHTS_0'][vi]) and np.array_equal(a['JOINTS_0'][vi],c['JOINTS_0'][vi])
 result={'version':'R36LD','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'output':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size,'sourceBytes':src.stat().st_size,'triangles':2100,'vertices':2047,'bones':63,'clipsPreserved':8,'imagesUnchanged':11,'changedUniqueVertices':len(changed),'changedVertexRecords':updated,'regionalResults':records,'engineApplied':False,'limitations':['Pose-scored skin weights only, not topological mesh welding.','Metrics are local edge length and near-seam distance proxies, not visual quality or volume proof.','Synthetic stress poses and selected existing animation samples; no runtime or rendered comparison.']}
 (out/f'R36LD_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':
 for s in (512,1024):build(s)
