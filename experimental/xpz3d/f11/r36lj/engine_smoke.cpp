// SPDX-License-Identifier: MIT
#include "StdAfx.h"
#include "silent_storm_adapter.h"
#include "packet_mesh.hpp"
// Link this translation unit into the real engine target; caller supplies a fresh object.
// 0 = assigned expected triangle count; negative = failure.
extern "C" int XPZLJ_AssignPacket(NGScene::CObjectInfo* target,const char* path,unsigned node,unsigned primitive,int clip,double time,int zup,double scale){
    if(!target||!path)return -1;
    try{XPZPacket::Packet p(path);auto mesh=XPZLJ::from_packet(p,node,primitive,clip,time,zup!=0,scale);XPZLJ::AssignFresh(*target,mesh);return target->GetTrisCount()==int(mesh.indices.size()/3)?0:-2;}catch(...){return -3;}
}
