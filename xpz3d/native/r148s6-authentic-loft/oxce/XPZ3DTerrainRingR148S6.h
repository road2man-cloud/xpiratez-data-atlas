#pragma once
// R137 reliable bounded transfer: keep up to 128 successive dirty chunks.
// This transport supersedes the one-packet prototype, but does not alter
// the original R135/R136 camera shared memory at all.
#include "XPZ3DTerrainWireR137.h"
#ifdef _WIN32
namespace XPZ3DTerrain {
enum { RingSlots = 128 };
static const char* const RingMapName="Local\\XPZ3D_OXCE_TERRAIN_RING_R148S6";
static const uint32_t RingMagic=0x52335058u; // XP3R
#pragma pack(push,4)
struct TerrainRing {
    uint32_t magic,version,bytes;
    volatile LONG lastPublished;
    XPZ3DTerrainPacket packets[RingSlots];
};
#pragma pack(pop)
class RingProducer {
    HANDLE h_; TerrainRing* r_; LONG next_;
public:
    RingProducer():h_(NULL),r_(NULL),next_(0){}
    ~RingProducer(){if(r_)UnmapViewOfFile(r_);if(h_)CloseHandle(h_);}
    bool Open(){
        if(r_)return true;
        h_=CreateFileMappingA(INVALID_HANDLE_VALUE,NULL,PAGE_READWRITE,0,sizeof(TerrainRing),RingMapName);
        if(!h_)return false;
        const bool created=GetLastError()!=ERROR_ALREADY_EXISTS;
        r_=static_cast<TerrainRing*>(MapViewOfFile(h_,FILE_MAP_ALL_ACCESS,0,0,sizeof(TerrainRing)));
        if(!r_){CloseHandle(h_);h_=NULL;return false;}
        if(created) {
            ZeroMemory(r_,sizeof(*r_));
            r_->magic=RingMagic;r_->version=2;r_->bytes=sizeof(*r_);
        } else if(r_->magic!=RingMagic || r_->version!=2 || r_->bytes!=sizeof(*r_)) {
            UnmapViewOfFile(r_);r_=NULL;CloseHandle(h_);h_=NULL;return false;
        }
        next_=r_->lastPublished;
        return true;
    }
    bool Publish(const XPZ3DTerrainPacket &src){
        if(!Open())return false;
        const LONG id=++next_;
        XPZ3DTerrainPacket* p=&r_->packets[(uint32_t(id)-1)%RingSlots];
        InterlockedExchange(&p->sequence,(id<<1)|1);
        MemoryBarrier();
        // Sequence is controlled independently and never copied from src.
        memcpy(reinterpret_cast<char*>(p)+16,reinterpret_cast<const char*>(&src)+16,sizeof(src)-16);
        p->magic=Magic;p->version=Version;p->packetBytes=sizeof(*p);
        MemoryBarrier();
        InterlockedExchange(&p->sequence,id<<1);
        InterlockedExchange(&r_->lastPublished,id);
        return true;
    }
};
class RingConsumer {
    HANDLE h_;const TerrainRing* r_;LONG next_;bool initialized_;
public:
    RingConsumer():h_(NULL),r_(NULL),next_(1),initialized_(false){}
    ~RingConsumer(){Reset();}
    void Reset(){if(r_)UnmapViewOfFile(r_);r_=NULL;if(h_)CloseHandle(h_);h_=NULL;next_=1;initialized_=false;}
    bool Next(XPZ3DTerrainPacket &dst){
        if(!r_) {
            h_=OpenFileMappingA(FILE_MAP_READ,FALSE,RingMapName);
            if(!h_)return false;
            r_=static_cast<const TerrainRing*>(MapViewOfFile(h_,FILE_MAP_READ,0,0,sizeof(TerrainRing)));
            if(!r_){Reset();return false;}
            if(r_->magic!=RingMagic||r_->version!=2||r_->bytes!=sizeof(*r_)){Reset();return false;}
        }
        const LONG head=r_->lastPublished;
        if(!initialized_){
            next_=(head>RingSlots)?head-RingSlots+1:1;
            initialized_=true;
        }
        if(head<next_)return false;
        if(head-next_>=RingSlots)next_=head-RingSlots+1;
        const XPZ3DTerrainPacket* p=&r_->packets[(uint32_t(next_)-1)%RingSlots];
        for(unsigned i=0;i<3;++i){
            const LONG a=p->sequence;MemoryBarrier();
            if(a!=(next_<<1))continue;
            memcpy(&dst,p,sizeof(dst));MemoryBarrier();
            const LONG b=p->sequence;
            if(a!=b||b!=(next_<<1))continue;
            if(dst.magic!=Magic||dst.version!=Version||dst.packetBytes!=sizeof(dst)||
               dst.mapWidth==0||dst.mapHeight==0||dst.mapDepth==0||
               dst.chunkX>=(dst.mapWidth+7)/8||dst.chunkY>=(dst.mapHeight+7)/8||
               dst.deckZ>=dst.mapDepth||GetTickCount()-dst.tickMillis>2000u) {
                // Skip expired backlog entries while preserving the mapping.
                // Resetting to the oldest slot can starve newly arriving data.
                ++next_;
                return false;
            }
            ++next_;
            return true;
        }
        return false;
    }
};
}
#endif
