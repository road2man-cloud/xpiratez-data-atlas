#!/usr/bin/env python3
"""Package the actual R36KW output; publish with --publish only.

Append-only version folder, authenticated gh transport, no force update. Preserve
unrelated concurrent main changes. Durable receipts distinguish a built bundle
from a successful remote publication. No credential values enter these files.
"""
from __future__ import annotations
import argparse,base64,concurrent.futures,hashlib,importlib.metadata,json,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO='road2man-cloud/xpiratez-data-atlas'
PREFIX='experimental/xpz3d/f11/r36kw'
SOURCE_COMMIT='8fa18e9c436805b39b9638270fe35b855e5f5f85'
def sha(b):return hashlib.sha256(b).hexdigest()
def git_sha(b):return hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
def write_json(path,obj):path.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def api(path,method='GET',data=None,allow404=False):
    args=['gh','api',path,'--method',method];payload=None
    if data is not None:args+=['--input','-'];payload=json.dumps(data,ensure_ascii=True)
    result=subprocess.run(args,input=payload,capture_output=True,text=True,encoding='utf8')
    if result.returncode:
        if allow404 and ('404' in result.stderr or '404' in result.stdout):return None
        raise RuntimeError(f'{method} {path}: {result.stderr[:600]}')
    return json.loads(result.stdout) if result.stdout.strip() else {}
def package():
    names=('README.md','HANDOFF_R36KW.md','requirements.txt','prepare_r36kw.py','build_r36kw.py','glb_tools.py','mikktspace_stage.mjs','viewer_r36kw.js','build_preview.py','review_r36kw.py','validate_glb.cjs','publish_r36kw.py','viewer_deps/package.json','viewer_deps/package-lock.json')
    paths=[ROOT/p for p in names]
    paths+=sorted((ROOT/'input').glob('*.glb'))+[ROOT/'input/SOURCE_RECEIPT.json']
    paths+=sorted(p for p in (ROOT/'output').iterdir() if p.suffix in ('.glb','.json','.png'))
    paths+=[ROOT/'preview'/p for p in ('index.html','THIRD_PARTY_NOTICES.txt','RENDER_REPORT.json')]
    paths+=sorted((ROOT/'preview').glob('R36KW_*.png'))
    if len(paths)!=len(set(paths)):raise ValueError('Duplicate package path')
    for p in paths:
        if not p.is_file():raise FileNotFoundError(p)
    manifest={'version':'R36KW','sourceCommit':SOURCE_COMMIT,'engineApplied':False,'highPolyRecoveryClaimed':False,
      'environment':{n:importlib.metadata.version(n) for n in ('numpy','Pillow','scipy','playwright')},
      'files':{p.relative_to(ROOT).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths}}
    mp=ROOT/'MANIFEST_R36KW.json';write_json(mp,manifest);paths.append(mp)
    bundle=ROOT/'R36KW_COMPLETE_BUNDLE.zip'
    with zipfile.ZipFile(bundle,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in paths:z.write(p,arcname='R36KW/'+p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(bundle) as z:
        bad=z.testzip()
        if bad:raise ValueError('Corrupt ZIP member '+bad)
    paths.append(bundle)
    print('PACKAGED',len(paths),'ZIP_BYTES',bundle.stat().st_size,'ZIP_SHA256',sha(bundle.read_bytes()),flush=True)
    return paths

def publish(paths):
    state_path=ROOT/'PUBLISH_STATE.json'
    old=api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True)
    if old is not None:raise RuntimeError('R36KW already exists; inspect existing receipt rather than overwrite/replay')
    state={'repository':REPO,'prefix':PREFIX,'stage':'uploading','attempts':[]};write_json(state_path,state)
    def upload(p):
        b=p.read_bytes();obj=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(b).decode('ascii'),'encoding':'base64'})
        if obj['sha']!=git_sha(b):raise RuntimeError('Blob SHA mismatch: '+p.name)
        return {'path':PREFIX+'/'+p.relative_to(ROOT).as_posix(),'mode':'100644','type':'blob','sha':obj['sha']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:entries=list(pool.map(upload,paths))
    state.update(stage='blobs_uploaded',entries=entries);write_json(state_path,state)
    final=None;parent=None
    for attempt in range(3):
        parent=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
        if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent R36KW publication; refusing overwrite')
        current=api(f'repos/{REPO}/git/commits/{parent}')
        tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':current['tree']['sha'],'tree':entries})
        commit=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36KW normal-UV repair GLBs, explicit tangents and offline viewer','tree':tree['sha'],'parents':[parent]})
        state['attempts'].append({'parent':parent,'tree':tree['sha'],'commit':commit['sha']});state['stage']='commit_created';write_json(state_path,state)
        if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:
            print('Concurrent main update; using latest base without force',flush=True);continue
        try:
            api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':commit['sha'],'force':False})
        except RuntimeError:
            head=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
            if head==commit['sha']:
                final=commit['sha'];break
            # An accepted update might already have acquired a concurrent descendant.
            if head!=parent:
                cmp=api(f'repos/{REPO}/compare/{commit["sha"]}...{head}')
                if cmp.get('status') in ('ahead','identical'):
                    final=commit['sha'];break
                continue
            raise
        final=commit['sha'];break
    if final is None:raise RuntimeError('Main changed repeatedly; blobs exist but this version was not published')
    state.update(stage='ref_updated',commit=final);write_json(state_path,state)
    checks=[]
    for size in (1024,512):
        rel=f'output/R36KW_F11_NORMAL_UV_REPAIR_{size}_2100TRI.glb';data=(ROOT/rel).read_bytes()
        remote=api(f'repos/{REPO}/contents/{PREFIX}/{rel}?ref={final}')
        if remote['sha']!=git_sha(data) or remote['size']!=len(data):raise AssertionError('Remote binary metadata mismatch')
        decoded=base64.b64decode(remote.get('content','')) if remote.get('encoding')=='base64' else b''
        if decoded and sha(decoded)!=sha(data):raise AssertionError('Remote binary SHA-256 mismatch')
        checks.append({'path':rel,'bytes':len(data),'gitBlobSha':remote['sha'],'sha256':sha(data),'remoteBytesDecoded':bool(decoded)})
    receipt={'repository':REPO,'branch':'main','commit':final,'parent':parent,'path':PREFIX,'filesPublished':len(paths),'remoteGLBs':checks,
      'bundle':{'bytes':(ROOT/'R36KW_COMPLETE_BUNDLE.zip').stat().st_size,'sha256':sha((ROOT/'R36KW_COMPLETE_BUNDLE.zip').read_bytes())},
      'engineApplied':False,'pagesDeploymentVerified':False,'receiptNotPartOfInitialCommit':True}
    write_json(ROOT/'PUBLISH_RECEIPT.json',receipt);state['stage']='verified_remote';write_json(state_path,state)
    print('PUBLISHED',json.dumps(receipt,indent=2),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');opt=p.parse_args()
    files=package()
    if opt.publish:publish(files)
