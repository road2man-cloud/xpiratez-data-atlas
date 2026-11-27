#!/usr/bin/env python3
"""GLB 2.0 -> XPZPKT1, a portable little-endian engine interchange packet.
Not a Silent Storm native DB/model writer. Strict supported subset, no network.
"""
import argparse,json,math,struct,sys
from pathlib import Path
MAX=64*1024*1024
TYPES={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
DIMS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def need(x,msg):
    if not x:raise ValueError(msg)
def index(seq,i):
    need(type(i) is int and 0<=i<len(seq),'index out of bounds');return seq[i]
def read(path):
    with open(path,'rb') as f:raw=f.read(MAX+1)
    need(28<=len(raw)<=MAX and struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw)),'invalid GLB header')
    n,t=struct.unpack_from('<II',raw,12);need(n%4==0 and t==0x4e4f534a and n+28<=len(raw),'invalid JSON chunk')
    def unique(pairs):
        d={}
        for k,v in pairs:need(k not in d,'duplicate JSON key');d[k]=v
        return d
    g=json.loads(raw[20:20+n],object_pairs_hook=unique);m,t=struct.unpack_from('<II',raw,20+n)
    need(t==0x004e4942 and m%4==0 and 28+n+m==len(raw),'invalid BIN chunk')
    need(g['asset']['version']=='2.0' and not g.get('extensionsRequired'),'unsupported version/extension')
    need(len(g['buffers'])==1 and 'uri' not in g['buffers'][0],'external/multiple buffers')
    length=g['buffers'][0]['byteLength'];need(type(length)is int and 0<=length<=m<=length+3,'buffer size')
    return g,memoryview(raw)[28+n:28+n+length]
