// SPDX-License-Identifier: MIT
#pragma once
// Include after real engine StdAfx.h; compilation against engine remains pending.
#include "GGeometry.h"
#include "scene.hpp"
namespace XPZLM {
inline void AssignFresh(NGScene::CObjectInfo& target,const Primitive& m){
 static_assert(sizeof(NGScene::SVertex)==32,"vertex ABI");
 need(target.IsEmpty()&&target.GetVertices().empty()&&target.GetLMInfo().empty(),"fresh object required");
 NGScene::CObjectInfo::SData d;d.verts.resize(m.v.size()/32);d.weights.clear();
 for(size_t k=0;k<d.verts.size();k++){auto p=k*32;auto& v=d.verts[k];v.pos=CVec3(fl(m.v,p),fl(m.v,p+4),fl(m.v,p+8));v.normal.dw=u32(m.v,p+12);v.texU.dw=u32(m.v,p+16);v.texV.dw=u32(m.v,p+20);v.tex=CVec2(fl(m.v,p+24),fl(m.v,p+28));}
 d.geometry.indices.resize(m.i.size()/2);for(size_t k=0;k<d.geometry.indices.size();k++)d.geometry.indices[k]=u16(m.i,k*2);
 d.geometry.polys.resize(m.o.size()/2);for(size_t k=0;k<d.geometry.polys.size();k++)d.geometry.polys[k]=u16(m.o,k*2);
 target.AssignFast(d);
}
}
