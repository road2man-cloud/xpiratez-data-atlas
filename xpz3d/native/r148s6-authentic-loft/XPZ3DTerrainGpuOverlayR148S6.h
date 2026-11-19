#pragma once
// R148S6: authenticated OXCE LOFT occupancy GPU geometry in native S2.
// Geometry is split across multiple mesh buffers: do not silently truncate
// original voxel shapes at the prior 60k-vertex CMemObject limit.
#include "MemObject.h"
#include "GView.h"
#include "XPZ3DTerrainVisualMeshR148S6.h"
#include <map>
#include <stdint.h>
#include <vector>
namespace XPZ3DTerrain {
class NativeGpuOverlay {
    struct DrawnChunk {
        std::vector<CObj<CObjectBase> > floor,walls,objects;
        uint32_t revision;
        bool truncated;
        DrawnChunk():revision(0),truncated(false){}
    };
    std::map<uint64_t,DrawnChunk> chunks_;
    NGScene::IGameView* scene_;
    uint32_t pid_,epoch_,width_,height_,depth_;
    static uint64_t Key(uint32_t x,uint32_t y,uint32_t z) {
        return (uint64_t(z)<<40)|(uint64_t(y)<<20)|uint64_t(x);
    }
    static void Flush(NGScene::IGameView* scene,
                      std::vector<CVec3>& points,
                      std::vector<STriangle>& triangles,
                      const CVec4& color,
                      std::vector<CObj<CObjectBase> >& meshes) {
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
                           const VisualChunk& chunk,uint8_t channel,
                           const CVec4& color,
                           std::vector<CObj<CObjectBase> >& meshes){
        std::vector<CVec3> points;
        std::vector<STriangle> triangles;
        points.reserve(18000);
        triangles.reserve(6000);
        for(size_t i=0;i<chunk.faces.size();++i){
            const VisualTriangle& face=chunk.faces[i];
            if(channel==0 && face.part!=0)continue;
            if(channel==1 && face.part!=1 && face.part!=2)continue;
            if(channel==2 && face.part!=3)continue;
            // 18k vertices per S2 submesh, safely below 16-bit index limits.
            if(points.size()+3u>18000u)
                Flush(scene,points,triangles,color,meshes);
            const int n=static_cast<int>(points.size());
            for(int v=0;v<3;++v)
                points.push_back(CVec3(face.v[v].x,face.v[v].y,face.v[v].z));
            triangles.push_back(STriangle(n,n+1,n+2));
        }
        Flush(scene,points,triangles,color,meshes);
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
           depth_!=packet.mapDepth) {
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
        drawn.floor.clear();drawn.walls.clear();drawn.objects.clear();
        MakeMeshes(scene,chunk,0,CVec4(0.39f,0.43f,0.33f,1.f),drawn.floor);
        MakeMeshes(scene,chunk,1,CVec4(0.63f,0.59f,0.52f,1.f),drawn.walls);
        MakeMeshes(scene,chunk,2,CVec4(0.48f,0.40f,0.29f,1.f),drawn.objects);
        drawn.revision=chunk.revision;
        drawn.truncated=chunk.truncated;
        return true;
    }
};
}
