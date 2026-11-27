#!/usr/bin/env python3
"""Generate an instanced, multi-material test scene with an inactive node."""
import io,json,struct,sys
from pathlib import Path
from PIL import Image

def fixture(path):
    g={'asset':{'version':'2.0'},'buffers':[{}],'bufferViews':[],'accessors':[],'nodes':[{'mesh':0},{'mesh':0,'translation':[2,0,0]},{'mesh':0,'translation':[99,0,0]}],'scenes':[{'nodes':[0,1]},{'nodes':[2]}],'scene':0}
    b=bytearray()
    def view(raw):
        b.extend(b'\0'*(-len(b)%4));i=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(raw)});b.extend(raw);return i
    def acc(vals,fmt,typ,cols):
        i=len(g['accessors']);g['accessors'].append({'bufferView':view(struct.pack('<'+fmt*len(vals),*vals)),'componentType':5126 if fmt=='f' else 5123,'count':len(vals)//cols,'type':typ});return i
    p=acc([0,0,0,1,0,0,0,1,0,1,1,0],'f','VEC3',3);u=acc([0,0,1,0,0,1,1,1],'f','VEC2',2)
    i=acc([0,1,2],'H','SCALAR',1);j=acc([2,1,3],'H','SCALAR',1)
    g['meshes']=[{'primitives':[{'attributes':{'POSITION':p,'TEXCOORD_0':u},'indices':i,'material':0},{'attributes':{'POSITION':p,'TEXCOORD_0':u},'indices':j,'material':1}]}]
    img=Image.new('RGBA',(4,4),(160,120,80,192));buf=io.BytesIO();img.save(buf,format='PNG');g['images']=[{'bufferView':view(buf.getvalue()),'mimeType':'image/png'}];g['textures']=[{'source':0}]
    g['materials']=[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}},{'alphaMode':'BLEND','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'baseColorFactor':[.5,1,1,.5]}}]
    g['buffers'][0]['byteLength']=len(b);b.extend(b'\0'*(-len(b)%4));raw=json.dumps(g,separators=(',',':')).encode();raw+=b' '*(-len(raw)%4)
    Path(path).write_bytes(struct.pack('<III',0x46546c67,2,28+len(raw)+len(b))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(b),0x004e4942)+b)
if __name__=='__main__':fixture(sys.argv[1])
