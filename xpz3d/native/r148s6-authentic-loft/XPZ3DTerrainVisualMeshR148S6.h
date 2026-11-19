#pragma once
// XPZ3D R148S6: exact 16x16x12 MCD/LOFT voxel occupancy -> greedy 3D mesh.
// OXCE TileEngine compares LOFTEMPS[(MapData.loftID[z/2]*16)+y] and bit
// (15-x). This renderer uses that exact occupancy, not hashed geometry.
// Each original LOFT layer spans TWO X-Com Z voxels (24 per map deck).
// The resulting shapes are authentic LOFT COLLISION silhouettes; PCK sprite
// surfaces, transparency and MCD render offsets are still not imported.
#include "XPZ3DTerrainIncrementalR137.h"
#include <vector>
#include <stdint.h>
namespace XPZ3DTerrain {
struct VisualVertex {float x,y,z;};
struct VisualTriangle {
    VisualVertex v[3];uint16_t mcd,dataset;uint8_t part;
};
struct VisualChunk {
    uint32_t epoch,chunkX,chunkY,deck,revision;
    bool truncated;
    std::vector<VisualTriangle> faces;
};
inline void AddQuad(VisualChunk& chunk,const VisualVertex& a,
                    const VisualVertex& b,const VisualVertex& c,
                    const VisualVertex& d,uint16_t mcd,
                    uint16_t dataset,uint8_t part) {
    // Bounded GPU allocation; the overlay splits these into submeshes.
    const size_t cap=50000u;
    if(chunk.faces.size()+2u>cap){chunk.truncated=true;return;}
    const VisualTriangle first={{a,b,c},mcd,dataset,part};
    const VisualTriangle second={{a,c,d},mcd,dataset,part};
    chunk.faces.push_back(first);chunk.faces.push_back(second);
}
inline bool Occupied(const uint16_t mask[12][16],int x,int y,int z) {
    return x>=0 && x<16 && y>=0 && y<16 && z>=0 && z<12 &&
        (mask[z][y] & uint16_t(1u<<(15-x)))!=0;
}
inline VisualVertex Coordinate(const int coord[3],
                               float x,float y,float z) {
    const float xy=1.25f/16.f;
    const float height=2.5f/12.f;
    const VisualVertex p={x+coord[0]*xy,y+coord[1]*xy,
                          z+coord[2]*height};
    return p;
}
// Greedy surfacing fuses contiguous exposed voxel faces on each plane.
// The 12-layer Z dimension uses 2-voxel-high prisms exactly, not a 24
// voxel interpolation guess. Walls, floors and objects use the same rule.
inline void GreedyPart(VisualChunk& out,const uint16_t mask[12][16],
                       float worldX,float worldY,float worldZ,
                       uint16_t mcd,uint16_t dataset,uint8_t part) {
    const int dims[3]={16,16,12};
    for(int axis=0;axis<3 && !out.truncated;++axis){
        const int u=(axis+1)%3, v=(axis+2)%3;
        const int width=dims[u],height=dims[v];
        for(int plane=-1;plane<dims[axis] && !out.truncated;++plane){
            int8_t faces[256]={0};
            for(int j=0;j<height;++j)for(int i=0;i<width;++i){
                int q[3]={0,0,0};
                q[axis]=plane;q[u]=i;q[v]=j;
                const bool inside=Occupied(mask,q[0],q[1],q[2]);
                q[axis]=plane+1;
                const bool outside=Occupied(mask,q[0],q[1],q[2]);
                if(inside!=outside)
                    faces[j*width+i]=inside ? 1:-1;
            }
            for(int j=0;j<height && !out.truncated;++j){
                for(int i=0;i<width && !out.truncated;){
                    const int8_t sign=faces[j*width+i];
                    if(!sign){++i;continue;}
                    int w=1,h=1;
                    while(i+w<width && faces[j*width+i+w]==sign)++w;
                    bool extend=true;
                    while(j+h<height && extend){
                        for(int k=0;k<w;++k)
                            if(faces[(j+h)*width+i+k]!=sign){
                                extend=false;break;
                            }
                        if(extend)++h;
                    }
                    for(int yy=0;yy<h;++yy)
                        for(int xx=0;xx<w;++xx)
                            faces[(j+yy)*width+i+xx]=0;
                    int a[3]={0,0,0};
                    a[axis]=plane+1;a[u]=i;a[v]=j;
                    int b[3]={a[0],a[1],a[2]};
                    int c[3]={a[0],a[1],a[2]};
                    int d[3]={a[0],a[1],a[2]};
                    b[u]+=w;c[u]+=w;c[v]+=h;d[v]+=h;
                    const VisualVertex v0=Coordinate(a,worldX,worldY,worldZ);
                    const VisualVertex v1=Coordinate(b,worldX,worldY,worldZ);
                    const VisualVertex v2=Coordinate(c,worldX,worldY,worldZ);
                    const VisualVertex v3=Coordinate(d,worldX,worldY,worldZ);
                    if(sign>0)AddQuad(out,v0,v1,v2,v3,mcd,dataset,part);
                    else AddQuad(out,v0,v3,v2,v1,mcd,dataset,part);
                    i+=w;
                }
            }
        }
    }
}
inline VisualChunk BuildVisualChunk(const XPZ3DTerrainPacket& p,
                                    const std::vector<uint16_t>& loftRows){
    VisualChunk out={};
    out.epoch=p.mapEpoch;out.chunkX=p.chunkX;out.chunkY=p.chunkY;
    out.deck=p.deckZ;out.revision=p.contentRevision;
    out.truncated=false;
    out.faces.reserve(5000);
    if(loftRows.empty() || loftRows.size()%16u)return out;
    const float tile=1.25f,deck=2.5f;
    for(uint32_t y=0;y<8 && !out.truncated;++y){
        for(uint32_t x=0;x<8 && !out.truncated;++x){
            const uint32_t gx=p.chunkX*8+x,gy=p.chunkY*8+y;
            if(gx>=p.mapWidth || gy>=p.mapHeight)continue;
            const XPZ3DTerrainCell& cell=p.cells[y*8+x];
            // Do NOT offset by terrainLevel: source TileEngine voxel-check
            // uses exact tile 24-voxel deck boundaries, and LOFT itself
            // already defines steps and raised surfaces within that deck.
            const float x0=float(gx)*tile,y0=float(gy)*tile;
            const float z0=float(p.deckZ)*deck;
            for(unsigned part=0;part<4 && !out.truncated;++part){
                const uint8_t bit=uint8_t(1u<<part);
                if(!(cell.flags&bit) || !(cell.discoveredMask&bit) ||
                   cell.mcd[part]==Missing)continue;
                if((part==1 && (cell.flags&0x20u)) ||
                   (part==2 && (cell.flags&0x40u)) ||
                   (part==3 && (cell.flags&0x80u)))continue;
                uint16_t occupancy[12][16]={};
                bool hasAny=false;
                for(int z=0;z<12;++z){
                    const uint16_t loft=cell.loftID[part][z];
                    if(loft==Missing)continue;
                    const size_t row=static_cast<size_t>(loft)*16u;
                    if(row+16u>loftRows.size())continue;
                    for(int j=0;j<16;++j){
                        occupancy[z][j]=loftRows[row+j];
                        hasAny=hasAny || occupancy[z][j]!=0;
                    }
                }
                if(!hasAny)continue;
                GreedyPart(out,occupancy,x0,y0,z0,
                           cell.mcd[part],cell.dataset[part],
                           static_cast<uint8_t>(part));
            }
        }
    }
    return out;
}
} // namespace XPZ3DTerrain
