#include "scene.hpp"
#include <iostream>
int main(int argc,char**argv){try{XPZLM::need(argc==2,"usage: smoke scene");auto s=XPZLM::load(argv[1]);size_t v=0,t=0;for(auto&m:s.meshes){v+=m.v.size()/32;t+=m.i.size()/6;}std::cout<<s.textures.size()<<" textures, "<<s.meshes.size()<<" meshes, "<<v<<" vertices, "<<t<<" triangles\n";}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
