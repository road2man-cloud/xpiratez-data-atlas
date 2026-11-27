#!/usr/bin/env python3
"""R36KV: shared UV charts + indexed tangent frames for R36KU material detail.

No position, normal, skin weight, bone, base color or silhouette edits. The same
R36KU analytic skin field is rebaked, not reconstructed from a high-poly donor.
Old R36KS topology is used solely as the unexpanded attribute reference.
"""
from __future__ import annotations
import argparse,copy,hashlib,io,json,sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
ROOT=Path(__file__).resolve().parent
sys.path[:0]=[str(ROOT/'python_deps'),str(ROOT/'source')]
import xatlas
from glb_io_r36kj import glb_open,a_read,a_append,image_append,pack
from compact_gltf import compact
from build_r36ku import surface_field,unit,png,image_bytes,read_primitive
LOCK={1024:'03bc2a0830178dbaec1482500909f8be7d8ca3fbf061f9931696d367ba0fd99e',512:'84496d92a60e0d7dba46639c3d1b6c9dc53a0f2086257c6d4a20e27953f39110'}
KS_LOCK={1024:'ea8d7caeb39bb69f564300fcf43e747978504deafee2537feaff0cb778943411',512:'b13b059cc7b1c01e3a84d840c059fadc4934605e846cab1c3fb98e345548cf85'}
PARTS=(0,2,4)

def digest(b):return hashlib.sha256(b).hexdigest()

def indexed_tangents(position,normal,uv,faces):
    """Angle-weighted, explicit glTF tangents. Split only opposite handedness.

    This is not a claim of MikkTSpace equivalence. Normals are rebaked in these
    exact frames; supplied tangents are part of the exported contract.
    """
    p=np.asarray(position,float);n=unit(np.asarray(normal,float));uv=np.asarray(uv,float)
    pp=p[faces];tt=uv[faces];e1=pp[:,1]-pp[:,0];e2=pp[:,2]-pp[:,0]
    d1=tt[:,1]-tt[:,0];d2=tt[:,2]-tt[:,0];det=d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0]
    valid=np.abs(det)>1e-12
    T=np.zeros_like(e1);B=np.zeros_like(e1)
    T[valid]=(e1[valid]*d2[valid,1,None]-e2[valid]*d1[valid,1,None])/det[valid,None]
    B[valid]=(e2[valid]*d1[valid,0,None]-e1[valid]*d2[valid,0,None])/det[valid,None]
    T[~valid]=e1[~valid];B[~valid]=e2[~valid]
    means=unit(n[faces].sum(axis=1))
    sign=np.where(np.sum(np.cross(means,T)*B,axis=1)<0,-1.,1.)
    lookup={};mapping=[];newfaces=np.empty_like(faces)
    for fi,f in enumerate(faces):
        for j,vi in enumerate(f):
            key=(int(vi),int(sign[fi]))
            if key not in lookup:lookup[key]=len(mapping);mapping.append(int(vi))
            newfaces[fi,j]=lookup[key]
    mapping=np.array(mapping,dtype=int);acc=np.zeros((len(mapping),3));bacc=np.zeros_like(acc)
    for j in range(3):
        v1=unit(pp[:,(j+1)%3]-pp[:,j]);v2=unit(pp[:,(j+2)%3]-pp[:,j])
        angle=np.arccos(np.clip(np.sum(v1*v2,axis=1),-1,1))
        np.add.at(acc,newfaces[:,j],unit(T)*angle[:,None]);np.add.at(bacc,newfaces[:,j],unit(B)*angle[:,None])
    nn=n[mapping];acc-=nn*np.sum(acc*nn,axis=1,keepdims=True)
    bad=np.linalg.norm(acc,axis=1)<1e-9
    if bad.any():acc[bad]=np.cross(np.eye(3)[np.argmin(np.abs(nn[bad]),axis=1)],nn[bad])
    tangent=unit(acc);hand=np.where(np.sum(np.cross(nn,tangent)*bacc,axis=1)<0,-1.,1.)
    return mapping,newfaces,np.c_[tangent,hand].astype('<f4'),int((~valid).sum())

