#!/usr/bin/env python3
"""Package R36KX and explicitly publish append-only assets to GitHub main.

Never force push or overwrite an existing R36KX directory. Record immutable
blob/commit IDs before branch mutations. Do not blindly rerun an uncertain push.
"""
from __future__ import annotations
import argparse,base64,concurrent.futures,hashlib,importlib.metadata,json,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO='road2man-cloud/xpiratez-data-atlas';PREFIX='experimental/xpz3d/f11/r36kx'
SOURCE='89d802650301fbb27c05a46e534155fa476a2dab'
def sha(b):return hashlib.sha256(b).hexdigest()
def git_sha(b):return hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
def record(name,data):
    path=ROOT/name;temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf8');temp.replace(path)
def api(path,method='GET',data=None,allow404=False):
    args=['gh','api',path,'--method',method];payload=None
    if data is not None:args+=['--input','-'];payload=json.dumps(data,ensure_ascii=True)
    p=subprocess.run(args,input=payload,capture_output=True,text=True,encoding='utf8',timeout=90)
    if p.returncode:
        if allow404 and ('404' in p.stderr or '404' in p.stdout):return None
        raise RuntimeError(f'{method} {path}: {p.stderr[:1500]}')
    return json.loads(p.stdout) if p.stdout.strip() else {}
def package():
    names=['README.md','HANDOFF_R36KX.md','requirements.txt','prepare_r36kx.py','build_r36kx.py','glb_tools.py','viewer_r36kx.js','build_preview.py','review_r36kx.py','validate_glb.cjs','publish_r36kx.py','viewer_deps/package.json','viewer_deps/package-lock.json']
    paths=[ROOT/p for p in names]
    paths+=sorted(p for p in (ROOT/'input').iterdir() if p.suffix in ('.glb','.json'))
    paths+=sorted(p for p in (ROOT/'output').iterdir() if p.suffix in ('.glb','.json','.png'))
    paths += [ROOT/'preview/index.html',ROOT/'preview/THIRD_PARTY_NOTICES.txt',ROOT/'preview/RENDER_REPORT.json']
    paths+=sorted((ROOT/'preview').glob('R36KX_*.png'))
    for p in paths:
        if not p.is_file():raise FileNotFoundError(p)
    if len(paths)!=len(set(paths)):raise RuntimeError('Duplicate package path')
    manifest={'version':'R36KX','sourceCommit':SOURCE,'engineApplied':False,'pagesDeploymentVerified':False,
        'environment':{n:importlib.metadata.version(n) for n in ('numpy','scipy','Pillow','playwright')},
        'files':{p.relative_to(ROOT).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths}}
    record('MANIFEST_R36KX.json',manifest);paths.append(ROOT/'MANIFEST_R36KX.json')
    archive=ROOT/'R36KX_COMPLETE_BUNDLE.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in paths:
            info=zipfile.ZipInfo('R36KX/'+p.relative_to(ROOT).as_posix(),date_time=(2026,11,27,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,p.read_bytes(),compresslevel=6)
    paths.append(archive)
    print('PACKAGED',len(paths),'ZIP_BYTES',archive.stat().st_size,'ZIP_SHA256',sha(archive.read_bytes()),flush=True)
    return paths

def verify_publication(commit,parent,paths):
    # Verify only this publication, not the unrelated repository tree.
    checks=[]
    for size in (1024,512):
        relative=f'output/R36KX_F11_COMPACT_NORMAL_{size}_2100TRI.glb';local=(ROOT/relative).read_bytes()
        metadata=api(f'repos/{REPO}/contents/{PREFIX}/{relative}?ref={commit}')
        if metadata['sha']!=git_sha(local) or metadata['size']!=len(local):raise RuntimeError('Remote metadata mismatch')
        blob=api(f'repos/{REPO}/git/blobs/{metadata["sha"]}')
        if blob.get('encoding')!='base64':raise RuntimeError('Unsupported remote blob encoding')
        remote=base64.b64decode(blob['content'])
        if remote!=local:raise RuntimeError('Remote GLB differs from produced binary')
        checks.append({'path':relative,'bytes':len(local),'sha256':sha(remote),'gitBlobSha':metadata['sha'],'remoteBytesDecoded':True})
    zipdata=(ROOT/'R36KX_COMPLETE_BUNDLE.zip').read_bytes()
    z=api(f'repos/{REPO}/contents/{PREFIX}/R36KX_COMPLETE_BUNDLE.zip?ref={commit}')
    assert z['sha']==git_sha(zipdata) and z['size']==len(zipdata)
    receipt={'repository':REPO,'branch':'main','commit':commit,'parent':parent,'path':PREFIX,'filesPublished':len(paths),'remoteGLBs':checks,
        'bundle':{'bytes':len(zipdata),'sha256':sha(zipdata),'gitBlobSha':z['sha']},'engineApplied':False,'pagesDeploymentVerified':False,
        'receiptNotInInitialCommit':True}
    record('PUBLISH_RECEIPT.json',receipt);record('PUBLISH_JOURNAL.json',{'stage':'complete','commit':commit,'parent':parent})
    print('PUBLISHED',json.dumps(receipt,indent=2),flush=True)

def publish(paths):
    if api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True) is not None:
        raise RuntimeError('R36KX path already exists. Read the receipt and branch state, do not overwrite.')
    journal={'stage':'uploading','repository':REPO,'path':PREFIX};record('PUBLISH_JOURNAL.json',journal)
    def blob(p):
        data=p.read_bytes();result=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(data).decode('ascii'),'encoding':'base64'})
        if result['sha']!=git_sha(data):raise RuntimeError('Uploaded blob hash mismatch')
        return {'path':PREFIX+'/'+p.relative_to(ROOT).as_posix(),'mode':'100644','type':'blob','sha':result['sha']}
    print('UPLOADING immutable production blobs',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:entries=list(ex.map(blob,paths))
    journal.update(stage='blobs_uploaded',entries=entries);record('PUBLISH_JOURNAL.json',journal)
    for attempt in range(4):
        parent=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
        if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent publication of the same path')
        old=api(f'repos/{REPO}/git/commits/{parent}')
        tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':old['tree']['sha'],'tree':entries})
        made=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36KX compact normal GLBs preserving all active texels','tree':tree['sha'],'parents':[parent]})
        journal.update(stage='before_ref_update',commit=made['sha'],parent=parent);record('PUBLISH_JOURNAL.json',journal)
        if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:continue
        try:
            api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':made['sha'],'force':False})
        except Exception:
            head=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
            comparison=api(f'repos/{REPO}/compare/{made["sha"]}...{head}')
            if comparison.get('status') in ('ahead','identical'):
                verify_publication(made['sha'],parent,paths);return
            if head!=parent:continue
            raise
        journal['stage']='branch_updated';record('PUBLISH_JOURNAL.json',journal)
        verify_publication(made['sha'],parent,paths);return
    raise RuntimeError('Main repeatedly changed; blobs uploaded but no branch update completed')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');args=p.parse_args();files=package()
    if args.publish:publish(files)
