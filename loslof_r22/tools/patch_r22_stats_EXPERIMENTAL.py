#!/usr/bin/env python3
"""EXPERIMENTAL real-OXCE projectile sampler for pinned 8.6.0 preview.
Not R21 parity. Monte Carlo assumptions & performance unverified; separate branch.
"""
import argparse
from pathlib import Path
import re, subprocess

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
TAG = "LOSLOF_R22_STATISTICS_EXPERIMENTAL"

def exactly(source, before, after):
    n = source.count(before)
    if n != 1:
        raise RuntimeError("Need exactly one anchor, found %d: %s" % (n, before[:110]))
    return source.replace(before, after, 1)

FIELDS = r'''
    // LOSLOF_R22_STATISTICS_EXPERIMENTAL
    void r22DrawStats(const Position& origin, const Position& target,
        const Position& aim, const Position& muzzle);
    unsigned long long _r22StatsKey = 0;
    unsigned long _r22StatsUpdated = 0;
    std::string _r22StatsText;
    std::map<int, unsigned> _r22TileRisks;
    unsigned _r22SampleCount = 0;
    // Separate 1,024-trial H/B/M counters and 384-trial risk cache.
    unsigned _r22HitSamples = 0;
    unsigned _r22BlockedSamples = 0;
    unsigned _r22MissSamples = 0;
    unsigned _r22RiskSamples = 0;
'''

