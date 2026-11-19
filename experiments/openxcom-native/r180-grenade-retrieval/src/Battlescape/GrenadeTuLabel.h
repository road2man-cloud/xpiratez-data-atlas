#pragma once
// R180: grenade TU cost HUD, with retrieval from a storage slot to a hand.
// Deterministic formatter; keep independent of the game for direct C++ tests.
#include <algorithm>
#include <sstream>
#include <string>

namespace OpenXcom
{

inline std::string r180GrenadeTuLabel(int primeTu, int throwTu, int retrieveTu,
                                      bool primed, int availableTu, bool tactical,
                                      int style)
{
    primeTu = std::max(0, primeTu);
    throwTu = std::max(0, throwTu);
    retrieveTu = std::max(0, retrieveTu);
    const int effectivePrime = primed ? 0 : primeTu;
    const int requiredTu = retrieveTu + effectivePrime + throwTu;
    const bool insufficient = tactical && availableTu >= 0 && requiredTu > availableTu;

    std::ostringstream label;
    if (style <= 0)
    {
        if (retrieveTu)
            label << "꺼" << retrieveTu << " ";
        if (primed)
            label << "장전완료 투" << throwTu;
        else
            label << "장" << primeTu << " 투" << throwTu;
        label << "\n";
        if (insufficient)
            label << "필" << requiredTu << " 잔" << availableTu << "!";
        else
            label << "합계" << requiredTu << "TU";
    }
    else if (style == 1)
    {
        if (retrieveTu) label << "R" << retrieveTu << " ";
        label << "P" << effectivePrime << " T" << throwTu << "\n";
        if (insufficient)
            label << requiredTu << ">" << availableTu << "!";
        else
            label << "SUM" << requiredTu << "TU";
    }
    else if (style == 2)
    {
        if (retrieveTu)
            label << "R" << retrieveTu << "+";
        label << effectivePrime << "+" << throwTu << "\n";
        if (insufficient)
            label << requiredTu << ">" << availableTu << "!";
        else
            label << "TU" << requiredTu;
    }
    else
    {
        // Pathologically narrow screens: never clip the required total.
        label << "필요 " << requiredTu << " TU";
        if (insufficient) label << "!";
    }
    return label.str();
}

} // namespace OpenXcom
