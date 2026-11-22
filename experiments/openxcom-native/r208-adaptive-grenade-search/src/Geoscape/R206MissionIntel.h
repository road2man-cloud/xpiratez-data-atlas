#pragma once
// R206: ruleset-only forecast. Never invent exact generated enemy counts.
#include <algorithm>
#include <string>
#include <vector>
#include "../Mod/AlienDeployment.h"
#include "../Mod/AlienRace.h"
#include "../Mod/Unit.h"
#include "../Mod/Mod.h"

namespace OpenXcom
{
struct R206MissionIntel
{
    bool valid = false;
    int minEnemies = 0;
    int maxEnemies = 0;
    std::string strongestType;
    int score = -1;
};
inline R206MissionIntel r206EstimateMissionIntel(const AlienDeployment *deployment,
    const Mod *mod, const std::string &raceType, int difficulty)
{
    R206MissionIntel intel;
    if (!deployment || !mod || !deployment->getDeploymentData()) return intel;
    const auto &data = *deployment->getDeploymentData();
    if (data.empty()) return intel;
    intel.valid = true;
    const std::string effectiveRace = deployment->getRace().empty()
        ? raceType : deployment->getRace();
    AlienRace *race = effectiveRace.empty() ? nullptr : mod->getAlienRace(effectiveRace, false);
    for (const DeploymentData &dd : data)
    {
        int base = dd.lowQty;
        switch (difficulty)
        {
        case 1: base = dd.medQty > 0 ? dd.lowQty + (dd.medQty - dd.lowQty) / 2 : dd.lowQty; break;
        case 2: base = dd.medQty > 0 ? dd.medQty : dd.lowQty + (dd.highQty - dd.lowQty) / 2; break;
        case 3: base = dd.medQty > 0 ? dd.medQty + (dd.highQty - dd.medQty) / 2
                              : dd.lowQty + (dd.highQty - dd.lowQty) / 2; break;
        case 4: base = dd.highQty; break;
        default: break;
        }
        const int bonus = std::max(0, dd.dQty) + std::max(0, dd.extraQty);
        const int minCount = std::max(0, base + (mod->isDemigod() ? bonus : 0));
        const int maxCount = std::max(0, base + bonus);
        intel.minEnemies += minCount;
        intel.maxEnemies += maxCount;
        if (!maxCount) continue;
        std::string unitId = dd.customUnitType;
        if (unitId.empty() && race && dd.alienRank >= 0 &&
            dd.alienRank < race->getMembers())
            unitId = race->getMember(dd.alienRank);
        if (unitId.empty()) continue;
        Unit *rule = mod->getUnit(unitId, false);
        if (!rule) continue;
        // Score is a threat proxy from the actual unit ruleset; gear,
        // procedural replacements and reinforcements may change the result.
        const UnitStats *stats = rule->getStats();
        const int score = rule->getValueKilled() * 10 +
            (stats ? stats->health + stats->firing + stats->melee +
                     stats->reactions + stats->strength : 0);
        if (score > intel.score)
        {
            intel.score = score;
            intel.strongestType = unitId;
        }
    }
    return intel;
}
}
