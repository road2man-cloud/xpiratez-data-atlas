#pragma once
// XPZ3D R148S7: derive approximate native 3D material colours from actual
// in-memory OXCE PCK terrain sprite pixels and tactical screen palette.
// Source sprite data is read-only; OXCE remains the sole game authority.
//
// This is a PCK-derived 4-region colour approximation, NOT PCK UV texturing.
// Transparent palette index 0 never contributes. A zero packed value means
// "no usable PCK sample" and S2 uses its visual fallback material.
#include "MapData.h"
#include "MapDataSet.h"
#include "SurfaceSet.h"
#include "Surface.h"
#include <SDL.h>
#include <map>
#include <stdint.h>
namespace OpenXcom {
namespace XPZ3DPCKR148S7 {
struct Appearance {
    uint32_t rgb[4];
    Appearance(){rgb[0]=rgb[1]=rgb[2]=rgb[3]=0;}
};
class Sampler {
    std::map<const MapData*,Appearance> cache_;
public:
    void Reset(){cache_.clear();}
    Appearance Sample(const MapData* map,const SDL_Color* palette){
        Appearance empty;
        if(!map||!palette)return empty;
        const auto previous=cache_.find(map);
        if(previous!=cache_.end())return previous->second;
        Appearance result;
        const MapDataSet* set=map->getDataset();
        const SurfaceSet* sheets=set?set->getSurfaceset():0;
        const Surface* sprite=0;
        if(sheets && map->getSprite(0)>=0)
            sprite=sheets->getFrame(map->getSprite(0));
        if(sprite){
            const int width=sprite->getWidth();
            const int height=sprite->getHeight();
            if(width>0 && height>0 && width<=256 && height<=256){
                uint64_t sumR[4]={0},sumG[4]={0},sumB[4]={0};
                uint32_t count[4]={0};
                uint64_t globalR=0,globalG=0,globalB=0;
                uint32_t total=0;
                // Fixed bounded sampling (at most 1024 pixels per tile
                // sprite), performed once per MapData rather than per tick.
                const int strideX=width>64?4:width>32?2:1;
                const int strideY=height>64?4:height>32?2:1;
                for(int y=0;y<height;y+=strideY){
                    for(int x=0;x<width;x+=strideX){
                        const uint8_t index=sprite->getPixel(x,y);
                        if(index==0)continue;
                        const SDL_Color& color=palette[index];
                        const int region=(x*2>=width?1:0)|
                                         (y*2>=height?2:0);
                        sumR[region]+=color.r;
                        sumG[region]+=color.g;
                        sumB[region]+=color.b;
                        ++count[region];
                        globalR+=color.r;globalG+=color.g;
                        globalB+=color.b;++total;
                    }
                }
                if(total>0)for(int region=0;region<4;++region){
                    const uint32_t n=count[region]?count[region]:total;
                    const uint32_t r=uint32_t(
                        (count[region]?sumR[region]:globalR)/n);
                    const uint32_t g=uint32_t(
                        (count[region]?sumG[region]:globalG)/n);
                    const uint32_t b=uint32_t(
                        (count[region]?sumB[region]:globalB)/n);
                    result.rgb[region]=0xff000000u|
                        (r<<16)|(g<<8)|b;
                }
            }
        }
        // No colour data: cache the failure to avoid repeated PCK scans.
        cache_.insert(std::make_pair(map,result));
        return result;
    }
};
inline Sampler& Shared(){static Sampler sampler;return sampler;}
} // namespace XPZ3DPCKR148S7
} // namespace OpenXcom