CODE = r'''
// LOSLOF_R22_STATISTICS_EXPERIMENTAL:
// EXPERIMENTAL - uses actual OXCE Projectile trace and accuracy, but hypothetical
// actor position/stance, pellet mode and world side effects aren't fully verified.
// Snapshot the global RNG and restore it before returning (including exceptions).
void Map::r22DrawStats(const Position& origin, const Position& target,
                      const Position& aim, const Position& muzzle)
{
    // Never display a previous weapon's probabilities after deselection or
    // switching to an action that the ballistic sampler does not support.
    auto clearInvalidPreview = [this]() {
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22StatsKey = 0;
        _r22SampleCount = 0;
        _r22HitSamples = 0;
        _r22BlockedSamples = 0;
        _r22MissSamples = 0;
        _r22RiskSamples = 0;
    };
    BattleUnit *shooter = _save->getSelectedUnit();
    if (!shooter || !_save->getBattleGame()) { clearInvalidPreview(); return; }
    BattleAction *current = _save->getBattleGame()->getCurrentAction();
    if (!current || current->actor != shooter || !current->weapon) {
        clearInvalidPreview(); return;
    }
    if (current->type != BA_SNAPSHOT && current->type != BA_AIMEDSHOT &&
        current->type != BA_AUTOSHOT) { clearInvalidPreview(); return; }

    BattleItem *weapon = current->weapon;
    if (weapon->getArcingShot(current->type)) { clearInvalidPreview(); return; }
    BattleItem *ammo = weapon->getAmmoForAction(current->type,nullptr,nullptr);
    if (!ammo || !ammo->getRules()) { clearInvalidPreview(); return; }
    const RuleItemAction *conf = weapon->getActionConf(current->type);
    const int shots = conf ? conf->shots : 1;
    const bool shotgun = ammo->getRules()->getShotgunPellets() > 0 &&
                         ammo->getRules()->getDamageType()->isDirect();
    const int pellets = shotgun ? ammo->getRules()->getShotgunPellets() : 1;
    // Unsupported action sizes don't show invented probabilities.
    // Never exceed 256 engine bullet traces in a render frame, even in
    // unusual ammunition containing many pellets and huge bursts.
    if (shots < 1 || shots > 16 || pellets < 1 || pellets > 20 ||
        shots*pellets > 256) {
        clearInvalidPreview(); return;
    }
    // Resolve actual occupier, not merely the owner/root tile. Multi-tile
    // soldiers and units intersecting the floor above use native overlap rules.
    Tile *targetTile=_save->getTile(target);
    BattleUnit *targetUnit=targetTile ?
        targetTile->getOverlappingUnit(_save) : nullptr;
    if (targetUnit && !targetUnit->getVisible()) targetUnit=nullptr;

    // Compute current accuracy BEFORE the cache key. Skills, injuries,
    // buffs, ammo and selected action can change without moving the cursor.
    BattleAction action=*current;
    action.actor=shooter;
    action.target=target;
    BattleActionAttack attack=BattleActionAttack::GetAferShoot(action,ammo);
    double accuracy=BattleUnit::getFiringAccuracy(attack,_game->getMod())/100.0;
    if (_r22Locked && _r22Kneel!=shooter->isKneeled())
    {
        const double kneel=weapon->getRules()->getKneelBonus(_game->getMod())/100.0;
        if (kneel > 0.0) accuracy*= _r22Kneel ? kneel : 1.0/kneel;
    }

    unsigned long long key=1469598103934665603ULL;
    auto mix=[&](unsigned long long value) {
        key^=value; key*=1099511628211ULL;
    };
    for (int x : std::initializer_list<int>{shooter->getId(), origin.x,origin.y,origin.z,
                  target.x,target.y,target.z,aim.x,aim.y,aim.z,
                  muzzle.x,muzzle.y,muzzle.z,(int)current->type,
                  (int)_r22Kneel,(int)shooter->isKneeled(),
                  (int)ammo->getAmmoQuantity(),shots,pellets})
        mix((unsigned int)x);
    mix((unsigned long long)(uintptr_t)weapon);
    mix((unsigned long long)(uintptr_t)weapon->getRules());
    mix((unsigned long long)(uintptr_t)ammo);
    mix((unsigned long long)(uintptr_t)ammo->getRules());
    mix((unsigned long long)(uintptr_t)targetUnit);
    mix((unsigned long long)(uintptr_t)targetTile);
    mix((unsigned long long)(static_cast<long long>(accuracy*1000000.0)));
    // A newly opened door, destroyed wall or newly blocking target must
    // invalidate Monte Carlo results without waiting for cache expiration.
    // Native voxel obstruction probing consumes no RNG and respects fog.
    std::vector<Position> obstructionPoint;
    const int directCollision=_save->getTileEngine()->calculateLineVoxel(
        muzzle,aim,false,&obstructionPoint,shooter,nullptr,true);
    mix(static_cast<unsigned>(directCollision));
    if (!obstructionPoint.empty())
    {
        const Position& p=obstructionPoint.back();
        mix(static_cast<unsigned>(p.x));
        mix(static_cast<unsigned>(p.y));
        mix(static_cast<unsigned>(p.z));
    }
    // Probabilities on nearby off-ray terrain still fall back to expiry.
    // Conservatively expire on timer: terrain changes may leave other stale state.
    unsigned long now=SDL_GetTicks();
    // Replay-free batched Monte Carlo: never perform more than 256
    // projectile traces in one frame. 1,024 trials are accumulated across
    // frames, while risk tiles stop at 384 trials (R19 performance budget).
    const bool newScenario = (key != _r22StatsKey);
    const bool staleFinished = (_r22SampleCount >= 1024U &&
        now-_r22StatsUpdated > 4500UL);
    if (newScenario || staleFinished)
    {
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22SampleCount=0;
        _r22HitSamples=0;
        _r22BlockedSamples=0;
        _r22MissSamples=0;
        _r22RiskSamples=0;
        _r22StatsKey=key;
        _r22StatsUpdated=now;
    }
    if (_r22SampleCount < 1024U)
    {
        const unsigned projectilesPerTrial=static_cast<unsigned>(shots*pellets);
        const unsigned frameBudget=std::max(1U,
            std::min(64U,256U/projectilesPerTrial));
        const unsigned samples=std::min(1024U-_r22SampleCount,frameBudget);
        // Each batch has its own deterministic seed; never reseed every
        // frame to the same prefix of the old samples.
        const unsigned long long sampleSeed=key^
            (0x9e3779b97f4a7c15ULL*(_r22SampleCount+1ULL));
        struct KeepRng {
            RNG::RandomState previous;
            explicit KeepRng(unsigned long long seed)
                : previous(RNG::globalRandomState()) {
                RNG::globalRandomState()=RNG::RandomState(seed);
            }
            ~KeepRng() { RNG::globalRandomState()=previous; }
        } keep(sampleSeed ? sampleSeed : 1ULL);

        const int width=_save->getMapSizeX();
        const int length=_save->getMapSizeY();
        const int height=_save->getMapSizeZ();
        unsigned hit=0, blocked=0, missed=0;
        auto shot=[&](const Position& aimed, double acc, int shotIndex,
                      bool& isHit, bool& isBlocked,
                      std::set<int>& risk, Position& impact)
        {
            BattleAction fired=action;
            fired.autoShotCounter=shotIndex;
            Projectile projectile(_game->getMod(), _save, fired, origin, aimed, ammo);
            const int status=projectile.calculateTrajectory(acc,muzzle);
            const std::vector<Position>& path=projectile.getTrajectoryForPreview();
            if (path.empty())
            {
                // A native trajectory rejection means target cannot be fired at.
                // Do not treat it as a successful shot.
                isBlocked = true;
                return;
            }
            impact=path.back();
            for (const Position& voxel : path)
            {
                if (voxel.x<0 || voxel.y<0 || voxel.z<0) continue;
                int tx=voxel.x/16,ty=voxel.y/16,tz=voxel.z/24;
                if (tx>=width || ty>=length || tz>=height) continue;
                risk.insert((tz*length+ty)*width+tx);
            }
            const Position collisionTile=impact.toTile();
            Tile *t=_save->getTile(collisionTile);
            BattleUnit *victim=t ? t->getOverlappingUnit(_save) : nullptr;
            if (victim && !victim->getVisible()) victim=nullptr;
            if (status==V_UNIT && victim && targetUnit && victim==targetUnit)
            {
                isHit=true; return;
            }
            if (!targetUnit && t && collisionTile==target &&
                status!=V_EMPTY && status!=V_OUTOFBOUNDS && status!=V_UNIT)
            {
                isHit=true; return;
            }
            if (status==V_EMPTY || status==V_OUTOFBOUNDS) return;
            const double dx=aim.x-muzzle.x,dy=aim.y-muzzle.y,dz=aim.z-muzzle.z;
            const double den=dx*dx+dy*dy+dz*dz;
            if (den>0)
            {
                const double proj=((impact.x-muzzle.x)*dx+
                     (impact.y-muzzle.y)*dy+(impact.z-muzzle.z)*dz)/den;
                if (proj<1.0) isBlocked=true;
            }
        };

        for (unsigned sample=0; sample<samples; ++sample)
        {
            bool anyHit=false, allBlocked=true;
            std::set<int> tileRisk;
            for (int shotIndex=1; shotIndex<=shots; ++shotIndex)
            {
                Position firstImpact=aim;
                for (int pellet=0; pellet<pellets; ++pellet)
                {
                    Position aimed=aim;
                    double pelletAcc=accuracy;
                    if (pellet && shotgun)
                    {
                        const int spread=ammo->getRules()->getShotgunSpread();
                        if (ammo->getRules()->getShotgunBehaviorType()==1)
                        {
                            if (firstImpact != muzzle) aimed=firstImpact;
                            pelletAcc=std::max(0.0,(1.0-spread/100.0)*
                                weapon->getRules()->getShotgunChoke()/100.0);
                        }
                        else pelletAcc=std::max(0.0,
                            accuracy-pellet*5.0*spread/100.0);
                    }
                    bool oneHit=false, oneBlocked=false;
                    Position collision=aim;
                    shot(aimed,pelletAcc,shotIndex,oneHit,oneBlocked,tileRisk,collision);
                    if (pellet==0) firstImpact=collision;
                    if (oneHit) anyHit=true;
                    if (!oneBlocked && !oneHit) allBlocked=false;
                }
            }
            if (anyHit) ++hit;
            else if (allBlocked) ++blocked;
            else ++missed;
            if (_r22RiskSamples < 384U)
            {
                for (int t : tileRisk) ++_r22TileRisks[t];
                ++_r22RiskSamples;
            }
        }
        _r22HitSamples+=hit;
        _r22BlockedSamples+=blocked;
        _r22MissSamples+=missed;
        _r22SampleCount+=samples;
        std::ostringstream label;
        label << "APPROX ACC " << int(accuracy*100.0+0.5) << "% "
              << "H " << _r22HitSamples*100U/_r22SampleCount
              << "% B " << _r22BlockedSamples*100U/_r22SampleCount
              << "% M " << _r22MissSamples*100U/_r22SampleCount
              << "% n=" << _r22SampleCount << "/1024";
        _r22StatsText=label.str();
        if (_r22SampleCount < 1024U) _redraw=true;
        else _r22StatsUpdated=now;
    }

    // Show at most one outline per tile, no opaque filled surfaces.
    int width=_save->getMapSizeX(), length=_save->getMapSizeY();
    for (const auto& entry : _r22TileRisks)
    {
        if (!_r22RiskSamples || entry.second*100U<_r22RiskSamples)
            continue; // 1% risk threshold, independent 384-trial budget
        int tx=entry.first%width,ty=(entry.first/width)%length;
        int tz=entry.first/(width*length);
        if (tz>_camera->getViewLevel()) continue;
        Tile *t=_save->getTile(Position(tx,ty,tz));
        if (!t) continue;
        Position p;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,
            tz*24-t->getTerrainLevel()+1),&p);
        const unsigned riskPct=entry.second*100U/_r22RiskSamples;
        const int color=riskPct>=40U ? 32 : riskPct>=10U ? 160 : 73;
        // Open, one-pixel diamond perimeter; R19-style graduated hatching
        // without opaque fill or oversized LOS dots.
        drawLine(p.x-4,p.y,p.x,p.y-2,color);
        drawLine(p.x,p.y-2,p.x+4,p.y,color);
        drawLine(p.x+4,p.y,p.x,p.y+2,color);
        drawLine(p.x,p.y+2,p.x-4,p.y,color);
        if (riskPct>=25U)
        {
            drawLine(p.x-2,p.y-1,p.x,p.y+1,color);
            drawLine(p.x,p.y-1,p.x+2,p.y+1,color);
        }
        if (riskPct>=50U)
        {
            drawLine(p.x-4,p.y+1,p.x,p.y-1,color);
            drawLine(p.x,p.y-1,p.x+4,p.y+1,color);
        }
    }
    if (!_r22StatsText.empty())
        drawString(2,23,_r22StatsText.c_str(),160);
}
'''

