#!/usr/bin/env python3
"""Repair R22's native input handling without touching gameplay click dispatch.

Applied *after* preview, ballistic, recovery, safety, and throw patches.
F8 toggles drawing only. Normal OXCE map clicks move/select/aim/fire.
Backslash toggles a hypothetical stance ONLY during native active aiming.
A confirmed first-click target is read from native BattleAction.waypoints.
Statistics are drawn only during native targeting, not free roaming.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

PIN="3e722e09b655ab67acfb59fc8585dc70b583826c"
MARK="LOSLOF_R22_NATIVE_INPUT_FIX"

def once(s,old,new):
    n=s.count(old)
    if n!=1:
        raise RuntimeError("Anchor missing/ambiguous (%d): %s"%(n,repr(old[:155])))
    return s.replace(old,new,1)

NEW_KEY=r'''
    // LOSLOF_R22_NATIVE_INPUT_FIX: do NOT intercept map clicks.
    // F8 only toggles passive drawing. Backslash toggles virtual stance
    // while native OXCE is in an actual weapon-targeting state.
    if (action && action->getDetails()->type == SDL_KEYDOWN)
    {
        const SDLKey key = action->getDetails()->key.keysym.sym;
        if (key == SDLK_F8)
        {
            _r22On = !_r22On;
            _r22StanceActor = _save ? _save->getSelectedUnit() : nullptr;
            _r22Kneel = _r22StanceActor ?
                _r22StanceActor->isKneeled() : false;
            _r22StatsKey = 0;
            _r22HullHash = 0;
            _r22StatsText.clear();
            _r22TileRisks.clear();
            _redraw = true;
            return;
        }
        if (key == SDLK_BACKSLASH && _r22On && _save &&
            _save->getSide() == FACTION_PLAYER && _save->getBattleGame())
        {
            BattleAction *native = _save->getBattleGame()->getCurrentAction();
            BattleUnit *actor = _save->getSelectedUnit();
            if (native && native->targeting && actor && native->actor == actor &&
                (native->type == BA_SNAPSHOT || native->type == BA_AIMEDSHOT ||
                 native->type == BA_AUTOSHOT || native->type == BA_THROW))
            {
                if (_r22StanceActor != actor)
                {
                    _r22StanceActor = actor;
                    _r22Kneel = actor->isKneeled();
                }
                _r22Kneel = !_r22Kneel; // virtual only; NO kneel() call.
                _r22StatsKey = 0;
                _r22HullHash = 0;
                _r22ThrowCacheKey = 0;
                _r22StatsText.clear();
                _r22TileRisks.clear();
                _redraw = true;
                return;
            }
        }
    }
'''
CLICK_SNIPPET='''    if (_save->getTile(pos) != 0 && _map->r22PreviewClick(pos,
            _game->isLeftClick(action, true), _game->isRightClick(action, true)))
        return;
'''
INTRO='''// LOSLOF_R22_RECON_PREVIEW.
// This preview is not a replacement for the R21 ballistics, pellet or risk engine.
'''
OLD_OVERLAY_HEAD='''    BattleUnit *soldier = _save->getSelectedUnit();
    if (!soldier || !_save->getTileEngine() || !_camera || _cursorType == CT_NONE)
        return;
    Position cursor;
    getSelectorPosition(&cursor);
    // First click freezes target; after that the cursor represents a hypothetical shooter.'''
NEW_OVERLAY_HEAD='''    BattleUnit *soldier = _save->getSelectedUnit();
    if (!soldier || !_save->getTileEngine() || !_camera || _cursorType == CT_NONE)
        return;
    BattleAction *native = _save->getBattleGame() ?
        _save->getBattleGame()->getCurrentAction() : nullptr;
    const bool nativeAim = native && native->targeting &&
        native->actor == soldier &&
        (native->type == BA_SNAPSHOT || native->type == BA_AIMEDSHOT ||
         native->type == BA_AUTOSHOT || native->type == BA_THROW);
    if (_r22StanceActor != soldier)
    {
        _r22StanceActor = soldier;
        _r22Kneel = soldier->isKneeled();
        _r22StatsKey = 0;
        _r22HullHash = 0;
    }
    Position cursor;
    getSelectorPosition(&cursor);
    // Clicks are owned by native primaryAction(), including movement and
    // optional battleConfirmFireMode's first target-confirmation click.'''

def patch(header,cpp,state):
    if MARK in header or MARK in cpp or MARK in state:
        raise RuntimeError("Native input patch already applied")
    # 1. Remove legacy click interception, so F8 NEVER prevents walking.
    state=once(state,CLICK_SNIPPET,"")
    header=once(header,
        '    bool _r22Locked = false;\n',
        '    // LOSLOF_R22_NATIVE_INPUT_FIX: native aiming has no click lock.\n'
        '    BattleUnit *_r22StanceActor = nullptr;\n')
    header=once(header,
        '    Position _r22Target = Position(-1,-1,-1);\n',"")
    header=once(header,
        '    bool r22PreviewClick(const Position& tile, bool left, bool right);\n',"")
    # Remove the ENTIRE added click handler. Keep Map::r22DrawOverlay().
    begin=cpp.find("bool Map::r22PreviewClick(const Position& tile, bool left, bool right)")
    end=cpp.find("void Map::r22DrawOverlay()",begin)
    if begin < 0 or end <= begin or cpp.count("bool Map::r22PreviewClick(")!=1:
        raise RuntimeError("No unique injected click-handler body to remove")
    cpp=cpp[:begin]+cpp[end:]
    # 2. Reset key handling to native targeting model.
    sig="void Map::keyboardPress(Action *action, State *state)"
    if cpp.count(sig)!=1:raise RuntimeError("Map keyboardPress absent/ambiguous")
    start=cpp.index(sig)
    left=cpp.index("{",start)
    after=cpp.index("InteractiveSurface::keyboardPress(action, state);",left)
    old_keys=cpp[left+1:after]
    if ("key == SDLK_F8" not in old_keys or
        "key == SDLK_BACKSLASH" not in old_keys or
        "SDL_KEYDOWN" not in old_keys):
        raise RuntimeError("Unrecognized keyboard hook; refusing overwrite")
    cpp=cpp[:left+1]+"\n"+NEW_KEY+"\n\t"+cpp[after:]
    # 3. Follow native OXCE selected action and stored confirmed target.
    cpp=once(cpp,OLD_OVERLAY_HEAD,NEW_OVERLAY_HEAD)
    cpp=once(cpp,
        "    const Position source = _r22Locked ? cursor : r22PlannedPosition(soldier);",
        "    const Position source = r22PlannedPosition(soldier);")
    cpp=once(cpp,
        "    const Position target = _r22Locked ? _r22Target : cursor;",
        '''    const Position target = nativeAim && Options::battleConfirmFireMode &&
        !native->waypoints.empty() ? native->waypoints.front() : cursor;''')
    cpp=once(cpp,
        '''    int stanceDelta = (_r22Locked && (_r22Kneel != soldier->isKneeled())) ?
        ((_r22Kneel ? soldier->getKneelHeight() : soldier->getStandHeight())
         - soldier->getHeight()) : 0;''',
        '''    int stanceDelta = (nativeAim && (_r22Kneel != soldier->isKneeled())) ?
        ((_r22Kneel ? soldier->getKneelHeight() : soldier->getStandHeight())
         - soldier->getHeight()) : 0;''')
    cpp=once(cpp,
        '''    if ((_r22Locked || (_save->getPathfinding() && _save->getPathfinding()->isPathPreviewed())) && source.z <= viewZ)''',
        '''    if (source.z <= viewZ)''')
    # Draw LOS/ground preview in free movement mode but NO LOF, stats or HUD.
    cpp=once(cpp,
        '''    r22DrawVisibilityHull(source,eye,viewZ);

    const BattleAction *selectedAction=''',
        '''    r22DrawVisibilityHull(source,eye,viewZ);

    if (!nativeAim)
    {
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22StatsKey = 0;
        _r22SampleCount = 0;
        return; // F8 does not block walking; never show H/B/M outside aiming.
    }

    const BattleAction *selectedAction=''')
    # 4. Reuse the engine's action; only the stance is hypothetical.
    cpp=once(cpp,
        "    if (_r22Locked && _r22Kneel!=shooter->isKneeled())",
        "    if (_r22On && current->targeting && _r22Kneel!=shooter->isKneeled())")
    cpp=once(cpp,
        "    const bool virtualKneeled=_r22Locked ? _r22Kneel : actor->isKneeled();",
        "    const bool virtualKneeled=active->targeting ? _r22Kneel : actor->isKneeled();")
    # 5. One compact HUD line; avoid duplicating H/B/M at edge of screen.
    cpp=once(cpp,
        '''    drawString(2,2,_r22Locked ?
        "LOS/LOF LOCK: cursor=origin; RMB=clear; ;=stance" :
        "LOS/LOF: LMB=lock target; F8=off",160);
    if (target.z != viewZ)
        drawString(2,14,target.z > viewZ ? "TARGET ABOVE VIEW" : "TARGET BELOW VIEW",160);''',
        '''    // Native targeting only: one-line action-relevant HUD.
    if (!_r22StatsText.empty())
    {
        const std::string hud=std::string(_r22Kneel ? "KNEEL  " : "STAND  ") +
            _r22StatsText;
        drawString(2,2,hud.c_str(),160);
    }''')
    cpp=once(cpp,
        '''    if (!_r22StatsText.empty())
        drawString(2,23,_r22StatsText.c_str(),160);''',
        '    // The compact HUD is rendered once by Map::r22DrawOverlay().')
    cpp=once(cpp,
        '''    if(!_r22StatsText.empty()) label<<" "<<_r22StatsText;''',
        '    // Offscreen HUD is direction and Z only; do not duplicate statistics.')
    cpp=once(cpp,
        '''        label << "APPROX ACC " << int(accuracy*100.0+0.5) << "% "''',
        '''        label << "ACC " << int(accuracy*100.0+0.5) << "% "''')
    cpp=once(cpp,
        '''    drawString(2,37,_r22ThrowValid ?
        "THROW ARC: REACHABLE (ACCURACY NOT SAMPLED)" :
        "THROW ARC: BLOCKED / OUT OF RANGE",160);''',
        '''    drawString(2,2,_r22ThrowValid ?
        "THROW: REACHABLE" : "THROW: BLOCKED / RANGE",160);''')
    if "_r22Locked" in cpp or "_r22Target" in cpp or "r22PreviewClick" in cpp:
        raise RuntimeError("Legacy click interception survived in Map.cpp")
    if "r22PreviewClick" in header or "r22PreviewClick" in state:
        raise RuntimeError("Legacy click interception survived in state or header")
    return header,cpp,state

def main():
    a=argparse.ArgumentParser()
    a.add_argument("engine",type=Path)
    a.add_argument("--dry-run",action="store_true")
    args=a.parse_args()
    root=args.engine.resolve()
    paths=[root/"src/Battlescape/Map.h",root/"src/Battlescape/Map.cpp",
           root/"src/Battlescape/BattlescapeState.cpp"]
    ver=root/"src/version.h"
    if not all(f.is_file() for f in paths+[ver]):raise SystemExit("Missing OXCE files")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     ver.read_text(encoding="utf-8")):raise SystemExit("Wrong version")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN:raise SystemExit("Incorrect pinned OXCE SHA: "+sha)
    orig=[p.read_text(encoding="utf-8") for p in paths]
    new=patch(*orig)
    if not args.dry_run:
        for p,s in zip(paths,new):p.write_text(s,encoding="utf-8")
    print(json.dumps({"version":"R22 native-targeting-input BETA","R21_parity":False,
         "files":{p.name:hashlib.sha256(s.encode()).hexdigest() for p,s in zip(paths,new)}},indent=2))

if __name__=="__main__":
    main()
