#!/usr/bin/env python3
"""R26 regression gates for XPiratez ghost occupant in a virtual firing tile.

The source-level gates exercise API defaults and explicit preview exclusions.
Optional --save + --rules performs local-only evidence validation against a
user-owned save/ruleset; never upload the save to CI or a public repository.
"""
from pathlib import Path
import argparse
import re
import subprocess
import sys


def method(data, token):
    start = data.index(token)
    opener = data.index("{", start)
    depth = 0
    for i in range(opener, len(data)):
        depth += (data[i] == "{") - (data[i] == "}")
        if depth == 0:
            return data[start:i+1]
    raise RuntimeError("Unterminated C++ method: "+token)


def run():
    ap = argparse.ArgumentParser()
    ap.add_argument("engine", type=Path)
    ap.add_argument("--save", type=Path)
    ap.add_argument("--rules", type=Path)
    a = ap.parse_args()
    root = a.engine.resolve()
    rd = lambda name: (root / name).read_text(encoding="utf-8")
    tileh = rd("src/Battlescape/TileEngine.h")
    tilecpp = rd("src/Battlescape/TileEngine.cpp")
    mapcpp = rd("src/Battlescape/Map.cpp")
    projh = rd("src/Battlescape/Projectile.h")
    projcpp = rd("src/Battlescape/Projectile.cpp")
    native_fire = rd("src/Battlescape/ProjectileFlyBState.cpp")
    current_source = rd("src/Basescape/ResearchState.cpp")

    voxel = method(tilecpp, "VoxelType TileEngine::voxelCheck(")
    line = method(tilecpp, "VoxelType TileEngine::calculateLineVoxel(")
    unit = method(tilecpp, "bool TileEngine::canTargetUnit(")
    tile = method(tilecpp, "bool TileEngine::canTargetTile(")
    virtual_unit = method(tilecpp, "bool TileEngine::r25VirtualVisible(")
    virtual_tile = method(tilecpp, "bool TileEngine::r25VirtualTileInLOS(")
    native_unit = method(tilecpp, "bool TileEngine::visible(")
    native_tile = method(tilecpp, "bool TileEngine::isTileInLOS(")
    helper = method(tilecpp, "std::tuple<int, int, int, int, int> getTrajectoryDataHelper(")
    overlay = method(mapcpp, "void Map::r22DrawOverlay(")
    hull = method(mapcpp, "void Map::r22DrawVisibilityHull(")
    preview = method(mapcpp, "void Map::r22DrawStats(")
    projectile = method(projcpp, "int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel")

    checks = {
        "Native voxel API adds optional excluded unit with NULL default":
            "BattleUnit *previewVacatedUnit = nullptr" in tileh and
            "BattleUnit *excludeAllBut = 0, bool onlyVisible = false, BattleUnit *previewVacatedUnit = nullptr" in tileh,
        "Native targeting APIs add optional argument without changing legacy calls":
            "BattleUnit *potentialUnit = 0, bool onlyVisible = false, BattleUnit *previewVacatedUnit = nullptr" in tileh and
            "bool rememberObstacles, BattleUnit *previewVacatedUnit = nullptr" in tileh,
        "Ray engine explicitly excludes BOTH preview actor and vacated friendly":
            "unit != excludeUnit && unit != previewVacatedUnit" in voxel,
        "Primary and diagonal ray collision use the same second exclusion":
            line.count("voxelCheck(point, excludeUnit, excludeAllUnits, onlyVisible, excludeAllBut, previewVacatedUnit)") == 2,
        "Target unit scan forwards preview-only second exclusion":
            "excludeUnit, nullptr, onlyVisible, previewVacatedUnit" in unit,
        "Target tile scan forwards preview-only second exclusion":
            "excludeUnit, nullptr, false, previewVacatedUnit" in tile,
        "Native TileEngine visible method stays untouched":
            "canTargetUnit(&originVoxel, tile, &scanVoxel, currentUnit, false);" in native_unit and
            "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel)" in native_unit,
        "Native TileEngine tile LOS still uses original actor":
            "getOriginVoxel(tempAction, currentUnit->getTile())" in native_tile and
            "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel)" in native_tile,
        "Virtual unit visibility excludes an ally standing at SOURCE only":
            "virtualTile->getOverlappingUnit(_save)" in virtual_unit and
            "previewVacatedUnit->getFaction() != currentUnit->getFaction()" in virtual_unit and
            "canTargetUnit(&originVoxel, tile, &scanVoxel, currentUnit, false, nullptr, false, previewVacatedUnit)" in virtual_unit,
        "Virtual tile LOS skips same ally without bypassing terrain":
            "getOriginVoxel(tempAction, _save->getTile(source))" in virtual_tile and
            all("currentUnit, false, previewVacatedUnit)" in virtual_tile
                for _ in range(1)) and
            "calculateLineVoxel(originVoxel, scanVoxel, false, &_trajectory, currentUnit, nullptr, false, previewVacatedUnit)" in virtual_tile,
        "Virtual smoke/light sight quality rays skip ghost ally":
            "previewVacatedUnit" in helper and
            "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel, previewVacatedUnit)" in virtual_unit and
            "getTrajectoryDataHelper(this, _save, currentUnit, originVoxel, scanVoxel, previewVacatedUnit)" in virtual_tile,
        "Virtual methods retain native delegation when source is actor position":
            "return visible(currentUnit, tile);" in virtual_unit and
            "return isTileInLOS(action, tile, drawing);" in virtual_tile,
        "Map virtual cursor source must not be real selected actor position":
            "source != soldier->getPosition()" in overlay and
            "startTile->getOverlappingUnit(_save)" in overlay,
        "Map excludes only SAME-FACTION vacated unit":
            "previewVacatedUnit->getFaction() != soldier->getFaction()" in overlay and
            "previewVacatedUnit == soldier" in overlay,
        "Native aim multi-voxel scan excludes ghost ally":
            "false,nullptr,true,previewVacatedUnit))" in overlay,
        "Direct displayed LOF ray excludes ghost ally":
            "calculateLineVoxel(muzzle,goal,true,&bullet,soldier,nullptr,true,previewVacatedUnit)" in overlay,
        "Virtual visibility hull ray excludes ghost ally":
            "eye,goal,true,&path,_save->getSelectedUnit(),nullptr,true,previewVacatedUnit" in hull,
        "Monte Carlo ray and preflight exclude ghost ally":
            "projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng,virtualHasLOS,previewVacatedUnit)" in preview and
            projectile.count("previewVacatedUnit") >= 4,
        "HUD probabilities are invalidated when source occupant changes":
            "aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(previewVacatedUnit)))" in overlay and
            "mix((unsigned long long)(uintptr_t)previewVacatedUnit)" in preview,
        "Actual native fire calls are unchanged and use default null":
            "projectile->calculateTrajectory(BattleUnit::getFiringAccuracy" in native_fire and
            "previewVacatedUnit" not in native_fire,
        "No savegame/unit position mutation from virtual preview code":
            all("setPosition(" not in m and "setTile(" not in m
                for m in (virtual_unit, virtual_tile, overlay, hull, preview)),
        "R23 and R24 research display remain present":
            "proj->getCost()" in current_source and
            "proj->getSpent()" in current_source,
    }
    if a.save:
        try:
            import yaml
        except ImportError as exc:
            raise SystemExit("Optional local-save check requires PyYAML") from exc
        with a.save.open(encoding="utf-8") as f:
            metadata,game = yaml.safe_load_all(f)
        units={u["id"]:u for u in game["battleGame"]["units"]}
        items=[i for i in game["battleGame"]["items"] if
               i.get("owner") in (1,6) and i.get("inventoryslot")=="STR_RIGHT_HAND"]
        guns={i["owner"]:i["type"] for i in items}
        checks["User 25.sav: Malcontent Chill at (12,6) and Eel occupies virtual (12,8)"] = (
            units[6]["position"]==[12,6,0] and units[1]["position"]==[12,8,0]
            and units[6]["faction"]==units[1]["faction"]
        )
        checks["User 25.sav: both use AK rifle, each has wound-free comparable firing"] = (
            guns.get(1)==guns.get(6)=="STR_RIFLE_AK"
            and units[1]["currStats"]["firing"]==84
            and units[6]["currStats"]["firing"]==74
            and all(x==0 for x in units[1]["fatalWounds"])
            and all(x==0 for x in units[6]["fatalWounds"])
        )
    if a.rules:
        glob = a.rules.read_text(encoding="utf-8")
        checks["User ruleset: global no-LOS accuracy reduction is precisely half"] = bool(
            re.search(r"(?m)^\s*noLOSAccuracyPenaltyGlobal:\s*50\s*(?:#.*)?$",glob)
        )
    if (root/".git").exists():
        changed=set(subprocess.check_output(["git","-C",str(root),"diff","--name-only"],text=True).splitlines())
        allowed={
            "src/Battlescape/Map.h","src/Battlescape/Map.cpp",
            "src/Battlescape/TileEngine.cpp","src/Battlescape/TileEngine.h",
            "src/Battlescape/Projectile.cpp","src/Battlescape/Projectile.h",
            "src/Battlescape/BattlescapeState.cpp","src/Battlescape/ProjectileFlyBState.cpp",
            "src/Battlescape/ProjectileFlyBState.h","src/Mod/Mod.cpp",
            "src/Menu/OptionsAdvancedState.cpp","src/CMakeLists.txt",
            "src/Basescape/ResearchState.cpp","src/Basescape/NewResearchListState.cpp",
            "src/Basescape/ResearchInfoState.cpp","src/Basescape/ResearchInfoState.h",
        }
        checks["R26 confines modifications to known cumulative R22-R26 engine surfaces"]=changed.issubset(allowed)
    for name,ok in checks.items():
        print(f"{'PASS' if ok else 'FAIL'} {name}")
    if not all(checks.values()):
        raise SystemExit("R26 virtual origin occupant regression failed")
    print(f"PASS {len(checks)} R26 gates; game HUD A/B remains runtime verification")


if __name__ == "__main__":
    run()
