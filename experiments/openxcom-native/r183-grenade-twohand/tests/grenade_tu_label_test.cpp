// Standalone C++ regression tests for R183 grenade HUD route labels.
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
    require("hand-ready", r183GrenadeTuLabel(12,18,0,0,R183_CLEAR_NONE,false,35,true,0),
            "장12 투18\n합30TU");
    require("belt-ready", r183GrenadeTuLabel(12,18,4,0,R183_CLEAR_NONE,false,40,true,0),
            "꺼4 장12 투18\n합34TU");
    require("stow-occupied-hand", r183GrenadeTuLabel(12,18,4,6,R183_CLEAR_STOW,false,45,true,0),
            "보6 꺼4 장12 투18\n합40TU");
    require("drop-occupied-hand", r183GrenadeTuLabel(12,18,4,6,R183_CLEAR_DROP,false,45,true,0),
            "놓6 꺼4 장12 투18\n합40TU");
    require("stow-insufficient", r183GrenadeTuLabel(12,18,4,6,R183_CLEAR_STOW,false,30,true,0),
            "보6 꺼4 장12 투18\n필40 잔30!");
    require("primed-stowed", r183GrenadeTuLabel(12,18,4,6,R183_CLEAR_STOW,true,30,true,0),
            "보6 꺼4 장전됨 투18\n합28TU");
    require("blocked", r183GrenadeTuLabel(12,18,0,0,R183_CLEAR_BLOCKED,false,35,true,0),
            "손 비우기 불가\n투척 준비 불가");
    require("blocked-ascii", r183GrenadeTuLabel(12,18,0,0,R183_CLEAR_BLOCKED,false,35,true,3),
            "NO FREE HAND");
    require("compact-stowed", r183GrenadeTuLabel(12,18,4,6,R183_CLEAR_STOW,false,20,true,1),
            "S6+R4+P12+T18\n40>20!");
    require("compact-dropped", r183GrenadeTuLabel(12,18,4,6,R183_CLEAR_DROP,false,20,true,1),
            "D6+R4+P12+T18\n40>20!");
    require("prebattle", r183GrenadeTuLabel(12,18,0,0,R183_CLEAR_NONE,false,0,false,0),
            "장12 투18\n합30TU");
    require("compact-fallback", r183GrenadeTuLabel(125,200,30,20,R183_CLEAR_STOW,false,100,true,3),
            "P125/T200\n375TU!");
    require("narrow-last-resort", r183GrenadeTuLabel(125,200,30,20,R183_CLEAR_STOW,false,100,true,4),
            "P125/T200!");
    require("clamp", r183GrenadeTuLabel(-5,18,-2,-4,R183_CLEAR_NONE,false,0,false,1),
            "P0+T18\nTU18");
    require("primed-total", r183GrenadeTuLabel(15,20,5,2,R183_CLEAR_DROP,true,27,true,3),
            "P0/T20\n27TU");
    require("one-hand-clear", std::to_string(r183HandClearTarget(true,false,false,false)),
            std::to_string(R183_HAND_CLEAR_SELECTED));
    require("empty-hand-opposite-twohand", std::to_string(r183HandClearTarget(false,true,true,false)),
            std::to_string(R183_HAND_CLEAR_OTHER));
    require("empty-hand-ordinary-other", std::to_string(r183HandClearTarget(false,true,false,false)),
            std::to_string(R183_HAND_CLEAR_NONE));
    require("both-occupied-blocking", std::to_string(r183HandClearTarget(true,true,true,false)),
            std::to_string(R183_HAND_CLEAR_TWO));
    require("blocking-grenade-needs-other", std::to_string(r183HandClearTarget(false,true,false,true)),
            std::to_string(R183_HAND_CLEAR_OTHER));
    require("blocking-grenade-two-clear", std::to_string(r183HandClearTarget(true,true,false,true)),
            std::to_string(R183_HAND_CLEAR_TWO));
    return 0;
}
