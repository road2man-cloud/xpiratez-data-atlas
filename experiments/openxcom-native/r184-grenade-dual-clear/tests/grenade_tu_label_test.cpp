#include "../src/Battlescape/GrenadeTuLabel.h"
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace OpenXcom;
void ok(const char *name,bool value) {
 if(!value) throw std::runtime_error(name);
 std::cout<<"PASS "<<name<<"\n";
}
int main() {
 ok("hand-dual",r184HandClearTarget(true,true,true,false)==R184_HAND_CLEAR_TWO);
 ok("hand-other",r184HandClearTarget(false,true,true,false)==R184_HAND_CLEAR_OTHER);
 ok("hand-free",r184HandClearTarget(false,true,false,false)==R184_HAND_CLEAR_NONE);
 const void *a=reinterpret_cast<const void*>(101);
 const void *b=reinterpret_cast<const void*>(202);
 const void *g=reinterpret_cast<const void*>(303);
 R184Placement p{a,0,0,2,2,4,false},overlap{a,1,1,2,2,1,false};
 R184Placement free{a,2,0,2,2,7,false},other{b,0,0,2,2,5,false};
 R184Placement drop{g,0,0,2,2,6,true},dropFar{g,3,0,2,2,9,true};
 ok("rect-collision",r184PlacesConflict(p,overlap));
 ok("rect-free",!r184PlacesConflict(p,free));
 ok("different-section",!r184PlacesConflict(p,other));
 ok("ground-free",!r184PlacesConflict(drop,dropFar));
 std::vector<R184Placement> first{p,drop},second{overlap,other};
 auto best=r184BestClearPlan(first,&second);
 ok("two-move-lowest",best.valid && best.moves==2 && best.cost==7 && best.mode==R184_CLEAR_MIXED);
 std::vector<R184Placement> empty;
 ok("empty-blocked",!r184BestClearPlan(first,&empty).valid);
 auto one=r184BestClearPlan(first);
 ok("single-cheapest",one.valid && one.cost==4 && one.moves==1);
 std::vector<R184Placement> onlyDrop{drop};
 auto mix=r184BestClearPlan(onlyDrop,&second);
 ok("mixed-route",mix.valid && mix.cost==7 && mix.mode==R184_CLEAR_MIXED);
 std::vector<R184Placement> secondDrop{dropFar};
 auto bothDrop=r184BestClearPlan(onlyDrop,&secondDrop);
 ok("two-drop",bothDrop.valid && bothDrop.cost==15 && bothDrop.mode==R184_CLEAR_DROP);
 ok("grenade-two-clear-label",
 r184GrenadeTuLabel(12,18,4,9,R184_CLEAR_STOW,2,false,45,true,0)==
 u8"2\uD68C \uBCF49 \uAEBC4 \uC7A512 \uD22C18\n\uD56943TU");
 ok("narrow-keeps-prime-throw",
 r184GrenadeTuLabel(12,18,4,9,R184_CLEAR_MIXED,2,false,20,true,4)=="P12/T18!");
 ok("blocked-label",
 r184GrenadeTuLabel(12,18,0,0,R184_CLEAR_BLOCKED,2,false,35,true,3)=="ROUTE ?");
 ok("primed-zero-prime",
 r184GrenadeTuLabel(12,18,4,9,R184_CLEAR_MIXED,2,true,45,true,3)=="P0/T18\n31TU");
 return 0;
}
