#!/usr/bin/env python3
"""Stage 3: reconstruct R21 planned-position LOS hull and offscreen/terrain UI.

Target: OXCE 8.6.0 pinned 3e722e09b655ab67acfb59fc8585dc70b583826c.
Requires patch_r22_preview.py then patch_r22_stats_EXPERIMENTAL.py.
This reconstruction is NOT certified equivalent to the missing R21 binary.
"""
from pathlib import Path
import argparse
import json
import hashlib
import re
import subprocess

PIN="3e722e09b655ab67acfb59fc8585dc70b583826c"
TAG="LOSLOF_R22_RECOVERY_BETA_20261012"

def one(source, needle, replacement):
    n=source.count(needle)
    if n!=1:
        raise RuntimeError("Refuse ambiguous/absent anchor (%d): %r"%(n,needle[:130]))
    return source.replace(needle,replacement,1)

HEADER=r'''
    // LOSLOF_R22_RECOVERY_BETA_20261012: drawing-only fields.
    Position r22PlannedPosition(const BattleUnit *unit) const;
    void r22DrawVisibilityHull(const Position &source, const Position &eye, int level);
    void r22DrawRemoteTargetHud(const Position &target, const Position &aim);
    std::vector<unsigned char> _r22VisibleHull;
    unsigned long long _r22HullHash = 0;
    Uint32 _r22HullCheckedAt = 0;
    size_t _r22HullNextIndex = 0; // progressive scan: at most 64 candidate rays/frame
    bool _r22HullWorkPending = false; // ticker, not render, requests next incremental frame
    Uint32 _r22HullLastBatchTick = 0; // throttle ray work on animation redraws
'''

