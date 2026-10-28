// SPDX-License-Identifier: GPL-3.0-or-later
// Input/output adapter for the ORIGINAL OXCE battle state machine.
// No movement, accuracy, damage, armor, AI, or RNG algorithms are implemented here.
#pragma once
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../Battlescape/BattlescapeGame.h"
#include "../Battlescape/BattlescapeState.h"
#include "../Battlescape/TileEngine.h"
#include "../Engine/Game.h"
#include "../Engine/RNG.h"
#include "../Savegame/BattleUnit.h"
#include "../Savegame/BattleItem.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/SavedGame.h"
#include "../Mod/Mod.h"
#include "../Mod/RuleItem.h"
#include "../Mod/RuleInventory.h"

namespace OpenXcom { namespace NativeReplay {
inline bool enabled() { return std::getenv("XPZ_NATIVE_PLAN") != nullptr; }
struct Command {
    std::string op, mode;
    int actor = -1, item = -1, x = 0, y = 0, z = 0, value = -1;
};
class Driver {
    std::vector<Command> commands;
    std::size_t cursor = 0;
    std::ofstream trace;
    bool started = false, pending = false, finished = false;
    int checkpoint = 0, beforeTurn = -1;
    Command previous;

    [[noreturn]] void fail(const std::string& code) {
        trace << "{\"event\":\"error\",\"code\":\"" << code
              << "\",\"command_index\":" << cursor << "}\n";
        trace.flush();
        // Never fall back to an independently implemented approximation.
        std::exit(70);
    }
    BattleUnit* actor(BattlescapeGame* game, int id) {
        for (auto* unit : *game->getSave()->getUnits())
            if (unit->getId() == id) return unit;
        return nullptr;
    }
    BattleItem* item(BattlescapeGame* game, int id) {
        for (auto* candidate : *game->getSave()->getItems())
            if (candidate->getId() == id) return candidate;
        return nullptr;
    }
    void skip(const char* reason) {
        trace << "{\"event\":\"action_skipped\",\"reason\":\"" << reason
              << "\",\"command_index\":" << cursor << "}\n";
        trace.flush();
    }
    void observe(BattlescapeGame* game, const char* phase) {
        auto* save = game->getSave();
        const auto seed = RNG::getSeed();
        std::ostringstream name;
        name << "xpz-native-" << checkpoint++ << ".sav";
        // Native complete serialization: terrain, units, items, AI and campaign.
        save->getGeoscapeSave()->save(name.str(), game->getMod());
        if (seed != RNG::getSeed()) fail("SNAPSHOT_CHANGED_GAMEPLAY_RNG");
        trace << "{\"event\":\"checkpoint\",\"phase\":\"" << phase
              << "\",\"file\":\"" << name.str() << "\",\"turn\":" << save->getTurn()
              << ",\"side\":" << static_cast<int>(save->getSide())
              << ",\"rng\":\"" << seed << "\",\"command_index\":" << cursor
              << ",\"units\":[";
        bool first = true;
        for (auto* u : *save->getUnits()) {
            if (!first) trace << ',';
            first = false;
            const auto p = u->getPosition();
            trace << "{\"id\":" << u->getId() << ",\"faction\":" << static_cast<int>(u->getFaction())
                  << ",\"status\":" << static_cast<int>(u->getStatus())
                  << ",\"position\":[" << p.x << ',' << p.y << ',' << p.z << ']'
                  << ",\"tu\":" << u->getTimeUnits() << ",\"health\":" << u->getHealth()
                  << ",\"energy\":" << u->getEnergy() << ",\"stun\":" << u->getStunlevel()
                  << ",\"morale\":" << u->getMorale() << '}';
        }
        trace << "]}\n";
        trace.flush();
    }
    BattleUnit* selectActor(BattlescapeGame* game, int id) {
        BattleUnit* u = actor(game, id);
        if (!u || u->isOut() || u->getFaction() != FACTION_PLAYER)
            fail("ACTOR_NOT_CONTROLLABLE");
        game->cancelAllActions();
        game->getSave()->setSelectedUnit(u);
        game->getCurrentAction()->actor = u;
        return u;
    }
    BattleItem* ownedItem(BattlescapeGame* game, BattleUnit* u, int id, bool handOnly) {
        BattleItem* b = item(game, id);
        if (!b || b->getOwner() != u || !b->getSlot())
            fail("ITEM_NOT_IN_ACTORS_INVENTORY");
        if (handOnly && b->getSlot()->getType() != INV_HAND)
            fail("WEAPON_NOT_IN_ACTORS_HAND");
        return b;
    }
    BattleUnit* visibleTarget(BattleUnit* u, BattlescapeGame* game, const Command& c) {
        if (c.op == "fire_nearest") {
            BattleUnit* result = nullptr;
            int best = -1;
            for (auto* candidate : *u->getVisibleUnits()) {
                if (candidate->isOut() || candidate->getFaction() == FACTION_PLAYER) continue;
                const int dist = u->distance3dToPositionSq(candidate->getPosition());
                if (!result || dist < best || (dist == best && candidate->getId() < result->getId())) {
                    result = candidate;
                    best = dist;
                }
            }
            return result;
        }
        BattleUnit* target = actor(game, c.value);
        if (!target || target->isOut() || target->getFaction() == FACTION_PLAYER)
            return nullptr;
        const auto* visible = u->getVisibleUnits();
        return std::find(visible->begin(), visible->end(), target) != visible->end() ? target : nullptr;
    }
    void fire(BattlescapeGame* game, BattleUnit* u, BattleItem* weapon,
              const std::string& mode, Position target, bool isThrow) {
        if (!game->getSave()->getTile(target)) fail("TARGET_OUT_OF_MAP");
        auto* a = game->getCurrentAction();
        a->type = isThrow ? BA_THROW :
            mode == "snap" ? BA_SNAPSHOT : mode == "aimed" ? BA_AIMEDSHOT : BA_AUTOSHOT;
        a->actor = u;
        a->weapon = weapon;
        a->targeting = true;
        a->updateTU();
        if (!a->haveTU()) fail("NATIVE_ACTION_COST_REJECTED");
        // Native primaryAction handles the fire/throw preview and canonical
        // voxel trajectory, range, TU, projectile, collateral and reactions.
        game->primaryAction(target);
        if (!game->isBusy()) game->primaryAction(target);
        if (!game->isBusy()) fail("NATIVE_PROJECTILE_NOT_QUEUED");
    }
    void equip(BattlescapeGame* game, BattleUnit* u, BattleItem* b, const Command& c) {
        // Only known native slot identifiers, never an arbitrary ruleset key.
        if (c.mode != "STR_RIGHT_HAND" && c.mode != "STR_LEFT_HAND" &&
            c.mode != "STR_BACK_PACK" && c.mode != "STR_BELT" &&
            c.mode != "STR_QD_SLOT" && c.mode != "STR_RIGHT_SHOULDER" &&
            c.mode != "STR_LEFT_SHOULDER" && c.mode != "STR_RIGHT_LEG" &&
            c.mode != "STR_LEFT_LEG") fail("UNSUPPORTED_INVENTORY_SLOT");
        const RuleInventory* slot = game->getMod()->getInventory(c.mode, true);
        if (!slot || !slot->fitItemInSlot(b->getRules(), c.x, c.y) ||
            b->getRules()->isFixed()) fail("ITEM_DOES_NOT_FIT_SLOT");
        for (auto* other : *u->getInventory()) {
            if (other != b && other->getSlot() == slot &&
                other->occupiesSlot(c.x, c.y, b)) fail("INVENTORY_SLOT_OCCUPIED");
        }
        const int tu = b->getMoveToCost(slot);
        if (!u->spendTimeUnits(tu)) fail("NATIVE_EQUIP_COST_REJECTED");
        // Exactly the inventory UI's native itemMoveInventory operation.
        game->getTileEngine()->itemMoveInventory(u->getTile(), u, b, slot, c.x, c.y);
    }
    void prime(BattlescapeGame* game, BattleUnit* u, BattleItem* b, const Command& c) {
        if (c.op == "prime" && (c.value < 0 || c.value > 23))
            fail("INVALID_GRENADE_FUSE");
        auto* a = game->getCurrentAction();
        a->actor = u;
        a->weapon = b;
        a->type = c.op == "prime" ? BA_PRIME : BA_UNPRIME;
        a->targeting = false;
        a->value = c.op == "prime" ? c.value : -1;
        a->updateTU();
        if (!a->haveTU()) fail("NATIVE_PRIME_COST_REJECTED");
        // Canonical native non-target action, not manual timer or TU mutation.
        game->handleNonTargetAction();
        if (b->getFuseTimer() != a->value && c.op == "prime")
            fail("NATIVE_PRIME_REJECTED");
        if (c.op == "unprime" && b->getFuseTimer() != -1)
            fail("NATIVE_UNPRIME_REJECTED");
    }
public:
    Driver() {
        const char* planPath = std::getenv("XPZ_NATIVE_PLAN");
        const char* tracePath = std::getenv("XPZ_NATIVE_TRACE");
        if (!planPath || !tracePath) throw std::runtime_error("Native replay requires plan and trace paths");
        trace.open(tracePath, std::ios::out | std::ios::trunc);
        if (!trace) throw std::runtime_error("Cannot open native trace");
        std::ifstream input(planPath);
        if (!input) fail("PLAN_NOT_READABLE");
        std::string line;
        while (std::getline(input, line)) {
            const auto first = line.find_first_not_of(" \t\r");
            if (first == std::string::npos || line[first] == '#') continue;
            std::istringstream in(line.substr(first));
            Command c;
            in >> c.op;
            if (c.op == "observe" || c.op == "end_turn" || c.op == "stop") {
            } else if (c.op == "move" || c.op == "turn" || c.op == "throw") {
                if (!(in >> c.actor)) fail("INVALID_POSITION_COMMAND");
                if (c.op == "throw" && !(in >> c.item)) fail("INVALID_THROW_COMMAND");
                if (!(in >> c.x >> c.y >> c.z)) fail("INVALID_POSITION_COMMAND");
            } else if (c.op == "kneel") {
                if (!(in >> c.actor)) fail("INVALID_KNEEL_COMMAND");
            } else if (c.op == "prime" || c.op == "unprime") {
                if (!(in >> c.actor >> c.item)) fail("INVALID_GRENADE_COMMAND");
                if (c.op == "prime" && !(in >> c.value)) fail("INVALID_GRENADE_FUSE");
            } else if (c.op == "equip") {
                if (!(in >> c.actor >> c.item >> c.mode >> c.x >> c.y))
                    fail("INVALID_EQUIP_COMMAND");
            } else if (c.op == "fire" || c.op == "fire_visible" || c.op == "fire_nearest") {
                if (!(in >> c.actor >> c.item >> c.mode)) fail("INVALID_FIRE_COMMAND");
                if (c.mode != "snap" && c.mode != "aimed" && c.mode != "auto")
                    fail("UNSUPPORTED_FIRE_MODE");
                if (c.op == "fire" && !(in >> c.x >> c.y >> c.z))
                    fail("INVALID_FIRE_COMMAND");
                if (c.op == "fire_visible" && !(in >> c.value))
                    fail("INVALID_VISIBLE_TARGET");
            } else fail("UNSUPPORTED_COMMAND");
            std::string extra;
            if (in >> extra) fail("EXTRA_COMMAND_ARGUMENT");
            commands.push_back(c);
        }
        if (commands.empty()) fail("EMPTY_PLAN");
    }
    void onBattleFinished(BattlescapeGame* game, bool abort, int inExitArea) {
        if (finished) return;
        finished = true;
        // Called by ORIGINAL BattlescapeState::finishBattle, not inferred from
        // remaining units or successful completion of the command script.
        observe(game, "battle_finished");
        const auto t = game->tallyUnits();
        trace << "{\"event\":\"battle_finished\",\"source\":\"ORIGINAL_FINISH_BATTLE\","
              << "\"abort\":" << (abort ? "true" : "false")
              << ",\"in_exit_area\":" << inExitArea
              << ",\"live_soldiers\":" << t.liveSoldiers
              << ",\"live_aliens\":" << t.liveAliens
              << ",\"native_outcome\":\""
              << (abort ? "ABORTED" : inExitArea > 0 ? "FINISHED_WITH_SURVIVORS" : "FINISHED_WITHOUT_SURVIVORS")
              << "\",\"battleVictoryCertified\":false}\n";
        trace.flush();
        // Preserve original finishBattle implementation; quit only the host loop.
        game->getSave()->getBattleState()->getGame()->quit();
    }
    // Called only when ORIGINAL controller is quiescent, after panic/falls.
    void tick(BattlescapeGame* game) {
        auto* save = game->getSave();
        if (!started) {
            started = true;
            trace << "{\"event\":\"native_ready\",\"protocol\":2,\"backend\":\"OXCE_NATIVE\",\"parityCertified\":false}\n";
            if (const char* s = std::getenv("XPZ_NATIVE_SEED")) {
                std::string v(s); std::size_t consumed = 0;
                const auto seed = std::stoull(v, &consumed);
                if (consumed != v.size() || seed == 0) fail("INVALID_NATIVE_SEED");
                RNG::setSeed(seed);
            }
            observe(game, "initial");
        }
        if (pending) {
            pending = false;
            const char* checkpointMode = std::getenv("XPZ_NATIVE_CHECKPOINT_MODE");
            if (!checkpointMode || std::string(checkpointMode) != "turns" ||
                previous.op == "end_turn") observe(game, "after_action");
            if (previous.op == "end_turn" && save->getTurn() <= beforeTurn)
                fail("TURN_NOT_ADVANCED");
            if (previous.op == "move") {
                auto* u = actor(game, previous.actor);
                if (!u || u->isOut() ||
                    u->getPosition() != Position(previous.x, previous.y, previous.z))
                    fail("MOVE_INTERRUPTED_OR_REJECTED");
            }
        }
        if (cursor == commands.size() || commands[cursor].op == "stop") {
            observe(game, "final");
            trace << "{\"event\":\"plan_completed\",\"battleVictoryCertified\":false}\n";
            trace.flush();
            save->getBattleState()->getGame()->quit();
            return;
        }
        const auto c = commands[cursor++];
        if (c.op == "observe") { observe(game, "requested"); return; }
        previous = c;
        beforeTurn = save->getTurn();
        if (c.op == "end_turn") {
            pending = true;
            game->requestEndTurn(false);
            return;
        }
        if (c.op == "fire_nearest" || c.op == "fire_visible") {
            BattleUnit* u = actor(game, c.actor);
            if (!u || u->isOut() || u->getFaction() != FACTION_PLAYER) {
                skip("ACTOR_UNAVAILABLE");
                return;
            }
        }
        BattleUnit* u = selectActor(game, c.actor);
        if (c.op == "kneel") {
            if (!game->kneel(u)) fail("KNEEL_REJECTED");
        } else if (c.op == "move" || c.op == "turn") {
            const Position target(c.x, c.y, c.z);
            if (!save->getTile(target)) fail("TARGET_OUT_OF_MAP");
            if (c.op == "turn") game->secondaryAction(target);
            else {
                game->primaryAction(target);
                if (!game->isBusy() && u->getPosition() != target)
                    game->primaryAction(target);
                if (!game->isBusy() && u->getPosition() != target)
                    fail("MOVE_NOT_QUEUED");
            }
        } else if (c.op == "equip") {
            equip(game,u,ownedItem(game,u,c.item,false),c);
        } else if (c.op == "prime" || c.op == "unprime") {
            prime(game,u,ownedItem(game,u,c.item,true),c);
        } else if (c.op == "fire" || c.op == "fire_visible" ||
                   c.op == "fire_nearest" || c.op == "throw") {
            BattleItem* weapon = ownedItem(game,u,c.item,true);
            Position target(c.x,c.y,c.z);
            if (c.op == "fire_visible" || c.op == "fire_nearest") {
                BattleUnit* enemy = visibleTarget(u,game,c);
                if (!enemy) { skip("NO_VISIBLE_TARGET"); return; }
                target = enemy->getPosition();
                if (weapon->getRules()->isOutOfRange(u->distance3dToPositionSq(target))) {
                    skip("NATIVE_WEAPON_OUT_OF_RANGE");
                    return;
                }
            }
            fire(game,u,weapon,c.mode,target,c.op == "throw");
        } else fail("UNSUPPORTED_COMMAND");
        pending = true;
    }
};
inline Driver& instance() {
    static Driver driver;
    return driver;
}
inline void tick(BattlescapeGame* game) { instance().tick(game); }
inline void onBattleFinished(BattlescapeGame* game, bool abort, int inExitArea) {
    if (enabled()) instance().onBattleFinished(game, abort, inExitArea);
}
}} // namespace OpenXcom::NativeReplay
