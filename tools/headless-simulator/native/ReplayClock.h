// SPDX-License-Identifier: GPL-3.0-or-later
// Scheduling adapter only. No battle, animation, damage or RNG state is edited.
#pragma once
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <cstring>

namespace OpenXcom { namespace NativeReplayClock {
inline bool enabled()
{
    static const bool active = [] {
        const char* plan = std::getenv("XPZ_NATIVE_PLAN");
        const char* mode = std::getenv("XPZ_NATIVE_LOGICAL_CLOCK");
        return plan && *plan && mode && std::strcmp(mode, "fixed-1ms-v1") == 0;
    }();
    return active;
}
inline std::atomic<std::uint32_t>& counter()
{
    static std::atomic<std::uint32_t> value{0};
    return value;
}
inline std::uint32_t ticks(std::uint32_t originalTicks)
{
    return enabled() ? counter().load(std::memory_order_relaxed) : originalTicks;
}
inline void advance()
{
    if (enabled()) counter().fetch_add(1, std::memory_order_relaxed);
}
}} // namespace OpenXcom::NativeReplayClock
