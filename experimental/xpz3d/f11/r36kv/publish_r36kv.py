#!/usr/bin/env python3
"""Package production files and optionally append them to GitHub main.

No force push, no replacement of a previous R36KV publication. All repository
mutations use the user's already authenticated gh session, not exported tokens.
"""
from __future__ import annotations
import argparse,base64,concurrent.futures,hashlib,importlib.metadata,json,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'python_deps'))
REPO='road2man-cloud/xpiratez-data-atlas';PREFIX='experimental/xpz3d/f11/r36kv'

def sha(data):return hashlib.sha256(data).hexdigest()
def git_sha(data):return hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
def api(path,method='GET',data=None,allow404=False):
    args=['gh','api',path,'--method',method]
    payload=None
    if data is not None:args+=['--input','-'];payload=json.dumps(data,ensure_ascii=True)
    r=subprocess.run(args,input=payload,capture_output=True,text=True,encoding='utf8',timeout=120)
    if r.returncode:
        if allow404 and ('404' in r.stderr or '404' in r.stdout):return None
        raise RuntimeError(f'{method} {path}: {r.stderr[:1000]}')
    return json.loads(r.stdout) if r.stdout.strip() else {}

def package():
    paths=[ROOT/name for name in ('README.md','requirements.txt','prepare_r36kv.py','build_r36kv.py','viewer_r36kv.js','build_preview.py','review_r36kv.py','validate_glb.cjs','publish_r36kv.py')]
    paths += [ROOT/'source'/name for name in ('build_r36ku.py','glb_io_r36kj.py','compact_gltf.py')]
    for folder in ('input','source/output','output'):
        paths+=sorted(p for p in (ROOT/folder).iterdir() if p.suffix in ('.json','.glb','.png'))
    paths += [ROOT/'preview'/name for name in ('index.html','THIRD_PARTY_NOTICES.txt','RENDER_REPORT.json','R36KV_COMPARE_HEAD.png','R36KV_COMPARE_ARM.png','R36KV_COMPARE_FULL.png','R36KV_ALBEDO_COMPARE.png','R36KV_COMPARE_512.png','R36KV_POSE_70_32.png')]
    for p in paths:
        if not p.is_file():raise FileNotFoundError(p)
    for size in (1024,512):
        report=json.loads((ROOT/f'output/R36KV_{size}_BUILD_REPORT.json').read_text())
        model=ROOT/'output'/report['output']
        if report['sha256']!=sha(model.read_bytes()):raise ValueError('GLB/report hash mismatch')
    manifest={'version':'R36KV','sourceCommit':'d2b576f59ddd9388ec4aff1180c1542d6451fb69','engineApplied':False,'highPolyRecoveryClaimed':False,
      'environment':{n:importlib.metadata.version(n) for n in ('numpy','scipy','Pillow','xatlas','playwright')},
      'files':{p.relative_to(ROOT).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths}}
    mp=ROOT/'MANIFEST_R36KV.json';mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8');paths.append(mp)
    bundle=ROOT/'R36KV_COMPLETE_BUNDLE.zip'
    with zipfile.ZipFile(bundle,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in paths:z.write(p,arcname='R36KV/'+p.relative_to(ROOT).as_posix())
    paths.append(bundle)
    print('PACKAGED',len(paths),'ZIP_BYTES',bundle.stat().st_size,'ZIP_SHA256',sha(bundle.read_bytes()),flush=True)
    return paths

def publish(paths):
    if api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True) is not None:
        raise RuntimeError('R36KV already exists; inspect before attempting another publication')
    def upload(p):
        data=p.read_bytes();obj=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(data).decode(),'encoding':'base64'})
        if obj['sha']!=git_sha(data):raise RuntimeError('Remote blob digest mismatch')
        return {'path':PREFIX+'/'+p.relative_to(ROOT).as_posix(),'mode':'100644','type':'blob','sha':obj['sha']}
    print('UPLOADING immutable blobs',flush=True)
    with concurrent.futures.ThreadPoolExecutor(3) as ex:entries=list(ex.map(upload,paths))
    for attempt in range(3):
        parent=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
        if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent publication at R36KV path')
        base=api(f'repos/{REPO}/git/commits/{parent}')
        tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':base['tree']['sha'],'tree':entries})
        made=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36KV shared-UV GLBs with 61 percent fewer vertices','tree':tree['sha'],'parents':[parent]})
        (ROOT/'PUBLISH_JOURNAL.json').write_text(json.dumps({'parent':parent,'candidate':made['sha'],'state':'before_ref_update','path':PREFIX},indent=2)+'\n')
        if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:
            print('Main advanced; retaining concurrent work and rebuilding tree',flush=True);continue
        try:api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':made['sha'],'force':False})
        except (RuntimeError,subprocess.TimeoutExpired):
            # Resolve unknown PATCH outcome before considering another mutation.
            head=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
            if head!=made['sha']:
                if head!=parent:continue
                raise
        checks=[]
        for size in (1024,512):
            path=f'output/R36KV_F11_SHARED_UV_{size}_2100TRI.glb';data=(ROOT/path).read_bytes()
            obj=api(f'repos/{REPO}/contents/{PREFIX}/{path}?ref={made["sha"]}')
            if obj['size']!=len(data) or obj['sha']!=git_sha(data):raise RuntimeError('Published GLB mismatch')
            checks.append({'path':path,'bytes':len(data),'gitBlobSha':obj['sha'],'sha256':sha(data)})
        receipt={'repository':REPO,'branch':'main','commit':made['sha'],'parent':parent,'path':PREFIX,'filesPublished':len(paths),'remoteGLBs':checks,'engineApplied':False,'pagesDeploymentVerified':False}
        (ROOT/'PUBLISH_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
        print('PUBLISHED',json.dumps(receipt,indent=2),flush=True);return
    raise RuntimeError('Concurrent updates prevented publication; do not claim success')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');args=p.parse_args();paths=package()
    if args.publish:publish(paths)
