/*
 * X-Piratez equipment comparator: deterministic ONE-TURN damage estimate.
 * R159 restores the separate-channel damage convention: the ordinary POWER
 * comparison uses HP damage after the target's armor. Pure stun-only weapons
 * use their post-armor stun contribution for an independent preview; a weapon
 * that damages both health and stun never adds these two effects together.
 * Target-specific immunities, defenses, terrain and scripts are unknown;
 * the resulting numbers are comparative, not guaranteed damage.
 */
#pragma once

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <memory>
#include <sstream>
#include <string>
#include <vector>
#include "../Engine/Game.h"
#include "../Engine/Options.h"
#include "../Engine/RNG.h"
#include "../Mod/RuleDamageType.h"
#include "../Mod/RuleItem.h"
#include "../Mod/RuleInventory.h"
#include "../Savegame/Base.h"
#include "../Savegame/BattleItem.h"
#include "../Savegame/BattleUnit.h"
#include "../Savegame/Soldier.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/SavedGame.h"

namespace OpenXcom
{
struct CombatPowerHudResult
{
    std::array<std::array<double, 3>, 3> values { };
    double total = 0.0;
    bool valid = false;
    bool applicable = false;
    bool selected = false;
    bool virtualAmmo = false;
    std::string soldier;
    std::string ammo;
    std::string mode;
};

// A distinct ammunition choice includes the weapon slot; multiple slots may
// accept the same cartridge but support different fire modes.
struct CombatPowerHudAmmoChoice
{
    const RuleItem *rule = nullptr;
    int slot = RuleItem::AmmoSlotSelfUse;
};

class CombatPowerHud
{
    static int indexRange(int i) { return i == 0 ? 14 : (i == 1 ? 28 : 40); }
    static int indexArmor(int i) { return i == 0 ? 20 : (i == 1 ? 40 : 80); }

    // Approximate a direct hit on a standard standing humanoid, using the
    // actual OXCE angular spread and its optional uniform-spread setting.
    // Sampling owns a PRIVATE RNG; opening this UI never alters combat RNG.
    static double hitProbability(int distance, int accuracy)
    {
        if (accuracy <= 0) return 0.0;
        RNG::RandomState rng(0x5d5515cc71ULL ^
            (uint64_t(unsigned(distance)) << 32) ^ uint64_t(unsigned(accuracy)));
        const int xDist = distance * 16;
        int xyShift = Options::oxceUniformShootingSpread ?
            int(xDist * 0.839) : xDist / 2;
        const int zShift = xyShift;
        unsigned hits = 0;
        for (int n = 0; n < 256; ++n)
        {
            int deviation = rng.generate(0, 100) - accuracy;
            deviation += deviation >= 0 ? 50 : 10;
            deviation = std::max(1, zShift * deviation / 200);
            int dY = 0;
            int dX = 0;
            if (Options::oxceUniformShootingSpread)
            {
                bool shifted = false;
                int spread = deviation;
                for (int retry = 0; retry < 10; ++retry)
                {
                    dY = rng.generate(0, spread) - spread / 2;
                    dX = rng.generate(0, spread) - spread / 2;
                    if (dY*dY + dX*dX <= (spread/2)*(spread/2)) break;
                    if (!shifted) { shifted = true; spread = std::max(1,int(spread*0.85)); }
                }
            }
            else
            {
                dY = rng.generate(0, deviation) - deviation / 2;
                dX = rng.generate(0, deviation) - deviation / 2;
            }
            // OXCE's final vertical spread is narrower than its lateral
            // spread. The 1x1 comparison body spans ~10x16 voxels.
            const int vertical = rng.generate(0, deviation / 2) / 2 - deviation / 8;
            if (std::abs(dY) <= 5 && std::abs(vertical) <= 8) ++hits;
        }
        return hits / 256.0;
    }