class Packet:
    def __init__(self):self.parts={};self.size=12
    def put(self,name,kind,rows,cols,raw):
        n=name.encode('ascii');need(0<len(n)<=200 and name not in self.parts and rows>=0 and cols>0 and kind in (1,2,3,4),'bad section')
        need(len(raw)==rows*cols*(1 if kind==3 else 4),'section dimensions')
        self.size+=20+len(n)+len(raw);need(self.size<=MAX,'packet size limit')
        self.parts[name]=(kind,rows,cols,raw)
    def array(self,name,rows,cols,values,kind=1):
        v=list(values);need(len(v)==rows*cols and rows*cols<=MAX//4,'array length')
        if kind==1:need(all(math.isfinite(x) for x in v),'nonfinite float')
        self.put(name,kind,rows,cols,struct.pack('<'+{1:'f',2:'I',4:'i'}[kind]*len(v),*v))
    def blob(self,name,b):self.put(name,3,len(b),1,b)
    def bytes(self):
        out=bytearray(b'XPZPKT1\0'+struct.pack('<I',len(self.parts)))
        for name,(kind,rows,cols,b) in self.parts.items():
            n=name.encode('ascii');out+=struct.pack('<5I',len(n),kind,rows,cols,len(b))+n+b
        return out
class Converter:
    def __init__(self,path):self.g,self.b=read(path);self.p=Packet();self.cache={}
    def view(self,i):
        v=index(self.g['bufferViews'],i);off=v.get('byteOffset',0);n=v['byteLength'];need(v['buffer']==0 and type(off)is int and type(n)is int and 0<=off<=off+n<=len(self.b),'invalid buffer view');return v,self.b[off:off+n]
    def accessor(self,i):
        if i in self.cache:return self.cache[i]
        a=index(self.g['accessors'],i);need(not a.get('sparse') and 'bufferView'in a,'sparse/missing accessor view unsupported')
        c=a['componentType'];fmt,width=TYPES[c];d=DIMS[a['type']];n=a['count'];v,raw=self.view(a['bufferView']);stride=v.get('byteStride',width*d);off=a.get('byteOffset',0)
        need(type(n)is int and 0<n<=MAX//4//d and type(off)is int and off>=0 and type(stride)is int and stride>=d*width and stride%width==0 and off+(n-1)*stride+d*width<=len(raw),'invalid accessor extent')
        values=[x for row in range(n) for x in struct.unpack_from('<'+fmt*d,raw,off+row*stride)]
        if a.get('normalized'):
            need(c in (5120,5121,5122,5123),'invalid normalization');den={5120:127,5121:255,5122:32767,5123:65535}[c];values=[max(-1,x/den) for x in values]
        self.cache[i]=(n,d,values,a);return self.cache[i]
    def emit(self,name,i,kind=1,count=None,cols=None):
        n,d,v,a=self.accessor(i);need((count is None or n==count) and (cols is None or d==cols),'accessor shape mismatch')
        if kind==2:need(a['componentType'] in (5121,5123,5125) and not a.get('normalized'),'expected unsigned integer accessor')
        self.p.array(name,n,d,v,kind);return n,d,v
    def convert(self):
        g,p=self.g,self.p;nodes=g['nodes'];meshes=g['meshes'];skins=g.get('skins',[]);parents=[-1]*len(nodes)
        for i,n in enumerate(nodes):
            need('matrix' not in n,'matrix nodes unsupported; convert to TRS first')
            for c in n.get('children',[]):index(nodes,c);need(parents[c]==-1 and c!=i,'multiple parents/self child');parents[c]=i
        for i in range(len(nodes)):
            seen=set();j=i
            while j!=-1:need(j not in seen,'node cycle');seen.add(j);j=parents[j]
        for name,vals in [('parent',parents),('mesh',[n.get('mesh',-1) for n in nodes]),('skin',[n.get('skin',-1) for n in nodes])]:p.array('node/'+name,len(nodes),1,vals,4)
        for n in nodes:
            if 'mesh'in n:index(meshes,n['mesh'])
            if 'skin'in n:index(skins,n['skin']);need('mesh'in n,'skin without mesh')
        for name,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]:
            vals=[]
            for n in nodes:
                v=n.get(name,default);need(len(v)==len(default),'bad TRS width')
                if name=='rotation':need(abs(sum(x*x for x in v)-1)<.001,'non-unit quaternion')
                vals.extend(v)
            p.array('node/'+name,len(nodes),len(default),vals)
        for i,n in enumerate(nodes):
            if 'weights'in n:
                need('mesh'in n,'node morph weights without mesh');p.array(f'node/{i}/weights',1,len(n['weights']),n['weights'])
        for i,s in enumerate(skins):
            js=s['joints'];need(js and len(set(js))==len(js),'invalid joint list');[index(nodes,j) for j in js]
            pre=f'skin/{i}/';p.array(pre+'joints',len(js),1,js,2)
            if 'inverseBindMatrices'in s:self.emit(pre+'inverseBind',s['inverseBindMatrices'],count=len(js),cols=16)
            else:p.array(pre+'inverseBind',len(js),16,[float(x%5==0) for _ in js for x in range(16)])
        mesh_counts=[]
        for i,m in enumerate(meshes):
            prims=m['primitives'];need(prims,'empty mesh');counts={len(q.get('targets',[])) for q in prims};need(len(counts)==1,'inconsistent morph count');mc=counts.pop();mesh_counts.append(mc)
            default=m.get('weights',[0.]*mc);need(len(default)==mc,'mesh morph weight mismatch')
            if mc:p.array(f'mesh/{i}/weights',1,mc,default)
            for j,q in enumerate(prims):
                pre=f'mesh/{i}/prim/{j}/';need(q.get('mode',4)==4,'non-triangle mode');a=q['attributes'];n,_,_=self.emit(pre+'POSITION',a['POSITION'],cols=3)
                for k,x in a.items():
                    if k=='POSITION':continue
                    need(k in ('NORMAL','TANGENT','COLOR_0','TEXCOORD_0','TEXCOORD_1','JOINTS_0','WEIGHTS_0'),'unsupported vertex semantic '+k)
                    self.emit(pre+k,x,2 if k=='JOINTS_0' else 1,n,{'NORMAL':3,'TANGENT':4,'TEXCOORD_0':2,'TEXCOORD_1':2,'JOINTS_0':4,'WEIGHTS_0':4}.get(k))
                need(('JOINTS_0'in a)==('WEIGHTS_0'in a),'joint/weight mismatch')
                if 'JOINTS_0'in a:
                    _,_,js,_=self.accessor(a['JOINTS_0']);_,_,ws,_=self.accessor(a['WEIGHTS_0']);need(all(w>=0 for w in ws) and all(abs(sum(ws[k:k+4])-1)<.002 for k in range(0,len(ws),4)),'invalid weights')
                    for nd in nodes:
                        if nd.get('mesh')==i and 'skin'in nd:need(max(js)<len(skins[nd['skin']]['joints']),'joint index exceeds skin')
                if 'indices'in q:ni,_,ix=self.emit(pre+'indices',q['indices'],2,cols=1)
                else:ni=n;ix=list(range(n));p.array(pre+'indices',n,1,ix,2)
                need(ni%3==0 and max(ix)<n,'invalid triangle indices')
                mi=q.get('material',-1)
                if mi!=-1:index(g.get('materials',[]),mi)
                p.array(pre+'material',1,1,[mi],4)
                for k,t in enumerate(q.get('targets',[])):
                    for sem,ai in t.items():need(sem in ('POSITION','NORMAL','TANGENT') and sem in a,'unsupported morph semantic');self.emit(pre+f'morph/{k}/'+sem,ai,count=n,cols=3)
        for i,clip in enumerate(g.get('animations',[])):
            p.array(f'anim/{i}/exists',1,1,[1],2)
            for ch in clip['channels']:
                target=ch['target'];nd=target['node'];node=index(nodes,nd);path=target['path'];need(path in ('rotation','translation','scale','weights'),'unsupported track');s=index(clip['samplers'],ch['sampler']);mode=s.get('interpolation','LINEAR');need(mode in ('LINEAR','STEP'),'unsupported interpolation')
                pre=f'anim/{i}/{nd}/{path}/';n,d,times,a=self.accessor(s['input']);need(d==1 and a['componentType']==5126 and all(math.isfinite(x) and x>=0 for x in times) and all(b>a for a,b in zip(times,times[1:])),'bad animation times');p.array(pre+'times',n,1,times)
                r,d,vals,a=self.accessor(s['output']);cols={'rotation':4,'translation':3,'scale':3}.get(path)
                if path=='weights':cols=mesh_counts[node['mesh']];need(cols>0 and d==1 and r==n*cols,'invalid weight track')
                else:need(r==n and d==cols,'animation output shape')
                if path=='rotation':need(all(abs(sum(x*x for x in vals[k:k+4])-1)<.002 for k in range(0,len(vals),4)),'non-unit key quaternion')
                p.array(pre+'values',n,cols,vals);p.array(pre+'step',1,1,[int(mode=='STEP')],2)
        for i,n in enumerate(nodes):
            if 'weights'in n:need(len(n['weights'])==mesh_counts[n['mesh']],'node morph weights mismatch')
        for i,im in enumerate(g.get('images',[])):
            need('uri'not in im and im.get('mimeType')=='image/png','only embedded PNG supported');v,b=self.view(im['bufferView']);need(len(b)>=33 and bytes(b[:8])==b'\x89PNG\r\n\x1a\n','invalid PNG');p.blob(f'image/{i}/png',bytes(b))
        # Preserve material, texture and sampler declarations and original names;
        # they are metadata, not yet native engine resources.
        metadata={k:g.get(k,[]) for k in ('materials','textures','samplers','scenes')};metadata.update(nodeNames=[n.get('name','') for n in nodes],meshNames=[m.get('name','') for m in meshes],animationNames=[a.get('name','') for a in g.get('animations',[])],primitiveCounts=[len(m['primitives']) for m in meshes],morphCounts=mesh_counts,skinCount=len(skins),scene=g.get('scene',0))
        p.blob('catalog.json',json.dumps(metadata,ensure_ascii=True,separators=(',',':')).encode());return p

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('input');a.add_argument('output');args=a.parse_args()
    try:
        p=Converter(args.input).convert();raw=p.bytes()
        with open(args.output,'xb') as f:f.write(raw)
        print(json.dumps({'sections':len(p.parts),'bytes':len(raw),'output':args.output,'engineApplied':False}))
    except (OSError,ValueError,KeyError,TypeError,IndexError,OverflowError,struct.error) as e:print('ERROR:',e,file=sys.stderr);return 1
    return 0
if __name__=='__main__':sys.exit(main())
