#!/usr/bin/env python3
"""R36KU: add mesh-anchored material detail where R36KS had no normal maps.

This is authored supplementary detail, NOT recovery of a missing 6044-triangle
source. Original geometry per triangle corner, rig, colors, and five images are
preserved. New UV charts require additional GPU vertices, not more triangles.
"""
from __future__ import annotations
import argparse, copy, hashlib, io, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'source'))
from glb_io_r36kj import glb_open,a_read,a_append,image_append,pack
from compact_gltf import compact
LOCK={1024:'ea8d7caeb39bb69f564300fcf43e747978504deafee2537feaff0cb778943411',512:'b13b059cc7b1c01e3a84d840c059fadc4934605e846cab1c3fb98e345548cf85'}
SKIN_PARTS=(0,2,4)
CHANGED_PARTS=(0,1,2,4)

def sha(data):return hashlib.sha256(data).hexdigest()
def unit(a):return a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-12)
def image_bytes(g,b,i):
    v=g['bufferViews'][g['images'][i]['bufferView']];s=v.get('byteOffset',0)
    return bytes(b[s:s+v['byteLength']])
def png(a):
    f=io.BytesIO();Image.fromarray(a.astype('uint8'),'RGB').save(f,format='PNG',optimize=True)
    return f.getvalue()
def read_primitive(g,b,pi):
    p=g['meshes'][0]['primitives'][pi]
    return {k:a_read(g,b,v) for k,v in p['attributes'].items()},a_read(g,b,p['indices']).reshape(-1,3).astype(int)
def tangent_frame(p,n,uv):
    e1=p[1]-p[0];e2=p[2]-p[0];d1=uv[1]-uv[0];d2=uv[2]-uv[0]
    det=d1[0]*d2[1]-d1[1]*d2[0]
    if abs(det)>1e-12:
        t=(e1*d2[1]-e2*d1[1])/det;b=(e2*d1[0]-e1*d2[0])/det
    else:t=e1;b=e2
    t=np.tile(t,(3,1));t-=n*np.sum(t*n,axis=1,keepdims=True)
    bad=np.linalg.norm(t,axis=1)<1e-9
    if bad.any():
        axis=np.eye(3)[np.argmin(np.abs(n[bad]),axis=1)]
        t[bad]=np.cross(axis,n[bad])
    t=unit(t);w=np.where(np.sum(np.cross(n,t)*b,axis=1)<0,-1.,1.)
    return np.c_[t,w].astype('<f4')

def surface_field(p,n,footprint,region):
    """Analytic rest-space gradient; band-limited to chart texel footprint."""
    rng=np.random.default_rng(36011)
    dirs=unit(rng.normal(size=(12,3)))
    freq=np.array([7,11,18,26,40,57,80,105,135,165,210,260.])
    slopes=np.array([.012,.014,.014,.013,.012,.011,.010,.009,.008,.007,.006,.005])
    phase=rng.uniform(0,2*np.pi,12)
    attenuation=np.exp(-(.7*2*np.pi*freq*footprint)**2)
    arg=np.einsum('...c,kc->...k',p,dirs)*freq*(2*np.pi)+phase
    grad=np.einsum('...k,kc->...c',np.cos(arg)*slopes*attenuation,dirs)
    grad-=n*np.sum(grad*n,axis=-1,keepdims=True)
    if region==0:grad*=.72  # Preserve the authored face at normal game distance.
    length=np.linalg.norm(grad,axis=-1,keepdims=True)
    grad*=np.minimum(1.,.075/np.maximum(length,1e-12))
    rough=.90+.012*np.sin(arg[...,0])+.008*np.sin(arg[...,2])
    return unit(n-grad),np.clip(rough,.875,.925)

def add_texture(g,b,data,name,sampler):
    im=image_append(g,b,data,name)
    idx=len(g['textures']);g['textures'].append({'source':im,'sampler':sampler,'name':name})
    return idx

