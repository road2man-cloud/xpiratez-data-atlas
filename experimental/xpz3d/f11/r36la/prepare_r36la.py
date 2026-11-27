from pathlib import Path
import urllib.request,hashlib,json
from glb_tools import load
ROOT=Path(__file__).resolve().parent
def prepare(size=512):
 p=next(x for x in json.loads((ROOT/'profiles.json').read_text(encoding='utf8'))['profiles'] if x['id']==f'pot-{size}')
 d=ROOT/'input';d.mkdir(exist_ok=True);f=d/p['file']
 if not f.exists():
  with urllib.request.urlopen(p['source'],timeout=40) as r:data=r.read(p['bytes']+1)
  if hashlib.sha256(data).hexdigest()!=p['sha256']:raise ValueError('Input hash')
  f.write_bytes(data)
 assert hashlib.sha256(f.read_bytes()).hexdigest()==p['sha256']
 return f
if __name__=='__main__':
 for size in (512,1024):print(prepare(size))
