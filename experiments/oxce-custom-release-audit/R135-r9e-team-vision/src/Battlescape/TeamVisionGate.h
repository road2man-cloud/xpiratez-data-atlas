#pragma once
/*
 * R135-R9E: team-wide hostile discovery gate shared by walking and turning.
 * Header-only on purpose: no new state fields, new linker units, or ABI changes.
 *
 * Team baseline contains currently team-visible hostiles plus enemies spotted
 * earlier this turn by any living PLAYER unit. A unit the runner sees later is
 * not "new" if another teammate already has it in either cache.
 */
#include <set>
#include "../Savegame/BattleUnit.h"
#include "../Savegame/SavedBattleGame.h"

namespace OpenXcom
{
inline std::set<BattleUnit*> r9eCaptureTeamKnown(SavedBattleGame *save)
{
    std::set<BattleUnit*> result;
    if (!save || save->getSide() != FACTION_PLAYER) return result;

    // The battlewide visibility bit can be set by a teammate before its
    // individual FOV list is refreshed. Include that existing knowledge.
    for (BattleUnit *enemy : *save->getUnits())
        if (enemy && enemy->getFaction() == FACTION_HOSTILE &&
            !enemy->isOut() && enemy->getVisible())
            result.insert(enemy);

    for (BattleUnit *ally : *save->getUnits())
    {
        if (!ally || ally->getFaction() != FACTION_PLAYER || ally->isOut())
            continue;
        for (BattleUnit *enemy : *ally->getVisibleUnits())
            if (enemy && enemy->getFaction() == FACTION_HOSTILE && !enemy->isOut())
                result.insert(enemy);
        for (BattleUnit *enemy : ally->getUnitsSpottedThisTurn())
            if (enemy && enemy->getFaction() == FACTION_HOSTILE && !enemy->isOut())
                result.insert(enemy);
    }
    return result;
}

inline bool r9eTeamSawNewHostile(SavedBattleGame *save, std::set<BattleUnit*> &known)
{
    if (!save || save->getSide() != FACTION_PLAYER) return false;
    bool newForTeam = false;
    const std::set<BattleUnit*> latest = r9eCaptureTeamKnown(save);
    for (BattleUnit *enemy : latest)
        if (known.insert(enemy).second)
            newForTeam = true;
    return newForTeam;
}
}
