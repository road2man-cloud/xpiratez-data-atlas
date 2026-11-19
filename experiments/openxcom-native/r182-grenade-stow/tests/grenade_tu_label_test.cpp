// Standalone C++ regression tests for R182 grenade HUD route labels.
// The path solver uses the game inventory rules; formatter tests remain pure.
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
    using namespace OpenXcom;
    require("hand-ready", r182GrenadeTuLabel(12,18,0,0,R182_CLEAR_NONE,false,35,true,0),
            "장12 투18\n합30TU");
    require("belt-ready", r182GrenadeTuLabel(12,18,4,0,R182_CLEAR_NONE,false,40,true,0),
            "꺼4 장12 투18\n합34TU");
    require("stow-occupied-hand", r182GrenadeTuLabel(12,18,4,6,R182_CLEAR_STOW,false,45,true,0),
            "보6 꺼4 장12 투18\n합40TU");
    require("drop-occupied-hand", r182GrenadeTuLabel(12,18,4,6,R182_CLEAR_DROP,false,45,true,0),
            "놓6 꺼4 장12 투18\n합40TU");
    require("stow-insufficient", r182GrenadeTuLabel(12,18,4,6,R182_CLEAR_STOW,false,30,true,0),
            "보6 꺼4 장12 투18\n필40 잔30!");
    require("primed-stowed", r182GrenadeTuLabel(12,18,4,6,R182_CLEAR_STOW,true,30,true,0),
            "보6 꺼4 장전됨 투18\n합28TU");
    require("blocked", r182GrenadeTuLabel(12,18,0,0,R182_CLEAR_BLOCKED,false,35,true,0),
            "손 비우기 불가\n투척 준비 불가");
    require("blocked-ascii", r182GrenadeTuLabel(12,18,0,0,R182_CLEAR_BLOCKED,false,35,true,3),
            "NO FREE HAND");
    require("compact-stowed", r182GrenadeTuLabel(12,18,4,6,R182_CLEAR_STOW,false,20,true,1),
            "S6+R4+P12+T18\n40>20!");
    require("compact-dropped", r182GrenadeTuLabel(12,18,4,6,R182_CLEAR_DROP,false,20,true,1),
            "D6+R4+P12+T18\n40>20!");
    require("prebattle", r182GrenadeTuLabel(12,18,0,0,R182_CLEAR_NONE,false,0,false,0),
            "장12 투18\n합30TU");
    require("compact-fallback", r182GrenadeTuLabel(125,200,30,20,R182_CLEAR_STOW,false,100,true,3),
            "375 TU!");
    require("clamp", r182GrenadeTuLabel(-5,18,-2,-4,R182_CLEAR_NONE,false,0,false,1),
            "P0+T18\nTU18");
    require("primed-total", r182GrenadeTuLabel(15,20,5,2,R182_CLEAR_DROP,true,27,true,3),
            "27 TU");
    return 0;
}