    static double armorDamage(const RuleDamageType *type, int power, int armor)
    {
        if (!type || power <= 0) return 0.0;
        RNG::RandomState rng(0x8430ab47e19ULL ^
            (uint64_t(unsigned(power)) << 18) ^ uint64_t(unsigned(armor)));
        auto sample = [&rng](int low, int high) -> int {
            return rng.generate(low, high);
        };
        double damage = 0.0;
        for (int n = 0; n < 192; ++n)
        {
            const int initial = type->getRandomDamage(power, sample);
            const double protectedPower = type->ArmorEffectiveness > 0.0f ?
                initial - armor * type->ArmorEffectiveness : double(initial);
            const double afterArmor = std::max(0.0, protectedPower);
            // R159: NEVER add stun to HP before or after armor for the
            // displayed damage score. First reduce the raw hit by armor;
            // THEN evaluate each effect independently. The ordinary weapon
            // preview is HP damage. A pure stun weapon instead uses its
            // separate post-armor stun channel, so it is not scored as zero.
            const double hpScale = std::max(0.0, double(type->ToHealth)) *
                (type->RandomHealth ? 0.5 : 1.0);
            const double stunScale = std::max(0.0, double(type->ToStun)) *
                (type->RandomStun ? 0.5 : 1.0);
            const double hpAfterArmor = afterArmor * hpScale;
            const double stunAfterArmor = afterArmor * stunScale;
            damage += hpScale > 0.0 ? hpAfterArmor : stunAfterArmor;
        }
        return damage / 192.0;
    }

    // Native inventory reloads take a cartridge from its section into a
    // hand, then pay RuleItem::getTULoad(). In squad preparation a spare may
    // still be on the ground, so estimate its first valid destination using
    // the same quickdraw/belt/shoulder/pack order as AutoAll.
    static int ammoToHandTUs(Game *game, BattleUnit *actor,
                             const RuleItem *ammoRule)
    {
        if (!game || !actor || !ammoRule) return -1;
        Mod *mod = game->getMod();
        const RuleInventory *hand = mod ? mod->getInventoryRightHand() : nullptr;
        if (!hand) return -1;
        int best = -1;
        for (BattleItem *carried : *actor->getInventory())
        {
            if (!carried || carried->getRules() != ammoRule ||
                !carried->getSlot() ||
                carried->getSlot()->getType() == INV_GROUND)
                continue;
            const int cost = carried->getMoveToCost(hand);
            if (best < 0 || cost < best) best = cost;
        }
        if (best >= 0) return best;

        const RuleInventory *options[] = {
            mod->getInventory("STR_QD_SLOT", false),
            mod->getInventoryBelt(),
            mod->getInventory("STR_LEFT_SHOULDER", false),
            mod->getInventory("STR_RIGHT_SHOULDER", false),
            mod->getInventoryBackpack()
        };
        int id = -751000;
        BattleItem preview(ammoRule, &id);
        for (const RuleInventory *section : options)
        {
            if (!section || section->getType() != INV_SLOT ||
                !ammoRule->canBePlacedIntoInventorySection(section))
                continue;
            for (const RuleSlot &position : *section->getSlots())
            {
                if (!section->fitItemInSlot(ammoRule, position.x, position.y))
                    continue;
                bool blocked = false;
                for (BattleItem *carried : *actor->getInventory())
                    if (carried && carried->getSlot() == section &&
                        carried->occupiesSlot(position.x, position.y, &preview))
                    { blocked = true; break; }
                if (blocked) continue;
                const int cost = section->getCost(hand);
                return cost == 0 ? 0 : std::max(1,
                    cost * ammoRule->getInventoryMoveCostPercent() / 100);
            }
        }
        return -1; // No reachable carried or prospective spare clip.
    }

public:
    // Discover every usable ammo and every self-powered fire mode. UI callers
    // must apply encyclopedia visibility filtering before displaying choices.
    static std::vector<CombatPowerHudAmmoChoice> ammoChoices(const RuleItem *rule,
                                                             int onlySlot = -2)
    {
        std::vector<CombatPowerHudAmmoChoice> choices;
        if (!rule) return choices;
        const RuleItemAction *configs[] = {
            rule->getBattleType() == BT_FIREARM ? rule->getConfigAuto() : nullptr,
            rule->getBattleType() == BT_FIREARM ? rule->getConfigSnap() : nullptr,
            rule->getBattleType() == BT_FIREARM ? rule->getConfigAimed() : nullptr,
            rule->getBattleType() == BT_MELEE ? rule->getConfigMelee() : nullptr
        };
        std::array<bool, RuleItem::AmmoSlotMax + 1> used {};
        for (const RuleItemAction *cfg : configs)
            if (cfg && cfg->shots > 0 && cfg->ammoSlot >= RuleItem::AmmoSlotSelfUse &&
                cfg->ammoSlot < RuleItem::AmmoSlotMax)
                used[size_t(cfg->ammoSlot + 1)] = true;
        if (used[0] && (onlySlot == -2 || onlySlot == RuleItem::AmmoSlotSelfUse))
            choices.push_back({rule, RuleItem::AmmoSlotSelfUse});
        for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
        {
            if (!used[size_t(slot + 1)] || (onlySlot != -2 && slot != onlySlot))
                continue;
            const auto *compatible = rule->getCompatibleAmmoForSlot(slot);
            if (!compatible) continue;
            if (compatible->empty() &&
                (rule->getClipSize() > 0 || rule->isAmmoRechargeable()))
                choices.push_back({rule, slot}); // Built-in weapon energy/ammunition.
            for (const RuleItem *ammo : *compatible)
                if (ammo) choices.push_back({ammo, slot});
        }
        return choices;
    }

