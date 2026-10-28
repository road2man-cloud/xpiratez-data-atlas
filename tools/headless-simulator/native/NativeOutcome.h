// SPDX-License-Identifier: GPL-3.0-or-later
// Observes the ORIGINAL OXCE finishBattle() transition. Does not decide combat,
// drive AI, evaluate mission objectives, alter RNG or implement any battle rules.
#pragma once
#include <cstdlib>
#include <cstdint>
#include <fstream>
#include <stdexcept>
namespace OpenXcom { namespace NativeOutcome {
inline bool& terminalFlag() {
    static bool terminated = false;
    return terminated;
}
inline bool enabled() {
    return std::getenv("XPZ_NATIVE_PLAN") != nullptr;
}
inline bool finished() {
    return enabled() && terminalFlag();
}
inline void recordFinish(bool abort, int survivorsOrExit,
                         bool nextStageStarted, bool preview, std::uint64_t rng) {
    if (!enabled()) return;
    if (terminalFlag()) throw std::runtime_error("DUPLICATE_NATIVE_BATTLE_FINISH");
    const char* tracePath = std::getenv("XPZ_NATIVE_TRACE");
    if (!tracePath) throw std::runtime_error("NATIVE_OUTCOME_TRACE_REQUIRED");
    const char* result = preview ? "PREVIEW"
        : nextStageStarted ? "NEXT_STAGE"
        : abort ? "ABORTED"
        : survivorsOrExit > 0 ? "WON" : "LOST";
    // Separate append stream: the replay driver's prior checkpoints are flushed.
    // Exactly one terminal event; the caller already wrote the full tactical save.
    std::ofstream out(tracePath, std::ios::out | std::ios::app);
    if (!out) throw std::runtime_error("NATIVE_OUTCOME_TRACE_UNWRITABLE");
    out << "{\"event\":\"battle_finished\",\"outcome\":\"" << result
        << "\",\"aborted\":" << (abort ? "true" : "false")
        << ",\"nextStage\":" << (nextStageStarted ? "true" : "false")
        << ",\"preview\":" << (preview ? "true" : "false")
        << ",\"survivorsOrExit\":" << survivorsOrExit
        << ",\"rng\":\"" << rng
        << "\",\"file\":\"xpz-native-battle-finish.sav\"}\n";
    out.flush();
    if (!out) throw std::runtime_error("NATIVE_OUTCOME_TRACE_WRITE_FAILED");
    terminalFlag() = true;
}
}} // namespace OpenXcom::NativeOutcome
