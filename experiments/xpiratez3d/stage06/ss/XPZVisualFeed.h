// SPDX-License-Identifier: MIT
// Optional visual-only OXCE -> Silent Storm adapter. No original game code copied.
#pragma once
#include <cstddef>
#include <map>
#include <string>
#include <vector>
namespace XPZVisual {
struct Unit {
    int id, faction, status, x, y, z, tu, health, energy, stun, morale;
};
struct Aim {
    int command_index, actor, item, x, y, z;
    std::string mode;
};
// Original OXCE TileEngine::hit damage-application voxel, NOT a projectile path.
struct ImpactVoxel {
    int command_index, actor, vx, vy, vz, part, power;
    int rolled_damage, tile_damage, terrain_visibility_changed, ranged;
};
struct Scene {
    int seq = -1, turn = 0, side = 0, command_index = 0;
    std::map<int, Unit> units;
    std::vector<Aim> aims;
    std::vector<ImpactVoxel> impacts;
    std::string trace_sha256, session_id, checkpoint_file, checkpoint_sha256;
};
// Strict, read-only import of an entire atomic feed file.
// Input is UNTRUSTED even with hashes; never use it to change combat or saves.
bool Parse(const std::string& input, Scene* out, std::string* why);
#ifdef _WIN32
// Called once each frame by the optional patch in Game/Main.cpp.
// Disabled when the XPZ3D_VISUAL_FEED environment variable is unset.
void PollWin32();
const Scene& CurrentScene();
#endif
}
