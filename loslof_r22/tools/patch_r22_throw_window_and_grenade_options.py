#!/usr/bin/env python3
"""Stage 8 R22: preview thrown objects as the ACTUAL landing engine accepts;
let users change only battleInstantGrenade during a running XPiratez campaign.

Applied after stages 1..7. Existing savegame and normal projectile code are
untouched. This only corrects the passive preview and unfixes a single setting.
The nominal throw trajectory is NOT a guarantee of randomized landing.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

PIN="3e722e09b655ab67acfb59fc8585dc70b583826c"
MARK="LOSLOF_R22_THROW_WINDOW_AND_LIVE_GRENADE_OPTION"

def once(s,old,new):
    n=s.count(old)
    if n!=1:
        raise RuntimeError("Stage8 strict patch anchor count %d: %r"%(n,old[:140]))
    return s.replace(old,new,1)

def patch(mapcpp,modcpp,advanced):
    for src in (mapcpp,modcpp,advanced):
        if MARK in src:
            raise RuntimeError("Stage8 already applied; source unchanged")

    # Old R22 treated *any* collision except OOB as a success. OXCE's
    # ProjectileFlyBState::createNewProjectile() accepts only FLOOR, UNIT,
    # OBJECT for BA_THROW. North/west WALL collision means UNABLE TO THROW.
    # OXCE Projectile::calculateThrow also rejects impassable OBJECT at
    # the shifted item-drop tile, after the final arc is computed.
    mapcpp=once(mapcpp,
        """            _r22ThrowValid=result!=V_OUTOFBOUNDS;""",
        """            // LOSLOF_R22_THROW_WINDOW_AND_LIVE_GRENADE_OPTION
            // Same accepted impact kinds as native throw execution, NOT
            // merely result!=V_OUTOFBOUNDS (which includes window/walls).
            bool accepted=(result==V_FLOOR || result==V_UNIT ||
                           result==V_OBJECT) &&
                          !_r22ThrowTrajectory.empty();
            if(accepted)
            {
                // Exactly mirror Projectile::calculateThrow's item-drop
                // position and impassable-object rejection.
                const Position itemTile=Projectile::getPositionFromEnd(
                    _r22ThrowTrajectory,Projectile::ItemDropVoxelOffset).toTile();
                Tile *endTile=_save->getTile(itemTile);
                if(!endTile) accepted=false;
                else if(endTile->getMapData(O_OBJECT) &&
                        endTile->getMapData(O_OBJECT)->getTUCost(MT_WALK)
                            ==Pathfinding::INVALID_MOVE_COST &&
                        !(endTile->isBigWall() &&
                          (endTile->getMapData(O_OBJECT)->getBigWall()<1 ||
                           endTile->getMapData(O_OBJECT)->getBigWall()>3)))
                    accepted=false;
            }
            _r22ThrowValid=accepted;""")
    # The engine randomizes the final throw trajectory. Arc-clear means
    # nominal deterministic preview only; never promise 100% success.
    mapcpp=once(mapcpp,
        '_r22ThrowValid ? " | THROW OK" : " | THROW BLOCKED"',
        '_r22ThrowValid ? " | ARC CLEAR" : " | ARC BLOCKED"')

    # Do not mutate or remove _fixedUserOptions: other gameplay settings
    # retain the mod's locks. This one option will keep the user's saved
    # value on a subsequent game/mod reload.
    modcpp=once(modcpp,
        """\t\t\tif (optionInfo.type() != OPTION_KEY && !optionInfo.category().empty())
\t\t\t{
\t\t\t\toptionInfo.load(_fixedUserOptions, false);
\t\t\t}""",
        """\t\t\t// LOSLOF_R22_THROW_WINDOW_AND_LIVE_GRENADE_OPTION
\t\t\t// Preserve user-configured instant grenades across mod reloads.
\t\t\tif (optionInfo.type() != OPTION_KEY && !optionInfo.category().empty()
\t\t\t\t&& optionInfo.id() != "battleInstantGrenade")
\t\t\t{
\t\t\t\toptionInfo.load(_fixedUserOptions, false);
\t\t\t}""")
    advanced=once(advanced,
        """\t\tif (search != fixeduserOptions.end())
\t\t{
\t\t\t_lstOptions->setRowColor(_lstOptions->getLastRowIndex(), _greyedOutColor);
\t\t}""",
        """\t\t// LOSLOF_R22_THROW_WINDOW_AND_LIVE_GRENADE_OPTION
\t\tif (search != fixeduserOptions.end() && optionInfo.id() != "battleInstantGrenade")
\t\t{
\t\t\t_lstOptions->setRowColor(_lstOptions->getLastRowIndex(), _greyedOutColor);
\t\t}""")
    advanced=once(advanced,
        """\tif (it != fixeduserOptions.end())
\t{
\t\treturn;
\t}""",
        """\t// The user may change *only* instant grenades; all other
\t// mod-fixed options still stay disabled, unchanged from OXCE.
\tif (it != fixeduserOptions.end() && setting->id() != "battleInstantGrenade")
\t{
\t\treturn;
\t}""")
    return mapcpp,modcpp,advanced

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("engine",type=Path)
    cli.add_argument("--dry-run",action="store_true")
    args=cli.parse_args()
    root=args.engine.resolve()
    names=["src/Battlescape/Map.cpp","src/Mod/Mod.cpp",
           "src/Menu/OptionsAdvancedState.cpp"]
    paths=[root/name for name in names]
    version=root/"src/version.h"
    if not all(p.is_file() for p in paths+[version]):
        raise SystemExit("Missing pinned OXCE source files")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     version.read_text(encoding="utf-8")):
        raise SystemExit("Wrong engine version")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],
                                    text=True).strip()
        if sha!=PIN:
            raise SystemExit("Unexpected upstream SHA "+sha)
    old=[p.read_text(encoding="utf-8") for p in paths]
    changed=patch(*old)
    if not args.dry_run:
        for p,s in zip(paths,changed):
            p.write_text(s,encoding="utf-8")
    print(json.dumps({"stage":MARK,"upstream":PIN,"dry_run":args.dry_run,
        "r21_parity":False,"real_battle_tested":False,
        "files":{name:hashlib.sha256(src.encode()).hexdigest()
                 for name,src in zip(names,changed)}},indent=2))

if __name__=="__main__":
    main()
