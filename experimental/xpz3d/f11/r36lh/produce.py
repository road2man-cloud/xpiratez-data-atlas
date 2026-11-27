#!/usr/bin/env python3
"""Produce an articulated, non-game test asset and actual converted packets/OBJs."""
import hashlib,json,math,struct,subprocess,tempfile,sys
from pathlib import Path
from xpz_packet import Converter
ROOT=Path(__file__).resolve().parent

def fixture(path):
    g={'asset':{'version':'2.0','generator':'XPZ synthetic two-link beam'},'buffers':[{}],'bufferViews':[],'accessors':[], 'nodes':[{'name':'Root','children':[1]},{'name':'Hinge','translation':[1,0,0]},{'name':'Beam','mesh':0,'skin':0}], 'skins':[{'joints':[0,1],'skeleton':0}], 'scenes':[{'nodes':[0,2]}],'scene':0}
    b=bytearray()
    def acc(v,fmt,typ,cols,target=None,**extra):
        b.extend(b'\0'*(-len(b)%4));raw=struct.pack('<'+fmt*len(v),*v);view={'buffer':0,'byteOffset':len(b),'byteLength':len(raw)}
        if target:view['target']=target
        i=len(g['bufferViews']);g['bufferViews'].append(view);b.extend(raw)
        a={'bufferView':i,'componentType':{'f':5126,'H':5123,'B':5121}[fmt],'count':len(v)//cols,'type':typ,**extra};g['accessors'].append(a);return len(g['accessors'])-1
    # Two flat rectangular links, middle edge blends the two joints.
    pos=[0,0,0,0,.2,0,1,0,0,1,.2,0,2,0,0,2,.2,0]
    P=acc(pos,'f','VEC3',3,34962,min=[0,0,0],max=[2,.2,0]);N=acc([0,0,1]*6,'f','VEC3',3,34962);J=acc([0,1,0,0]*6,'H','VEC4',4,34962)
    W=acc([255,0,0,0]*2+[128,127,0,0]*2+[0,255,0,0]*2,'B','VEC4',4,34962,normalized=True)
    I=acc([0,2,1,1,2,3,2,4,3,3,4,5],'H','SCALAR',1,34963)
    UV=acc([0,0,0,1,.5,0,.5,1,1,0,1,1],'f','VEC2',2,34962)
    D=acc([0,0,0]*4+[0,0,.2]*2,'f','VEC3',3,34962,min=[0,0,0],max=[0,0,.2]);g['meshes']=[{'name':'Synthetic beam','primitives':[{'attributes':{'POSITION':P,'NORMAL':N,'JOINTS_0':J,'WEIGHTS_0':W,'TEXCOORD_0':UV},'indices':I,'targets':[{'POSITION':D}]}],'weights':[0]}]
    ib=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];g['skins'][0]['inverseBindMatrices']=acc(ib+ib[:12]+[-1,0,0,1],'f','MAT4',16)
    t=acc([0,1],'f','SCALAR',1,min=[0],max=[1]);q=math.sqrt(.5);r=acc([0,0,0,1,0,0,q,q],'f','VEC4',4);tr=acc([0,0,0,0,.4,0],'f','VEC3',3);mw=acc([0,1],'f','SCALAR',1)
    g['animations']=[{'name':'Hinge90','samplers':[{'input':t,'output':r},{'input':t,'output':tr},{'input':t,'output':mw}],'channels':[{'sampler':0,'target':{'node':1,'path':'rotation'}},{'sampler':1,'target':{'node':0,'path':'translation'}},{'sampler':2,'target':{'node':2,'path':'weights'}}]}]
    g['buffers'][0]['byteLength']=len(b);b.extend(b'\0'*(-len(b)%4));j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)
def vertices(path):return [tuple(map(float,l.split()[1:])) for l in path.read_text().splitlines() if l.startswith('v ')]
def close(x,y):assert len(x)==len(y) and max(abs(a-b) for a,b in zip(x,y))<1e-6,(x,y)
def main():
    out=ROOT/'output';out.mkdir(exist_ok=True);asset=out/'hinge_demo.glb';fixture(asset)
    compiler=subprocess.check_output(['g++','--version'],text=True).splitlines()[0]
    records=[]
    with tempfile.TemporaryDirectory() as tmp:
        exe=Path(tmp)/'mesh_export';subprocess.run(['g++','-std=c++17','-O2','-Wall','-Wextra','-Werror',str(ROOT/'mesh_export.cpp'),'-o',str(exe)],check=True)
        for p in [asset]+sorted(ROOT.glob('*.glb')):
            packet=Converter(p).convert();dst=out/(p.stem+'.xpzp');dst.write_bytes(packet.bytes());records.append({'source':p.name,'packet':dst.name,'sections':len(packet.parts),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
        def run(name,node,clip,t):
            dst=out/f'{name}.obj';dst.unlink(missing_ok=True);subprocess.run([str(exe),str(out/('hinge_demo.xpzp' if name.startswith('hinge') else 'morph63.xpzp')),str(node),'0',str(clip),str(t),str(dst)],check=True);return vertices(dst)
        rest=run('hinge_rest',2,-1,0);mid=run('hinge_half',2,0,.5);end=run('hinge_end',2,0,1)
        close(rest[-2],(2,0,0));close(mid[-2],(1+math.sqrt(.5),.2+math.sqrt(.5),.1));close(end[-2],(1,1.4,.2));close(end[0],(0,.4,0));close(end[-1],(.8,1.4,.2))
        if (out/'morph63.xpzp').exists():
            v=run('morph63_mid',63,0,.5);close(v[1],(1,.05,.1))
        # Corrupt packet rejection and missing-clip rejection. No engine claims.
        bad=Path(tmp)/'bad.xpzp';bad.write_bytes((out/'hinge_demo.xpzp').read_bytes()[:-1]);rejected=Path(tmp)/'reject.obj'
        for p,clip in [(bad,0),(out/'hinge_demo.xpzp',99)]:
            r=subprocess.run([str(exe),str(p),'2','0',str(clip),'0',str(rejected)],capture_output=True,text=True);assert r.returncode!=0 and not rejected.exists()
    report={'revision':'R36LH','compiler':compiler,'packets':records,'articulatedDemo':{'vertices':6,'triangles':4,'joints':2,'morphs':1,'outputs':['hinge_rest.obj','hinge_half.obj','hinge_end.obj'],'endVertexRest':rest[-2],'endVertexHalf':mid[-2],'endVertexEnd':end[-2]},'nativeOutputChecks':'5 analytic hinge position checks, morph63 optional, truncated packet and missing clip rejected','engineApplied':False,'gameAssetsModified':False}
    (out/'PRODUCTION_REPORT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
