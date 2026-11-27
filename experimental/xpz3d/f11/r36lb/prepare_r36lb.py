from pathlib import Path
import urllib.request,hashlib
ROOT=Path(__file__).resolve().parent
COMMIT='4f517765fe12ed00e70d989e179f7d81faefead2'
LOCK={512:'8c68dbc7a3ef64214821c51cd43410bf86f96a8f7391dab7f1ff5be276e8bfd4',1024:'5d8338be76e25718fdab9499ce1fbdba7fb206b8d8bda4631eab04793c5ce89b'}
def prepare(size):
 d=ROOT/'input';d.mkdir(exist_ok=True)
 name=f'R36LA_F11_MOTION_POT_{size}_2100TRI.glb';p=d/name
 if not p.exists():
  url=f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36la/output/{name}'
  with urllib.request.urlopen(url,timeout=45) as r:data=r.read()
  assert hashlib.sha256(data).hexdigest()==LOCK[size]
  p.write_bytes(data)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==LOCK[size]
 return p
if __name__=='__main__':
 for s in (512,1024):print(prepare(s))
