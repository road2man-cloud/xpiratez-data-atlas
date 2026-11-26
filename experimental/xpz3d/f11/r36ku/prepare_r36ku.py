"""Acquire immutable R36KS production inputs; inspect actual mesh/material data."""
from pathlib import Path
import requests, hashlib, json, struct, io, subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'source';SRC.mkdir(exist_ok=True)
REPO='road2man-cloud/xpiratez-data-atlas'
REF='7352b2396b974939f4e9d9193bbd05d4839c6b4a'
BASE=f'https://raw.githubusercontent.com/{REPO}/{REF}/experimental/xpz3d/f11/r36ks/'
FILES=['glb_io_r36kj.py','compact_gltf.py','render_r36ks.py','MANIFEST_R36KS.json']+[f'output/R36KS_F11_MULTI_POSE_HIP_{s}_2100TRI.glb' for s in (1024,512)]
for name in FILES:
    dest=SRC/name;dest.parent.mkdir(parents=True,exist_ok=True)
    response=requests.get(BASE+name,timeout=45);response.raise_for_status();dest.write_bytes(response.content)
    print('INPUT',name,len(response.content),hashlib.sha256(response.content).hexdigest(),flush=True)
raw=(SRC/FILES[-2]).read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);bin_start=28+n;binary=raw[bin_start:]
(SRC/'source_document.json').write_text(json.dumps(g,indent=2),encoding='utf8')
print('ASSET',g.get('asset'));print('MATERIALS',json.dumps(g['materials']));print('TEXTURES',g.get('textures'));print('EXTENSIONS',g.get('extensionsUsed'))
for mi,m in enumerate(g['meshes']):
    for pi,p in enumerate(m['primitives']):
        attrs=p['attributes'];pos=g['accessors'][attrs['POSITION']]
        print('PRIMITIVE',mi,pi,'material',p.get('material'),'verts',pos['count'],'triangles',g['accessors'][p['indices']]['count']//3,'bounds',pos.get('min'),pos.get('max'),'attributes',list(attrs),'extras',p.get('extras'))
for i,im in enumerate(g['images']):
    v=g['bufferViews'][im['bufferView']];b=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    image=Image.open(io.BytesIO(b));image.save(SRC/f'image_{i}.png');print('IMAGE',i,im.get('name'),image.size)
print('NODES',[(i,n.get('name'),n.get('mesh')) for i,n in enumerate(g['nodes']) if 'mesh' in n])
# Only list the relevant historical subtree; never assume any high-poly source exists.
url=f'repos/{REPO}/git/trees/{REF}?recursive=1'
r=subprocess.run(['gh','api',url],capture_output=True,text=True,encoding='utf8',check=True)
tree=json.loads(r.stdout)
selected=[x for x in tree.get('tree',[]) if x['path'].startswith('experimental/xpz3d/') and (x['path'].lower().endswith(('.glb','.blend','.zip')) or '6000' in x['path'].lower())]
(SRC/'asset_candidates.json').write_text(json.dumps(selected,indent=2),encoding='utf8')
print('CANDIDATES',json.dumps([{'path':x['path'],'size':x.get('size')} for x in selected])[:18000])
print('TREE_TRUNCATED',tree.get('truncated'))
