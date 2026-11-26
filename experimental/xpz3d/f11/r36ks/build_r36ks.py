#!/usr/bin/env python3
"""R36KS: multi-pose proximal-thigh seam optimization from exact R36KR GLBs.

Produces both 1024 and 512 self-contained game-character GLBs, 2,100 triangles,
63 bones. Only leg primitives 10/11 are edited (POSITION/NORMAL/WEIGHTS_0).
Protected head/hair/hands/torso, UV, material parameters, textures, indices,
JOINTS_0 and inverse bind matrices are untouched. No topology weld is claimed.

Optimization uses the authored glTF skin matrices, not the S2/S3 game runtime.
"""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np
import trimesh
from scipy.optimize import least_squares
from glb_io_r36kj import glb_open, a_read, a_append, pack
from compact_gltf import compact
from render_r36ks import skin

SRC_SHA = {
 1024:'1524a18298659f43f25464b94931a3127bdcde9ae8f70062c4e8877971b2935b',
 512:'43ed7b3dcdbf3f12c3d1608fbce71888eff99a1efd99924ce49f7c6b4c085198',
}
ANGLES = (-32,-24,-16,-8,0,8,16,24,32)
ANCHORS = {10: (42,43,44,46,47,48), 11:(41,42,43,47,48,49)}
DELTA_BOUND = .00215
WEIGHT_BOUND = .050
MIN_GAP = .00165

def sha(data): return hashlib.sha256(data).hexdigest()
def norm(p): return p/max(np.linalg.norm(p),1e-12)

def l_bs(points, joints, weights, matrices):
    hv=np.column_stack([points,np.ones(len(points))]);out=np.zeros((len(points),3),dtype=np.float64)
    for k in range(4):
        out += np.einsum('nij,nj->ni',matrices[joints[:,k],:3,:],hv)*weights[:,k,None]
    return out

def joint_total(joint_ids, w):
    d={}
    for j,x in zip(joint_ids,w):d[int(j)]=d.get(int(j),0.)+float(x)
    return d

def tri_nearest(pt, faces):
    near=trimesh.triangles.closest_point(faces,np.broadcast_to(pt,(len(faces),3)).copy())
    d=np.linalg.norm(near-pt,axis=1);i=int(d.argmin())
    return near[i],float(d[i]),i

def unpack_skin(g,B,pi):
    p=g['meshes'][0]['primitives'][pi];a=p['attributes']
    return {
        'position':a_read(g,B,a['POSITION']).astype('float64'),
        'normal':a_read(g,B,a['NORMAL']).astype('float64'),
        'joint':a_read(g,B,a['JOINTS_0']).astype('int32'),
        'weight':a_read(g,B,a['WEIGHTS_0']).astype('float64'),
        'faces':a_read(g,B,p['indices']).reshape(-1,3).astype(int),
    }

def make_torso_faces(g,B,mats):
    t=unpack_skin(g,B,7)
    mask=np.all((t['position'][t['faces']][:,:,2]>.85)&(t['position'][t['faces']][:,:,2]<1.04),axis=1)
    positions=np.array([l_bs(t['position'],t['joint'],t['weight'],M) for M in mats],dtype=np.float64)
    per_side={}
    for side in (-1,1):
        keep=mask & (t['position'][t['faces']][:,:,0].mean(axis=1)*side>.052)
        indices=t['faces'][keep]
        per_side[side]=[pos[indices] for pos in positions]
    return per_side

def pose_matrices(g,B):
    return [skin(g,B,degrees=0,spread=angle).astype('float64') for angle in ANGLES]

def postprocess_normals(positions, normals, faces, changes, protected):
    # Rebuild geometric normals only in the transition ring; interpolate with the
    # original authored normals to avoid a shading discontinuity at the boundary.
    face_vec=np.cross(positions[faces[:,1]]-positions[faces[:,0]], positions[faces[:,2]]-positions[faces[:,0]])
    accum=np.zeros_like(positions)
    for col in range(3):np.add.at(accum,faces[:,col],face_vec)
    unit=accum/np.maximum(np.linalg.norm(accum,axis=1,keepdims=True),1e-12)
    result=normals.copy()
    for i in changes:
        if i in protected:continue
        if np.dot(unit[i],normals[i])>.65:
            result[i]=norm(.83*normals[i]+.17*unit[i])
    return result