def replace_attributes(g,b,source,bs,pi,mapping,faces,uv=None,uv_key=None,tangent=None):
    src=source['meshes'][0]['primitives'][pi];dest=g['meshes'][0]['primitives'][pi];attrs={}
    for key,ai in src['attributes'].items():
        ac=source['accessors'][ai];arr=a_read(source,bs,ai)[mapping]
        ni=a_append(g,b,arr,ac['type'],ac['componentType'],34962)
        if 'normalized' in ac:g['accessors'][ni]['normalized']=ac['normalized']
        attrs[key]=ni
    if uv is not None:attrs[uv_key]=a_append(g,b,np.asarray(uv,dtype='<f4'),'VEC2',5126,34962)
    if tangent is not None:attrs['TANGENT']=a_append(g,b,tangent,'VEC4',5126,34962)
    dest['attributes']=attrs
    ct=5123 if len(mapping)<65536 else 5125
    dest['indices']=a_append(g,b,faces.reshape(-1,1),'SCALAR',ct,34963)
    dest['extras']={**dest.get('extras',{}),'R36KV':{'sharedUV':uv_key,'sourceTriangleCornerAttributesPreserved':True,'explicitIndexedTangents':True,'vertexCount':len(mapping)}}

def chart_meshes(ks,bks,size):
    atlas=xatlas.Atlas();raw=[]
    for pi in PARTS:
        a,f=read_primitive(ks,bks,pi);raw.append((a,f))
        atlas.add_mesh(a['POSITION'].astype('float32'),f.astype('uint32'),a['NORMAL'].astype('float32'))
    chart=xatlas.ChartOptions();chart.normal_seam_weight=4.;chart.max_iterations=2
    packing=xatlas.PackOptions();packing.resolution=size;packing.padding=8 if size==1024 else 4
    packing.bilinear=True;packing.rotate_charts=True
    atlas.generate(chart,packing,False)
    if atlas.atlas_count!=1:raise ValueError('Multiple atlas pages not supported')
    result=[]
    for i,(pi,(a,f)) in enumerate(zip(PARTS,raw)):
        vm,ind,uv=atlas[i];vm=np.asarray(vm,int);ind=np.asarray(ind,int);uv=np.asarray(uv,float)
        if not np.array_equal(vm[ind],f):raise ValueError('Atlas changed face correspondence')
        chart_ids=np.full(len(f),-1,dtype=int)
        count=atlas.get_mesh_chart_count(i)
        for ci in range(count):chart_ids[np.asarray(atlas.get_mesh_chart(i,ci).faces,int)]=ci
        if np.any(chart_ids<0):raise ValueError('Unassigned UV face')
        split,ind,tangent,degenerate=indexed_tangents(a['POSITION'][vm],a['NORMAL'][vm],uv,ind)
        result.append({'primitive':pi,'mapping':vm[split],'faces':ind,'uv':uv[split],'tangent':tangent,'charts':chart_ids,'chartCount':count,'degenerateUVFaces':degenerate})
    return result,{'atlasCount':atlas.atlas_count,'charts':atlas.chart_count,'packedWidth':atlas.width,'packedHeight':atlas.height,'paddingRequested':packing.padding,'targetResolution':size,'xatlas':'0.0.11'}

