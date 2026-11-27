#include "xpz_packet.hpp"
#include <iomanip>
#include <iostream>
int main(int argc,char**argv){
    if(argc!=7){std::cerr<<"usage: mesh_export PACKET NODE PRIMITIVE CLIP(-1=rest) TIME OUT.obj\n";return 64;}
    try{XPZPacket::Packet p(argv[1]);auto g=XPZPacket::Evaluate(p,std::stoul(argv[2]),std::stoul(argv[3]),std::stoi(argv[4]),std::stod(argv[5]));std::ifstream exists(argv[6]);if(exists)throw std::runtime_error("output exists");std::ofstream out(argv[6]);if(!out)throw std::runtime_error("cannot create OBJ");out<<"# XPZPKT1 CPU-deformed positions; not a native game model\n"<<std::setprecision(10);for(auto&v:g.positions)out<<"v "<<v[0]<<' '<<v[1]<<' '<<v[2]<<'\n';for(size_t i=0;i<g.indices.size();i+=3)out<<"f "<<g.indices[i]+1<<' '<<g.indices[i+1]+1<<' '<<g.indices[i+2]+1<<'\n';if(!out)throw std::runtime_error("OBJ write failed");std::cout<<g.positions.size()<<" vertices, "<<g.indices.size()/3<<" triangles\n";return 0;}catch(const std::exception&e){std::cerr<<"ERROR: "<<e.what()<<'\n';return 1;}
}
