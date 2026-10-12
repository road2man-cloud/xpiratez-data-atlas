#!/usr/bin/env python3
"""Stage 7: repair native voxel aim selection and first-shot burst rejection.

Strictly applied AFTER all six R22 patches. Does not intercept user input.
Original OXCE action logic is unchanged; extra onlyVisible API flag defaults
false, so the normal battle engine keeps its original semantics.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
TAG = "LOSLOF_R22_NATIVE_BALLISTIC_AIM_20261013"

def once(s, before, after):
    count = s.count(before)
    if count != 1:
        raise RuntimeError("Unsafe ballistic aim patch anchor (%d): %s" %
                           (count, repr(before[:110])))
    return s.replace(before, after, 1)

def patch(maph, mapcpp, teh, tecpp):
    if any(TAG in src for src in (maph, mapcpp, teh, tecpp)):
        raise RuntimeError("Ballistic aim patch already applied")

    # The original game uses the canTargetUnit voxel scan to find an exposed
    # head/torso/leg/edge voxel, not just the target's centre. Add a preview-
    # ONLY flag; all gameplay callers retain the original default false.
    teh=once(teh,
        "bool canTargetUnit(Position *originVoxel, Tile *tile, Position *scanVoxel, BattleUnit *excludeUnit, bool rememberObstacles, BattleUnit *potentialUnit = 0);",
        "bool canTargetUnit(Position *originVoxel, Tile *tile, Position *scanVoxel, BattleUnit *excludeUnit, bool rememberObstacles, BattleUnit *potentialUnit = 0, bool onlyVisible = false);")
    sig="bool TileEngine::canTargetUnit(Position *originVoxel, Tile *tile, Position *scanVoxel, BattleUnit *excludeUnit, bool rememberObstacles, BattleUnit *potentialUnit)"
    start=tecpp.index(sig)
    end=tecpp.index("\n}\n",start)+3
    segment=tecpp[start:end]
    segment=once(segment,sig,
        "bool TileEngine::canTargetUnit(Position *originVoxel, Tile *tile, Position *scanVoxel, BattleUnit *excludeUnit, bool rememberObstacles, BattleUnit *potentialUnit, bool onlyVisible)")
    segment=once(segment,
        "int test = calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit);",
        "int test = calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit, nullptr, onlyVisible);")
    tecpp=tecpp[:start]+segment+tecpp[end:]

    maph=once(maph,"    unsigned long long _r22StatsKey = 0;",
        """    // Cache expensive native voxel scan for the same aim/weapon/stance.
    unsigned long long _r22NativeAimKey = 0;
    Uint32 _r22NativeAimCheckedAt = 0;
    Position _r22NativeAimGoal = Position(0,0,0);
    bool _r22NativeAimFound = false;
    int _r22NativeAimSide = 0;
    unsigned long long _r22StatsKey = 0;""")

    # Make the selected aim voxel mutable. LOS drawing can remain centred for
    # readability, while the actual bullet/Monte Carlo uses the exposed voxel.
    mapcpp=once(mapcpp,
        """    const Position goal(target.x*16+8, target.y*16+8,
        target.z*24-targetTile->getTerrainLevel()+aimHeight);""",
        """    Position goal(target.x*16+8, target.y*16+8,
        target.z*24-targetTile->getTerrainLevel()+aimHeight);""")
    mapcpp=once(mapcpp,
        """    BattleAction testAction = *native; // read-only action snapshot
    testAction.actor = soldier;
    testAction.target = target;""",
        """    BattleAction testAction = *native; // read-only action snapshot
    testAction.actor = soldier;
    testAction.target = target;

    // LOSLOF_R22_NATIVE_BALLISTIC_AIM_20261013
    // Reuse native OXCE canTargetUnit's multi-voxel scan on a visible enemy.
    // This matters most when the centre is hidden but a head/side is exposed.
    // Off-centre firing tries CENTRE, LEFT, RIGHT in the same order as OXCE.
    // Never touch native BattleAction or mark obstacles on the real map.
    bool nativeNoLof = false;
    BattleUnit *aimUnit=targetTile->getUnit();
    if (aimUnit && aimUnit->getVisible() && aimUnit!=soldier &&
        !testAction.sprayTargeting &&
        !(Options::forceFire && _save->isCtrlPressed(true)) &&
        targetTile->isDiscovered(O_FLOOR))
    {
        unsigned long long aimKey=1469598103934665603ULL;
        auto aimMix=[&](unsigned long long v) {
            aimKey^=v; aimKey*=1099511628211ULL;
        };
        for(int v : std::initializer_list<int>{
            soldier->getId(),source.x,source.y,source.z,
            target.x,target.y,target.z,stanceDelta,
            (int)testAction.type, (int)Options::oxceEnableOffCentreShooting,
            aimUnit->getPosition().x,aimUnit->getPosition().y,
            aimUnit->getPosition().z,aimUnit->getHeight()})
            aimMix(static_cast<unsigned>(v));
        aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(aimUnit)));
        aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(native->weapon)));
        const Uint32 aimNow=SDL_GetTicks();
        if (aimKey != _r22NativeAimKey ||
            aimNow-_r22NativeAimCheckedAt>900U)
        {
            _r22NativeAimFound=false;
            _r22NativeAimSide=0;
            _r22NativeAimGoal=goal;
            const BattleActionOrigin sides[3]={
                BattleActionOrigin::CENTRE,BattleActionOrigin::LEFT,
                BattleActionOrigin::RIGHT};
            for(int side=0;side<3;++side)
            {
                if (side>0 && !Options::oxceEnableOffCentreShooting) break;
                BattleAction testSide=testAction;
                testSide.relativeOrigin=sides[side];
                Position candidateOrigin=_save->getTileEngine()->
                    getOriginVoxel(testSide,startTile);
                candidateOrigin.z+=stanceDelta;
                Position candidateGoal=goal;
                if (_save->getTileEngine()->canTargetUnit(
                    &candidateOrigin,targetTile,&candidateGoal,soldier,
                    false,aimUnit,true))
                {
                    _r22NativeAimFound=true;
                    _r22NativeAimSide=side;
                    _r22NativeAimGoal=candidateGoal;
                    break;
                }
            }
            _r22NativeAimKey=aimKey;
            _r22NativeAimCheckedAt=aimNow;
        }
        if (_r22NativeAimFound)
        {
            goal=_r22NativeAimGoal;
            testAction.relativeOrigin=
                _r22NativeAimSide==1 ? BattleActionOrigin::LEFT :
                _r22NativeAimSide==2 ? BattleActionOrigin::RIGHT :
                BattleActionOrigin::CENTRE;
        }
        else nativeNoLof=true;
    }""")

    # Do not translate a "cannot fire at visible enemy" engine rejection into
    # artificial percentages. This is distinct from having a low chance when
    # a valid trajectory exists, especially for bursts.
    mapcpp=once(mapcpp,
        """    if(targetTile->isDiscovered(O_FLOOR) &&
        (!targetTile->getUnit() || targetTile->getUnit()->getVisible()))
        r22DrawStats(source,target,goal,muzzle);
    else
        _r22StatsText.clear();""",
        """    if (nativeNoLof)
    {
        _r22StatsKey=0;
        _r22StatsText="NO LOF";
        _r22TileRisks.clear();
        _r22SampleCount=0;
        _r22HullWorkPending=false;
    }
    else if(targetTile->isDiscovered(O_FLOOR) &&
        (!targetTile->getUnit() || targetTile->getUnit()->getVisible()))
        r22DrawStats(source,target,goal,muzzle);
    else
        _r22StatsText.clear();""")

    # Critically, when OXCE refuses to launch the FIRST projectile, the
    # remaining AUTO shots must not be counted as if they still fired.
    mapcpp=once(mapcpp,
        "std::set<int>& risk, Position& impact, Position& preImpact)",
        "std::set<int>& risk, Position& impact, Position& preImpact,\n                      bool& rejectedByNative)")
    mapcpp=once(mapcpp,
        """                // A native trajectory rejection means target cannot be fired at.
                // Do not treat it as a successful shot.
                isBlocked = true;""",
        """                // The first projectile was NOT launched in OXCE.
                // Its burst cannot continue into later shot counters.
                rejectedByNative=true;
                isBlocked = true;""")
    mapcpp=once(mapcpp,
        "bool anyHit=false, allBlocked=true;",
        "bool anyHit=false, allBlocked=true;\n            bool firstShotRejected=false;")
    mapcpp=once(mapcpp,
        """                    shot(aimed,pelletAcc,shotIndex,oneHit,oneBlocked,tileRisk,collision,nearCollision);
                    if (pellet==0) firstImpact=nearCollision;""",
        """                    bool nativeRejected=false;
                    shot(aimed,pelletAcc,shotIndex,oneHit,oneBlocked,
                         tileRisk,collision,nearCollision,nativeRejected);
                    if (shotIndex==1 && pellet==0 && nativeRejected)
                    {
                        firstShotRejected=true;
                        break;
                    }
                    if (pellet==0) firstImpact=nearCollision;""")
    mapcpp=once(mapcpp,
        """                    if (!oneBlocked && !oneHit) allBlocked=false;
                }
            }
            if (anyHit) ++hit;""",
        """                    if (!oneBlocked && !oneHit) allBlocked=false;
                }
                if (firstShotRejected) break;
            }
            if (firstShotRejected) ++blocked;
            else if (anyHit) ++hit;""")
    return maph,mapcpp,teh,tecpp

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("engine",type=Path)
    cli.add_argument("--dry-run",action="store_true")
    args=cli.parse_args()
    root=args.engine.resolve()
    files=[root/"src/Battlescape/Map.h",root/"src/Battlescape/Map.cpp",
           root/"src/Battlescape/TileEngine.h",root/"src/Battlescape/TileEngine.cpp"]
    version=root/"src/version.h"
    if not all(p.is_file() for p in files+[version]):
        raise SystemExit("Pinned OXCE files missing")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     version.read_text(encoding="utf-8")):
        raise SystemExit("Wrong engine version")
    if (root/".git").exists():
        rev=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],
                                    text=True).strip()
        if rev!=PIN:
            raise SystemExit("Wrong pinned SHA "+rev)
    old=[f.read_text(encoding="utf-8") for f in files]
    new=patch(*old)
    if not args.dry_run:
        for f,content in zip(files,new): f.write_text(content,encoding="utf-8")
    print(json.dumps({"stage":TAG,"upstream":PIN,"r21_verified":False,
        "files":{str(p.relative_to(root)):hashlib.sha256(content.encode()).hexdigest()
                 for p,content in zip(files,new)}},indent=2))
if __name__=="__main__":
    main()
