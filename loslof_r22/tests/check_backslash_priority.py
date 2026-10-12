#!/usr/bin/env python3
"""Regression guard for native OXCE default SDLK_BACKSLASH deselect conflict.

The canonical OXCE keyBattleDeselectUnit remains unchanged. During native
shooting/throwing targeting AND F8 enabled, R22 uses the key for virtual
STAND/KNEEL. All other uses of the key remain OXCE native actions.
Static code checks; in-game key dispatcher behavior requires manual UI tests.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
read=lambda path:(root/path).read_text(encoding="utf-8")
state=read("src/Battlescape/BattlescapeState.cpp")
mapcpp=read("src/Battlescape/Map.cpp")
maph=read("src/Battlescape/Map.h")
options=read("src/Engine/Options.cpp")
start=state.index("inline void BattlescapeState::handle(Action *action)")
early=state[start:state.index("State::handle(action);",start)]
helper=mapcpp.split("bool Map::r22ConsumeBackslash()",1)[1].split("\n}\n",1)[0]
keyboard=mapcpp.split("void Map::keyboardPress(Action *action, State *state)",1)[1].split("\n}\n",1)[0]
checks={
 "original OXCE backslash is unit deselect":
    "keyBattleDeselectUnit, SDLK_BACKSLASH" in options,
 "R22 does not globally rebind game key":
    'keyBattleDeselectUnit =' not in state and
    'keyBattleDeselectUnit =' not in mapcpp,
 "backslash consumed BEFORE interactive hotkey dispatcher":
    "SDLK_BACKSLASH" in early and "_map->r22ConsumeBackslash()" in early,
 "only consume if F8 and player active":
    "if (!_r22On" in helper and "FACTION_PLAYER" in helper,
 "only consume during native aiming":
    "!native->targeting" in helper and "native->actor!=actor" in helper,
 "only supported weapon target actions":
    all(a in helper for a in
        ["BA_SNAPSHOT","BA_AIMEDSHOT","BA_AUTOSHOT","BA_THROW"]),
 "normal deselect callback still wired":
    "Options::keyBattleDeselectUnit" in state and
    "btnNextStopLClick" in state and "btnNextStopMClick" in state,
 "no actual soldier kneel mutation":
    "_r22Kneel=!current;" in helper and "->kneel(" not in helper,
 "virtual override follows real stance initially":
    "_r22StanceOverride ? _r22Kneel : actor->isKneeled()" in helper,
 "cache refresh after virtual toggle":
    all(x in helper for x in
        ["_r22StatsKey=0;","_r22HullHash=0;","_r22ThrowCacheKey=0;"]),
 "keyboard fallback keeps backslash if directed to Map":
    "key == SDLK_BACKSLASH && r22ConsumeBackslash()" in keyboard,
 "movement clicks still owned by native game":
    "r22PreviewClick" not in state and "_battleGame->primaryAction(pos);" in state,
}
bad=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items():print(("PASS" if ok else "FAIL")+" "+name)
print(f"Backslash precedence checks: {len(checks)-len(bad)}/{len(checks)}")
if bad:raise SystemExit("FAIL BACKSLASH PRECEDENCE: "+", ".join(bad))
