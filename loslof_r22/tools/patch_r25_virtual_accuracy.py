#!/usr/bin/env python3
"""R25: virtual firing-position ACC/range/LOS parity with native OXCE rules.

Layer this strictly *after* original R22, R23, and R24 patches. The only
runtime additions are preview-only read-only TileEngine queries and a
preview-only optional visibility override in Projectile. Native firing and
savegame behavior must remain untouched.
"""
from pathlib import Path
import argparse, hashlib, json, re, subprocess

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
FILES = (
    "src/Battlescape/Map.cpp",
    "src/Battlescape/TileEngine.h",
    "src/Battlescape/TileEngine.cpp",
    "src/Battlescape/Projectile.h",
    "src/Battlescape/Projectile.cpp",
)

def once(s, old, new, why):
    count = s.count(old)
    if count != 1:
        raise RuntimeError(f"{why}: expected exactly one R24 anchor, got {count}: {old[:115]!r}")
    return s.replace(old, new, 1)


def clone_method(source, signature):
    start = source.index(signature)
    opening = source.index("{", start)
    level = 0
    for offset in range(opening, len(source)):
        if source[offset] == "{":
            level += 1
        elif source[offset] == "}":
            level -= 1
            if not level:
                return source[start:offset+1]
    raise RuntimeError(f"Could not parse method {signature}")


