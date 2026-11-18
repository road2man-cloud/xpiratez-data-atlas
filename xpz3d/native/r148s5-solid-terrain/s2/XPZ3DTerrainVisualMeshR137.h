#pragma once
// R148S5: 3D *volume* for actual discovered OXCE floor, west/north wall,
// and object tiles. OXCE still owns visibility, collision, MCD/LOFT physics,
// doors, fire modes, game actions, line-of-sight and all savegame state.
// Important: MCD IDs identify real game assets, but the volume here is a
// clearly provisional visual stand-in, NOT actual source MCD/LOFT geometry.
#include "XPZ3DTerrainIncrementalR137.h"
#include <vector>
#include <stdint.h>
namespace XPZ3DTerrain {
struct VisualVertex { float x,y,z; };
struct VisualTriangle {
    VisualVertex v[3]; uint16_t mcd,dataset;
    uint8_t part; // 0=floor,1=west wall,2=north wall,3=object
};
struct VisualChunk {
    uint32_t epoch,chunkX,chunkY,deck,revision;
    std::vector<VisualTriangle> faces;
};
inline void AddQuad(VisualChunk& out,const VisualVertex& a,const VisualVertex& b,
                    const VisualVertex& c,const VisualVertex& d,
                    uint16_t mcd,uint16_t dataset,uint8_t part){
    VisualTriangle t1={{a,b,c},mcd,dataset,part};
    VisualTriangle t2={{a,c,d},mcd,dataset,part};
    out.faces.push_back(t1);out.faces.push_back(t2);
}
// Generate a closed six-sided box with consistent outward-facing triangles.
// The private S2 scene retains NO collision or armor interpretation for this.
inline void AddBox(VisualChunk& out,float x0,float y0,float z0,
                   float x1,float y1,float z1,
                   uint16_t mcd,uint16_t dataset,uint8_t part){
    if(!(x1>x0 && y1>y0 && z1>z0))return;
    // Top and bottom (-Z uses opposite winding).
    AddQuad(out,{x0,y0,z1},{x1,y0,z1},{x1,y1,z1},{x0,y1,z1},mcd,dataset,part);
    AddQuad(out,{x0,y1,z0},{x1,y1,z0},{x1,y0,z0},{x0,y0,z0},mcd,dataset,part);
    // Front/back and west/east side walls.
    AddQuad(out,{x0,y0,z0},{x1,y0,z0},{x1,y0,z1},{x0,y0,z1},mcd,dataset,part);
    AddQuad(out,{x1,y1,z0},{x0,y1,z0},{x0,y1,z1},{x1,y1,z1},mcd,dataset,part);
    AddQuad(out,{x0,y1,z0},{x0,y0,z0},{x0,y0,z1},{x0,y1,z1},mcd,dataset,part);
    AddQuad(out,{x1,y0,z0},{x1,y1,z0},{x1,y1,z1},{x1,y0,z1},mcd,dataset,part);
}
// Opaque MCD identifiers do not reveal true voxels or furniture dimensions.
// A stable, tile-local proxy only makes currently-discovered objects visible.
// No noise per frame or procedural movement, so dirty chunks are deterministic.
inline uint32_t ObjectSeed(uint16_t mcd,uint16_t dataset){
    uint32_t h=(uint32_t(mcd)+1u)*2654435761u;
    h^=(uint32_t(dataset)+1u)*2246822519u;
    h^=h>>15;h*=0x85ebca6bu;h^=h>>13;
    return h;
}
inline VisualChunk BuildVisualChunk(const XPZ3DTerrainPacket& p){
    VisualChunk out={};
    out.epoch=p.mapEpoch;out.chunkX=p.chunkX;out.chunkY=p.chunkY;
    out.deck=p.deckZ;out.revision=p.contentRevision;
    // Read-only packet units: 16x16 game voxels per tile X/Y, 24 Z.
    const float tile=1.25f,deck=2.5f;
    const float wallThickness=tile*0.075f;
    const float floorThickness=deck*0.035f;
    out.faces.reserve(8u*8u*28u);
    for(uint32_t y=0;y<8;++y)for(uint32_t x=0;x<8;++x){
        const uint32_t gx=p.chunkX*8+x,gy=p.chunkY*8+y;
        if(gx>=p.mapWidth||gy>=p.mapHeight)continue;
        const XPZ3DTerrainCell& cell=p.cells[y*8+x];
        const float x0=float(gx)*tile,x1=x0+tile;
        const float y0=float(gy)*tile,y1=y0+tile;
        const float z0=float(p.deckZ)*deck-
                       float(cell.terrainLevel)*(deck/24.f);
        const float z1=z0+deck;
        if((cell.flags&1u)&&(cell.discoveredMask&1u) &&
            cell.mcd[0]!=Missing) {
            // A complete thin slab makes tiered terrain visible at a glance.
            AddBox(out,x0,y0,z0-floorThickness,x1,y1,z0,
                   cell.mcd[0],cell.dataset[0],0);
        }
        if((cell.flags&2u)&&(cell.discoveredMask&2u) &&
           !(cell.flags&0x20u) && cell.mcd[1]!=Missing) {
            // West wall occupies only the inside edge of this tile.
            AddBox(out,x0,y0,z0,x0+wallThickness,y1,z1,
                   cell.mcd[1],cell.dataset[1],1);
        }
        if((cell.flags&4u)&&(cell.discoveredMask&4u) &&
           !(cell.flags&0x40u) && cell.mcd[2]!=Missing) {
            // North wall. Keeping 6 faces also prevents camera-side culling.
            AddBox(out,x0,y0,z0,x1,y0+wallThickness,z1,
                   cell.mcd[2],cell.dataset[2],2);
        }
        if((cell.flags&8u)&&(cell.discoveredMask&8u) &&
            !(cell.flags&0x80u) && cell.mcd[3]!=Missing) {
            const uint32_t h=ObjectSeed(cell.mcd[3],cell.dataset[3]);
            // Smaller fixtures / boxes / tall props are visually distinct,
            // but their dimensions are NOT derived from the true LOFT shape.
            const float width=tile*(0.32f+float(h&7u)*0.065f);
            const float depth=tile*(0.32f+float((h>>3)&7u)*0.065f);
            const float height=deck*(0.20f+
                                      float((h>>6)&15u)*0.040f);
            const float cx=(x0+x1)*0.5f,cy=(y0+y1)*0.5f;
            const float iz=z0+deck*0.015f;
            AddBox(out,cx-width*0.5f,cy-depth*0.5f,iz,
                   cx+width*0.5f,cy+depth*0.5f,iz+height,
                   cell.mcd[3],cell.dataset[3],3);
        }
    }
    return out;
}
}
