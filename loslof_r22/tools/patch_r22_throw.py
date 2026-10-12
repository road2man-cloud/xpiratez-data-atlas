#!/usr/bin/env python3
"""R22 8.6.0 throw preview, no global game RNG, no tile-obstacle mutation.

Includes engine-native range/arc, hypothetical source and stance. All extra
native function arguments default to prior behavior for real actions.
Reconstruction BETA, NOT verified against missing R21 source or save.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

SHA="3e722e09b655ab67acfb59fc8585dc70b583826c"
MARK="LOSLOF_R22_THROW_PREVIEW_RECOVERY"

def one(s,old,new):
    n=s.count(old)
    if n!=1:raise RuntimeError("Expected one anchor; got %d: %r"%(n,old[:130]))
    return s.replace(old,new,1)

HEADER=r'''
    // LOSLOF_R22_THROW_PREVIEW_RECOVERY - strictly map-local state.
    void r22DrawThrowPreview(const Position& from, const Position& destination,
        const Tile* originTile, const Tile* targetTile);
    unsigned long long _r22ThrowCacheKey = 0;
    Uint32 _r22ThrowCacheTime = 0;
    std::vector<Position> _r22ThrowTrajectory;
    bool _r22ThrowValid = false;
'''

DRAW=r'''
// LOSLOF_R22_THROW_PREVIEW_RECOVERY
// Read-only world preview; virtual position and stance actually affect
// native engine throw range and parabolic collision. Re-evaluate cache
// immediately if thrower, target, weapon, stance, floor or 300ms changes.
void Map::r22DrawThrowPreview(const Position& from,const Position& destination,
    const Tile* originTile,const Tile* targetTile)
{
    BattleUnit *actor=_save->getSelectedUnit();
    BattleAction *active=_save->getBattleGame()->getCurrentAction();
    if(!actor || !active || active->actor!=actor || !active->weapon ||
       !originTile || !targetTile) return;
    BattleAction action=*active;
    action.target=destination;
    const bool virtualKneeled=_r22Locked ? _r22Kneel : actor->isKneeled();
    const int stanceDelta=(virtualKneeled?actor->getKneelHeight():
        actor->getStandHeight())-actor->getHeight();
    Position origin=_save->getTileEngine()->getOriginVoxel(action,
        const_cast<Tile*>(originTile));
    origin.z+=stanceDelta;
    const Position goal=destination.toVoxel()+
        Position(8,8,1-targetTile->getTerrainLevel());

    unsigned long long key=1469598103934665603ULL;
    const int args[]={actor->getId(),from.x,from.y,from.z,
        destination.x,destination.y,destination.z,origin.x,origin.y,origin.z,
        int(virtualKneeled),active->weapon->getTotalWeight()};
    for(int x:args){key^=static_cast<unsigned>(x);key*=1099511628211ULL;}
    key^=reinterpret_cast<uintptr_t>(active->weapon);
    key*=1099511628211ULL;
    const Uint32 time=SDL_GetTicks();
    if(key!=_r22ThrowCacheKey || time-_r22ThrowCacheTime>300U)
    {
        _r22ThrowTrajectory.clear();
        _r22ThrowValid=false;
        double curve=0.0;
        int nativeCollision=V_EMPTY;
        // Modified ONLY for preview with 3 trailing arguments.
        // Default real-shot semantics stay identical in TileEngine.
        if(_save->getTileEngine()->validateThrow(action,origin,goal,
             _save->getDepth(),&curve,&nativeCollision,false,
             false,&from,virtualKneeled?1:0))
        {
            const int result=_save->getTileEngine()->calculateParabolaVoxel(
                origin,goal,true,&_r22ThrowTrajectory,actor,curve,
                Position(0,0,0),true);
            _r22ThrowValid=result!=V_OUTOFBOUNDS;
        }
        _r22ThrowCacheKey=key;
        _r22ThrowCacheTime=time;
    }
    std::set<int> once;
    const int width=_save->getMapSizeX(),length=_save->getMapSizeY();
    for(const Position& voxel:_r22ThrowTrajectory)
    {
        if(voxel.x<0 || voxel.y<0 || voxel.z<0) continue;
        int x=voxel.x/16,y=voxel.y/16,z=voxel.z/24;
        if(x>=width || y>=length || z>=_save->getMapSizeZ() ||
           z>_camera->getViewLevel()) continue;
        int code=(z*length+y)*width+x;
        if(!once.insert(code).second) continue;
        Tile *tile=_save->getTile(Position(x,y,z));
        if(!tile || !tile->isDiscovered(O_FLOOR)) continue;
        Position point;
        _camera->convertVoxelToScreen(Position(x*16+8,y*16+8,
            z*24-tile->getTerrainLevel()+1),&point);
        setPixel(point.x,point.y,_r22ThrowValid?73:32);
    }
    _r22StatsText.clear(); // Never display stale gun H/B/M while throwing.
    drawString(2,37,_r22ThrowValid ?
        "THROW ARC: REACHABLE (ACCURACY NOT SAMPLED)" :
        "THROW ARC: BLOCKED / OUT OF RANGE",160);
    r22DrawRemoteTargetHud(destination,goal);
}
'''

def patch(files):
    (maph,mapcpp,teh,tecpp,flyh,flycpp)=files
    if any(MARK in s for s in files):raise RuntimeError("Already patched")
    maph=one(maph,'    void r22DrawRemoteTargetHud(const Position &target, const Position &aim);',
        '    void r22DrawRemoteTargetHud(const Position &target, const Position &aim);\n'+HEADER)
    # Detect throw action before using the gun's straight-line calculation.
    mapcpp=one(mapcpp,
        '    BattleAction testAction;\n    testAction.actor = soldier;',
        '''    const BattleAction *selectedAction=_save->getBattleGame() ?
        _save->getBattleGame()->getCurrentAction() : nullptr;
    if(selectedAction && selectedAction->actor==soldier &&
       selectedAction->type==BA_THROW)
    {
        r22DrawThrowPreview(source,target,startTile,targetTile);
        return;
    }
    BattleAction testAction;
    testAction.actor = soldier;''')
    mapcpp=one(mapcpp,
        'void Map::r22DrawStats(const Position& origin, const Position& target,',
        DRAW+'\nvoid Map::r22DrawStats(const Position& origin, const Position& target,')

    # Extra optional preview-only parameters, keeping real actions unchanged.
    teh=one(teh,
        'int calculateParabolaVoxel(Position origin, Position target, bool storeTrajectory, std::vector<Position> *trajectory, BattleUnit *excludeUnit, double curvature, const Position delta);',
        '''int calculateParabolaVoxel(Position origin, Position target, bool storeTrajectory, std::vector<Position> *trajectory, BattleUnit *excludeUnit, double curvature, const Position delta, bool onlyVisible = false);''')
    tecpp=one(tecpp,
        'int TileEngine::calculateParabolaVoxel(Position origin, Position target, bool storeTrajectory, std::vector<Position> *trajectory, BattleUnit *excludeUnit, double curvature, const Position delta)',
        'int TileEngine::calculateParabolaVoxel(Position origin, Position target, bool storeTrajectory, std::vector<Position> *trajectory, BattleUnit *excludeUnit, double curvature, const Position delta, bool onlyVisible)')
    tecpp=one(tecpp,
        'calculateLineVoxel(lastPosition, nextPosition, storeTrajectory, storeTrajectory ? trajectory : nullptr, excludeUnit);',
        'calculateLineVoxel(lastPosition, nextPosition, storeTrajectory, storeTrajectory ? trajectory : nullptr, excludeUnit, nullptr, onlyVisible);')
    tecpp=one(tecpp,
        'calculateLineVoxel(lastPosition, nextPosition, false, trajectory, excludeUnit);',
        'calculateLineVoxel(lastPosition, nextPosition, false, trajectory, excludeUnit, nullptr, onlyVisible);')

    teh=one(teh,
        'bool validateThrow(BattleAction &action, Position originVoxel, Position targetVoxel, int depth, double *curve = 0, int *voxelType = 0, bool forced = false);',
        '''bool validateThrow(BattleAction &action, Position originVoxel, Position targetVoxel, int depth, double *curve = 0, int *voxelType = 0, bool forced = false, bool rememberObstacles = true, const Position *previewPosition = nullptr, int previewKneel = -1);''')
    tecpp=one(tecpp,
        'bool TileEngine::validateThrow(BattleAction &action, Position originVoxel, Position targetVoxel, int depth, double *curve, int *voxelType, bool forced)',
        'bool TileEngine::validateThrow(BattleAction &action, Position originVoxel, Position targetVoxel, int depth, double *curve, int *voxelType, bool forced, bool rememberObstacles, const Position *previewPosition, int previewKneel)')
    tecpp=one(tecpp,
        '''bool foundCurve = false;
	double curvature = 0.5;
	if (action.type == BA_THROW)''',
        '''bool foundCurve = false;
	double curvature = 0.5;
    // LOSLOF_R22_THROW_PREVIEW_RECOVERY: real actions keep actor's native stance.
    const bool kneel=previewKneel<0 ? action.actor->isKneeled() : previewKneel!=0;
	if (action.type == BA_THROW)''')
    # Only the validateThrow block contains 2 matching occurrence of actor knee.
    # Restrict replacements to the known function body.
    sig='bool TileEngine::validateThrow(BattleAction &action, Position originVoxel, Position targetVoxel, int depth, double *curve, int *voxelType, bool forced, bool rememberObstacles, const Position *previewPosition, int previewKneel)'
    start=tecpp.index(sig)
    end=tecpp.index('\n}\n',start)+2
    part=tecpp[start:end]
    if part.count('(action.actor->isKneeled()? 0.1 : 0.0)')!=2:
        raise RuntimeError("throw stance formula drifted in upstream")
    part=part.replace('(action.actor->isKneeled()? 0.1 : 0.0)',
                      '(kneel? 0.1 : 0.0)')
    part=one(part,
        'ProjectileFlyBState::validThrowRange(&action, originVoxel, targetTile, depth)',
        'ProjectileFlyBState::validThrowRange(&action, originVoxel, targetTile, depth, previewPosition)')
    part=one(part,
        'calculateParabolaVoxel(originVoxel, targetVoxel, true, &trajectory, action.actor, curvature, Position(0,0,0));',
        'calculateParabolaVoxel(originVoxel, targetVoxel, true, &trajectory, action.actor, curvature, Position(0,0,0), !rememberObstacles);')
    part=one(part,
        'if (test != V_OUTOFBOUNDS && action.actor->getFaction() == FACTION_PLAYER)',
        'if (rememberObstacles && test != V_OUTOFBOUNDS && action.actor->getFaction() == FACTION_PLAYER)')
    tecpp=tecpp[:start]+part+tecpp[end:]

    flyh=one(flyh,
        'static bool validThrowRange(BattleAction *action, Position origin, Tile *target, int depth);',
        'static bool validThrowRange(BattleAction *action, Position origin, Tile *target, int depth, const Position *previewPosition = nullptr);')
    flycpp=one(flycpp,
        'bool ProjectileFlyBState::validThrowRange(BattleAction *action, Position origin, Tile *target, int depth)',
        'bool ProjectileFlyBState::validThrowRange(BattleAction *action, Position origin, Tile *target, int depth, const Position *previewPosition)')
    flycpp=one(flycpp,
        '''int xdiff = action->target.x - action->actor->getPosition().x;
	int ydiff = action->target.y - action->actor->getPosition().y;''',
        '''const Position effective=previewPosition ? *previewPosition :
        action->actor->getPosition();
	int xdiff = action->target.x - effective.x;
	int ydiff = action->target.y - effective.y;''')
    flycpp=one(flycpp,
        'int compatibilityDistanceSq = action->actor->distance3dToPositionSq(action->target);',
        '''int compatibilityDistanceSq = action->actor->distance3dToPositionSq(action->target);
    if(previewPosition)
    {
        int dx=effective.x-action->target.x,dy=effective.y-action->target.y,
            dz=effective.z-action->target.z;
        if(action->actor->isBigUnit())
        {
            if(effective.x<action->target.x)++dx;
            if(effective.y<action->target.y)++dy;
        }
        compatibilityDistanceSq=dx*dx+dy*dy+dz*dz;
    }''')
    return (maph,mapcpp,teh,tecpp,flyh,flycpp)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("engine",type=Path)
    p.add_argument("--dry-run",action="store_true")
    args=p.parse_args()
    root=args.engine.resolve()
    names=["src/Battlescape/Map.h","src/Battlescape/Map.cpp",
           "src/Battlescape/TileEngine.h","src/Battlescape/TileEngine.cpp",
           "src/Battlescape/ProjectileFlyBState.h",
           "src/Battlescape/ProjectileFlyBState.cpp"]
    files=[root/p for p in names]
    version=root/"src/version.h"
    if not all(f.is_file() for f in files+[version]):raise SystemExit("Missing OXCE files")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     version.read_text(encoding="utf-8")):raise SystemExit("Wrong version")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=SHA:raise SystemExit("Wrong SHA "+sha)
    old=[f.read_text(encoding="utf-8") for f in files]
    new=patch(old)
    if not args.dry_run:
        for f,s in zip(files,new):f.write_text(s,encoding="utf-8")
    print(json.dumps({"stage":"THROW_PREVIEW_RECOVERY",
        "not_r21_certified":True,"dry_run":args.dry_run,
        "files":{n:hashlib.sha256(s.encode()).hexdigest()
                 for n,s in zip(names,new)}},indent=2))

if __name__=="__main__":
    main()
