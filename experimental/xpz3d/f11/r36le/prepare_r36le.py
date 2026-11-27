from pathlib import Path
import hashlib,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='6d63a67d4108a5403bad2efbb49a812de9288d26'
LOCK={512:'405ea5fbb0b743a945733fa000fa69c4dc27073c837f20f933bb1f2f8122cb9b',1024:'fd6b1633c2e460f1098054a31fa393a8de92d1ce66d4d6cb83ed2933b43d8a70'}
def prepare(size):
 d=ROOT/'input';d.mkdir(exist_ok=True);n=f'R36LD_F11_JOINT_WEIGHTS_POT_{size}_2100TRI.glb';p=d/n
 if not p.exists():
  with urllib.request.urlopen(f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36ld/output/{n}',timeout=45) as r:b=r.read()
  assert hashlib.sha256(b).hexdigest()==LOCK[size];p.write_bytes(b)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==LOCK[size]
 return p
if __name__=='__main__':
 for s in (512,1024):print(prepare(s))
