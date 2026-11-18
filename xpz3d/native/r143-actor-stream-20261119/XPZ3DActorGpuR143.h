#pragma once
// R143 native S2 IGScene representation of OXCE-authoritative tactical
// actors. Directional proxy silhouettes, NOT original F11 GLB character rigs.
// No collision, no actions, no visibility inference inside S2.
#include "XPZ3DActorWireR143.h"
#include "MemObject.h"
#include "GView.h"
#include <vector>
#include <math.h>
namespace XPZ3DActorR143 {
class Consumer {
    HANDLE handle_;
    const XPZ3DActorFrameR143* shared_;
    DWORD retryAt_;
public:
    Consumer():handle_(NULL),shared_(NULL),retryAt_(0){}
    ~Consumer(){Reset();}
    void Reset() {
        if(shared_)UnmapViewOfFile(shared_);
        shared_=NULL;
        if(handle_)CloseHandle(handle_);
        handle_=NULL;
    }
    bool Read(XPZ3DActorFrameR143& frame) {
        if(!shared_) {
            const DWORD now=GetTickCount();
            if(retryAt_ && DWORD(now-retryAt_)<250u)return false;
            retryAt_=now;
            handle_=OpenFileMappingA(FILE_MAP_READ,FALSE,XPZ3DActorWireR143::MapName);
            if(!handle_)return false;
            shared_=static_cast<const XPZ3DActorFrameR143*>(
                MapViewOfFile(handle_,FILE_MAP_READ,0,0,sizeof(frame)));
            if(!shared_){Reset();return false;}
        }
        for(unsigned tries=0;tries<3;++tries) {
            const LONG a=shared_->sequence;
            MemoryBarrier();
            if(a&1L)continue;
            memcpy(&frame,shared_,sizeof(frame));
            MemoryBarrier();
            const LONG b=shared_->sequence;
            if(a!=b || (b&1L))continue;
            if(frame.magic!=XPZ3DActorWireR143::Magic ||
               frame.version!=XPZ3DActorWireR143::Version ||
               frame.packetBytes!=sizeof(frame) ||
               !frame.producerPid ||
               frame.count>XPZ3DActorWireR143::MaxActors ||
               !frame.mapWidth || frame.mapWidth>256 ||
               !frame.mapHeight || frame.mapHeight>256 ||
               !frame.mapDepth || frame.mapDepth>16 ||
               DWORD(GetTickCount()-frame.tickMillis)>1250u) {
                // Stale snapshots can hold their producer mapping open.
                // Close our handle so the next read attaches a fresh owner.
                Reset();
                return false;
            }
            return true;
        }
        return false;
    }
};
class NativeActorOverlay {
    CObj<CObjectBase> friendly_,hostile_,neutral_;
    NGScene::IGameView* scene_;
    uint32_t pid_,epoch_,revision_,digest_;
    static uint32_t Digest(const XPZ3DActorFrameR143& p) {
        uint32_t h=2166136261u;
        const uint8_t* data=reinterpret_cast<const uint8_t*>(p.actors);
        for(size_t i=0;i<size_t(p.count)*sizeof(XPZ3DActorRecordR143);++i) {
            h^=data[i];h*=16777619u;
        }
        h^=p.count;h*=16777619u;
        h^=uint32_t(p.selectedUnitId);h*=16777619u;
        return h;
    }
    static void Triangle(std::vector<CVec3>& points,std::vector<STriangle>& faces,
                         const CVec3& a,const CVec3& b,const CVec3& c) {
        const int n=static_cast<int>(points.size());
        if(n>=60000)return;
        points.push_back(a);points.push_back(b);points.push_back(c);
        faces.push_back(STriangle(n,n+1,n+2));
    }
    static void Actor(std::vector<CVec3>& points,std::vector<STriangle>& faces,
                      const XPZ3DActorRecordR143& a) {
        const float tile=1.25f, deck=2.5f;
        const float footprint=float(a.footprint>=1 && a.footprint<=4?a.footprint:1);
        const float x=(float(a.tileX)+footprint*0.5f)*tile;
        const float y=(float(a.tileY)+footprint*0.5f)*tile;
        const float z=float(a.tileZ)*deck+float(a.footOffsetVoxel)*(deck/24.f);
        float height=float(a.heightVoxel)*(deck/24.f);
        if(height<0.5f)height=0.5f;
        if(height>3.f)height=3.f;
        if(a.kneeled)height*=0.72f;
        const float pi=3.14159265358979323846f;
        const float angle=float(a.facing8&7)*(pi/4.f);
        const float fx=sinf(angle),fy=-cosf(angle);
        const float rx=-fy,ry=fx;
        const float width=0.20f*footprint;
        const float depth=0.13f*footprint;
        // Six triangular faces form an upright directional body. The nose
        // points along OXCE facing, rather than assuming an S2 actor rig pose.
        const CVec3 left(x-rx*width-fx*depth,y-ry*width-fy*depth,z+0.06f);
        const CVec3 right(x+rx*width-fx*depth,y+ry*width-fy*depth,z+0.06f);
        const CVec3 back(x-fx*depth*1.8f,y-fy*depth*1.8f,z+height*0.47f);
        const CVec3 nose(x+fx*width*1.8f,y+fy*width*1.8f,z+height*0.53f);
        const CVec3 head(x,y,z+height);
        Triangle(points,faces,left,right,head);
        Triangle(points,faces,right,nose,head);
        Triangle(points,faces,nose,left,head);
        Triangle(points,faces,right,left,back);
        Triangle(points,faces,right,back,head);
        Triangle(points,faces,back,left,head);
    }
    static CObjectBase* MakeMesh(NGScene::IGameView* scene,
                                  const XPZ3DActorFrameR143& p,
                                  uint8_t team,const CVec4& color) {
        std::vector<CVec3> points;
        std::vector<STriangle> triangles;
        points.reserve(size_t(p.count)*18u);
        triangles.reserve(size_t(p.count)*6u);
        for(uint32_t i=0;i<p.count;++i) {
            const XPZ3DActorRecordR143& a=p.actors[i];
            if(a.team!=team || a.unitId==p.selectedUnitId ||
               a.facing8>7 || a.footprint<1 || a.footprint>4 ||
               a.tileX<0 || a.tileY<0 || a.tileZ<0 ||
               uint32_t(a.tileX)>=p.mapWidth ||
               uint32_t(a.tileY)>=p.mapHeight ||
               uint32_t(a.tileZ)>=p.mapDepth)continue;
            Actor(points,triangles,a);
        }
        if(triangles.empty())return 0;
        CPtr<CMemObject> model=new CMemObject;
        model->Create(points,triangles);
        return scene->CreateMesh(model.GetPtr(),color,(CFuncBase<SFBTransform>*)0);
    }
public:
    NativeActorOverlay():scene_(0),pid_(0),epoch_(0),revision_(0),digest_(0){}
    void Reset() {
        friendly_=0;hostile_=0;neutral_=0;
        scene_=0;pid_=epoch_=revision_=digest_=0;
    }
    bool Apply(NGScene::IGameView* scene,const XPZ3DActorFrameR143& p) {
        if(!scene){Reset();return false;}
        if(scene!=scene_ || pid_!=p.producerPid || epoch_!=p.mapEpoch) {
            Reset();
            scene_=scene;pid_=p.producerPid;epoch_=p.mapEpoch;
        }
        const uint32_t digest=Digest(p);
        // Heartbeat changes only the revision/tick, not the geometry.
        if(digest_==digest && revision_!=0)return false;
        friendly_=MakeMesh(scene,p,0,CVec4(0.24f,0.62f,0.72f,1.f));
        hostile_=MakeMesh(scene,p,1,CVec4(0.81f,0.30f,0.23f,1.f));
        neutral_=MakeMesh(scene,p,2,CVec4(0.68f,0.65f,0.36f,1.f));
        revision_=p.revision;digest_=digest;
        return true;
    }
};
}
