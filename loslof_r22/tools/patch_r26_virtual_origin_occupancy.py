#!/usr/bin/env python3
"""R26: remove ghost occupant of a virtual firing tile from preview rays.

R25 virtual LOS and projectile traces excluded the *selected actor*, but when
previewing from a tile currently occupied by a different friendly unit the
occupant remained a physical obstruction. XPiratez globally halves accuracy
when LOS fails, so comparing two actors from the same virtual tile could show
roughly 80 vs 40. This patch supports one additional, EXPLICIT preview-only
ignored unit. All native engine calls default to nullptr, and the simulated
actor's actual tile and the game save are never mutated.

Pin this after R22, R23, R24 and R25 in the Actions build.
"""
from pathlib import Path
import argparse, hashlib, json, re, subprocess

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
FILES = (
    "src/Battlescape/TileEngine.h",
    "src/Battlescape/TileEngine.cpp",
    "src/Battlescape/Map.cpp",
    "src/Battlescape/Projectile.h",
    "src/Battlescape/Projectile.cpp",
)


def one(data, before, after, marker):
    count = data.count(before)
    if count != 1:
        raise RuntimeError(f"{marker}: expected one exact R25 anchor, found {count}: {before[:115]!r}")
    return data.replace(before, after, 1)


def replace_method(data, signature, before, after, label, expected=1):
    pos = data.index(signature)
    opening = data.index("{", pos)
    stack = 0
    end = None
    for i in range(opening, len(data)):
        if data[i] == "{":
            stack += 1
        elif data[i] == "}":
            stack -= 1
            if stack == 0:
                end = i + 1
                break
    if end is None:
        raise RuntimeError(f"Unclosed method: {signature}")
    region=data[pos:end]
    count=region.count(before)
    if count!=expected:
        raise RuntimeError(f"{label}: expected {expected} occurrences in method, found {count}: {before[:115]!r}")
    return data[:pos] + region.replace(before,after) + data[end:]