def replace_expanded(g,b,pi,attrs,faces,uvs,tans,uv_key):
    p=g['meshes'][0]['primitives'][pi];flat=faces.reshape(-1);new={}
    for key,old_i in p['attributes'].items():
        ac=g['accessors'][old_i]
        ni=a_append(g,b,attrs[key][flat],ac['type'],ac['componentType'],34962)
        if 'normalized' in ac:g['accessors'][ni]['normalized']=ac['normalized']
        new[key]=ni
    new[uv_key]=a_append(g,b,uvs.reshape(-1,2).astype('<f4'),'VEC2',5126,34962)
    new['TANGENT']=a_append(g,b,tans.reshape(-1,4).astype('<f4'),'VEC4',5126,34962)
    p['attributes']=new
    p['indices']=a_append(g,b,np.arange(len(flat),dtype='<u2').reshape(-1,1),'SCALAR',5123,34963)
    p['extras']={**p.get('extras',{}),'R36KU':{'sourceCornersPreserved':True,'detailUV':uv_key,'triangleCountUnchanged':True}}

def skin_atlas(g,b,size,out):
    normal=np.empty((size,size,3),dtype='uint8');normal[:]=[128,128,255]
    mr=np.empty_like(normal);mr[:]=[255,230,0]
    count=sum(len(read_primitive(g,b,pi)[1]) for pi in SKIN_PARTS)
    cols=math.ceil(math.sqrt(count));tile=size//cols;gutter=3 if size==1024 else 2
    span=tile-2*gutter-1
    if span<4:raise ValueError('Insufficient chart resolution')
    cursor=0;report=[];all_angles=[]
    for pi in SKIN_PARTS:
        attrs,faces=read_primitive(g,b,pi);uvs=[];tans=[]
        uv_key='TEXCOORD_1' if 'TEXCOORD_0' in attrs else 'TEXCOORD_0'
        for tri in faces:
            x=(cursor%cols)*tile;y=(cursor//cols)*tile;cursor+=1
            uv=np.array([[x+gutter+.5,y+gutter+.5],[x+gutter+span+.5,y+gutter+.5],[x+gutter+.5,y+gutter+span+.5]])/size
            p=attrs['POSITION'][tri].astype(float);n=unit(attrs['NORMAL'][tri].astype(float));t=tangent_frame(p,n,uv)
            yy,xx=np.mgrid[0:tile,0:tile]
            a=(xx-gutter)/span;bb=(yy-gutter)/span
            weights=np.stack([1-a-bb,a,bb],axis=-1)
            weights=np.maximum(weights,0);weights/=np.maximum(weights.sum(axis=-1,keepdims=True),1e-12)
            pos=np.einsum('...k,kc->...c',weights,p);nor=unit(np.einsum('...k,kc->...c',weights,n))
            ta=np.einsum('...k,kc->...c',weights,t[:,:3]);ta=unit(ta-nor*np.sum(ta*nor,axis=-1,keepdims=True))
            sign=np.where(np.einsum('...k,k->...',weights,t[:,3])<0,-1.,1.)
            bit=unit(np.cross(nor,ta))*sign[...,None]
            footprint=max(np.linalg.norm(p[1]-p[0]),np.linalg.norm(p[2]-p[0]))/span
            target,rough=surface_field(pos,nor,footprint,pi)
            nt=np.stack([np.sum(target*ta,axis=-1),np.sum(target*bit,axis=-1),np.sum(target*nor,axis=-1)],axis=-1)
            nt=unit(nt);normal[y:y+tile,x:x+tile]=np.clip(np.rint((nt+1)*127.5),0,255).astype('uint8')
            mr[y:y+tile,x:x+tile,1]=np.rint(rough*255).astype('uint8')
            all_angles.extend(np.degrees(np.arccos(np.clip(nt[...,2],-1,1))).reshape(-1).tolist())
            uvs.append(uv);tans.append(t)
        replace_expanded(g,b,pi,attrs,faces,np.array(uvs),np.array(tans),uv_key)
        report.append({'primitive':pi,'material':g['meshes'][0]['primitives'][pi]['material'],'triangles':len(faces),'oldVertices':len(attrs['POSITION']),'newVertices':len(faces)*3,'detailUV':uv_key})
    sampler=len(g.setdefault('samplers',[]));g['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071})
    data1=png(normal);data2=png(mr)
    (out/f'R36KU_SKIN_DETAIL_NORMAL_{size}.png').write_bytes(data1)
    (out/f'R36KU_SKIN_DETAIL_MR_{size}.png').write_bytes(data2)
    normal_i=add_texture(g,b,data1,f'R36KU_skin_detail_normal_{size}',sampler)
    mr_i=add_texture(g,b,data2,f'R36KU_skin_detail_mr_{size}',sampler)
    for r in report:
        mat=g['materials'][r['material']];coord=int(r['detailUV'][-1])
        if mat.get('normalTexture'):raise ValueError('Refusing to replace an existing skin normal map')
        mat['normalTexture']={'index':normal_i,'texCoord':coord,'scale':1.0}
        mat['pbrMetallicRoughness'].update(roughnessFactor=1.0,metallicRoughnessTexture={'index':mr_i,'texCoord':coord})
        mat['extras']={**mat.get('extras',{}),'R36KU':{'detail':'rest-space procedural surface relief','originalBaseColorPreserved':True,'notHighPolyRecovery':True}}
    return {'parts':report,'charts':count,'chartTilePixels':tile,'gutterPixels':gutter,'maxNormalAngleDegrees':float(max(all_angles)),'meanNormalAngleDegrees':float(np.mean(all_angles))}

def hair_detail(g,b,out):
    pi=1;attrs,faces=read_primitive(g,b,pi);mat=g['materials'][g['meshes'][0]['primitives'][pi]['material']]
    old_tex=mat['pbrMetallicRoughness']['baseColorTexture']['index'];im_i=g['textures'][old_tex]['source']
    rgb=np.array(Image.open(io.BytesIO(image_bytes(g,b,im_i))).convert('RGB'),dtype=float)/255
    # Existing strand color is the sole directional source; do not redesign hair.
    luma=rgb@np.array([.2126,.7152,.0722]);smooth=gaussian_filter(luma,.85,mode='nearest')
    height=smooth-gaussian_filter(smooth,5.5,mode='nearest')
    gy,gx=np.gradient(height);slope=np.stack([-gx*3.2,-gy*3.2,np.ones_like(gx)],axis=-1)
    xy=np.linalg.norm(slope[...,:2],axis=-1,keepdims=True)
    slope[...,:2]*=np.minimum(1.,.24/np.maximum(xy,1e-12))
    nt=unit(slope);nm=np.clip(np.rint((nt+1)*127.5),0,255).astype('uint8')
    mr=np.zeros_like(nm);mr[...,0]=255;mr[...,1]=np.rint(np.clip(.90-.045*height/(max(float(height.std()),.02)),.84,.95)*255).astype('uint8')
    sampler=g['textures'][old_tex].get('sampler',0)
    normal_i=add_texture(g,b,png(nm),'R36KU_hair_strand_normal',sampler)
    mr_i=add_texture(g,b,png(mr),'R36KU_hair_strand_mr',sampler)
    (out/'R36KU_HAIR_NORMAL_256.png').write_bytes(png(nm));(out/'R36KU_HAIR_MR_256.png').write_bytes(png(mr))
    uvs=attrs['TEXCOORD_0'][faces];tans=np.array([tangent_frame(attrs['POSITION'][tr].astype(float),unit(attrs['NORMAL'][tr].astype(float)),uv) for tr,uv in zip(faces,uvs)])
    replace_expanded(g,b,pi,attrs,faces,uvs,tans,'TEXCOORD_0')
    mat['normalTexture']={'index':normal_i,'texCoord':0,'scale':1.0}
    mat['pbrMetallicRoughness'].update(roughnessFactor=1.,metallicRoughnessTexture={'index':mr_i,'texCoord':0})
    mat['extras']={**mat.get('extras',{}),'R36KU':{'detail':'strand relief derived from unchanged original hair albedo','notHighPolyRecovery':True}}
    return {'primitive':1,'triangles':len(faces),'maxNormalAngleDegrees':float(np.degrees(np.arccos(nt[...,2])).max()),'originalHairAlbedoImage':im_i,'pixels':list(rgb.shape[:2])}

def verify(source,output):
    _,old,bo=glb_open(source);raw,new,bn=glb_open(output)
    for k in ('nodes','scenes','scene','animations'):
        assert old.get(k)==new.get(k),k
    assert len(old['skins'])==len(new['skins'])
    for os,ns in zip(old['skins'],new['skins']):
        assert {k:v for k,v in os.items() if k!='inverseBindMatrices'}=={k:v for k,v in ns.items() if k!='inverseBindMatrices'}
        assert np.array_equal(a_read(old,bo,os['inverseBindMatrices']),a_read(new,bn,ns['inverseBindMatrices']))
    for i in range(len(old['images'])):assert image_bytes(old,bo,i)==image_bytes(new,bn,i),('image',i)
    corner_proof=[]
    for pi in range(len(old['meshes'][0]['primitives'])):
        aa,fi=read_primitive(old,bo,pi);bb,fj=read_primitive(new,bn,pi)
        assert len(fi)==len(fj)
        for key in aa:
            assert np.array_equal(aa[key][fi],bb[key][fj]),(pi,key,'triangle-corner mismatch')
        corner_proof.append(pi)
        if 'TANGENT' in bb:
            assert np.isfinite(bb['TANGENT']).all()
            assert np.max(np.abs(np.linalg.norm(bb['TANGENT'][:,:3],axis=1)-1))<1e-5
            assert np.max(np.abs(np.sum(unit(bb['NORMAL'])*bb['TANGENT'][:,:3],axis=1)))<1e-5
            assert set(np.unique(bb['TANGENT'][:,3]))<={-1.,1.}
    for i,(m,n) in enumerate(zip(old['materials'],new['materials'])):
        assert m['pbrMetallicRoughness'].get('baseColorFactor')==n['pbrMetallicRoughness'].get('baseColorFactor')
        assert m['pbrMetallicRoughness'].get('baseColorTexture')==n['pbrMetallicRoughness'].get('baseColorTexture')
        if i not in (0,4,5,7):assert m==n,('protected material',i)
    oldverts=sum(a_read(old,bo,p['attributes']['POSITION']).shape[0] for p in old['meshes'][0]['primitives'])
    newverts=sum(a_read(new,bn,p['attributes']['POSITION']).shape[0] for p in new['meshes'][0]['primitives'])
    triangles=sum(new['accessors'][p['indices']]['count']//3 for p in new['meshes'][0]['primitives'])
    assert triangles==2100 and len(new['skins'][0]['joints'])==63
    return {'triangles':triangles,'bones':63,'verticesBefore':oldverts,'verticesAfter':newverts,'preservedTriangleCornerAttributes':corner_proof,'preservedOriginalImages':len(old['images']),'totalImages':len(new['images']),'sha256':sha(raw),'bytes':len(raw),'newNormalMaterialCount':4,'newNormalTriangleCount':1414,'engineApplied':False,'highPolyRecoveryClaimed':False}

def build(size):
    src=ROOT/'source'/'output'/f'R36KS_F11_MULTI_POSE_HIP_{size}_2100TRI.glb'
    raw,g,b=glb_open(src)
    if sha(raw)!=LOCK[size]:raise ValueError('Unknown R36KS source hash')
    out=ROOT/'output';out.mkdir(exist_ok=True)
    skin=skin_atlas(g,b,size,out);hair=hair_detail(g,b,out)
    g['asset']['generator']='XPZ3D R36KU mesh-anchored supplementary material detail'
    g['extras']={**g.get('extras',{}),'revision':'R36KU','sourceSha256':LOCK[size],'scope':'face, hair, wrists, arms, neck, fingers; original torso and leg maps protected','highPolyRecoveryClaimed':False}
    g,b,packing=compact(g,b)
    dest=out/f'R36KU_F11_BALANCED_DETAIL_{size}_2100TRI.glb';dest.write_bytes(pack(g,b))
    report=verify(src,dest);report.update(version='R36KU',output=dest.name,sourceSha256=LOCK[size],skinAtlas=skin,hair=hair,compaction=packing)
    (out/f'R36KU_{size}_BUILD_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,indent=2),flush=True)
    return report

if __name__=='__main__':
    args=argparse.ArgumentParser();args.add_argument('--size',choices=['512','1024','both'],default='both');opt=args.parse_args()
    for size in ((1024,512) if opt.size=='both' else (int(opt.size),)):build(size)
