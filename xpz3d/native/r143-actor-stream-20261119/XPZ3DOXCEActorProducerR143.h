#pragma once
// Include from BattlescapeState.cpp after OXCE Tile/BattleUnit/Armor headers.
// This publisher reads the authoritative tactical state and never mutates it.
#include "XPZ3DActorWireR143.h"
namespace OpenXcom {
namespace XPZ3DActorR143 {
class Producer {
    HANDLE handle_;
    XPZ3DActorFrameR143* view_;
    DWORD lastSent_;
    uint32_t revision_;
public:
    Producer():handle_(NULL),view_(NULL),lastSent_(0),revision_(0){}
    ~Producer() {
        if(view_)UnmapViewOfFile(view_);
        if(handle_)CloseHandle(handle_);
    }
    bool Open() {
        if(view_)return true;
        handle_=CreateFileMappingA(INVALID_HANDLE_VALUE,NULL,PAGE_READWRITE,
            0,sizeof(XPZ3DActorFrameR143),XPZ3DActorWireR143::MapName);
        if(!handle_)return false;
        const bool created=GetLastError()!=ERROR_ALREADY_EXISTS;
        view_=static_cast<XPZ3DActorFrameR143*>(
            MapViewOfFile(handle_,FILE_MAP_ALL_ACCESS,0,0,sizeof(XPZ3DActorFrameR143)));
        if(!view_) {CloseHandle(handle_);handle_=NULL;return false;}
        if(created)ZeroMemory(view_,sizeof(*view_));
        return true;
    }
    void Tick(SavedBattleGame* save,uint32_t epoch) {
        if(!save)return;
        const DWORD now=GetTickCount();
        // 12.5 Hz is adequate for world position transport and avoids
        // repeated enumeration in high-FPS tactical think() calls.
        if(lastSent_ && DWORD(now-lastSent_)<80u)return;
        XPZ3DActorFrameR143 frame={};
        frame.magic=XPZ3DActorWireR143::Magic;
        frame.version=XPZ3DActorWireR143::Version;
        frame.packetBytes=sizeof(frame);
        frame.producerPid=GetCurrentProcessId();
        frame.tickMillis=now;
        frame.mapEpoch=epoch;
        frame.mapWidth=save->getMapSizeX();
        frame.mapHeight=save->getMapSizeY();
        frame.mapDepth=save->getMapSizeZ();
        if(!frame.mapWidth || !frame.mapHeight || !frame.mapDepth ||
           frame.mapWidth>256 || frame.mapHeight>256 || frame.mapDepth>16)return;
        const BattleUnit* selected=save->getSelectedUnit();
        frame.selectedUnitId=selected?selected->getId():-1;
        for(const BattleUnit* unit:*save->getUnits()) {
            if(!unit || unit->isOut() || !unit->getTile())continue;
            // No hidden enemies or neutrals may enter the 3D transport.
            uint8_t team=0;
            if(unit->getFaction()==FACTION_HOSTILE) {
                if(!unit->getVisible())continue;
                team=1;
            } else if(unit->getFaction()==FACTION_NEUTRAL) {
                if(!unit->getVisible())continue;
                team=2;
            } else if(unit->getFaction()!=FACTION_PLAYER)continue;
            const Position p=unit->getPosition();
            if(p.x<0 || p.y<0 || p.z<0 ||
               uint32_t(p.x)>=frame.mapWidth ||
               uint32_t(p.y)>=frame.mapHeight ||
               uint32_t(p.z)>=frame.mapDepth)continue;
            if(frame.count>=XPZ3DActorWireR143::MaxActors)break;
            XPZ3DActorRecordR143& a=frame.actors[frame.count++];
            a.unitId=unit->getId();
            a.tileX=static_cast<int16_t>(p.x);
            a.tileY=static_cast<int16_t>(p.y);
            a.tileZ=static_cast<int16_t>(p.z);
            int foot=-unit->getTile()->getTerrainLevel()+unit->getFloatHeight();
            if(foot< -48)foot=-48;
            if(foot>72)foot=72;
            a.footOffsetVoxel=static_cast<int16_t>(foot);
            int height=unit->getHeight();
            if(height<4)height=4;
            if(height>72)height=72;
            a.heightVoxel=static_cast<int16_t>(height);
            a.facing8=static_cast<uint8_t>(unit->getDirection()&7);
            a.team=team;
            a.kneeled=unit->isKneeled()?1:0;
            const Armor* armor=unit->getArmor();
            int size=armor?armor->getSize():1;
            if(size<1)size=1;
            if(size>4)size=4;
            a.footprint=static_cast<uint8_t>(size);
            a.flags=0;
        }
        if(!Open())return;
        frame.revision=++revision_;
        // Publish without copying the sequence field. Readers never see a
        // half-written roster, even on actor disappearance or map reload.
        const LONG even=(view_->sequence&~1L)+2L;
        InterlockedExchange(&view_->sequence,even|1L);
        MemoryBarrier();
        memcpy(view_,&frame,offsetof(XPZ3DActorFrameR143,sequence));
        const size_t payload=offsetof(XPZ3DActorFrameR143,producerPid);
        memcpy(reinterpret_cast<char*>(view_)+payload,
               reinterpret_cast<const char*>(&frame)+payload,
               sizeof(frame)-payload);
        MemoryBarrier();
        InterlockedExchange(&view_->sequence,even);
        lastSent_=now;
    }
};
inline void Publish(SavedBattleGame* save,uint32_t epoch) {
    static Producer publisher;
    publisher.Tick(save,epoch);
}
} // namespace XPZ3DActorR143
} // namespace OpenXcom