def patch(mapcpp, tileh, tilecpp, projh, projcpp):
    # Reuse *the same native engine methods* for LOS from a virtual source,
    # replacing only the SOURCE tile/eye. Read-only clones avoid changing
    # the position or occupied tile of the actual player unit.
    sight = clone_method(tilecpp, "Position TileEngine::getSightOriginVoxel(BattleUnit *currentUnit)")
    sight = once(sight,
        "Position TileEngine::getSightOriginVoxel(BattleUnit *currentUnit)",
        "Position TileEngine::r25VirtualSightOrigin(BattleUnit *currentUnit, const Position& source, int stanceDelta)",
        "virtual sight signature")
    sight = once(sight,
        "const Position pos = currentUnit->getPosition();\n\tauto* tile = currentUnit->getTile();",
        "const Position pos = source;\n\tauto* tile = _save->getTile(source);\n"
        "\tif (!tile) return getSightOriginVoxel(currentUnit);",
        "virtual sight source")
    sight = once(sight,
        "originVoxel.z += currentUnit->getHeight() + currentUnit->getFloatHeight() - 1;",
        "originVoxel.z += currentUnit->getHeight() + currentUnit->getFloatHeight() - 1 + stanceDelta;",
        "virtual sight stance")

    visible = clone_method(tilecpp, "bool TileEngine::visible(BattleUnit *currentUnit, Tile *tile)")
    visible = once(visible,
        "bool TileEngine::visible(BattleUnit *currentUnit, Tile *tile)",
        "bool TileEngine::r25VirtualVisible(BattleUnit *currentUnit, Tile *tile, const Position& source, int stanceDelta)",
        "virtual visible signature")
    visible = visible.replace("currentUnit->getPosition()", "source")
    visible = once(visible,
        "Position originVoxel = getSightOriginVoxel(currentUnit);",
        "Position originVoxel = r25VirtualSightOrigin(currentUnit, source, stanceDelta);",
        "virtual visible sight")
    visible = once(visible, "{\n\t// if there is no tile",
        "{\n\t// Same position and posture must delegate to unmodified native OXCE.\n"
        "\tif (source == currentUnit->getPosition() && stanceDelta == 0)\n"
        "\t\treturn visible(currentUnit, tile);\n"
        "\tif (!_save->getTile(source)) return false;\n"
        "\t// if there is no tile", "native visible delegation")

    tilelos = clone_method(tilecpp, "bool TileEngine::isTileInLOS(BattleAction *action, Tile *tile, bool drawing)")
    tilelos = once(tilelos,
        "bool TileEngine::isTileInLOS(BattleAction *action, Tile *tile, bool drawing)",
        "bool TileEngine::r25VirtualTileInLOS(BattleAction *action, Tile *tile, bool drawing, const Position& source, int stanceDelta)",
        "virtual tile LOS signature")
    tilelos = tilelos.replace("currentUnit->getPosition()", "source")
    tilelos = once(tilelos,
        "getOriginVoxel(tempAction, currentUnit->getTile())",
        "getOriginVoxel(tempAction, _save->getTile(source))", "virtual tile muzzle")
    tilelos = once(tilelos,
        "originVoxel = getSightOriginVoxel(currentUnit);",
        "originVoxel = r25VirtualSightOrigin(currentUnit, source, stanceDelta);",
        "virtual tile sight")
    tilelos = once(tilelos,
        "{\n\t// if there is no tile",
        "{\n\tif (source == action->actor->getPosition() && stanceDelta == 0)\n"
        "\t\treturn isTileInLOS(action, tile, drawing);\n"
        "\tif (!_save->getTile(source)) return false;\n"
        "\t// if there is no tile", "native tile LOS delegation")

    tileh = once(tileh,
        "\tbool isTileInLOS(BattleAction *action, Tile *tile, bool drawing);",
        "\tbool isTileInLOS(BattleAction *action, Tile *tile, bool drawing);\n"
        "\t// R25 virtual-origin preview; no BattleUnit position/tile mutation.\n"
        "\tPosition r25VirtualSightOrigin(BattleUnit *currentUnit, const Position& source, int stanceDelta);\n"
        "\tbool r25VirtualVisible(BattleUnit *currentUnit, Tile *tile, const Position& source, int stanceDelta);\n"
        "\tbool r25VirtualTileInLOS(BattleAction *action, Tile *tile, bool drawing, const Position& source, int stanceDelta);",
        "virtual LOS declarations")
    marker = "/**\n * Checks for how exposed unit is for another unit."
    tilecpp = once(tilecpp, marker,
        "// R25 read-only virtual LOS: lifted from the same pinned native\n"
        "// OXCE visibility/LOS code. Native functions above are not modified.\n"
        + sight + "\n\n" + visible + "\n\n" + tilelos + "\n\n" + marker,
        "insert preview LOS methods")

    # The additional argument defaults to -1 for all native game uses. The
    # virtual ray uses 0 or 1, to keep no-LOS spread tied to SOURCE not actor.
    projh = once(projh,
        "bool extendLine, RNG::RandomState *previewRng = nullptr);",
        "bool extendLine, RNG::RandomState *previewRng = nullptr, int previewHasLOS = -1);",
        "Projectile::applyAccuracy declaration")
    projh = once(projh,
        "bool onlyVisible = false, RNG::RandomState *previewRng = nullptr);",
        "bool onlyVisible = false, RNG::RandomState *previewRng = nullptr, int previewHasLOS = -1);",
        "Projectile::calculateTrajectory declaration")
    projcpp = once(projcpp,
        "bool excludeUnit, bool onlyVisible, RNG::RandomState *previewRng)",
        "bool excludeUnit, bool onlyVisible, RNG::RandomState *previewRng, int previewHasLOS)",
        "Projectile::calculateTrajectory signature")
    projcpp = once(projcpp,
        "applyAccuracy(originVoxel, &_targetVoxel, accuracy, false, extendLine, previewRng);",
        "applyAccuracy(originVoxel, &_targetVoxel, accuracy, false, extendLine, previewRng, previewHasLOS);",
        "Projectile::calculateTrajectory forwarding")
    projcpp = once(projcpp,
        "bool keepRange, bool extendLine, RNG::RandomState *previewRng)",
        "bool keepRange, bool extendLine, RNG::RandomState *previewRng, int previewHasLOS)",
        "Projectile::applyAccuracy signature")
    projcpp = once(projcpp,
        "\t\t\tbool hasLOS = false;\n\t\t\tBattleUnit *bu = _action.actor;",
        "\t\t\t// Preview only: -1 uses unchanged native actual-shooter LOS.\n"
        "\t\t\tbool hasLOS = previewHasLOS > 0;\n"
        "\t\t\tBattleUnit *bu = _action.actor;",
        "read-only preview LOS override")
    projcpp = once(projcpp,
        "\t\t\tif (targetUnit)\n\t\t\t{\n\t\t\t\thasLOS = _save->getTileEngine()->visible(bu, t);\n\t\t\t}\n\t\t\telse\n\t\t\t{\n\t\t\t\thasLOS = _save->getTileEngine()->isTileInLOS(&_action, t, false);\n\t\t\t}",
        "\t\t\tif (previewHasLOS < 0)\n\t\t\t{\n"
        "\t\t\t\tif (targetUnit)\n\t\t\t\t{\n"
        "\t\t\t\t\thasLOS = _save->getTileEngine()->visible(bu, t);\n"
        "\t\t\t\t}\n\t\t\t\telse\n\t\t\t\t{\n"
        "\t\t\t\t\thasLOS = _save->getTileEngine()->isTileInLOS(&_action, t, false);\n"
        "\t\t\t\t}\n\t\t\t}",
        "native LOS unchanged for real shots")

    # Native Map::drawTerrain accuracy is evaluated from actual actor tile.
    # In virtual-source mode it is a different quantity: do not show it on
    # the virtual SOURCE cursor alongside the simulated target statistic.
    nativeCrosshair = (
        "if (_cursorType >= CT_AIM && _showInfoOnCursor && "
        "(_cursorType != CT_THROW || !Options::oxceDisableInfoOnThrowCursor))"
    )
    crosshairGuard = (
        "if (_cursorType >= CT_AIM && _showInfoOnCursor && "
        "(_cursorType != CT_THROW || !Options::oxceDisableInfoOnThrowCursor) &&\n"
        "\t\t\t\t\t\t\t\t!(_r22On && Options::battleConfirmFireMode &&\n"
        "\t\t\t\t\t\t\t\t  _save->getBattleGame() &&\n"
        "\t\t\t\t\t\t\t\t  _save->getBattleGame()->getCurrentAction() &&\n"
        "\t\t\t\t\t\t\t\t  _save->getBattleGame()->getCurrentAction()->targeting &&\n"
        "\t\t\t\t\t\t\t\t  !_save->getBattleGame()->getCurrentAction()->waypoints.empty() &&\n"
        "\t\t\t\t\t\t\t\t  Position(itX,itY,itZ) !=\n"
        "\t\t\t\t\t\t\t\t    _save->getBattleGame()->getCurrentAction()->waypoints.front()))"
    )
    mapcpp = once(mapcpp, nativeCrosshair, crosshairGuard,
        "hide actual-origin crosshair info on virtual-source cursor")

    mapcpp = once(mapcpp,
        "    double accuracy=BattleUnit::getFiringAccuracy(attack,_game->getMod())/100.0;\n"
        "    if (_r22StanceOverride && _r22Kneel!=shooter->isKneeled())\n"
        "    {\n"
        "        const double kneel=weapon->getRules()->getKneelBonus(_game->getMod())/100.0;\n"
        "        if (kneel > 0.0) accuracy*= _r22Kneel ? kneel : 1.0/kneel;\n"
        "    }",
        "    double accuracy=BattleUnit::getFiringAccuracy(attack,_game->getMod())/100.0;\n"
        "    const bool virtualKneelChange = _r22StanceOverride &&\n"
        "        _r22Kneel != shooter->isKneeled();\n"
        "    const double kneelFactor = weapon->getRules()->getKneelBonus(_game->getMod())/100.0;\n"
        "    if (virtualKneelChange && kneelFactor > 0.0)\n"
        "        accuracy *= _r22Kneel ? kneelFactor : 1.0 / kneelFactor;\n"
        "    const int stanceDelta = virtualKneelChange ?\n"
        "        ((_r22Kneel ? shooter->getKneelHeight() : shooter->getStandHeight())\n"
        "        - shooter->getHeight()) : 0;\n"
        "    // Resolve no-LOS from the exact firing SOURCE. Native firing is\n"
        "    // unchanged; TileEngine copies the pinned OXCE rules read-only.\n"
        "    const int noLosPenalty = weapon->getRules()->getNoLOSAccuracyPenalty(_game->getMod());\n"
        "    int virtualHasLOS = -1;\n"
        "    if (noLosPenalty != -1)\n"
        "    {\n"
        "        Tile *aimedTile = _save->getTile(aim.toTile());\n"
        "        if (aimedTile)\n"
        "        {\n"
        "            bool visible = aimedTile->getUnit() ?\n"
        "                _save->getTileEngine()->r25VirtualVisible(shooter,aimedTile,origin,stanceDelta) :\n"
        "                _save->getTileEngine()->r25VirtualTileInLOS(&action,aimedTile,false,origin,stanceDelta);\n"
        "            virtualHasLOS = visible ? 1 : 0;\n"
        "        }\n"
        "    }\n"
        "    // Native crosshair uses tile-centre (ceil) distance, not the\n"
        "    // voxel distance used by the trajectory's fractional dropoff.\n"
        "    int dx=origin.x-target.x,dy=origin.y-target.y,dz=origin.z-target.z;\n"
        "    if (shooter->isBigUnit())\n"
        "    {\n"
        "        if (origin.x < target.x) ++dx;\n"
        "        if (origin.y < target.y) ++dy;\n"
        "    }\n"
        "    const int distanceSq=dx*dx+dy*dy+dz*dz;\n"
        "    const int distance=int(std::ceil(std::sqrt(float(distanceSq))));\n"
        "    int upperLimit=0, lowerLimit=0;\n"
        "    const int dropoff=weapon->getRules()->calculateLimits(\n"
        "        upperLimit,lowerLimit,_save->getDepth(),action.type);\n"
        "    int displayedAccuracy=BattleUnit::getFiringAccuracy(\n"
        "        BattleActionAttack::GetBeforeShoot(action),_game->getMod());\n"
        "    if (virtualKneelChange && kneelFactor>0.0)\n"
        "        displayedAccuracy=int(displayedAccuracy*(_r22Kneel ? kneelFactor : 1.0/kneelFactor));\n"
        "    if (distance>upperLimit) displayedAccuracy-=(distance-upperLimit)*dropoff;\n"
        "    else if (distance<lowerLimit) displayedAccuracy-=(lowerLimit-distance)*dropoff;\n"
        "    if (noLosPenalty!=-1 && virtualHasLOS==0)\n"
        "        displayedAccuracy=displayedAccuracy*noLosPenalty/100;\n"
        "    const bool outOfRange=!action.sprayTargeting &&\n"
        "        weapon->getRules()->isOutOfRange(distanceSq);\n"
        "    if (outOfRange || displayedAccuracy<=0) displayedAccuracy=0;\n"
        "    // Real ProjectileFlyBState rejects fire beyond the weapon max range.\n"
        "    // Never show an attainable hit chance when native fire is forbidden.\n"
        "    if (outOfRange)\n"
        "    {\n"
        "        clearInvalidPreview();\n"
        "        _r22StatsText=\"ACC~0% OUT OF RANGE\";\n"
        "        return;\n"
        "    }",
        "virtual accuracy and range computation")

    mapcpp = once(mapcpp,
        "    mix((unsigned long long)(static_cast<long long>(accuracy*1000000.0)));",
        "    mix((unsigned long long)(static_cast<long long>(accuracy*1000000.0)));\n"
        "    mix((unsigned int)(virtualHasLOS+1));\n"
        "    mix((unsigned int)displayedAccuracy);",
        "cache key includes virtual visibility/range adjusted accuracy")
    mapcpp = once(mapcpp,
        "const int status=projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng);",
        "const int status=projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng,virtualHasLOS);",
        "inject virtual LOS into preview-only projectile")
    mapcpp = once(mapcpp,
        'label << "ACC~" << int(accuracy*100.0+0.5) << "% "',
        'label << "ACC~" << displayedAccuracy << "% "',
        "HUD native-equivalent adjusted percent")

    return mapcpp,tileh,tilecpp,projh,projcpp


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("engine",type=Path)
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    root=args.engine.resolve()
    paths=[root/n for n in FILES]
    if not all(p.is_file() for p in paths+[root/"src/version.h"]):
        raise SystemExit("R25: missing pinned sources")
    version=(root/"src/version.h").read_text(encoding="utf-8")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise SystemExit("R25: engine version mismatch")
    if (root/".git").exists():
        actual=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if actual!=PIN: raise SystemExit(f"R25: pinned engine commit expected {PIN}, got {actual}")
    original=[p.read_text(encoding="utf-8") for p in paths]
    out=patch(*original)
    if not args.dry_run:
        for p,c in zip(paths,out):p.write_text(c,encoding="utf-8")
    print(json.dumps({
        "patch":"R25 virtual native-range and LOS preview parity",
        "native_fire_calls_unchanged": True,
        "savegames_unchanged": True,
        "files":{name:hashlib.sha256(s.encode("utf-8")).hexdigest() for name,s in zip(FILES,out)}
    },indent=2))

if __name__=="__main__":main()
