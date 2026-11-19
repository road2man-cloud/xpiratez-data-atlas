#pragma once
// Include inside OXCE BattlescapeState.cpp after game Tile/SavedBattleGame headers.
// No new collision or raycast implementation; reads only authoritative tile data.
#include "XPZ3DTerrainIncrementalR137.h"
namespace OpenXcom {
struct XPZ3DTerrainSession {
    XPZ3DTerrain::IncrementalPublisher publisher;
    SavedBattleGame* current;
    uint32_t epoch;
    XPZ3DTerrainSession():current(0),epoch(GetTickCount()|1u){}
};
inline XPZ3DTerrainSession& XPZ3DSession() {
    static XPZ3DTerrainSession state;
    return state;
}
// Explicitly called when a new BattlescapeState is constructed. This also
// handles allocator address reuse when loading a different saved battle.
inline void XPZ3DBeginTerrainBattle(SavedBattleGame* save) {
    XPZ3DTerrainSession& s=XPZ3DSession();
    s.current=save; ++s.epoch;
}
inline void XPZ3DPublishLiveTerrain(SavedBattleGame *save) {
    if(!save)return;
    XPZ3DTerrainSession& s=XPZ3DSession();
    if(s.current!=save){s.current=save;++s.epoch;}
    int focusX=-1,focusY=-1,focusZ=-1;
    if(const BattleUnit* selected=save->getSelectedUnit()){
        const Position pos=selected->getPosition();
        focusX=pos.x;focusY=pos.y;focusZ=pos.z;
    }
    s.publisher.Tick(s.epoch,save->getMapSizeX(),save->getMapSizeY(),save->getMapSizeZ(),
        [save](uint32_t x,uint32_t y,uint32_t z,XPZ3DTerrainCell& dest) {
            Tile *tile=save->getTile(Position((int)x,(int)y,(int)z));
            if(!tile)return;
            const TilePart parts[4]={O_FLOOR,O_WESTWALL,O_NORTHWALL,O_OBJECT};
            for(int i=0;i<4;++i) {
                if(!tile->getMapData(parts[i]) || !tile->isDiscovered(parts[i]))continue;
                int mcd=-1,ds=-1;
                tile->getMapData(&mcd,&ds,parts[i]);
                if(mcd>=0 && mcd<65535 && ds>=0 && ds<65535) {
                    dest.mcd[i]=(uint16_t)mcd;
                    dest.dataset[i]=(uint16_t)ds;
                    dest.flags |= (uint8_t)(1u<<i);
                    // Exact original OXCE MapData LOFT, not a box proxy.
                    // Only discovered parts may enter the visual transport.
                    const MapData* partData=tile->getMapData(parts[i]);
                    for(int layer=0;layer<12;++layer) {
                        const int loft=partData->getLoftID(layer);
                        if(loft>=0 && loft<65535)
                            dest.loftID[i][layer]=static_cast<uint16_t>(loft);
                    }
                    // Upper bits are authoritative UFO door-open state.
                    // MCD tile ID alone does not change during door animation.
                    if(tile->isUfoDoorOpen(parts[i]))
                        dest.flags |= (uint8_t)(1u<<(i+4));
                }
                if(tile->isDiscovered(parts[i]))dest.discoveredMask|=(uint8_t)(1u<<i);
            }
            dest.terrainLevel=(int16_t)tile->getTerrainLevel();
        },focusX,focusY,focusZ);
}
}