def bake_shared(ks,bks,meshes,size,out):
    target_size=size
    supersampling=2 if size==512 else 1
    size*=supersampling
    normal=np.full((size,size,3),[128,128,255],dtype=np.uint8)
    mr=np.full((size,size,3),[255,230,0],dtype=np.uint8);mask=np.zeros((size,size),bool)
    stats=[];angle_sum=0.;angle_max=0.;pixels=0;overlap=0
    for mesh in meshes:
        pi=mesh['primitive'];a,_=read_primitive(ks,bks,pi);mp=mesh['mapping'];f=mesh['faces'];uv=mesh['uv']
        pos=a['POSITION'][mp].astype(float);nor=unit(a['NORMAL'][mp].astype(float));tan=mesh['tangent'].astype(float)
        # One filtering footprint per chart: adjacent faces do not change the field's bandwidth.
        footprints=[]
        for face in f:
            p=pos[face];q=uv[face]*target_size;duv=np.stack([q[1]-q[0],q[2]-q[0]],axis=1)
            if abs(np.linalg.det(duv))<1e-10:footprints.append(0.);continue
            jac=np.stack([p[1]-p[0],p[2]-p[0]],axis=1)@np.linalg.inv(duv)
            footprints.append(float(np.linalg.svd(jac,compute_uv=False)[0]))
        footprints=np.asarray(footprints)
        chart_fp={c:float(np.percentile(footprints[mesh['charts']==c],90)) for c in range(mesh['chartCount'])}
        used=0;missed=0
        for fi,face in enumerate(f):
            q=uv[face]*size
            x0=max(0,int(np.floor(q[:,0].min()-.5)));x1=min(size,int(np.ceil(q[:,0].max()+.5)))
            y0=max(0,int(np.floor(q[:,1].min()-.5)));y1=min(size,int(np.ceil(q[:,1].max()+.5)))
            e1=q[1]-q[0];e2=q[2]-q[0];den=e1[0]*e2[1]-e1[1]*e2[0]
            if abs(den)<1e-10 or x1<=x0 or y1<=y0:missed+=1;continue
            yy,xx=np.mgrid[y0:y1,x0:x1];xx=xx+.5-q[0,0];yy=yy+.5-q[0,1]
            u=(xx*e2[1]-yy*e2[0])/den;v=(e1[0]*yy-e1[1]*xx)/den;w=1-u-v
            inside=(u>=-1e-8)&(v>=-1e-8)&(w>=-1e-8)
            if not inside.any():missed+=1;continue
            bary=np.stack([w[inside],u[inside],v[inside]],axis=1)
            p=bary@pos[face];n=unit(bary@nor[face]);t=bary@tan[face,:3];t=unit(t-n*np.sum(t*n,axis=1,keepdims=True))
            handed=np.where(bary@tan[face,3]<0,-1.,1.);bit=unit(np.cross(n,t))*handed[:,None]
            target,rough=surface_field(p,n,chart_fp[int(mesh['charts'][fi])],pi)
            mapped=unit(np.stack([np.sum(target*t,axis=1),np.sum(target*bit,axis=1),np.sum(target*n,axis=1)],axis=1))
            patch=normal[y0:y1,x0:x1];patch[inside]=np.clip(np.rint((mapped+1)*127.5),0,255).astype(np.uint8)
            mr[y0:y1,x0:x1,1][inside]=np.rint(rough*255).astype(np.uint8)
            block=mask[y0:y1,x0:x1];overlap+=int((block&inside).sum());block[inside]=True
            angles=np.degrees(np.arccos(np.clip(mapped[:,2],-1,1)));angle_sum+=angles.sum();angle_max=max(angle_max,float(angles.max()));pixels+=len(angles);used+=len(angles)
        stats.append({'primitive':pi,'sourceVertices':len(a['POSITION']),'outputVertices':len(mp),'triangles':len(f),'charts':mesh['chartCount'],'coveredTexels':used,'subpixelFaces':missed,'degenerateUVFaces':mesh['degenerateUVFaces'],'chartFootprintMin':min(chart_fp.values()),'chartFootprintMax':max(chart_fp.values())})
    if not mask.any():raise ValueError('Empty atlas')
    # Fill all unoccupied texels from the nearest covered sample, preserving actual
    # surface texels. The packed chart separation remains the mip-bleed limit.
    nearest=distance_transform_edt(~mask,return_distances=False,return_indices=True)
    normal[~mask]=normal[nearest[0][~mask],nearest[1][~mask]];mr[~mask]=mr[nearest[0][~mask],nearest[1][~mask]]
    if supersampling>1:
        # Integrate tiny triangles before reduction; normalize averaged normals.
        s=supersampling;t=target_size
        nv=(normal.astype(float)/127.5-1).reshape(t,s,t,s,3).mean(axis=(1,3))
        normal=np.clip(np.rint((unit(nv)+1)*127.5),0,255).astype(np.uint8)
        mr=np.rint(mr.reshape(t,s,t,s,3).mean(axis=(1,3))).astype(np.uint8)
        mask=mask.reshape(t,s,t,s).any(axis=(1,3))
    nbytes=png(normal);mbytes=png(mr)
    (out/f'R36KV_SKIN_NORMAL_{target_size}.png').write_bytes(nbytes);(out/f'R36KV_SKIN_MR_{target_size}.png').write_bytes(mbytes)
    Image.fromarray((mask*255).astype(np.uint8)).save(out/f'R36KV_UV_COVERAGE_{target_size}.png')
    return nbytes,mbytes,{'parts':stats,'coverageFraction':float(mask.mean()),'sampledTexels':pixels,'supersampling':supersampling,'sharedEdgeOrOverlapTexels':overlap,'maxNormalAngleDegrees':angle_max,'meanNormalAngleDegrees':float(angle_sum/max(pixels,1))}

