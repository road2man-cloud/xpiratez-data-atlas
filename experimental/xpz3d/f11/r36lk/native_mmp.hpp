// SPDX-License-Identifier: MIT
#pragma once
#include <cstdint>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>
namespace XPZLK {
inline void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
inline uint32_t le32(const uint8_t* p){return uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
struct Level{uint32_t w,h;std::vector<uint8_t> bgra;};
struct MMP{uint32_t average;std::vector<Level> levels;};
inline MMP read(const std::string& path){
    std::ifstream f(path,std::ios::binary|std::ios::ate);require(bool(f),"open MMP");auto n=f.tellg();require(n>=24&&n<=32*1024*1024,"MMP size");std::vector<uint8_t>b(static_cast<size_t>(n));f.seekg(0);require(bool(f.read(reinterpret_cast<char*>(b.data()),b.size())),"MMP read");
    require(le32(b.data())==0x00504D4D&&le32(b.data()+4)==6,"unsupported MMP format");MMP m{le32(b.data()+8),{}};auto w=le32(b.data()+12),h=le32(b.data()+16),levels=le32(b.data()+20);
    auto pot=[](uint32_t x){return x&&x<=2048&&(x&(x-1))==0;};require(pot(w)&&pot(h)&&levels&&levels<=12,"MMP dimensions/levels");size_t off=24;
    for(uint32_t i=0;i<levels;++i){require(w&&h,"mip beyond short axis");size_t count=size_t(w)*h*4;require(count<=b.size()-off,"truncated mip");m.levels.push_back({w,h,{b.begin()+off,b.begin()+off+count}});off+=count;w>>=1;h>>=1;}
    require(off==b.size(),"extra MMP bytes");return m;
}
}
