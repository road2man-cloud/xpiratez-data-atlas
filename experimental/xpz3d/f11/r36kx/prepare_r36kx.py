"""Fetch the immutable R36KW inputs into this isolated build directory."""
from pathlib import Path
import hashlib,json,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='89d802650301fbb27c05a46e534155fa476a2dab'
BASE=f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36kw/'
LOCK={1024:'55f909dc9f2c3618be2ea325f773b76749e0fbfb37e025955b27f0c5dc1825a0',512:'9be48c35c0f9c099ce86cf29ffc880df4ba204b9295eef708ca2f729503ed085'}
def main():
    files={'glb_tools.py':'glb_tools.py','viewer_deps/package.json':'viewer_deps/package.json','viewer_deps/package-lock.json':'viewer_deps/package-lock.json'}
    for size in (1024,512):
        files[f'output/R36KW_F11_NORMAL_UV_REPAIR_{size}_2100TRI.glb']=f'input/R36KW_F11_NORMAL_UV_REPAIR_{size}_2100TRI.glb'
        files[f'output/R36KW_{size}_BUILD_REPORT.json']=f'input/R36KW_{size}_BUILD_REPORT.json'
    receipt=[]
    for remote,local in files.items():
        p=ROOT/local;p.parent.mkdir(parents=True,exist_ok=True)
        if p.exists():data=p.read_bytes()
        else:
            with urllib.request.urlopen(BASE+remote,timeout=45) as r:data=r.read()
        digest=hashlib.sha256(data).hexdigest()
        if p.suffix=='.glb':
            size=1024 if '_1024_' in p.name else 512
            if digest!=LOCK[size]:raise ValueError('Input hash mismatch '+p.name)
        if not p.exists():p.write_bytes(data)
        receipt.append({'remote':remote,'local':local,'bytes':len(data),'sha256':digest})
    (ROOT/'input/SOURCE_RECEIPT.json').write_text(json.dumps({'commit':COMMIT,'files':receipt},indent=2)+'\n',encoding='utf8')
    print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