def verify(ks_path,ku_path,result):
    _,ks,bks=glb_open(ks_path);_,ku,bku=glb_open(ku_path);raw,g,b=glb_open(result)
    for key in ('nodes','scenes','scene','animations'):assert ks.get(key)==g.get(key),key
    for s,t in zip(ks['skins'],g['skins']):
        assert {k:v for k,v in s.items() if k!='inverseBindMatrices'}=={k:v for k,v in t.items() if k!='inverseBindMatrices'}
        assert np.array_equal(a_read(ks,bks,s['inverseBindMatrices']),a_read(g,b,t['inverseBindMatrices']))
    for pi in range(len(ks['meshes'][0]['primitives'])):
        a,ff=read_primitive(ks,bks,pi);aa,f=read_primitive(g,b,pi)
        assert len(ff)==len(f)
        for key in a:assert np.array_equal(a[key][ff],aa[key][f]),(pi,key)
        if 'TANGENT' in aa:
            tang=aa['TANGENT'];assert np.isfinite(tang).all()
            assert np.max(np.abs(np.linalg.norm(tang[:,:3],axis=1)-1))<1e-5
            assert np.max(np.abs(np.sum(unit(aa['NORMAL'])*tang[:,:3],axis=1)))<1e-5
    # Retain all old images except the two rebaked, atlas-dependent skin maps.
    old_skin_tex={ku['materials'][4]['normalTexture']['index'],ku['materials'][4]['pbrMetallicRoughness']['metallicRoughnessTexture']['index']}
    replace_images={ku['textures'][i]['source'] for i in old_skin_tex}
    preserved=[]
    for i in range(len(ku['images'])):
        if i not in replace_images:assert image_bytes(ku,bku,i)==image_bytes(g,b,i);preserved.append(i)
    assert ku['materials']==g['materials'],'Material controls/color/links changed'
    for pi in (3,5,6,7,8,9,10,11):
        a,ff=read_primitive(ku,bku,pi);aa,f=read_primitive(g,b,pi)
        assert np.array_equal(ff,f)
        assert all(np.array_equal(a[k],aa[k]) for k in a)
    def counts(d,bb):
        ps=d['meshes'][0]['primitives'];verts=sum(d['accessors'][p['attributes']['POSITION']]['count'] for p in ps)
        geom=sum(a_read(d,bb,i).nbytes for p in ps for i in list(p['attributes'].values())+[p['indices']])
        return verts,geom
    before,geom_before=counts(ku,bku);after,geom_after=counts(g,b)
    tri=sum(g['accessors'][p['indices']]['count']//3 for p in g['meshes'][0]['primitives'])
    assert tri==2100 and len(g['skins'][0]['joints'])==63
    assert after<before,'Vertex reduction failed'
    return {'triangles':tri,'bones':63,'verticesBefore':before,'verticesAfter':after,'vertexReductionPercent':100*(1-after/before),'geometryAttributeAndIndexBytesBefore':geom_before,'geometryAttributeAndIndexBytesAfter':geom_after,'sourceGLBBytes':ku_path.stat().st_size,'bytes':len(raw),'sha256':digest(raw),'unchangedImageIndices':preserved,'originalCornerAttributesPreserved':True,'allMaterialsUnchanged':True,'engineApplied':False,'highPolyRecoveryClaimed':False}

def build(size):
    ks_path=ROOT/'source/output'/f'R36KS_F11_MULTI_POSE_HIP_{size}_2100TRI.glb';ku_path=ROOT/'input'/f'R36KU_F11_BALANCED_DETAIL_{size}_2100TRI.glb'
    rks,ks,bks=glb_open(ks_path);rku,g,b=glb_open(ku_path)
    if digest(rks)!=KS_LOCK[size] or digest(rku)!=LOCK[size]:raise ValueError('Input SHA-256 mismatch')
    out=ROOT/'output';out.mkdir(exist_ok=True)
    meshes,atlas=chart_meshes(ks,bks,size)
    nbytes,mbytes,bake=bake_shared(ks,bks,meshes,size,out)
    for mesh in meshes:
        pi=mesh['primitive'];attrs,_=read_primitive(ks,bks,pi);key='TEXCOORD_1' if 'TEXCOORD_0' in attrs else 'TEXCOORD_0'
        replace_attributes(g,b,ks,bks,pi,mesh['mapping'],mesh['faces'],mesh['uv'],key,mesh['tangent'])
    mat=g['materials'][4]
    for data,tex,name in [(nbytes,mat['normalTexture']['index'],f'R36KV_SKIN_NORMAL_{size}'),(mbytes,mat['pbrMetallicRoughness']['metallicRoughnessTexture']['index'],f'R36KV_SKIN_MR_{size}')]:
        original_image=g['textures'][tex]['source'];ni=image_append(g,b,data,name)
        g['images'][original_image]=g['images'].pop()  # keep material/texture indices stable
    a,f=read_primitive(ks,bks,1)
    mp,hf,ht,deg=indexed_tangents(a['POSITION'],a['NORMAL'],a['TEXCOORD_0'],f)
    replace_attributes(g,b,ks,bks,1,mp,hf,tangent=ht)
    g['asset']['generator']='XPZ3D R36KV shared-chart rebake and indexed tangents'
    g['extras']={**g.get('extras',{}),'revision':'R36KV','sourceSha256':LOCK[size],'highPolyRecoveryClaimed':False,'scope':'R36KU material detail with shared skin charts and indexed hair tangents'}
    g,b,packing=compact(g,b)
    dest=out/f'R36KV_F11_SHARED_UV_{size}_2100TRI.glb';dest.write_bytes(pack(g,b))
    report=verify(ks_path,ku_path,dest)
    report.update(version='R36KV',output=dest.name,sourceSha256=LOCK[size],atlas=atlas,bake=bake,hair={'beforeVertices':882,'afterVertices':len(mp),'degenerateUVFaces':deg,'existingNormalAndMRImagesUnchanged':True},compaction=packing)
    (out/f'R36KV_{size}_BUILD_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,indent=2),flush=True)
    return report
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--size',choices=['1024','512','both'],default='both');args=ap.parse_args()
    for s in ((1024,512) if args.size=='both' else (int(args.size),)):build(s)
