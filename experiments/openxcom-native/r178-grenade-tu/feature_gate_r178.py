from pathlib import Path
import re, json, hashlib, sys
root=Path(__file__).resolve().parent
inv=(root/'src/Battlescape/InventoryState.cpp').read_text(encoding='utf-8')
trans=(root/'src/Basescape/TransferItemsState.cpp').read_text(encoding='utf-8')
main=(root/'src/main.cpp').read_text(encoding='utf-8')
checks={
'grenade_tu_display':all(t in inv for t in ('R178: two-line, per-soldier grenade TU summary', 'isGrenadeOrProxy()', 'getActionTUs(BA_PRIME, item)', 'getActionTUs(BA_THROW, item)', '_txtAmmo->setText(grenadeTu.str())')),
'grenade_tu_personalized':'_inv->getSelectedUnit()' in inv,
'grenade_prepared_state':'item->getFuseTimer() >= 0' in inv and 'alreadyPrimed ? 0 : primeTu' in inv,
'grenade_total_tu':'const int totalTu = throwTu + (alreadyPrimed ? 0 : primeTu);' in inv,
'grenade_compact_fallback':'_txtAmmo->getTextWidth() > _txtAmmo->getWidth()' in inv and 'compactAscii' in inv,
'autoall_one_round_exclusion':'choice.rule->getClipSize() == 1' in inv,
'autoall_frag_prioritized':'usableOwnedFrag' in inv and 'STR_GRENADE_FRAG' in inv,
'autoall_both_hands':'leftHandOccupied' in inv,
'autoall_low_tu':'r164LowTuMode' in inv,
'transfer_search_r148':'r148SearchState' in trans,
'transfer_sort_r138':'r138ApplyColumnSort' in trans,
'exchange_click_persisted':'_chosen = static_cast<int>(index)' in trans,
'craft_only_no_crew_transfer':'assigned->setCraft(0)' in trans and 'netPersonnelTo > 0' in trans,
'exchange_capacity_diagnostics':'exchangeBlockReason' in trans,
'version_title':'R178-GRENADE-STATE-TU-ALLPATCH' in main,
}
# Inspect the actual emitted archive, not just unchanged object count.
def members(path):
    data=path.read_bytes()
    if not data.startswith(b'!<arch>\n'):raise ValueError('bad archive: '+str(path))
    i=8;names=b'';out={}
    while i+60<=len(data):
        hdr=data[i:i+60];i+=60
        name=hdr[:16].decode('ascii').strip()
        size=int(hdr[48:58].strip())
        blob=data[i:i+size];i+=size+(size%2)
        if name=='//':names=blob;continue
        if name=='/':continue
        if name.startswith('/') and name[1:].isdigit():name=names[int(name[1:]):].split(b'/\n',1)[0].decode()
        elif name.startswith('#1/'):
            n=int(name[3:]);name=blob[:n].decode();blob=blob[n:]
        else:name=name.rstrip('/')
        out[name]=hashlib.sha256(blob).hexdigest()
    return out
parent=Path(r'D:\daphne_auto\XPZ_R177_GRENADE_TU_GIT_GUARD_20261120\build\objects_r177_cumulative_grenade_tu.a')
current=root/'build/objects_r178_cumulative_grenade_state_tu.a'
a,b=members(parent),members(current)
changed=sorted(k for k in a.keys()|b.keys() if a.get(k)!=b.get(k))
checks['413_cumulative_objects']=len(a)==len(b)==413
checks['only_expected_objects_changed']=set(changed)<=set(['InventoryState.cpp.obj','TransferItemsState.cpp.obj','main.cpp.obj']) and 'InventoryState.cpp.obj' in changed
exe=root/'build/openxcom_R178_ALLPATCH_GRENADE_STATE_TU.exe'
checks['exe_exists']=exe.is_file()
report={'release':'R178','status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'changed_objects':changed,'parent_objects':len(a),'output_objects':len(b),'exe_sha256':hashlib.sha256(exe.read_bytes()).hexdigest() if exe.exists() else None,'gameplay_verified':False}
(root/'R178_FEATURE_AUDIT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
for name,ok in checks.items():print(('PASS' if ok else 'FAIL'),name)
print('CHANGED_OBJECTS:',', '.join(changed))
print('EXE_SHA256:',report['exe_sha256'])
sys.exit(0 if report['status']=='PASS' else 2)
