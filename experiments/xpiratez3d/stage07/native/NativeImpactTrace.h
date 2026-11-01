// SPDX-License-Identifier: GPL-3.0-or-later
// Optional observability for ORIGINAL OXCE TileEngine::hit. No RNG or gameplay math.
#pragma once
#include <cstdlib>
#include <mutex>
#include <vector>

namespace OpenXcom { namespace NativeImpactTrace {
struct Impact {
    int vx, vy, vz; // precise original OXCE voxel coordinate of TileEngine::hit(center)
    int part, power, rolled_damage, tile_damage, visibility_changed, attacker_id, ranged;
};
struct Queue {
    std::mutex mutex;
    std::vector<Impact> impacts;
    int overflow = 0;
};
inline Queue& queue() { static Queue q; return q; }
inline bool enabled() {
    const char *v = std::getenv("XPZ_NATIVE_IMPACT_TRACE");
    return v != nullptr && v[0]=='1' && v[1]=='\0';
}
inline void record(int vx, int vy, int vz, int part, int power,
                   int rolled_damage, int tile_damage, int visibility_changed,
                   int attacker_id, int ranged) {
    if (!enabled()) return;
    Queue& q=queue();
    std::lock_guard<std::mutex> lock(q.mutex);
    if (q.impacts.size() >= 65536) { ++q.overflow; return; }
    q.impacts.push_back({vx,vy,vz,part,power,rolled_damage,tile_damage,
                         visibility_changed,attacker_id,ranged});
}
inline std::vector<Impact> drain(int *dropped) {
    Queue& q=queue();
    std::lock_guard<std::mutex> lock(q.mutex);
    std::vector<Impact> result;
    result.swap(q.impacts);
    if (dropped) *dropped=q.overflow;
    q.overflow=0;
    return result;
}
}} // namespace OpenXcom::NativeImpactTrace
