#!/usr/bin/env python3
"""R36KK: world-position anchored, seam-aware textured F11 exterior.

Creates 1024 and 512 PBR GLBs without adding triangles, changing the original
R36HW face or changing the R36KJ 63-bone rig. This is game-surface shading,
not high resolution anatomical geometry.
"""
from __future__ import annotations
import copy, hashlib, io, json, math, struct
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter
from scipy.spatial import cKDTree
from glb_io_r36kj import glb_open, a_read, a_append, image_append, pack
from compact_gltf import compact

ROOT=Path(__file__).resolve().parent
HW=ROOT/'SOURCE_R36HW_F11_CLOTHED.glb'
SPRITE=ROOT/'body500_F11_pir.gif'
SOURCES={1024:ROOT/'R36KJ_F11_TEXTURED_SKIN_1024_2100TRI.glb',512:ROOT/'R36KJ_F11_TEXTURED_SKIN_512_2100TRI.glb'}
EXPECTED={1024:'f40231b0be8fd1d1ea2f6736f2864d733c6410b08f23127ee1485023b4949635',512:'429ef61ca23b7be493014233348f0efc2673c56e1228d229cf5ca50321bef2d2'}
HW_HASH='a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732'
TILES={7:'torso',8:'L shoulder',9:'R shoulder',10:'L leg',11:'R leg'}
DTYPE={5126:np.dtype('<f4'),5123:np.dtype('<u2'),5121:np.dtype('u1')}

def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()
def lerp(a,b,t):return a*(1-t)+b*t

def near_uv(uv, img):
    h,w=img.shape[:2]
    # glTF UV coordinates are bottom-up; map image rows top-down.
    xi=np.clip((uv[...,0]*(w-1)).round().astype(int),0,w-1)
    yi=np.clip(((1-uv[...,1])*(h-1)).round().astype(int),0,h-1)
    return img[yi,xi]

def smooth_normals(g,B,ids=(7,8,9,10,11)):
    """Mild topology-preserving smooth normal pass only on skin primitives.

    Uses topological face normals and nearest outward-facing rest vertices.
    Does not move vertices, create indices, or touch protected head/hand prims.
    """
    data=[]
    for k in ids:
        pr=g['meshes'][0]['primitives'][k];attrs=pr['attributes']
        p=a_read(g,B,attrs['POSITION']).astype('float64')
        n=a_read(g,B,attrs['NORMAL']).astype('float64')
        face=a_read(g,B,pr['indices']).reshape(-1,3).astype(int)
        cross=np.cross(p[face[:,1]]-p[face[:,0]],p[face[:,2]]-p[face[:,0]])
        accumulated=np.zeros_like(n)
        for j in range(3):np.add.at(accumulated,face[:,j],cross)
        mag=np.linalg.norm(accumulated,axis=1,keepdims=True)
        nonzero=mag[:,0]>1e-9
        accumulated[nonzero]/=mag[nonzero]
        accumulated[~nonzero]=n[~nonzero]
        data.append((k,p,n,accumulated,pr))
    positions=np.concatenate([x[1] for x in data]);oldnorm=np.concatenate([x[2] for x in data]);target=np.concatenate([x[3] for x in data]);
    normals=target.copy()
    # Spatial normal neighbor averaging, only for near-parallel surfaces and
    # close positions; no need to stitch physically separate geometry.
    tree=cKDTree(positions)
    for i,neighbors in enumerate(tree.query_ball_point(positions,r=.016)):
        if len(neighbors)<=1:continue
        candidates=np.asarray(neighbors,dtype=int)
        direction=np.einsum('ij,j->i',target[candidates],target[i])
        candidates=candidates[direction>.75]
        if len(candidates)<2:continue
        distance=np.linalg.norm(positions[candidates]-positions[i],axis=1)
        coeff=np.exp(-(distance/.010)**2)
        v=np.average(target[candidates],axis=0,weights=coeff)
        normals[i]=.72*target[i]+.28*v
    norms=np.linalg.norm(normals,axis=1,keepdims=True)
    normals/=np.maximum(norms,1e-12)
    changes={};offset=0
    for k,p,n,target,prim in data:
        size=len(p)
        new=normals[offset:offset+size].astype('<f4')
        offset+=size
        differences=np.linalg.norm(new-n,axis=1)
        prim['attributes']['NORMAL']=a_append(g,B,new,'VEC3',5126,34962)
        changes[k]={ 'vertices':size,'meanNormalDifference':float(np.mean(differences)),
           'maxNormalDifference':float(np.max(differences))}
    return changes

