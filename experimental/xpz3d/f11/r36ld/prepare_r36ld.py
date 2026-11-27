from pathlib import Path
import hashlib,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='c1732932a860aabef305087722a877cdb6e519c8'
LOCK={512:'f2f2dab1436256616123b0b499ce27fe313cbff9f30686efd8ac9b72a76d9002',1024:'5a57a09f230036df17e55c5a8e18d5a31db9429d76f2a3dd59beac3d17967fa6'}
def prepare(size):
 d=ROOT/'input';d.mkdir(exist_ok=True);n=f'R36LC_F11_SOLE_MOTION_POT_{size}_2100TRI.glb';p=d/n
 if not p.exists():
  with urllib.request.urlopen(f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36lc/output/{n}',timeout=45) as r:b=r.read()
  assert hashlib.sha256(b).hexdigest()==LOCK[size];p.write_bytes(b)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==LOCK[size]
 return p
if __name__=='__main__':
 for s in (512,1024):print(prepare(s))