def patch(header,cpp,projectile):
    if any(TAG in s for s in (header,cpp,projectile)):
        raise RuntimeError("already applied")
    header=exactly(header,'    void r22DrawOverlay();',
                   '    void r22DrawOverlay();\n'+FIELDS)
    header=exactly(header,'#include <vector>',
                   '#include <vector>\n#include <map>\n#include <string>')
    projectile=exactly(projectile,'int calculateTrajectory(double accuracy);',
       'int calculateTrajectory(double accuracy);\n'
       '\tconst std::vector<Position>& getTrajectoryForPreview() const { return _trajectory; }')
    cpp=exactly(cpp,'#include "Map.h"',
       '#include "Map.h"\n#include "../Engine/RNG.h"\n#include <map>\n#include <sstream>\n#include <stdint.h>')
    cpp=exactly(cpp,'    if (collision != V_EMPTY && !bullet.empty())',
                   '    r22DrawStats(source,target,goal,muzzle);\n'
                   '    if (collision != V_EMPTY && !bullet.empty())')
    cpp=exactly(cpp,'void Map::refreshAIProgress(int progress)',
                   CODE+'\nvoid Map::refreshAIProgress(int progress)')
    return header,cpp,projectile

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("root",type=Path)
    ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args()
    root=args.root
    files=[root/"src/Battlescape/Map.h",root/"src/Battlescape/Map.cpp",
           root/"src/Battlescape/Projectile.h"]
    version=root/"src/version.h"
    if not all(p.is_file() for p in files+[version]):
        raise SystemExit("Missing expected OXCE files")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     version.read_text(encoding="utf-8")):
        raise SystemExit("Wrong OXCE 8.6 version")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],
                                    text=True).strip()
        if sha!=PIN: raise SystemExit("Wrong pinned engine SHA: "+sha)
    sources=[p.read_text(encoding="utf-8") for p in files]
    modified=patch(*sources)
    if not args.dry_run:
        for p,contents in zip(files,modified):
            p.write_text(contents,encoding="utf-8")
    print("Experimental OXCE Projectile sampler patch", "dry-run" if args.dry_run else "applied")

if __name__ == "__main__":
    main()
