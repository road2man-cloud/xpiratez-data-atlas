#!/usr/bin/env python3
"""R22 8.6.0 recovery hardening - visible-only rays, exact stance delta, real pellet rebound point.

Requires preceding map preview, experimental ballistics and R21 UX recovery
scripts. Retains original projectile function behavior for real firing:
the new onlyVisible parameter defaults to false, and is true ONLY for preview.
Never claims R21 original-source equivalence.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

PIN="3e722e09b655ab67acfb59fc8585dc70b583826c"
TAG="LOSLOF_R22_HARDENED_VISIBLE_ONLY"

def once(s,old,new):
    n=s.count(old)
    if n!=1:raise RuntimeError("Expected unique pattern %r, found %d"%(old[:120],n))
    return s.replace(old,new,1)

def patch(mapcpp,projectile_h,projectile_cpp,version):
    if TAG in mapcpp or TAG in projectile_h or TAG in projectile_cpp:
        raise RuntimeError("Safety patch already applied")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise RuntimeError("Unsupported OXCE release")

    # Critical gameplay parity: engine actual kneel height may be different
    # by armor type. Never assume a hardcoded +/-4 voxel kneel delta.
    mapcpp=once(mapcpp,
        '''    int stanceDelta = (_r22Locked && (_r22Kneel != soldier->isKneeled())) ?
        (_r22Kneel ? -4 : 4) : 0;''',
        '''    // LOSLOF_R22_HARDENED_VISIBLE_ONLY: native armor-specific stance height.
    int stanceDelta = (_r22Locked && (_r22Kneel != soldier->isKneeled())) ?
        ((_r22Kneel ? soldier->getKneelHeight() : soldier->getStandHeight())
         - soldier->getHeight()) : 0;''')

    # Unseen target units are not usable for a target-height hint.
    mapcpp=once(mapcpp,
        '''    int aimHeight = targetTile->getUnit() ?
        std::max(3, targetTile->getUnit()->getHeight()/2) : 12;''',
        '''    const BattleUnit *targetUnit = targetTile->getUnit();
    int aimHeight = targetUnit && targetUnit->getVisible() ?
        std::max(3, targetUnit->getHeight()/2) : 12;''')

    # Never disclose an unseen enemy from voxel traces (both LOS/LOF).
    mapcpp=once(mapcpp,
        'calculateLineVoxel(eye, goal, true, &vision, soldier);',
        'calculateLineVoxel(eye, goal, true, &vision, soldier, nullptr, true);')
    mapcpp=once(mapcpp,
        'calculateLineVoxel(muzzle,goal,true,&bullet,soldier);',
        'calculateLineVoxel(muzzle,goal,true,&bullet,soldier,nullptr,true);')
    # Two per-ray draw loops in the original R22 reconstruction.
    pixel_guard='''        if (!t) continue;
        Position xy;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,'''
    if mapcpp.count(pixel_guard)!=2:raise RuntimeError("Expected two original ray drawing loops")
    mapcpp=mapcpp.replace(pixel_guard,
        '''        if (!t || !t->isDiscovered(O_FLOOR)) continue;
        Position xy;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,''')

    # Only optional extra parameter; original gameplay code paths unchanged.
    projectile_h=once(projectile_h,
        'int calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit = true);',
        '''/// onlyVisible=true excludes fog-hidden units in R22 preview mode ONLY.
    int calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit = true, bool onlyVisible = false);''')
    projectile_cpp=once(projectile_cpp,
        'int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit)',
        'int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit, bool onlyVisible)')
    projectile_cpp=once(projectile_cpp,
        'calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, bu);',
        'calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, bu, nullptr, onlyVisible);')
    projectile_cpp=once(projectile_cpp,
        'calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, nullptr);',
        'calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, nullptr, nullptr, onlyVisible);')
    projectile_cpp=once(projectile_cpp,
        'calculateLineVoxel(originVoxel, _targetVoxel, true, &_trajectory, bu);',
        'calculateLineVoxel(originVoxel, _targetVoxel, true, &_trajectory, bu, nullptr, onlyVisible);')
    # The actual action still calls calculateTrajectory(..., bool) unchanged.
    # Only our independent sampler uses visible-only tracing.
    mapcpp=once(mapcpp,
        'const int status=projectile.calculateTrajectory(acc,muzzle);',
        'const int status=projectile.calculateTrajectory(acc,muzzle,true,true);')

    # OXCE Pellet Type 1 follows the first projectile position(-2).
    # In the completed trajectory this is path[size-3], NOT path.back().
    mapcpp=once(mapcpp,
        'std::set<int>& risk, Position& impact)',
        'std::set<int>& risk, Position& impact, Position& preImpact)')
    mapcpp=once(mapcpp,
        'impact=path.back();',
        '''impact=path.back();
            preImpact=path.size()>2 ? path[path.size()-3] : path.front();''')
    mapcpp=once(mapcpp,
        '''Position collision=aim;
                    shot(aimed,pelletAcc,shotIndex,oneHit,oneBlocked,tileRisk,collision);
                    if (pellet==0) firstImpact=collision;''',
        '''Position collision=aim, nearCollision=aim;
                    shot(aimed,pelletAcc,shotIndex,oneHit,oneBlocked,tileRisk,collision,nearCollision);
                    if (pellet==0) firstImpact=nearCollision;''')

    # Force visible state reload on F8 and target lock changes.
    mapcpp=once(mapcpp,
        '''            _r22On = !_r22On;
            _r22Locked = false;
            _redraw = true;''',
        '''            _r22On = !_r22On;
            _r22Locked = false;
            _r22StatsKey = 0;
            _r22HullHash = 0;
            _redraw = true;''')
    mapcpp=once(mapcpp,
        '''    if (!_r22Locked)
    {
        _r22Target = tile;''',
        '''    if (!_r22Locked)
    {
        _r22StatsKey = 0;
        _r22HullHash = 0;
        _r22Target = tile;''')

    return mapcpp,projectile_h,projectile_cpp

def main():
    a=argparse.ArgumentParser()
    a.add_argument("engine",type=Path)
    a.add_argument("--dry-run",action="store_true")
    args=a.parse_args()
    root=args.engine.resolve()
    files=[root/"src/Battlescape/Map.cpp",root/"src/Battlescape/Projectile.h",
           root/"src/Battlescape/Projectile.cpp"]
    version=root/"src/version.h"
    if not all(f.is_file() for f in files+[version]):
        raise SystemExit("Missing 8.6.0 files")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN:raise SystemExit("Wrong upstream sha "+sha)
    original=[f.read_text(encoding="utf-8") for f in files]
    new=patch(*original,version.read_text(encoding="utf-8"))
    if not args.dry_run:
        for f,s in zip(files,new):f.write_text(s,encoding="utf-8")
    print(json.dumps({"stage":"R22 VISIBLE ONLY + NATIVE STANCE + PELLET OFFSET",
        "not_r21_certified":True,"dry_run":args.dry_run,
        "files":{f.name:hashlib.sha256(s.encode()).hexdigest()
                 for f,s in zip(files,new)}},indent=2))

if __name__=="__main__":
    main()
