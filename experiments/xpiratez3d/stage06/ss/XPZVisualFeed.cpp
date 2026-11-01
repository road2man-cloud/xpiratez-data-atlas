// SPDX-License-Identifier: MIT
#include "XPZVisualFeed.h"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <limits>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif
namespace XPZVisual {
namespace {
bool fail(std::string* why, const std::string& reason) { if(why) *why=reason; return false; }
std::vector<std::string> split(const std::string& line) {
    std::vector<std::string> out; std::size_t start=0;
    while(true){auto end=line.find('\t',start); out.push_back(line.substr(start,end==std::string::npos?end:end-start)); if(end==std::string::npos) break;start=end+1;} return out;
}
bool number(const std::string& s, int* out, int min, int max) {
    if(s.empty() || s.size()>12) return false;
    std::size_t i=0; if(s[0]=='-') i=1; if(i==s.size())return false;
    for(;i<s.size();++i)if(s[i]<'0'||s[i]>'9')return false;
    try {long long n=std::stoll(s); if(n<min||n>max)return false;*out=static_cast<int>(n);return true;}catch(...){return false;}
}
bool hex64(const std::string& s){if(s.size()!=64)return false;for(char c:s)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;return true;}
bool fileName(const std::string& s){if(s.empty()||s.size()>95||s[0]=='.'||s.find("..")!=std::string::npos)return false;for(char c:s)if(!(std::isalnum(static_cast<unsigned char>(c))||c=='-'||c=='_'||c=='.'))return false;return true;}
}
bool Parse(const std::string& input, Scene* out, std::string* why) {
    if(!out)return fail(why,"null output");
    if(input.size()>8*1024*1024)return fail(why,"feed too large");
    std::istringstream stream(input); std::string line;
    if(!std::getline(stream,line))return fail(why,"missing header");
    const auto header=split(line);
    if(header.size()!=3||(header[0]!="XPZ3D2"&&header[0]!="XPZ3D3")||
       !hex64(header[1])||!hex64(header[2])) return fail(why,"invalid stream header");
    const bool v3 = header[0]=="XPZ3D3";
    Scene next; next.trace_sha256=header[1]; next.session_id=header[2];
    bool active=false;bool completed=false;int lastSeq=-1;int totalFrames=0;
    std::set<int> ids;
    while(std::getline(stream,line)){
        if(line.empty())return fail(why,"empty line");
        if(line.size()>4096)return fail(why,"oversize line");
        auto t=split(line);
        if(t[0]=="F"){
            if(active||t.size()!=8)return fail(why,"bad frame header");
            int seq,turn,side,cmd;
            if(!number(t[1],&seq,0,999999)||seq!=lastSeq+1||!number(t[2],&turn,0,999999)||
               !number(t[3],&side,0,8)||!number(t[4],&cmd,0,10000000)||!fileName(t[5])||
               !(t[6]=="-"||hex64(t[6]))||t[7]!="visual")return fail(why,"invalid frame fields");
            if(totalFrames>=10000)return fail(why,"too many frames");
            // Each frame is a transaction: mutations commit only on matching END.
            next.seq=seq;next.turn=turn;next.side=side;next.command_index=cmd;
            next.checkpoint_file=t[5];next.checkpoint_sha256=t[6];
            active=true;completed=false;ids.clear();lastSeq=seq;++totalFrames;
        }else if(t[0]=="U"){
            if(!active||t.size()!=12)return fail(why,"bad unit event");
            Unit u{};int* dest[]={&u.id,&u.faction,&u.status,&u.x,&u.y,&u.z,&u.tu,&u.health,&u.energy,&u.stun,&u.morale};
            const int lo[]={0,0,0,-100000,-100000,-1000,0,-100000,0,0,0};
            const int hi[]={10000000,8,1000,100000,100000,1000,10000,100000,10000,100000,10000};
            for(int i=0;i<11;++i)if(!number(t[i+1],dest[i],lo[i],hi[i]))return fail(why,"invalid unit numeric field");
            if(!ids.insert(u.id).second)return fail(why,"duplicate unit update");
            if(next.units.size()>=100000)return fail(why,"too many units");
            next.units[u.id]=u;
        }else if(t[0]=="D"){
            int id;
            if(!active||t.size()!=2||!number(t[1],&id,0,10000000)||!ids.insert(id).second||next.units.erase(id)!=1)return fail(why,"invalid unit removal");
        }else if(t[0]=="A"){
            if(!active||t.size()!=9)return fail(why,"invalid aimed action");
            Aim a{};
            if(!number(t[1],&a.command_index,0,10000000)||a.command_index!=next.command_index||
               !number(t[2],&a.actor,0,10000000)||!number(t[3],&a.item,0,10000000)||
               (t[4]!="snap"&&t[4]!="aimed"&&t[4]!="auto")||
               !number(t[5],&a.x,-100000,100000)||!number(t[6],&a.y,-100000,100000)||
               !number(t[7],&a.z,-1000,1000)||t[8]!="requested_aim_not_impact")return fail(why,"invalid aim data");
            a.mode=t[4];
            if(next.aims.size()==64) next.aims.erase(next.aims.begin());
            next.aims.push_back(a);
        }else if(t[0]=="I"){
            if(!active||!v3||t.size()!=13)return fail(why,"invalid OXCE hit event");
            ImpactVoxel impact{};
            int* dest[]={&impact.command_index,&impact.actor,&impact.vx,&impact.vy,&impact.vz,
                         &impact.part,&impact.power,&impact.rolled_damage,&impact.tile_damage,
                         &impact.terrain_visibility_changed,&impact.ranged};
            const int lo[]={0,-1,-100000,-100000,-1000,-10,1,-1000000,-1000000,0,0};
            const int hi[]={10000000,10000000,100000,100000,1000,1000,1000000,1000000,1000000,1,1};
            for(int i=0;i<11;++i)
                if(!number(t[i+1],dest[i],lo[i],hi[i]))return fail(why,"invalid hit value");
            if(impact.command_index!=next.command_index ||
               t[12]!="tile_engine_hit_damage_application_voxel")
               return fail(why,"hit identity/command mismatch");
            if(next.impacts.size()>=1024) next.impacts.erase(next.impacts.begin());
            next.impacts.push_back(impact);
        }else if(t[0]=="E"){
            int seq;
            if(!active||t.size()!=2||!number(t[1],&seq,0,999999)||seq!=lastSeq)return fail(why,"bad frame closing");
            active=false;completed=true;
        }else return fail(why,"unsupported command");
    }
    if(active||!completed||totalFrames==0)return fail(why,"incomplete feed transaction");
    *out=next; if(why)why->clear(); return true;
}
#ifdef _WIN32
namespace {
Scene g_scene;
DWORD g_lastPoll = 0;
std::string g_previousFile;
}
const Scene& CurrentScene(){return g_scene;}
void PollWin32() {
    const DWORD now=GetTickCount();if(now-g_lastPoll<200)return;g_lastPoll=now;
    char path[4096];DWORD n=GetEnvironmentVariableA("XPZ3D_VISUAL_FEED",path,static_cast<DWORD>(sizeof(path)));
    if(n==0||n>=sizeof(path))return;
    std::ifstream f(path,std::ios::binary|std::ios::ate);
    if(!f)return;
    const std::streamoff length=f.tellg();
    if(length<=0||length>8*1024*1024)return;
    f.seekg(0);std::string data(static_cast<std::size_t>(length),'\0');
    if(!f.read(&data[0],length))return;
    // Repeatedly ingesting the same immutable feed has no side effects.
    if(data==g_previousFile)return;
    Scene candidate;std::string reason;
    if(!Parse(data,&candidate,&reason)){
        OutputDebugStringA((std::string("[XPZ3D] feed rejected: ")+reason+"\n").c_str());
        return;
    }
    // Same-session full feed is append-only. Refuse rollback of frame sequence.
    if(g_scene.seq>=0 && candidate.session_id==g_scene.session_id && candidate.seq<=g_scene.seq)return;
    g_scene=candidate;g_previousFile=data;
    std::ostringstream msg;msg<<"[XPZ3D] visual checkpoint seq="<<g_scene.seq
        <<" units="<<g_scene.units.size()<<" aim_events="<<g_scene.aims.size()
        <<" damage_voxel_events="<<g_scene.impacts.size()<<" (NO game authority)\n";
    OutputDebugStringA(msg.str().c_str());
}
#endif
}
