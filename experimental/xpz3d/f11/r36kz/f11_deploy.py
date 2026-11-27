#!/usr/bin/env python3
"""R36KZ offline F11 model selector, staging and guarded reversible replacement.
Standard library only. No game autodetection, no live install by default.
"""
import argparse,contextlib,hashlib,json,os,struct,sys,tempfile,urllib.request,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
MANIFEST=json.loads((ROOT/'profiles.json').read_text(encoding='utf8'))
PROFILES={p['id']:p for p in MANIFEST['profiles']}
def digest(data):return hashlib.sha256(data).hexdigest()
def hashfile(path):return digest(path.read_bytes())
def atom(path,data):
    # Same-directory temporary file ensures replacement occurs on same volume.
    path=Path(path);fd,name=tempfile.mkstemp(prefix='.r36kz-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
def jsonwrite(path,value):
    atom(path,(json.dumps(value,indent=2,ensure_ascii=False)+'\n').encode('utf8'))
def inspect_glb(data):
    if len(data)<28 or struct.unpack_from('<III',data)!=(0x46546c67,2,len(data)):raise ValueError('Invalid GLB')
    n,t=struct.unpack_from('<II',data,12)
    if t!=0x4e4f534a or 20+n>len(data):raise ValueError('Invalid GLB JSON')
    g=json.loads(data[20:20+n])
    triangles=vertices=primitives=0
    for m in g['meshes']:
        for p in m['primitives']:
            if p.get('mode',4)!=4:raise ValueError('Unexpected primitive mode')
            primitives+=1;vertices+=g['accessors'][p['attributes']['POSITION']]['count']
            count=g['accessors'][p['indices']]['count']
            if count%3:raise ValueError('Invalid triangle index count')
            triangles+=count//3
    return {'triangles':triangles,'vertices':vertices,'primitives':primitives,'bones':len(g['skins'][0]['joints']),'images':len(g['images'])}
def asset(profile):
    p=PROFILES[profile];f=ROOT/'models'/p['file'];data=f.read_bytes()
    if len(data)!=p['bytes'] or digest(data)!=p['sha256']:raise ValueError('Asset integrity mismatch: '+str(f))
    stats=inspect_glb(data)
    for k in ('triangles','vertices','primitives','bones'):
        if stats[k]!=p[k]:raise ValueError('Asset metadata mismatch: '+k)
    return p,data,stats
def fetch():
    d=ROOT/'models';d.mkdir(exist_ok=True)
    for k,p in PROFILES.items():
        f=d/p['file']
        if not f.exists():
            with urllib.request.urlopen(p['source'],timeout=60) as r:data=r.read(p['bytes']+1)
            if len(data)!=p['bytes'] or digest(data)!=p['sha256']:raise ValueError('Remote asset mismatch: '+k)
            atom(f,data)
        _,_,stats=asset(k);print(k,stats,flush=True)
def target_path(path):
    p=Path(path).expanduser().absolute()
    if p.suffix.lower()!='.glb':raise ValueError('Explicit .glb target required')
    if p.is_symlink():raise ValueError('Symlink target forbidden')
    if not p.parent.is_dir():raise ValueError('Target parent directory must exist')
    p=p.resolve(strict=False)
    if p.is_relative_to((ROOT/'models').resolve()):raise ValueError('Cannot replace immutable model assets')
    return p
@contextlib.contextmanager
def lock(target):
    p=target.with_name(target.name+'.r36kz.lock')
    try:fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    except FileExistsError:raise RuntimeError('Target locked; inspect journal, do not retry blindly')
    try:
        os.write(fd,str(os.getpid()).encode());os.close(fd);fd=None
        yield
    finally:
        if fd is not None:os.close(fd)
        p.unlink(missing_ok=True)
def stage(profile,folder):
    p,data,stats=asset(profile);d=Path(folder).expanduser().resolve();d.mkdir(parents=True,exist_ok=True)
    target=d/'F11.glb'
    if target.is_symlink():raise ValueError('Symlink stage target forbidden')
    if target.exists() and hashfile(target)!=p['sha256']:raise ValueError('Stage already contains another model; choose another directory')
    atom(target,data)
    receipt={'schema':1,'kind':'stage','profile':profile,'sha256':p['sha256'],'bytes':len(data),'stats':stats,'file':'F11.glb','engineApplied':False,'canonicalGamePathVerified':False}
    jsonwrite(d/'F11.stage.json',receipt);return receipt
def apply(profile,target,expect):
    p,data,stats=asset(profile);t=target_path(target)
    with lock(t):
        if t.is_symlink():raise ValueError('Symlink target forbidden')
        exists=t.exists()
        old=t.read_bytes() if exists else None
        oldhash=digest(old) if exists else 'absent'
        if oldhash!=expect:raise ValueError('Current target does not match explicit expectation. No write performed.')
        if exists and oldhash==p['sha256']:return {'state':'already_selected','target':str(t),'sha256':oldhash}
        # Each transaction uses a fresh journal directory beside target.
        jdir=t.parent/('.r36kz-'+uuid.uuid4().hex);jdir.mkdir()
        if exists:atom(jdir/'original.glb',old)
        receipt={'schema':1,'kind':'replace','state':'prepared','target':str(t),'profile':profile,'before':oldhash,'after':p['sha256'],'backup':'original.glb' if exists else None,'engineApplied':False}
        journal=jdir/'receipt.json';jsonwrite(journal,receipt)
        if (hashfile(t) if t.exists() else 'absent')!=oldhash:raise ValueError('Target changed while preparing; no replacement')
        atom(t,data)
        if hashfile(t)!=p['sha256']:raise RuntimeError('Post-write mismatch; inspect journal')
        receipt['state']='replaced';jsonwrite(journal,receipt)
        return {**receipt,'receipt':str(journal),'stats':stats}
def rollback(target,journal):
    t=target_path(target);j=Path(journal).expanduser().resolve()
    if j.name!='receipt.json' or j.parent.parent!=t.parent or not j.parent.name.startswith('.r36kz-'):raise ValueError('Journal must belong to target parent')
    r=json.loads(j.read_text(encoding='utf8'))
    if r.get('kind')!='replace' or r.get('target')!=str(t) or r.get('state') not in ('prepared','replaced'):raise ValueError('Invalid rollback journal')
    with lock(t):
        if not t.is_file() or hashfile(t)!=r['after']:raise ValueError('Target changed; refuse rollback')
        if r['before']=='absent':t.unlink()
        else:
            b=j.parent/'original.glb';data=b.read_bytes()
            if digest(data)!=r['before']:raise ValueError('Backup mismatch')
            atom(t,data)
        r['state']='rolled_back';jsonwrite(j,r)
    return r
def main():
    p=argparse.ArgumentParser(description=__doc__)
    s=p.add_subparsers(dest='cmd',required=True)
    s.add_parser('list');s.add_parser('fetch')
    st=s.add_parser('stage');st.add_argument('profile',choices=PROFILES);st.add_argument('directory')
    a=s.add_parser('apply');a.add_argument('profile',choices=PROFILES);a.add_argument('--target',required=True);a.add_argument('--expect',required=True,help='Current target SHA-256, or absent for explicit new file')
    rb=s.add_parser('rollback');rb.add_argument('--target',required=True);rb.add_argument('--receipt',required=True)
    h=s.add_parser('hash');h.add_argument('file')
    opt=p.parse_args()
    if opt.cmd=='list':
        print(json.dumps(MANIFEST,indent=2));return
    if opt.cmd=='fetch':fetch();return
    if opt.cmd=='hash':print(hashfile(Path(opt.file)));return
    if opt.cmd=='stage':r=stage(opt.profile,opt.directory)
    elif opt.cmd=='apply':r=apply(opt.profile,opt.target,opt.expect.lower())
    else:r=rollback(opt.target,opt.receipt)
    print(json.dumps(r,indent=2,ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except (ValueError,OSError,RuntimeError,KeyError) as e:print('ERROR:',e,file=sys.stderr);sys.exit(1)
