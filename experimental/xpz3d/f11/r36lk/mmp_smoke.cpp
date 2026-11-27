// SPDX-License-Identifier: MIT
#include "native_mmp.hpp"
#include <iostream>
int main(int argc,char**argv){if(argc<2)return 2;try{for(int i=1;i<argc;++i){auto m=XPZLK::read(argv[i]);auto&l=m.levels.front();std::cout<<argv[i]<<": "<<l.w<<"x"<<l.h<<" "<<m.levels.size()<<" mips\n";}}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
