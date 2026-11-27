#!/usr/bin/env python3
"""R36LE: pose-driven knee corrective morphs optimized for local edge deformation.
Base skin weights, rig, triangles, textures and original rotation/translation tracks stay intact.
Four POSITION/NORMAL/TANGENT morphs, with explicit glTF animation weight channels.
"""
import json,math
from collections import defaultdict
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from glb_tools import load,arr,accessor,primitive,pack,sha,image_bytes
from prepare_r36le import ROOT,COMMIT,LOCK,prepare
NAMES=['L_Knee_45','L_Knee_90','R_Knee_45','R_Knee_90']
PAIRS=[(2,5),(3,6)]
ANCHORS=(45.,90.)
def rotation(a):return Rotation.from_rotvec([math.radians(a),0,0]).as_matrix()
def unit(v):return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-12)
def activation(angle):
 # Piecewise interpolation between rest, moderate and deep flexion.
 a=float(np.clip(angle,0,90))
 if a<=45:return np.array([(a/45)**2,0.])
 t=(a-45)/45;return np.array([1-t,t])
def angle(g,node,quats):
 q=Rotation.from_quat(quats);rest=Rotation.from_quat(g['nodes'][node].get('rotation',[0,0,0,1]))
 return np.rad2deg((rest.inv()*q).as_rotvec()[:,0])
def weights(a):
 w=np.zeros((len(a['POSITION']),63))
 np.add.at(w,(np.arange(len(w))[:,None],a['JOINTS_0']),a['WEIGHTS_0'])
 return w
