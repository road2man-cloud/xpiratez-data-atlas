#!/usr/bin/env python3
"""Convert OXCE ReplayDriver JSONL into a strictly visual-only XPZ3D2 stream.

The original native engine is the combat authority. This tool cannot verify the
engine binary or establish gameplay parity, even when checkpoint hashes match.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import re
import sys

REQUIRED_UNIT = ('id','faction','status','position','tu','health','energy','stun','morale')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
CHECKPOINT = re.compile(r'^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,94}$')

class Rejected(ValueError):
    pass

def require(cond, why):
    if not cond: raise Rejected(why)

def as_int(v, why, lo, hi):
    require(type(v) is int and lo <= v <= hi, why)
    return v

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

def export(trace: bytes, checkpoint_dir: pathlib.Path | None = None):
    require(len(trace) <= 8*1024*1024 and len(trace) > 0, 'empty or oversized trace')
    try:
        events = [json.loads(line) for line in trace.splitlines() if line.strip()]
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise Rejected(f'invalid native JSONL: {e}') from e
    require(bool(events), 'no records')
    ready = events[0]
    require(ready.get('event') == 'native_ready' and ready.get('backend') == 'OXCE_NATIVE'
            and ready.get('protocol') == 1 and ready.get('parityCertified') is False,
            'unexpected native_ready identity')
    require(sum(1 for e in events if e.get('event') == 'native_ready') == 1, 'duplicate ready')
    require(not any(e.get('event') == 'error' for e in events), 'native trace reports error')
    trace_sha = hashlib.sha256(trace).hexdigest()
    # 'session' is a deterministic correlation label, NOT an authentication token.
    session = hashlib.sha256(canonical(ready)).hexdigest()
    frames=[]; fire_actions=[]; seen_start=False; prev=None
    for event in events[1:]:
        kind=event.get('event')
        if kind == 'checkpoint':
            for required in ('file','turn','side','rng','command_index','units'):
                require(required in event, 'missing checkpoint '+required)
            fn=event['file']
            require(isinstance(fn,str) and CHECKPOINT.fullmatch(fn) and '..' not in fn, 'checkpoint filename')
            turn=as_int(event['turn'],'turn',0,999999)
            side=as_int(event['side'],'side',0,8)
            cmd=as_int(event['command_index'],'command_index',0,10000000)
            require(prev is None or cmd >= prev['command_index'], 'command order regression')
            units=event['units']; require(isinstance(units,list) and units, 'missing units')
            require(len(units)<=100000,'too many units')
            ids={}
            for u in units:
                require(isinstance(u,dict) and all(k in u for k in REQUIRED_UNIT), 'incomplete unit')
                uid=as_int(u['id'],'unit id',0,10000000)
                require(uid not in ids, 'duplicate unit')
                require(isinstance(u['position'],list) and len(u['position'])==3,'position')
                ranges=((-100000,100000),(-100000,100000),(-1000,1000))
                p=[as_int(val,f'position[{i}]',*ranges[i]) for i,val in enumerate(u['position'])]
                for key,lo,hi in [('faction',0,8),('status',0,1000),('tu',0,10000),
                                  ('health',-100000,100000),('energy',0,10000),
                                  ('stun',0,100000),('morale',0,10000)]:
                    as_int(u[key],key,lo,hi)
                ids[uid]=(uid,u['faction'],u['status'],*p,u['tu'],u['health'],u['energy'],u['stun'],u['morale'])
            # Actual original native full save checkpoint is verified when provided.
            saved_hash='-'
            if checkpoint_dir is not None:
                saved=checkpoint_dir/fn
                require(saved.is_file(), 'missing native checkpoint '+fn)
                saved_hash=hashlib.sha256(saved.read_bytes()).hexdigest()
            changed=[ids[uid] for uid in sorted(ids) if prev is None or prev['units'].get(uid)!=ids[uid]]
            removed=[] if prev is None else sorted(set(prev['units'])-set(ids))
            frames.append({'seq':len(frames),'turn':turn,'side':side,'cmd':cmd,
                           'file':fn,'hash':saved_hash,'units':changed,'removed':removed,'aims':[]})
            prev={'units':ids,'command_index':cmd}
            seen_start=True
        elif kind=='xp3d_visual_fire':
            require(seen_start, 'fire event without checkpoint')
            require(event.get('evidence')=='requested_target_not_impact','unproven fire evidence label')
            cmd=as_int(event.get('command_index'),'fire command index',0,10000000)
            actor=as_int(event.get('actor'),'fire actor',0,10000000)
            item=as_int(event.get('item'),'fire item',0,10000000)
            mode=event.get('mode')
            require(mode in ('snap','aimed','auto'),'fire mode')
            pos=event.get('target');require(isinstance(pos,list) and len(pos)==3,'fire target')
            pos=[as_int(val,'fire position',-1000 if i==2 else -100000,1000 if i==2 else 100000) for i,val in enumerate(pos)]
            candidates=[f for f in frames if f['cmd']==cmd]
            require(bool(candidates) and candidates[-1]['seq']==frames[-1]['seq'],'fire event out of order')
            require(len(frames[-1]['aims'])==0,'duplicate fire command event')
            frames[-1]['aims'].append((cmd,actor,item,mode,*pos))
            fire_actions.append(cmd)
        elif kind in ('native_ready', 'error'):
            raise Rejected('unexpected readiness/error record')
        elif kind not in ('plan_completed',):
            raise Rejected(f'unsupported trace event {kind!r}; do not silently drop events')
    require(frames, 'no original native checkpoints')
    wire=[f'XPZ3D2\t{trace_sha}\t{session}']
    for f in frames:
        wire.append('\t'.join(map(str,('F',f['seq'],f['turn'],f['side'],f['cmd'],f['file'],f['hash'],'visual'))))
        for u in f['units']:wire.append('\t'.join(map(str,('U',*u))))
        for ident in f['removed']:wire.append(f'D\t{ident}')
        for aim in f['aims']:wire.append('\t'.join(map(str,('A',*aim,'requested_aim_not_impact'))))
        wire.append(f'E\t{f["seq"]}')
    return ('\n'.join(wire)+'\n').encode('utf-8'), {
        'source_kind':'OXCE_native_trace_schema',
        'native_binary_authenticated':False,
        'gameplay_parity_certified':False,
        'checkpoint_content_hashed':checkpoint_dir is not None,
        'trace_sha256':trace_sha,
        'session_correlation_only':session,
        'frames':len(frames),
        'requested_aim_events_not_impacts':len(fire_actions),
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--trace',type=pathlib.Path,required=True)
    p.add_argument('--out',type=pathlib.Path,required=True)
    p.add_argument('--checkpoint-dir',type=pathlib.Path,default=None,
                   help='optional directory containing real xpz-native-*.sav snapshots')
    p.add_argument('--report',type=pathlib.Path,default=None)
    args=p.parse_args()
    try:
        wire, report=export(args.trace.read_bytes(),args.checkpoint_dir)
    except (Rejected,OSError) as e:
        print('REJECTED:',e,file=sys.stderr);return 2
    args.out.parent.mkdir(parents=True,exist_ok=True)
    # Temp + replace avoids the Silent Storm reader observing partial feed.
    temp=args.out.with_suffix(args.out.suffix+'.tmp')
    temp.write_bytes(wire);temp.replace(args.out)
    if args.report:args.report.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(report,ensure_ascii=False,sort_keys=True))
    return 0
if __name__=='__main__':sys.exit(main())
