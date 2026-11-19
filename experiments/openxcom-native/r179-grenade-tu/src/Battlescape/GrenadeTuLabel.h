#pragma once
// R179 grenade inventory label: engine TU costs, actual priming state and
// remaining turn budget, constrained to the original two-line 66px panel.
// This helper is independent from OpenXcom UI to permit compilation tests.
#include <algorithm>
#include <sstream>
#include <string>

namespace OpenXcom
{

inline std::string r179GrenadeTuLabel(int primeTu, int throwTu, bool alreadyPrimed,
                                      int availableTu, bool tactical, int style)
{
    primeTu = std::max(0, primeTu);
    throwTu = std::max(0, throwTu);
    const int effectivePrime = alreadyPrimed ? 0 : primeTu;
    const int required = effectivePrime + throwTu;
    const bool shortOnTu = tactical && availableTu >= 0 && required > availableTu;
    std::ostringstream label;

    if (style <= 0)
    {
        if (alreadyPrimed)
            label << "장전완료\n투척" << throwTu;
        else
            label << "장전" << primeTu << " 투척" << throwTu;
        if (alreadyPrimed) label << " ";
        else label << "\n";
        if (shortOnTu)
            label << "필" << required << " 잔" << availableTu << "!";
        else
            label << "합계" << required << "TU";
    }
    else if (style == 1)
    {
        if (alreadyPrimed)
            label << "완료 투" << throwTu;
        else
            label << "장" << primeTu << " 투" << throwTu;
        if (shortOnTu)
            label << "\n필" << required << " 잔" << availableTu << "!";
        else
            label << "\n합" << required << "TU";
    }
    else
    {
        label << "P" << effectivePrime << " T" << throwTu << "\n";
        if (shortOnTu)
            label << required << ">" << availableTu << "TU!";
        else
            label << "SUM" << required << "TU";
    }
    return label.str();
}

} // namespace OpenXcom
