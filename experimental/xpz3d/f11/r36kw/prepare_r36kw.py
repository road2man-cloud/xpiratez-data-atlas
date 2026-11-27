"""Fetch immutable production inputs; never download a moving main asset."""
from pathlib import Path
import hashlib,json,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='8fa18e9c436805b39b9638270fe35b855e5f5f85'
BASE=f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36kv/'
LOCK={1024:'b7a9deee15f043e0cf50ff97e1d8b2944b15edb0b8163548bdd569e20fca7a84',512:'661e63962e9c0597188083f043ff1e303c2f2f6e6abd2fef4b547dde38b68548'}
def main():
 out=ROOT/'input';out.mkdir(exist_ok=True);receipt=[]
 for size,want in LOCK.items():
  name=f'R36KV_F11_SHARED_UV_{size}_2100TRI.glb';p=out/name
  if p.exists():data=p.read_bytes()
  else:
   with urllib.request.urlopen(BASE+'output/'+name,timeout=40) as r:data=r.read()
  got=hashlib.sha256(data).hexdigest()
  if got!=want:raise ValueError(f'Source hash mismatch: {name}')
  if not p.exists():p.write_bytes(data)
  receipt.append({'name':name,'sha256':got,'bytes':len(data),'commit':COMMIT})
 (out/'SOURCE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
