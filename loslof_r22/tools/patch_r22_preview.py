#!/usr/bin/env python3
"""R22 reconstruction preview slice for exact OXCE 8.6.0 (not R21 parity).
Strictly fail-closed; no probability or risk calculations claimed.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

UPSTREAM = "3e722e09b655ab67acfb59fc8585dc70b583826c"
TAG = "LOSLOF_R22_RECON_PREVIEW"

def once(s, old, new):
    if s.count(old) != 1:
        raise RuntimeError("anchor absent/ambiguous: " + repr(old[:100]))
    return s.replace(old, new, 1)

def body(s, signature):
    m = list(re.finditer(re.escape(signature) + r"\s*\{", s))
    if len(m) != 1:
        raise RuntimeError("function absent/ambiguous: " + signature)
    opening = s.index("{", m[0].start())
    level, state, i = 0, "code", opening
    while i < len(s):
        c = s[i]
        nextc = s[i+1] if i+1 < len(s) else ""
        if state == "line":
            if c == "\n": state = "code"
        elif state == "block":
            if c == "*" and nextc == "/": i += 1; state = "code"
        elif state in ('"', "'"):
            if c == "\\": i += 1
            elif c == state: state = "code"
        elif c == "/" and nextc == "/": i += 1; state = "line"
        elif c == "/" and nextc == "*": i += 1; state = "block"
        elif c in ('"', "'"): state = c
        elif c == "{": level += 1
        elif c == "}":
            level -= 1
            if level == 0: return opening, i
        i += 1
    raise RuntimeError("unbalanced function: " + signature)

def inject(s, signature, addition, start=False):
    a, b = body(s, signature)
    where = a+1 if start else b
    return s[:where] + "\n" + addition + "\n" + s[where:]

FIELDS = r'''
    // LOSLOF_R22_RECON_PREVIEW: map-local, default OFF, not persisted.
    bool _r22On = false;
    bool _r22Locked = false;
    bool _r22Kneel = false;
    Position _r22Target = Position(-1,-1,-1);
    void r22DrawOverlay();
'''
PUBLIC = r'''
    /// Consume map click only when the preview is active. Never fires a weapon.
    bool r22PreviewClick(const Position& tile, bool left, bool right);
'''
KEY = r'''
    if (action && action->getDetails()->type == SDL_KEYDOWN)
    {
        SDLKey key = action->getDetails()->key.keysym.sym;
        if (key == SDLK_F8)
        {
            _r22On = !_r22On;
            _r22Locked = false;
            _redraw = true;
            return;
        }
        if (_r22On && _r22Locked && (key == SDLK_SEMICOLON || key == SDLK_BACKSLASH))
        {
            _r22Kneel = !_r22Kneel;
            _redraw = true;
            return;
        }
        if (_r22On && _r22Locked && (key == SDLK_LEFTBRACKET || key == SDLK_RIGHTBRACKET))
            return;
    }
'''
DRAW = r'''
    if (_r22On && _save && _camera && _save->getSide() == FACTION_PLAYER && _save->getSelectedUnit())
        r22DrawOverlay();
'''
STATE = r'''
    if (_save->getTile(pos) != 0 && _map->r22PreviewClick(pos,
            _game->isLeftClick(action, true), _game->isRightClick(action, true)))
        return;
'''
METHODS = r'''
// LOSLOF_R22_RECON_PREVIEW.
// This preview is not a replacement for the R21 ballistics, pellet or risk engine.
bool Map::r22PreviewClick(const Position& tile, bool left, bool right)
{
    if (!_r22On || !_save || _save->getSide() != FACTION_PLAYER || !_save->getSelectedUnit())
        return false;
    if (right)
    {
        if (!_r22Locked) return false;
        _r22Locked = false;
        _redraw = true;
        return true;
    }
    if (!left) return false;
    if (!_r22Locked)
    {
        _r22Target = tile;
        _r22Kneel = _save->getSelectedUnit()->isKneeled();
        _r22Locked = true;
    }
    _redraw = true;
    return true;
}

void Map::r22DrawOverlay()
{
    BattleUnit *soldier = _save->getSelectedUnit();
    if (!soldier || !_save->getTileEngine() || !_camera || _cursorType == CT_NONE)
        return;
    Position cursor;
    getSelectorPosition(&cursor);
    // First click freezes target; after that the cursor represents a hypothetical shooter.
    const Position source = _r22Locked ? cursor : soldier->getPosition();
    const Position target = _r22Locked ? _r22Target : cursor;
    Tile *startTile = _save->getTile(source);
    Tile *targetTile = _save->getTile(target);
    if (!startTile || !targetTile) return;
    const int viewZ = _camera->getViewLevel();
    const int width = _save->getMapSizeX(), length = _save->getMapSizeY();
    int stanceDelta = (_r22Locked && (_r22Kneel != soldier->isKneeled())) ?
        (_r22Kneel ? -4 : 4) : 0;
    const Position eye(source.x*16+8, source.y*16+8,
        source.z*24 - startTile->getTerrainLevel() +
        soldier->getHeight() + soldier->getFloatHeight() - 1 + stanceDelta);
    int aimHeight = targetTile->getUnit() ?
        std::max(3, targetTile->getUnit()->getHeight()/2) : 12;
    const Position goal(target.x*16+8, target.y*16+8,
        target.z*24-targetTile->getTerrainLevel()+aimHeight);
    std::vector<Position> vision;
    _save->getTileEngine()->calculateLineVoxel(eye, goal, true, &vision, soldier);

    // Tile-centred floor projection. Exactly one pixel per visited tile.
    std::set<int> seen;
    for (const Position& voxel : vision)
    {
        if (voxel.x < 0 || voxel.y < 0 || voxel.z < 0) continue;
        const int tx=voxel.x/16, ty=voxel.y/16, tz=voxel.z/24;
        if (tx>=width || ty>=length || tz>=_save->getMapSizeZ() || tz>viewZ) continue;
        if (!seen.insert((tz*length+ty)*width+tx).second) continue;
        Tile *t = _save->getTile(Position(tx,ty,tz));
        if (!t) continue;
        Position xy;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,
            tz*24-t->getTerrainLevel()+1), &xy);
        setPixel(xy.x,xy.y,48);
    }

    BattleAction testAction;
    testAction.actor = soldier;
    testAction.target = target;
    testAction.type = BA_SNAPSHOT;
    Position muzzle = _save->getTileEngine()->getOriginVoxel(testAction, startTile);
    muzzle.z += stanceDelta;
    std::vector<Position> bullet;
    VoxelType collision = _save->getTileEngine()->calculateLineVoxel(muzzle,goal,true,&bullet,soldier);
    seen.clear();
    for (const Position& voxel : bullet)
    {
        if (voxel.x < 0 || voxel.y < 0 || voxel.z < 0) continue;
        const int tx=voxel.x/16, ty=voxel.y/16, tz=voxel.z/24;
        if (tx>=width || ty>=length || tz>=_save->getMapSizeZ() || tz>viewZ) continue;
        if (!seen.insert((tz*length+ty)*width+tx).second) continue;
        Tile *t = _save->getTile(Position(tx,ty,tz));
        if (!t) continue;
        Position xy;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,
            tz*24-t->getTerrainLevel()+1), &xy);
        setPixel(xy.x+1,xy.y,73);
    }
    if (_r22Locked && source.z <= viewZ)
    {
        const Position v(source.x*16, source.y*16,
            source.z*24-startTile->getTerrainLevel()+1);
        Position corners[4] = {v, v+Position(16,0,0),v+Position(16,16,0),v+Position(0,16,0)};
        Position xy[4];
        for (int i=0;i<4;++i) _camera->convertVoxelToScreen(corners[i], &xy[i]);
        for (int i=0;i<4;++i)
            drawLine(xy[i].x,xy[i].y,xy[(i+1)%4].x,xy[(i+1)%4].y,160);
    }
    if (collision != V_EMPTY && !bullet.empty())
    {
        Position xy;
        _camera->convertVoxelToScreen(bullet.back(), &xy);
        drawLine(xy.x-2,xy.y-2,xy.x+2,xy.y+2,32);
        drawLine(xy.x-2,xy.y+2,xy.x+2,xy.y-2,32);
    }
    drawString(2,2,_r22Locked ?
        "LOS/LOF LOCK: cursor=origin; RMB=clear; ;=stance" :
        "LOS/LOF: LMB=lock target; F8=off",160);
    if (target.z != viewZ)
        drawString(2,14,target.z > viewZ ? "TARGET ABOVE VIEW" : "TARGET BELOW VIEW",160);
}
'''

def patch(header, cpp, state, version):
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise RuntimeError("incorrect OXCE version")
    if any(TAG in src for src in (header,cpp,state)):
        raise RuntimeError("duplicate patch")
    header=once(header,'\tvoid drawTerrain(Surface *surface);',
                '\tvoid drawTerrain(Surface *surface);\n'+FIELDS)
    header=once(header,'\tvoid getSelectorPosition(Position *pos) const;',
                '\tvoid getSelectorPosition(Position *pos) const;\n'+PUBLIC)
    cpp=once(cpp,'#include "Map.h"','#include "Map.h"\n#include <set>')
    cpp=inject(cpp,'void Map::keyboardPress(Action *action, State *state)',KEY,True)
    cpp=inject(cpp,'void Map::draw()',DRAW)
    cpp=once(cpp,'\nvoid Map::refreshAIProgress(int progress)',METHODS+
        '\nvoid Map::refreshAIProgress(int progress)')
    a,b=body(state,'void BattlescapeState::mapClick(Action *action)')
    fragment=state[a:b]
    fragment=once(fragment,'\tif (_save->getTile(pos) != 0) // don\'t allow to click into void',
         STATE+'\n\tif (_save->getTile(pos) != 0) // don\'t allow to click into void')
    state=state[:a]+fragment+state[b:]
    return (header,cpp,state)

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("root",type=Path)
    cli.add_argument("--dry-run",action="store_true")
    args=cli.parse_args()
    root=args.root.resolve()
    paths=[root/"src/Battlescape/Map.h",root/"src/Battlescape/Map.cpp",
           root/"src/Battlescape/BattlescapeState.cpp"]
    version=root/"src/version.h"
    if not all(f.is_file() for f in paths+[version]):
        raise SystemExit("Missing OXCE files")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=UPSTREAM:
            raise SystemExit("Wrong OXCE SHA: "+sha)
        if subprocess.check_output(["git","-C",str(root),"status","--porcelain"],text=True).strip():
            raise SystemExit("Dirty OXCE checkout")
    original=[p.read_text(encoding="utf-8") for p in paths]
    updated=patch(*original,version.read_text(encoding="utf-8"))
    manifest={"upstream":UPSTREAM,"label":"R22-reconstruction-UNVERIFIED",
        "files":[{"name":str(p.relative_to(root)),
         "sha_before":hashlib.sha256(before.encode()).hexdigest(),
         "sha_after":hashlib.sha256(after.encode()).hexdigest()}
         for p,before,after in zip(paths,original,updated)]}
    if not args.dry_run:
        for p,changed in zip(paths,updated): p.write_text(changed,encoding="utf-8")
    print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