    // An approximate THROW-only analogue of the nine-cell direct-fire score.
    // A blast has an area of effect: a missed point target may still be hit.
    // The damage/TU and all nine normalization anchors remain comparable,
    // but this is not an exact throw simulation (terrain is unavailable).
    static double estimateThrowableScore(Game *game, const RuleItem *rule,
                                         BattleUnit *actor)
    {
        if (!game || !rule || !actor || !rule->isGrenadeOrProxy()) return -1.0;
        const RuleDamageType *damage = rule->getDamageType();
        if (!damage) return -1.0;
        const int tu = actor->getActionTUs(BA_THROW, rule).Time +
            std::max(0, int(actor->getActionTUs(BA_PRIME, rule).Time));
        if (tu <= 0) return -1.0;
        // A single grenade is one physical item, not an infinite supply.
        if (actor->getBaseStats()->tu < tu) return 0.0;

        int tempId = -745001;
        BattleItem projectile(rule, &tempId);
        const int accuracy = BattleUnit::getFiringAccuracy(
            BattleActionAttack::GetBeforeShoot(BA_THROW, actor, &projectile),
            game->getMod());
        const int radius = std::max(0, rule->getExplosionRadius(
            BattleActionAttack::GetAferShoot(
                BA_THROW, actor, &projectile, &projectile)));
        const int depth = game->getSavedGame()->getSavedBattle() ?
            game->getSavedGame()->getSavedBattle()->getDepth() : 0;
        const double rangeReference[3] = {1.0, 0.60, 0.35};
        const double armorReference[3] = {1.0, 0.70, 0.45};
        double score = 0.0;
        for (int di = 0; di < 3; ++di)
        {
            const int distance = indexRange(di);
            if (rule->isOutOfThrowRange(distance * distance, depth)) continue;
            const double chance = std::min(1.0,
                hitProbability(distance, accuracy) *
                (1.0 + radius * radius / 2.0));
            for (int ai = 0; ai < 3; ++ai)
            {
                const double turnDamage = chance *
                    armorDamage(damage, rule->getPower(), indexArmor(ai));
                const double anchor = 60.0 * rangeReference[di] * armorReference[ai];
                score += (100.0 / 9.0) * turnDamage / (turnDamage + anchor);
            }
        }
        return score;
    }

