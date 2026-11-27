#!/usr/bin/env python3
"""Package and publish only new R36KY files. No force push."""
import argparse,base64,hashlib,json,subprocess,zipfile,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO='road2man-cloud/xpiratez-data-atlas'
PREFIX='experimental/xpz3d/f11/r36ky'
def sha(b):return hashlib.sha256(b).hexdigest()
def gitsha(b):return hashlib.sha1(('blob %d'%len(b)).encode()+bytes([0])+b).hexdigest()
def record(name,data):
 p=ROOT/name;t=p.with_suffix('.tmp');t.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8');t.replace(p)
def api(path,method='GET',data=None,allow404=False):
 cmd=['gh','api',path,'--method',method]
 if data is not None:cmd+=['--input','-']
 r=subprocess.run(cmd,input=json.dumps(data) if data is not None else None,capture_output=True,text=True,encoding='utf8',timeout=90)
 if r.returncode:
  if allow404 and '404' in (r.stderr+r.stdout):return None
  raise RuntimeError(method+' '+path+' '+r.stderr[:800])
 return json.loads(r.stdout) if r.stdout.strip() else {}
def package():
 paths=[ROOT/p for p in ['README.md','prepare_r36ky.py','build_r36ky.py','glb_tools.py','requirements.txt','publish_r36ky.py']]
 paths+=sorted(p for d in ('input','output') for p in (ROOT/d).iterdir() if p.suffix in ('.glb','.png','.json'))
 for p in paths:assert p.is_file()
 record('MANIFEST_R36KY.json',{'version':'R36KY','sourceCommit':'545eebdf54aa1bb1fcf6a8320a289e3086090ae8','engineApplied':False,'files':{p.relative_to(ROOT).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths}})
 paths.append(ROOT/'MANIFEST_R36KY.json')
 z=ROOT/'R36KY_COMPLETE_BUNDLE.zip'
 with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as f:
  for p in paths:f.write(p,'R36KY/'+p.relative_to(ROOT).as_posix())
 paths.append(z);print('PACKAGED',len(paths),z.stat().st_size,flush=True);return paths
def publish(paths):
 if api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True) is not None:raise RuntimeError('Existing version; do not overwrite')
 record('PUBLISH_JOURNAL.json',{'stage':'uploading'})
 def upload(p):
  data=p.read_bytes();remote=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(data).decode(),'encoding':'base64'})
  assert remote['sha']==gitsha(data),(p,remote['sha'])
  return {'path':PREFIX+'/'+p.relative_to(ROOT).as_posix(),'mode':'100644','type':'blob','sha':remote['sha']}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:entries=list(ex.map(upload,paths))
 for i in range(4):
  parent=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
  if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent publication')
  old=api(f'repos/{REPO}/git/commits/{parent}')
  tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':old['tree']['sha'],'tree':entries})
  commit=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36KY all-POT texture compatibility GLBs','tree':tree['sha'],'parents':[parent]})['sha']
  record('PUBLISH_JOURNAL.json',{'stage':'before_ref_update','commit':commit,'parent':parent})
  if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:continue
  try:api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':commit,'force':False})
  except RuntimeError:
   head=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
   status=api(f'repos/{REPO}/compare/{commit}...{head}').get('status')
   if status not in ('ahead','identical'):
    if head!=parent:continue
    raise
  record('PUBLISH_JOURNAL.json',{'stage':'branch_updated','commit':commit,'parent':parent})
  checks=[]
  for s in (1024,512):
   p=f'output/R36KY_F11_POT_COMPAT_{s}_2100TRI.glb';data=(ROOT/p).read_bytes()
   meta=api(f'repos/{REPO}/contents/{PREFIX}/{p}?ref={commit}')
   blob=api(f'repos/{REPO}/git/blobs/{meta["sha"]}')
   assert base64.b64decode(blob['content'])==data
   checks.append({'path':p,'bytes':len(data),'sha256':sha(data),'gitBlobSha':meta['sha']})
  z=(ROOT/'R36KY_COMPLETE_BUNDLE.zip').read_bytes();zm=api(f'repos/{REPO}/contents/{PREFIX}/R36KY_COMPLETE_BUNDLE.zip?ref={commit}')
  assert zm['sha']==gitsha(z)
  receipt={'commit':commit,'parent':parent,'branch':'main','path':PREFIX,'filesPublished':len(paths),'remoteGLBs':checks,'bundleBytes':len(z),'bundleSHA256':sha(z),'engineApplied':False}
  record('PUBLISH_RECEIPT.json',receipt);print('PUBLISHED',json.dumps(receipt,indent=2),flush=True);return
 raise RuntimeError('main changed repeatedly')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');a=p.parse_args();files=package()
 if a.publish:publish(files)
