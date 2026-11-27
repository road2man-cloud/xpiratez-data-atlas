#!/usr/bin/env python3
"""R36LF: morph-free knee deformation alternative for standard skeletal GLBs.

Approximate the source POSITION correctives with paired helper joints.
The helpers duplicate the parent/child skin transforms at rest. Each helper
pair translates by the cluster displacement, in its parent's bind frame.
At most two cluster pairs influence each affected vertex (four skin weights).
No new character geometry, textures, or original game animation.
"""
import copy,json,math
import numpy as np
from scipy.spatial.transform import Rotation
from glb_tools import load,arr,accessor,primitive,pack,sha,image_bytes
from prepare_r36lf import ROOT,COMMIT,LOCK,prepare
SIDES=[('L',2,5),('R',3,6)]
ANGLES=[10,15,22.5,30,37.5,45,52.5,60,67.5,75,82.5,90,95]
def activation(a):
 a=np.clip(a,0,90)
 if a<=45:return np.array([(a/45)**2,0.])
 t=(a-45)/45;return np.array([1-t,t])
def weights(a,n=63):
 w=np.zeros((len(a['POSITION']),n))
 np.add.at(w,(np.arange(len(w))[:,None],a['JOINTS_0']),a['WEIGHTS_0'])
 return w
def fk(g,over={}):
 nodes=g['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
 joints=g['skins'][0]['joints'];js=set(joints);out={}
 def get(i):
  if i not in out:
   n=nodes[i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(over.get((i,'rotation'),n.get('rotation',[0,0,0,1]))).as_matrix();m[:3,3]=over.get((i,'translation'),n.get('translation',[0,0,0]))
   if 'scale' in n:m[:3,:3]@=np.diag(n['scale'])
   assert 'matrix' not in n
   out[i]=get(parents[i])@m if i in parents and parents[i] in js else m
  return out[i]
 return np.array([get(i) for i in joints])
def collect(g,b):
 P=[];W=[];D=[];E=[];ranges=[];off=0
 for pi,p in enumerate(g['meshes'][0]['primitives']):
  a,f=primitive(g,b,pi);n=len(a['POSITION']);ranges.append((off,off+n))
  P.append(a['POSITION']);W.append(weights(a))
  D.append(np.stack([arr(g,b,t['POSITION']) for t in p['targets']],axis=1))
  for x,y in ((0,1),(1,2),(2,0)):E.extend((f[:,[x,y]]+off).tolist())
  off+=n
 P=np.concatenate(P).astype(float);W=np.concatenate(W);D=np.concatenate(D).astype(float);E=np.unique(np.sort(np.asarray(E),axis=1),axis=0)
 length=np.linalg.norm(P[E[:,0]]-P[E[:,1]],axis=1);mask=length>.003
 return P,W,D,E[mask],length[mask],ranges
def coefficients(X,C):
 # Closest line segment between at most two cluster centers, deterministic.
 n=len(X);k=len(C);A=np.zeros((n,k));best=np.full(n,np.inf)
 for a in range(k):
  for b in range(a,k):
   v=C[b]-C[a];t=np.clip(((X-C[a])@v)/max(float(v@v),1e-20),0,1)
   q=C[a]+t[:,None]*v
   err=np.sum((q-X)**2,axis=1);use=err<best-1e-20
   A[use]=0;A[use,a]=1-t[use];A[use,b]+=t[use];best[use]=err[use]
 return A
def fit_clusters(X,k):
 # Start from farthest distinct samples; alternating segment projection and
 # least squares yields a small two-influence dictionary.
 mean=X.mean(axis=0);C=[X[np.argmax(np.sum((X-mean)**2,axis=1))]]
 for _ in range(k-1):
  d=np.min(np.sum((X[:,None,:]-np.array(C)[None,:,:])**2,axis=2),axis=1)
  C.append(X[np.argmax(d)])
 C=np.array(C)
 for _ in range(35):
  A=coefficients(X,C)
  if k==1:C=X.mean(axis=0,keepdims=True);break
  # Small regularization keeps unused centers from becoming unbounded.
  new=np.linalg.solve(A.T@A+np.eye(k)*.0005,A.T@X+.0005*C)
  if np.max(np.abs(new-C))<1e-8:C=new;break
  C=new
 A=coefficients(X,C)
 return C,A
def metric(P,W,E,L,pivot,pair,angle,d):
 p,j=pair;R=Rotation.from_rotvec([math.radians(angle),0,0]).as_matrix()
 downstream=(5,10,15,22) if j==5 else (6,11,16,23)
 w=W[:,downstream].sum(axis=1);X=P+d
 q=X*(1-w[:,None])+((X-pivot)@R.T+pivot)*w[:,None]
 ll=np.linalg.norm(q[E[:,0]]-q[E[:,1]],axis=1)
 log=np.log(np.clip(ll/L,.001,1000))
 return float(np.sqrt(np.mean(log**2))),float(np.max(np.abs(log)))
def design(P,W,D,E,L,rest):
 designs=[]
 for s,(label,p,j) in enumerate(SIDES):
  d=D[:,s*2:s*2+2,:];active=np.any(np.abs(d)>1e-8,axis=(1,2));ids=np.flatnonzero(active)
  assert len(ids)==39 and np.max(np.abs(W[ids,p]+W[ids,j]-1))<2e-5
  # Exact duplicates get the same dictionary assignments.
  X=d[ids].reshape(-1,6);unique,inv=np.unique(np.round(X,8),axis=0,return_inverse=True)
  em=active[E[:,0]]|active[E[:,1]];e=E[em];length=L[em]
  def evaluate(recon):
   rows=[]
   for a in ANGLES:
    wt=activation(a);target=np.einsum('vkc,k->vc',d,wt);approx=np.einsum('vkc,k->vc',recon,wt)
    b,bm=metric(P,W,e,length,rest[j,:3,3],(p,j),a,np.zeros_like(P))
    m,mm=metric(P,W,e,length,rest[j,:3,3],(p,j),a,target)
    h,hm=metric(P,W,e,length,rest[j,:3,3],(p,j),a,approx)
    rows.append({'angle':a,'baseRMS':b,'morphRMS':m,'helperRMS':h,'baseMax':bm,'morphMax':mm,'helperMax':hm})
   return rows
  candidates=[];chosen=None
  for k in (1,2,3,4,5,6):
   C,A=fit_clusters(unique,k);A=A[inv];recon=np.zeros_like(d);recon[ids]=(A@C).reshape(-1,2,3)
   rows=evaluate(recon)
   base=sum(x['baseRMS'] for x in rows);morph=sum(x['morphRMS'] for x in rows);helper=sum(x['helperRMS'] for x in rows)
   retained=(base-helper)/(base-morph);rmse=float(np.linalg.norm(recon[ids]-d[ids])/np.linalg.norm(d[ids]))
   maxratio=max(x['helperMax']/x['baseMax'] for x in rows)
   rec={'clusters':k,'helperJoints':2*k,'retainedMorphRMSBenefit':retained,'relativeDisplacementError':rmse,'worstMaxRatioToBase':maxratio}
   candidates.append(rec)
   if retained>=.70 and rmse<=.45 and maxratio<=1.10:
    chosen=(C.reshape(k,2,3),A,recon,rows,rec);break
  if chosen is None:raise ValueError('No acceptable skeletal approximation '+label+' '+str(candidates))
  C,A,recon,rows,rec=chosen
  designs.append({'label':label,'parent':p,'child':j,'ids':ids,'C':C,'A':A,'recon':recon,'rows':rows,'selected':rec,'candidates':candidates})
 return designs
def build(size):
 src=prepare(size);g,b=load(src);og,ob=load(src);mesh=g['meshes'][0]
 assert mesh['extras']['targetNames']==['L_Knee_45','L_Knee_90','R_Knee_45','R_Knee_90']
 assert g['skins'][0]['joints']==list(range(63)) and len(g['animations'])==8
 P,W,D,E,L,ranges=collect(g,b);rest=fk(g);skin=g['skins'][0]
 ib=arr(g,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
 assert np.max(np.abs(rest@ib-np.eye(4)))<2e-5
 designs=design(P,W,D,E,L,rest)
 all_ib=list(ib);new_joint_map=[]
 newW=np.zeros((len(P),63+sum(d['selected']['helperJoints'] for d in designs)));newW[:,:63]=W
 for d in designs:
  p,j=d['parent'],d['child'];ids=d['ids'];newW[ids,:]=0
  d['helpers']=[]
  for k,c in enumerate(d['C']):
   for parent in (p,j):
    idx=len(g['nodes']);si=len(skin['joints']);name=f"R36LF_{d['label']}_Knee_C{k+1}_{'Parent' if parent==p else 'Child'}"
    g['nodes'].append({'name':name,'translation':[0.,0.,0.],'rotation':[0.,0.,0.,1.]})
    g['nodes'][parent].setdefault('children',[]).append(idx);skin['joints'].append(idx);all_ib.append(ib[parent].copy())
    newW[ids,si]=W[ids,parent]*d['A'][:,k]
    d['helpers'].append({'node':idx,'skinIndex':si,'parent':parent,'cluster':k,'name':name})
    new_joint_map.append({'node':idx,'skinIndex':si,'parent':parent,'cluster':k,'name':name,'restDelta45':c[0].tolist(),'restDelta90':c[1].tolist()})
 assert np.max(np.abs(newW.sum(axis=1)-1))<2e-5 and np.max(np.sum(newW>1e-8,axis=1))<=4
 skin['inverseBindMatrices']=accessor(g,b,np.array(all_ib,dtype='<f4').transpose(0,2,1).reshape(-1,16),typ='MAT4',target=None)
 mesh.pop('weights',None);mesh['extras'].pop('targetNames',None)
 for pi,p in enumerate(mesh['primitives']):
  a,f=primitive(og,ob,pi);lo,hi=ranges[pi];q=newW[lo:hi]
  p.pop('targets')
  changed=np.flatnonzero(np.any(q[:,63:]>0,axis=1))
  if len(changed):
   j=a['JOINTS_0'].copy();w=a['WEIGHTS_0'].copy()
   for v in changed:
    ix=np.argsort(-q[v])[:4];vals=q[v,ix];vals/=vals.sum();j[v]=np.where(vals>0,ix,0);w[v]=vals.astype(w.dtype)
   for key,data in [('JOINTS_0',j),('WEIGHTS_0',w)]:
    p['attributes'][key]=accessor(g,b,data,g['accessors'][p['attributes'][key]])
 for clip in g['animations']:
  wi=next(i for i,c in enumerate(clip['channels']) if c['target']['path']=='weights')
  ch=clip['channels'].pop(wi);si=ch['sampler'];ws=clip['samplers'].pop(si)
  for c in clip['channels']:
   if c['sampler']>si:c['sampler']-=1
  times=arr(g,b,ws['input'])[:,0];w=arr(g,b,ws['output']).reshape(-1,4)
  for s,d in enumerate(designs):
   for h in d['helpers']:
    c=d['C'][h['cluster']];delta=w[:,2*s:2*s+2]@c
    # Bind-space vector -> parent bind local coordinates.
    tr=delta@rest[h['parent'],:3,:3]
    ai=accessor(g,b,tr.astype('<f4'),typ='VEC3',target=None);k=len(clip['samplers'])
    clip['samplers'].append({'input':ws['input'],'output':ai,'interpolation':'LINEAR'})
    clip['channels'].append({'sampler':k,'target':{'node':h['node'],'path':'translation'}})
 g['asset']['generator']='XPZ3D R36LF morph-free paired knee helper joints'
 g['extras']={**g.get('extras',{}),'revision':'R36LF','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'engineApplied':False,'morphFree':True}
 out=ROOT/'output';out.mkdir(exist_ok=True);dst=out/f'R36LF_F11_KNEE_HELPER_POT_{size}_2100TRI.glb';dst.write_bytes(pack(g,b));ng,nb=load(dst)
 nj=len(ng['skins'][0]['joints']);assert nj==newW.shape[1]
 assert not any(p.get('targets') for p in ng['meshes'][0]['primitives']) and not any(c['target']['path']=='weights' for a in ng['animations'] for c in a['channels'])
 nib=arr(ng,nb,ng['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
 assert np.array_equal(nib[:63],ib) and np.max(np.abs(fk(ng)@nib-np.eye(4)))<2e-5
 for i in range(11):assert image_bytes(og,ob,i)==image_bytes(ng,nb,i)
 for k in ('materials','textures','samplers','scenes','scene'):assert og.get(k)==ng.get(k)
 A=[]
 for pi in range(15):
  a,f=primitive(og,ob,pi);c,h=primitive(ng,nb,pi);assert np.array_equal(f,h)
  for k in a:
   if k not in ('JOINTS_0','WEIGHTS_0'):assert np.array_equal(a[k],c[k])
  A.append(weights(c,nj))
 actualW=np.concatenate(A);assert np.max(np.abs(actualW-newW))<2e-6
 # Full CPU skinning of emitted data at every original keyframe, including
 # all other moving joints. Compare actual output to the original morph GLB.
 affected=np.flatnonzero(np.any(newW[:,63:]>0,axis=1));ph=np.c_[P[affected],np.ones(len(affected))]
 clips=[]
 def skinpos(m,w,p):
  return np.einsum('vb,bxy,vy->vx',w,m,p,optimize=True)[:,:3]
 for old,new in zip(og['animations'],ng['animations']):
  assert old['name']==new['name']
  def tracks(g,b,c):
   out={}
   for ch in c['channels']:
    s=c['samplers'][ch['sampler']];out[(ch['target']['node'],ch['target']['path'])]=(arr(g,b,s['input'])[:,0],arr(g,b,s['output']))
   return out
  t0=tracks(og,ob,old);t1=tracks(ng,nb,new);wk=next(k for k in t0 if k[1]=='weights')
  time,w=t0.pop(wk);w=w.reshape(-1,4)
  for k,(t,v) in t0.items():assert np.array_equal(t,t1[k][0]) and np.array_equal(v,t1[k][1])
  errors=[];magnitudes=[]
  for i in range(len(time)):
   m0=fk(og,{k:v[i] for k,(t,v) in t0.items()})@ib
   m1=fk(ng,{k:v[i] for k,(t,v) in t1.items()})@nib
   d=np.einsum('vkc,k->vc',D[affected],w[i]);morphP=ph.copy();morphP[:,:3]+=d
   baseline=skinpos(m0,W[affected],ph);target=skinpos(m0,W[affected],morphP);actual=skinpos(m1,actualW[affected],ph)
   errors.extend(np.linalg.norm(actual-target,axis=1));magnitudes.extend(np.linalg.norm(target-baseline,axis=1))
  clips.append({'clip':new['name'],'samples':len(time),'maxPositionDifferenceFromMorph':float(max(errors)),'rmsPositionDifferenceFromMorph':float(np.sqrt(np.mean(np.square(errors)))),'morphCorrectionRMS':float(np.sqrt(np.mean(np.square(magnitudes))))})
 result={'version':'R36LF','sourceCommit':COMMIT,'sourceSha256':LOCK[size],'output':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size,'sourceBytes':src.stat().st_size,'triangles':2100,'vertices':2047,'originalBones':63,'bones':nj,'helperBones':nj-63,'morphTargets':0,'affectedVertexRecords':len(affected),'imagesUnchanged':11,'clipsPreserved':8,'maxInfluences':int(np.max(np.sum(actualW>1e-8,axis=1))),'designs':[{k:d[k] for k in ('label','selected','candidates','rows')} for d in designs],'clipComparison':clips,'engineApplied':False,'limitations':['Skeletal approximation of POSITION morphs only; original morph NORMAL/TANGENT corrections not reproduced.','Additional helper bones require engine skeleton and joint palette support; no 63/64-joint compatibility claim.','External animations need translation tracks or a runtime helper driver.','CPU skinning metrics, not rendered quality or engine verification.']}
 (out/f'R36LF_{size}_BUILD_REPORT.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
 if size==512:(out/'R36LF_HELPER_MAP.json').write_text(json.dumps({'version':'R36LF','sourceCommit':COMMIT,'helperJoints':new_joint_map,'driver':'Use original L/R knee angle to compute 45/90 weights; multiply restDelta vectors by weights and convert to parent bind local coordinates.'},indent=2)+'\n',encoding='utf8')
 print(json.dumps({**result,'designs':[{k:d[k] for k in ('label','selected','candidates')} for d in designs]},indent=2),flush=True)
if __name__=='__main__':
 for size in (512,1024):build(size)
