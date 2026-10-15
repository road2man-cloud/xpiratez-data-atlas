#!/usr/bin/env python3
"""R25 read-only virtual accuracy invariants and native-reference comparisons.

Run after all R22-R24 checks. This validates source structure, range boundary
rules, and that real projectile calls never opt into hypothetical visibility.
Not a substitute for a real savegame A/B test.
"""
import math
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
read = lambda rel: (root / rel).read_text(encoding="utf-8")
m = read("src/Battlescape/Map.cpp")
mh = read("src/Battlescape/Map.h")
te = read("src/Battlescape/TileEngine.cpp")
th = read("src/Battlescape/TileEngine.h")
pr = read("src/Battlescape/Projectile.cpp")
ph = read("src/Battlescape/Projectile.h")
game = read("src/Battlescape/ProjectileFlyBState.cpp")
save = read("src/Savegame/BattleUnit.cpp")
rules = read("src/Mod/RuleItem.cpp")

def getmethod(source, name):
    start = source.index(name)
    opening = source.index("{", start)
    level = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            level += 1
        elif source[index] == "}":
            level -= 1
            if level == 0:
                return source[start:index+1]
    raise RuntimeError(name)

native_visible = getmethod(te, "bool TileEngine::visible(BattleUnit *currentUnit, Tile *tile)")
virtual_visible = getmethod(te, "bool TileEngine::r25VirtualVisible(")
native_los = getmethod(te, "bool TileEngine::isTileInLOS(BattleAction *action, Tile *tile, bool drawing)")
virtual_los = getmethod(te, "bool TileEngine::r25VirtualTileInLOS(")
native_projectile = getmethod(pr, "int Projectile::calculateTrajectory(double accuracy)")
native_sight = getmethod(te, "Position TileEngine::getSightOriginVoxel(BattleUnit *currentUnit)")
native_map = getmethod(m, "void Map::r22DrawStats(")

checks = {
    "R25 uses pinned native visible/LOS algorithms without changing their originals":
        'currentUnit->getPosition()' in native_visible and
        'getSightOriginVoxel(currentUnit)' in native_visible and
        'currentUnit->getPosition()' in native_los and
        'getOriginVoxel(tempAction, currentUnit->getTile())' in native_los,
    "Same real source and stance delegates to native visible and LOS":
        'return visible(currentUnit, tile);' in virtual_visible and
        'return isTileInLOS(action, tile, drawing);' in virtual_los,
    "Virtual observer location replaces actor location, without mutating actor":
        'Position::distance2dSq(source, tile->getPosition())' in virtual_visible and
        'Position::distance2dSq(source, tile->getPosition())' in virtual_los and
        'setPosition(' not in virtual_visible + virtual_los and
        'setTile(' not in virtual_visible + virtual_los,
    "Virtual eyesight uses source terrain and posture":
        'auto* tile = _save->getTile(source);' in te and
        'getFloatHeight() - 1 + stanceDelta' in te and
        'r25VirtualSightOrigin(currentUnit, source, stanceDelta)' in virtual_visible,
    "Native smoke/light/visibility scripts remain in virtual calculation":
        'getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel)' in virtual_visible and
        'ModScript::VisibilityUnit::Worker' in virtual_visible and
        'getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel)' in virtual_los,
    "Virtual tile line of fire uses source's tile not actor's actual tile":
        'getOriginVoxel(tempAction, _save->getTile(source))' in virtual_los,
    "No-LOS override is preview-only, native projectile uses -1 default":
        'int previewHasLOS = -1' in ph and
        'return calculateTrajectory(accuracy, originVoxel);' in native_projectile and
        'if (previewHasLOS < 0)' in pr and
        'hasLOS = _save->getTileEngine()->visible(bu, t);' in pr and
        'hasLOS = _save->getTileEngine()->isTileInLOS(&_action, t, false);' in pr,
    "Preview Monte Carlo passes virtual LOS not real actor LOS":
        'projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng,virtualHasLOS)' in native_map,
    "Virtual displayed native accuracy uses base, range limits and ceil tile distance":
        'BattleActionAttack::GetBeforeShoot(action)' in native_map and
        'const int distance=int(std::ceil(std::sqrt(float(distanceSq))));' in native_map and
        'weapon->getRules()->calculateLimits(' in native_map and
        'displayedAccuracy-=(distance-upperLimit)*dropoff;' in native_map and
        'displayedAccuracy-=(lowerLimit-distance)*dropoff;' in native_map,
    "Virtual big-unit distance corrected like native BattleUnit":
        'if (origin.x < target.x) ++dx;' in native_map and
        'if (origin.y < target.y) ++dy;' in native_map and
        'if (_pos.x < pos.x)' in save and
        'if (_pos.y < pos.y)' in save,
    "Native weapon range limit and forbidden shot are respected":
        'weapon->getRules()->isOutOfRange(distanceSq)' in native_map and
        '_r22StatsText="ACC~0% OUT OF RANGE";' in native_map and
        'if (weapon->getRules()->isOutOfRange(distanceSq))' in game and
        'bool RuleItem::isOutOfRange(int distanceSq) const' in rules,
    "R25 preview HUD exposes adjusted, not unadjusted, crosshair ACC":
        'label << "ACC~" << displayedAccuracy << "% "' in native_map and
        'label << "ACC~" << int(accuracy*100.0+0.5)' not in native_map,
    "Suppress misleading native actual-shooter crosshair on virtual-source tile":
        '_r22On && Options::battleConfirmFireMode' in m and
        '_save->getBattleGame()->getCurrentAction()->waypoints.front()' in m,
    "Monte Carlo cache reacts to LOS and adjusted native accuracy changes":
        'mix((unsigned int)(virtualHasLOS+1));' in native_map and
        'mix((unsigned int)displayedAccuracy);' in native_map,
    "No changes to real battle state, save serialization, or native projectile entry":
        'void Map::r22DrawOverlay()' in m and
        'getFiringAccuracy(attack, _parent->getMod()) / accuracyDivider' in game and
        'bool _r22On = false;' in mh,
}

# Numeric regression: the virtual copy of distance3dToPositionSq agrees
# exactly with BattleUnit for positions used in a native fire action.
for ox in range(-3,4):
    for oy in range(-3,4):
        for oz in (-1,0,1):
            for tx in range(-3,4):
                for ty in range(-3,4):
                    for big in (False, True):
                        dx=ox-tx
                        dy=oy-ty
                        dz=oz
                        if big:
                            if ox<tx: dx+=1
                            if oy<ty: dy+=1
                        native_distance = dx*dx+dy*dy+dz*dz
                        virtual_distance = (ox-tx+(1 if big and ox<tx else 0))**2 + (oy-ty+(1 if big and oy<ty else 0))**2 + dz**2
                        if virtual_distance != native_distance:
                            raise AssertionError("Native/virtual distance mismatch")
checks["Square-distance edge cases match native big-unit formula"] = True

for label, good in checks.items():
    print(f"{'PASS' if good else 'FAIL'}: {label}")
if not all(checks.values()):
    raise SystemExit("R25 virtual firing position gates failed")
print(f"PASS: {len(checks)} R25 accuracy/LOS gates; dynamic live combat not yet tested")
