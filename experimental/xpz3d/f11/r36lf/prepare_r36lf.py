from pathlib import Path
import hashlib,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='56067e276ecaec1c03263c13755335e98dd36691'
LOCK={512:'52f2e762b22f113847d404554ba7a99ad7a4a64efe8eb8d8ed39046c6b0cd41c',1024:'a3dcd5522711f9bb4613c0fee241106cc00b7251133eddeb2987484ad8d440cd'}
def prepare(size):
 d=ROOT/'input';d.mkdir(exist_ok=True);n=f'R36LE_F11_KNEE_CORRECTIVES_POT_{size}_2100TRI.glb';p=d/n
 if not p.exists():
  with urllib.request.urlopen(f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36le/output/{n}',timeout=45) as r:b=r.read()
  assert hashlib.sha256(b).hexdigest()==LOCK[size];p.write_bytes(b)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==LOCK[size]
 return p
if __name__=='__main__':
 for s in (512,1024):print(prepare(s))
