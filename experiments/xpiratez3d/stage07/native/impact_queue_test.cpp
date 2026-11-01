#include "NativeImpactTrace.h"
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <thread>
#include <vector>
int main() {
    using namespace OpenXcom::NativeImpactTrace;
    unsetenv("XPZ_NATIVE_IMPACT_TRACE");
    record(18, 24, 8, 2, 50, 45, 35, 0, 21, 1);
    int dropped=-1;
    assert(drain(&dropped).empty() && dropped==0);
    setenv("XPZ_NATIVE_IMPACT_TRACE","1",1);
    record(18, 24, 8, 2, 50, 45, 35, 1, 21, 1);
    auto a=drain(&dropped);
    assert(a.size()==1 && dropped==0);
    assert(a[0].vx==18 && a[0].vy==24 && a[0].vz==8);
    assert(a[0].part==2 && a[0].rolled_damage==45 && a[0].tile_damage==35);
    assert(drain(&dropped).empty() && dropped==0);
    std::vector<std::thread> threads;
    for(int tid=0;tid<4;++tid)threads.emplace_back([tid](){
        for(int i=0;i<2000;++i)record(tid,i,0,1,10,5,4,0,tid,0);
    });
    for(auto& thread:threads)thread.join();
    a=drain(&dropped);
    assert(a.size()==8000 && dropped==0);
    for(int i=0;i<70000;++i)record(i,1,2,0,12,8,3,0,-1,0);
    a=drain(&dropped);
    assert(a.size()==65536 && dropped==4464);
    assert(drain(&dropped).empty() && dropped==0);
    std::cout<<"PASS optional OXCE impact queue disabled, single, concurrency, overflow\n";
}
