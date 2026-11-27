#!/usr/bin/env python3
"""R36KX: pack R36KW normal atlases by integer-pixel relocation only.

No resampling, synthesized detail, mesh welding, or tangent regeneration.
R36KW geometry, skinning, all indices and material parameters stay unchanged.
Only TEXCOORD_1 in six primitives and two embedded normal PNGs are modified.
Base-level texels are preserved; regenerated mip levels are NOT byte-identical.
"""
from __future__ import annotations
import argparse,copy,json,math
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates
from glb_tools import load,arr,accessor,primitive,image,image_bytes,png,replace_image,pack,sha
from prepare_r36kx import LOCK,COMMIT
ROOT=Path(__file__).resolve().parent
PARTS=(1,7,8,9,10,11)
REPORT_LOCK={1024:'159b5e30951513643d664d629f86aae5e0e43fbfb7fabe68e0f151e38b92f634',512:'d92402c694e08d74cafb6ee4a02453eecded68fa729b4e871a68c0b0ffbd0ebc'}

def bilinear(im,uv):
    h,w=im.shape[:2]
    xy=np.array([uv[...,1]*h-.5,uv[...,0]*w-.5])
    return np.stack([map_coordinates(im[...,c].astype(float),xy,order=1,mode='nearest') for c in range(3)],axis=-1)

def degenerate(uv):
    a=uv[:,1]-uv[:,0];b=uv[:,2]-uv[:,0]
    return int((np.abs(a[:,0]*b[:,1]-a[:,1]*b[:,0])<1e-10).sum())

def decoded_rgba(g,b):
    # An area calculation, not a GPU allocation measurement.
    return int(sum(image(g,b,i).shape[0]*image(g,b,i).shape[1]*4 for i in range(len(g['images']))))

