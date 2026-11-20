#pragma once
// R184: two-item grenade clearance planner, real-slot collision checks and
// compact TU presentation. This header does not mutate game state.
#include <algorithm>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

namespace OpenXcom
{

enum R184ClearMode
{
    R184_CLEAR_NONE,
    R184_CLEAR_STOW,
    R184_CLEAR_DROP,
    R184_CLEAR_MIXED,
    R184_CLEAR_BLOCKED
};

enum R184HandClearTarget
{
    R184_HAND_CLEAR_NONE,
    R184_HAND_CLEAR_SELECTED,
    R184_HAND_CLEAR_OTHER,
    R184_HAND_CLEAR_TWO
};

inline R184HandClearTarget r184HandClearTarget(bool selectedOccupied,
    bool otherOccupied, bool otherBlocksBoth, bool grenadeBlocksBoth)
{
    const bool clearSelected = selectedOccupied;
    const bool clearOther = otherOccupied && (otherBlocksBoth || grenadeBlocksBoth);
    if (clearSelected && clearOther) return R184_HAND_CLEAR_TWO;
    if (clearSelected) return R184_HAND_CLEAR_SELECTED;
    if (clearOther) return R184_HAND_CLEAR_OTHER;
    return R184_HAND_CLEAR_NONE;
}

// Section identity and real grid coordinates are supplied by the native
// inventory rules. Both worn slots and ground cells are collision-checked
// before a two-move route is accepted.
struct R184Placement
{
    const void *section = nullptr;
    int x = 0, y = 0, width = 0, height = 0;
    int moveTu = 0;
    bool ground = false;
};

inline bool r184PlacesConflict(const R184Placement &a, const R184Placement &b)
{
    if (!a.section || !b.section || a.section != b.section) return false;
    // Ground cells also have physical grid coordinates; never assume the
    // second dropped item can occupy the first dropped item's rectangle.
    return a.x < b.x + b.width && b.x < a.x + a.width &&
           a.y < b.y + b.height && b.y < a.y + a.height;
}

struct R184ClearPlan
{
    bool valid = false;
    int cost = 0;
    int moves = 0;
    int stows = 0;
    int drops = 0;
    R184ClearMode mode = R184_CLEAR_BLOCKED;
};

// Enumerate every feasible pair, rather than combining independent cheapest
// moves that might place both weapons in the *same* inventory cells.
inline R184ClearPlan r184BestClearPlan(const std::vector<R184Placement> &first,
    const std::vector<R184Placement> *second = nullptr)
{
    R184ClearPlan best;
    const auto evaluate = [&](const R184Placement &a, const R184Placement *b,
                              R184ClearPlan &result)
    {
        if (b && r184PlacesConflict(a, *b)) return;
        const int total = std::max(0, a.moveTu) +
                          (b ? std::max(0, b->moveTu) : 0);
        const int drops = (a.ground ? 1 : 0) + (b && b->ground ? 1 : 0);
        const int moves = b ? 2 : 1;
        if (!result.valid || total < result.cost ||
            (total == result.cost && drops < result.drops))
        {
            result.valid = true;
            result.cost = total;
            result.moves = moves;
            result.drops = drops;
            result.stows = moves - drops;
            result.mode = drops == 0 ? R184_CLEAR_STOW :
                          drops == moves ? R184_CLEAR_DROP : R184_CLEAR_MIXED;
        }
    };
    for (const auto &a : first)
    {
        if (!second) evaluate(a, nullptr, best);
        else for (const auto &b : *second) evaluate(a, &b, best);
    }
    return best;
}

inline std::string r184GrenadeTuLabel(int primeTu, int throwTu, int retrieveTu,
    int clearTu, R184ClearMode clearMode, int clearMoves, bool primed,
    int availableTu, bool tactical, int style)
{
    primeTu = std::max(0, primeTu);
    throwTu = std::max(0, throwTu);
    retrieveTu = std::max(0, retrieveTu);
    clearTu = std::max(0, clearTu);
    const int activePrime = primed ? 0 : primeTu;
    const int totalTu = clearTu + retrieveTu + activePrime + throwTu;
    const bool shortOnTu = tactical && availableTu >= 0 && totalTu > availableTu;

    if (clearMode == R184_CLEAR_BLOCKED)
        return style <= 1 ? "경로 미확인\n수동 이동 필요" : "ROUTE ?";
    std::ostringstream label;
    if (style == 0)
    {
        if (clearMoves == 2) label << "2회 ";
        if (clearMode == R184_CLEAR_STOW) label << "보" << clearTu << " ";
        else if (clearMode == R184_CLEAR_DROP) label << "놓" << clearTu << " ";
        else if (clearMode == R184_CLEAR_MIXED) label << "혼" << clearTu << " ";
        if (retrieveTu) label << "꺼" << retrieveTu << " ";
        if (primed) label << "장전됨 ";
        else label << "장" << primeTu << " ";
        label << "투" << throwTu << "\n";
        if (shortOnTu) label << "필" << totalTu << " 잔" << availableTu << "!";
        else label << "합" << totalTu << "TU";
    }
    else if (style == 1)
    {
        if (clearMoves == 2) label << "2";
        if (clearMode == R184_CLEAR_STOW) label << "S" << clearTu << "+";
        else if (clearMode == R184_CLEAR_DROP) label << "D" << clearTu << "+";
        else if (clearMode == R184_CLEAR_MIXED) label << "M" << clearTu << "+";
        if (retrieveTu) label << "R" << retrieveTu << "+";
        label << "P" << activePrime << "+T" << throwTu << "\n";
        if (shortOnTu) label << totalTu << ">" << availableTu << "!";
        else label << "TU" << totalTu;
    }
    else if (style == 2)
    {
        if (clearMoves == 2) label << "2";
        if (clearMode == R184_CLEAR_STOW) label << "S" << clearTu;
        else if (clearMode == R184_CLEAR_DROP) label << "D" << clearTu;
        else if (clearMode == R184_CLEAR_MIXED) label << "M" << clearTu;
        if (retrieveTu) label << "R" << retrieveTu;
        label << " " << activePrime << "+" << throwTu << "\n";
        if (shortOnTu) label << totalTu << ">" << availableTu << "!";
        else label << "TU" << totalTu;
    }
    else if (style == 3)
    {
        // Always preserve the direct prime and throw costs in narrow HUDs.
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
