#pragma once
// XPZ3D R147: actual 63-joint, 4-weight glTF skinning in the native S2 IGScene.
// Native S2 uses this for VISUALS only. The game rules, AI, visibility, TU,
// collision, unit ID and authoritative positions remain with OXCE.
// Gait is procedural from OXCE's observed movement/stance (not glTF animation).
#include "XPZ3DActorWireR143.h"
#include "MemObject.h"
#include "GView.h"
#include <algorithm>
#include <map>
#include <vector>
#include <stdint.h>
#include <stdio.h>
#include <stddef.h>
#include <math.h>
#include <float.h>
#include <string.h>

namespace XPZ3DF11R147 {
#pragma pack(push,1)
struct SkinHeader {
    char magic[8];
    uint32_t version,headerBytes,triangleCount,materialCount,boneCount;
    unsigned char sourceSha256[32];
    float minXYZ[3],maxXYZ[3];
};
struct SkinBone {
    int16_t parent;
    uint16_t reserved;
    float localTranslation[3],localRotation[4],inverseBind[16];
};
struct SkinVertex { float xyz[3];uint8_t joints[4];float weights[4]; };
struct SkinTriangle {uint8_t material,padding[3];SkinVertex v[3];};
#pragma pack(pop)
static_assert(sizeof(SkinHeader)==84,"R147 skinned header ABI mismatch");
static_assert(sizeof(SkinBone)==96,"R147 skinned bone ABI mismatch");
static_assert(sizeof(SkinVertex)==32,"R147 skinned vertex ABI mismatch");
static_assert(sizeof(SkinTriangle)==100,"R147 skinned triangle ABI mismatch");
enum {BoneCount=63,MaterialCount=8,MaxF11Actors=3,MaxTriangles=20000};
class Asset {
    bool attempted_,valid_;
    SkinHeader header_;
    SkinBone bones_[BoneCount];
    std::vector<SkinTriangle> triangles_;
    Asset():attempted_(false),valid_(false) {
        memset(&header_,0,sizeof(header_));memset(bones_,0,sizeof(bones_));
    }
public:
    static Asset& Shared(){static Asset a;return a;}
    const SkinHeader& Header()const{return header_;}
    const SkinBone* Bones()const{return bones_;}
    const std::vector<SkinTriangle>& Triangles()const{return triangles_;}
    bool Ready() {
        if(attempted_)return valid_;
        attempted_=true;
        char path[1024]={0};
        DWORD n=GetEnvironmentVariableA("XPZ3D_R147_F11_SKIN",path,sizeof(path));
        if(!n || n>=sizeof(path))strcpy(path,"assets\\f11_r34q.skin");
        FILE* file=fopen(path,"rb");
        if(!file)return false;
        SkinHeader h={};
        bool good=fread(&h,1,sizeof(h),file)==sizeof(h) &&
            memcmp(h.magic,"XPZF11S2",8)==0 && h.version==2 &&
            h.headerBytes==sizeof(h) &&
            h.triangleCount>0 && h.triangleCount<=MaxTriangles &&
            h.materialCount>0 && h.materialCount<=MaterialCount &&
            h.boneCount==BoneCount;
        if(good) {
            for(int k=0;k<3;++k) {
                if(!_finite(h.minXYZ[k]) || !_finite(h.maxXYZ[k]) ||
                    h.minXYZ[k]>h.maxXYZ[k] || fabsf(h.minXYZ[k])>1000.f ||
                    fabsf(h.maxXYZ[k])>1000.f)good=false;
            }
            if(h.maxXYZ[2]-h.minXYZ[2]<0.3f)good=false;
        }
        if(good)good=fread(bones_,sizeof(SkinBone),BoneCount,file)==BoneCount;
        if(good) {
            for(int j=0;j<BoneCount && good;++j) {
                const SkinBone& b=bones_[j];
                if(b.parent>=j || b.parent< -1)good=false;
                for(int c=0;c<3;++c)if(!_finite(b.localTranslation[c]))good=false;
                for(int c=0;c<4;++c)if(!_finite(b.localRotation[c]))good=false;
                for(int c=0;c<16;++c)if(!_finite(b.inverseBind[c]))good=false;
            }
        }
        if(good) {
            triangles_.resize(h.triangleCount);
            good=fread(triangles_.data(),sizeof(SkinTriangle),h.triangleCount,file)
                ==h.triangleCount;
            if(good && fgetc(file)!=EOF)good=false;
            for(size_t i=0;i<triangles_.size() && good;++i) {
                const SkinTriangle& t=triangles_[i];
                if(t.material>=h.materialCount)good=false;
                for(int v=0;v<3 && good;++v) {
                    const SkinVertex& vertex=t.v[v];
                    float total=0.f;
                    for(int j=0;j<3;++j) {
                        if(!_finite(vertex.xyz[j]) ||
                            fabsf(vertex.xyz[j])>1000.f)good=false;
                    }
                    for(int j=0;j<4;++j) {
                        if(vertex.joints[j]>=BoneCount ||
                           !_finite(vertex.weights[j]) ||
                           vertex.weights[j]<0.f ||
                           vertex.weights[j]>1.01f)good=false;
                        total+=vertex.weights[j];
                    }
                    if(total<0.99f || total>1.01f)good=false;
                }
            }
        }
        fclose(file);
        if(!good){triangles_.clear();return false;}
        header_=h;valid_=true;return true;
    }
};
inline bool Eligible(const XPZ3DActorFrameR143& frame,
                     const XPZ3DActorRecordR143& a) {
    return a.team==0 && a.unitId!=frame.selectedUnitId &&
        a.facing8<8 && a.footprint>=1 && a.footprint<=4 &&
        a.tileX>=0 && a.tileY>=0 && a.tileZ>=0 &&
        uint32_t(a.tileX)<frame.mapWidth &&
        uint32_t(a.tileY)<frame.mapHeight &&
        uint32_t(a.tileZ)<frame.mapDepth;
}
inline bool Chosen(const XPZ3DActorFrameR143& frame,
                   const XPZ3DActorRecordR143& wanted) {
    if(!Eligible(frame,wanted))return false;
    // R147: prefer allies near the currently selected, first-person unit.
    // The earlier "first N in roster" rule often selected off-screen units.
    int cx=0,cy=0,cz=0;
    bool hasCenter=false;
    for(uint32_t i=0;i<frame.count;++i) {
        const XPZ3DActorRecordR143& a=frame.actors[i];
        if(a.unitId==frame.selectedUnitId) {
            cx=a.tileX;cy=a.tileY;cz=a.tileZ;
            hasCenter=true;
            break;
        }
    }
    if(!hasCenter) {
        // A selected unit can be temporarily absent in an empty roster.
        // Fall back to stable ID ordering instead of claiming a camera.
        unsigned rank=0;
        for(uint32_t i=0;i<frame.count;++i) {
            const XPZ3DActorRecordR143& a=frame.actors[i];
            if(Eligible(frame,a) && a.unitId<wanted.unitId)++rank;
        }
        return rank<MaxF11Actors;
    }
    const int dx=int(wanted.tileX)-cx;
    const int dy=int(wanted.tileY)-cy;
    const int dz=int(wanted.tileZ)-cz;
    const int score=dx*dx+dy*dy+4*dz*dz;
    unsigned ahead=0;
    for(uint32_t i=0;i<frame.count;++i) {
        const XPZ3DActorRecordR143& a=frame.actors[i];
        if(!Eligible(frame,a) || a.unitId==wanted.unitId)continue;
        const int x=int(a.tileX)-cx,y=int(a.tileY)-cy,z=int(a.tileZ)-cz;
        const int other=x*x+y*y+4*z*z;
        if(other<score || (other==score && a.unitId<wanted.unitId))
            ++ahead;
    }
    return ahead<MaxF11Actors;
}
struct Matrix {
    float m[16];
    Matrix(){memset(m,0,sizeof(m));m[0]=m[5]=m[10]=m[15]=1.f;}
};
inline Matrix Multiply(const Matrix& a,const Matrix& b) {
    Matrix out;
    for(int col=0;col<4;++col)
        for(int row=0;row<4;++row) {
            float s=0;
            for(int k=0;k<4;++k)s+=a.m[k*4+row]*b.m[col*4+k];
            out.m[col*4+row]=s;
        }
    return out;
}
inline Matrix JointLocal(const SkinBone& bone,float angle,float zDrop) {
    Matrix a;
    float x=bone.localRotation[0],y=bone.localRotation[1];
    float z=bone.localRotation[2],w=bone.localRotation[3];
    a.m[0]=1-2*(y*y+z*z);
    a.m[1]=2*(x*y+z*w);
    a.m[2]=2*(x*z-y*w);
    a.m[4]=2*(x*y-z*w);
    a.m[5]=1-2*(x*x+z*z);
    a.m[6]=2*(y*z+x*w);
    a.m[8]=2*(x*z+y*w);
    a.m[9]=2*(y*z-x*w);
    a.m[10]=1-2*(x*x+y*y);
    a.m[12]=bone.localTranslation[0];
    a.m[13]=bone.localTranslation[1];
    a.m[14]=bone.localTranslation[2]-zDrop;
    if(fabsf(angle)<0.00001f)return a;
    Matrix bend;
    const float c=cosf(angle),s=sinf(angle);
    bend.m[5]=c;bend.m[6]=s;
    bend.m[9]=-s;bend.m[10]=c;
    return Multiply(a,bend);
}
inline Matrix FromArray(const float m[16]) {
    Matrix a;memcpy(a.m,m,sizeof(a.m));return a;
}
inline void Transform(const Matrix& m,const float point[3],float out[3]) {
    const float x=point[0],y=point[1],z=point[2];
    out[0]=m.m[0]*x+m.m[4]*y+m.m[8]*z+m.m[12];
    out[1]=m.m[1]*x+m.m[5]*y+m.m[9]*z+m.m[13];
    out[2]=m.m[2]*x+m.m[6]*y+m.m[10]*z+m.m[14];
}
// R148S4: authoritative logical tile positions are never changed. This state
// is purely a visual interpolation cursor for the native S2 triangle mesh.
struct MotionState {
    int16_t x,y,z;
    float fromX,fromY,fromZ;
    float fromFoot,foot;
    float fromFacing,toFacing;
    DWORD lastMovement,lastFacingChange;
    float phase;
    bool initialized;
    MotionState():x(0),y(0),z(0),fromX(0),fromY(0),fromZ(0),
                  fromFoot(0),foot(0),fromFacing(0),toFacing(0),
                  lastMovement(0),lastFacingChange(0),phase(0.f),
                  initialized(false){}
};
// A bounded smoothstep avoids tile teleportation but never extrapolates
// positions into unrevealed cells or reads future movement commands.
inline float SmoothFraction(DWORD now,DWORD began,DWORD duration) {
    if(!began || duration==0)return 1.f;
    const DWORD elapsed=DWORD(now-began);
    const float t=elapsed>=duration?1.f:float(elapsed)/float(duration);
    return t*t*(3.f-2.f*t);
}
inline void DisplayPosition(const MotionState& s,DWORD now,
                            float& x,float& y,float& z,float& foot) {
    const float t=SmoothFraction(now,s.lastMovement,190u);
    x=s.fromX+(float(s.x)-s.fromX)*t;
    y=s.fromY+(float(s.y)-s.fromY)*t;
    z=s.fromZ+(float(s.z)-s.fromZ)*t;
    foot=s.fromFoot+(s.foot-s.fromFoot)*t;
}
inline float DisplayFacing(const MotionState& s,DWORD now) {
    const float t=SmoothFraction(now,s.lastFacingChange,150u);
    return s.fromFacing+(s.toFacing-s.fromFacing)*t;
}
inline void ObserveActor(MotionState& s,const XPZ3DActorRecordR143& a,
                         DWORD now) {
    if(!s.initialized) {
        s.x=a.tileX;s.y=a.tileY;s.z=a.tileZ;
        s.fromX=float(a.tileX);s.fromY=float(a.tileY);
        s.fromZ=float(a.tileZ);s.foot=float(a.footOffsetVoxel);
        s.fromFoot=s.foot;s.fromFacing=float(a.facing8&7);
        s.toFacing=s.fromFacing;s.initialized=true;
        return;
    }
    const bool changed=(s.x!=a.tileX || s.y!=a.tileY ||
                        s.z!=a.tileZ || s.foot!=float(a.footOffsetVoxel));
    if(changed) {
        float x,y,z,foot;
        DisplayPosition(s,now,x,y,z,foot);
        const int dx=abs(int(a.tileX)-int(s.x));
        const int dy=abs(int(a.tileY)-int(s.y));
        const int dz=abs(int(a.tileZ)-int(s.z));
        // Scene teleports, height-level changes and long scripted jumps
        // must snap, rather than slide straight through walls.
        const bool teleport=dx>2 || dy>2 || dz>1;
        s.fromX=teleport?float(a.tileX):x;
        s.fromY=teleport?float(a.tileY):y;
        s.fromZ=teleport?float(a.tileZ):z;
        s.fromFoot=teleport?float(a.footOffsetVoxel):foot;
        s.x=a.tileX;s.y=a.tileY;s.z=a.tileZ;
        s.foot=float(a.footOffsetVoxel);
        if(!teleport) {
            s.phase+=fminf(6.f,float(dx+dy+dz))*1.25f;
            s.lastMovement=now;
        } else s.lastMovement=0;
    }
    // OXCE 8-way facing is circular. Pick the shortest angular route.
    float target=float(a.facing8&7);
    float previous=DisplayFacing(s,now);
    while(target-previous>4.f)target-=8.f;
    while(target-previous< -4.f)target+=8.f;
    if(fabsf(target-s.toFacing)>0.01f) {
        s.fromFacing=previous;
        s.toFacing=target;
        s.lastFacingChange=now;
    }
}
inline float BoneBend(int index,bool kneeled,float gait,float moving) {
    const float swing=sinf(gait)*moving;
    const float leftKnee=fmaxf(0.f,-sinf(gait))*moving;
    const float rightKnee=fmaxf(0.f,sinf(gait))*moving;
    switch(index) {
        case 0:return kneeled ? -0.07f:0.f;     // Hip
        case 2:return kneeled ? 0.47f:swing*0.40f;  // L_Thigh
        case 3:return kneeled ? 0.47f:-swing*0.40f; // R_Thigh
        case 5:return kneeled ? -0.87f:-leftKnee*0.63f; // L_Leg
        case 6:return kneeled ? -0.87f:-rightKnee*0.63f; // R_Leg
        case 13:return kneeled ? -0.14f:-swing*0.22f; // R_UArm
        case 14:return kneeled ? -0.14f:swing*0.22f;  // L_UArm
        case 18:return kneeled ? -0.18f:0.f;     // R_LArm
        case 20:return kneeled ? -0.18f:0.f;     // L_LArm
        default:return 0.f;
    }
}
inline void CalculatePalette(const SkinBone* bones,
                             const XPZ3DActorRecordR143& actor,
                             const MotionState& motion,DWORD now,
                             Matrix output[BoneCount]) {
    Matrix worlds[BoneCount];
    const DWORD age=motion.lastMovement?DWORD(now-motion.lastMovement):0xFFFFFFFFu;
    float moving=0.f;
    if(!actor.kneeled && age<450u)
        moving=fminf(1.f,float(450u-age)/180.f);
    const float gait=motion.phase+float(age<450u?age:0u)*0.018f;
    for(int j=0;j<BoneCount;++j) {
        const SkinBone& b=bones[j];
        const float angle=BoneBend(j,actor.kneeled!=0,gait,moving);
        const float drop=(j==0 && actor.kneeled)?0.18f:0.f;
        const Matrix local=JointLocal(b,angle,drop);
        worlds[j]=b.parent<0 ? local : Multiply(worlds[b.parent],local);
        output[j]=Multiply(worlds[j],FromArray(b.inverseBind));
    }
}
class NativeOverlay {
    CObj<CObjectBase> materialMeshes_[MaterialCount];
    NGScene::IGameView* scene_;
    uint32_t pid_,epoch_,lastDigest_,revision_;
    DWORD lastBuild_;
    bool lastMoving_;
    std::map<int32_t,MotionState> motion_;
    static uint32_t Signature(const XPZ3DActorFrameR143& p) {
        uint32_t hash=2166136261u;
        for(uint32_t i=0;i<p.count;++i) {
            const XPZ3DActorRecordR143& a=p.actors[i];
            if(!Chosen(p,a))continue;
            const uint8_t* bytes=reinterpret_cast<const uint8_t*>(&a);
            for(size_t j=0;j<sizeof(a);++j) {
                hash^=bytes[j];hash*=16777619u;
            }
        }
        hash^=uint32_t(p.selectedUnitId);hash*=16777619u;
        return hash;
    }
    static CVec4 MaterialColor(unsigned i) {
        switch(i) {
            case 0:return CVec4(0.61f,0.41f,0.33f,1.f);
            case 1:return CVec4(0.39f,0.31f,0.24f,1.f);
            case 2:return CVec4(0.34f,0.36f,0.39f,1.f);
            case 3:return CVec4(0.90f,0.46f,0.59f,1.f);
            case 4:return CVec4(0.35f,0.32f,0.31f,1.f);
            case 5:return CVec4(0.61f,0.40f,0.31f,1.f);
            case 6:return CVec4(0.42f,0.38f,0.35f,1.f);
            default:return CVec4(0.60f,0.48f,0.39f,1.f);
        }
    }
    static void AddTriangle(std::vector<CVec3>& outVerts,
                            std::vector<STriangle>& outFaces,
                            const SkinTriangle& triangle,
                            const XPZ3DActorRecordR143& actor,
                            const MotionState& motion,DWORD now,
                            const SkinHeader& header,
                            const Matrix palette[BoneCount]) {
        const float extent=header.maxXYZ[2]-header.minXYZ[2];
        float targetHeight=float(actor.heightVoxel)*(2.5f/24.f);
        if(targetHeight<0.5f)targetHeight=0.5f;
        if(targetHeight>3.5f)targetHeight=3.5f;
        const float scale=fmaxf(0.4f,fminf(2.5f,targetHeight/extent));
        const float theta=DisplayFacing(motion,now)*0.7853981633974483f;
        const float cosine=cosf(theta),sine=sinf(theta);
        float x,y,z,foot;
        DisplayPosition(motion,now,x,y,z,foot);
        const float offset=float(actor.footprint)*0.5f;
        const float tx=(x+offset)*1.25f;
        const float ty=(y+offset)*1.25f;
        const float tz=z*2.5f+foot*(2.5f/24.f);
        const int base=int(outVerts.size());
        for(int corner=0;corner<3;++corner) {
            const SkinVertex& v=triangle.v[corner];
            float skinned[3]={0,0,0};
            for(int influence=0;influence<4;++influence) {
                const float weight=v.weights[influence];
                if(weight<0.0001f)continue;
                float animated[3];
                Transform(palette[v.joints[influence]],v.xyz,animated);
                for(int c=0;c<3;++c)skinned[c]+=animated[c]*weight;
            }
            const float x=skinned[0]*scale,y=skinned[1]*scale;
            const float z=(skinned[2]-header.minXYZ[2])*scale;
            outVerts.push_back(CVec3(tx+cosine*x-sine*y,
                                     ty+sine*x+cosine*y,tz+z));
        }
        outFaces.push_back(STriangle(base,base+1,base+2));
    }
public:
    NativeOverlay():scene_(NULL),pid_(0),epoch_(0),lastDigest_(0),
                    revision_(0),lastBuild_(0),lastMoving_(false){}
    void Reset() {
        for(int i=0;i<MaterialCount;++i)materialMeshes_[i]=0;
        scene_=NULL;pid_=epoch_=lastDigest_=revision_=0;
        lastBuild_=0;lastMoving_=false;motion_.clear();
    }
    bool Apply(NGScene::IGameView* scene,const XPZ3DActorFrameR143& frame) {
        if(!scene){Reset();return false;}
        if(scene_!=scene || pid_!=frame.producerPid || epoch_!=frame.mapEpoch) {
            Reset();scene_=scene;pid_=frame.producerPid;epoch_=frame.mapEpoch;
        }
        Asset& asset=Asset::Shared();
        if(!asset.Ready())return false; // Original R143 proxy figures remain.
        const DWORD now=GetTickCount();
        bool moving=false;
        for(uint32_t i=0;i<frame.count;++i) {
            const XPZ3DActorRecordR143& a=frame.actors[i];
            if(!Chosen(frame,a))continue;
            MotionState& st=motion_[a.unitId];
            ObserveActor(st,a,now);
            if((st.lastMovement && DWORD(now-st.lastMovement)<450u) ||
               (st.lastFacingChange && DWORD(now-st.lastFacingChange)<150u))
                moving=true;
        }
        const uint32_t digest=Signature(frame);
        const bool changed=!revision_ || digest!=lastDigest_ ||
            moving || lastMoving_!=moving;
        if(!changed)return false;
        // R148S4: 55ms upload budget permits several genuine spatial
        // interpolation frames per 190ms tile transition. Static actors
        // continue to skip all redundant mesh uploads.
        if(revision_ && DWORD(now-lastBuild_)<55u)return false;
        const std::vector<SkinTriangle>& faces=asset.Triangles();
        std::vector<CVec3> vertices[MaterialCount];
        std::vector<STriangle> triangles[MaterialCount];
        for(uint32_t i=0;i<frame.count;++i) {
            const XPZ3DActorRecordR143& a=frame.actors[i];
            if(!Chosen(frame,a))continue;
            Matrix palette[BoneCount];
            CalculatePalette(asset.Bones(),a,motion_[a.unitId],now,palette);
            for(size_t j=0;j<faces.size();++j) {
                const SkinTriangle& face=faces[j];
                const unsigned group=face.material;
                if(vertices[group].size()+3>59997u)continue;
                AddTriangle(vertices[group],triangles[group],face,a,
                            motion_[a.unitId],now,asset.Header(),palette);
            }
        }
        for(int group=0;group<MaterialCount;++group) {
            materialMeshes_[group]=0;
            if(triangles[group].empty())continue;
            CPtr<CMemObject> model=new CMemObject;
            model->Create(vertices[group],triangles[group]);
            materialMeshes_[group]=scene->CreateMesh(
                model.GetPtr(),MaterialColor(group),(CFuncBase<SFBTransform>*)0);
        }
        revision_=frame.revision;lastDigest_=digest;
        lastBuild_=now;lastMoving_=moving;
        return true;
    }
};
} // namespace XPZ3DF11R147
