// SPDX-License-Identifier: MIT
#pragma once
#include <cstdint>
#include <fstream>
#include <vector>
#include <string>
#include <stdexcept>
#include <cstring>
#include <cmath>
namespace XPZLM {
inline void need(bool b,const char* s){if(!b)throw std::runtime_error(s);}
struct Reader{std::vector<uint8_t>b;size_t p=0;explicit Reader(const std::string& path){std::ifstream f(path,std::ios::binary|std::ios::ate);need(bool(f),"open");auto n=f.tellg();need(n>=16&&n<=64*1024*1024,"size");b.resize(size_t(n));f.seekg(0);need(bool(f.read(reinterpret_cast<char*>(b.data()),n)),"read");}uint32_t u(){need(b.size()-p>=4,"truncated");uint32_t x=0;for(int k=0;k<4;k++)x|=uint32_t(b[p++])<<(8*k);return x;}std::vector<uint8_t> take(size_t n){need(n<=b.size()-p,"truncated data");auto a=b.begin()+p;p+=n;return {a,a+n};}};
inline uint16_t u16(const std::vector<uint8_t>& b,size_t p){return uint16_t(b[p])|uint16_t(b[p+1])<<8;}
inline uint32_t u32(const std::vector<uint8_t>& b,size_t p){uint32_t x=0;for(int k=0;k<4;k++)x|=uint32_t(b[p+k])<<(8*k);return x;}
inline float fl(const std::vector<uint8_t>& b,size_t p){auto u=u32(b,p);float x;std::memcpy(&x,&u,4);need(std::isfinite(x),"nonfinite vertex");return x;}
struct Texture{bool wrap;std::vector<uint8_t> mmp;};
struct Primitive{uint32_t node,primitive,texture,material,alpha;std::vector<uint8_t> v,i,o;};
struct Scene{std::vector<Texture> textures;std::vector<Primitive> meshes;};
inline Scene load(const std::string& path){Reader r(path);auto magic=r.take(8);need(!std::memcmp(magic.data(),"XPZSCN1\0",8),"magic");auto nt=r.u(),np=r.u();need(nt&&nt<=4096&&np&&np<=4096,"count");Scene s;for(uint32_t k=0;k<nt;k++){auto w=r.u(),n=r.u();need(w<=1&&n>=24,"texture");auto b=r.take(n);need(u32(b,0)==0x00504d4d&&u32(b,4)==6,"MMP header");auto x=u32(b,12),y=u32(b,16),l=u32(b,20);need(x&&y&&x<=2048&&y<=2048&&!(x&(x-1))&&!(y&(y-1))&&l&&l<=12,"MMP shape");size_t bytes=24;for(uint32_t j=0;j<l;j++){need(x&&y,"MMP mip");bytes+=size_t(x)*y*4;x>>=1;y>>=1;}need(bytes==b.size(),"MMP size");s.textures.push_back({w!=0,std::move(b)});}for(uint32_t k=0;k<np;k++){Primitive m;m.node=r.u();m.primitive=r.u();m.texture=r.u();m.material=r.u();m.alpha=r.u();auto nv=r.u(),ni=r.u(),no=r.u();need(m.texture<nt&&(m.alpha==0||m.alpha==1||m.alpha==4||m.alpha==17),"binding");need(nv&&nv%32==0&&nv/32<=65535&&ni&&ni%6==0&&ni/2<=65535&&no==2*(ni/6+1),"mesh shape");m.v=r.take(nv);m.i=r.take(ni);m.o=r.take(no);for(size_t j=0;j<nv;j+=32){for(auto off:{0,4,8,24,28})fl(m.v,j+off);}for(size_t j=0;j<ni;j+=2)need(u16(m.i,j)<nv/32,"index");for(size_t j=0;j<no;j+=2)need(u16(m.o,j)==3*(j/2),"polygon offset");s.meshes.push_back(std::move(m));}need(r.p==r.b.size(),"trailing data");return s;}
}
