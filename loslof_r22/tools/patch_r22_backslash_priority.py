#!/usr/bin/env python3
"""Resolve OXCE 8.6.0's built-in SDLK_BACKSLASH deselect hotkey conflict.

OXCE binds keyBattleDeselectUnit to SDLK_BACKSLASH by default; a Map-only
handler can trigger deselection too, depending on State::handle's UI dispatch.
Intercept ONLY backslash while F8 ON and a *native* fire/throw targeting action
is active, before State::handle distributes to hotkey-enabled buttons.
Outside that context, return to native input unchanged.
Requires all earlier R22 recovery patches, including native_targeting.py.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

PIN="3e722e09b655ab67acfb59fc8585dc70b583826c"
MARK="LOSLOF_R22_BACKSLASH_PRIORITY"

def once(s,old,new):
    n=s.count(old)
    if n!=1:raise RuntimeError("Expected one anchor, got %d: %r"%(n,old[:125]))
    return s.replace(old,new,1)

METHOD=r'''
// LOSLOF_R22_BACKSLASH_PRIORITY
// State::handle(Action*) calls this BEFORE forwarding key presses to native
// buttons. At other times SDLK_BACKSLASH retains its original deselect action.
bool Map::r22ConsumeBackslash()
{
    if (!_r22On || !_save || _save->getSide() != FACTION_PLAYER ||
        !_save->getBattleGame() || _cursorType == CT_NONE)
        return false;
    BattleAction *native=_save->getBattleGame()->getCurrentAction();
    BattleUnit *actor=_save->getSelectedUnit();
    if (!native || !native->targeting || !actor || native->actor!=actor ||
        (native->type!=BA_SNAPSHOT && native->type!=BA_AIMEDSHOT &&
         native->type!=BA_AUTOSHOT && native->type!=BA_THROW))
        return false;
    if (_r22StanceActor!=actor)
    {
        _r22StanceActor=actor;
        _r22StanceOverride=false;
    }
    const bool current=_r22StanceOverride ? _r22Kneel : actor->isKneeled();
    _r22Kneel=!current; // VIRTUAL only: never calls the game kneel action.
    _r22StanceOverride=true;
    _r22StatsKey=0;
    _r22HullHash=0;
    _r22ThrowCacheKey=0;
    _r22StatsText.clear();
    _r22TileRisks.clear();
    _redraw=true;
    return true;
}

'''

def end_of_braced_if(s,start):
    first=s.index("{",start)
    depth=0
    for i in range(first,len(s)):
        c=s[i]
        if c=="{":depth+=1
        elif c=="}":
            depth-=1
            if depth==0:return i+1
    raise RuntimeError("Unbalanced native backslash handler")

def patch(maph,cpp,state,options):
    if MARK in maph or MARK in cpp or MARK in state:
        raise RuntimeError("Already patched")
    if 'keyBattleDeselectUnit, SDLK_BACKSLASH' not in options:
        raise RuntimeError("Pinned OXCE default hotkey no longer backslash")
    maph=once(maph,
        '\tvoid keyboardPress(Action *action, State *state) override;',
        '\tvoid keyboardPress(Action *action, State *state) override;\n'
        '\t/// Consume backslash only during native aim; otherwise keep unit deselect.\n'
        '\tbool r22ConsumeBackslash();')
    oldstart="        if (key == SDLK_BACKSLASH && _r22On && _save &&"
    if cpp.count(oldstart)!=1:raise RuntimeError("Unexpected Map backslash hook")
    start=cpp.index(oldstart)
    end=end_of_braced_if(cpp,start)
    code=cpp[start:end]
    for expected in ("_r22StanceOverride","native->targeting","_r22Kneel","_r22StatsKey"):
        if expected not in code:raise RuntimeError("Old handler's semantics changed")
    cpp=cpp[:start]+'''        if (key == SDLK_BACKSLASH && r22ConsumeBackslash())
            return;'''+cpp[end:]
    # Method can be used both by early BattlescapeState routing and
    # keyboardPress fallback (if that path is called directly by a UI).
    cpp=once(cpp,
        'void Map::keyboardPress(Action *action, State *state)',
        METHOD+'void Map::keyboardPress(Action *action, State *state)')
    marker='''inline void BattlescapeState::handle(Action *action)
{
\tif (!_firstInit)
\t{'''
    updated=marker+'''
        // LOSLOF_R22_BACKSLASH_PRIORITY: the native "\u005c" key normally
        // deselects soldiers. While aiming with F8, use it for VIRTUAL
        // stand/kneel instead and stop here BEFORE native button hotkeys.
        if (action && _map && action->getDetails()->type == SDL_KEYDOWN &&
            action->getDetails()->key.keysym.sym == SDLK_BACKSLASH &&
            _map->r22ConsumeBackslash())
            return;'''
    state=once(state,marker,updated)
    if cpp.count("bool Map::r22ConsumeBackslash()")!=1:raise RuntimeError("Missing Map helper")
    if state.index("_map->r22ConsumeBackslash()")>state.index("State::handle(action);",state.index("inline void BattlescapeState::handle(")):
        raise RuntimeError("State hotkey handling occurs too late")
    return maph,cpp,state

def main():
    a=argparse.ArgumentParser()
    a.add_argument("root",type=Path)
    a.add_argument("--dry-run",action="store_true")
    args=a.parse_args()
    root=args.root.resolve()
    paths=[root/"src/Battlescape/Map.h",root/"src/Battlescape/Map.cpp",
           root/"src/Battlescape/BattlescapeState.cpp"]
    ver=root/"src/version.h"
    options=root/"src/Engine/Options.cpp"
    if not all(f.is_file() for f in paths+[ver,options]):
        raise SystemExit("Missing pinned OXCE files")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     ver.read_text(encoding="utf-8")):
        raise SystemExit("Incorrect OXCE release")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN:raise SystemExit("Engine commit mismatch: "+sha)
    old=[p.read_text(encoding="utf-8") for p in paths]
    new=patch(*old,options.read_text(encoding="utf-8"))
    if not args.dry_run:
        for p,s in zip(paths,new):p.write_text(s,encoding="utf-8")
    print(json.dumps({"status":"NATIVE_BACKSLASH_PRIORITY_BETA",
        "game_click_paths":"UNMODIFIED","parity_R21":"UNVERIFIED",
        "files":{str(p.relative_to(root)):hashlib.sha256(s.encode()).hexdigest()
                 for p,s in zip(paths,new)}},indent=2))

if __name__=="__main__":
    main()