METHODS=r'''
// LOSLOF_R22_RECOVERY_BETA_20261012
// Read only the already-calculated path; do not calculate/change a player's path.
Position Map::r22PlannedPosition(const BattleUnit *unit) const
{
    const Position actual=unit->getPosition();
    Pathfinding *finder=_save ? _save->getPathfinding() : nullptr;
    if(!finder || !finder->isPathPreviewed()) return actual;
    const std::vector<int>& path=finder->getPath();
    if(path.empty()) return actual;
    const bool ctrl=finder->isModifierCtrlUsed(),alt=finder->isModifierAltUsed();
    const bool running=ctrl && unit->getArmor()->allowsRunning(unit->isSmallUnit())
        && (path.size()>1 || alt);
    const bool strafing=!running && ctrl &&
        unit->getArmor()->allowsStrafing(unit->isSmallUnit()) && path.size()==1;
    const bool sneaking=!running && alt &&
        unit->getArmor()->allowsSneaking(unit->isSmallUnit());
    const BattleActionMove move=strafing ? BAM_STRAFE :
        running ? BAM_RUN : sneaking ? BAM_SNEAK : BAM_NORMAL;
    Position pos=actual;
    for(auto it=path.rbegin();it!=path.rend();++it)
    {
        if(*it<0 || *it>=10) return actual;
        const PathfindingStep step=finder->getTUCost(pos,*it,unit,nullptr,move);
        if(step.cost.time>=Pathfinding::INVALID_MOVE_COST ||
           !_save->getTile(step.pos)) return actual;
        pos=step.pos;
    }
    return pos;
}

// Restore LOS outward perimeter while retaining R21's 1x1 INTERNAL pixel dots.
// Bound voxel traces to 64 candidates per 90ms batch. A completed
// hull is cached for three seconds; moving/stance/position changes
// reset it immediately. Render cached candidates without resampling.
void Map::r22DrawVisibilityHull(const Position &source,const Position &eye,int level)
{
    if(level<0 || level>=_save->getMapSizeZ()) return;
    const int width=_save->getMapSizeX(),length=_save->getMapSizeY();
    const int range=std::min(16,_save->getTileEngine()->getMaxViewDistance());
    if(range<=0 || width<1 || length<1) return;

    unsigned long long key=1469598103934665603ULL;
    const int factors[]={_save->getSelectedUnit()->getId(),source.x,source.y,
        source.z,eye.x,eye.y,eye.z,level,width,length,range};
    for(int x:factors)
    {
        key^=static_cast<unsigned>(x);
        key*=1099511628211ULL;
    }
    const int minX=std::max(0,source.x-range);
    const int maxX=std::min(width-1,source.x+range);
    const int minY=std::max(0,source.y-range);
    const int maxY=std::min(length-1,source.y+range);
    if(minX>maxX || minY>maxY) return;
    const int spanX=maxX-minX+1;
    const size_t scanTotal=size_t(spanX)*size_t(maxY-minY+1);
    const Uint32 tick=SDL_GetTicks();
    // Refresh terrain/door changes, but only after the preceding scan finishes.
    const bool restart =
        _r22VisibleHull.size()!=size_t(width*length) || key!=_r22HullHash ||
        (_r22HullNextIndex>=scanTotal && tick-_r22HullCheckedAt>3000U);
    if(restart)
    {
        _r22VisibleHull.assign(size_t(width*length),0);
        _r22HullNextIndex=0;
        _r22HullHash=key;
        _r22HullCheckedAt=tick;
        _r22HullLastBatchTick=0;
    }
    const bool wasPending=_r22HullNextIndex<scanTotal;
    if(restart || tick-_r22HullLastBatchTick>=90U)
    {
        _r22HullLastBatchTick=tick;
        unsigned processed=0;
        const int radius2=range*range;
        while(_r22HullNextIndex<scanTotal && processed<64U)
        {
            const size_t index=_r22HullNextIndex++;
            ++processed; // even out-of-range candidates consume budget
            const int x=minX+int(index%size_t(spanX));
            const int y=minY+int(index/size_t(spanX));
            const int dx=x-source.x,dy=y-source.y;
            if(dx*dx+dy*dy>radius2) continue;
            Tile *tile=_save->getTile(Position(x,y,level));
            if(!tile || !tile->isDiscovered(O_FLOOR)) continue;
            const Position goal(x*16+8,y*16+8,
                level*24-tile->getTerrainLevel()+10);
            std::vector<Position> path;
            const int voxelResult=_save->getTileEngine()->calculateLineVoxel(
                eye,goal,true,&path,_save->getSelectedUnit(),nullptr,true);
            if(voxelResult==V_EMPTY || (!path.empty() &&
                path.back().toTile()==tile->getPosition()))
                _r22VisibleHull[size_t(y*width+x)]=1;
        }
    }
    _r22HullWorkPending = _r22HullNextIndex < scanTotal;
    if(wasPending && !_r22HullWorkPending) _r22HullCheckedAt=tick;
    // Avoid forcing a complete terrain repaint inside the render loop.

    const auto visible=[&](int x,int y)->bool
    {
        return x>=0 && y>=0 && x<width && y<length &&
            _r22VisibleHull[size_t(y*width+x)]!=0;
    };
    // Painting is also restricted to the local vision bounding rectangle.
    for(int y=minY;y<=maxY;++y)
    for(int x=minX;x<=maxX;++x)
    {
        if(!visible(x,y)) continue;
        Tile *t=_save->getTile(Position(x,y,level));
        if(!t) continue;
        const int z=level*24-t->getTerrainLevel()+1;
        Position mid;
        _camera->convertVoxelToScreen(Position(x*16+8,y*16+8,z),&mid);
        setPixel(mid.x,mid.y,48); // one game pixel per visible tile
        const Position world[4]={
            Position(x*16,y*16,z),Position((x+1)*16,y*16,z),
            Position((x+1)*16,(y+1)*16,z),Position(x*16,(y+1)*16,z)};
        const bool edge[4]={
            !visible(x,y-1),!visible(x+1,y),!visible(x,y+1),!visible(x-1,y)};
        Position screen[4];
        for(int i=0;i<4;++i)
            _camera->convertVoxelToScreen(world[i],&screen[i]);
        for(int i=0;i<4;++i)
        {
            if(edge[i])drawLine(screen[i].x,screen[i].y,
                screen[(i+1)%4].x,screen[(i+1)%4].y,48);
        }
    }
}

void Map::r22DrawRemoteTargetHud(const Position &target,const Position &aim)
{
    Position screen;
    _camera->convertVoxelToScreen(aim,&screen);
    const int width=getWidth(),height=_visibleMapHeight;
    const int zDiff=target.z-_camera->getViewLevel();
    const bool outside=screen.x<5 || screen.x>width-8 ||
        screen.y<31 || screen.y>height-15;
    if(!outside && !zDiff) return;
    const int px=std::max(3,std::min(int(screen.x),std::max(3,width-136)));
    const int py=std::max(30,std::min(int(screen.y),std::max(30,height-24)));
    const char *arrow=screen.x<5?"<":screen.x>width-8?">":
        screen.y<31?"^":screen.y>height-15?"v":"*";
    std::ostringstream label;
    label<<arrow<<" Z"<<(zDiff>=0?"+":"")<<zDiff;
    if(!_r22StatsText.empty()) label<<" "<<_r22StatsText;
    std::string result=label.str();
    if(result.size()>60)result.resize(60);
    drawString(px,py,result.c_str(),160);
}
'''

