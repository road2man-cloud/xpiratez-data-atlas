#include "../src/Battlescape/GrenadeTuLabel.h"
#include <iostream>
#include <stdexcept>
#include <string>

static void require(const char *name, const std::string &actual, const std::string &expected)
{
    if (actual != expected)
    {
        std::cerr << "FAIL " << name << ": got " << actual << " expected " << expected << "\n";
        throw std::runtime_error(name);
    }
    std::cout << "PASS " << name << "\n";
}
int main()
{
    using OpenXcom::r181GrenadeTuLabel;
    require("hand-ready", r181GrenadeTuLabel(12,18,0,0,false,false,35,true,0),
            "장12 투18\n합30TU");
    require("belt-ready", r181GrenadeTuLabel(12,18,4,0,false,false,40,true,0),
            "꺼4 장12 투18\n합34TU");
    require("occupied-hand", r181GrenadeTuLabel(12,18,4,6,false,false,45,true,0),
            "비6 꺼4 장12 투18\n합40TU");
    require("occupied-insufficient", r181GrenadeTuLabel(12,18,4,6,false,false,30,true,0),
            "비6 꺼4 장12 투18\n필40 잔30!");
    require("primed-belt-occupied", r181GrenadeTuLabel(12,18,4,6,false,true,30,true,0),
            "비6 꺼4 장전됨 투18\n합28TU");
    require("blocked-path", r181GrenadeTuLabel(12,18,0,0,true,false,35,true,0),
            "손 비우기 불가\n투척 준비 불가");
    require("blocked-ascii", r181GrenadeTuLabel(12,18,0,0,true,false,35,true,3),
            "NO FREE HAND");
    require("compact", r181GrenadeTuLabel(12,18,4,6,false,false,20,true,1),
            "D6+R4+P12+T18\n40>20!");
    require("prebattle", r181GrenadeTuLabel(12,18,0,0,false,false,0,false,0),
            "장12 투18\n합30TU");
    require("fallback", r181GrenadeTuLabel(125,200,30,20,false,false,100,true,3),
            "375 TU!");
    require("clamp", r181GrenadeTuLabel(-5,18,-2,-4,false,false,0,false,1),
            "P0+T18\nTU18");
    return 0;
}
