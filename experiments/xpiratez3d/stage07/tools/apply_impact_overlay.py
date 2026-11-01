#!/usr/bin/env python3
"""Produce opt-in patches from actual OXCE TileEngine + ReplayDriver source.

Inputs stay immutable. Source branches MUST be pinned and reviewed separately.
No Nival or OXCE source copied into the repository; outputs are local overlays.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]

class Rejected(RuntimeError):pass

def sha(b):return hashlib.sha256(b).hexdigest()

def require_one(src, anchor, name):
    count=src.count(anchor)
    if count!=1:raise Rejected(f'{name} must occur once, found {count}')

def patch_tile(source):
    require_one(source,'#include "TileEngine.h"\n','TileEngine include')
    require_one(source,'void TileEngine::hit(','TileEngine::hit function')
    begin=source.index('void TileEngine::hit(')
    end=source.find('\n/**\n * Handles explosions.',begin)
    if end<0:raise Rejected('TileEngine::hit must terminate before explode')
    hit=source[begin:end]
    if 'NativeImpactTrace' in source:raise Rejected('already instrumented TileEngine.cpp')
    require_one(hit,'\t//and will continue to block visibility at this point in time.\n','end of TileEngine hit')
    require_one(hit,'const int tileFinalDamage = type->getTileFinalDamage(','tile damage computation')
    require_one(hit,'calculateFOV(tilePos, 1, false);','non-destructive hit update')
    # At this location original hit/damage & associated visibility update have
    # completed. Precise contact center was provided to TileEngine::hit; for
    # explosions, direct attacks and melee this is a damage-application voxel.
    added='''\t// Optional read-only OXCE hit observation. This is NOT a bullet-path reconstruction.
\tNativeImpactTrace::record(center.x, center.y, center.z, static_cast<int>(part),
\t\tpower, damage, tileFinalDamage, terrainChanged ? 1 : 0,
\t\tattack.attacker ? attack.attacker->getId() : -1, rangeAtack ? 1 : 0);
'''
    last=hit.rfind('\n}')
    if last<0:raise Rejected('hit body closing brace not found')
    hit=hit[:last]+'\n'+added+hit[last:]
    source=source[:begin]+hit+source[end:]
    return source.replace('#include "TileEngine.h"\n', '#include "TileEngine.h"\n#include "NativeImpactTrace.h"\n',1)

def patch_driver(src):
    if 'NativeImpactTrace' in src:raise Rejected('already instrumented ReplayDriver.h')
    require_one(src,'#include "../Battlescape/BattlescapeState.h"\n','ReplayDriver include')
    require_one(src,'        trace << "]}\\n";\n        trace.flush();','checkpoint writer')
    src=src.replace('#include "../Battlescape/BattlescapeState.h"\n',
                    '#include "../Battlescape/BattlescapeState.h"\n#include "../Battlescape/NativeImpactTrace.h"\n',1)
    emit='''        trace << "]}\\n";
        // Drain AFTER the canonical original save/checkpoint is recorded; no combat mutation.
        int impactOverflow = 0;
        const auto appliedHits = NativeImpactTrace::drain(&impactOverflow);
        for (const auto &h : appliedHits) {
            trace << "{\\"event\\":\\"xp3d_hit_voxel\\",\\"command_index\\":" << cursor
                  << ",\\"actor\\":" << h.attacker_id << ",\\"voxel\\":[" << h.vx << ',' << h.vy << ',' << h.vz
                  << "],\\"part\\":" << h.part << ",\\"power\\":" << h.power
                  << ",\\"rolled_damage\\":" << h.rolled_damage << ",\\"tile_damage\\":" << h.tile_damage
                  << ",\\"terrain_visibility_changed\\":" << h.visibility_changed
                  << ",\\"ranged\\":" << h.ranged
                  << ",\\"evidence\\":\\"tile_engine_hit_damage_application_voxel\\"}\\n";
        }
        if (impactOverflow != 0) {
            trace << "{\\"event\\":\\"error\\",\\"code\\":\\"XPZ3D_IMPACT_QUEUE_OVERFLOW\\",\\"dropped\\":" << impactOverflow << "}\\n";
        }
        trace.flush();'''
    src=src.replace('        trace << "]}\\n";\n        trace.flush();',emit,1)
    return src

def patch(tile_path:Path, driver_path:Path, out:Path):
    if out.exists() and any(out.iterdir()):raise Rejected('output must be new or empty')
    tile_bytes=tile_path.read_bytes();driver_bytes=driver_path.read_bytes()
    if len(tile_bytes)>3_000_000 or len(driver_bytes)>300_000:raise Rejected('source oversized')
    # CRLF is canonical in installed Win32 RC18; normalize overlays only.
    tile=tile_bytes.decode('utf-8-sig').replace('\r\n','\n')
    driver=driver_bytes.decode('utf-8-sig').replace('\r\n','\n')
    p_tile=patch_tile(tile);p_driver=patch_driver(driver)
    out.joinpath('src/Battlescape').mkdir(parents=True,exist_ok=True)
    out.joinpath('native').mkdir(parents=True,exist_ok=True)
    out.joinpath('src/Battlescape/TileEngine.cpp').write_text(p_tile,encoding='utf-8',newline='\n')
    out.joinpath('native/ReplayDriver.h').write_text(p_driver,encoding='utf-8',newline='\n')
    shutil.copy2(ROOT/'native/NativeImpactTrace.h',out/'src/Battlescape/NativeImpactTrace.h')
    manifest={
      'schema':'xp3d-actual-oxce-hit-overlays.v1',
      'inputs':{'TileEngine_sha256':sha(tile_bytes),'ReplayDriver_sha256':sha(driver_bytes)},
      'outputs':{'TileEngine_sha256':sha(p_tile.encode()),'ReplayDriver_sha256':sha(p_driver.encode()),
                 'NativeImpactTrace_sha256':sha((ROOT/'native/NativeImpactTrace.h').read_bytes())},
      'original_gameplay_damage_unchanged_by_patch':True,
      'original_engine_compiled':False,'original_engine_executed':False,
      'native_impact_events_tested_in_real_battle':False,
      'identity_proof':'source anchor and byte hashes, not actual runtime verification'
    }
    (out/'patch-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return manifest

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--tile-engine',required=True,type=Path)
    p.add_argument('--replay-driver',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    try:print(json.dumps(patch(a.tile_engine,a.replay_driver,a.output),indent=2))
    except (Rejected,ValueError,OSError) as e:
        print(f'REJECTED: {e}',file=sys.stderr);return 2
    return 0
if __name__=='__main__':sys.exit(main())
