#!/usr/bin/env python3
"""Package explicit production files; publish only with --publish and gh auth.

Uses append-only paths under r36ku, preserves concurrent main changes, never
force-pushes, and refuses to overwrite an existing r36ku publication.
"""
from __future__ import annotations
import argparse,base64,concurrent.futures,hashlib,importlib.metadata,json,subprocess,sys,time,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO='road2man-cloud/xpiratez-data-atlas';PREFIX='experimental/xpz3d/f11/r36ku'

def sha(b):return hashlib.sha256(b).hexdigest()
def git_sha(b):return hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
def api(path,method='GET',data=None,allow404=False):
    args=['gh','api',path,'--method',method]
    payload=None
    if data is not None:args+=['--input','-'];payload=json.dumps(data,ensure_ascii=True)
    r=subprocess.run(args,input=payload,capture_output=True,text=True,encoding='utf8')
    if r.returncode:
        if allow404 and ('404' in r.stderr or '404' in r.stdout):return None
        raise RuntimeError(f'{method} {path}: {r.stderr[:1000]}')
    return json.loads(r.stdout) if r.stdout.strip() else {}

def package():
    paths=[ROOT/p for p in ('README.md','requirements.txt','prepare_r36ku.py','build_r36ku.py','viewer_r36ku.js','build_preview.py','review_r36ku.py','validate_glb.cjs','publish_r36ku.py')]
    paths += [ROOT/'source'/p for p in ('glb_io_r36kj.py','compact_gltf.py','MANIFEST_R36KS.json')]
    paths += sorted((ROOT/'source/output').glob('*.glb'))
    paths += sorted(p for p in (ROOT/'output').iterdir() if p.suffix in ('.glb','.json','.png'))
    paths += [ROOT/'preview'/p for p in ('index.html','THIRD_PARTY_NOTICES.txt','R36KU_COMPARE_HEAD.png','R36KU_COMPARE_ARM.png','R36KU_COMPARE_FULL.png','R36KU_ALBEDO_PRESERVED.png','R36KU_COMPARE_512.png')]
    for p in paths:
        if not p.is_file():raise FileNotFoundError(p)
    manifest={'version':'R36KU','sourceCommit':'7352b2396b974939f4e9d9193bbd05d4839c6b4a','engineApplied':False,'highPolyRecoveryClaimed':False,'environment':{name:importlib.metadata.version(name) for name in ('numpy','scipy','Pillow','playwright')},'files':{str(p.relative_to(ROOT)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths}}
    mp=ROOT/'MANIFEST_R36KU.json';mp.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf8');paths.append(mp)
    bundle=ROOT/'R36KU_COMPLETE_BUNDLE.zip'
    with zipfile.ZipFile(bundle,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in paths:z.write(p,arcname='R36KU/'+str(p.relative_to(ROOT)).replace('\\','/'))
    paths.append(bundle)
    print('PACKAGED',len(paths),'files','ZIP_BYTES',bundle.stat().st_size,'ZIP_SHA256',sha(bundle.read_bytes()),flush=True)
    return paths

def publish(paths):
    existing=api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True)
    if existing is not None:raise RuntimeError('r36ku already exists: inspect it before a new publication')
    print('UPLOADING immutable blobs',flush=True)
    def blob(p):
        b=p.read_bytes();result=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(b).decode('ascii'),'encoding':'base64'})
        if result['sha']!=git_sha(b):raise RuntimeError('Uploaded blob hash mismatch')
        relative=str(p.relative_to(ROOT)).replace('\\','/')
        return {'path':PREFIX+'/'+relative,'mode':'100644','type':'blob','sha':result['sha']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:entries=list(ex.map(blob,paths))
    for attempt in range(3):
        ref=api(f'repos/{REPO}/git/ref/heads/main');parent=ref['object']['sha']
        if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent r36ku publication; abort without overwriting')
        commit=api(f'repos/{REPO}/git/commits/{parent}')
        tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':commit['tree']['sha'],'tree':entries})
        made=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36KU 1024/512 detail GLBs and offline comparison bundle','tree':tree['sha'],'parents':[parent]})
        if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:
            print('Concurrent main update; rebuilding tree over latest parent',flush=True);continue
        try:api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':made['sha'],'force':False})
        except RuntimeError:
            if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:continue
            raise
        checks=[]
        for size in (1024,512):
            relative=f'output/R36KU_F11_BALANCED_DETAIL_{size}_2100TRI.glb';b=(ROOT/relative).read_bytes()
            remote=api(f'repos/{REPO}/contents/{PREFIX}/{relative}?ref={made["sha"]}')
            assert remote['sha']==git_sha(b) and remote['size']==len(b)
            checks.append({'path':relative,'bytes':len(b),'gitBlobSha':remote['sha'],'sha256':sha(b)})
        receipt={'repository':REPO,'branch':'main','commit':made['sha'],'parent':parent,'path':PREFIX,'filesPublished':len(paths),'verifiedRemoteGLBs':checks,'engineApplied':False,'pagesDeploymentVerified':False}
        (ROOT/'PUBLISH_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
        print('PUBLISHED',json.dumps(receipt,indent=2),flush=True)
        return
    raise RuntimeError('Main changed repeatedly; uploaded blobs are safe but no branch update was completed')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');a=p.parse_args();files=package()
    if a.publish:publish(files)
