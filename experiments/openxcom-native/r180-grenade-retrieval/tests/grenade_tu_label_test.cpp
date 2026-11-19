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
    using OpenXcom::r180GrenadeTuLabel;
    require("hand-ready", r180GrenadeTuLabel(12, 18, 0, false, 35, true, 0),
            "장12 투18\n합계30TU");
    require("belt-ready", r180GrenadeTuLabel(12, 18, 4, false, 40, true, 0),
            "꺼4 장12 투18\n합계34TU");
    require("belt-short", r180GrenadeTuLabel(12, 18, 4, false, 20, true, 0),
            "꺼4 장12 투18\n필34 잔20!");
    require("primed-belt", r180GrenadeTuLabel(12, 18, 4, true, 30, true, 0),
            "꺼4 장전완료 투18\n합계22TU");
    require("primed-short", r180GrenadeTuLabel(12, 18, 4, true, 16, true, 0),
            "꺼4 장전완료 투18\n필22 잔16!");
    require("prebattle", r180GrenadeTuLabel(12, 18, 0, false, 0, false, 0),
            "장12 투18\n합계30TU");
    require("compact", r180GrenadeTuLabel(12, 18, 4, false, 20, true, 1),
            "R4 P12 T18\n34>20!");
    require("compact-primed", r180GrenadeTuLabel(12, 18, 4, true, 99, true, 1),
            "R4 P0 T18\nSUM22TU");
    require("tiny", r180GrenadeTuLabel(12, 18, 4, false, 12, true, 2),
            "R4+12+18\n34>12!");
    require("fallback", r180GrenadeTuLabel(125, 200, 30, false, 100, true, 3),
            "필요 355 TU!");
    require("clamp", r180GrenadeTuLabel(-5, 18, -2, false, 0, false, 1),
            "P0 T18\nSUM18TU");
    return 0;
}
