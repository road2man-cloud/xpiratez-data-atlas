from pathlib import Path
import hashlib,urllib.request
ROOT=Path(__file__).resolve().parent
COMMIT='fd96b9e8a8e3f72c09c3008f986974753b3bfadb'
LOCK={512:'9f4cbc919500a4ca527986f712a49d10eb30f546563c400853c01c894bda92c3',1024:'013b9290ced521fc566c86f65751b087b079a88e3a293cb4fd1dac7c6f6fbe89'}
def prepare(size):
 d=ROOT/'input';d.mkdir(exist_ok=True);n=f'R36LB_F11_CONTACT_MOTION_POT_{size}_2100TRI.glb';p=d/n
 if not p.exists():
  with urllib.request.urlopen(f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36lb/output/{n}',timeout=45) as r:b=r.read()
  assert hashlib.sha256(b).hexdigest()==LOCK[size];p.write_bytes(b)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==LOCK[size]
 return p
if __name__=='__main__':
 for s in (512,1024):print(prepare(s))