def optimize_one(P,J,W,triangles,mats,idx,leg_joint):
    # A top-ring vertex has only 2 unique influencing joints, even when Hip is
    # repeated across multiple channels. Optimization uses effective totals.
    old=dict(joint_total(J[idx],W[idx]))
    if set(old)-{0,leg_joint} or leg_joint not in old:raise ValueError('Unexpected anchor joints')
    w_leg=old[leg_joint]
    pose0=[];targets=[];gaps=[];directions=[]
    for matrix,tri in zip(mats,triangles):
        mat_hip=matrix[0];mat_leg=matrix[leg_joint];hv=np.r_[P[idx],1]
        start=(1-w_leg)*(mat_hip[:3]@hv)+w_leg*(mat_leg[:3]@hv)
        closest,gap,_=tri_nearest(start,tri)
        direction=norm(start-closest)
        desired=closest+direction*min(.00215,max(MIN_GAP,gap*.48))
        pose0.append(start);targets.append(desired);gaps.append(gap);directions.append(direction)
    targets=np.array(targets);pose0=np.array(pose0)
    def forward(v):
        dr=v[:3];new_w=w_leg+v[3];hv=np.r_[P[idx]+dr,1]
        return np.array([(1-new_w)*(m[0,:3,:]@hv)+new_w*(m[leg_joint,:3,:]@hv) for m in mats])
    def residual(v):
        xyz=(forward(v)-targets).ravel()
        # Constrain excessive vertex displacement and thigh weight drift.
        return np.r_[xyz*.95, v[:3]*1.5, v[3]*.055]
    low=np.r_[np.full(3,-DELTA_BOUND),-WEIGHT_BOUND]
    high=np.r_[np.full(3,DELTA_BOUND),WEIGHT_BOUND]
    result=least_squares(residual,np.zeros(4),bounds=(low,high),max_nfev=64,ftol=1e-12,gtol=1e-12,xtol=1e-12)
    delta=result.x[:3];dw=float(result.x[3]);
    dlength=np.linalg.norm(delta)
    if dlength>DELTA_BOUND:delta*=DELTA_BOUND/dlength
    optimized=forward(np.r_[delta,dw]);
    signed=[float(np.dot(x-y,d)) for x,y,d in zip(optimized,targets,directions)]
    # If pose target direction reverses significantly, reject that pose-driven
    # projection altogether (do not risk pulling the limb through the torso).
    if min(signed)<-.003:
        return np.zeros(3),0.0,{'rejected':'projection reversed','meanGapBefore':np.mean(gaps)}
    return delta,dw,{'meanGapBefore':float(np.mean(gaps)),'maxGapBefore':float(max(gaps)),
        'deltaRest':delta.tolist(),'deltaThighWeight':dw,'iterations':result.nfev}

def pose_gap_stats(data,pi,torso_faces,mats,selected):
    xyz=data['position'];J=data['joint'];W=data['weight'];side=-1 if pi==10 else 1
    ret=[]
    for angle,M,tri in zip(ANGLES,mats,torso_faces[side]):
        pose=l_bs(xyz,J,W,M)
        gaps=np.array([tri_nearest(pose[i],tri)[1] for i in selected])
        ret.append({'spreadDegrees':angle,'primitive':pi,'meanGap':float(gaps.mean()),'maxGap':float(gaps.max()),'rmsGap':float(np.sqrt(np.mean(gaps*gaps)))})
    return ret

