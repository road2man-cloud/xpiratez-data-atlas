#!/usr/bin/env python3
"""Static correctness gates: no mouse interception, only native aim HUD.

This is source verification, not a substitute for actual XPiratez mouse+keyboard
playthrough. Fail closed on accidental removal of native movement or fire.
"""
from pathlib import Path
import re
import sys

root=Path(sys.argv[1]).resolve()
m=(root/"src/Battlescape/Map.cpp").read_text(encoding="utf-8")
h=(root/"src/Battlescape/Map.h").read_text(encoding="utf-8")
state=(root/"src/Battlescape/BattlescapeState.cpp").read_text(encoding="utf-8")
assert m.count("void Map::r22DrawOverlay()")==1
overlay=m.split("void Map::r22DrawOverlay()",1)[1].split("\n}\n",1)[0]
keys=m.split("void Map::keyboardPress(Action *action, State *state)",1)[1].split("\n}\n",1)[0]
stats=m.split("void Map::r22DrawStats(",1)[1].split("\n}\n",1)[0]
throw=m.split("void Map::r22DrawThrowPreview(",1)[1].split("\n}\n",1)[0]
checks={
  "No intercepted map clicks in native state":
      "r22PreviewClick" not in state and
      "_battleGame->primaryAction(pos);" in state and
      "_battleGame->secondaryAction(pos);" in state,
  "No preview mouse click hook anywhere":
      "r22PreviewClick" not in m and "r22PreviewClick" not in h,
  "F8 enabled separately from native fire/movement":
      "key == SDLK_F8" in keys and "_r22On = !_r22On;" in keys,
  "Real movement never consumes a left/right map click":
      "r22PreviewClick" not in state and
      "_battleGame->cancelCurrentAction()" in state,
  "Backslash only in native targeting and when F8 is on":
      "key == SDLK_BACKSLASH && _r22On" in keys and
      "native->targeting && actor" in keys,
  "Backslash virtual stance is independent of real kneel":
      "_r22StanceOverride = true;" in keys and
      "_r22Kneel = !current;" in keys and
      "->kneel(" not in keys,
  "Backslash invalidates probability/LOS/throw caches":
      all(v in keys for v in
          ["_r22StatsKey = 0;","_r22HullHash = 0;","_r22ThrowCacheKey = 0;"]),
  "Virtual stance follows soldier until explicitly overridden":
      "bool _r22StanceOverride = false;" in h and
      "_r22StanceOverride ?\n                    _r22Kneel : actor->isKneeled()" in keys,
  "Native OXCE aiming action is required":
      "native->targeting && native->weapon" in overlay and
      "native->actor == soldier" in overlay,
  "No probability when moving, with early return BEFORE cursor rays":
      overlay.index("if (!nativeAim)") < overlay.index("getSelectorPosition(&cursor)") and
      "_r22StatsText.clear();" in overlay and
      "_r22TileRisks.clear();" in overlay,
  "Native planned movement LOS remains accessible":
      "finder && finder->isPathPreviewed()" in overlay and
      "r22DrawVisibilityHull(planned,eye" in overlay,
  "Fire-aim target is cursor with no click":
      "native->waypoints.front() : cursor" in overlay and
      "getSelectorPosition(&cursor)" in overlay,
  "First native confirm click switches cursor into virtual shooter position":
      "const bool confirmedTarget = Options::battleConfirmFireMode &&" in overlay and
      "const Position source = confirmedTarget ? cursor : r22PlannedPosition(soldier);" in overlay and
      "const Position target = confirmedTarget ? native->waypoints.front() : cursor;" in overlay,
  "Firing traces and stats depend on virtual origin":
      "Tile *startTile = _save->getTile(source);" in overlay and
      "getOriginVoxel(testAction, startTile)" in overlay and
      "r22DrawStats(source,target,goal,muzzle);" in overlay,
  "Native first target does not create second click interceptor":
      "r22PreviewClick" not in state and "r22PreviewClick" not in m,
  "No zero-range sampling before cursor leaves native marked target":
      "confirmedTarget && (source == target ||" in overlay and
      "_r22StatsText.clear();" in overlay,
  "No hidden map geometry leaked from unexplored virtual shooter origin":
      "startTile && !startTile->isDiscovered(O_FLOOR)" in overlay,
  "Native first click target is the game's own confirmation":
      "Options::battleConfirmFireMode" in overlay and
      "!native->sprayTargeting" in overlay,
  "Standing and kneeling change native eye height":
      "_r22StanceOverride && (_r22Kneel != soldier->isKneeled())" in overlay and
      "getKneelHeight()" in overlay and "getStandHeight()" in overlay,
  "Shooting accuracy recalculates on virtual stance":
      "_r22StanceOverride && _r22Kneel!=shooter->isKneeled()" in stats,
  "Throw uses virtual stance only after explicit override":
      "_r22StanceOverride ? _r22Kneel : actor->isKneeled()" in throw,
  "Only one compact H/B/M text placement":
      'drawString(2,23,_r22StatsText.c_str(),160)' not in m and
      'if(!_r22StatsText.empty()) label<<" "<<_r22StatsText' not in m and
      'drawString(2,2,line.c_str(),160)' in overlay,
  "No obsolete click lock guidance":
      "LMB=lock target" not in m and
      "cursor=origin; RMB=clear" not in m,
  "Throw HUD is brief":
      '" | THROW OK"' in throw and '" | THROW BLOCKED"' in throw,
  "H/B/M labels indicate sampling":
      'label << "ACC~"' in stats,
  "SIM shown only when virtual and actual stance differ":
      "const bool simulated = _r22StanceOverride &&" in overlay and
      "if (simulated) hud << \"SIM \";" in overlay and
      "if (_r22StanceOverride && virtualKneeled != actor->isKneeled())" in throw,
  "F8 resets throw preview state as well as gun statistics":
      "_r22ThrowTrajectory.clear();" in keys and
      "_r22ThrowValid = false;" in keys,
}
failed=[]
for name,valid in checks.items():
    print(("PASS" if valid else "FAIL")+" "+name)
    if not valid:failed.append(name)
print("Native targeting usability checks:",len(checks)-len(failed),"/",len(checks))
if failed:
    raise SystemExit("Native input/HUD regression: "+", ".join(failed))
