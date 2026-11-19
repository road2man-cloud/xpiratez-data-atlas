#pragma once
// R183: two-handed weapon-aware grenade TU budget and priority labels.
// Independent of game render state to keep edge cases unit-testable.
#include <algorithm>
#include <sstream>
#include <string>

namespace OpenXcom
{

enum R183ClearMode
{
    R183_CLEAR_NONE,
    R183_CLEAR_STOW,
    R183_CLEAR_DROP,
    R183_CLEAR_BLOCKED
};

// Required clearance when targeting a hand. The other hand must be cleared
// when it holds a weapon that blocks BOTH hands. A two-clear path is not
// promised by this one-clear preview; it must be calculated separately.
enum R183HandClearTarget
{
    R183_HAND_CLEAR_NONE,
    R183_HAND_CLEAR_SELECTED,
    R183_HAND_CLEAR_OTHER,
    R183_HAND_CLEAR_TWO
};

inline R183HandClearTarget r183HandClearTarget(bool selectedOccupied,
    bool otherOccupied, bool otherBlocksBoth, bool grenadeBlocksBoth)
{
    const bool clearSelected = selectedOccupied;
    const bool clearOther = otherOccupied && (otherBlocksBoth || grenadeBlocksBoth);
    if (clearSelected && clearOther) return R183_HAND_CLEAR_TWO;
    if (clearSelected) return R183_HAND_CLEAR_SELECTED;
    if (clearOther) return R183_HAND_CLEAR_OTHER;
    return R183_HAND_CLEAR_NONE;
}

inline std::string r183GrenadeTuLabel(int primeTu, int throwTu, int retrieveTu,
    int clearTu, R183ClearMode clearMode, bool primed, int availableTu,
    bool tactical, int style)
{
    primeTu = std::max(0, primeTu);
    throwTu = std::max(0, throwTu);
    retrieveTu = std::max(0, retrieveTu);
    clearTu = std::max(0, clearTu);
    const int activePrime = primed ? 0 : primeTu;
    const int totalTu = clearTu + retrieveTu + activePrime + throwTu;
    const bool shortOnTu = tactical && availableTu >= 0 && totalTu > availableTu;

    if (clearMode == R183_CLEAR_BLOCKED)
        return style <= 1 ? "손 비우기 불가\n투척 준비 불가" : "NO FREE HAND";

    std::ostringstream label;
    if (style == 0)
    {
        if (clearMode == R183_CLEAR_STOW) label << "보" << clearTu << " ";
        else if (clearMode == R183_CLEAR_DROP) label << "놓" << clearTu << " ";
        if (retrieveTu) label << "꺼" << retrieveTu << " ";
        if (primed) label << "장전됨 ";
        else label << "장" << primeTu << " ";
        label << "투" << throwTu << "\n";
        if (shortOnTu) label << "필" << totalTu << " 잔" << availableTu << "!";
        else label << "합" << totalTu << "TU";
    }
    else if (style == 1)
    {
        if (clearMode == R183_CLEAR_STOW) label << "S" << clearTu << "+";
        else if (clearMode == R183_CLEAR_DROP) label << "D" << clearTu << "+";
        if (retrieveTu) label << "R" << retrieveTu << "+";
        label << "P" << activePrime << "+T" << throwTu << "\n";
        if (shortOnTu) label << totalTu << ">" << availableTu << "!";
        else label << "TU" << totalTu;
    }
    else if (style == 2)
    {
        if (clearMode == R183_CLEAR_STOW) label << "S" << clearTu;
        else if (clearMode == R183_CLEAR_DROP) label << "D" << clearTu;
        if (retrieveTu) label << "R" << retrieveTu;
        label << " " << activePrime << "+" << throwTu << "\n";
        if (shortOnTu) label << totalTu << ">" << availableTu << "!";
        else label << "TU" << totalTu;
    }
    else if (style == 3)
    {
        // Essential P and T costs remain visible in compact layouts.
        label << "P" << activePrime << "/T" << throwTu << "\n";
        label << totalTu << "TU";
        if (shortOnTu) label << "!";
    }
    else
    {
        label << "P" << activePrime << "/T" << throwTu;
        if (shortOnTu) label << "!";
    }
    return label.str();
}

} // namespace OpenXcom
