#pragma once
// R148S6: exact OXCE Mod::getVoxelData() LOFTEMPS rows, shared read-only
// with the native S2 scene. The MCD/LOFT source (not guessed boxes) decides
// occupied voxels. S2 never sends actions, changes saves, or owns collision.
// The 16-bit rows match TileEngine::voxelCheck at (loftId*16 + y).
#include <windows.h>
#include <stdint.h>
#include <vector>
#include <string.h>
namespace XPZ3DLoftR148S6 {
enum { MaxRows=131072 }; // 8192 original LOFT 16-row templates
static const uint32_t Magic=0x4c335058u; // XP3L
static const uint32_t Version=1u;
static const char* const MapName="Local\\XPZ3D_OXCE_LOFT_ROWS_R148S6";
#pragma pack(push,4)
struct SharedLoftRows {
    uint32_t magic,version,bytes;
    volatile LONG sequence;
    uint32_t producerPid,mapEpoch,rowCount,stampMillis;
    uint16_t rows[MaxRows];
};
#pragma pack(pop)
static_assert(offsetof(SharedLoftRows,rows)==32,"R148S6 LOFT header ABI");
class Producer {
    HANDLE mapping_;
    SharedLoftRows* shared_;
    uint32_t epoch_;
    uint32_t size_;
public:
    Producer():mapping_(NULL),shared_(NULL),epoch_(0),size_(0){}
    ~Producer(){if(shared_)UnmapViewOfFile(shared_);
                if(mapping_)CloseHandle(mapping_);}
    bool Open(){
        if(shared_)return true;
        mapping_=CreateFileMappingA(INVALID_HANDLE_VALUE,NULL,PAGE_READWRITE,
            0,sizeof(SharedLoftRows),MapName);
        if(!mapping_)return false;
        const bool created=GetLastError()!=ERROR_ALREADY_EXISTS;
        shared_=static_cast<SharedLoftRows*>(MapViewOfFile(
            mapping_,FILE_MAP_ALL_ACCESS,0,0,sizeof(SharedLoftRows)));
        if(!shared_){CloseHandle(mapping_);mapping_=NULL;return false;}
        if(created) {
            memset(shared_,0,sizeof(SharedLoftRows));
            shared_->magic=Magic;
            shared_->version=Version;
            shared_->bytes=sizeof(SharedLoftRows);
        } else if(shared_->magic!=Magic || shared_->version!=Version ||
                  shared_->bytes!=sizeof(SharedLoftRows)) {
            UnmapViewOfFile(shared_);shared_=NULL;
            CloseHandle(mapping_);mapping_=NULL;return false;
        }
        return true;
    }
    bool Publish(const std::vector<uint16_t>* rows,uint32_t mapEpoch){
        if(!rows || rows->empty() || rows->size()>MaxRows ||
           (rows->size()%16u)!=0 || mapEpoch==0)return false;
        if(!Open())return false;
        const uint32_t count=static_cast<uint32_t>(rows->size());
        if(epoch_==mapEpoch && size_==count &&
           shared_->producerPid==GetCurrentProcessId())return true;
        const LONG nextEven=(shared_->sequence&~1L)+2L;
        InterlockedExchange(&shared_->sequence,nextEven|1L);
        MemoryBarrier();
        shared_->producerPid=GetCurrentProcessId();
        shared_->mapEpoch=mapEpoch;
        shared_->rowCount=count;
        shared_->stampMillis=GetTickCount();
        memcpy(shared_->rows,rows->data(),size_t(count)*sizeof(uint16_t));
        MemoryBarrier();
        InterlockedExchange(&shared_->sequence,nextEven);
        epoch_=mapEpoch;size_=count;
        return true;
    }
};
class Consumer {
    HANDLE mapping_;
    const SharedLoftRows* shared_;
    std::vector<uint16_t> rows_;
    uint32_t producerPid_,mapEpoch_;
    DWORD lastProbe_;
public:
    Consumer():mapping_(NULL),shared_(NULL),producerPid_(0),
               mapEpoch_(0),lastProbe_(0){}
    ~Consumer(){Reset();}
    void Reset(){
        if(shared_)UnmapViewOfFile(shared_);
        shared_=NULL;
        if(mapping_)CloseHandle(mapping_);
        mapping_=NULL;
        rows_.clear();producerPid_=mapEpoch_=0;lastProbe_=0;
    }
    const std::vector<uint16_t>& Rows()const{return rows_;}
    bool Bind(uint32_t producerPid,uint32_t epoch) {
        if(!producerPid || !epoch)return false;
        if(producerPid_==producerPid && mapEpoch_==epoch && !rows_.empty())
            return true;
        if(!shared_) {
            const DWORD now=GetTickCount();
            if(lastProbe_ && DWORD(now-lastProbe_)<300u)return false;
            lastProbe_=now;
            mapping_=OpenFileMappingA(FILE_MAP_READ,FALSE,MapName);
            if(!mapping_)return false;
            shared_=static_cast<const SharedLoftRows*>(
                MapViewOfFile(mapping_,FILE_MAP_READ,0,0,sizeof(SharedLoftRows)));
            if(!shared_){CloseHandle(mapping_);mapping_=NULL;return false;}
        }
        if(shared_->magic!=Magic || shared_->version!=Version ||
           shared_->bytes!=sizeof(SharedLoftRows))return false;
        for(int tries=0;tries<4;++tries) {
            const LONG first=shared_->sequence;
            MemoryBarrier();
            if(first&1L)continue;
            const uint32_t pid=shared_->producerPid;
            const uint32_t map=shared_->mapEpoch;
            const uint32_t count=shared_->rowCount;
            if(pid!=producerPid || map!=epoch || !count ||
               count>MaxRows || count%16u)return false;
            std::vector<uint16_t> local(shared_->rows,shared_->rows+count);
            MemoryBarrier();
            const LONG second=shared_->sequence;
            if(first!=second || second&1L)continue;
            rows_.swap(local);
            producerPid_=pid;mapEpoch_=map;
            return true;
        }
        return false;
    }
};
inline Consumer& Shared(){static Consumer reader;return reader;}
inline bool Publish(const std::vector<uint16_t>* rows,uint32_t epoch) {
    static Producer writer;return writer.Publish(rows,epoch);
}
} // namespace XPZ3DLoftR148S6
