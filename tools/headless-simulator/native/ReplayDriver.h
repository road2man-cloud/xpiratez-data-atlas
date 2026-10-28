// SPDX-License-Identifier: GPL-3.0-or-later
// Input/output adapter for the ORIGINAL OXCE battle state machine.
// No movement, accuracy, damage, AI, or RNG algorithms are implemented here.
#pragma once
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../Battlescape/BattlescapeGame.h"
#include "../Battlescape/BattlescapeState.h"
#include "../Engine/Game.h"
#include "../Engine/RNG.h"
#include "../Savegame/BattleUnit.h"
#include "../Savegame/BattleItem.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/SavedGame.h"
#include "../Mod/RuleInventory.h"

namespace OpenXcom { namespace NativeReplay {
inline bool enabled() { return std::getenv("XPZ_NATIVE_PLAN") != nullptr; }
struct Command {
    std::string op, mode;
    int actor = -1, item = -1, x = 0, y = 0, z = 0;
};
class Driver {
    std::vector<Command> commands;
    std::size_t cursor = 0;
    std::ofstream trace;
    bool started = false, pending = false;
    int checkpoint = 0, beforeTurn = -1;
    Command previous;

    [[noreturn]] void fail(const std::string& code) {
        trace << "{\"event\":\"error\",\"code\":\"" << code
              << "\",\"command_index\":" << cursor << "}\n";
        trace.flush();
        // Stop immediately: never fall back to an independent simulator.
        std::exit(70);
    }
    BattleUnit* actor(BattlescapeGame* game, int id) {
        for (auto* unit : *game->getSave()->getUnits())
            if (unit->getId() == id) return unit;
        return nullptr;
    }
    void observe(BattlescapeGame* game, const char* phase) {
        auto* save = game->getSave();
        const auto seed = RNG::getSeed();
        std::ostringstream name;
        name << "xpz-native-" << checkpoint++ << ".sav";
        // Use the engine's COMPLETE serializer, including tiles, items and AI.
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
            if (line.empty() || line[0] == '#') continue;
            std::istringstream in(line);
            Command c;
            in >> c.op;
            if (c.op == "observe" || c.op == "end_turn" || c.op == "stop") {
            } else if (c.op == "move" || c.op == "turn") {
                if (!(in >> c.actor >> c.x >> c.y >> c.z)) fail("INVALID_POSITION_COMMAND");
            } else if (c.op == "kneel") {
                if (!(in >> c.actor)) fail("INVALID_KNEEL_COMMAND");
            } else if (c.op == "fire") {
                if (!(in >> c.actor >> c.item >> c.mode >> c.x >> c.y >> c.z)) fail("INVALID_FIRE_COMMAND");
                if (c.mode != "snap" && c.mode != "aimed" && c.mode != "auto") fail("UNSUPPORTED_FIRE_MODE");
            } else fail("UNSUPPORTED_COMMAND");
            std::string extra;
            if (in >> extra) fail("EXTRA_COMMAND_ARGUMENT");
            commands.push_back(c);
        }
        if (commands.empty()) fail("EMPTY_PLAN");
    }
    // Called only when the ORIGINAL controller is quiescent, after panic/falls.
    void tick(BattlescapeGame* game) {
        auto* save = game->getSave();
        if (!started) {
            started = true;
            trace << "{\"event\":\"native_ready\",\"protocol\":1,\"backend\":\"OXCE_NATIVE\",\"parityCertified\":false}\n";
            // Default: preserve RNG from save. Overrides are explicit experiments.
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
            observe(game, "after_action");
            if (previous.op == "end_turn" && save->getTurn() <= beforeTurn) fail("TURN_NOT_ADVANCED");
            if (previous.op == "move") {
                auto* u = actor(game, previous.actor);
                if (!u || u->isOut() || u->getPosition() != Position(previous.x, previous.y, previous.z))
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
        previous = c; beforeTurn = save->getTurn();
        if (c.op == "end_turn") {
            pending = true;
            game->requestEndTurn(false);
            return;
        }
        auto* u = actor(game, c.actor);
        if (!u || u->isOut() || u->getFaction() != FACTION_PLAYER) fail("ACTOR_NOT_CONTROLLABLE");
        game->cancelAllActions();
        save->setSelectedUnit(u);
        game->getCurrentAction()->actor = u;
        const Position target(c.x, c.y, c.z);
        if (c.op != "kneel" && !save->getTile(target)) fail("TARGET_OUT_OF_MAP");
        if (c.op == "kneel") {
            if (!game->kneel(u)) fail("KNEEL_REJECTED");
        } else if (c.op == "turn") {
            game->secondaryAction(target);
        } else if (c.op == "move") {
            game->primaryAction(target);
            // A second click confirms the engine's own path preview, if present.
            if (!game->isBusy() && u->getPosition() != target) game->primaryAction(target);
            if (!game->isBusy() && u->getPosition() != target) fail("MOVE_NOT_QUEUED");
        } else if (c.op == "fire") {
            BattleItem* weapon = nullptr;
            for (auto* i : *save->getItems()) if (i->getId() == c.item) weapon = i;
            if (!weapon || weapon->getOwner() != u || !weapon->getSlot() || weapon->getSlot()->getType() != INV_HAND)
                fail("WEAPON_NOT_IN_ACTORS_HAND");
            auto* a = game->getCurrentAction();
            a->type = c.mode == "snap" ? BA_SNAPSHOT : c.mode == "aimed" ? BA_AIMEDSHOT : BA_AUTOSHOT;
            a->actor = u; a->weapon = weapon; a->targeting = true;
            a->updateTU();
            if (!a->haveTU()) fail("NATIVE_ACTION_COST_REJECTED");
            game->primaryAction(target);
            if (!game->isBusy()) game->primaryAction(target);
            if (!game->isBusy()) fail("FIRE_NOT_QUEUED");
        }
        pending = true;
    }
};
inline void tick(BattlescapeGame* game) {
    static Driver driver;
    driver.tick(game);
}
}} // namespace OpenXcom::NativeReplay
