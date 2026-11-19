#pragma once
// R148S7: true source PCK colour sampling, adaptive chunk materials,
// original R148S6 LOFT collision silhouette. The scene remains visual-only.
// PCK averaged pixel colours are NOT UV texture mapping.
#include "MemObject.h"
#include "GView.h"
#include "XPZ3DTerrainVisualMeshR148S7.h"
#include <map>
#include <stdint.h>
#include <vector>
#include <algorithm>
namespace XPZ3DTerrain {
class NativeGpuOverlay {
    enum { MaxMaterials=16, MaxVerticesPerMesh=18000 };
    struct DrawnChunk {
        std::vector<CObj<CObjectBase> > materials;
        uint32_t revision;
        bool truncated;
        DrawnChunk():revision(0),truncated(false){}
    };
    struct HistogramCell {
        uint32_t rgb;
        uint32_t frequency;
        HistogramCell(uint32_t c,uint32_t f):rgb(c),frequency(f){}
    };
    std::map<uint64_t,DrawnChunk> chunks_;
    NGScene::IGameView* scene_;
    uint32_t pid_,epoch_,width_,height_,depth_;
    static uint64_t Key(uint32_t x,uint32_t y,uint32_t z) {
        return (uint64_t(z)<<40)|(uint64_t(y)<<20)|uint64_t(x);
    }
    static uint32_t Fallback(uint8_t part) {
        switch(part){
            case 0:return 0xff666b56u;
            case 1:case 2:return 0xff9a9080u;
            default:return 0xff7a6750u;
        }
    }
    static uint32_t SourceRGB(const VisualTriangle& face){
        // A high-byte marker signals a source sprite actually contained
        // visible pixels. Do not confuse true-black pixels with missing.
        return (face.pckColor>>24)==0xff ?
            face.pckColor:Fallback(face.part);
    }
    static unsigned R(uint32_t rgb){return (rgb>>16)&0xffu;}
    static unsigned G(uint32_t rgb){return (rgb>>8)&0xffu;}
    static unsigned B(uint32_t rgb){return rgb&0xffu;}
    static uint32_t FromRGB(unsigned r,unsigned g,unsigned b){
        return 0xff000000u|((r&255u)<<16)|((g&255u)<<8)|(b&255u);
    }
    static uint32_t Distance(uint32_t a,uint32_t b){
        const int dr=int(R(a))-int(R(b));
        const int dg=int(G(a))-int(G(b));
        const int db=int(B(a))-int(B(b));
        // Perceptual approximation emphasizes green without clipping.
        return uint32_t(2*dr*dr+4*dg*dg+db*db);
    }
    static size_t Nearest(uint32_t c,const std::vector<uint32_t>& palette){
        size_t match=0;
        uint32_t distance=0xffffffffu;
        for(size_t k=0;k<palette.size();++k){
            const uint32_t score=Distance(c,palette[k]);
            if(score<distance){distance=score;match=k;}
        }
        return match;
    }
    static bool FrequencyDesc(const HistogramCell& a,const HistogramCell& b){
        if(a.frequency!=b.frequency)return a.frequency>b.frequency;
        return a.rgb<b.rgb;
    }
    static std::vector<uint32_t> Palette(const VisualChunk& chunk){
        std::map<uint32_t,uint32_t> frequency;
        for(size_t i=0;i<chunk.faces.size();++i)
            ++frequency[SourceRGB(chunk.faces[i])];
        std::vector<HistogramCell> samples;
        samples.reserve(frequency.size());
        for(std::map<uint32_t,uint32_t>::const_iterator it=frequency.begin();
            it!=frequency.end();++it)
            samples.push_back(HistogramCell(it->first,it->second));
        std::sort(samples.begin(),samples.end(),FrequencyDesc);
        std::vector<uint32_t> colors;
        if(samples.empty())return colors;
        const size_t limit=samples.size()<size_t(MaxMaterials)?samples.size():size_t(MaxMaterials);
        colors.reserve(limit);
        colors.push_back(samples[0].rgb);
        // Weighted farthest point selection preserves both common surfaces
        // and visibly distinct rare terrain colours.
        while(colors.size()<limit){
            size_t best=0;
            uint64_t bestScore=0;
            bool found=false;
            for(size_t i=0;i<samples.size();++i){
                const uint32_t c=samples[i].rgb;
                bool already=false;
                for(size_t j=0;j<colors.size();++j)
                    if(colors[j]==c){already=true;break;}
                if(already)continue;
                const size_t match=Nearest(c,colors);
                const uint64_t score=uint64_t(samples[i].frequency)*
                                     uint64_t(Distance(c,colors[match]));
                if(!found || score>bestScore){
                    best=i;bestScore=score;found=true;
                }
            }
            if(!found)break;
            colors.push_back(samples[best].rgb);
        }
        // Two bounded weighted mean refinements. At most 256 MCD part
        // samples per 8x8 terrain chunk, not a full 3D pixel resample.
        for(int round=0;round<2 && samples.size()>limit;++round){
            uint64_t sr[MaxMaterials]={0},sg[MaxMaterials]={0},
                     sb[MaxMaterials]={0},weight[MaxMaterials]={0};
            for(size_t i=0;i<samples.size();++i){
                const size_t ix=Nearest(samples[i].rgb,colors);
                const uint64_t n=samples[i].frequency;
                sr[ix]+=n*R(samples[i].rgb);
                sg[ix]+=n*G(samples[i].rgb);
                sb[ix]+=n*B(samples[i].rgb);
                weight[ix]+=n;
            }
            for(size_t i=0;i<colors.size();++i){
                if(!weight[i])continue;
                colors[i]=FromRGB(
                    unsigned(sr[i]/weight[i]),unsigned(sg[i]/weight[i]),
                    unsigned(sb[i]/weight[i]));
            }
        }
        return colors;
    }
    static void Flush(NGScene::IGameView* scene,
                      std::vector<CVec3>& points,
                      std::vector<STriangle>& triangles,
                      const CVec4& color,
                      std::vector<CObj<CObjectBase> >& meshes){
        if(triangles.empty())return;
        CPtr<CMemObject> model=new CMemObject;
        model->Create(points,triangles);
        CObj<CObjectBase> drawn=
            scene->CreateMesh(model.GetPtr(),color,
                              (CFuncBase<SFBTransform>*)0);
        meshes.push_back(drawn);
        points.clear();triangles.clear();
    }
    static void MakeMeshes(NGScene::IGameView* scene,
                           const VisualChunk& chunk,
                           std::vector<CObj<CObjectBase> >& output) {
        const std::vector<uint32_t> palette=Palette(chunk);
        if(palette.empty())return;
        std::vector<CVec3> vertices[MaxMaterials];
        std::vector<STriangle> triangles[MaxMaterials];
        const size_t count=palette.size();
        for(size_t i=0;i<chunk.faces.size();++i) {
            const VisualTriangle& face=chunk.faces[i];
            const size_t group=Nearest(SourceRGB(face),palette);
            std::vector<CVec3>& points=vertices[group];
            std::vector<STriangle>& faces=triangles[group];
            const uint32_t rgb=palette[group];
            const CVec4 color(float(R(rgb))/255.f,
                              float(G(rgb))/255.f,
                              float(B(rgb))/255.f,1.f);
            if(points.size()+3u>MaxVerticesPerMesh)
                Flush(scene,points,faces,color,output);
            const int offset=static_cast<int>(points.size());
            for(int v=0;v<3;++v)
                points.push_back(CVec3(face.v[v].x,face.v[v].y,face.v[v].z));
            faces.push_back(STriangle(offset,offset+1,offset+2));
        }
        for(size_t i=0;i<count;++i){
            const uint32_t rgb=palette[i];
            const CVec4 color(float(R(rgb))/255.f,
                              float(G(rgb))/255.f,
                              float(B(rgb))/255.f,1.f);
            Flush(scene,vertices[i],triangles[i],color,output);
        }
    }
public:
    NativeGpuOverlay():scene_(0),pid_(0),epoch_(0),
                       width_(0),height_(0),depth_(0){}
    void Reset(){
        chunks_.clear();
        scene_=0;pid_=epoch_=width_=height_=depth_=0;
    }
    size_t ChunkCount()const{return chunks_.size();}
    bool SyncSession(NGScene::IGameView* scene,
                     const XPZ3DTerrainPacket& packet){
        if(!scene){if(scene_||!chunks_.empty())Reset();return false;}
        if(scene_!=scene || pid_!=packet.producerPid ||
           epoch_!=packet.mapEpoch ||
           width_!=packet.mapWidth || height_!=packet.mapHeight ||
           depth_!=packet.mapDepth){
            Reset();scene_=scene;pid_=packet.producerPid;
            epoch_=packet.mapEpoch;width_=packet.mapWidth;
            height_=packet.mapHeight;depth_=packet.mapDepth;
        }
        return true;
    }
    bool Apply(NGScene::IGameView* scene,
               const XPZ3DTerrainPacket& packet,const VisualChunk& chunk){
        if(!SyncSession(scene,packet))return false;
        DrawnChunk& drawn=chunks_[Key(chunk.chunkX,chunk.chunkY,chunk.deck)];
        if(drawn.revision>=chunk.revision)return false;
        drawn.materials.clear();
        MakeMeshes(scene,chunk,drawn.materials);
        drawn.revision=chunk.revision;
        drawn.truncated=chunk.truncated;
        return true;
    }
};
}
