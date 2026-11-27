#include "XPZModelBridge.h"
#include <cassert>
#include <iostream>
struct Resource { uint64_t joints; size_t bytes; };
int main(int argc,char** argv) {
    if(argc!=5) return 64;
    XPZModel::Caps caps{75,4,4,1024,true,true,false};
    std::unique_ptr<Resource> active(new Resource{99,0});
    std::string why; int calls=0;
    auto importer=[&](const XPZModel::Prepared& p) {
        ++calls; return std::make_unique<Resource>(Resource{p.joints,p.glb.size()});
    };
    assert(XPZModel::Replace(active,argv[1],caps,importer,why));
    assert(active->joints==63 && active->bytes>0 && calls==1);
    Resource* previous=active.get();
    auto reject=[](const XPZModel::Prepared&) {return std::unique_ptr<Resource>();};
    assert(!XPZModel::Replace(active,argv[2],caps,reject,why) && active.get()==previous);
    assert(!XPZModel::Replace(active,argv[3],caps,importer,why) && active.get()==previous && calls==1);
    XPZModel::Caps limited{64,0,4,1024,false,true,false};
    assert(!XPZModel::Replace(active,argv[2],limited,importer,why) && active.get()==previous && calls==1);
    auto thrower=[](const XPZModel::Prepared&)->std::unique_ptr<Resource>{throw std::runtime_error("import failure");};
    assert(!XPZModel::Replace(active,argv[2],caps,thrower,why) && active.get()==previous);
    assert(!XPZModel::Replace(active,argv[4],caps,importer,why) && active.get()==previous && calls==1);
    assert(XPZModel::Replace(active,argv[2],caps,importer,why));
    assert(active->joints==75 && calls==2);
    std::cout<<"PASS 7 native bridge cases: load, reject, tamper, caps, throw, incomplete, swap\n";
}
