"""Download immutable R36KX production inputs."""
from pathlib import Path
import hashlib,json,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='545eebdf54aa1bb1fcf6a8320a289e3086090ae8'
BASE=f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36kx/'
LOCK={1024:'17b55296868c966b9f9a04846ba3d0720fffbc7ad8408b3b0787dde0a581c4ab',512:'ed91f79bc1db9a40e60f375fd11c188d30b9bc7341ca92b0aff18d466159a33c'}
def main():
    out=ROOT/'input';out.mkdir(exist_ok=True);receipt=[]
    for size,want in LOCK.items():
        for name in (f'R36KX_F11_COMPACT_NORMAL_{size}_2100TRI.glb',f'R36KX_{size}_BUILD_REPORT.json'):
            path=out/name
            if path.exists():data=path.read_bytes()
            else:
                with urllib.request.urlopen(BASE+'output/'+name,timeout=40) as r:data=r.read()
            got=hashlib.sha256(data).hexdigest()
            if name.endswith('.glb') and got!=want:raise ValueError('Unexpected source GLB hash')
            if not path.exists():path.write_bytes(data)
            receipt.append({'path':name,'bytes':len(data),'sha256':got,'commit':COMMIT})
    (out/'SOURCE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
    print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
