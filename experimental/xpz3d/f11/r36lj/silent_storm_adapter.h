// SPDX-License-Identifier: MIT
#pragma once
// Include from an engine translation unit after StdAfx.h, with Main on include path.
#include "GGeometry.h"
#include "mesh.hpp"
namespace XPZLJ {
inline void FillNative(NGScene::CObjectInfo::SData& data,const Mesh& m){
    static_assert(sizeof(NGScene::SVertex)==32,"unexpected engine vertex ABI");
    static_assert(sizeof(WORD)==2,"unexpected engine index ABI");
    data.verts.resize(m.vertices.size());data.weights.clear();
    for(size_t i=0;i<m.vertices.size();++i){const auto&v=m.vertices[i];auto&d=data.verts[i];
        auto cv=[](V3 p){return CVec3(float(p[0]),float(p[1]),float(p[2]));};
        d.pos=cv(v.p);d.tex=CVec2(float(v.uv[0]),float(v.uv[1]));
        NGfx::CalcCompactVector(&d.normal,cv(v.n));NGfx::CalcCompactVector(&d.texU,cv(v.u));NGfx::CalcCompactVector(&d.texV,cv(v.v));}
    data.geometry.indices.resize(m.indices.size());for(size_t i=0;i<m.indices.size();++i)data.geometry.indices[i]=m.indices[i];
    data.geometry.polys.resize(m.polys.size());for(size_t i=0;i<m.polys.size();++i)data.geometry.polys[i]=m.polys[i];
}
// A fresh target is required: AssignFast does not clear all old lightmap state.
inline void AssignFresh(NGScene::CObjectInfo& target,const Mesh& m){
    check(target.IsEmpty()&&target.GetVertices().empty()&&target.GetLMInfo().empty(),"fresh CObjectInfo required");
    NGScene::CObjectInfo::SData data;FillNative(data,m);target.AssignFast(data);
}
}
