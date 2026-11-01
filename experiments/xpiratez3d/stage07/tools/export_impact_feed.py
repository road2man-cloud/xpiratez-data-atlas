#!/usr/bin/env python3
"""Convert optional actual OXCE TileEngine::hit telemetry to XPZ3D3 visual feed.

Delegates snapshots/aims and all underlying validation to the existing stage06
source. A hit voxel is the damage-application input, NOT all bullets, trajectories,
or a proof that a 3D Silent Storm wall's geometry actually changed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

# Existing shared transport parser and exact OXCE native trace validator.
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent/'stage06/tools'  # single shared codebase in the existing GitHub repo
if not BASE.is_dir(): BASE=ROOT.parent/'xpiratez3d_stage06'/'stage06/tools'  # local prototype workspace
sys.path.insert(0,str(BASE))
from export_visual_feed import export, Rejected, as_int  # noqa: E402

EVIDENCE='tile_engine_hit_damage_application_voxel'

def adapt(trace:bytes, checkpoint_dir:Path|None=None):
    if not trace or len(trace)>8*1024*1024:raise Rejected('empty or oversized trace')
    try:
        rows=[json.loads(ln) for ln in trace.splitlines() if ln.strip()]
    except (json.JSONDecodeError,UnicodeDecodeError) as exc:raise Rejected(f'bad JSONL: {exc}') from exc
    hits=[];stripped=[];last_cmd=None;after_checkpoint=False
    for e in rows:
        if not isinstance(e,dict):raise Rejected('record must be object')
        kind=e.get('event')
        if kind=='checkpoint':
            last_cmd=as_int(e.get('command_index'),'checkpoint command',0,10000000)
            after_checkpoint=True
        elif kind=='xp3d_hit_voxel':
            if not after_checkpoint:raise Rejected('hit without preceding checkpoint')
            cmd=as_int(e.get('command_index'),'hit command',0,10000000)
            if cmd!=last_cmd:raise Rejected('hit/command mismatch')
            if e.get('evidence')!=EVIDENCE:raise Rejected('unverified voxel source')
            pos=e.get('voxel')
            if type(pos) is not list or len(pos)!=3:raise Rejected('voxel must be length-3 array')
            v=[as_int(n, f'voxel[{i}]',-1000 if i==2 else -100000,1000 if i==2 else 100000)
               for i,n in enumerate(pos)]
            a=as_int(e.get('actor'),'actor',-1,10000000)
            part=as_int(e.get('part'),'part',-10,1000)
            power=as_int(e.get('power'),'power',1,1000000)
            dmg=as_int(e.get('rolled_damage'),'rolled damage',-1000000,1000000)
            td=as_int(e.get('tile_damage'),'terrain damage',-1000000,1000000)
            changed=as_int(e.get('terrain_visibility_changed'),'visibility change',0,1)
            ranged=as_int(e.get('ranged'),'ranged flag',0,1)
            hits.append((cmd,a,*v,part,power,dmg,td,changed,ranged))
            if len(hits)>65536:raise Rejected('impact cap reached')
            continue
        elif kind=='error':
            raise Rejected('original native trace reports error')
        elif kind in ('native_ready','xp3d_visual_fire','plan_completed'):
            pass
        else:
            raise Rejected(f'unsupported event {kind!r}')
        stripped.append(e)
    # Stage06's source validator handles checkpoint identity, duplicates, ordering,
    # point/actor validation, missing files, and file hash provenance metadata.
    filtered=('\n'.join(json.dumps(r,separators=(',',':')) for r in stripped)+'\n').encode()
    feed, report=export(filtered,checkpoint_dir)
    wire=feed.decode().splitlines()
    assert wire[0].startswith('XPZ3D2\t')
    wire[0]='XPZ3D3\t'+hashlib.sha256(trace).hexdigest()+'\t'+wire[0].split('\t')[2]
    # A checkpoint is followed by zero or more native impacts, then optionally
    # a visual fire request, and finally a subsequent checkpoint. Associate impact
    # with that checkpoint in the original native ordering, not an invented hit.
    grouped={}
    cursor=-1
    for e in rows:
        if e.get('event')=='checkpoint':
            cursor+=1
        elif e.get('event')=='xp3d_hit_voxel':
            grouped.setdefault(cursor,[]).append(e)
    output=[];frame=-1;cursor_cmd=None
    for line in wire:
        t=line.split('\t')
        if t[0]=='F':frame=int(t[1]);cursor_cmd=int(t[4]);output.append(line)
        elif t[0]=='E':
            for item in grouped.get(frame,[]):
                p=item['voxel']
                fields=('I',item['command_index'],item['actor'],*p,item['part'],item['power'],
                        item['rolled_damage'],item['tile_damage'],item['terrain_visibility_changed'],
                        item['ranged'],EVIDENCE)
                if item['command_index']!=cursor_cmd:raise Rejected('frame/source command mismatch')
                output.append('\t'.join(map(str,fields)))
            output.append(line)
        else:output.append(line)
    report.update({'visual_feed_version':'XPZ3D3','trace_sha256':hashlib.sha256(trace).hexdigest(),
                   'native_damage_application_voxels':len(hits),
                   'actual_projectile_paths_recorded':0,
                   'actual_silent_storm_runtime_attached':False,
                   'native_binary_authenticated':False})
    return ('\n'.join(output)+'\n').encode('utf-8'),report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--trace',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--checkpoint-dir',type=Path)
    p.add_argument('--report',type=Path)
    a=p.parse_args()
    try:result,report=adapt(a.trace.read_bytes(),a.checkpoint_dir)
    except (OSError,ValueError,Rejected) as e:
        print('REJECTED:',e,file=sys.stderr);return 2
    a.out.parent.mkdir(parents=True,exist_ok=True)
    tmp=a.out.with_suffix(a.out.suffix+'.tmp');tmp.write_bytes(result);tmp.replace(a.out)
    if a.report:a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,sort_keys=True));return 0
if __name__=='__main__':sys.exit(main())
