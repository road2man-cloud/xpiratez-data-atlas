#!/usr/bin/env python3
"""Build and append an immutable R36KZ distribution. Never force-push."""
import argparse,base64,concurrent.futures,hashlib,json,subprocess,zipfile
from pathlib import Path
from f11_deploy import PROFILES,ROOT,asset,jsonwrite
REPO='road2man-cloud/xpiratez-data-atlas';PREFIX='experimental/xpz3d/f11/r36kz'
def sha(data):return hashlib.sha256(data).hexdigest()
def gitsha(data):return hashlib.sha1(('blob %d'%len(data)).encode()+bytes([0])+data).hexdigest()
def api(path,method='GET',payload=None,allow404=False):
    cmd=['gh','api',path,'--method',method]
    if payload is not None:cmd+=['--input','-']
    r=subprocess.run(cmd,input=json.dumps(payload) if payload is not None else None,capture_output=True,text=True,encoding='utf8',timeout=90)
    if r.returncode:
        if allow404 and '404' in r.stderr+r.stdout:return None
        raise RuntimeError(method+' '+path+' '+r.stderr[:800])
    return json.loads(r.stdout) if r.stdout.strip() else {}
def package():
    files=[ROOT/x for x in ('README.md','profiles.json','f11_deploy.py','produce_ready_profiles.py','PRODUCTION_REPORT.json','publish_r36kz.py')]
    for profile,p in PROFILES.items():
        asset(profile)
        model=ROOT/'models'/p['file'];ready=ROOT/'ready'/profile/'F11.glb';receipt=ready.with_name('F11.stage.json')
        assert model.read_bytes()==ready.read_bytes()
        assert json.loads(receipt.read_text(encoding='utf8'))['sha256']==p['sha256']
        files.extend((model,ready,receipt))
    manifest={'version':'R36KZ','sourceCommits':sorted({p['commit'] for p in PROFILES.values()}),'engineApplied':False,'files':{f.relative_to(ROOT).as_posix():{'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in files}}
    jsonwrite(ROOT/'MANIFEST_R36KZ.json',manifest);files.append(ROOT/'MANIFEST_R36KZ.json')
    archive=ROOT/'R36KZ_COMPLETE_BUNDLE.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for f in files:
            info=zipfile.ZipInfo('R36KZ/'+f.relative_to(ROOT).as_posix(),date_time=(2026,11,27,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,f.read_bytes(),compresslevel=6)
    files.append(archive)
    print('PACKAGED',len(files),archive.stat().st_size,sha(archive.read_bytes()),flush=True)
    return files
def publish(files):
    if api(f'repos/{REPO}/contents/{PREFIX}?ref=main',allow404=True) is not None:raise RuntimeError('Existing publication; do not overwrite')
    jsonwrite(ROOT/'PUBLISH_JOURNAL.json',{'stage':'uploading'})
    def upload(f):
        data=f.read_bytes();b=api(f'repos/{REPO}/git/blobs','POST',{'content':base64.b64encode(data).decode(),'encoding':'base64'})
        assert b['sha']==gitsha(data)
        return {'path':PREFIX+'/'+f.relative_to(ROOT).as_posix(),'mode':'100644','type':'blob','sha':b['sha']}
    # Identical GLBs in models and ready need only one blob upload.
    unique={gitsha(f.read_bytes()):f for f in files}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:uploaded=dict(zip(unique,ex.map(upload,unique.values())))
    entries=[{**uploaded[gitsha(f.read_bytes())],'path':PREFIX+'/'+f.relative_to(ROOT).as_posix()} for f in files]
    jsonwrite(ROOT/'PUBLISH_JOURNAL.json',{'stage':'blobs_uploaded','entries':entries})
    for _ in range(4):
        parent=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
        if api(f'repos/{REPO}/contents/{PREFIX}?ref={parent}',allow404=True) is not None:raise RuntimeError('Concurrent same version publication')
        old=api(f'repos/{REPO}/git/commits/{parent}')
        tree=api(f'repos/{REPO}/git/trees','POST',{'base_tree':old['tree']['sha'],'tree':entries})
        commit=api(f'repos/{REPO}/git/commits','POST',{'message':'feat(xpz3d): produce R36KZ four-profile offline F11 deployment bundle','tree':tree['sha'],'parents':[parent]})['sha']
        jsonwrite(ROOT/'PUBLISH_JOURNAL.json',{'stage':'before_ref_update','commit':commit,'parent':parent})
        if api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']!=parent:continue
        try:api(f'repos/{REPO}/git/refs/heads/main','PATCH',{'sha':commit,'force':False})
        except Exception:
            head=api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
            if api(f'repos/{REPO}/compare/{commit}...{head}').get('status') not in ('ahead','identical'):
                if head!=parent:continue
                raise
        jsonwrite(ROOT/'PUBLISH_JOURNAL.json',{'stage':'branch_updated','commit':commit,'parent':parent})
        checks=[]
        for key,p in PROFILES.items():
            rel='ready/'+key+'/F11.glb';local=(ROOT/rel).read_bytes()
            meta=api(f'repos/{REPO}/contents/{PREFIX}/{rel}?ref={commit}')
            remote=api(f'repos/{REPO}/git/blobs/{meta["sha"]}')
            assert base64.b64decode(remote['content'])==local
            checks.append({'profile':key,'path':rel,'bytes':len(local),'sha256':sha(local),'gitBlobSha':meta['sha']})
        z=(ROOT/'R36KZ_COMPLETE_BUNDLE.zip').read_bytes();remote=api(f'repos/{REPO}/contents/{PREFIX}/R36KZ_COMPLETE_BUNDLE.zip?ref={commit}')
        assert remote['sha']==gitsha(z) and remote['size']==len(z)
        receipt={'branch':'main','commit':commit,'parent':parent,'path':PREFIX,'filesPublished':len(files),'remoteReadyGLBs':checks,'bundleBytes':len(z),'bundleSHA256':sha(z),'engineApplied':False}
        jsonwrite(ROOT/'PUBLISH_RECEIPT.json',receipt);jsonwrite(ROOT/'PUBLISH_JOURNAL.json',{'stage':'complete','commit':commit,'parent':parent});print('PUBLISHED',json.dumps(receipt,indent=2),flush=True);return
    raise RuntimeError('Main changed repeatedly')
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--publish',action='store_true');opt=a.parse_args();files=package()
    if opt.publish:publish(files)
