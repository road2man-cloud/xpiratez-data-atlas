// SPDX-License-Identifier: MIT
#include "../r36lj/packet_mesh.hpp"
#include <fstream>
#include <iostream>
#include <iomanip>
#include <filesystem>
using namespace XPZLJ;
void u16(std::ostream& o,uint16_t x){o.put(char(x));o.put(char(x>>8));}
void u32(std::ostream& o,uint32_t x){for(int i=0;i<4;++i)o.put(char(x>>(8*i)));}
void fl(std::ostream& o,double x){float f=float(x);uint32_t u;std::memcpy(&u,&f,4);u32(o,u);}
uint32_t compact(V3 a){auto q=[](double x){return uint32_t(std::clamp(std::lround(float(x)*127)+128,0l,255l));};return q(a[2])|(q(a[1])<<8)|(q(a[0])<<16);}
int main(int argc,char** argv){
 try{
  check(argc==9,"usage: export packet node primitive clip seconds identity|zup scale new_dir");
  std::string axis=argv[6];check(axis=="identity"||axis=="zup","axis");
  XPZPacket::Packet p(argv[1]);auto m=from_packet(p,std::stoul(argv[2]),std::stoul(argv[3]),std::stoi(argv[4]),std::stod(argv[5]),axis=="zup",std::stod(argv[7]));
  std::filesystem::path d(argv[8]);check(std::filesystem::create_directory(d),"output exists");
  std::ofstream v(d/"vertices32.bin",std::ios::binary),i(d/"indices16.bin",std::ios::binary),s(d/"polys16.bin",std::ios::binary),o(d/"pose.obj");check(v&&i&&s&&o,"open output");o<<std::setprecision(10);
  for(const auto& a:m.vertices){for(auto x:a.p)fl(v,x);for(auto b:{a.n,a.u,a.v})u32(v,compact(b));for(auto x:a.uv)fl(v,x);o<<"v "<<a.p[0]<<' '<<a.p[1]<<' '<<a.p[2]<<'\n'<<"vt "<<a.uv[0]<<' '<<a.uv[1]<<'\n'<<"vn "<<a.n[0]<<' '<<a.n[1]<<' '<<a.n[2]<<'\n';}
  for(auto x:m.indices)u16(i,x);
  for(auto x:m.polys)u16(s,x);
  for(size_t k=0;k<m.indices.size();k+=3){o<<"f";for(int a=0;a<3;++a){auto x=m.indices[k+a]+1;o<<' '<<x<<'/'<<x<<'/'<<x;}o<<'\n';}
  v.close();i.close();s.close();o.close();check(v&&i&&s&&o,"output write");
  std::cout<<"{\"vertices\":"<<m.vertices.size()<<",\"triangles\":"<<m.indices.size()/3<<",\"material\":"<<m.material<<",\"degenerateFaces\":"<<m.degenerate<<",\"uvFallback\":"<<m.uvFallback<<",\"isolated\":"<<m.isolated<<"}\n";
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