def world_fields(P,N):
    """Continuous in XYZ independent of UV islands and per-part random seeds."""
    x=P[...,0];y=P[...,1];z=P[...,2]
    front=np.clip((-y+.02)/.10,0,1)**1.5
    back=np.clip((y+.02)/.10,0,1)**1.5
    chest=(np.exp(-((x-.095)/.073)**2)+np.exp(-((x+.095)/.073)**2))*np.exp(-((z-1.38)/.085)**2)*front
    sternum=np.exp(-(x/.026)**2-((z-1.35)/.145)**2)*front
    under=np.exp(-((z-1.286)/.03)**2)*(np.exp(-((x-.095)/.08)**2)+np.exp(-((x+.095)/.08)**2))*front
    waist=np.exp(-((z-1.17)/.076)**2)*front
    collar=np.exp(-((z-1.47)/.040)**2)*front
    belly=np.exp(-((z-1.079)/.035)**2-(x/.026)**2)*front
    scapula=(np.exp(-((x-.11)/.048)**2)+np.exp(-((x+.11)/.048)**2))*np.exp(-((z-1.40)/.10)**2)*back
    spine=np.exp(-(x/.025)**2-((z-1.31)/.19)**2)*back
    quad=np.exp(-((z-.71)/.22)**2)*front
    kneecap=np.exp(-((z-.47)/.063)**2)*front
    calf=np.exp(-((z-.32)/.12)**2)*back
    ankle=np.exp(-((z-.10)/.065)**2)
    shoulder=np.exp(-((np.abs(x)-.18)/.065)**2-((z-1.43)/.075)**2)
    # World-anchored fine structure, continuous across independent UV parts.
    low=np.sin(x*19.1+y*11.7+z*17.9)*np.sin(x*8.1-y*14.9+z*9.7)
    mid=np.sin(x*82.4+y*24.6+z*42.1)*np.sin(y*53.3-z*30.9+x*14.2)
    skin=.017*low+.0032*mid
    shade=(.055*chest-.031*sternum-.057*under-.023*waist+.028*collar-.05*belly+
            .035*scapula-.018*spine+.020*quad-.027*kneecap+.018*calf-.015*ankle+
            .026*shoulder+skin)
    # Smooth vertical gradient reduces abrupt tone difference across pelvis / legs.
    shade+=.018*np.tanh((z-.9)/.38)-.007*np.cos(x*11+y*8)
    ao=np.clip(.988-.085*under-.065*belly-.04*waist-.055*kneecap-.02*shoulder, .78,1.0)
    rough=np.clip(.913+.023*waist+.025*kneecap-.017*collar+.012*low+.008*mid,.84,.985)
    # Separate, tiny geometric-scale height detail, without a displacement map.
    height=.025*low+.009*mid+.013*chest-.012*under-.01*waist+.011*shoulder
    return np.clip(shade,-.12,.12),np.clip(height,-.07,.07),rough,ao

def rasterize(g,B,size):
    positions=np.zeros((size,size,3),np.float32)
    normals=np.zeros((size,size,3),np.float32)
    coverage=np.zeros((size,size),np.uint8)
    ids=np.full((size,size),-1,np.int16)
    all_triangles=0;used=0;degenerate=0
    for k in TILES:
        prim=g['meshes'][0]['primitives'][k]
        attr=prim['attributes']
        pp=a_read(g,B,attr['POSITION']).astype('float32')
        nn=a_read(g,B,attr['NORMAL']).astype('float32')
        uv=a_read(g,B,attr['TEXCOORD_0']).astype('float32')
        faces=a_read(g,B,prim['indices']).reshape(-1,3)
        for tri in faces:
            all_triangles+=1
            t=uv[tri].astype('float64')
            px=t[:,0]*(size-1)
            py=(1-t[:,1])*(size-1)
            den=(px[1]-px[0])*(py[2]-py[0])-(py[1]-py[0])*(px[2]-px[0])
            if abs(den)<1e-6:degenerate+=1;continue
            x0=max(0,int(np.floor(px.min()))-1);x1=min(size,int(np.ceil(px.max()))+2)
            y0=max(0,int(np.floor(py.min()))-1);y1=min(size,int(np.ceil(py.max()))+2)
            if x1<=x0 or y1<=y0:continue
            yy,xx=np.mgrid[y0:y1,x0:x1]
            a=((xx-px[0])*(py[2]-py[0])-(yy-py[0])*(px[2]-px[0]))/den
            b=((px[1]-px[0])*(yy-py[0])-(py[1]-py[0])*(xx-px[0]))/den
            c=1-a-b
            mask=(a>=-1e-4)&(b>=-1e-4)&(c>=-1e-4)
            if not mask.any():continue
            P=a[...,None]*pp[tri[1]]+b[...,None]*pp[tri[2]]+c[...,None]*pp[tri[0]]
            # barycentric with coords: a corresponds vertex 1, b vertex 2, c vertex 0
            N=a[...,None]*nn[tri[1]]+b[...,None]*nn[tri[2]]+c[...,None]*nn[tri[0]]
            region=positions[y0:y1,x0:x1];region[mask]=P[mask]
            regionn=normals[y0:y1,x0:x1];regionn[mask]=N[mask]
            coverage[y0:y1,x0:x1][mask]=1
            ids[y0:y1,x0:x1][mask]=k
            used+=int(mask.sum())
    lens=np.linalg.norm(normals,axis=2,keepdims=True);normals/=np.maximum(lens,1e-10)
    return positions,normals,coverage,ids,{'trianglesRasterized':all_triangles,'uvDegenerate':degenerate,'pixelsFilled':int(coverage.sum()),'pixelWrites':used}

