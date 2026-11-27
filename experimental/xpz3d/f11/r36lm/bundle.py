#!/usr/bin/env python3
"""Pack R36LL static scene into a bounded, self-contained engine handoff."""
import hashlib,json,struct,sys
from pathlib import Path

def pack(root,out):
    root=Path(root).resolve(); out=Path(out); m=json.loads((root/'package.json').read_text()); assert m['format']=='R36LL-STATIC-PACKAGE-1'
    def read(name):
        p=(root/name).resolve(); p.relative_to(root); b=p.read_bytes(); info=m['files'][name]
        if len(b)!=info['bytes'] or hashlib.sha256(b).hexdigest()!=info['sha256']: raise ValueError(name)
        return b
    textures={}; records=[]
    for p in m['primitives']:
        name=p['baseMMP']; key=(name,p['wrapCandidate']);
        if key not in textures: textures[key]=(len(textures),read(name))
        d=p['directory']; v,i,o=[read(d+'/'+n) for n in ('vertices32.bin','indices16.bin','polys16.bin')]
        if len(v)!=32*p['vertices'] or len(i)!=6*p['triangles'] or len(o)!=2*(p['triangles']+1): raise ValueError(d)
        if p['wrapCandidate'] not in ('WRAP','CLAMP'): raise ValueError('unsupported wrap')
        if p['issues']: raise ValueError(str(p['issues']))
        records.append((p,textures[key][0],v,i,o))
    b=bytearray(struct.pack('<8sII',b'XPZSCN1\0',len(textures),len(records)))
    for (name,wrap),(idx,data) in textures.items(): b.extend(struct.pack('<II',int(wrap=='WRAP'),len(data))+data)
    for p,t,v,i,o in records:
        b.extend(struct.pack('<IIIiIIII',p['node'],p['primitive'],t,p['material'],p['alphaFlagsCandidate'],len(v),len(i),len(o))+v+i+o)
    if len(b)>64*1024*1024: raise ValueError('bundle too large')
    with out.open('xb') as f:f.write(b)
    return {'textures':len(textures),'primitives':len(records),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
if __name__=='__main__': print(json.dumps(pack(*sys.argv[1:])))
