#pragma once
// R143: read-only tactical actor snapshot. Independent of R135 camera and
// R137 terrain ring. Combat authority, visibility and saves remain OXCE-only.
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#pragma pack(push,4)
struct XPZ3DActorRecordR143 {
    int32_t unitId;
    int16_t tileX, tileY, tileZ; // OXCE logical tile location
    int16_t footOffsetVoxel;     // -terrainLevel + floatHeight
    int16_t heightVoxel;         // unit's actual in-game height (not model)
    uint8_t facing8;             // 0 north, 2 east, 4 south, 6 west
    uint8_t team;                // 0 player, 1 visible hostile, 2 visible neutral
    uint8_t kneeled;
    uint8_t footprint;           // OXCE armor footprint in tiles
    uint16_t flags;              // reserved for future actor-state overlays
};
struct XPZ3DActorFrameR143 {
    uint32_t magic, version, packetBytes;
    volatile LONG sequence;     // odd publishing, even ready (same-process clock)
    uint32_t producerPid, tickMillis, mapEpoch;
    uint32_t mapWidth, mapHeight, mapDepth;
    uint32_t count;
    int32_t selectedUnitId;
    uint32_t revision, reserved[2];
    XPZ3DActorRecordR143 actors[128];
};
#pragma pack(pop)
static_assert(sizeof(XPZ3DActorRecordR143)==20, "R143 actor ABI changed");
static_assert(sizeof(XPZ3DActorFrameR143)==2620, "R143 snapshot ABI changed");
namespace XPZ3DActorWireR143 {
    enum { MaxActors=128 };
    static const uint32_t Magic=0x41335058u; // XP3A
    static const uint32_t Version=1u;
    static const char* const MapName="Local\\XPZ3D_OXCE_ACTORS_R143";
}
#endif
