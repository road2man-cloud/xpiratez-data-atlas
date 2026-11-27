#!/usr/bin/env python3
"""XPZPKT1 -> native uncompressed Silent Storm MMP and material binding plan.
Does not register NDb records or bind textures to a running engine.
"""
import argparse, hashlib, io, json, math, pathlib, re, struct, tempfile
import numpy as np
from PIL import Image

LIMIT = 64 * 1024 * 1024
SIGNATURE, FORMAT = 0x00504D4D, 6  # mmpFormat.h, GPixelFormat.h

def require(ok, msg):
    if not ok: raise ValueError(msg)

def read_packet(path):
    path = pathlib.Path(path)
    require(path.stat().st_size <= LIMIT, 'packet too large')
    b = path.read_bytes(); require(len(b)>=12 and b[:8]==b'XPZPKT1\0','bad packet header')
    n, = struct.unpack_from('<I',b,8); require(n<=100000,'section count')
    off=12; out={}
    for _ in range(n):
        require(off+20<=len(b),'truncated header')
        nl,k,r,c,sz=struct.unpack_from('<5I',b,off); off+=20
        require(0<nl<=200 and 1<=k<=4 and c>0 and r*c*(1 if k==3 else 4)==sz and off+nl+sz<=len(b),'section shape')
        key=b[off:off+nl].decode('ascii'); off+=nl
        require(re.fullmatch(r'[a-zA-Z0-9_./-]+',key) and key not in out,'invalid/duplicate section')
        out[key]=(k,r,c,b[off:off+sz]);off+=sz
    require(off==len(b),'trailing packet bytes');return out

def blob(sections,key):
    k,r,c,data=sections[key];require(k==3,key+' not bytes');return data

def srgb_to_linear(x): return np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)
def linear_to_srgb(x):
    x=np.clip(x,0,1);return np.where(x<=0.0031308,12.92*x,1.055*x**(1/2.4)-0.055)
def quant(x):return np.rint(np.clip(x,0,1)*255).astype(np.uint8)
def sha(data):return hashlib.sha256(data).hexdigest()
def decode_png(data):
    require(data[:8]==b'\x89PNG\r\n\x1a\n','not PNG')
    with Image.open(io.BytesIO(data)) as im:
        w,h=im.size
        require(im.format=='PNG' and 0<w<=2048 and 0<h<=2048,'unsupported texture size/format')
        require((w&(w-1))==0 and (h&(h-1))==0,'NPOT image: no silent resampling')
        return np.array(im.convert('RGBA'),dtype=np.uint8)

