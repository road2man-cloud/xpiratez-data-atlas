// SPDX-License-Identifier: MIT
#pragma once
#include "../r36lh/xpz_packet.hpp"
#include "mesh.hpp"
namespace XPZLJ {
inline Mesh from_packet(const XPZPacket::Packet& p,uint32_t node,uint32_t primitive,int clip,double time,bool zup=false,double scale=1){
    auto g=XPZPacket::Evaluate(p,node,primitive,clip,time);
    auto mi=p.get("node/mesh").i(node);auto pre="mesh/"+std::to_string(mi)+"/prim/"+std::to_string(primitive)+"/";
    const auto& uv=p.get(pre+"TEXCOORD_0");uv.shape(1,uint32_t(g.positions.size()),2);
    std::vector<UV> u(g.positions.size());for(size_t i=0;i<u.size();++i)u[i]={uv.f(2*i),uv.f(2*i+1)};
    const auto& mat=p.get(pre+"material");mat.shape(4,1,1);
    return build(g.positions,g.indices,u,mat.i(0),zup,scale);
}
}