def make_layout(g,b,source_report,size):
    old_body=image(g,b,3);old_hair=image(g,b,7)
    if old_body.shape!=(size,size*2,3) or old_hair.shape!=(256,512,3):raise ValueError('Unexpected atlas layout')
    tile=48 if size==1024 else 24
    width=math.ceil((size+8+3*tile+8)/32)*32
    body=np.full((size,width,3),[128,128,255],dtype=np.uint8)
    hair=np.full((320,320,3),[128,128,255],dtype=np.uint8)
    body[:,:size]=old_body[:,:size]
    # Entire original hair image plus its periodic gutter, unchanged.
    hair[:256,:264]=old_hair[:,:264]
    # Repeat original bottom edge into an 8-pixel outer gutter. This protects
    # low mip levels; these extra pixels are not sampled at the authored UVs.
    hair[256:264,:264]=old_hair[255:256,:264]
    body[:,size:size+8]=old_body[:,size-1:size]
    patches=[];counters={'body':0,'hair':0};used={'body':np.zeros(body.shape[:2],bool),'hair':np.zeros(hair.shape[:2],bool)}
    used['body'][:,:size+8]=True;used['hair'][:264,:264]=True
    for source in source_report['patches']:
        p=copy.deepcopy(source);kind=p['kind'];i=counters[kind];counters[kind]+=1;t=p['tile']
        if kind=='body':
            if t!=tile:raise ValueError('Unexpected patch tile')
            nx=size+8+(i%3)*tile;ny=8+(i//3)*tile;src=old_body;dst=body
        else:
            if t!=32:raise ValueError('Unexpected hair patch tile')
            if i<8:nx,ny=280,8+32*i
            else:nx,ny=24+32*(i-8),264
            src=old_hair;dst=hair
        if nx<0 or ny<0 or nx+t>dst.shape[1] or ny+t>dst.shape[0]:raise ValueError('Atlas overflow')
        if used[kind][ny:ny+t,nx:nx+t].any():raise ValueError('Overlapping atlas rectangles')
        used[kind][ny:ny+t,nx:nx+t]=True
        oldx,oldy=p['x'],p['y']
        dst[ny:ny+t,nx:nx+t]=src[oldy:oldy+t,oldx:oldx+t]
        p.update(newX=nx,newY=ny,newWidth=dst.shape[1],newHeight=dst.shape[0])
        patches.append(p)
    assert counters=={'body':56,'hair':14}
    return body,hair,patches

def remap_uvs(g,b,patches,new_shapes):
    reports=[]
    for pi in PARTS:
        attrs,faces=primitive(g,b,pi)
        old=attrs['TEXCOORD_1'];kind='hair' if pi==1 else 'body'
        old_h,old_w=image(g,b,7 if pi==1 else 3).shape[:2]
        new_h,new_w=new_shapes[kind]
        corners=old[faces].astype(np.float64)*[old_w,old_h]
        for p in patches:
            if p['primitive']!=pi:continue
            corners[p['face']]+=[p['newX']-p['x'],p['newY']-p['y']]
        corners=(corners/[new_w,new_h]).astype('<f4')
        new=(old.astype(np.float64)*[old_w/new_w,old_h/new_h]).astype('<f4')
        seen={}
        for fi,face in enumerate(faces):
            for k,vi in enumerate(face):
                expected=corners[fi,k]
                if int(vi) in seen and not np.array_equal(seen[int(vi)],expected):
                    raise ValueError('A shared vertex crosses relocation boundaries; split explicitly, never overwrite silently')
                seen[int(vi)]=expected;new[vi]=expected
        if degenerate(new[faces])!=0:raise ValueError('Degenerate normal UV introduced')
        oldaccess=g['meshes'][0]['primitives'][pi]['attributes']['TEXCOORD_1']
        g['meshes'][0]['primitives'][pi]['attributes']['TEXCOORD_1']=accessor(g,b,new,g['accessors'][oldaccess])
        reports.append({'primitive':pi,'vertices':len(old),'triangles':len(faces),'indexBufferUnchanged':True,'tangentUnchanged':True})
    return reports

def verify(src,dest,patches):
    g0,b0=load(src);g1,b1=load(dest)
    for key in ('nodes','scenes','scene','animations','materials','textures','samplers','extensionsUsed','extensionsRequired'):
        assert g0.get(key)==g1.get(key),('changed',key)
    assert len(g0['skins'])==len(g1['skins'])
    for a,b in zip(g0['skins'],g1['skins']):
        assert {k:v for k,v in a.items() if k!='inverseBindMatrices'}=={k:v for k,v in b.items() if k!='inverseBindMatrices'}
        assert np.array_equal(arr(g0,b0,a['inverseBindMatrices']),arr(g1,b1,b['inverseBindMatrices']))
    vertices=triangles=0
    for pi in range(len(g0['meshes'][0]['primitives'])):
        aa,fa=primitive(g0,b0,pi);ab,fb=primitive(g1,b1,pi)
        assert np.array_equal(fa,fb),(pi,'indices')
        assert set(aa)==set(ab)
        for attr in aa:
            if attr=='TEXCOORD_1' and pi in PARTS:continue
            assert np.array_equal(aa[attr],ab[attr]),(pi,attr)
        vertices+=len(ab['POSITION']);triangles+=len(fb)
    assert vertices==2047 and triangles==2100 and len(g1['skins'][0]['joints'])==63
    unchanged=[]
    for i in range(len(g0['images'])):
        if i in (3,7):continue
        assert image_bytes(g0,b0,i)==image_bytes(g1,b1,i);unchanged.append(i)
    old_body=image(g0,b0,3);new_body=image(g1,b1,3);old_hair=image(g0,b0,7);new_hair=image(g1,b1,7)
    n=old_body.shape[0]
    assert np.array_equal(old_body[:,:n],new_body[:,:n])
    assert np.array_equal(old_hair[:,:264],new_hair[:256,:264])
    for p in patches:
        oi,ni=(old_hair,new_hair) if p['kind']=='hair' else (old_body,new_body)
        x,y,nx,ny,t=p['x'],p['y'],p['newX'],p['newY'],p['tile']
        assert np.array_equal(oi[y:y+t,x:x+t],ni[ny:ny+t,nx:nx+t]),('patch',p)
    # Test at vertices, edges and nine deterministic interior samples per face.
    rng=np.random.default_rng(36024);random=rng.dirichlet(np.ones(3),size=9)
    bary=np.concatenate([np.eye(3),np.array([[.5,.5,0],[.5,0,.5],[0,.5,.5]]),random],axis=0)
    samples=[];all_degenerate=0
    for pi,p in enumerate(g1['meshes'][0]['primitives']):
        nt=g1['materials'][p['material']].get('normalTexture')
        if nt is None:continue
        ab,fb=primitive(g1,b1,pi);key='TEXCOORD_'+str(nt.get('texCoord',0))
        all_degenerate+=degenerate(ab[key][fb])
        if pi not in PARTS:continue
        aa,fa=primitive(g0,b0,pi)
        ua=np.einsum('sk,fkc->fsc',bary,aa['TEXCOORD_1'][fa].astype(float))
        ub=np.einsum('sk,fkc->fsc',bary,ab['TEXCOORD_1'][fb].astype(float))
        oi,ni=(old_hair,new_hair) if pi==1 else (old_body,new_body)
        diff=np.abs(bilinear(oi,ua)-bilinear(ni,ub))
        samples.append({'primitive':pi,'samples':int(np.prod(ua.shape[:-1])),'maxRGBByteDifference':float(diff.max()),'meanRGBByteDifference':float(diff.mean())})
        assert diff.max()<.02,('Bilinear sample drift',pi,float(diff.max()))
    assert all_degenerate==0
    mem0=decoded_rgba(g0,b0);mem1=decoded_rgba(g1,b1)
    normal0=sum(image(g0,b0,i).shape[0]*image(g0,b0,i).shape[1]*4 for i in (3,7))
    normal1=sum(image(g1,b1,i).shape[0]*image(g1,b1,i).shape[1]*4 for i in (3,7))
    return {'vertices':vertices,'triangles':triangles,'bones':63,'primitives':12,'images':len(g1['images']),
        'bytes':dest.stat().st_size,'sourceBytes':src.stat().st_size,'sha256':sha(dest.read_bytes()),
        'normalUVDegenerateFaces':all_degenerate,'allIndicesAndOtherAttributesUnchanged':True,'allTangentsUnchanged':True,
        'allMaterialsSamplersAndRigUnchanged':True,'unchangedImageIndices':unchanged,'normalPatchTexelsRetained':70,
        'bodyNormalDimensionsBefore':[old_body.shape[1],old_body.shape[0]],'bodyNormalDimensionsAfter':[new_body.shape[1],new_body.shape[0]],
        'hairNormalDimensionsBefore':[old_hair.shape[1],old_hair.shape[0]],'hairNormalDimensionsAfter':[new_hair.shape[1],new_hair.shape[0]],
        'affectedNormalRGBA8BytesNoMipsBefore':int(normal0),'affectedNormalRGBA8BytesNoMipsAfter':int(normal1),
        'allImageRGBA8BytesNoMipsBefore':mem0,'allImageRGBA8BytesNoMipsAfter':mem1,'savedRGBA8BytesNoMips':mem0-mem1,
        'affectedNormalAreaReductionPercent':100*(1-normal1/normal0),'textureEstimateNotMeasuredGPUAllocation':True,
        'baseLevelBilinearComparisons':samples,'mipmapsByteIdentical':False,'engineApplied':False,'highPolyRecoveryClaimed':False}

def build(size):
    src=ROOT/'input'/f'R36KW_F11_NORMAL_UV_REPAIR_{size}_2100TRI.glb'
    if sha(src.read_bytes())!=LOCK[size]:raise ValueError('Unrecognized source GLB')
    report_path=ROOT/'input'/f'R36KW_{size}_BUILD_REPORT.json'
    if sha(report_path.read_bytes())!=REPORT_LOCK[size]:raise ValueError('Unrecognized source patch metadata')
    source_report=json.loads(report_path.read_text(encoding='utf8'))
    g,b=load(src);body,hair,patches=make_layout(g,b,source_report,size)
    changes=remap_uvs(g,b,patches,{'body':body.shape[:2],'hair':hair.shape[:2]})
    out=ROOT/'output';out.mkdir(exist_ok=True)
    for i,im,name in ((3,body,f'R36KX_BODY_NORMAL_{size}'),(7,hair,'R36KX_HAIR_NORMAL_320')):
        data=png(im);replace_image(g,b,i,data,name);(out/(name+'.png')).write_bytes(data)
    g['asset']['generator']='XPZ3D R36KX integer-texel normal atlas compaction'
    g['extras']={**g.get('extras',{}),'revision':'R36KX','sourceSha256':LOCK[size],'sourceCommit':COMMIT,
        'normalAtlasCompaction':'integer-pixel relocation; zero resampling; geometry and tangents unchanged',
        'mipmapsByteIdentical':False,'engineApplied':False}
    dest=out/f'R36KX_F11_COMPACT_NORMAL_{size}_2100TRI.glb';dest.write_bytes(pack(g,b))
    report=verify(src,dest,patches)
    report.update(version='R36KX',output=dest.name,sourceCommit=COMMIT,sourceSha256=LOCK[size],changedUVs=changes,patches=patches,
        limitations=['Non-power-of-two normal atlases: target renderer must support NPOT mipmaps without resizing.',
        'Base texels retained; UV float32 rounding and regenerated mip filtering can change screen pixels.',
        'No runtime FPS/VRAM measurement, game installation, topology weld or high-poly recovery.'])
    (out/f'R36KX_{size}_BUILD_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('patches','changedUVs')},indent=2),flush=True)
    return report
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--size',choices=['1024','512','both'],default='both');opt=a.parse_args()
    for size in ((1024,512) if opt.size=='both' else (int(opt.size),)):build(size)