def patch(header,cpp,version):
    if TAG in header or TAG in cpp:raise RuntimeError("Already applied")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise RuntimeError("Unsupported OXCE source version")
    header=one(header,
        '    void r22DrawStats(const Position& origin, const Position& target,',
        HEADER+'\n    void r22DrawStats(const Position& origin, const Position& target,')
    cpp=one(cpp,
        '    const Position source = _r22Locked ? cursor : soldier->getPosition();',
        '    const Position source = _r22Locked ? cursor : r22PlannedPosition(soldier);')
    cpp=one(cpp,
        '    BattleAction testAction;\n    testAction.actor = soldier;',
        '    r22DrawVisibilityHull(source,eye,viewZ);\n\n'
        '    BattleAction testAction;\n    testAction.actor = soldier;')
    cpp=one(cpp,
        '    if (_r22Locked && source.z <= viewZ)',
        '    if ((_r22Locked || (_save->getPathfinding() && _save->getPathfinding()->isPathPreviewed())) && source.z <= viewZ)')
    # Keep the independent blue 1-pixel LOF line after reducing LOS dots.
    cpp=one(cpp,
        '    r22DrawStats(source,target,goal,muzzle);',
        '''    if (!bullet.empty() && source.z<=viewZ)
    {
        Position a,b;
        _camera->convertVoxelToScreen(muzzle,&a);
        _camera->convertVoxelToScreen(bullet.back(),&b);
        drawLine(a.x,a.y,b.x,b.y,73);
    }
    // Never show hidden-target hit probabilities or unexplored geometry.
    if(targetTile->isDiscovered(O_FLOOR) &&
        (!targetTile->getUnit() || targetTile->getUnit()->getVisible()))
        r22DrawStats(source,target,goal,muzzle);
    else
        _r22StatsText.clear();
    r22DrawRemoteTargetHud(target,goal);''')
    # Red obstruction takes draw priority; a hit BEHIND the target is M, not B.
    cpp=one(cpp,
        '    if (collision != V_EMPTY && !bullet.empty())',
        '''    const double dx=goal.x-muzzle.x,dy=goal.y-muzzle.y,dz=goal.z-muzzle.z;
    const double intended=dx*dx+dy*dy+dz*dz;
    const Position impact=bullet.empty()?goal:bullet.back();
    const double traveled=(impact.x-muzzle.x)*dx+
        (impact.y-muzzle.y)*dy+(impact.z-muzzle.z)*dz;
    if(collision!=V_EMPTY && !bullet.empty() && intended>0 &&
       traveled<intended &&
       _save->getTile(impact.toTile()) &&
       _save->getTile(impact.toTile())->isDiscovered(O_FLOOR))''')
    # Detect MCD terrain explosives at the red-impact point.
    cpp=one(cpp,
        '        drawLine(xy.x-2,xy.y+2,xy.x+2,xy.y-2,32);',
        '''        drawLine(xy.x-2,xy.y+2,xy.x+2,xy.y-2,32);
        Tile *impactTile=_save->getTile(impact.toTile());
        if(impactTile)
        {
            bool explosive=false;
            for(int part=0;part<=3;++part)
            {
                MapData *piece=impactTile->getMapData(static_cast<TilePart>(part));
                if(piece && piece->getExplosive()>0)explosive=true;
            }
            if(explosive)drawString(xy.x+3,xy.y-4,"MCD!",32);
        }''')
    cpp=one(cpp,
        'void Map::r22DrawStats(const Position& origin, const Position& target,',
        METHODS+'\nvoid Map::r22DrawStats(const Position& origin, const Position& target,')
    cpp=one(cpp,
        'if (!t) continue;\n        Position p;\n        _camera->convertVoxelToScreen(Position(tx*16+8',
        'if (!t || !t->isDiscovered(O_FLOOR)) continue;\n        Position p;\n        _camera->convertVoxelToScreen(Position(tx*16+8')
    return header,cpp

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("engine",type=Path)
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    root=args.engine.resolve()
    files=[root/"src/Battlescape/Map.h",root/"src/Battlescape/Map.cpp"]
    version=root/"src/version.h"
    if not all(x.is_file() for x in files+[version]):
        raise SystemExit("OXCE source files missing")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN:raise SystemExit("Source SHA mismatch: "+sha)
    orig=[x.read_text(encoding="utf-8") for x in files]
    updated=patch(*orig,version.read_text(encoding="utf-8"))
    if not args.dry_run:
        for f,s in zip(files,updated):f.write_text(s,encoding="utf-8")
    print(json.dumps({"engine":PIN,"status":"RECOVERY_BETA_NOT_R21_EQUIVALENT",
        "dry":args.dry_run,
        "files":[{"path":str(f.relative_to(root)),
                  "sha256":hashlib.sha256(s.encode()).hexdigest()}
                 for f,s in zip(files,updated)]},indent=2))

if __name__=="__main__":
    main()
