#!/usr/bin/env python3
"""Fail-closed regression tests: F8 must not steal native mouse clicks.

Static source tests only. A real XPiratez session must still verify:
move without aiming, normal single-click fire, confirm-fire first/second click,
virtual kneel on backslash and the HUD on actual aim state.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
read=lambda name:(root/name).read_text(encoding="utf-8")
mapcpp=read("src/Battlescape/Map.cpp")
maph=read("src/Battlescape/Map.h")
state=read("src/Battlescape/BattlescapeState.cpp")
main=read("src/Battlescape/BattlescapeGame.cpp")
keyboard=mapcpp.split("void Map::keyboardPress(Action *action, State *state)",1)[1].split(
    "\n}\n",1)[0]
overlay=mapcpp.split("void Map::r22DrawOverlay()",1)[1].split("\n}\n",1)[0]
stats=mapcpp.split("void Map::r22DrawStats(",1)[1].split("\n}\n",1)[0]

checks={
    "click interception removed from BattlescapeState": "r22PreviewClick" not in state,
    "click handler removed from Map": "r22PreviewClick" not in maph and "r22PreviewClick" not in mapcpp,
    "native movement primaryAction intact": "_battleGame->primaryAction(pos);" in state,
    "native secondaryAction intact": "_battleGame->secondaryAction(pos);" in state,
    "native map input allowed regardless F8": "if (_r22On)" not in state,
    "native confirm fire first click retained": "Options::battleConfirmFireMode" in main
        and "_currentAction.waypoints.push_back(pos);" in main,
    "map follows game action's first-click target": "native->waypoints.front()" in overlay
        and "Options::battleConfirmFireMode" in overlay,
    "map only reads native targeting flag": "const bool nativeAim" in overlay
        and "native->targeting" in overlay,
    "map never creates alternate click lock": "_r22Locked" not in mapcpp
        and "_r22Target" not in mapcpp and "_r22Locked" not in maph,
    "F8 is just default-off overlay switch": "bool _r22On = false;" in maph
        and "_r22On = !_r22On;" in keyboard,
    "backslash uses actual SDLK_BACKSLASH": "key == SDLK_BACKSLASH" in keyboard,
    "backslash toggles only while native aiming": "native->targeting" in keyboard
        and "native->actor == actor" in keyboard,
    "virtual stance not game stance": "_r22Kneel = !_r22Kneel;" in keyboard
        and "->kneel(" not in keyboard,
    "virtual stance affects actual voxel height": "int stanceDelta = (nativeAim" in overlay
        and "soldier->getKneelHeight()" in overlay,
    "virtual stance affects HBM accuracy": "current->targeting && _r22Kneel" in stats,
    "preserve LOS when moving": "r22DrawVisibilityHull(source,eye,viewZ);" in overlay,
    "no HBM during movement": "if (!nativeAim)" in overlay
        and "return; // F8 does not block walking" in overlay,
    "native shot conditional HUD": "if (!_r22StatsText.empty())" in overlay
        and "drawString(2,2,hud.c_str(),160);" in overlay,
    "HUD includes virtual STAND or KNEEL": '"KNEEL  "' in overlay and '"STAND  "' in overlay,
    "old text instructions removed": "LOS/LOF LOCK:" not in mapcpp
        and "LMB=lock target" not in mapcpp,
    "stats HUD rendered once": "drawString(2,23,_r22StatsText.c_str()" not in mapcpp,
    "no offscreen duplicate HBM": 'label<<" "<<_r22StatsText' not in mapcpp,
    "native game click state not rewritten": "getCurrentAction()->targeting =" not in state,
    "normal OXCE map click remains installed": "void BattlescapeState::mapClick(Action *action)" in state,
}
failures=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items():print(("PASS" if ok else "FAIL")+" "+name)
print(f"Native targeting input guards: {len(checks)-len(failures)}/{len(checks)}")
if failures:raise SystemExit("FAILED native input: "+", ".join(failures))
