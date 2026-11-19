#pragma once
// R148S5: native S2 GPU visual-only solid floor/wall and object proxies.
// OXCE is authoritative for tile existence, discovery and door state.
// This does NOT use actual MCD/LOFT shapes and adds no collision, AI or combat logic.
#include "MemObject.h"
#include "GView.h"
#include "XPZ3DTerrainVisualMeshR137.h"
#include <map>
#include <stdint.h>
#include <vector>

namespace XPZ3DTerrain {
class NativeGpuOverlay {
    struct DrawnChunk {
        CObj<CObjectBase> floor;
        CObj<CObjectBase> walls;
        CObj<CObjectBase> objects;
        uint32_t revision;
        DrawnChunk():revision(0){}
    };
    std::map<uint64_t,DrawnChunk> chunks_;
    NGScene::IGameView* scene_;
    uint32_t pid_,epoch_,width_,height_,depth_;
    static uint64_t Key(uint32_t x,uint32_t y,uint32_t z) {
        return (uint64_t(z)<<40)|(uint64_t(y)<<20)|uint64_t(x);
    }
    static CObjectBase* MakeMesh(NGScene::IGameView* scene,
                                  const VisualChunk& chunk,
                                  uint8_t bucket,const CVec4& color) {
        std::vector<CVec3> points;
        std::vector<STriangle> triangles;
        points.reserve(chunk.faces.size()*3);
        triangles.reserve(chunk.faces.size());
        for(size_t i=0;i<chunk.faces.size();++i){
            const VisualTriangle& face=chunk.faces[i];
            if(bucket==0 && face.part!=0)continue;
            if(bucket==1 && face.part!=1 && face.part!=2)continue;
            if(bucket==2 && face.part!=3)continue;
            const int n=(int)points.size();
            if(n>=60000)break;
            for(int k=0;k<3;++k)
                points.push_back(CVec3(face.v[k].x,face.v[k].y,face.v[k].z));
            triangles.push_back(STriangle(n,n+1,n+2));
        }
        if(triangles.empty())return 0;
        CPtr<CMemObject> model=new CMemObject;
        model->Create(points,triangles);
        // CGameView::CreateMesh creates native IGScene geometry and material.
        return scene->CreateMesh(model.GetPtr(),color,
                                 (CFuncBase<SFBTransform>*)0);
    }
public:
    NativeGpuOverlay():scene_(0),pid_(0),epoch_(0),width_(0),height_(0),depth_(0){}
    void Reset() {
        chunks_.clear();scene_=0;pid_=epoch_=width_=height_=depth_=0;
    }
    size_t ChunkCount()const{return chunks_.size();}
    // Called for EVERY valid transport packet, including empty chunks.
    // The prior implementation only reset on an accepted changed chunk,
    // allowing old battlefield geometry to survive an empty map transition.
    bool SyncSession(NGScene::IGameView* scene,const XPZ3DTerrainPacket& packet) {
        if(!scene) { if(scene_ || !chunks_.empty())Reset(); return false; }
        if(scene_!=scene || pid_!=packet.producerPid || epoch_!=packet.mapEpoch ||
           width_!=packet.mapWidth || height_!=packet.mapHeight ||
           depth_!=packet.mapDepth) {
            Reset();scene_=scene;pid_=packet.producerPid;epoch_=packet.mapEpoch;
            width_=packet.mapWidth;height_=packet.mapHeight;depth_=packet.mapDepth;
        }
        return true;
    }
    bool Apply(NGScene::IGameView* scene,const XPZ3DTerrainPacket& packet,
               const VisualChunk& chunk) {
        if(!SyncSession(scene,packet))return false;
        DrawnChunk& drawn=chunks_[Key(chunk.chunkX,chunk.chunkY,chunk.deck)];
        if(drawn.revision>=chunk.revision)return false; // stale/duplicate packets never rebuild GPU
        // Three independent material channels reduce overdraw and clarify
        // cover as a volume. All are temporary, read-only visual stand-ins.
        drawn.floor=MakeMesh(scene,chunk,0,CVec4(0.37f,0.42f,0.31f,1.f));
        drawn.walls=MakeMesh(scene,chunk,1,CVec4(0.64f,0.60f,0.54f,1.f));
        drawn.objects=MakeMesh(scene,chunk,2,CVec4(0.45f,0.40f,0.31f,1.f));
        drawn.revision=chunk.revision;
        return true;
    }
};
}
