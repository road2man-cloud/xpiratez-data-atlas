#pragma once
// Producer-side incremental map scan, deliberately decoupled from OXCE types.
// Use from OXCE tactical update with a callback that reads live Tile / MapData.
// One chunk scan per Tick; no full-map rebuild or gameplay modification.
#include "XPZ3DTerrainRingR137.h"
#include <vector>
namespace XPZ3DTerrain {
class IncrementalPublisher {
    RingProducer wire_;
    std::vector<uint32_t> hashes_;
    std::vector<DWORD> lastSentMs_;
    uint32_t epoch_,width_,height_,depth_,cursor_,scanCursor_,revision_;
public:
    IncrementalPublisher():epoch_(0),width_(0),height_(0),depth_(0),cursor_(0),scanCursor_(0),revision_(0){}
    template<class ReadTile>
    bool Tick(uint32_t epoch,uint32_t w,uint32_t h,uint32_t d,ReadTile readTile,
              int focusX=-1,int focusY=-1,int focusZ=-1){
        if(!w||!h||!d||w>256||h>256||d>16)return false;
        const uint32_t cw=(w+7)/8,ch=(h+7)/8,total=cw*ch*d;
        if(epoch_!=epoch || w!=width_ || h!=height_ || d!=depth_){
            hashes_.assign(total,0);lastSentMs_.assign(total,0);
            epoch_=epoch;width_=w;height_=h;depth_=d;cursor_=scanCursor_=0;revision_=0;
        }
        const uint32_t scan=cursor_++;
        // Maintain an independent background cursor: otherwise skipping
        // every fourth serial index would starve 25% of a 40x40 grid.
        const bool focus=(scan&3u)==0 && focusX>=0 && focusY>=0 && focusZ>=0 &&
            (uint32_t)focusX<w && (uint32_t)focusY<h && (uint32_t)focusZ<d;
        const uint32_t ix=focus ?
            ((uint32_t(focusZ)*ch+uint32_t(focusY)/8u)*cw+uint32_t(focusX)/8u) :
            scanCursor_++%total;
        XPZ3DTerrainPacket packet={};
        packet.mapEpoch=epoch;packet.mapWidth=w;packet.mapHeight=h;packet.mapDepth=d;
        packet.chunkX=ix%cw;packet.chunkY=(ix/cw)%ch;packet.deckZ=ix/(cw*ch);
        for(uint32_t cy=0;cy<8;++cy)for(uint32_t cx=0;cx<8;++cx){
            XPZ3DTerrainCell &cell=packet.cells[cy*8+cx];
            for(int j=0;j<4;++j){cell.mcd[j]=Missing;cell.dataset[j]=Missing; for(int z=0;z<12;++z)cell.loftID[j][z]=Missing;}
            uint32_t x=packet.chunkX*8+cx,y=packet.chunkY*8+cy;
            if(x<w && y<h)readTile(x,y,packet.deckZ,cell);
        }
        uint32_t hash=Hash(packet.cells);
        // Initial hash is sentinel 0; identical terrain is not repeatedly sent.
        const DWORD now=GetTickCount();
        const bool same=(hashes_[ix]==hash && hashes_[ix]!=0);
        // Periodic heartbeat restores a complete map to a late-starting S2
        // even if the 128-slot ring wrapped before it connected.
        if(same && DWORD(now-lastSentMs_[ix])<10000u)return false;
        packet.contentRevision=revision_+1;
        packet.chunkFlags=(revision_==0 ? 1u : 0u)|(same ? 2u : 0u);
        packet.producerPid=GetCurrentProcessId();packet.tickMillis=now;
        if(!wire_.Publish(packet))return false; // keep chunk dirty until receiver ACK
        hashes_[ix]=hash;
        lastSentMs_[ix]=now;
        ++revision_;
        return true;
    }
};
class DirtyChunkCache {
    uint32_t epoch_,w_,h_,d_,producerPid_;
    std::vector<uint32_t> revisions_;
    std::vector<XPZ3DTerrainCell> cells_;
public:
    DirtyChunkCache():epoch_(0),w_(0),h_(0),d_(0),producerPid_(0){}
    // Return true only for an accepted, changed chunk; renderer can rebuild that mesh.
    bool Apply(const XPZ3DTerrainPacket& p){
        const uint32_t cw=(p.mapWidth+7)/8,ch=(p.mapHeight+7)/8;
        if(p.mapWidth==0||p.mapHeight==0||p.mapDepth==0||
           p.chunkX>=cw||p.chunkY>=ch||p.deckZ>=p.mapDepth)return false;
        const uint32_t idx=(p.deckZ*ch+p.chunkY)*cw+p.chunkX;
        if(producerPid_!=p.producerPid||epoch_!=p.mapEpoch||w_!=p.mapWidth||h_!=p.mapHeight||d_!=p.mapDepth){
            producerPid_=p.producerPid;epoch_=p.mapEpoch;w_=p.mapWidth;h_=p.mapHeight;d_=p.mapDepth;
            revisions_.assign(cw*ch*d_,0);cells_.resize(size_t(w_)*h_*d_);
        }
        if(p.contentRevision<=revisions_[idx])return false;
        revisions_[idx]=p.contentRevision;
        bool changed=false;
        for(uint32_t y=0;y<8;++y)for(uint32_t x=0;x<8;++x){
            uint32_t tx=p.chunkX*8+x,ty=p.chunkY*8+y;
            if(tx<w_&&ty<h_){
                XPZ3DTerrainCell &old=cells_[(size_t(p.deckZ)*h_+ty)*w_+tx];
                const XPZ3DTerrainCell &current=p.cells[y*8+x];
                if(memcmp(&old,&current,sizeof(current))!=0)changed=true;
                old=current;
            }
        }
        return changed;
    }
    const XPZ3DTerrainCell* At(uint32_t x,uint32_t y,uint32_t z)const {
        if(x>=w_||y>=h_||z>=d_)return NULL;
        return &cells_[(size_t(z)*h_+y)*w_+x];
    }
};
}
