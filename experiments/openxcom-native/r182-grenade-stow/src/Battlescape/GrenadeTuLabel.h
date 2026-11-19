#pragma once
// R182: user-readable grenade TU budget with hand-freeing route details.
// Independent of game render state to keep edge cases unit-testable.
#include <algorithm>
#include <sstream>
#include <string>

namespace OpenXcom
{

enum R182ClearMode
{
    R182_CLEAR_NONE,
    R182_CLEAR_STOW,
    R182_CLEAR_DROP,
    R182_CLEAR_BLOCKED
};

inline std::string r182GrenadeTuLabel(int primeTu, int throwTu, int retrieveTu,
    int clearTu, R182ClearMode clearMode, bool primed, int availableTu,
    bool tactical, int style)
{
    primeTu = std::max(0, primeTu);
    throwTu = std::max(0, throwTu);
    retrieveTu = std::max(0, retrieveTu);
    clearTu = std::max(0, clearTu);
    const int activePrime = primed ? 0 : primeTu;
    const int totalTu = clearTu + retrieveTu + activePrime + throwTu;
    const bool shortOnTu = tactical && availableTu >= 0 && totalTu > availableTu;

    if (clearMode == R182_CLEAR_BLOCKED)
        return style <= 1 ? "손 비우기 불가\n투척 준비 불가" : "NO FREE HAND";

    std::ostringstream label;
    if (style == 0)
    {
        if (clearMode == R182_CLEAR_STOW) label << "보" << clearTu << " ";
        else if (clearMode == R182_CLEAR_DROP) label << "놓" << clearTu << " ";
        if (retrieveTu) label << "꺼" << retrieveTu << " ";
        if (primed) label << "장전됨 ";
        else label << "장" << primeTu << " ";
        label << "투" << throwTu << "\n";
        if (shortOnTu) label << "필" << totalTu << " 잔" << availableTu << "!";
        else label << "합" << totalTu << "TU";
    }
    else if (style == 1)
    {
        if (clearMode == R182_CLEAR_STOW) label << "S" << clearTu << "+";
        else if (clearMode == R182_CLEAR_DROP) label << "D" << clearTu << "+";
        if (retrieveTu) label << "R" << retrieveTu << "+";
        label << "P" << activePrime << "+T" << throwTu << "\n";
        if (shortOnTu) label << totalTu << ">" << availableTu << "!";
        else label << "TU" << totalTu;
    }
    else if (style == 2)
    {
        if (clearMode == R182_CLEAR_STOW) label << "S" << clearTu;
        else if (clearMode == R182_CLEAR_DROP) label << "D" << clearTu;
        if (retrieveTu) label << "R" << retrieveTu;
        label << " " << activePrime << "+" << throwTu << "\n";
        if (shortOnTu) label << totalTu << ">" << availableTu << "!";
        else label << "TU" << totalTu;
    }
    else
    {
        label << totalTu << " TU";
        if (shortOnTu) label << "!";
    }
    return label.str();
}

} // namespace OpenXcom
