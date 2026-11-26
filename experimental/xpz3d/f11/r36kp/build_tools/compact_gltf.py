#!/usr/bin/env python3
"""Lossless glTF reference graph compaction for single-buffer static F11 GLBs.

Removes unused old atlas images and accessor/bufferView payloads while retaining
full decoded geometry and material content of the active mesh; no quantization.
"""
from __future__ import annotations
import copy

def compact(g, B):
    g=copy.deepcopy(g)
    materials=list(g.get('materials',[]))
    tex=list(g.get('textures',[]))
    img=list(g.get('images',[]))
    samplers=list(g.get('samplers',[]))
    oldAccessors=list(g['accessors']);oldViews=list(g['bufferViews'])
    usedm=set()
    for mesh in g.get('meshes',[]):
        for p in mesh['primitives']:
            if 'material' in p:usedm.add(p['material'])
    usedm=sorted(usedm);mapm={k:i for i,k in enumerate(usedm)}
    g['materials']=[materials[k] for k in usedm]
    for mesh in g.get('meshes',[]):
        for p in mesh['primitives']:
            if 'material' in p:p['material']=mapm[p['material']]
    usedt=set()
    def texrefs(mat):
        pbr=mat.get('pbrMetallicRoughness') or {}
        for ref in [pbr.get('baseColorTexture'),pbr.get('metallicRoughnessTexture'),mat.get('normalTexture'),mat.get('occlusionTexture'),mat.get('emissiveTexture')]:
            if isinstance(ref,dict) and 'index' in ref:yield ref
        for key,value in (mat.get('extensions') or {}).items():
            if isinstance(value,dict):
                for v in value.values():
                    if isinstance(v,dict) and 'index' in v:yield v
    for m in g['materials']:
        for r in texrefs(m):usedt.add(r['index'])
    usedt=sorted(usedt);mapt={v:i for i,v in enumerate(usedt)}
    g['textures']=[copy.deepcopy(tex[i]) for i in usedt]
    for m in g['materials']:
        for r in texrefs(m):r['index']=mapt[r['index']]
    usedi=sorted({t['source'] for t in g['textures'] if 'source' in t})
    mapi={v:i for i,v in enumerate(usedi)}
    g['images']=[copy.deepcopy(img[i]) for i in usedi]
    useds=sorted({t['sampler'] for t in g['textures'] if 'sampler' in t})
    maps={v:i for i,v in enumerate(useds)}
    g['samplers']=[copy.deepcopy(samplers[i]) for i in useds]
    for t in g['textures']:
        if 'source' in t:t['source']=mapi[t['source']]
        if 'sampler' in t:t['sampler']=maps[t['sampler']]
    useda=set()
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            if p.get('indices') is not None:useda.add(p['indices'])
            useda.update(p.get('attributes',{}).values())
            for target in p.get('targets',[]):useda.update(target.values())
    for skin in g.get('skins',[]):
        if 'inverseBindMatrices' in skin:useda.add(skin['inverseBindMatrices'])
    for anim in g.get('animations',[]):
        for sampler in anim['samplers']:
            useda.add(sampler['input']);useda.add(sampler['output'])
    useda=sorted(useda);mapa={v:i for i,v in enumerate(useda)}
    g['accessors']=[copy.deepcopy(oldAccessors[i]) for i in useda]
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            if 'indices' in p:p['indices']=mapa[p['indices']]
            for k,v in p.get('attributes',{}).items():p['attributes'][k]=mapa[v]
            for t in p.get('targets',[]):
                for k,v in t.items():t[k]=mapa[v]
    for s in g.get('skins',[]):
        if 'inverseBindMatrices' in s:s['inverseBindMatrices']=mapa[s['inverseBindMatrices']]
    for a in g.get('animations',[]):
        for s in a['samplers']:
            s['input']=mapa[s['input']];s['output']=mapa[s['output']]
    usedv=set()
    for a in g['accessors']:
        if 'bufferView' in a:usedv.add(a['bufferView'])
        if 'sparse' in a:
            usedv.add(a['sparse']['indices']['bufferView'])
            usedv.add(a['sparse']['values']['bufferView'])
    for i in g['images']:
        if 'bufferView' in i:usedv.add(i['bufferView'])
    usedv=sorted(usedv);mapv={k:i for i,k in enumerate(usedv)}
    newB=bytearray();views=[]
    for oldid in usedv:
        old=oldViews[oldid]
        assert old.get('buffer',0)==0
        newB.extend(b'\0'*(-len(newB)%4))
        off=len(newB);start=old.get('byteOffset',0);n=old['byteLength']
        newB.extend(B[start:start+n]);
        v=copy.deepcopy(old);v['buffer']=0;v['byteOffset']=off;views.append(v)
    g['bufferViews']=views
    for a in g['accessors']:
        if 'bufferView' in a:a['bufferView']=mapv[a['bufferView']]
        if 'sparse' in a:
            a['sparse']['indices']['bufferView']=mapv[a['sparse']['indices']['bufferView']]
            a['sparse']['values']['bufferView']=mapv[a['sparse']['values']['bufferView']]
    for i in g['images']:
        if 'bufferView' in i:i['bufferView']=mapv[i['bufferView']]
    g['buffers']=[{'byteLength':len(newB)}]
    report={'oldBinaryBytes':len(B),'newBinaryBytes':len(newB),
            'materialCountBefore':len(materials),'materialCountAfter':len(g['materials']),
            'imagesBefore':len(img),'imagesAfter':len(g['images']),
            'accessorsBefore':len(oldAccessors),'accessorsAfter':len(g['accessors']),
            'bufferViewsBefore':len(oldViews),'bufferViewsAfter':len(views),
            'texturesBefore':len(tex),'texturesAfter':len(g['textures'])}
    return g,newB,report