def patch(tileh, tilecpp, mapcpp, projh, projcpp):
    # Extra ignore unit only for preview callers. Legacy native callers have
    # the same args and the new parameter defaults to nullptr.
    tileh = one(tileh,
        "BattleUnit *excludeAllBut = 0, bool onlyVisible = false);",
        "BattleUnit *excludeAllBut = 0, bool onlyVisible = false, BattleUnit *previewVacatedUnit = nullptr);",
        "calculateLineVoxel signature")
    tileh = one(tileh,
        "BattleUnit *potentialUnit = 0, bool onlyVisible = false);",
        "BattleUnit *potentialUnit = 0, bool onlyVisible = false, BattleUnit *previewVacatedUnit = nullptr);",
        "canTargetUnit signature")
    tileh = one(tileh,
        "BattleUnit *excludeUnit, bool rememberObstacles);",
        "BattleUnit *excludeUnit, bool rememberObstacles, BattleUnit *previewVacatedUnit = nullptr);",
        "canTargetTile signature")
    tileh = one(tileh,
        "BattleUnit *excludeAllBut = 0);",
        "BattleUnit *excludeAllBut = 0, BattleUnit *previewVacatedUnit = nullptr);",
        "voxelCheck signature")

    tilecpp = one(tilecpp,
        "BattleUnit *excludeUnit, BattleUnit *excludeAllBut, bool onlyVisible)\n{",
        "BattleUnit *excludeUnit, BattleUnit *excludeAllBut, bool onlyVisible, BattleUnit *previewVacatedUnit)\n{",
        "TileEngine::calculateLineVoxel definition")
    tilecpp = one(tilecpp,
        "BattleUnit *excludeUnit, bool excludeAllUnits, bool onlyVisible, BattleUnit *excludeAllBut)\n{",
        "BattleUnit *excludeUnit, bool excludeAllUnits, bool onlyVisible, BattleUnit *excludeAllBut, BattleUnit *previewVacatedUnit)\n{",
        "TileEngine::voxelCheck definition")
    tilecpp = one(tilecpp,
        "unit != excludeUnit && (!excludeAllBut || unit == excludeAllBut)",
        "unit != excludeUnit && unit != previewVacatedUnit && (!excludeAllBut || unit == excludeAllBut)",
        "second excluded preview unit")
    tilecpp = replace_method(tilecpp,
        "VoxelType TileEngine::calculateLineVoxel(",
        "voxelCheck(point, excludeUnit, excludeAllUnits, onlyVisible, excludeAllBut)",
        "voxelCheck(point, excludeUnit, excludeAllUnits, onlyVisible, excludeAllBut, previewVacatedUnit)",
        "both primary/intermediate voxel rays", expected=2)
    tilecpp = one(tilecpp,
        "BattleUnit *potentialUnit, bool onlyVisible)\n{",
        "BattleUnit *potentialUnit, bool onlyVisible, BattleUnit *previewVacatedUnit)\n{",
        "canTargetUnit definition")
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::canTargetUnit(",
        "calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit, nullptr, onlyVisible)",
        "calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit, nullptr, onlyVisible, previewVacatedUnit)",
        "canTargetUnit virtual ray")
    tilecpp = one(tilecpp,
        "BattleUnit *excludeUnit, bool rememberObstacles)\n{",
        "BattleUnit *excludeUnit, bool rememberObstacles, BattleUnit *previewVacatedUnit)\n{",
        "canTargetTile definition")
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::canTargetTile(",
        "calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit)",
        "calculateLineVoxel(*originVoxel, *scanVoxel, false, &_trajectory, excludeUnit, nullptr, false, previewVacatedUnit)",
        "canTargetTile virtual ray")

    # Visibility smoke/light visibility-quality helper also traces from the
    # virtual eye: ignoring an origin ally here is mandatory. Native default
    # remains null and its original semantics are preserved.
    tilecpp = one(tilecpp,
        "const BattleUnit* currentUnit, Position originVoxel, Position scanVoxel)\n{",
        "const BattleUnit* currentUnit, Position originVoxel, Position scanVoxel, BattleUnit *previewVacatedUnit = nullptr)\n{",
        "getTrajectoryDataHelper optional argument")
    tilecpp = replace_method(tilecpp,
        "std::tuple<int, int, int, int, int> getTrajectoryDataHelper(",
        "te->calculateLineVoxel(originVoxel, scanVoxel, true, &_trajectory, const_cast<BattleUnit*>(currentUnit));",
        "te->calculateLineVoxel(originVoxel, scanVoxel, true, &_trajectory, const_cast<BattleUnit*>(currentUnit), nullptr, false, previewVacatedUnit);",
        "getTrajectoryDataHelper ray")

    # The virtual methods are sourced from native OXCE, and source==actual
    # still delegates to native. Ignore ONLY a visible friendly occupying the
    # hypothetical origin. Do not make non-origin units intangible.
    virtual_select = (
        "\tTile *virtualTile = _save->getTile(source);\n"
        "\tBattleUnit *previewVacatedUnit = virtualTile ? virtualTile->getOverlappingUnit(_save) : nullptr;\n"
        "\tif (previewVacatedUnit &&\n"
        "\t    (previewVacatedUnit == currentUnit ||\n"
        "\t     previewVacatedUnit->getFaction() != currentUnit->getFaction()))\n"
        "\t\tpreviewVacatedUnit = nullptr;\n"
    )
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::r25VirtualVisible(",
        "\tif (!_save->getTile(source)) return false;",
        "\tif (!_save->getTile(source)) return false;\n" + virtual_select.rstrip("\n"),
        "virtual unit LOS source occupant")
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::r25VirtualVisible(",
        "canTargetUnit(&originVoxel, tile, &scanVoxel, currentUnit, false);",
        "canTargetUnit(&originVoxel, tile, &scanVoxel, currentUnit, false, nullptr, false, previewVacatedUnit);",
        "virtual unit's aimed voxel scan")
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::r25VirtualVisible(",
        "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel)",
        "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel, previewVacatedUnit)",
        "virtual unit's smoke/light trace")
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::r25VirtualTileInLOS(",
        "BattleUnit *currentUnit = action->actor;",
        "BattleUnit *currentUnit = action->actor;\n" + virtual_select.rstrip("\n"),
        "virtual tile LOS source occupant")

    for part in ("O_OBJECT", "O_NORTHWALL", "O_WESTWALL", "O_FLOOR"):
        old=f"canTargetTile(&originVoxel, tile, {part}, &scanVoxel, currentUnit, false)"
        tilecpp = replace_method(tilecpp,
            "bool TileEngine::r25VirtualTileInLOS(",
            old, f"canTargetTile(&originVoxel, tile, {part}, &scanVoxel, currentUnit, false, previewVacatedUnit)",
            f"virtual tile {part} scan")

    tilecpp = replace_method(tilecpp,
        "bool TileEngine::r25VirtualTileInLOS(",
        "calculateLineVoxel(originVoxel, scanVoxel, false, &_trajectory, currentUnit)",
        "calculateLineVoxel(originVoxel, scanVoxel, false, &_trajectory, currentUnit, nullptr, false, previewVacatedUnit)",
        "virtual tile secondary ray")
    tilecpp = replace_method(tilecpp,
        "bool TileEngine::r25VirtualTileInLOS(",
        "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel)",
        "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel, previewVacatedUnit)",
        "virtual tile smoke/light trace")

    # R22/R25 HUD ray, aim voxel scan and H/B/M probabilistic sampler all
    # need to exclude exactly the same hypothetical vacated unit.
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawOverlay()",
        "if (!startTile || !targetTile) return;",
        "if (!startTile || !targetTile) return;\n"
        "    // Preview actor replaces an existing ally at the SOURCE tile only.\n"
        "    // Never alter either BattleUnit, its tile, or the saved game.\n"
        "    BattleUnit *previewVacatedUnit = source != soldier->getPosition() ?\n"
        "        startTile->getOverlappingUnit(_save) : nullptr;\n"
        "    if (previewVacatedUnit &&\n"
        "        (previewVacatedUnit == soldier ||\n"
        "         previewVacatedUnit->getFaction() != soldier->getFaction()))\n"
        "        previewVacatedUnit = nullptr;",
        "Map overlay hypothetical occupant")
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawOverlay()",
        "aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(aimUnit)));",
        "aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(aimUnit)));\n"
        "        aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(previewVacatedUnit)));",
        "Map native aim cache includes occupant")
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawOverlay()",
        "false,nullptr,true))",
        "false,nullptr,true,previewVacatedUnit))",
        "Map voxel aim scan excludes vacated occupant")
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawOverlay()",
        "calculateLineVoxel(muzzle,goal,true,&bullet,soldier,nullptr,true);",
        "calculateLineVoxel(muzzle,goal,true,&bullet,soldier,nullptr,true,previewVacatedUnit);",
        "Map direct LOF overlay")

    # Source tile FOV perimeter projected from the empty tile, not through
    # another friendly who currently occupies it.
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawVisibilityHull(",
        "if(level<0 || level>=_save->getMapSizeZ()) return;",
        "if(level<0 || level>=_save->getMapSizeZ()) return;\n"
        "    BattleUnit *observer=_save->getSelectedUnit();\n"
        "    Tile *virtualTile=_save->getTile(source);\n"
        "    BattleUnit *previewVacatedUnit = observer && virtualTile && source!=observer->getPosition() ?\n"
        "        virtualTile->getOverlappingUnit(_save) : nullptr;\n"
        "    if(previewVacatedUnit &&\n"
        "       (previewVacatedUnit==observer ||\n"
        "        previewVacatedUnit->getFaction()!=observer->getFaction()))\n"
        "        previewVacatedUnit=nullptr;",
        "virtual FOV occupancy")
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawVisibilityHull(",
        "eye,goal,true,&path,_save->getSelectedUnit(),nullptr,true);",
        "eye,goal,true,&path,_save->getSelectedUnit(),nullptr,true,previewVacatedUnit);",
        "virtual FOV ray occupancy")

    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawStats(",
        "if (targetUnit && !targetUnit->getVisible()) targetUnit=nullptr;",
        "if (targetUnit && !targetUnit->getVisible()) targetUnit=nullptr;\n"
        "    Tile *originTile=_save->getTile(origin);\n"
        "    BattleUnit *previewVacatedUnit = originTile && origin!=shooter->getPosition() ?\n"
        "        originTile->getOverlappingUnit(_save) : nullptr;\n"
        "    if (previewVacatedUnit &&\n"
        "        (previewVacatedUnit==shooter ||\n"
        "         previewVacatedUnit->getFaction()!=shooter->getFaction()))\n"
        "        previewVacatedUnit=nullptr;",
        "H/B/M virtual source occupant")

    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawStats(",
        "mix((unsigned long long)(uintptr_t)targetUnit);",
        "mix((unsigned long long)(uintptr_t)targetUnit);\n"
        "    mix((unsigned long long)(uintptr_t)previewVacatedUnit);",
        "H/B/M cache occupancy")
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawStats(",
        "muzzle,aim,false,&obstructionPoint,shooter,nullptr,true);",
        "muzzle,aim,false,&obstructionPoint,shooter,nullptr,true,previewVacatedUnit);",
        "H/B/M native obstruction cache occupancy")
    mapcpp = replace_method(mapcpp,
        "void Map::r22DrawStats(",
        "projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng,virtualHasLOS);",
        "projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng,virtualHasLOS,previewVacatedUnit);",
        "H/B/M preview tracer occupancy")

    projh = one(projh,
        "bool onlyVisible = false, RNG::RandomState *previewRng = nullptr, int previewHasLOS = -1);",
        "bool onlyVisible = false, RNG::RandomState *previewRng = nullptr, int previewHasLOS = -1, BattleUnit *previewVacatedUnit = nullptr);",
        "projectile preview optional signature")
    if "class BattleUnit;" not in projh:
        projh = one(projh, "class BattleItem;", "class BattleUnit;\nclass BattleItem;",
                    "projectile BattleUnit forward")
    projcpp = one(projcpp,
        "int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit, bool onlyVisible, RNG::RandomState *previewRng, int previewHasLOS)\n{",
        "int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit, bool onlyVisible, RNG::RandomState *previewRng, int previewHasLOS, BattleUnit *previewVacatedUnit)\n{",
        "projectile preview definition")
    projcpp = replace_method(projcpp,
        "int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel",
        "calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, bu, nullptr, onlyVisible);",
        "calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, bu, nullptr, onlyVisible, previewVacatedUnit);",
        "projectile preflight virtual origin")
    projcpp = replace_method(projcpp,
        "int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel",
        "calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, nullptr, nullptr, onlyVisible);",
        "calculateLineVoxel(originVoxel, _targetVoxel, false, &_trajectory, nullptr, nullptr, onlyVisible, previewVacatedUnit);",
        "projectile preflight without excludeUnit")
    projcpp = replace_method(projcpp,
        "int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel",
        "calculateLineVoxel(originVoxel, _targetVoxel, true, &_trajectory, bu, nullptr, onlyVisible);",
        "calculateLineVoxel(originVoxel, _targetVoxel, true, &_trajectory, bu, nullptr, onlyVisible, previewVacatedUnit);",
        "projectile randomized trajectory virtual origin")

    return tileh,tilecpp,mapcpp,projh,projcpp


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("engine",type=Path)
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    root=args.engine.resolve()
    paths=[root/p for p in FILES]
    if not all(p.exists() for p in paths):
        raise SystemExit("R26: Missing pinned engine files")
    version=(root/"src/version.h").read_text(encoding="utf-8")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise SystemExit("R26: unexpected engine")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN: raise SystemExit(f"R26: required pinned engine SHA {PIN}, found {sha}")
    previous=[p.read_text(encoding="utf-8") for p in paths]
    updated=patch(*previous)
    if not args.dry_run:
        for p,c in zip(paths,updated):
            p.write_text(c,encoding="utf-8")
    print(json.dumps({
        "patch":"R26 virtual-source friendly occupant ghost correction",
        "native_default_collision_semantics":"unchanged, previewVacatedUnit=nullptr",
        "research_and_save_changes":False,
        "changed":{name:hashlib.sha256(c.encode("utf-8")).hexdigest() for name,c in zip(FILES,updated)}
    },indent=2))


if __name__=="__main__":
    main()
