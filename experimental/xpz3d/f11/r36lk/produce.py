#!/usr/bin/env python3
"""Produce a synthetic XPZPKT1 texture/material fixture and native MMPs."""
import io,json,pathlib,struct,sys
import numpy as np
from PIL import Image
from material_stage import stage, require, SIGNATURE, FORMAT

def fixture(path):
    parts=[]
    def add(name,k,r,c,raw):
        nb=name.encode();parts.append(struct.pack('<5I',len(nb),k,r,c,len(raw))+nb+raw)
    def png(i,pixels):
        stream=io.BytesIO();Image.fromarray(np.array(pixels,dtype=np.uint8),'RGBA').save(stream,format='PNG');data=stream.getvalue();add(f'image/{i}/png',3,len(data),1,data)
    # color, transparency and tangent-space normal fixtures, not actual F11 textures
    a=np.zeros((4,8,4),np.uint8);a[:,:,:]=[32,128,240,255];a[:2,:4]=[200,100,40,0];a[2:,:4]=[128,64,32,128]
    png(0,a);b=np.zeros((2,2,4),np.uint8);b[:]=[128,128,255,255];png(1,b)
    catalog={'materials':[{'name':'opaque','pbrMetallicRoughness':{'baseColorTexture':{'index':0}},'normalTexture':{'index':1}},{'name':'blend-tint','alphaMode':'BLEND','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'baseColorFactor':[0.5,1,1,0.5]}},{'name':'mask-uv1','alphaMode':'MASK','alphaCutoff':0.4,'pbrMetallicRoughness':{'baseColorTexture':{'index':2,'texCoord':1}}}], 'textures':[{'source':0},{'source':1},{'source':0,'sampler':0}], 'samplers':[{'wrapS':33648,'wrapT':33071}]}
    data=json.dumps(catalog).encode();add('catalog.json',3,len(data),1,data)
    for i,material in enumerate([0,1,2,-1]):add(f'mesh/0/prim/{i}/material',4,1,1,struct.pack('<i',material))
    path.write_bytes(b'XPZPKT1\0'+struct.pack('<I',len(parts))+b''.join(parts));return a

def read_mmp(path):
    raw=path.read_bytes();magic,fmt,avg,w,h,n=struct.unpack_from('<6I',raw);assert magic==SIGNATURE and fmt==FORMAT;off=24;levels=[]
    for i in range(n):
        sz=(w>>i)*(h>>i)*4;levels.append(np.frombuffer(raw[off:off+sz],dtype=np.uint8).reshape(h>>i,w>>i,4)[:,:,[2,1,0,3]]);off+=sz
    assert off==len(raw);return levels

def main():
    root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'output');root.mkdir(exist_ok=False,parents=True);src=root/'material_fixture.xpzp';pixels=fixture(src);plan=stage(src,root/'native')
    p=root/'native/materials';a=read_mmp(p/'0/base.mmp');b=read_mmp(p/'1/base.mmp');c=read_mmp(p/'2/base.mmp');d=read_mmp(p/'-1/base.mmp')
    assert [i.shape[:2] for i in a]==[(4,8),(2,4),(1,2)]
    assert np.array_equal(a[0][:,:,:3],pixels[:,:,:3]) and np.all(a[0][:,:,3]==255)
    assert np.all(b[0][:,:,0]<=pixels[:,:,0]) and b[0][3,0,3]==64 and b[0][3,7,3]==128
    assert np.array_equal(c[0],pixels) and np.all(d[0]==255)
    assert plan['materials'][2]['engineAlphaFlagsCandidate']==17 and plan['materials'][3]['engineAlphaFlagsCandidate']==4
    assert len(plan['materials'][3]['bindings']['baseColor']['issues'])==2 and len(plan['primitives'])==4
    assert plan['materials'][1]['bindings']['normal']['sourcePNG']=='images/1.png'
    try:stage(src,root/'native');raise AssertionError('overwrite allowed')
    except ValueError as e:assert 'already exists' in str(e)
    report={'fixture':'synthetic only','counts':plan['counts'],'nativeBytes':sum(x.stat().st_size for x in p.rglob('*.mmp')),'checks':['native header/size and rectangular mips','opaque exact RGB and forced alpha','linear tint and alpha','mask preservation/default','material flags and UV/sampler warnings','normal source preserved','no overwrite'],'engineApplied':False}
    (root/'PRODUCTION_REPORT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