def base_mips(rgba,factor):
    # glTF baseColorFactor is linear. Keep original top-level bytes exactly for factor 1.
    f=np.asarray(factor,dtype=float);require(f.shape==(4,) and np.isfinite(f).all() and ((f>=0)&(f<=1)).all(),'invalid base factor')
    a=rgba.astype(float)/255.;rgb=srgb_to_linear(a[:,:,:3])*f[:3];alpha=a[:,:,3:4]*f[3]
    levels=[]
    while True:
        levels.append(quant(np.concatenate((linear_to_srgb(rgb),alpha),axis=2)))
        h,w=alpha.shape[:2]
        # Engine LoadTextureData shifts both dimensions without clamping; stop at first 1.
        if min(h,w)==1:break
        def avg(v):return v.reshape(h//2,2,w//2,2,v.shape[2]).mean(axis=(1,3))
        pa=avg(rgb*alpha); plain=avg(rgb);alpha=avg(alpha)
        rgb=np.divide(pa,alpha,out=plain,where=alpha>1e-12)
    return levels

def mmp(levels):
    h,w=levels[0].shape[:2]
    avg=levels[0].astype(float).mean(axis=(0,1));r,g,b,a=np.rint(avg).astype(int)
    color=int(b)|(int(g)<<8)|(int(r)<<16)|(int(a)<<24)
    raw=struct.pack('<6I',SIGNATURE,FORMAT,color,w,h,len(levels))
    for i,level in enumerate(levels):
        require(level.shape==(h>>i,w>>i,4),'mip shape')
        raw+=level[:,:,[2,1,0,3]].tobytes()
    return raw

def index(seq,i,label):
    require(type(i) is int and 0<=i<len(seq),'bad '+label+' index');return seq[i]

def stage(packet,output):
    sec=read_packet(packet);cat=json.loads(blob(sec,'catalog.json'));require(isinstance(cat,dict),'bad catalog')
    mats=cat.get('materials',[]);textures=cat.get('textures',[]);samplers=cat.get('samplers',[])
    require(all(isinstance(x,list) for x in (mats,textures,samplers)),'bad catalog lists')
    images={}; originals={}
    for key in sorted(sec):
        match=re.fullmatch(r'image/(\d+)/png',key)
        if match:
            i=int(match[1]);require(i not in images,'duplicate image index');raw=blob(sec,key);images[i]=decode_png(raw);originals[i]=raw
    plan={'format':'R36LK-MATERIAL-1','engineSourceCommit':'f5b5b620d4b251d7548b36134ae16d3abe4457e5','engineApplied':False,'nativeFormat':'MMP CF_A8R8G8B8=6, BGRA8, 24-byte header','images':[],'materials':[],'primitives':[]}
    files={}
    for i,raw in originals.items():
        name=f'images/{i}.png';files[name]=raw;h,w=images[i].shape[:2];plan['images'].append({'index':i,'file':name,'sha256':sha(raw),'size':[w,h]})
    def binding(info):
        t=index(textures,info['index'],'texture');source=t['source'];require(type(source) is int and source in images,'missing image');s=index(samplers,t['sampler'],'sampler') if 'sampler' in t else {}
        u,v=s.get('wrapS',10497),s.get('wrapT',10497);require(u in (10497,33071,33648) and v in (10497,33071,33648),'unknown wrap')
        texcoord=info.get('texCoord',0);require(type(texcoord) is int and texcoord>=0,'bad UV set')
        # Engine exposed one wrap mode; no guessed mirrored/mixed or transformed UV support.
        wrap='WRAP' if u==v==10497 else 'CLAMP' if u==v==33071 else None
        issues=[]
        if wrap is None:issues.append('mixed or mirrored sampler wrap not mapped')
        if texcoord!=0:issues.append('requires UV set other than UV0')
        if info.get('extensions') or t.get('extensions'):issues.append('texture extension not mapped')
        if 'minFilter'in s or 'magFilter'in s:issues.append('filter override retained, not mapped')
        return {'texture':info['index'],'image':source,'sourcePNG':f'images/{source}.png','texCoord':texcoord,'sampler':s,'engineWrapCandidate':wrap,'issues':issues,'original':info}
    for i,mat in [(-1,{})]+list(enumerate(mats)):
        pbr=mat.get('pbrMetallicRoughness',{});factor=pbr.get('baseColorFactor',[1,1,1,1]);mode=mat.get('alphaMode','OPAQUE');require(mode in ('OPAQUE','MASK','BLEND'),'unknown alpha mode')
        flags=(4 if mode=='MASK' else 1 if mode=='BLEND' else 0)|(16 if mat.get('doubleSided',False) else 0)
        record={'id':i,'name':mat.get('name','default' if i==-1 else f'material-{i}'),'engineAlphaFlagsCandidate':flags,'alphaMode':mode,'alphaCutoff':mat.get('alphaCutoff',0.5),'baseColorFactor':factor,'metallicFactor':pbr.get('metallicFactor',1),'roughnessFactor':pbr.get('roughnessFactor',1),'bindings':{},'limitations':['PBR lighting not equivalent to engine material','engine texture and material creation not executed']}
        info=pbr.get('baseColorTexture');b=binding(info) if info is not None else None
        if b is not None:record['bindings']['baseColor']=b;pixels=images[b['image']]
        else:pixels=np.full((1,1,4),255,np.uint8)
        if mode=='OPAQUE':
            # OPAQUE ignores alpha before filtering, not just after it.
            pixels=pixels.copy();pixels[:,:,3]=255;factor_for_bake=[*factor[:3],1]
        else:factor_for_bake=factor
        levels=base_mips(pixels,factor_for_bake)
        name=f'materials/{i}/base.mmp';raw=mmp(levels);files[name]=raw
        record['baseMMP']={'file':name,'sha256':sha(raw),'bytes':len(raw),'width':int(pixels.shape[1]),'height':int(pixels.shape[0]),'levels':len(levels),'factorBaked':True,'engineColorCandidate':[1,1,1]}
        if mode=='MASK':record['limitations'].append('alpha test threshold/coverage not mapped')
        if mat.get('doubleSided') and mode!='BLEND':record['limitations'].append('generic CreateMaterial does not consume MA_2SIDED')
        for role,info in [('normal',mat.get('normalTexture')),('metallicRoughness',pbr.get('metallicRoughnessTexture')),('occlusion',mat.get('occlusionTexture')),('emissive',mat.get('emissiveTexture'))]:
            if info is not None:record['bindings'][role]=binding(info);record['limitations'].append(role+' retained as PNG; no native material mapping')
        if mat.get('extensions'):record['limitations'].append('material extensions not mapped')
        record['original']=mat;plan['materials'].append(record)
    for key,(k,r,c,data) in sorted(sec.items()):
        ma=re.fullmatch(r'mesh/(\d+)/prim/(\d+)/material',key)
        if not ma:continue
        require((k,r,c)==(4,1,1),'material section shape');i,=struct.unpack('<i',data);require(i==-1 or 0<=i<len(mats),'bad primitive material')
        m,p=map(int,ma.groups());plan['primitives'].append({'mesh':m,'primitive':p,'material':i})
    plan['counts']={'images':len(images),'materialsIncludingDefault':len(plan['materials']),'primitives':len(plan['primitives']),'mmp':sum(k.endswith('.mmp') for k in files)}
    files['binding_plan.json']=(json.dumps(plan,indent=2,ensure_ascii=True)+'\n').encode()
    out=pathlib.Path(output);require(not out.exists(),'output already exists');out.parent.mkdir(parents=True,exist_ok=True)
    # Only publish completed staging directory. Do not touch existing assets.
    with tempfile.TemporaryDirectory(prefix='.r36lk-',dir=out.parent) as tmp:
        root=pathlib.Path(tmp)/'result';root.mkdir()
        for name,data in files.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        require(not out.exists(),'output appeared during staging');root.rename(out)
    return plan

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('packet');ap.add_argument('output');a=ap.parse_args();p=stage(a.packet,a.output);print(json.dumps(p['counts']))
