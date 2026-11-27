#!/usr/bin/env python3
"""Produce a complete static pose package from GLB/XPZPKT1; no engine installation."""
import argparse, hashlib, json, math, pathlib, struct, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parent
sys.path[:0]=[str(ROOT.parent/'r36lh'),str(ROOT.parent/'r36lk')]
from xpz_packet import Converter
from material_stage import stage as stage_material, read_packet, blob

def need(ok,msg):
    if not ok: raise ValueError(msg)

def ints(sec,key):
    k,r,c,b=sec[key];need(k==4 and c==1,'bad signed column '+key)
    return list(struct.unpack('<'+'i'*r,b))

def selected(sec,cat):
    parents=ints(sec,'node/parent');meshes=ints(sec,'node/mesh');n=len(parents)
    need(n==len(meshes),'node array mismatch')
    children=[[] for _ in parents]
    for i,p in enumerate(parents):
        need(-1<=p<n,'invalid parent')
        if p>=0:children[p].append(i)
    scenes=cat.get('scenes',[]);si=cat.get('scene',0)
    if scenes:
        need(type(si) is int and 0<=si<len(scenes),'invalid scene');roots=scenes[si].get('nodes',[])
    else:roots=[i for i,p in enumerate(parents) if p==-1]
    visited=set();queue=list(roots)
    while queue:
        i=queue.pop();need(type(i) is int and 0<=i<n,'bad scene node')
        if i in visited:continue
        visited.add(i);queue.extend(children[i])
    return [(i,meshes[i]) for i in sorted(visited) if meshes[i]>=0]

def produce(source,out,clip=-1,time=0,axis='identity',scale=1,cxx='g++'):
    source=pathlib.Path(source).resolve();out=pathlib.Path(out).resolve();need(not out.exists(),'output already exists')
    need(axis in ('identity','zup') and math.isfinite(scale) and scale>0 and math.isfinite(time) and clip>=-1,'invalid pose')
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.r36ll-',dir=out.parent) as tmp:
        temp=pathlib.Path(tmp);root=temp/'package';root.mkdir();packet=root/'model.xpzp'
        if source.suffix.lower()=='.glb':packet.write_bytes(Converter(source).convert().bytes())
        else:need(source.suffix.lower()=='.xpzp','unsupported input');packet.write_bytes(source.read_bytes())
        sec=read_packet(packet);cat=json.loads(blob(sec,'catalog.json'));nodes=selected(sec,cat);need(nodes,'no active mesh nodes')
        plan=stage_material(packet,root/'textures');materials={m['id']:m for m in plan['materials']};bindings={(m['mesh'],m['primitive']):m['material'] for m in plan['primitives']}
        exe=temp/'export';subprocess.run([cxx,'-std=c++17','-O2','-Wall','-Wextra',str(ROOT/'export.cpp'),'-o',str(exe)],check=True)
        (root/'meshes').mkdir();records=[]
        for node,mesh in nodes:
            prims=cat['primitiveCounts'][mesh]
            for prim in range(prims):
                rel=f'meshes/n{node}_p{prim}';dest=root/rel
                rec=json.loads(subprocess.check_output([str(exe),str(packet),str(node),str(prim),str(clip),str(time),axis,str(scale),str(dest)],text=True))
                mid=bindings[(mesh,prim)];need(rec['material']==mid,'mesh/material mismatch');mat=materials[mid];b=mat['bindings'].get('baseColor',{})
                issues=list(b.get('issues',[]));limits=list(mat['limitations']);wrap=b.get('engineWrapCandidate','WRAP')
                tex='textures/'+mat['baseMMP']['file'];need((root/tex).is_file(),'missing texture')
                rec.update(node=node,mesh=mesh,primitive=prim,directory=rel,baseMMP=tex,wrapCandidate=wrap,alphaFlagsCandidate=mat['engineAlphaFlagsCandidate'],issues=issues,limitations=limits)
                for file,bytes_ in [('vertices32.bin',32*rec['vertices']),('indices16.bin',6*rec['triangles']),('polys16.bin',2*(rec['triangles']+1))]:need((dest/file).stat().st_size==bytes_,'native size mismatch')
                records.append(rec)
        need(records,'no primitive output')
        result={'format':'R36LL-STATIC-PACKAGE-1','source':source.name,'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'pose':{'clip':clip,'time':time,'axis':axis,'scale':scale},'engineApplied':False,'nativePacking':'reference packing; engine CalcCompactVector rounding not verified','nodes':len(nodes),'primitives':records,'counts':{'vertices':sum(x['vertices'] for x in records),'triangles':sum(x['triangles'] for x in records),'materialsUsed':len({x['material'] for x in records}),'mmp':plan['counts']['mmp']},'files':{p.relative_to(root).as_posix():{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(root.rglob('*')) if p.is_file()}}
        (root/'package.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        need(not out.exists(),'output appeared during build');root.rename(out)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('output');p.add_argument('--clip',type=int,default=-1);p.add_argument('--time',type=float,default=0);p.add_argument('--axis',choices=['identity','zup'],default='identity');p.add_argument('--scale',type=float,default=1);p.add_argument('--cxx',default='g++');a=p.parse_args();print(json.dumps(produce(a.source,a.output,a.clip,a.time,a.axis,a.scale,a.cxx)['counts']))
