#!/usr/bin/env python3
"""Produce synthetic triangle GLBs and exercise the actual stage/bridge path."""
import json, struct, zlib, tempfile, subprocess, shutil
from pathlib import Path
from model_stage import read_glb, stage, conflicts
ROOT=Path(__file__).resolve().parent

def fixture(path,joints,morphs,png_width=2):
    g={'asset':{'version':'2.0','generator':'XPZModel synthetic triangle fixture'},'nodes':[], 'meshes':[], 'skins':[], 'accessors':[], 'bufferViews':[], 'buffers':[{}]}
    b=bytearray()
    def view(data,target=None):
        b.extend(b'\0'*(-len(b)%4));v={'buffer':0,'byteOffset':len(b),'byteLength':len(data)}
        if target:v['target']=target
        g['bufferViews'].append(v);b.extend(data);return len(g['bufferViews'])-1
    def accessor(values,typ,fmt,count,target=None,**extra):
        vi=view(struct.pack('<'+fmt*len(values),*values),target)
        g['accessors'].append({'bufferView':vi,'componentType':{'f':5126,'H':5123}[fmt],'count':count,'type':typ,**extra});return len(g['accessors'])-1
    pos=accessor([0,0,0,1,0,0,0,1,0],'VEC3','f',3,34962,min=[0,0,0],max=[1,1,0]);ix=accessor([0,1,2],'SCALAR','H',3,34963)
    j=accessor([0,0,0,0]*3,'VEC4','H',3,34962);w=accessor([1,0,0,0]*3,'VEC4','f',3,34962)
    uv=accessor([0,0,1,0,0,1],'VEC2','f',3,34962)
    def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',png_width,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x70\xb0\xd0'*png_width)*2))+chunk(b'IEND',b'')
    g['images']=[{'bufferView':view(png),'mimeType':'image/png'}];g['textures']=[{'source':0}];g['materials']=[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}]
    p={'attributes':{'POSITION':pos,'JOINTS_0':j,'WEIGHTS_0':w,'TEXCOORD_0':uv},'indices':ix,'material':0}
    mesh={'primitives':[p]};g['meshes']=[mesh]
    g['nodes']=[{'name':f'Joint{i}'} for i in range(joints)]+[{'mesh':0,'skin':0}]
    g['nodes'][0]['children']=list(range(1,joints));g['skins']=[{'joints':list(range(joints)),'skeleton':0}];g['scenes']=[{'nodes':[0,joints]}];g['scene']=0
    ti=accessor([0,1],'SCALAR','f',2,min=[0],max=[1]);tr=accessor([0,0,0,0,.1,0],'VEC3','f',2)
    anim={'name':'Synthetic','samplers':[{'input':ti,'output':tr}],'channels':[{'sampler':0,'target':{'node':0,'path':'translation'}}]}
    if morphs:
        d=accessor([0,0,0,0,0,.1,0,0,0],'VEC3','f',3,34962,min=[0,0,0],max=[0,0,.1]);p['targets']=[{'POSITION':d} for _ in range(morphs)];mesh['weights']=[0]*morphs
        a=accessor([0]*morphs+[.5]*morphs,'SCALAR','f',2*morphs);anim['samplers'].append({'input':ti,'output':a});anim['channels'].append({'sampler':1,'target':{'node':joints,'path':'weights'}})
    g['animations']=[anim];g['buffers'][0]['byteLength']=len(b);b.extend(b'\0'*(-len(b)%4))
    j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)

def main():
    output=ROOT/'fixtures';output.mkdir(exist_ok=True)
    a,h,b,n=[output/x for x in ('morph63.glb','helper75.glb','base63.glb','npot63.glb')]
    for p,j,m,w in [(a,63,4,2),(h,75,0,2),(b,63,0,2),(n,63,0,3)]:fixture(p,j,m,w)
    caps={'maxJoints':64,'maxMorphs':4,'maxInfluences':4,'maxTexture':1024,'weightTracks':True,'translationTracks':True,'npot':False}
    c1=dict(caps,maxMorphs=0,weightTracks=False,maxJoints=75);c2=dict(c1,maxJoints=64)
    assert read_glb(a)[1]['morphs']==4 and read_glb(h)[1]['joints']==75 and read_glb(n)[1]['npot']==1
    with tempfile.TemporaryDirectory() as tmp:
        t=Path(tmp);m=t/'morph';hstage=t/'helper';base=t/'base';bad=t/'bad';incomplete=t/'incomplete';incomplete.mkdir()
        assert stage([a,h,b],caps,m)['selected']==str(a)
        assert stage([a,h,b],c1,hstage)['selected']==str(h)
        assert stage([a,h,n,b],c2,base)['selected']==str(b)
        assert stage([a,h,n],c2,t/'none')['selected'] is None and not (t/'none').exists()
        assert stage([b],dict(c2,translationTracks=False),t/'no-tracks')['selected'] is None
        assert stage([b],dict(c2,maxTexture=1),t/'small')['selected'] is None
        try:stage([b],c2,base)
        except FileExistsError:pass
        else:raise AssertionError('overwrote existing stage')
        stage([b],c2,bad);x=bytearray((bad/'model.glb').read_bytes());x[-1]^=1;(bad/'model.glb').write_bytes(x)
        corrupt=t/'corrupt.glb';corrupt.write_bytes(b'not a GLB')
        assert stage([corrupt,b],c2,t/'fallback')['selected']==str(b)
        exe=t/'smoke';subprocess.run(['g++','-std=c++17','-O2','-Wall','-Wextra','-Werror',str(ROOT/'smoke.cpp'),'-o',str(exe)],check=True)
        result=subprocess.run([str(exe),str(m),str(hstage),str(bad),str(incomplete)],check=True,capture_output=True,text=True)
        print(result.stdout.strip())
        report={'syntheticFixtures':4,'pythonCases':8,'nativeCases':7,'nativeCompiler':subprocess.check_output(['g++','--version'],text=True).splitlines()[0],
                'fixtureRequirements':{p.name:read_glb(p)[1] for p in (a,h,b,n)},'engineApplied':False,'nativeImporter':'test resource only; no S2/S3 renderer'}
        (ROOT/'PRODUCTION_REPORT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
