#pragma once
// XPZ3D R148S11: in-scene tactical orientation markers based EXCLUSIVELY on
// the authoritative OXCE R143 actor snapshot (including OXCE fog filtering).
// Zero gameplay writes: no new enemy visibility, save edits, AI or collision.
// Selected soldier: blue floor ring and facing arrow. Other allies: dim cyan
// rings. Visible hostiles: red ring + overhead diamond. Visible neutrals:
// ochre ring. The native S2 scene still renders original LOFT/PCK and F11 rig.
#include "XPZ3DActorWireR143.h"
#include "MemObject.h"
#include "GView.h"
#include <vector>
#include <math.h>
#include <stdint.h>
#include <string.h>

namespace XPZ3DTacticalR148S11 {

struct Surface {
    std::vector<CVec3> vertices;
    std::vector<STriangle> triangles;
};
inline void Triangle(Surface& s,const CVec3& a,
                     const CVec3& b,const CVec3& c) {
    if(s.vertices.size()+3u>59997u)return;
    const int start=static_cast<int>(s.vertices.size());
    s.vertices.push_back(a);s.vertices.push_back(b);s.vertices.push_back(c);
    s.triangles.push_back(STriangle(start,start+1,start+2));
}
inline void DoubleSided(Surface& s,const CVec3& a,
                        const CVec3& b,const CVec3& c) {
    Triangle(s,a,b,c);
    Triangle(s,c,b,a);
}
inline float Clamp(float a,float lo,float hi) {
    return a<lo?lo:a>hi?hi:a;
}
inline void Ring(Surface& out,float x,float y,float z,
                 float radius,float thickness) {
    const float pi=3.14159265358979323846f;
    const int segments=16;
    for(int segment=0;segment<segments;++segment) {
        const float t0=(2.f*pi*float(segment))/float(segments);
        const float t1=(2.f*pi*float(segment+1))/float(segments);
        const float ir=radius-thickness;
        const CVec3 a(x+radius*cosf(t0),y+radius*sinf(t0),z);
        const CVec3 b(x+radius*cosf(t1),y+radius*sinf(t1),z);
        const CVec3 c(x+ir*cosf(t1),y+ir*sinf(t1),z);
        const CVec3 d(x+ir*cosf(t0),y+ir*sinf(t0),z);
        DoubleSided(out,a,b,c);
        DoubleSided(out,a,c,d);
    }
}
inline void Arrow(Surface& out,float x,float y,float z,
                  float radius,uint8_t facing) {
    const float angle=float(facing&7)*0.7853981633974483f;
    const float dx=sinf(angle),dy=-cosf(angle);
    const float rx=-dy,ry=dx;
    const float r=radius;
    const CVec3 head(x+dx*(r+0.42f),y+dy*(r+0.42f),z);
    const CVec3 left(x+dx*(r+0.08f)-rx*0.18f,
                     y+dy*(r+0.08f)-ry*0.18f,z);
    const CVec3 right(x+dx*(r+0.08f)+rx*0.18f,
                      y+dy*(r+0.08f)+ry*0.18f,z);
    DoubleSided(out,head,left,right);
}
inline void OverheadDiamond(Surface& out,float x,float y,float top,
                            float size) {
    // Raised, double-sided tetrahedral warning symbol, not an enemy model.
    const CVec3 peak(x,y,top+size);
    const CVec3 bottom(x,y,top-size);
    const CVec3 north(x,y-size,top);
    const CVec3 east(x+size,y,top);
    const CVec3 south(x,y+size,top);
    const CVec3 west(x-size,y,top);
    DoubleSided(out,peak,north,east);
    DoubleSided(out,peak,east,south);
    DoubleSided(out,peak,south,west);
    DoubleSided(out,peak,west,north);
    DoubleSided(out,bottom,east,north);
    DoubleSided(out,bottom,south,east);
    DoubleSided(out,bottom,west,south);
    DoubleSided(out,bottom,north,west);
}
inline bool Valid(const XPZ3DActorFrameR143& p,
                  const XPZ3DActorRecordR143& a) {
    return a.team<=2 && a.facing8<8 && a.footprint>=1 && a.footprint<=4 &&
        a.tileX>=0 && a.tileY>=0 && a.tileZ>=0 &&
        uint32_t(a.tileX)<p.mapWidth && uint32_t(a.tileY)<p.mapHeight &&
        uint32_t(a.tileZ)<p.mapDepth;
}
inline void BuildMarker(const XPZ3DActorFrameR143& p,
                        const XPZ3DActorRecordR143& a,Surface& out) {
    const bool selected=a.unitId==p.selectedUnitId && a.team==0;
    const float footprint=float(a.footprint);
    const float tile=1.25f,deck=2.5f;
    const float x=(float(a.tileX)+footprint*0.5f)*tile;
    const float y=(float(a.tileY)+footprint*0.5f)*tile;
    const float z=float(a.tileZ)*deck+
                  float(a.footOffsetVoxel)*(deck/24.f)+0.045f;
    const float radius=(selected?0.40f:(a.team==1?0.34f:0.29f))*
                       Clamp(footprint,1.f,3.f);
    const float thickness=selected?0.08f:0.042f;
    Ring(out,x,y,z,radius,thickness);
    if(selected)Arrow(out,x,y,z+0.008f,radius,a.facing8);
    if(a.team==1) {
        const float height=Clamp(float(a.heightVoxel)*(deck/24.f),
                                 0.6f,3.2f);
        OverheadDiamond(out,x,y,z+height+0.16f,0.14f);
    }
}
inline bool MarkersEnabled() {
    static int value=-1;
    if(value==-1) {
        char setting[12]={0};
        const DWORD chars=GetEnvironmentVariableA(
            "XPZ3D_R148S11_TACTICAL_MARKERS",setting,sizeof(setting));
        value=(chars==1 && setting[0]=='0')?0:1;
    }
    return value==1;
}
class NativeOverlay {
    CObj<CObjectBase> selected_,allied_,hostile_,neutral_;
    NGScene::IGameView* scene_;
    uint32_t pid_,epoch_,digest_;
    bool rendered_;
    static uint32_t Digest(const XPZ3DActorFrameR143& p){
        uint32_t h=2166136261u;
        const uint8_t* data=reinterpret_cast<const uint8_t*>(p.actors);
        for(size_t i=0;i<size_t(p.count)*sizeof(XPZ3DActorRecordR143);++i){
            h^=data[i];h*=16777619u;
        }
        h^=uint32_t(p.selectedUnitId);h*=16777619u;
        h^=p.count;h*=16777619u;
        return h;
    }
    static CObjectBase* MakeMesh(NGScene::IGameView* scene,
                                 const Surface& s,const CVec4& color) {
        if(s.triangles.empty())return 0;
        CPtr<CMemObject> model=new CMemObject;
        model->Create(s.vertices,s.triangles);
        return scene->CreateMesh(
            model.GetPtr(),color,(CFuncBase<SFBTransform>*)0);
    }
public:
    NativeOverlay():scene_(0),pid_(0),epoch_(0),digest_(0),rendered_(false){}
    void Reset(){
        selected_=0;allied_=0;hostile_=0;neutral_=0;
        scene_=0;pid_=epoch_=digest_=0;rendered_=false;
    }
    bool Apply(NGScene::IGameView* scene,const XPZ3DActorFrameR143& p){
        if(!scene){Reset();return false;}
        if(!MarkersEnabled()){
            if(rendered_)Reset();
            return false;
        }
        if(scene_!=scene || pid_!=p.producerPid || epoch_!=p.mapEpoch){
            Reset();scene_=scene;pid_=p.producerPid;epoch_=p.mapEpoch;
        }
        const uint32_t digest=Digest(p);
        if(rendered_ && digest==digest_)return false;
        Surface selected,allies,enemies,neutrals;
        for(uint32_t i=0;i<p.count;++i){
            const XPZ3DActorRecordR143& a=p.actors[i];
            if(!Valid(p,a))continue;
            if(a.team==0){
                if(a.unitId==p.selectedUnitId)
                    BuildMarker(p,a,selected);
                else BuildMarker(p,a,allies);
            } else if(a.team==1)BuildMarker(p,a,enemies);
            else BuildMarker(p,a,neutrals);
        }
        selected_=MakeMesh(scene,selected,CVec4(0.18f,0.84f,0.96f,1.f));
        allied_=MakeMesh(scene,allies,CVec4(0.28f,0.62f,0.60f,1.f));
        hostile_=MakeMesh(scene,enemies,CVec4(0.94f,0.24f,0.18f,1.f));
        neutral_=MakeMesh(scene,neutrals,CVec4(0.87f,0.72f,0.28f,1.f));
        digest_=digest;rendered_=true;
        return true;
    }
};
} // namespace XPZ3DTacticalR148S11
