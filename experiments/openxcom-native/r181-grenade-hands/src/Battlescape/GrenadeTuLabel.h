#pragma once
// R181: true minimum grenade ready cost with an optional hand-clear action.
// Pure formatting keeps the HUD contracts independently unit-testable.
#include <algorithm>
#include <sstream>
#include <string>

namespace OpenXcom
{

inline std::string r181GrenadeTuLabel(int primeTu, int throwTu, int retrieveTu,
    int clearTu, bool noHandPath, bool primed, int availableTu, bool tactical, int style)
{
    primeTu = std::max(0, primeTu);
    throwTu = std::max(0, throwTu);
    retrieveTu = std::max(0, retrieveTu);
    clearTu = std::max(0, clearTu);
    const int activePrime = primed ? 0 : primeTu;
    const int total = clearTu + retrieveTu + activePrime + throwTu;
    const bool shortOnTu = tactical && availableTu >= 0 && total > availableTu;
    if (noHandPath)
        return style <= 1 ? "손 비우기 불가\n투척 준비 불가" : "NO FREE HAND";

    std::ostringstream s;
    if (style <= 0)
    {
        if (clearTu) s << "비" << clearTu << " ";
        if (retrieveTu) s << "꺼" << retrieveTu << " ";
        if (primed) s << "장전됨 ";
        else s << "장" << primeTu << " ";
        s << "투" << throwTu << "\n";
        if (shortOnTu) s << "필" << total << " 잔" << availableTu << "!";
        else s << "합" << total << "TU";
    }
    else if (style == 1)
    {
        if (clearTu) s << "D" << clearTu << "+";
        if (retrieveTu) s << "R" << retrieveTu << "+";
        s << "P" << activePrime << "+T" << throwTu << "\n";
        if (shortOnTu) s << total << ">" << availableTu << "!";
        else s << "TU" << total;
    }
    else if (style == 2)
    {
        if (clearTu) s << "D" << clearTu;
        if (retrieveTu) s << "R" << retrieveTu;
        s << " " << activePrime << "+" << throwTu << "\n";
        if (shortOnTu) s << total << ">" << availableTu << "!";
        else s << "TU" << total;
    }
    else
    {
        // If the label panel is too narrow, always show the required budget.
        s << total << " TU";
        if (shortOnTu) s << "!";
    }
    return s.str();
}

} // namespace OpenXcom
