// SPDX-License-Identifier: MIT
#pragma once
// Include after engine StdAfx.h. This code targets actual engine API, not a mock.
#include "GfxBuffers.h"
#include "Gfx.h"
#include "GTexture.h"
#include "GMaterial.h"
#include "native_mmp.hpp"
namespace XPZLK {
// Fresh GPU texture only; caller retains the previously published resource until success.
// No NDb record is registered. GPU device must already be initialized.
inline NGfx::CTexture* CreateTexture(const MMP& m,bool wrap){
    require(!m.levels.empty()&&NGfx::Is3DActive(),"no texture/device");
    CObj<NGfx::CTexture> tex=NGfx::MakeTexture(int(m.levels.front().w),int(m.levels.front().h),int(m.levels.size()),NGfx::SPixel8888::ID,NGfx::REGULAR,wrap?NGfx::WRAP:NGfx::CLAMP);
    require(IsValid(tex),"MakeTexture failed");
    CDynamicCast<NGfx::I2DBuffer> buffer(tex.GetPtr());require(IsValid(buffer)&&buffer->GetNumMipLevels()>=int(m.levels.size()),"texture mip count");
    for(size_t i=0;i<m.levels.size();++i){const auto& l=m.levels[i];NGfx::CTextureLock<NGfx::SPixel8888> lock(tex.GetPtr(),int(i),NGfx::INPLACE);require(lock.GetXSize()==int(l.w)&&lock.GetYSize()==int(l.h),"texture lock size");
        for(uint32_t y=0;y<l.h;++y)for(uint32_t x=0;x<l.w;++x){const auto* p=l.bgra.data()+4*(size_t(y)*l.w+x);lock[y][x]=NGfx::SPixel8888(p[2],p[1],p[0],p[3]);}}
    return tex.Extract();
}
// Material creation takes the engine's existing texture function/provider, not raw CTexture*.
// Caller must supply an owned provider and bind the geometry. No guessed bump/PBR mapping.
inline NGScene::IMaterial* CreateDiffuse(CPtrFuncBase<NGfx::CTexture>* source,int alphaFlags){
    require(source!=nullptr,"texture provider missing");require(alphaFlags==0||alphaFlags==4||alphaFlags==1||alphaFlags==17,"unsupported alpha flags");
    return NGScene::CreateMaterial(CVec3(1,1,1),source,0,0,CVec3(0,0,0),0,0,0,0,0,alphaFlags,true);
}
}
