"""Small lossless, single-buffer glTF 2.0 reader/writer for the pinned F11 asset.
Reject unsupported compressed/sparse data rather than silently changing it.
"""
from __future__ import annotations
import copy, hashlib, io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image
DT={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
DIM={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def sha(data):return hashlib.sha256(data).hexdigest()
def unit(x):return x/np.maximum(np.linalg.norm(x,axis=-1,keepdims=True),1e-12)
def load(path):
 raw=Path(path).read_bytes()
 if len(raw)<28 or struct.unpack_from('<III',raw)!=(0x46546c67,2,len(raw)):raise ValueError('Invalid GLB header')
 chunks={};off=12
 while off<len(raw):
  n,t=struct.unpack_from('<II',raw,off);off+=8
  chunks[t]=raw[off:off+n];off+=n
 if off!=len(raw):raise ValueError('Invalid GLB chunks')
 g=json.loads(chunks[0x4e4f534a]);b=bytearray(chunks[0x004e4942])
 if len(g['buffers'])!=1 or g.get('extensionsRequired'):raise ValueError('Unsupported GLB extensions/buffers')
 return g,b

def arr(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']]
 if a.get('sparse'):raise ValueError('Sparse accessor unsupported')
 dtype=np.dtype(DT[a['componentType']]);d=DIM[a['type']]
 return np.ndarray((a['count'],d),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',d*dtype.itemsize),dtype.itemsize)).copy()

def view(g,b,data,target=None):
 b.extend(b'\0'*(-len(b)%4));v={'buffer':0,'byteOffset':len(b),'byteLength':len(data)}
 if target is not None:v['target']=target
 i=len(g['bufferViews']);g['bufferViews'].append(v);b.extend(data);return i

def accessor(g,b,values,template=None,typ=None,component=5126,target=34962):
 a=copy.deepcopy(template) if template else {'type':typ,'componentType':component}
 a.pop('sparse',None);a.pop('byteOffset',None);a.pop('min',None);a.pop('max',None)
 x=np.ascontiguousarray(values,dtype=np.dtype(DT[a['componentType']])).reshape(-1,DIM[a['type']])
 a['count']=len(x);a['bufferView']=view(g,b,x.tobytes(),target)
 if a['type']=='VEC3':a.update(min=x.min(axis=0).astype(float).tolist(),max=x.max(axis=0).astype(float).tolist())
 i=len(g['accessors']);g['accessors'].append(a);return i

def primitive(g,b,pi):
 p=g['meshes'][0]['primitives'][pi]
 return {k:arr(g,b,i) for k,i in p['attributes'].items()},arr(g,b,p['indices']).reshape(-1,3).astype(int)

def replace(g,b,pi,values,indices):
 p=g['meshes'][0]['primitives'][pi];attrs={}
 for k,x in values.items():
  templ=g['accessors'][p['attributes'][k]] if k in p['attributes'] else None
  typ={'TANGENT':'VEC4','TEXCOORD_1':'VEC2'}.get(k)
  attrs[k]=accessor(g,b,x,templ,typ)
 p['attributes']=attrs
 p['indices']=accessor(g,b,np.asarray(indices).reshape(-1,1),typ='SCALAR',component=5123 if len(values['POSITION'])<65536 else 5125,target=34963)

def image_bytes(g,b,i):
 v=g['bufferViews'][g['images'][i]['bufferView']];s=v.get('byteOffset',0)
 return bytes(b[s:s+v['byteLength']])
def image(g,b,i):return np.asarray(Image.open(io.BytesIO(image_bytes(g,b,i))).convert('RGB'))
def png(x):
 f=io.BytesIO();Image.fromarray(np.asarray(x,dtype='uint8')).save(f,format='PNG',optimize=True);return f.getvalue()
def replace_image(g,b,i,data,name):
 g['images'][i]={'bufferView':view(g,b,data),'mimeType':'image/png','name':name}

def pack(g,b):
 # Rebuild live accessor/view graph. Material, texture, image indices stay stable.
 g=copy.deepcopy(g);used=set()
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   used.update(p['attributes'].values());used.add(p['indices'])
   for t in p.get('targets',[]):used.update(t.values())
 for s in g.get('skins',[]):
  if 'inverseBindMatrices' in s:used.add(s['inverseBindMatrices'])
 for anim in g.get('animations',[]):
  for s in anim['samplers']:used.update((s['input'],s['output']))
 ids=sorted(used);mp={v:i for i,v in enumerate(ids)}
 g['accessors']=[g['accessors'][i] for i in ids]
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   p['attributes']={k:mp[v] for k,v in p['attributes'].items()};p['indices']=mp[p['indices']]
   for t in p.get('targets',[]):
    for k,v in list(t.items()):t[k]=mp[v]
 for s in g.get('skins',[]):
  if 'inverseBindMatrices' in s:s['inverseBindMatrices']=mp[s['inverseBindMatrices']]
 for anim in g.get('animations',[]):
  for s in anim['samplers']:s['input']=mp[s['input']];s['output']=mp[s['output']]
 usedv=sorted({a['bufferView'] for a in g['accessors']}|{i['bufferView'] for i in g.get('images',[])})
 mv={v:i for i,v in enumerate(usedv)};newb=bytearray();views=[]
 for i in usedv:
  v=copy.deepcopy(g['bufferViews'][i]);start=v.get('byteOffset',0);length=v['byteLength']
  if v.get('buffer',0)!=0:raise ValueError('External buffer')
  newb.extend(b'\0'*(-len(newb)%4));v['byteOffset']=len(newb);newb.extend(b[start:start+length]);views.append(v)
 for a in g['accessors']:a['bufferView']=mv[a['bufferView']]
 for i in g.get('images',[]):i['bufferView']=mv[i['bufferView']]
 g['bufferViews']=views;g['buffers']=[{'byteLength':len(newb)}]
 j=json.dumps(g,separators=(',',':'),ensure_ascii=True).encode('utf8');j+=b' '*(-len(j)%4)
 newb.extend(b'\0'*(-len(newb)%4));total=28+len(j)+len(newb)
 return struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(newb),0x004e4942)+newb
