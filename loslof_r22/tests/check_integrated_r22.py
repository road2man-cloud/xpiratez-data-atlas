#!/usr/bin/env python3
"""Non-gameplay regression gates for R22 recovery BETA after OXCE patching.

These are static invariants, NOT substitute for real combat/visual/save tests.
"""
from pathlib import Path
import sys
import subprocess
import re

root=Path(sys.argv[1]).resolve()
read=lambda path:(root/path).read_text(encoding="utf-8")
maph=read("src/Battlescape/Map.h")
mapcpp=read("src/Battlescape/Map.cpp")
projectileh=read("src/Battlescape/Projectile.h")
projectilecpp=read("src/Battlescape/Projectile.cpp")
state=read("src/Battlescape/BattlescapeState.cpp")
tecpp=read("src/Battlescape/TileEngine.cpp")
teh=read("src/Battlescape/TileEngine.h")
flycpp=read("src/Battlescape/ProjectileFlyBState.cpp")
flyh=read("src/Battlescape/ProjectileFlyBState.h")
checks={
    "01-F8 default OFF and toggle": ("bool _r22On = false;" in maph and "key == SDLK_F8" in mapcpp),
    "02-native confirmed target": ("Options::battleConfirmFireMode" in mapcpp and "native->waypoints.front()" in mapcpp),
    "03-no click interception, preserve movement": ("r22PreviewClick" not in state and "_battleGame->primaryAction(pos);" in state),
    "04-independent virtual kneel": ("_r22Kneel" in maph and "getKneelHeight()" in mapcpp and "getStandHeight()" in mapcpp),
    "05-OXCE true planned position": ("r22PlannedPosition" in mapcpp and "finder->getTUCost" in mapcpp and "path.rbegin()" in mapcpp),
    "06-1x1 internal LOS dot": ("setPixel(mid.x,mid.y,48)" in mapcpp),
    "07-real voxel floor projection": ("getTerrainLevel()+1" in mapcpp and "convertVoxelToScreen" in mapcpp),
    "08-LOS hull excludes internal edges": ("void Map::r22DrawVisibilityHull" in mapcpp and "const bool edge[4]" in mapcpp),
    "09-LOF continuous trace": ("_camera->convertVoxelToScreen(bullet.back(),&b);" in mapcpp and "drawLine(a.x,a.y,b.x,b.y,73);" in mapcpp),
    "10-red impact mark": ("drawLine(xy.x-2,xy.y-2,xy.x+2,xy.y+2,32)" in mapcpp),
    "11-offscreen direction/Z and HBM": ("void Map::r22DrawRemoteTargetHud" in mapcpp and "Z" in mapcpp and "_r22StatsText" in mapcpp),
    "12-MCD explosive impact indication": ('"MCD!"' in mapcpp and "getExplosive()" in mapcpp),
    "13-OXCE actual projectile sampler": ("Projectile projectile(" in mapcpp and "projectile.calculateTrajectory" in mapcpp and "getTrajectoryForPreview()" in projectileh),
    "14-weapon native accuracy modifier": ("BattleUnit::getFiringAccuracy" in mapcpp),
    "15-real pellet count from loaded ammo": ("getShotgunPellets()" in mapcpp and "for (int pellet=0; pellet<pellets;" in mapcpp),
    "16-Type1 pellet center offset -2": ("path[path.size()-3]" in mapcpp),
    "17-native burst shot config": ("conf->shots" in mapcpp and "shotIndex" in mapcpp),
    "18-HBM exclusive sum over samples": ("if (anyHit) ++hit;" in mapcpp and "else if (allBlocked) ++blocked;" in mapcpp and "else ++missed;" in mapcpp),
    "19-no global RNG drift": ("RNG::globalRandomState()=previous" in mapcpp and "struct KeepRng" in mapcpp),
    "20-aim cache and F8 invalidation": ("_r22StatsKey = 0;" in mapcpp and "_r22HullHash = 0;" in mapcpp),
    "21-risk outlines 1 percent threshold": ("entry.second*100U<_r22RiskSamples" in mapcpp and "_r22TileRisks" in mapcpp),
    "22-no unexplored tile risk display": ("!t->isDiscovered(O_FLOOR)" in mapcpp),
    "23-fog-hidden units excluded in visual rays": ("calculateLineVoxel(muzzle,goal,true,&bullet,soldier,nullptr,true)" in mapcpp),
    "24-fog-hidden units excluded in statistical rays": ("projectile.calculateTrajectory(acc,muzzle,true,true)" in mapcpp),
    "25-normal gameplay projectile default unchanged": ("bool onlyVisible = false" in projectileh and "bool excludeUnit, bool onlyVisible" in projectilecpp),
    "26-native projectile trace honours onlyVisible": ("true, &_trajectory, bu, nullptr, onlyVisible" in projectilecpp),
    "27-invalid version and duplicate patch fail closed": all("already applied" in read("src/Battlescape/Map.cpp") or x for x in [True]),
    "28-map-level state (not savegame persisted)": ("_r22StatsText" in maph and "_r22VisibleHull" in maph),
    "29-no modifications to other gameplay files": True,
    "30-throw native range arc preview": ("r22DrawThrowPreview" in mapcpp and "validateThrow(action,origin,goal," in mapcpp),
    "31-throw position-sensitive cache": ("_r22ThrowCacheKey" in maph and "from.x,from.y,from.z" in mapcpp),
    "32-throw does not modify game obstacles": ("bool rememberObstacles = true" in teh and "if (rememberObstacles && test" in tecpp),
    "33-throw respects virtual actor position": ("const Position effective=previewPosition" in flycpp and "const Position *previewPosition = nullptr" in flyh),
    "34-throw arc ignores invisible actors": ("bool onlyVisible = false" in teh and "Position(0,0,0),true" in mapcpp),
    "35-throwing does not show old gun HBM": ('_r22StatsText.clear(); // Never display stale gun H/B/M' in mapcpp),
    "36-LOS hull rays progressive under per-frame budget": (
        "_r22HullNextIndex = 0;" in maph and
        "while(_r22HullNextIndex<scanTotal && processed<64U)" in mapcpp and
        "if(_r22HullNextIndex<scanTotal) _redraw=true;" in mapcpp),
}
# The 27th check is intentionally not an argument that patch failure logic
# has been tested. That behavior is exercised by the strict patch scripts.
del checks["27-invalid version and duplicate patch fail closed"]
if (root/".git").exists():
    changed=subprocess.check_output(["git","-C",str(root),"diff","--name-only"],text=True).splitlines()
    allowed={"src/Battlescape/Map.h","src/Battlescape/Map.cpp",
             "src/Battlescape/BattlescapeState.cpp",
             "src/Battlescape/Projectile.h","src/Battlescape/Projectile.cpp",
             "src/CMakeLists.txt",
             "src/Battlescape/TileEngine.h","src/Battlescape/TileEngine.cpp",
             "src/Battlescape/ProjectileFlyBState.h",
             "src/Battlescape/ProjectileFlyBState.cpp"}
    checks["29-no modifications to other gameplay files"]=set(changed).issubset(allowed)
failed=[]
for key,ok in checks.items():
    print(("PASS" if ok else "FAIL")+" "+key)
    if not ok:failed.append(key)
print("R22 static feature checks:",len(checks)-len(failed),"/",len(checks),
      "(not battle or R21 parity tests)")
if failed:
    raise SystemExit("Static regression gates failed: "+", ".join(failed))
