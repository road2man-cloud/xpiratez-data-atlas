#!/usr/bin/env python3
"""Fail closed on native partial-cover aim and no-launch burst regressions.

Static engine integration checks only: they don't prove real battle probability
calibration. Test with aimed + auto fire on partial cover in game separately.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
def read(path):return (root/path).read_text(encoding="utf-8")
m=read("src/Battlescape/Map.cpp")
h=read("src/Battlescape/Map.h")
th=read("src/Battlescape/TileEngine.h")
tc=read("src/Battlescape/TileEngine.cpp")
fly=read("src/Battlescape/ProjectileFlyBState.cpp")

overlay=m.split("void Map::r22DrawOverlay()",1)[1].split("\n}\n",1)[0]
stats=m.split("void Map::r22DrawStats(",1)[1].split("\n}\n",1)[0]
native_scan=tc.split("bool TileEngine::canTargetUnit(",1)[1].split("\n}\n",1)[0]
checks={
    "native engine first attempts to select exposed enemy voxel":
        "canTargetUnit(&originVoxel, targetTile, &_targetVoxel, _unit, isPlayer)" in fly,
    "preview visible-only overload leaves native callers default unchanged":
        "BattleUnit *potentialUnit = 0, bool onlyVisible = false" in th
        and "BattleUnit *potentialUnit, bool onlyVisible)" in tc,
    "native unit scanning ignores invisible intermediate units only in preview":
        "calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit, nullptr, onlyVisible)" in native_scan,
    "cover scan considers left and right muzzle candidates":
        "BattleActionOrigin::LEFT" in overlay
        and "BattleActionOrigin::RIGHT" in overlay
        and "Options::oxceEnableOffCentreShooting" in overlay,
    "native preview uses voxel candidates rather than guessed target centre":
        "Position goal(target.x*16+8, target.y*16+8," in overlay
        and "goal=_r22NativeAimGoal;" in overlay
        and "canTargetUnit(" in overlay
        and "false,nullptr,true)" in overlay
        and "false,aimUnit,true)" not in overlay,
    "sample muzzle adjusted to same offcentre candidate":
        "testAction.relativeOrigin=" in overlay
        and "getOriginVoxel(testAction, startTile)" in overlay,
    "heavy native aim scan cached but refreshes periodically":
        "_r22NativeAimKey = 0;" in h
        and "aimNow-_r22NativeAimCheckedAt>900U" in overlay
        and "source.x,source.y,source.z," in overlay
        and "native->weapon" in overlay,
    "cannot aim case is explicit not made-up numerical HBM":
        'bool nativeNoLof = false;' in overlay
        and '_r22StatsText="NO LOF";' in overlay
        and "if (nativeNoLof)" in overlay
        and "else if(targetTile->isDiscovered(O_FLOOR)" in overlay,
    "no mutating original native BattleAction or gameplay input":
        "BattleAction testAction = *native;" in overlay
        and "BattleAction testSide=testAction;" in overlay
        and "false,nullptr,true)" in overlay,
    "first native bullet cancellation ends whole automatic burst":
        "rejectedByNative=true;" in stats
        and "if (shotIndex==1 && pellet==0 && nativeRejected)" in stats
        and "firstShotRejected=true;" in stats
        and "if (firstShotRejected) break;" in stats
        and "if (firstShotRejected) ++blocked;" in stats,
    "pellet offset and risk sampling not deleted":
        "firstImpact=nearCollision;" in stats
        and "_r22RiskSamples < 384U" in stats,
    "preview uses 1024 trials 95ms batch and RNG restore":
        "_r22SampleCount < 1024U" in stats
        and "now-_r22StatsBatchTick>=95U" in stats
        and "RNG::globalRandomState()=previous;" in stats and "RNG::RandomState previewRng(" in stats,
    "LOS cache is not suppressed by NO LOF branch":
        "_r22HullWorkPending=false;" not in overlay,
}
failed=[]
for key,value in checks.items():
    print(("PASS" if value else "FAIL")+" "+key)
    if not value:failed.append(key)
print(f"Native ballistic aim static checks: {len(checks)-len(failed)}/{len(checks)}")
if failed:
    raise SystemExit("Native ballistic aim regression checks failed: "+", ".join(failed))
