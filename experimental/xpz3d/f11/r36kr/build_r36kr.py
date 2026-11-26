#!/usr/bin/env python3
"""Build R36KR from authenticated R36KQ (1024/512), improving the hip-thigh transition.

Scope: leg primitives 10/11 upper boundary and immediate transition band only.
Rest topology unchanged; materials, images, UVs, indices and all protected parts retained.
Skin transition blends top-ring Hip/Thigh weights toward closest torso triangle.
The result is a separately versioned model, not the fully welded final mesh.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import hashlib
import json
import numpy as np
import trimesh
from glb_io_r36kj import glb_open, a_read, a_append, pack
from compact_gltf import compact

HASHES = {
    1024: '25950c044d6ee59a32552432be8cbf191fb0b5f3120ab032e3e9b54e0a8f87c4',
    512: 'bd67abee6c0220c6767b9af6071ebba612870f886bcf869973af574e4440f41f',
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unit(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def boundary_vertices(faces):
    edges={}
    for a,b,c in faces:
        for i,j in ((a,b),(b,c),(c,a)):
            e=tuple(sorted((int(i),int(j))))
            edges[e]=edges.get(e,0)+1
    return {i for e,v in edges.items() if v==1 for i in e}


def triangle_closest(point, faces, vertices):
    tri=vertices[faces]
    projected=trimesh.triangles.closest_point(tri,np.broadcast_to(point,(len(tri),3)).copy())
    distances=np.linalg.norm(projected-point,axis=1)
    index=int(distances.argmin())
    return projected[index],float(distances[index]),index


def triangle_barycentric(point, triangle):
    a,b,c=triangle
    v0=b-a;v1=c-a;v2=point-a
    d00=np.dot(v0,v0);d01=np.dot(v0,v1);d11=np.dot(v1,v1)
    d20=np.dot(v2,v0);d21=np.dot(v2,v1);den=d00*d11-d01*d01
    if abs(den)<1e-12:return np.array([1.,0.,0.])
    v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den
    return np.clip([1-v-w,v,w],0,1)/max(sum(np.clip([1-v-w,v,w],0,1)),1e-12)


def skin_weights_at_face(target, face, torso_pos, joints, weights):
    bary=triangle_barycentric(target,torso_pos[face]);d={}
    for l,i in enumerate(face):
        for j,w in zip(joints[i],weights[i]):
            d[int(j)]=d.get(int(j),0.)+float(bary[l]*w)
    return d


def top_anchors(positions,top_boundary,torso,faces,side):
    candidates=faces[(torso[faces][:,:,0].mean(axis=1)*side >.052)]
    anchors=[]
    for i in sorted(top_boundary):
        x,y,z=positions[i]
        if not (.951 < z < .974 and .074 < abs(x) < .181):continue
        projected,gap,k=triangle_closest(positions[i],candidates,torso)
        if not (.0025 < gap < .028):continue
        anchors.append((i,projected,gap,candidates[k]))
    return anchors


def build(size:int,folder:Path,outdir:Path,geom_step:float,weight_mix:float):
    source=folder/f'R36KQ_F11_HIP_TRANSITION_{size}_2100TRI.glb'
    raw,g,B=glb_open(source)
    if digest(raw)!=HASHES[size]:raise ValueError(f'R36KQ {size} SHA mismatch')
    p=g['meshes'][0]['primitives']
    torso=a_read(g,B,p[7]['attributes']['POSITION']).astype('float64')
    torso_j=a_read(g,B,p[7]['attributes']['JOINTS_0'])
    torso_w=a_read(g,B,p[7]['attributes']['WEIGHTS_0']).astype('float64')
    torso_n=a_read(g,B,p[7]['attributes']['NORMAL']).astype('float64')
    triangles=a_read(g,B,p[7]['indices']).astype(int).reshape(-1,3)
    permitted=np.all((torso[triangles][:,:,2]>.85)&(torso[triangles][:,:,2]<1.04),axis=1)
    triangles=triangles[permitted]
    pregeometry=[]
    for pi,side in ((10,-1),(11,1)):
        pr=p[pi];a=pr['attributes']
        P=a_read(g,B,a['POSITION']).astype('float64')
        N=a_read(g,B,a['NORMAL']).astype('float64')
        J=a_read(g,B,a['JOINTS_0']).astype('uint16')
        W=a_read(g,B,a['WEIGHTS_0']).astype('float64')
        idx=a_read(g,B,pr['indices']).reshape(-1,3).astype(int)
        boundary=boundary_vertices(idx)
        anchors=top_anchors(P,boundary,torso,triangles,side)
        new=P.copy();wt=W.copy();normals=N.copy()
        adjusted=[]
        for vid,target,gap,face in anchors:
            # Max 2.1mm more inward, but retain a residual safety gap.
            amount=min(geom_step, .28*max(0.,gap-.003))
            step=(target-P[vid])/gap*amount
            new[vid]+=step
            adjusted.append((vid,step,gap,face,target))
            # Same-joint Hip / Thigh interpolation: no newly added influences.
            surface=skin_weights_at_face(target,face,torso,torso_j,torso_w)
            value=np.array([surface.get(int(j),0.) for j in J[vid]],dtype='float64')
            if value.sum()>0.999-1e-4:
                blend=(1-weight_mix)*W[vid]+weight_mix*value
                wt[vid]=blend/max(blend.sum(),1e-9)
            # Blend geometry normals mildly toward the matching torso surface normal.
            bary=triangle_barycentric(target,torso[face])
            desired=unit(np.average(torso_n[face],axis=0,weights=bary))
            if np.dot(desired,N[vid])>.65:
                normals[vid]=unit(.84*N[vid]+.16*desired)
        # Distribute displacement to the immediate below-ring, not the knees or lower legs.
        for i in range(len(P)):
            if i in boundary or not .891 < P[i,2] < .95:continue
            if not adjusted:continue
            nearest=min(adjusted,key=lambda s:np.linalg.norm(P[i,:2]-P[s[0],:2]))
            delta2=np.linalg.norm(P[i,:2]-P[nearest[0],:2])
            if delta2>.042:continue
            decay=.26*np.exp(-((P[i,2]-.918)/.029)**2)*np.exp(-(delta2/.046)**2)
            new[i]+=decay*nearest[1]
            # Smooth joint weights using matching ring value to prevent sharp LBS changes.
            tw=(1-.22*decay)*W[i]+(.22*decay)*wt[nearest[0]]
            if np.array_equal(J[i],J[nearest[0]]):wt[i]=tw/max(tw.sum(),1e-9)
        # Keep UV-wrap split vertices welded visually (not topological welding).
        pairs=((20,92),(30,93),(40,94))
        for left,right in pairs:
            new[right]=new[left];wt[right]=wt[left];normals[right]=normals[left]
        max_move=float(np.linalg.norm(new-P,axis=1).max())
        if max_move>geom_step+1e-5:raise ValueError('displacement budget exceeded')
        # Restrict changes to the exact upper transition band; below-ring untouched.
        move_counts=int((np.linalg.norm(new-P,axis=1)>1e-8).sum())
        after=[triangle_closest(new[v],triangles[(torso[triangles][:,:,0].mean(axis=1)*side>.052)],torso)[1] for v,_,_,_,_ in adjusted]
        report={'primitive':pi,'anchorVertices':len(adjusted),'changedPositions':move_counts,
                'changedWeights':int((np.linalg.norm(wt-W,axis=1)>1e-6).sum()),
                'meanGapBefore':float(np.mean([x[2] for x in adjusted])) if adjusted else None,
                'meanGapAfter':float(np.mean(after)) if adjusted else None,
                'maxMove':max_move,'anchorIndices':[int(x[0]) for x in adjusted]}
        pregeometry.append(report)
        for key,arr,type_,ctype in (('POSITION',new,'VEC3',5126),('NORMAL',normals,'VEC3',5126),('WEIGHTS_0',wt,'VEC4',5126)):
            if key=='WEIGHTS_0' and not report['changedWeights']:continue
            pr['attributes'][key]=a_append(g,B,arr.astype('<f4'),type_,ctype,34962)
    g['asset']['generator']='XPZ3D R36KR source-locked R36KQ hip transition / compact'
    g['extras']={**g.get('extras',{}),'revision':'R36KR','sourceSha256':HASHES[size],
                 'changes':'upper-thigh rim + controlled second-ring + small weight/normal match; no texture edits'}
    gg,bb,compaction=compact(g,B)
    outdir.mkdir(parents=True,exist_ok=True)
    output=outdir/f'R36KR_F11_POSE_AWARE_HIP_{size}_2100TRI.glb'
    data=pack(gg,bb)
    output.write_bytes(data)
    _,check,bc=glb_open(output)
    _,orig,bo=glb_open(source)
    assert len(check['skins'][0]['joints'])==63
    assert sum(check['accessors'][x['indices']]['count']//3 for x in check['meshes'][0]['primitives'])==2100
    assert orig['materials'] == check['materials']
    assert orig['textures'] == check['textures']
    def image_bytes(meta,buff,i):
        bv=meta['bufferViews'][meta['images'][i]['bufferView']]
        start=bv.get('byteOffset',0)
        return bytes(buff[start:start+bv['byteLength']])
    assert len(orig['images'])==len(check['images'])
    for i in range(len(orig['images'])):
        assert image_bytes(orig,bo,i)==image_bytes(check,bc,i), ('image changed',i)
    for pi in range(len(orig['meshes'][0]['primitives'])):
        initial=orig['meshes'][0]['primitives'][pi]
        final=check['meshes'][0]['primitives'][pi]
        assert np.array_equal(a_read(orig,bo,initial['indices']),a_read(check,bc,final['indices']))
        for attr in initial['attributes']:
            if pi in (10,11) and attr in ('POSITION','NORMAL','WEIGHTS_0'): continue
            assert np.array_equal(a_read(orig,bo,initial['attributes'][attr]),a_read(check,bc,final['attributes'][attr])), (pi,attr)
    report={'version':'R36KR','source':source.name,'sourceSha256':HASHES[size],
            'output':output.name,'sha256':digest(data),'bytes':len(data),
            'triangles':2100,'bones':63,'changes':pregeometry,
            'compaction':compaction,'geometryRestOnly':True,
            'gameEngineApplied':False,'textureDesign':'unchanged from R36KQ/R36KP',
            'incomplete':['not a topology weld','in-engine capture pending','dynamic pose comparison pending']}
    (outdir/f'R36KR_{size}_BUILD_REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return output


def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--input-dir',type=Path,default=None)
    a.add_argument('--output-dir',type=Path,default=Path(__file__).parent/'output')
    a.add_argument('--max-step',type=float,default=.0021)
    a.add_argument('--weight-mix',type=float,default=.22)
    args=a.parse_args()
    source=args.input_dir
    if source is None:
        local=Path(__file__).parent/'source'
        source=local if (local/'R36KQ_F11_HIP_TRANSITION_1024_2100TRI.glb').is_file() else Path(__file__).parent.parent/'r36kq'
    for size in (1024,512):build(size,source,args.output_dir,args.max_step,args.weight_mix)
if __name__=='__main__':main()