def centers(g):
 parent={c:i for i in range(63) for c in g['nodes'][i].get('children',[]) if c<63}
 def get(i):
  n=g['nodes'][i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix();m[:3,3]=n.get('translation',[0,0,0])
  return get(parent[i])@m if i in parent else m
 return [get(j)[:3,3] for _,j in PAIRS]
def make_delta(a,pivot,pair,theta,strength):
 p,j=pair;w=weights(a);total=w[:,p]+w[:,j]
 ids=np.flatnonzero((total>.999)&(w[:,p]>.005)&(w[:,j]>.005)&(np.linalg.norm(a['POSITION']-pivot,axis=1)<.18))
 out={k:np.zeros_like(a[k][:,:3],dtype=np.float32) for k in ('POSITION','NORMAL','TANGENT') if k in a}
 if not len(ids):return out
 x=w[ids,j]/total[ids];R=rotation(theta);half=math.radians(theta)/2
 angles=2*np.arctan2(x*math.sin(half),1-x+x*math.cos(half))
 Q=Rotation.from_rotvec(np.c_[angles,np.zeros((len(ids),2))]).as_matrix()
 B=(1-x[:,None,None])*np.eye(3)+x[:,None,None]*R
 C=np.linalg.solve(B,Q)
 d=np.einsum('vij,vj->vi',C-np.eye(3),a['POSITION'][ids]-pivot)*strength
 out['POSITION'][ids]=d
 # Directional correction approximates Q after linear skinning; normalize each
 # vector at full activation. glTF tangent morph has xyz only; handedness stays.
 for k in ('NORMAL','TANGENT'):
  if k not in out:continue
  v=a[k][ids,:3].astype(float);correct=unit(np.einsum('vij,vj->vi',C,v))
  out[k][ids]=(correct-v)*strength
 return out
def joined(g,b):
 P=[];W=[];E=[];offset=0
 for pi in range(15):
  a,f=primitive(g,b,pi);P.append(a['POSITION']);W.append(weights(a));E.extend((f[:,[0,1]]+offset).tolist());E.extend((f[:,[1,2]]+offset).tolist());E.extend((f[:,[2,0]]+offset).tolist());offset+=len(a['POSITION'])
 P=np.concatenate(P).astype(float);W=np.concatenate(W);E=np.unique(np.sort(np.array(E),axis=1),axis=0)
 d=np.linalg.norm(P[E[:,0]]-P[E[:,1]],axis=1);valid=d>.003
 return P,W,E[valid],d[valid]
def metrics(P,W,E,L,pivot,pair,theta,deltas):
 # Exact single-axis knee flex for the parent/child pair; other bones fixed
 # except descendants of the knee. All chosen edges are local to the knee.
 R=rotation(theta);p,j=pair
 # Includes foot/toe descendants for any adjacent edge that reaches them.
 downstream=(5,10,15,22) if j==5 else (6,11,16,23)
 w=W[:,downstream].sum(axis=1)
 X=P+deltas
 q=X*(1-w[:,None])+((X-pivot)@R.T+pivot)*w[:,None]
 D=np.linalg.norm(q[E[:,0]]-q[E[:,1]],axis=1)
 logs=np.log(np.clip(D/L,.001,1000))
 return float(np.sqrt(np.mean(logs**2))),float(np.max(np.abs(logs)))
def optimized_delta(P,W,E,L,pivot,pair,theta):
 p,j=pair;total=W[:,p]+W[:,j]
 mask=(total>.999)&(W[:,p]>.005)&(W[:,j]>.005)&(np.linalg.norm(P-pivot,axis=1)<.18)
 ids=np.flatnonzero(mask)
 # Position + influence grouping keeps coincident UV duplicates together.
 keys={};groups=[]
 for i in ids:
  key=tuple(np.round(P[i],6))+tuple(np.round(W[i],6))
  if key not in keys:keys[key]=len(keys)
  groups.append(keys[key])
 group=np.full(len(P),-1,int);group[ids]=groups
 ng=len(keys);em=mask[E[:,0]]|mask[E[:,1]];edges=E[em];length=L[em]
 downstream=(5,10,15,22) if j==5 else (6,11,16,23)
 w=W[:,downstream].sum(axis=1);R=rotation(theta)
 B=(1-w[:,None,None])*np.eye(3)+w[:,None,None]*R
 base=P*(1-w[:,None])+((P-pivot)@R.T+pivot)*w[:,None]
 # Count each geometric edge once for fitting; separate primitive records
 # remain in the output and evaluation.
 unique={}
 for e,l in zip(edges,length):
  a,b=e;key=tuple(sorted((tuple(np.round(P[a],6))+tuple(np.round(W[a],6)),tuple(np.round(P[b],6))+tuple(np.round(W[b],6)))))
  if key not in unique:unique[key]=(e,l)
 edges=np.array([x[0] for x in unique.values()]);length=np.array([x[1] for x in unique.values()])
 def unpack(x):
  d=np.zeros_like(P);d[ids]=x.reshape(-1,3)[groups];return d
 def residual(x):
  d=unpack(x);q=base+np.einsum('vij,vj->vi',B,d)
  ratio=np.linalg.norm(q[edges[:,0]]-q[edges[:,1]],axis=1)/length
  err=np.log(np.clip(ratio,.001,1000))
  # Small correction prior discourages gross reshaping of the rest silhouette.
  return np.r_[err, .35*x/.035]
 sparsity=lil_matrix((len(edges)+3*ng,3*ng),dtype=int)
 for i,(a,b) in enumerate(edges):
  for k in set((group[a],group[b])):
   if k>=0:sparsity[i,3*k:3*k+3]=1
 for k in range(3*ng):sparsity[len(edges)+k,k]=1
 result=least_squares(residual,np.zeros(3*ng),jac_sparsity=sparsity.tocsr(),bounds=(-.018,.018),max_nfev=120,ftol=1e-7)
 d=unpack(result.x)
 return d
def select(g,b,side,pivot,pair,P,W,E,L):
 attrs=[primitive(g,b,i)[0] for i in range(15)]
 unitdelta=[optimized_delta(P,W,E,L,pivot,pair,t) for t in ANCHORS]
 active=np.any(np.abs(unitdelta[1])>1e-8,axis=1)
 edge_mask=active[E[:,0]]|active[E[:,1]]
 e=E[edge_mask];length=L[edge_mask]
 assert active.sum()>0 and len(e)>0
 def eval_strength(s,angles):
  rows=[]
  for theta in angles:
   w=activation(theta);d=s*(unitdelta[0]*w[0]+unitdelta[1]*w[1])
   a,c=metrics(P,W,e,length,pivot,pair,theta,np.zeros_like(P))
   x,y=metrics(P,W,e,length,pivot,pair,theta,d)
   rows.append({'angle':theta,'baselineRMS':a,'correctedRMS':x,'baselineMax':c,'correctedMax':y})
  return rows
 fit_angles=[15,30,45,60,75,90]
 hold_angles=[10,22.5,37.5,52.5,67.5,82.5,95]
 chosen=0.;best=1.;fit=eval_strength(0.,fit_angles);hold=eval_strength(0.,hold_angles)
 for s in (.1,.2,.35,.5,.65,.8,1.):
  f=eval_strength(s,fit_angles);h=eval_strength(s,hold_angles)
  # Prefer improved RMS without large worst-edge regression on either set.
  if any(r['correctedMax']>r['baselineMax']*1.05+1e-6 for r in f+h):continue
  ratio=sum(r['correctedRMS'] for r in f)/sum(r['baselineRMS'] for r in f)
  hr=sum(r['correctedRMS'] for r in h)/sum(r['baselineRMS'] for r in h)
  if ratio<best and hr<1.005:chosen=s;best=ratio;fit=f;hold=h
 if chosen==0:
  # Directional compensation still needs a concrete geometric benefit, not
  # merely an added morph. Reject rather than produce a nominal-only result.
  raise ValueError(f'{side} knee no accepted correction candidate')
 return [d*chosen for d in unitdelta],{'side':side,'strength':chosen,'affectedVertexRecords':int(active.sum()),'localEdges':int(len(e)),'fit':fit,'holdout':hold,'fitRMSRatio':best,'maxDeltaAt90':float(np.max(np.linalg.norm(unitdelta[1]*chosen,axis=1)))}
def build(size):
 src=prepare(size);g,b=load(src);og,ob=load(src)
 assert len(g['meshes'])==1 and len(g['animations'])==8 and not any(p.get('targets') for p in g['meshes'][0]['primitives'])
 pivots=centers(g);P,W,E,L=joined(g,b);selections=[select(g,b,s,c,p,P,W,E,L) for s,c,p in zip(('L','R'),pivots,PAIRS)]
 deltas=[d for x in selections for d in x[0]]
 mesh=g['meshes'][0];mesh['weights']=[0.]*4;mesh['extras']={**mesh.get('extras',{}),'targetNames':NAMES}
 # Every primitive must expose the same four morph targets in the same order.
 # Reuse zero accessors by vertex count. No texture resampling.
 zeros={};changed=0;targets=[];offset=0
 for pi,p in enumerate(mesh['primitives']):
  a,f=primitive(og,ob,pi);n=len(a['POSITION']);p['targets']=[];count=0
  for full in deltas:
   v=full[offset:offset+n].astype('<f4')
   d={'POSITION':v};target={}
   # Rotate authored normals and tangent directions by the local change
   # of geometric face normals. Preserve tangent handedness.
   if np.any(v):
    p0=a['POSITION'].astype(float);p1=p0+v
    def vertex_geom(p):
     q=p[f];face=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0]);norm=np.zeros_like(p)
     for j in range(3):np.add.at(norm,f[:,j],face)
     return unit(norm)
    n0,n1=vertex_geom(p0),vertex_geom(p1);cross=np.cross(n0,n1);dot=np.clip(np.sum(n0*n1,axis=1),-1,1)
    rotvec=unit(cross)*np.arctan2(np.linalg.norm(cross,axis=1),dot)[:,None]
    r=Rotation.from_rotvec(rotvec)
    for k in ('NORMAL','TANGENT'):
     if k in a:d[k]=(r.apply(a[k][:,:3])-a[k][:,:3]).astype('<f4')
   else:
    for k in ('NORMAL','TANGENT'):
     if k in a:d[k]=np.zeros((n,3),dtype='<f4')
   for k,v in d.items():
    if not np.any(v):
     if n not in zeros:zeros[n]=accessor(g,b,np.zeros((n,3),dtype='<f4'),typ='VEC3')
     ai=zeros[n]
    else:ai=accessor(g,b,v,typ='VEC3')
    target[k]=ai
   p['targets'].append(target);count+=int(np.count_nonzero(np.linalg.norm(d['POSITION'],axis=1)>1e-8))
  targets.append({'primitive':pi,'nonzeroTargetVertexRecords':count});offset+=n
 node=next(i for i,n in enumerate(g['nodes']) if n.get('mesh')==0)
 clip_reports=[]
 for clip in g['animations']:
  track=[]
  for _,j in PAIRS:
   ch=next(c for c in clip['channels'] if c['target']=={'node':j,'path':'rotation'})
   s=clip['samplers'][ch['sampler']]
   times=arr(g,b,s['input'])[:,0];q=arr(g,b,s['output']);track.append((s['input'],times,angle(g,j,q)))
  assert np.array_equal(track[0][1],track[1][1])
  w=np.c_[[activation(a) for a in track[0][2]],[activation(a) for a in track[1][2]]].astype('<f4')
  assert w.shape==(len(track[0][1]),4)
  ai=accessor(g,b,w.reshape(-1,1),typ='SCALAR',target=None)
  si=len(clip['samplers']);clip['samplers'].append({'input':track[0][0],'output':ai,'interpolation':'LINEAR'})
  clip['channels'].append({'sampler':si,'target':{'node':node,'path':'weights'}})
  clip_reports.append({'clip':clip['name'],'samples':len(w),'maximumWeights':w.max(axis=0).tolist(),'maximumKneeFlexDegrees':[float(max(t[2])) for t in track]})
 g['asset']['generator']='XPZ3D R36LE pose-driven knee correctives'
 g['extras']={**g.get('extras',{}),'revision':'R36LE','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'engineApplied':False}
 out=ROOT/'output';out.mkdir(exist_ok=True);dst=out/f'R36LE_F11_KNEE_CORRECTIVES_POT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b));ng,nb=load(dst)
 for k in ('nodes','scenes','scene','materials','textures','samplers'):assert og.get(k)==ng.get(k)
 for i in range(11):assert image_bytes(og,ob,i)==image_bytes(ng,nb,i)
 assert np.array_equal(arr(og,ob,og['skins'][0]['inverseBindMatrices']),arr(ng,nb,ng['skins'][0]['inverseBindMatrices']))
 for pi in range(15):
  a,f=primitive(og,ob,pi);c,h=primitive(ng,nb,pi);assert np.array_equal(f,h)
  for k in a:assert np.array_equal(a[k],c[k])
  for t in ng['meshes'][0]['primitives'][pi]['targets']:
   for k,i in t.items():
    d=arr(ng,nb,i);assert d.shape==(len(a['POSITION']),3) and np.isfinite(d).all()
 for a,c in zip(og['animations'],ng['animations']):
  assert a['name']==c['name'] and a['channels']==c['channels'][:-1]
  for s,t in zip(a['samplers'],c['samplers']):
   for k in ('input','output'):assert np.array_equal(arr(og,ob,s[k]),arr(ng,nb,t[k]))
  last=c['samplers'][-1];v=arr(ng,nb,last['output']);times=arr(ng,nb,last['input'])
  assert len(v)==4*len(times) and np.isfinite(v).all() and v.min()>=0 and v.max()<=1
 result={'version':'R36LE','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'output':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size,'sourceBytes':src.stat().st_size,'triangles':2100,'vertices':2047,'bones':63,'imagesUnchanged':11,'existingClipsPreserved':8,'morphTargets':NAMES,'regions':[s[1] for s in selections],'targetsByPrimitive':targets,'clipWeights':clip_reports,'engineApplied':False,'limitations':['Local single-axis CPU edge-length proxy; not a volume or rendered quality measurement.','Correctives use constrained local edge-length least squares at two angles; not a full DQS runtime.','Direction corrections are approximate, material shading must be reviewed.','Other external animations need their own corrective weight driver. S2/S3 morph and weight-track support not verified.']}
 (out/f'R36LE_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 print(json.dumps({k:v for k,v in result.items() if k not in ('targetsByPrimitive','clipWeights')},indent=2),flush=True)
if __name__=='__main__':
 for s in (512,1024):build(s)