def bake_maps(size,positions,normals,coverage,ids):
    out={};world=world_fields(positions,normals)
    shade,height,rough,ao=world
    shape=(size,size)
    rgb=np.full((size,size,3),[228,201,157],dtype=np.uint8)
    # The same global skin field is used in every tile. Avoid per-island procedural differences.
    base=np.array([230,203,157],dtype=np.float32)
    shifts=np.array([1.,.88,.70],np.float32)
    shade_rgb=base[None,None,:]*(1+shade[:,:,None]*shifts[None,None,:])
    shade_rgb=np.uint8(np.clip(np.round(shade_rgb),0,255))
    rgb[coverage>0]=shade_rgb[coverage>0]
    norm=np.full((size,size,3),[128,128,255],np.uint8)
    orm=np.full((size,size,3),[255,232,0],np.uint8)
    # Tangent map kept close to (0,0,1), limiting unwanted rips on UV edges.
    smheight=gaussian_filter(height,sigma=.7)
    gy,gx=np.gradient(smheight)
    gradFactor=85.0
    # Fade bumps near the UV boundary to prevent tile-neighbor normal discontinuities.
    dist=distance_transform_edt(coverage>0)
    boundaryFade=np.clip((dist-1)/6,0,1)
    tx=np.clip(-gx*gradFactor*boundaryFade,-.32,.32)
    ty=np.clip(-gy*gradFactor*boundaryFade,-.32,.32)
    bump=np.stack((tx,ty,np.ones(shape,dtype=np.float32)),axis=-1)
    bump/=np.maximum(np.linalg.norm(bump,axis=2,keepdims=True),1e-9)
    norm[coverage>0]=np.clip(np.round((bump[coverage>0]*.5+.5)*255),0,255).astype('uint8')
    orm[coverage>0,0]=np.clip(np.round(ao[coverage>0]*255),0,255).astype('uint8')
    orm[coverage>0,1]=np.clip(np.round(rough[coverage>0]*255),0,255).astype('uint8')
    orm[coverage>0,2]=0
    # Dilation into unused texels inside allocated UV tile pads color against interpolation bleeding.
    from scipy.ndimage import distance_transform_edt as edt
    for k in TILES:
        this=ids==k
        if not this.any():continue
        ys,xs=np.nonzero(this)
        y0=max(0,int(ys.min())-7);y1=min(size,int(ys.max())+8)
        x0=max(0,int(xs.min())-7);x1=min(size,int(xs.max())+8)
        local=this[y0:y1,x0:x1]
        _,coords=edt(~local,return_indices=True)
        # constrain 6px dilation from the triangle's boundary; UV islands are separated
        distance=edt(~local);fill=(distance<=5)&(~local)&(ids[y0:y1,x0:x1]==-1)
        for arr in [rgb,norm,orm]:
            patch=arr[y0:y1,x0:x1]
            copied=patch[tuple(coords)]
            patch[fill]=copied[fill]
    # Lossless maps, quantize normals/roughness slightly to control compressed size.
    norm=np.uint8(np.clip((norm.astype('uint16')+1)//2*2,0,255))
    orm[:,:,:2]=np.uint8(np.clip((orm[:,:,:2].astype('uint16')+1)//2*2,0,255))
    for label,data in [('ALBEDO',rgb),('NORMAL',norm),('ORM',orm)]:
        f=ROOT/f'R36KK_{size}_SKIN_{label}.png'
        Image.fromarray(data).save(f,optimize=True)
        out[label]=(f,data)
    # alpha debug image showing actual rasterized UV, no labels in actual sampled texture.
    lay=Image.fromarray(rgb.copy());draw=ImageDraw.Draw(lay)
    for k,name in TILES.items():
        ys,xs=np.nonzero(ids==k)
        draw.rectangle((int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())),outline=(37,50,71),width=2)
        draw.text((int(xs.min())+6,int(ys.min())+6),name,fill=(22,31,50))
    lay.save(ROOT/f'R36KK_{size}_ATLAS_PREVIEW.png')
    return out

def colors_for_vertices(g,B,alb):
    data={}
    for k in TILES:
        p=g['meshes'][0]['primitives'][k];P=a_read(g,B,p['attributes']['POSITION']);UV=a_read(g,B,p['attributes']['TEXCOORD_0'])
        data[k]=(P,near_uv(UV,alb).astype('float64'))
    return data

def seam_delta(stats_old,stats_new):
    """Nearest spatial cross-primitive pairs; measured color mismatch is not a claim of geometric closure."""
    def measure(data):
        vals=[];details={}
        for k,k2 in [(7,8),(7,9),(7,10),(7,11)]:
            p,c=data[k];q,d=data[k2]
            distance,nearest=cKDTree(p).query(q,k=1)
            mask=distance<.04
            if not mask.any():continue
            rgb1=c[nearest[mask]];rgb2=d[mask]
            dif=np.linalg.norm(rgb1-rgb2,axis=1)
            vals+=dif.tolist();details[f'{k}->{k2}']={'pairs':len(dif),'meanRGBDistance':round(float(dif.mean()),3),'meanRestDistance':round(float(distance[mask].mean()),5)}
        return {'pairs':len(vals),'meanRGBDistance':round(float(np.mean(vals)),4) if vals else None,'byPair':details}
    return {'before':measure(stats_old),'after':measure(stats_new)}

def build(size):
    src=SOURCES[size]; raw,g,B=glb_open(src)
    if sha(raw)!=EXPECTED[size]:raise RuntimeError('R36KJ input changed: '+sha(raw))
    initial=bytes(B)
    hw,hg,hbin=glb_open(HW)
    assert sha(hw)==HW_HASH
    protectedBefore=json.dumps(g['meshes'][0]['primitives'][:7],sort_keys=True)
    srcSkin=json.dumps(g['skins'],sort_keys=True)
    posBefore=[a_read(g,B,g['meshes'][0]['primitives'][k]['attributes']['POSITION']) for k in range(12)]
    indicesBefore=[a_read(g,B,g['meshes'][0]['primitives'][k]['indices']) for k in range(12)]
    imagesOld=[]
    for k in TILES:
        mat=g['materials'][g['meshes'][0]['primitives'][k]['material']]
        im=g['images'][g['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
        bv=g['bufferViews'][im['bufferView']]
        imagesOld.append(np.asarray(Image.open(io.BytesIO(B[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])).convert('RGB')))
    assert all(np.array_equal(imagesOld[0],im) for im in imagesOld)
    oldColors=colors_for_vertices(g,B,imagesOld[0]);smooth=smooth_normals(g,B)
    position,normal,coverage,primIDs,rasterStat=rasterize(g,B,size)
    maps=bake_maps(size,position,normal,coverage,primIDs)
    newColors=colors_for_vertices(g,B,np.asarray(Image.open(maps['ALBEDO'][0])))
    seam=seam_delta(oldColors,newColors)
    samplerID=len(g['samplers']);g['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071,'name':f'R36KK {size} skin clamp'})
    textures={}
    for label,(file,arr) in maps.items():
        im=image_append(g,B,file.read_bytes(),f'R36KK {size} seamless XYZ skin {label}')
        tid=len(g['textures']);g['textures'].append({'source':im,'sampler':samplerID,'name':f'R36KK {size} {label}'})
        textures[label]=tid
    materials={}
    for part in ['torso','shoulder','leg']:
        prev={'torso':18,'shoulder':19,'leg':20}[part]
        mat=copy.deepcopy(g['materials'][prev]);mat['name']=f'R36KK {size} world-anchored skin / {part}'
        pb=mat['pbrMetallicRoughness'];pb['baseColorTexture']={'index':textures['ALBEDO'],'texCoord':0};pb['metallicRoughnessTexture']={'index':textures['ORM'],'texCoord':0}
        mat['normalTexture']={'index':textures['NORMAL'],'texCoord':0,'scale':{'torso':.40,'shoulder':.32,'leg':.36}[part]}
        mat['occlusionTexture']={'index':textures['ORM'],'texCoord':0,'strength':.57}
        mat['extras']={**mat.get('extras',{}),'revision':'R36KK','worldAnchored':True,'sameFieldForAllSkinIslands':True,'normalContinuityPass':True}
        materials[part]=len(g['materials']);g['materials'].append(mat)
    for k in TILES:
        group='torso' if k==7 else ('shoulder' if k in [8,9] else 'leg')
        p=g['meshes'][0]['primitives'][k];p['material']=materials[group]
        p['extras']={**p.get('extras',{}),'revision':'R36KK','skinTonePositionAnchored':True}
    g['asset']['generator']='XPZ3D R36KK world-anchored seam-aware skin atlas'
    g['meshes'][0]['name']=f'R36KK F11 R36HW original face, world-anchored skin {size}px / 2100 triangles'
    g['extras']={**g.get('extras',{}),'revision':'R36KK','sourceR36KJsha256':sha(raw),'R36HWsha256':HW_HASH,
                 'skinAtlasResolution':[size,size],'skinToneWorldAnchor':True,
                 'surfaceNormalsSoftened':True,'triangleChanges':0,'protectedFaceHairAndHands':True,
                 'R36JBHighResolutionAnatomyEmbedded':False,
                 'limits':['Disconnected shoulder/thigh geometry still exists','Approximate non-explicit exterior only',
                           'S2/S3 engine not implemented','Skin texture cannot weld disconnected meshes']}
    assert sum(g['accessors'][p['indices']]['count']//3 for p in g['meshes'][0]['primitives'])==2100
    assert len(g['skins'][0]['joints'])==63
    assert json.dumps(g['skins'],sort_keys=True)==srcSkin
    assert protectedBefore==json.dumps(g['meshes'][0]['primitives'][:7],sort_keys=True)
    assert bytes(B[:len(initial)])==initial
    for k in range(12):
        p=g['meshes'][0]['primitives'][k]
        assert np.array_equal(a_read(g,B,p['attributes']['POSITION']),posBefore[k])
        assert np.array_equal(a_read(g,B,p['indices']),indicesBefore[k])
    compacted_g,compacted_B,compression=compact(g,B)
    # Invariant: every active original vertex/index/weight remains numerically unchanged.
    for k in range(12):
        pc=compacted_g['meshes'][0]['primitives'][k]
        assert np.array_equal(a_read(compacted_g,compacted_B,pc['attributes']['POSITION']),posBefore[k])
        assert np.array_equal(a_read(compacted_g,compacted_B,pc['indices']),indicesBefore[k])
    assert len(compacted_g['skins'][0]['joints'])==63
    compacted_g['extras']['metadataCompacted']=True
    packed=pack(compacted_g,compacted_B);name=f'R36KK_F11_SEAM_AWARE_SKIN_{size}_2100TRI.glb'
    (ROOT/name).write_bytes(packed)
    report={'version':'R36KK','sourceVersion':'R36KJ','atlasResolution':size,'model':name,'modelBytes':len(packed),
            'sha256':sha(packed),'sourceSHA256':sha(raw),'authoritySHA256':HW_HASH,'triangles':2100,'bones':63,
            'protectedR36HWFaceTriangles':644,'protectedR36HWHairTriangles':294,
            'changedNormalAccessors':smooth,'rasterization':rasterStat,'colorSeamComparison':seam,
            'uncompactedSourcePrefixPreserved':True,'finalBinaryRepackedWithoutGeometryChanges':True,'compaction':compression,'positionsAndIndicesUnmodified':True,'centralDonorIncluded':False,
            'materials':materials,'skinTextureMaps':{label:{'file':file.name,'bytes':file.stat().st_size,'sha256':sha(file.read_bytes())}for label,(file,_) in maps.items()}}
    (ROOT/f'R36KK_{size}_BUILD_REPORT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
    print('built',name,'bytes',len(packed),'seam',seam['before']['meanRGBDistance'],'->',seam['after']['meanRGBDistance'])
    return report

if __name__=='__main__':
    result=[build(n) for n in [1024,512]]
    (ROOT/'R36KK_SUMMARY.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
