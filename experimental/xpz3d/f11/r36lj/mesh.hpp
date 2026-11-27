// SPDX-License-Identifier: MIT
#pragma once
#include <array>
#include <vector>
#include <cmath>
#include <cstdint>
#include <stdexcept>
#include <limits>
namespace XPZLJ {
using V3=std::array<double,3>; using UV=std::array<double,2>;
inline void check(bool ok,const char* msg){if(!ok)throw std::runtime_error(msg);}
inline V3 add(V3 a,V3 b){return {a[0]+b[0],a[1]+b[1],a[2]+b[2]};}
inline V3 sub(V3 a,V3 b){return {a[0]-b[0],a[1]-b[1],a[2]-b[2]};}
inline V3 mul(V3 a,double b){return {a[0]*b,a[1]*b,a[2]*b};}
inline double dot(V3 a,V3 b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
inline V3 cross(V3 a,V3 b){return {a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]};}
inline V3 unit(V3 a,V3 fallback){double d=std::sqrt(dot(a,a));return d>1e-20&&std::isfinite(d)?mul(a,1/d):fallback;}
inline V3 axis(V3 a,bool zup){return zup?V3{a[0],-a[2],a[1]}:a;}
struct Vertex{V3 p,n,u,v;UV uv;};
struct Mesh{std::vector<Vertex> vertices;std::vector<uint16_t> indices,polys;int material=-1;unsigned degenerate=0,uvFallback=0,isolated=0;};
// CPU-posed input, no second skinning; right-handed Y->Z conversion is opt-in.
inline Mesh build(const std::vector<V3>& pos,const std::vector<uint32_t>& ix,const std::vector<UV>& uv,int material=-1,bool zup=false,double scale=1){
    check(!pos.empty()&&pos.size()<=65535,"vertex count out of range");
    check(!ix.empty()&&ix.size()%3==0&&ix.size()<=65535,"16-bit polygon offset limit");
    check(uv.size()==pos.size(),"UV0 required");check(std::isfinite(scale)&&scale>0,"invalid scale");
    Mesh m;m.material=material;m.vertices.resize(pos.size());m.polys.push_back(0);
    std::vector<V3> ns(pos.size()),ts(pos.size()),bs(pos.size());
    for(size_t i=0;i<pos.size();++i){auto p=mul(axis(pos[i],zup),scale);for(auto x:p)check(std::isfinite(x)&&std::abs(x)<=std::numeric_limits<float>::max(),"nonfinite position");for(auto x:uv[i])check(std::isfinite(x)&&x>=-15.999&&x<=15.999,"UV exceeds engine short range");m.vertices[i].p=p;m.vertices[i].uv=uv[i];}
    for(size_t i=0;i<ix.size();i+=3){uint32_t a=ix[i],b=ix[i+1],c=ix[i+2];check(a<pos.size()&&b<pos.size()&&c<pos.size(),"index out of bounds");
        auto e=sub(m.vertices[b].p,m.vertices[a].p),f=sub(m.vertices[c].p,m.vertices[a].p),n=cross(e,f);double area=std::sqrt(dot(n,n));if(!(area>1e-20&&std::isfinite(area))){++m.degenerate;continue;}
        for(auto j:{a,b,c}){ns[j]=add(ns[j],n);m.indices.push_back(uint16_t(j));}m.polys.push_back(uint16_t(m.indices.size()));
        double x=uv[b][0]-uv[a][0],y=uv[b][1]-uv[a][1],z=uv[c][0]-uv[a][0],w=uv[c][1]-uv[a][1],d=x*w-y*z;
        if(std::abs(d)>1e-12){auto t=mul(sub(mul(e,w),mul(f,y)),area/d),bt=mul(sub(mul(f,x),mul(e,z)),area/d);for(auto j:{a,b,c}){ts[j]=add(ts[j],t);bs[j]=add(bs[j],bt);}}
        else ++m.uvFallback;
    }
    check(!m.indices.empty(),"no nondegenerate triangles");
    for(size_t i=0;i<pos.size();++i){auto&v=m.vertices[i];if(dot(ns[i],ns[i])<=1e-40)++m.isolated;v.n=unit(ns[i],{0,0,1});auto tangent=sub(ts[i],mul(v.n,dot(v.n,ts[i])));auto reference=std::abs(v.n[0])<0.8?V3{1,0,0}:V3{0,1,0};v.u=unit(tangent,unit(sub(reference,mul(v.n,dot(reference,v.n))),{0,0,1}));auto bitangent=cross(v.n,v.u);v.v=mul(bitangent,dot(bitangent,bs[i])<0?-1:1);}
    return m;
}
}
