#!/usr/bin/env python3
"""Package and publish immutable R36LC assets, without force-pushing."""
import argparse,base64,concurrent.futures,hashlib,json,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO='road2man-cloud/xpiratez-data-atlas'
PREFIX='experimental/xpz3d/f11/r36lc'
def sha(x):return hashlib.sha256(x).hexdigest()
def gitsha(x):return hashlib.sha1(('blob %d'%len(x)).encode()+bytes([0])+x).hexdigest()
def record(name,data):
 p=ROOT/name;q=p.with_suffix('.tmp');q.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8');q.replace(p)
def api(path,method='GET',data=None,allow404=False):
 cmd=['gh','api',path,'--method',method]
 if data is not None:cmd+=['--input','-']
 r=subprocess.run(cmd,input=json.dumps(data) if data is not None else None,text=True,encoding='utf8',capture_output=True,timeout=75)
 if r.returncode:
  if allow404 and '404' in r.stdout+r.stderr:return None
  raise RuntimeError(method+' '+path+' '+r.stderr[:800])
 return json.loads(r.stdout) if r.stdout.strip() else {}
def package():
 files=[ROOT/n for n in ('README.md','glb_tools.py','prepare_r36lc.py','build_r36lc.py','publish_r36lc.py')]
 files+=sorted((ROOT/'input').glob('*.glb'))+sorted((ROOT/'output').glob('*.glb'))+sorted((ROOT/'output').glob('*.json'))
 for p in files:assert p.is_file()
 for s in (512,1024):
  p=ROOT/'output'/f'R36LC_F11_SOLE_MOTION_POT_{s}_2100TRI.glb'
  r=json.loads((ROOT/'output'/f'R36LC_{s}_BUILD_REPORT.json').read_text(encoding='utf8'))
  assert sha(p.read_bytes())==r['sha256']
 record('MANIFEST_R36LC.json',{'version':'R36LC','sourceCommit':'fd96b9e8a8e3f72c09c3008f986974753b3bfadb','engineApplied':False,'files':{p.relative_to(ROOT).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in files}})
 files.append(ROOT/'MANIFEST_R36LC.json')
 z=ROOT/'R36LC_COMPLETE_BUNDLE.zip'
 with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as f:
  for p in files:f.write(p,'R36LC/'+p.relative_to(ROOT).as_posix())
 files.append(z);print('PACKAGED',len(files),z.stat().st_size,flush=True);return files
def publish(files):
 if api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True) is not None:raise RuntimeError('Existing revision: do not overwrite')
 record('PUBLISH_JOURNAL.json',{'stage':'uploading'})
 def upload(p):
  data=p.read_bytes();b=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(data).decode(),'encoding':'base64'})
  assert b['sha']==gitsha(data)
  return {'path':PREFIX+'/'+p.relative_to(ROOT).as_posix(),'mode':'100644','type':'blob','sha':b['sha']}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:entries=list(ex.map(upload,files))
 record('PUBLISH_JOURNAL.json',{'stage':'blobs_uploaded','entries':entries})
 for _ in range(4):
  parent=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
  if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent publication')
  old=api(f'repos/{REPO}/git/commits/{parent}')
  tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':old['tree']['sha'],'tree':entries})
  commit=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36LC skinned-sole heel-to-toe rollover animation GLBs','tree':tree['sha'],'parents':[parent]})['sha']
  record('PUBLISH_JOURNAL.json',{'stage':'before_ref_update','commit':commit,'parent':parent})
  if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:continue
  try:api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':commit,'force':False})
  except Exception:
   head=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
   if api(f'repos/{REPO}/compare/{commit}...{head}').get('status') not in ('ahead','identical'):
    if head!=parent:continue
    raise
  record('PUBLISH_JOURNAL.json',{'stage':'branch_updated','commit':commit,'parent':parent})
  checks=[]
  for s in (512,1024):
   p=f'output/R36LC_F11_SOLE_MOTION_POT_{s}_2100TRI.glb';data=(ROOT/p).read_bytes()
   meta=api(f'repos/{REPO}/contents/{PREFIX}/{p}?ref={commit}')
   assert meta['sha']==gitsha(data)
   checks.append({'path':p,'bytes':len(data),'sha256':sha(data),'gitBlobSha':meta['sha']})
  z=(ROOT/'R36LC_COMPLETE_BUNDLE.zip').read_bytes();zm=api(f'repos/{REPO}/contents/{PREFIX}/R36LC_COMPLETE_BUNDLE.zip?ref={commit}')
  assert zm['sha']==gitsha(z)
  receipt={'commit':commit,'branch':'main','parent':parent,'path':PREFIX,'filesPublished':len(files),'remoteGLBs':checks,'bundleBytes':len(z),'bundleSHA256':sha(z),'engineApplied':False}
  record('PUBLISH_RECEIPT.json',receipt);record('PUBLISH_JOURNAL.json',{'stage':'complete','commit':commit,'parent':parent})
  print('PUBLISHED',json.dumps(receipt,indent=2),flush=True);return
 raise RuntimeError('main changed repeatedly')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');a=p.parse_args();f=package()
 if a.publish:publish(f)
