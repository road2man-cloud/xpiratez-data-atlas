#include "XPZVisualFeed.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
int main(int argc,char** argv) {
 if(argc!=2) {std::cerr<<"usage: visual_feed_test <feed-file>\n";return 2;}
 std::ifstream in(argv[1],std::ios::binary);if(!in){std::cerr<<"cannot open\n";return 2;}
 std::string wire((std::istreambuf_iterator<char>(in)),std::istreambuf_iterator<char>());
 XPZVisual::Scene state;std::string error;
 if(!XPZVisual::Parse(wire,&state,&error)){std::cerr<<"REJECTED: "<<error<<"\n";return 3;}
 std::cout<<"ACCEPTED visual-only seq="<<state.seq<<" turn="<<state.turn<<" side="<<state.side
          <<" units="<<state.units.size()<<" requested_aims="<<state.aims.size()<<"\n";
 for(const auto& pair:state.units){const auto& u=pair.second;
    std::cout<<u.id<<" tile=["<<u.x<<","<<u.y<<","<<u.z<<"] hp="<<u.health<<" tu="<<u.tu<<"\n";}
 for(const auto& a:state.aims)std::cout<<"REQUESTED_AIM_ONLY actor="<<a.actor<<" item="<<a.item
    <<" target=["<<a.x<<","<<a.y<<","<<a.z<<"] mode="<<a.mode<<"\n";
 return 0;
}
