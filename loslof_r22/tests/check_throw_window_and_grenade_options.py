#!/usr/bin/env python3
"""Static regression for R22 window throws and user-changeable instant grenades.

Does NOT imply parity with game-integrated RNG; arc status is nominal only.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
read=lambda p:(root/p).read_text(encoding="utf-8")
mapcpp=read("src/Battlescape/Map.cpp")
modcpp=read("src/Mod/Mod.cpp")
advanced=read("src/Menu/OptionsAdvancedState.cpp")
options=read("src/Engine/Options.cpp")
item=read("src/Savegame/BattleItem.cpp")
fly=read("src/Battlescape/ProjectileFlyBState.cpp")
proj=read("src/Battlescape/Projectile.cpp")
throw=mapcpp.split("void Map::r22DrawThrowPreview(",1)[1].split("\n}\n",1)[0]
click=advanced.split("void OptionsAdvancedState::lstOptionsClick(",1)[1].split("\n}\n",1)[0]
settings=advanced.split("void OptionsAdvancedState::addSettings(",1)[1].split("\n}\n",1)[0]
fixed=modcpp.split("// fixed user options",1)[1].split("// additional validation",1)[0]
checks={
 "Native engine accepts only valid grenade impact categories":
     "_projectileImpact == V_FLOOR || _projectileImpact == V_UNIT || _projectileImpact == V_OBJECT" in fly,
 "R22 matches native valid impact category (not only not-OOB)":
     "result==V_FLOOR || result==V_UNIT ||" in throw
     and "result==V_OBJECT" in throw
     and "_r22ThrowValid=accepted;" in throw
     and "_r22ThrowValid=result!=V_OUTOFBOUNDS;" not in throw,
 "Native throw rejects impassable object at the final item drop":
     "getPositionFromEnd(_trajectory, ItemDropVoxelOffset)" in proj
     and "Pathfinding::INVALID_MOVE_COST" in proj,
 "Preview uses same item-drop offset":
     "Projectile::getPositionFromEnd(" in throw
     and "Projectile::ItemDropVoxelOffset" in throw,
 "Preview rejects impassable object, preserving big-wall exception":
     "Pathfinding::INVALID_MOVE_COST" in throw
     and "endTile->isBigWall()" in throw
     and "getBigWall()<1" in throw
     and "getBigWall()>3" in throw,
 "Native throw still validates range and parabola":
     "validateThrow(action,origin,goal," in throw
     and "calculateParabolaVoxel(" in throw,
 "Nominal preview no longer promises thrown object will land":
     '" | ARC CLEAR"' in throw and '" | ARC BLOCKED"' in throw
     and '" | THROW OK"' not in throw,
 "Options registers the existing instant grenade setting":
     '"battleInstantGrenade", &battleInstantGrenade' in options,
 "Mod loading does not overwrite user instant grenade choice":
     'optionInfo.id() != "battleInstantGrenade"' in fixed
     and 'optionInfo.load(_fixedUserOptions, false);' in fixed,
 "Other fixed options remain locked":
     'if (it != fixeduserOptions.end() && setting->id() != "battleInstantGrenade")' in click
     and 'return;' in click,
 "Instant grenade row is enabled in advanced options":
     'search != fixeduserOptions.end() && optionInfo.id() != "battleInstantGrenade"' in settings,
 "Actual engine uses the live option in grenade fuse behavior":
     "Options::battleInstantGrenade || _rules->getFuseTimerType() == BFT_INSTANT" in item,
 "No gameplay throw trajectory implementation is overwritten":
     "int Projectile::calculateThrow(double accuracy)" in proj,
 "No real fire mouse click interception introduced":
     "r22PreviewClick(" not in mapcpp,
}
bad=[k for k,v in checks.items() if not v]
for name,value in checks.items():
    print(("PASS" if value else "FAIL")+" "+name)
print("R22 throw and live grenade option guards:",len(checks)-len(bad),"/",len(checks))
if bad:
    raise SystemExit("FAILED: "+", ".join(bad))
