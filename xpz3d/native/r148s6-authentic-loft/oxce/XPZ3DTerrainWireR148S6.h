#pragma once
// XPZ3D R137: independent authoritative OXCE terrain stream ABI.
// Camera R135/R136 mapping is intentionally unchanged.
// Each packet describes one 8x8 dirty chunk on one Z deck.
// MCD IDs remain opaque; LOFT/voxel collision is NEVER simulated by S2.
#include <stdint.h>
#include <string.h>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#pragma pack(push, 4)
struct XPZ3DTerrainCell {
    uint16_t mcd[4];      // floor, west wall, north wall, object; 0xffff = missing
    uint16_t dataset[4];  // corresponding terrain dataset indices
    int16_t terrainLevel;
    uint8_t discoveredMask;
    uint8_t flags;        // bit0 floor, bit1 west, bit2 north, bit3 object
    uint16_t loftID[4][12]; // OXCE original 12 LOFT layers per tile part;
                           // 0xffff if absent or not discovered
};
struct XPZ3DTerrainPacket {
    uint32_t magic, version, packetBytes;
    volatile LONG sequence; // odd during writing; even when stable
    volatile LONG consumedSequence; // consumer acknowledges the stable packet
    uint32_t producerPid, tickMillis;
    uint32_t mapEpoch;       // increment when loading another tactical map
    uint32_t mapWidth, mapHeight, mapDepth;
    uint32_t chunkX, chunkY, deckZ;
    uint32_t contentRevision;
    uint32_t chunkFlags;     // 1 = first transmission / full replacement
    XPZ3DTerrainCell cells[64];
};
#pragma pack(pop)
static_assert(sizeof(XPZ3DTerrainCell)==116,"R137 terrain cell ABI");
static_assert(sizeof(XPZ3DTerrainPacket)==7488,"R137 terrain packet ABI");
namespace XPZ3DTerrain {
static const uint32_t Magic=0x54335058u; // XP3T
static const uint32_t Version=3;
static const char* const MapName="Local\\XPZ3D_OXCE_TERRAIN_R148S6_ACK3";
static const uint16_t Missing=0xffff;
inline uint32_t Hash(const XPZ3DTerrainCell* p) {
    const uint8_t* bytes=reinterpret_cast<const uint8_t*>(p);
    uint32_t h=2166136261u;
    for(unsigned i=0;i<sizeof(XPZ3DTerrainCell)*64;++i) {h^=bytes[i];h*=16777619u;}
    return h;
}
#ifdef _WIN32
class Producer {
    HANDLE mapping_; XPZ3DTerrainPacket* view_; LONG seq_;
public:
    Producer():mapping_(NULL),view_(NULL),seq_(0){}
    ~Producer(){if(view_)UnmapViewOfFile(view_);if(mapping_)CloseHandle(mapping_);}
    bool Open(){
        if(view_)return true;
        mapping_=CreateFileMappingA(INVALID_HANDLE_VALUE,NULL,PAGE_READWRITE,0,sizeof(XPZ3DTerrainPacket),MapName);
        if(!mapping_)return false;
        const bool created=(GetLastError()!=ERROR_ALREADY_EXISTS);
        view_=static_cast<XPZ3DTerrainPacket*>(MapViewOfFile(mapping_,FILE_MAP_ALL_ACCESS,0,0,sizeof(XPZ3DTerrainPacket)));
        if(!view_){CloseHandle(mapping_);mapping_=NULL;return false;}
        if(created)memset(view_,0,sizeof(XPZ3DTerrainPacket));
        return true;
    }
    bool Publish(const XPZ3DTerrainPacket& src){
        if(!Open())return false;
        // Backpressure: do not overwrite a packet until the S2 reader has copied it.
        const LONG last=view_->sequence;
        // Recover when a consumer exits before acknowledging; the next scan
        // will retransmit any chunk whose send did not complete.
        if(last!=0 && (last&1 ||
           (view_->consumedSequence!=last && GetTickCount()-view_->tickMillis<2000u)))return false;
        seq_=last;
        InterlockedExchange(&view_->sequence,++seq_ | 1);
        MemoryBarrier();
        // Never overwrite the shared sequence field during payload transfer.
        memcpy(reinterpret_cast<char*>(view_)+20,reinterpret_cast<const char*>(&src)+20,sizeof(src)-20);
        view_->magic=Magic;view_->version=Version;view_->packetBytes=sizeof(src);
        MemoryBarrier();
        seq_=(seq_+1)&~1L;
        InterlockedExchange(&view_->sequence,seq_);
        return true;
    }
};
class Consumer {
    HANDLE mapping_;XPZ3DTerrainPacket* view_;
public:
    Consumer():mapping_(NULL),view_(NULL){}
    ~Consumer(){Reset();}
    void Reset(){if(view_)UnmapViewOfFile(view_);view_=NULL;if(mapping_)CloseHandle(mapping_);mapping_=NULL;}
    bool Read(XPZ3DTerrainPacket& out){
        if(!view_){
            mapping_=OpenFileMappingA(FILE_MAP_READ|FILE_MAP_WRITE,FALSE,MapName);
            if(!mapping_)return false;
            view_=static_cast<XPZ3DTerrainPacket*>(MapViewOfFile(mapping_,FILE_MAP_READ|FILE_MAP_WRITE,0,0,sizeof(out)));
            if(!view_){Reset();return false;}
        }
        for(int n=0;n<3;++n){
            LONG a=view_->sequence;MemoryBarrier();if(a&1)continue;
            memcpy(&out,view_,sizeof(out));MemoryBarrier();
            LONG b=view_->sequence;
            if(a!=b || (b&1))continue;
            if(out.magic!=Magic || out.version!=Version || out.packetBytes!=sizeof(out) ||
               out.mapWidth==0 || out.mapHeight==0 || out.mapDepth==0 ||
               out.chunkX>=((out.mapWidth+7)/8) || out.chunkY>=((out.mapHeight+7)/8) ||
               out.deckZ>=out.mapDepth || GetTickCount()-out.tickMillis>1500u){Reset();return false;}
            MemoryBarrier();
            InterlockedExchange(&view_->consumedSequence,b);
            return true;
        }
        return false;
    }
};
#endif
}
#endif // _WIN32