    static CombatPowerHudResult calculate(Game *game, const RuleItem *rule,
                                          BattleItem *inventoryItem = nullptr,
                                          BattleUnit *preferred = nullptr,
                                          const RuleItem *forcedAmmo = nullptr,
                                          int forcedSlot = -2,
                                          bool forceOneHand = false,
                                          bool forceTwoHand = false,
                                          int forcedRounds = -1,
                                          int forcedPickupTU = -1)
    {
        CombatPowerHudResult result;
        if (!game || !rule || !game->getSavedGame()) return result;
        SavedBattleGame *battle = game->getSavedGame()->getSavedBattle();
        BattleUnit *actor = preferred ? preferred :
            (battle ? battle->getSelectedUnit() : nullptr);
        if (actor && (actor->isOut() || actor->getFaction() != FACTION_PLAYER))
            actor = nullptr;
        if (actor) result.selected = true;
        std::unique_ptr<BattleUnit> temporaryActor;
        if (!actor)
        {
            std::vector<BattleUnit*> top;
            if (battle)
            {
                for (BattleUnit *u : *battle->getUnits())
                    if (u && u->getFaction() == FACTION_PLAYER && !u->isOut())
                        top.push_back(u);
            }
            std::stable_sort(top.begin(), top.end(),
                [](const BattleUnit *lhs, const BattleUnit *rhs) {
                    return lhs->getBaseStats()->firing > rhs->getBaseStats()->firing;
                });
            // Select randomly once per session so weapons remain comparable.
            static const uint64_t tick = uint64_t(std::chrono::steady_clock::now()
                .time_since_epoch().count());
            if (!top.empty())
            {
                const size_t topCount = std::min<size_t>(5,
                    std::max<size_t>(1, (top.size()+3)/4));
                actor = top[size_t(tick % topCount)];
            }
            else
            {
                // Ufopaedia is also available in the Geoscape. There is no
                // tactical BattleUnit in that case: make a local, disposable
                // one from a top-firing roster soldier.
                std::vector<Soldier*> roster;
                for (Base *base : *game->getSavedGame()->getBases())
                    for (Soldier *s : *base->getSoldiers())
                        if (s && s->getCurrentStats())
                            roster.push_back(s);
                std::stable_sort(roster.begin(), roster.end(),
                    [](const Soldier *lhs, const Soldier *rhs) {
                        return lhs->getCurrentStats()->firing >
                               rhs->getCurrentStats()->firing;
                    });
                if (roster.empty()) return result;
                const size_t topCount = std::min<size_t>(5,
                    std::max<size_t>(1, (roster.size()+3)/4));
                Soldier *chosen = roster[size_t(tick % topCount)];
                temporaryActor.reset(new BattleUnit(game->getMod(), chosen, 0, nullptr));
                actor = temporaryActor.get();
            }
        }
        result.soldier = actor->getName(game->getLanguage());
        result.valid = true;
        if (rule->getBattleType() != BT_FIREARM && rule->getBattleType() != BT_MELEE)
            return result;
        result.applicable = true;

        // In ammo comparison mode, do NOT silently replace the requested
        // cartridge with the weapon's currently loaded one.
        BattleItem *live = !forcedAmmo && inventoryItem && inventoryItem->getRules() == rule ?
            inventoryItem : nullptr;
        if (!live && !forcedAmmo)
            for (BattleItem *item : *actor->getInventory())
                if (item && item->getRules() == rule)
                { live = item; break; }

        int tempId = -710000;
        BattleItem simulated(rule, &tempId);
        if (forcedAmmo == rule && forcedRounds >= 0)
            simulated.setAmmoQuantity(std::min(simulated.getAmmoQuantity(), forcedRounds));
        std::vector<std::unique_ptr<BattleItem>> clips;
        for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
        {
            const auto *compatible = rule->getCompatibleAmmoForSlot(slot);
            const RuleItem *chosen = forcedAmmo ?
                (slot == forcedSlot ? forcedAmmo : nullptr) :
                (compatible && !compatible->empty() ? (*compatible)[0] : nullptr);
            // The BattleItem constructor already wires self-powered slots to
            // the weapon itself; only external clips need to be installed.
            if (chosen && compatible && !compatible->empty())
            {
                clips.emplace_back(new BattleItem(chosen, &tempId));
                if (forcedAmmo && forcedRounds >= 0 && slot == forcedSlot)
                    clips.back()->setAmmoQuantity(std::min(
                        clips.back()->getAmmoQuantity(), forcedRounds));
                simulated.setAmmoForSlot(slot, clips.back().get());
            }
        }

        const struct AttackMode { BattleActionType action; const char *name; } modes[] = {
            { BA_AUTOSHOT, "AUTO" }, { BA_SNAPSHOT, "SNAP" },
            { BA_AIMEDSHOT, "AIM" }, { BA_HIT, "MELEE" }
        };
        for (const auto &mode : modes)
        {
            if (rule->getBattleType() == BT_MELEE && mode.action != BA_HIT) continue;
            if (rule->getBattleType() == BT_FIREARM && mode.action == BA_HIT) continue;
            const RuleItemAction *cfg =
                mode.action == BA_AUTOSHOT ? rule->getConfigAuto() :
                mode.action == BA_SNAPSHOT ? rule->getConfigSnap() :
                mode.action == BA_AIMEDSHOT ? rule->getConfigAimed() :
                rule->getConfigMelee();
            if (!cfg || cfg->shots <= 0 || cfg->shots > 32) continue;
            if (forcedAmmo && cfg->ammoSlot != forcedSlot) continue;
            const int tu = actor->getActionTUs(mode.action, rule).Time;
            if (tu <= 0) continue;

            BattleItem *weapon = forcedAmmo ? &simulated : live;
            BattleItem *loaded = weapon ? weapon->getAmmoForAction(mode.action) : nullptr;
            if (!loaded)
            {
                weapon = &simulated;
                loaded = weapon->getAmmoForAction(mode.action);
            }
            if (!loaded) continue;
            const RuleItem *ammoRule = loaded->getRules();
            if (!ammoRule) continue;
            const RuleDamageType *damage = mode.action == BA_HIT ?
                (rule->getMeleeType()) : ammoRule->getDamageType();
            const BattleActionAttack attack = BattleActionAttack::GetAferShoot(
                mode.action, actor, weapon, loaded);
            const RuleItem *powerRule = rule->getIgnoreAmmoPower() ? rule : ammoRule;
            const int basePower = mode.action == BA_HIT ?
                powerRule->getMeleeBonus(attack) : powerRule->getPowerBonus(attack);
            const auto before = BattleActionAttack::GetBeforeShoot(
                mode.action, actor, weapon);
            int baseAccuracy = BattleUnit::getFiringAccuracy(
                before, game->getMod());
            // An auto-equip candidate is still on the ground. The native
            // firing-accuracy routine therefore sees the soldier's OLD hand
            // occupancy, not the proposed loadout. In particular, special
            // empty-hand weapons may already be penalized by the occupied
            // offhand. Reconstruct the native formula for an explicit one-
            // or two-handed preview, applying the penalty exactly once and
            // before the final wound/health accuracy modifier.
            if (rule->isTwoHanded() && (forceOneHand || forceTwoHand))
            {
                int accuracy = 0;
                if (mode.action == BA_AUTOSHOT)
                    accuracy = rule->getAccuracyMultiplier(before) *
                        rule->getAccuracyAuto() / 100;
                else if (mode.action == BA_SNAPSHOT)
                    accuracy = rule->getAccuracyMultiplier(before) *
                        rule->getAccuracySnap() / 100;
                else if (mode.action == BA_AIMEDSHOT)
                    accuracy = rule->getAccuracyMultiplier(before) *
                        rule->getAccuracyAimed() / 100;
                else if (mode.action == BA_HIT)
                    accuracy = rule->getMeleeMultiplier(before) *
                        rule->getAccuracyMelee() / 100;
                if (mode.action != BA_HIT && actor->isKneeled())
                    accuracy = accuracy * rule->getKneelBonus(game->getMod()) / 100;
                if (forceOneHand)
                    accuracy = accuracy *
                        rule->getOneHandedPenalty(game->getMod()) / 100;
                baseAccuracy = accuracy * actor->getAccuracyModifier(weapon) / 100;
            }
            // OXCE treats shotgun pellets as independent direct projectiles.
            // Explosive/area ammunition must never be multiplied by pellet count.
            const int pellets = mode.action == BA_HIT || !damage || !damage->isDirect() ?
                1 : std::max(1, ammoRule->getShotgunPellets());
            // R109: evaluate a discrete THREE-TURN fire/reload calendar.
            // TU resets each turn: reloading cannot borrow TU from the next
            // turn. A loaded single-shot flintlock that cannot fire and reload
            // in the same turn fires on turns 1 and 3, not three times.
            // Average across the actual three turns, never fractional shots.
            const int spend = std::max(1, cfg->spendPerShot);
            const int fullRounds = ammoRule->getClipSize();
            const bool infiniteAmmo = fullRounds == -1;
            int rounds = loaded->getAmmoQuantity();
            if (!infiniteAmmo && rounds < spend) continue;
            int reloadTU = -1;
            if (!infiniteAmmo && ammoRule != rule &&
                fullRounds >= spend &&
                cfg->ammoSlot >= 0 && cfg->ammoSlot < RuleItem::AmmoSlotMax)
            {
                const int pickupTU = forcedPickupTU >= 0 ? forcedPickupTU :
                    ammoToHandTUs(game, actor, ammoRule);
                if (pickupTU >= 0)
                    reloadTU = std::max(0, rule->getTULoad(cfg->ammoSlot)) +
                               pickupTU;
            }
            const int turnTU = std::max(0, int(actor->getBaseStats()->tu));
            int shotsAcrossTurns = 0;
            for (int turn = 0; turn < 3; ++turn)
            {
                int remainingTU = turnTU;
                // Each loop consumes ammunition or TU; zero-cost reloads
                // cannot spin forever because a full clip is not reloaded.
                for (int actionCount = 0; actionCount < 128; ++actionCount)
                {
                    if (!infiniteAmmo && rounds < spend)
                    {
                        if (reloadTU < 0 || reloadTU > remainingTU) break;
                        remainingTU -= reloadTU;
                        rounds = fullRounds;
                    }
                    if (remainingTU < tu) break;
                    const int volleyShots = infiniteAmmo ? cfg->shots :
                        std::min(cfg->shots, rounds / spend);
                    if (volleyShots <= 0) break;
                    shotsAcrossTurns += volleyShots;
                    remainingTU -= tu;
                    if (!infiniteAmmo) rounds -= volleyShots * spend;
                }
            }
            if (shotsAcrossTurns <= 0) continue;
            const double shotsPerTurn = shotsAcrossTurns / 3.0;
            for (int di = 0; di < 3; ++di)
            {
                const int distance = indexRange(di);
                if (rule->isOutOfRange(distance*distance) ||
                    (mode.action == BA_HIT && distance > 1))
                    continue;
                int upper = 0, lower = 0;
                const int drop = rule->calculateLimits(
                    upper, lower, battle ? battle->getDepth() : 0, mode.action);
                int acc = baseAccuracy;
                if (distance > upper) acc -= (distance - upper) * drop;
                else if (distance < lower) acc -= (lower - distance) * drop;
                const double chance = hitProbability(distance, acc);
                const int power = std::max(0, int(std::round(basePower -
                    powerRule->getPowerRangeReduction(distance*16.f))));
                for (int ai = 0; ai < 3; ++ai)
                {
                    const double turnDamage = chance *
                        armorDamage(damage, power, indexArmor(ai)) *
                        pellets * shotsPerTurn;
                    if (turnDamage > result.values[ai][di])
                    {
                        result.values[ai][di] = turnDamage;
                        result.mode = mode.name;
                        result.ammo = ammoRule->getType();
                        result.virtualAmmo = result.virtualAmmo || weapon == &simulated;
                    }
                }
            }
        }
        // Each of the nine scenarios has equal maximum weight (100/9).
        // Scenario-specific ONE-TURN reference output. The old reference
        // anchors were for TU-normalized output, so scale them by a nominal
        // 60-TU turn to keep the displayed POWER spread comparable.
        const double rangeReference[3] = { 1.0, 0.60, 0.35 };
        const double armorReference[3] = { 1.0, 0.70, 0.45 };
        for (int ai = 0; ai < 3; ++ai)
            for (int di = 0; di < 3; ++di)
            {
                const double turnDamage = result.values[ai][di];
                const double anchor = 60.0 * rangeReference[di] * armorReference[ai];
                result.total += (100.0 / 9.0) * turnDamage / (turnDamage + anchor);
            }
        return result;
    }

    static std::string print(const CombatPowerHudResult &result)
    {
        if (!result.valid) return "TURN-POWER: NO AVAILABLE SOLDIER";
        if (!result.applicable) return "TURN-POWER: NOT A DIRECT-FIRE WEAPON";
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(1);
        ss << "       D14    D28    D40\n";
        for (int i = 0; i < 3; ++i)
        {
            ss << "A" << indexArmor(i) << " ";
            for (int j = 0; j < 3; ++j)
                ss << std::setw(6) << std::min(999.9, result.values[i][j]);
            ss << "\n";
        }
        ss << "POWER " << std::setprecision(1) << result.total;
        return ss.str();
    }
};
}
