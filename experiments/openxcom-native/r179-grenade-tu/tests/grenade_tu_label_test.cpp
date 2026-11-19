#include "../src/Battlescape/GrenadeTuLabel.h"
#include <iostream>
#include <stdexcept>
#include <string>

static void require(const char *name, const std::string &actual, const std::string &expected)
{
    if (actual != expected)
    {
        std::cerr << "FAIL " << name << "\n";
        throw std::runtime_error(name);
    }
    std::cout << "PASS " << name << "\n";
}

int main()
{
    using OpenXcom::r179GrenadeTuLabel;
    require("normal-ready", r179GrenadeTuLabel(12, 18, false, 35, true, 0),
            "장전12 투척18\n합계30TU");
    require("normal-short", r179GrenadeTuLabel(12, 18, false, 20, true, 0),
            "장전12 투척18\n필30 잔20!");
    require("primed-ready", r179GrenadeTuLabel(12, 18, true, 20, true, 0),
            "장전완료\n투척18 합계18TU");
    require("primed-short", r179GrenadeTuLabel(12, 18, true, 9, true, 0),
            "장전완료\n투척18 필18 잔9!");
    require("prebattle-ignore", r179GrenadeTuLabel(12, 18, false, 0, false, 0),
            "장전12 투척18\n합계30TU");
    require("compact-short", r179GrenadeTuLabel(12, 18, false, 20, true, 1),
            "장12 투18\n필30 잔20!");
    require("compact-primed", r179GrenadeTuLabel(12, 18, true, 20, true, 1),
            "완료 투18\n합18TU");
    require("ascii-wide", r179GrenadeTuLabel(123, 155, false, 999, true, 2),
            "P123 T155\nSUM278TU");
    require("ascii-short", r179GrenadeTuLabel(12, 18, false, 5, true, 2),
            "P12 T18\n30>5TU!");
    require("negative-clamp", r179GrenadeTuLabel(-4, 17, false, 0, false, 1),
            "장0 투17\n합17TU");
    return 0;
}
