#!/usr/bin/env python3
"""Generate local-only source overlays for opt-in OXCE trace + Silent Storm feed.

Never publishes either upstream game's source or overwrites a user's install.
Patch anchoring is verified. A separate build of modified sources is required.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import shutil
import sys

HERE=pathlib.Path(__file__).resolve().parents[1]

class PatchError(RuntimeError):pass

def pin_anchor(s, before, after, name):
    if s.count(before)!=1:raise PatchError(f'{name} anchor missing/ambiguous: expected 1, observed {s.count(before)}')
    if after in s:raise PatchError(f'{name} already patched')
    return s.replace(before,after,1)

def stage_ss(source: pathlib.Path, destination: pathlib.Path):
    original_main=(source/'Game/Main.cpp').read_text(encoding='utf-8-sig')
    original_cmake=(source/'CMakeLists.txt').read_text(encoding='utf-8-sig')
    main=pin_anchor(original_main,'#include "WinFrame.h"\n',
          '#include "WinFrame.h"\n#include "XPZVisualFeed.h"\n','Silent Storm include')
    main=pin_anchor(main,'\t\tNHPTimer::UpdateHPTimerFrequency();\n',
          '\t\tNHPTimer::UpdateHPTimerFrequency();\n\t\tXPZVisual::PollWin32(); // opt-in read-only OXCE visual feed\n',
          'Silent Storm frame loop')
    cmake=pin_anchor(original_cmake,'target_link_options(Game PRIVATE /LARGEADDRESSAWARE)\n',
          'target_link_options(Game PRIVATE /LARGEADDRESSAWARE)\n'
          'target_sources(Game PRIVATE "${root}/Game/XPZVisualFeed.cpp")\n','Silent Storm Game CMake')
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'Game').mkdir(exist_ok=True)
    (destination/'Game/Main.cpp').write_text(main,encoding='utf-8',newline='')
    (destination/'CMakeLists.txt').write_text(cmake,encoding='utf-8',newline='')
    for name in ('XPZVisualFeed.cpp','XPZVisualFeed.h'):
        shutil.copy2(HERE/'ss'/name,destination/'Game'/name)
    return {'source':'met-nikita/Silent-Storm-Reconstruction',
            'base_readme_2026-10-18':'Windows MSVC Win32 / x86 only',
            'input_main_sha256':hashlib.sha256(original_main.encode()).hexdigest(),
            'input_cmake_sha256':hashlib.sha256(original_cmake.encode()).hexdigest(),
            'output_main_sha256':hashlib.sha256(main.encode()).hexdigest(),
            'output_cmake_sha256':hashlib.sha256(cmake.encode()).hexdigest(),
            'compiled_in_actual_silent_storm':False}

def stage_oxce(source:pathlib.Path,destination:pathlib.Path):
    old=(source/'ReplayDriver.h').read_text(encoding='utf-8-sig')
    anchor='            pending = false;\n            observe(game, "after_action");\n'
    snippet='''            pending = false;
            observe(game, "after_action");
            // XPZ visual-only hook: "fire" is a requested aim, NOT a hit voxel.
            // Runs after ORIGINAL OXCE has resolved the queued action.
            if (previous.op == "fire") {
                trace << "{\\\"event\\\":\\\"xp3d_visual_fire\\\",\\\"command_index\\\":" << cursor
                      << ",\\\"actor\\\":" << previous.actor << ",\\\"item\\\":" << previous.item
                      << ",\\\"mode\\\":\\\"" << previous.mode << "\\\",\\\"target\\\":["
                      << previous.x << ',' << previous.y << ',' << previous.z
                      << "],\\\"evidence\\\":\\\"requested_target_not_impact\\\"}\\n";
                trace.flush();
            }
'''
    patched=pin_anchor(old,anchor,snippet,'OXCE ReplayDriver resolved-fire hook')
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'ReplayDriver.h').write_text(patched,encoding='utf-8',newline='')
    return {'source':'road2man-cloud/xpiratez-data-atlas/tools/headless-simulator/native/ReplayDriver.h',
            'input_sha256':hashlib.sha256(old.encode()).hexdigest(),
            'output_sha256':hashlib.sha256(patched.encode()).hexdigest(),
            'compiled_in_original_oxce':False,
            'gameplay_rng_touched':False,
            'emission':'requested_target_not_impact'}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--silent-storm-checkout',type=pathlib.Path)
    ap.add_argument('--oxce-adapter-dir',type=pathlib.Path,
                    help='source folder holding ReplayDriver.h; do not write original here')
    ap.add_argument('--overlay-output',type=pathlib.Path,required=True)
    a=ap.parse_args()
    if not a.silent_storm_checkout and not a.oxce_adapter_dir:
        ap.error('supply at least one source checkout')
    if a.overlay_output.exists() and any(a.overlay_output.iterdir()):
        ap.error('overlay output must be a new empty directory')
    a.overlay_output.mkdir(parents=True,exist_ok=True)
    try:
        result={}
        if a.silent_storm_checkout:result['silent_storm']=stage_ss(a.silent_storm_checkout,a.overlay_output/'silent_storm')
        if a.oxce_adapter_dir:result['oxce']=stage_oxce(a.oxce_adapter_dir,a.overlay_output/'oxce')
    except (PatchError, OSError) as e:
        print('REJECTED:',e,file=sys.stderr);return 2
    (a.overlay_output/'overlay-manifest.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps(result,indent=2));return 0
if __name__=='__main__':sys.exit(main())
