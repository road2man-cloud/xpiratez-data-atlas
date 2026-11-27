"""Exercise the packaged real GLBs in an isolated temporary directory only."""
import json,tempfile
from pathlib import Path
from f11_deploy import ROOT,PROFILES,asset,stage,apply,rollback,hashfile,jsonwrite
def run():
    report={'models':{},'deploymentTarget':'isolated temporary directory; not game','engineApplied':False,'cases':[]}
    for profile,p in PROFILES.items():
        _,_,stats=asset(profile)
        report['models'][profile]={'sha256':p['sha256'],'bytes':p['bytes'],**stats}
        r=stage(profile,ROOT/'ready'/profile)
        assert r['sha256']==hashfile(ROOT/'ready'/profile/'F11.glb')
    with tempfile.TemporaryDirectory(prefix='r36kz-test-') as td:
        t=Path(td)/'F11.glb'
        old=PROFILES['compact-512']['sha256']
        new=PROFILES['pot-512']['sha256']
        t.write_bytes(asset('compact-512')[1])
        try:apply('pot-512',t,'0'*64)
        except ValueError:assert hashfile(t)==old
        else:raise AssertionError('Wrong expectation was accepted')
        report['cases'].append('wrong expected hash rejected without replacing')
        a=apply('pot-512',t,old)
        assert hashfile(t)==new
        report['cases'].append('actual compact-512 replaced with exact pot-512 bytes')
        assert apply('pot-512',t,new)['state']=='already_selected'
        report['cases'].append('same profile selection is idempotent')
        # Reject rollback if another process has changed the installed model.
        t.write_bytes(asset('compact-1024')[1])
        try:rollback(t,a['receipt'])
        except ValueError:assert hashfile(t)==PROFILES['compact-1024']['sha256']
        else:raise AssertionError('Changed target rollback accepted')
        report['cases'].append('rollback refuses externally changed target')
        t.write_bytes(asset('pot-512')[1])
        rollback(t,a['receipt'])
        assert hashfile(t)==old
        report['cases'].append('rollback restored original GLB exactly')
        t.unlink()
        b=apply('pot-1024',t,'absent')
        assert hashfile(t)==PROFILES['pot-1024']['sha256']
        rollback(t,b['receipt'])
        assert not t.exists()
        report['cases'].append('explicit absent target creation and rollback removal')
    report['readyProfiles']=list(PROFILES)
    jsonwrite(ROOT/'PRODUCTION_REPORT.json',report)
    print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':run()