def build(size,srcdir,outdir,max_step=DELTA_BOUND):
    original=srcdir/f'R36KR_F11_POSE_AWARE_HIP_{size}_2100TRI.glb'
    raw,g,B=glb_open(original)
    if sha(raw)!=SRC_SHA[size]:raise RuntimeError('R36KR binary SHA-256 mismatch; refusing to modify unknown source')
    mats=pose_matrices(g,B);torso_faces=make_torso_faces(g,B,mats)
    modified=[];report={'version':'R36KS','source':original.name,'sourceSha256':sha(raw),
      'simulation':'authored glTF LBS; NOT S2/S3 engine execution',
      'anglesDegrees':list(ANGLES),'poseBySide':[],'perLeg':[],
      'protectedPrimitives':list(range(10)),'changedPrimitives':[10,11],
      'noTopologyWeld':True,'originalSkinColorPreserved':True,
      'limits':{'maxAdditionalDisplacement':max_step,'maxThighWeightChange':WEIGHT_BOUND}}
    prims=g['meshes'][0]['primitives']
    for pi,leg_joint in ((10,3),(11,2)):
        data=unpack_skin(g,B,pi)
        P=data['position'];N=data['normal'];J=data['joint'];W=data['weight'];selected=ANCHORS[pi]
        before=pose_gap_stats(data,pi,torso_faces,mats,selected)
        final=P.copy();newW=W.copy();changes=[]
        for i in selected:
            delta,dw,stat=optimize_one(P,J,W,torso_faces[-1 if pi==10 else 1],mats,i,leg_joint)
            final[i]=P[i]+delta
            old=joint_total(J[i],W[i]);w_leg=old[leg_joint]
            new_leg=max(0,min(1,w_leg+dw));
            newW[i]=[1-new_leg,new_leg,0,0]
            changes.append({'i':i,**stat})
        # Blend motion into the next proximal thigh ring so the optimized upper
        # ring does not produce a sharp edge under joint rotation.
        followers=[]
        for i in range(len(P)):
            if not (.89<P[i,2]<.948):continue
            near=min(selected,key=lambda j:np.linalg.norm(P[i,:2]-P[j,:2]))
            xy=float(np.linalg.norm(P[i,:2]-P[near,:2]))
            if xy>.041:continue
            alpha=.22*np.exp(-((P[i,2]-.921)/.035)**2)*np.exp(-(xy/.044)**2)
            delta=final[near]-P[near]
            final[i]+=alpha*delta
            # Smooth the Hip/Thigh weight ratio only if the same two active bones.
            influences=joint_total(J[i],W[i]);target_leg=joint_total(J[near],newW[near])
            if set(influences)-{0,leg_joint} or leg_joint not in influences:continue
            t=0.35*alpha
            w_leg=(1-t)*influences[leg_joint]+t*target_leg[leg_joint]
            newW[i]=[1-w_leg,w_leg,0,0]
            followers.append(i)
        # Coordinate-identical UV wrap splits require identical skinning + normal.
        stitched=[]
        for a,b in ((20,92),(30,93),(40,94)):
            if np.linalg.norm(P[a]-P[b])>.00001:raise RuntimeError('Lost UV split coincidence')
            final[b]=final[a];newW[b]=newW[a]
            stitched.extend([a,b])
        # Fold repeated Hip IDs into a single influence on proximal vertices.
        canonicalized=[]
        for i in range(len(P)):
            if P[i,2]<.85:continue
            influences=joint_total(J[i],newW[i])
            if set(influences)-{0,leg_joint} or leg_joint not in influences:continue
            newvals=np.array([influences[0],influences[leg_joint],0.,0.])
            newvals/=newvals.sum()
            if np.linalg.norm(newvals-newW[i])>1e-8:
                newW[i]=newvals;canonicalized.append(i)
        normalChanges=set(selected)|set(followers)
        newN=postprocess_normals(final,N,data['faces'],normalChanges,set(stitched))
        # Same split normal for UV wrap pairs, always authored from the first.
        for a,b in ((20,92),(30,93),(40,94)):newN[b]=newN[a]
        if max(np.linalg.norm(final-P,axis=1))>max_step+1e-6:raise ValueError('Position budget exceeded')
        data.update(position=final,weight=newW,normal=newN)
        after=pose_gap_stats(data,pi,torso_faces,mats,selected)
        report['poseBySide'].append({'primitive':pi,'before':before,'after':after})
        report['perLeg'].append({'primitive':pi,'seedVertices':list(selected),'optimized':changes,
         'followRingCount':len(followers),'canonicalizedDuplicateWeightCount':len(canonicalized),
         'changedPositionCount':int((np.linalg.norm(final-P,axis=1)>1e-8).sum()),
         'changedWeightCount':int((np.linalg.norm(newW-W,axis=1)>1e-8).sum()),
         'maxPositionChange':float(np.linalg.norm(final-P,axis=1).max()),
         'beforeMeanNinePose':float(np.mean([s['meanGap'] for s in before])),
         'afterMeanNinePose':float(np.mean([s['meanGap'] for s in after]))})
        a=prims[pi]['attributes']
        for attr,values in [('POSITION',final),('NORMAL',newN),('WEIGHTS_0',newW)]:
            a[attr]=a_append(g,B,np.asarray(values,dtype='<f4'),'VEC4' if attr=='WEIGHTS_0' else 'VEC3',5126,34962)
    g['asset']['generator']='XPZ3D R36KS 9-pose anchored thigh transition optimizer'
    g['extras']={**g.get('extras',{}),'revision':'R36KS','sourceSha256':SRC_SHA[size],
     'changes':'nine-angle proximal thigh seam fit; canonical Hip/Thigh weights; same skin PBR'}
    gg,bb,compaction=compact(g,B)
    outdir.mkdir(parents=True,exist_ok=True)
    output=outdir/f'R36KS_F11_MULTI_POSE_HIP_{size}_2100TRI.glb'
    rawout=pack(gg,bb);output.write_bytes(rawout)
    report.update(output=output.name,sha256=sha(rawout),bytes=len(rawout),compaction=compaction,
      triangles=sum(gg['accessors'][p['indices']]['count']//3 for p in gg['meshes'][0]['primitives']),
      bones=len(gg['skins'][0]['joints']))
    # Auditing is limited: prove protected binary attributes/materials/image pixels
    _,check,bo=glb_open(output);_,source,bs=glb_open(original)
    assert check['materials']==source['materials'] and check['textures']==source['textures']
    assert gg['skins']==source['skins'] and gg['nodes']==source['nodes']
    for im in range(len(source['images'])):
        def img_bytes(g,B,i):
            bv=g['bufferViews'][g['images'][i]['bufferView']];start=bv.get('byteOffset',0)
            return bytes(B[start:start+bv['byteLength']])
        assert img_bytes(source,bs,im)==img_bytes(check,bo,im)
    for pi in range(len(source['meshes'][0]['primitives'])):
        was=source['meshes'][0]['primitives'][pi];now=check['meshes'][0]['primitives'][pi]
        assert np.array_equal(a_read(source,bs,was['indices']),a_read(check,bo,now['indices']))
        for key in was['attributes']:
            if pi in (10,11) and key in ('POSITION','NORMAL','WEIGHTS_0'):continue
            assert np.array_equal(a_read(source,bs,was['attributes'][key]),a_read(check,bo,now['attributes'][key])), (pi,key)
    assert report['triangles']==2100 and report['bones']==63
    report['protectedAndMaterialProof']='PASS: data-identical except proximal leg POSITION, NORMAL, WEIGHTS_0'
    (outdir/f'R36KS_{size}_BUILD_REPORT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print('PRODUCED',output,output.stat().st_size)
    for leg in report['perLeg']:
        print('SIDE',leg['primitive'],'nine-angle mean',round(leg['beforeMeanNinePose'],6),'->',round(leg['afterMeanNinePose'],6),'changed',leg['changedPositionCount'],leg['changedWeightCount'])
    return output

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,default=Path(__file__).resolve().parent.parent/'r36kr')
    parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parent/'output')
    args=parser.parse_args()
    for size in (1024,512):build(size,args.source_dir,args.output_dir)
if __name__=='__main__':main()
