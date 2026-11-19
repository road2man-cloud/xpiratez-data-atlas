#include "../src/Battlescape/GroundScan.h"
#include <stdexcept>
#include <iostream>
using namespace OpenXcom;
static void check(const char*name,bool okay) {
 if(!okay)throw std::runtime_error(name);
 std::cout<<"PASS "<<name<<"\n";
}
int main() {
 auto no=r186GroundWindows(0,40);
 check("zero-width-invalid",no.empty());
 auto empty=r186GroundWindows(12,0);
 check("empty-early",empty.size()==2 && empty[0].beginX==0 && empty[0].endX==24);
 check("empty-tail",empty[1].beginX==24 && empty[1].endX==48);
 auto nearby=r186GroundWindows(12,15);
 check("near-occupancy-tail",nearby[1].beginX==24 && nearby[1].endX==48);
 auto distant=r186GroundWindows(12,1920);
 check("far-beyond-six-pages",distant[1].beginX==1920 && distant[1].endX==1944);
 auto distantOff=r186GroundWindows(12,1925);
 check("far-item-misaligned",distantOff[1].beginX==1932 && distantOff[1].endX==1956);
 auto neg=r186GroundWindows(12,-100);
 check("negative-clamped",neg[1].beginX==24);
 R186GroundPageBudget b(12,2);
 check("accept-first",b.canAccept(0));
 b.accepted(0);
 b.accepted(1);
 check("reject-third-same-page",!b.canAccept(2));
 check("allow-next-page",b.canAccept(12));
 b.accepted(12);
 check("allow-second-next-page",b.canAccept(13));
 b.accepted(13);
 check("reject-third-next-page",!b.canAccept(14));
 check("allow-far-page",b.canAccept(1920));
 return 0;
}
