#ifndef __XPZ3D_IMPORTED_TERRAIN_H__
#define __XPZ3D_IMPORTED_TERRAIN_H__
// Stage26: native graphics import of the actual X-Piratez battle's decoded
// MCD+LOFT surfaces. Nothing is loaded unless XPZ3D_STAGE26_MESH_PATH is set.
// Binary format is authored by Atlas stage26/convert-terrain.mjs.
// This is temporary engine prototype code, not a production asset container.
#include "MemObject.h"
#include <cstdio>

namespace NWorld {

struct SXpzStage26Mesh
{
    CObj<CMemObject> pMesh;
    unsigned int nFloor, nMaterial, nChunkX, nChunkY, nInstances;
    SXpzStage26Mesh() : nFloor(0), nMaterial(0), nChunkX(0), nChunkY(0), nInstances(0) {}
};

inline bool XPZ3DStage26ReadU32(FILE *f, unsigned int *value)
{
    return fread(value, sizeof(*value), 1, f) == 1;
}
inline bool XPZ3DStage26ReadFloat(FILE *f, float *value)
{
    return fread(value, sizeof(*value), 1, f) == 1;
}
inline bool XPZ3DStage26ReadU16(FILE *f, unsigned short *value)
{
    return fread(value, sizeof(*value), 1, f) == 1;
}
inline bool XPZ3DStage26LoadMeshes(const char *filename, vector<SXpzStage26Mesh> *meshes)
{
    if (!filename || !filename[0] || !meshes) return false;
    FILE *f = 0;
    if (fopen_s(&f, filename, "rb") != 0 || !f) return false;
    vector<SXpzStage26Mesh> pending;
    bool ok = true;
    do {
        char magic[8] = { 0 };
        unsigned int version = 0, width = 0, height = 0, floors = 0, count = 0;
        float xyTileMeters = 0, zFloorMeters = 0;
        if (fread(magic, 1, 8, f) != 8 || memcmp(magic, "XPZ3D26A", 8) != 0 ||
            !XPZ3DStage26ReadU32(f, &version) ||
            !XPZ3DStage26ReadU32(f, &width) ||
            !XPZ3DStage26ReadU32(f, &height) ||
            !XPZ3DStage26ReadU32(f, &floors) ||
            !XPZ3DStage26ReadU32(f, &count) ||
            !XPZ3DStage26ReadFloat(f, &xyTileMeters) ||
            !XPZ3DStage26ReadFloat(f, &zFloorMeters) ||
            version != 1 || width != 60 || height != 60 || floors == 0 || floors > 12 ||
            count == 0 || count > 4096 ||
            xyTileMeters < 1.24f || xyTileMeters > 1.67f ||
            zFloorMeters != 2.5f) { ok = false; break; }
        for (unsigned int i = 0; i < count; ++i)
        {
            unsigned int data[9] = { 0 };
            if (fread(data, sizeof(unsigned int), 9, f) != 9) { ok = false; break; }
            const unsigned int cx = data[0], cy = data[1], deck = data[2], material = data[3],
                vCount = data[4], tCount = data[5], instances = data[6];
            if (cx > 20 || cy > 20 || deck >= floors || material >= 24 ||
                vCount < 3 || vCount >= 60000 || tCount == 0 || tCount > 200000 ||
                instances < 1 || instances > 50000 || data[7] || data[8])
            {
                ok = false; break;
            }
            vector<CVec3> points;
            vector<STriangle> triangles;
            points.reserve(vCount);
            triangles.reserve(tCount);
            for (unsigned int v = 0; v < vCount; ++v)
            {
                float x = 0, y = 0, z = 0;
                if (!XPZ3DStage26ReadFloat(f, &x) ||
                    !XPZ3DStage26ReadFloat(f, &y) ||
                    !XPZ3DStage26ReadFloat(f, &z) ||
                    !(x == x && y == y && z == z) ||
                    x < -0.1f || y < -0.1f || z < -0.1f ||
                    x > 110.f || y > 110.f || z > 42.f)
                {
                    ok = false; break;
                }
                points.push_back(CVec3(x,y,z));
            }
            if (!ok) break;
            for (unsigned int t = 0; t < tCount; ++t)
            {
                unsigned short a = 0, b = 0, c = 0;
                if (!XPZ3DStage26ReadU16(f,&a) ||
                    !XPZ3DStage26ReadU16(f,&b) ||
                    !XPZ3DStage26ReadU16(f,&c) ||
                    a >= vCount || b >= vCount || c >= vCount)
                {
                    ok = false; break;
                }
                triangles.push_back(STriangle(a,b,c));
            }
            if (!ok) break;
            SXpzStage26Mesh entry;
            entry.nFloor=deck;entry.nMaterial=material;
            entry.nChunkX=cx;entry.nChunkY=cy;entry.nInstances=instances;
            entry.pMesh=new CMemObject;
            entry.pMesh->Create(points,triangles);
            pending.push_back(entry);
        }
        if (!ok) break;
        // Extra bytes indicate a stale or incompatible converter/runtime contract.
        if (fgetc(f) != EOF) ok = false;
    } while(false);
    fclose(f);
    if (ok) meshes->swap(pending);
    return ok;
}
inline CVec4 XPZ3DStage26Color(unsigned int material)
{
    // Temporary clearly marked colors, not textures extracted from PCK.
    static const float rgb[6][4][3] = {
      {{.84f,.86f,.90f},{.80f,.86f,.90f},{.80f,.86f,.90f},{.62f,.70f,.75f}},
      {{.34f,.51f,.32f},{.38f,.40f,.30f},{.38f,.40f,.30f},{.41f,.43f,.34f}},
      {{.50f,.48f,.45f},{.53f,.52f,.50f},{.53f,.52f,.50f},{.44f,.43f,.42f}},
      {{.50f,.56f,.61f},{.48f,.52f,.58f},{.48f,.52f,.58f},{.45f,.52f,.58f}},
      {{.55f,.45f,.33f},{.48f,.41f,.35f},{.48f,.41f,.35f},{.48f,.42f,.35f}},
      {{.56f,.54f,.53f},{.50f,.49f,.48f},{.50f,.49f,.48f},{.50f,.48f,.48f}}
    };
    if (material >= 24) material=23;
    return CVec4(rgb[material/4][material%4][0],rgb[material/4][material%4][1],
        rgb[material/4][material%4][2],1.0f);
}
} // namespace NWorld
#endif
