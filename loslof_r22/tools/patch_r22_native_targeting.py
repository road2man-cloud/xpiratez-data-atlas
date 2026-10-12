#!/usr/bin/env python3
"""Repair R22's native input handling without touching gameplay click dispatch.

Applied *after* preview, ballistic, recovery, safety, and throw patches.
F8 toggles drawing only. Normal OXCE map clicks move/select/aim/fire.
Backslash toggles a hypothetical stance ONLY during native active aiming.
A confirmed first-click target is read from native BattleAction.waypoints;
after that first click the cursor is a virtual shooter origin, never a new
preview target. The native second-click behavior is untouched.
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
            _r22StanceOverride = false;
            _r22Kneel = _r22StanceActor ?
                _r22StanceActor->isKneeled() : false;
            _r22StatsKey = 0;
            _r22HullHash = 0;
            _r22ThrowCacheKey = 0;
            _r22ThrowTrajectory.clear();
            _r22ThrowValid = false;
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
                    _r22StanceOverride = false;
                }
                const bool current = _r22StanceOverride ?
                    _r22Kneel : actor->isKneeled();
                _r22Kneel = !current; // virtual only; NO kneel() call.
                _r22StanceOverride = true;
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
    if (!soldier || !_save->getTileEngine() || !_camera)
        return;
    BattleAction *native = _save->getBattleGame() ?
        _save->getBattleGame()->getCurrentAction() : nullptr;
    // A hidden cursor means a projectile is firing, a turn is resolving,
    // or another native action owns input. Retire stale preview caches first.
    const bool nativeAim = _cursorType != CT_NONE && native &&
        native->targeting && native->weapon &&
        native->actor == soldier &&
        (native->type == BA_SNAPSHOT || native->type == BA_AIMEDSHOT ||
         native->type == BA_AUTOSHOT || native->type == BA_THROW);
    if (_r22StanceActor != soldier)
    {
        _r22StanceActor = soldier;
        _r22StanceOverride = false;
        _r22Kneel = soldier->isKneeled();
        _r22StatsKey = 0;
        _r22HullHash = 0;
    }
    // Movement remains native. Keep planned LOS only during an actual path
    // preview; do NOT calculate gun rays or probabilities on a move cursor.
    if (!nativeAim)
    {
        _r22StanceOverride = false;
        _r22StatsKey = 0;
        _r22ThrowCacheKey = 0;
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22SampleCount = 0;
        if (_cursorType == CT_NONE) return;
        Pathfinding *finder = _save->getPathfinding();
        if (finder && finder->isPathPreviewed())
        {
            const Position planned = r22PlannedPosition(soldier);
            Tile *tile = _save->getTile(planned);
            if (tile)
            {
                const Position eye(planned.x*16+8, planned.y*16+8,
                    planned.z*24-tile->getTerrainLevel()+
                    soldier->getHeight()+soldier->getFloatHeight()-1);
                r22DrawVisibilityHull(planned,eye,_camera->getViewLevel());
            }
        }
        return;
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
        '    BattleUnit *_r22StanceActor = nullptr;\n'
        '    bool _r22StanceOverride = false;\n')
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
    # In native Confirm Fire, the FIRST click locks the intended target.
    # From then on, the moving cursor is a VIRTUAL FIRING ORIGIN, not a new
    # target. Prior to first click the cursor is the normal aiming target.
    # No mouse input is intercepted: clicking elsewhere still uses OXCE's
    # original retargeting behavior, and clicking the locked target fires.
    cpp=once(cpp,
        "    const Position source = _r22Locked ? cursor : r22PlannedPosition(soldier);",
        '''    const bool confirmedTarget = Options::battleConfirmFireMode &&
        !native->sprayTargeting && !native->waypoints.empty();
    // A first-click cursor still resting on its target must retain the HUD:
    // fall back to the true soldier position rather than trying a zero-length ray.
    const Position target = confirmedTarget ? native->waypoints.front() : cursor;
    const Position source = (confirmedTarget && cursor != target) ?
        cursor : r22PlannedPosition(soldier);''')
    # Keep the selected firing mode and its relativeOrigin (centre/left/right).
    # Constructing a fake SNAPSHOT action silently gave AUTO/AIMED the wrong
    # muzzle offset for weapons with non-centre origins.
    cpp=once(cpp,
        '''    BattleAction testAction;
    testAction.actor = soldier;
    testAction.target = target;
    testAction.type = BA_SNAPSHOT;''',
        '''    BattleAction testAction = *native; // read-only action snapshot
    testAction.actor = soldier;
    testAction.target = target;''')

    # Immediately after the first click the cursor is usually still on the
    # marked target. Do not sample a zero-length "shot from target to itself".
    # An unexplored cursor position is not a valid hypothetical fire origin.
    cpp=once(cpp,
        "    Tile *startTile = _save->getTile(source);",
        '''    Tile *startTile = _save->getTile(source);
    if (confirmedTarget && cursor != target &&
        startTile && !startTile->isDiscovered(O_FLOOR))
    {
        _r22StatsKey = 0;
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22SampleCount = 0;
        return;
    }''')

    cpp=once(cpp,
        '''    int stanceDelta = (_r22Locked && (_r22Kneel != soldier->isKneeled())) ?
        ((_r22Kneel ? soldier->getKneelHeight() : soldier->getStandHeight())
         - soldier->getHeight()) : 0;''',
        '''    int stanceDelta = (_r22StanceOverride && (_r22Kneel != soldier->isKneeled())) ?
        ((_r22Kneel ? soldier->getKneelHeight() : soldier->getStandHeight())
         - soldier->getHeight()) : 0;''')
    cpp=once(cpp,
        '''    if ((_r22Locked || (_save->getPathfinding() && _save->getPathfinding()->isPathPreviewed())) && source.z <= viewZ)''',
        '''    if (source.z <= viewZ)''')
    # 4. Reuse the engine's action; only the stance is hypothetical.
    cpp=once(cpp,
        "    if (_r22Locked && _r22Kneel!=shooter->isKneeled())",
        "    if (_r22StanceOverride && _r22Kneel!=shooter->isKneeled())")
    cpp=once(cpp,
        "    const bool virtualKneeled=_r22Locked ? _r22Kneel : actor->isKneeled();",
        "    const bool virtualKneeled=_r22StanceOverride ? _r22Kneel : actor->isKneeled();")
    # 5. One compact HUD line; avoid duplicating H/B/M at edge of screen.
    cpp=once(cpp,
        '''    drawString(2,2,_r22Locked ?
        "LOS/LOF LOCK: cursor=origin; RMB=clear; ;=stance" :
        "LOS/LOF: LMB=lock target; F8=off",160);
    if (target.z != viewZ)
        drawString(2,14,target.z > viewZ ? "TARGET ABOVE VIEW" : "TARGET BELOW VIEW",160);''',
        '''    // Native targeting only: one compact information line.
    if (!_r22StatsText.empty())
    {
        std::ostringstream hud;
        const bool simulated = _r22StanceOverride &&
            (_r22Kneel != soldier->isKneeled());
        if (simulated) hud << "SIM ";
        hud << ((simulated ? _r22Kneel : soldier->isKneeled()) ?
            "KNEEL" : "STAND");
        hud << " | " << _r22StatsText;
        const std::string line=hud.str();
        drawString(2,2,line.c_str(),160);
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
        '''        label << "ACC~" << int(accuracy*100.0+0.5) << "% "''')
    # No continuously forced full-map repaints for unfinished Monte Carlo
    # and LOS hull work. Schedule capped refreshes from the native map ticker.
    cpp=once(cpp,
        '''	_obstacleTimer->think(0, this);
}''',
        '''	_obstacleTimer->think(0, this);
    if (_r22On && _save && _save->getSide() == FACTION_PLAYER &&
        _cursorType != CT_NONE &&
        ((_r22StatsKey != 0 && _r22SampleCount < 1024U) ||
         _r22HullWorkPending))
    {
        const Uint32 tick = SDL_GetTicks();
        if (tick - _r22LastUiRefresh >= 90U)
        {
            _r22LastUiRefresh = tick;
            _redraw = true;
        }
    }
}''')
    header=once(header,
        '    bool _r22StanceOverride = false;\n',
        '    bool _r22StanceOverride = false;\n'
        '    Uint32 _r22LastUiRefresh = 0; // at most one incremental redraw per 90ms\n')

    cpp=once(cpp,
        '''    drawString(2,37,_r22ThrowValid ?
        "THROW ARC: REACHABLE (ACCURACY NOT SAMPLED)" :
        "THROW ARC: BLOCKED / OUT OF RANGE",160);''',
        '''    std::ostringstream arc;
    if (_r22StanceOverride && virtualKneeled != actor->isKneeled())
        arc << "SIM ";
    arc << (virtualKneeled ? "KNEEL" : "STAND")
        << (_r22ThrowValid ? " | THROW OK" : " | THROW BLOCKED");
    const std::string arcLine=arc.str();
    drawString(2,2,arcLine.c_str(),160);''')
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
