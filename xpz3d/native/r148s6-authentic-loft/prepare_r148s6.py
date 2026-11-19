#!/usr/bin/env python3
"""Stage R148S6 real LOFT geometry on cumulative R148S3 OXCE + R148S5 S2.

Preserves source bytes, old executables, game data and saves. No in-place edits.
All replacements require exactly one matching source anchor.
"""
from pathlib import Path
import shutil
import re
import hashlib

ROOT = Path(r"D:\daphne_auto\XPZ3D_R148S6_AUTHENTIC_LOFT_20261119")
OX_PARENT = Path(r"D:\daphne_auto\XPZ_R148_HUD_TERRAIN_F11_20261119\oxce")
S2_PARENT = Path(r"D:\daphne_auto\XPZ3D_R148S5_SOLID_TERRAIN_20261119\s2")
OX = ROOT / "oxce"
S2 = ROOT / "s2"
for d in [OX, S2, OX/"build", S2/"assets"]:
    d.mkdir(parents=True, exist_ok=True)

def copy(source, dest):
    if not source.is_file():
        raise FileNotFoundError(str(source))
    shutil.copy2(source,dest)

def replace_once(path, previous, following):
    if isinstance(previous,str): previous=previous.encode("ascii")
    if isinstance(following,str): following=following.encode("ascii")
    data=path.read_bytes()
    count=data.count(previous)
    if count!=1:
        raise ValueError(f"ANCHOR_COUNT={count} {path}: {previous[:85]!r}")
    path.write_bytes(data.replace(previous,following,1))

def variant_headers(target):
    wire=target/"XPZ3DTerrainWireR137.h"
    text=wire.read_bytes()
    pat=rb"(    uint8_t flags;[^\r\n]*\r?\n)"
    addition=(b"    uint16_t loftID[4][12]; // OXCE original 12 LOFT layers per tile part;\r\n"
              b"                           // 0xffff if absent or not discovered\r\n")
    replaced,count=re.subn(pat,lambda m:m.group(1)+addition,text)
    if count!=1:
        raise ValueError(f"R148S6 flags anchor count {count} in {wire}")
    wire.write_bytes(replaced)
    replace_once(wire,"static_assert(sizeof(XPZ3DTerrainCell)==20",
                      "static_assert(sizeof(XPZ3DTerrainCell)==116")
    replace_once(wire,"static_assert(sizeof(XPZ3DTerrainPacket)==1344",
                      "static_assert(sizeof(XPZ3DTerrainPacket)==7488")
    replace_once(wire,"static const uint32_t Version=2;",
                      "static const uint32_t Version=3;")
    replace_once(wire,"XPZ3D_OXCE_TERRAIN_R137_ACK2",
                      "XPZ3D_OXCE_TERRAIN_R148S6_ACK3")
    ring=target/"XPZ3DTerrainRingR137.h"
    replace_once(ring,"XPZ3D_OXCE_TERRAIN_RING_R137",
                      "XPZ3D_OXCE_TERRAIN_RING_R148S6")
    replace_once(ring,"r_->version=1;","r_->version=2;")
    raw=ring.read_bytes()
    if raw.count(b"r_->version!=1")!=2:
        raise ValueError("R148S6 unexpected ring ABI version anchors")
    ring.write_bytes(raw.replace(b"r_->version!=1",b"r_->version!=2"))
    publisher=target/"XPZ3DTerrainIncrementalR137.h"
    replace_once(publisher,
     "for(int j=0;j<4;++j){cell.mcd[j]=Missing;cell.dataset[j]=Missing;}",
     "for(int j=0;j<4;++j){cell.mcd[j]=Missing;cell.dataset[j]=Missing;"
     " for(int z=0;z<12;++z)cell.loftID[j][z]=Missing;}")

shared=["XPZ3DTerrainWireR137.h","XPZ3DTerrainRingR137.h",
        "XPZ3DTerrainIncrementalR137.h","XPZ3DActorWireR143.h",
        "XPZ3DLiveViewProducer.h"]
for name in shared:
    src=OX_PARENT/name
    if not src.exists() and name=="XPZ3DActorWireR143.h":
        src=Path(r"D:\daphne_auto\XPZ_R143_ACTOR_STREAM_20261119\oxce")/name
    if name=="XPZ3DActorWireR143.h" or name=="XPZ3DLiveViewProducer.h" or name.startswith("XPZ3DTerrain"):
        copy(src,OX/name)
for name in ["XPZ3DOXCEMapAdapterR137.h","XPZ3DOXCEActorProducerR143.h"]:
    copy(OX_PARENT/name,OX/name)
copy(OX_PARENT/"BattlescapeState.cpp",OX/"BattlescapeState.cpp")
copy(ROOT/"XPZ3DLoftRowsR148S6.h",OX/"XPZ3DLoftRowsR148S6.h")
variant_headers(OX)

mapadapter=OX/"XPZ3DOXCEMapAdapterR137.h"
replace_once(mapadapter,
    "if(!tile->getMapData(parts[i]))continue;",
    "if(!tile->getMapData(parts[i]) || !tile->isDiscovered(parts[i]))continue;")
replace_once(mapadapter,
    "dest.flags |= (uint8_t)(1u<<i);",
    """dest.flags |= (uint8_t)(1u<<i);
                    // Exact original OXCE MapData LOFT, not a box proxy.
                    // Only discovered parts may enter the visual transport.
                    const MapData* partData=tile->getMapData(parts[i]);
                    for(int layer=0;layer<12;++layer) {
                        const int loft=partData->getLoftID(layer);
                        if(loft>=0 && loft<65535)
                            dest.loftID[i][layer]=static_cast<uint16_t>(loft);
                    }""")

battlescape=OX/"BattlescapeState.cpp"
replace_once(battlescape,
    '#include "XPZ3DOXCEActorProducerR143.h"',
    '#include "XPZ3DOXCEActorProducerR143.h"\r\n#include "XPZ3DLoftRowsR148S6.h"')
replace_once(battlescape,
    "XPZ3DPublishLiveTerrain(_save);",
    """XPZ3DPublishLiveTerrain(_save);
    // Export exactly the Mod voxel rows used by OXCE TileEngine.
    // This only publishes geometry data for the S2 spectator.
    XPZ3DLoftR148S6::Publish(_game->getMod()->getVoxelData(),
                              XPZ3DSession().epoch);""")

# S2 keeps camera, current F11 rig and R148S4 smoothing; only the terrain
# geometry/transport ABI and the new real-LOFT palette consumer are upgraded.
for src in S2_PARENT.glob("*.h"):
    copy(src,S2/src.name)
copy(S2_PARENT/"iMissionBase-r136.cpp",S2/"iMissionBase-r136.cpp")
for src in (S2_PARENT/"assets").iterdir():
    if src.is_file():
        copy(src,S2/"assets"/src.name)
copy(ROOT/"XPZ3DLoftRowsR148S6.h",S2/"XPZ3DLoftRowsR148S6.h")
copy(ROOT/"XPZ3DTerrainVisualMeshR148S6.h",S2/"XPZ3DTerrainVisualMeshR148S6.h")
copy(ROOT/"XPZ3DTerrainGpuOverlayR148S6.h",S2/"XPZ3DTerrainGpuOverlayR148S6.h")
variant_headers(S2)

s2cpp=S2/"iMissionBase-r136.cpp"
replace_once(s2cpp,
 '#include "XPZ3DTerrainGpuOverlayR137.h"',
 '#include "XPZ3DTerrainGpuOverlayR148S6.h"\r\n#include "XPZ3DLoftRowsR148S6.h"')
replace_once(s2cpp,
 '            terrainOverlay.SyncSession(GetScene(),terrainChunk);',
 '''            terrainOverlay.SyncSession(GetScene(),terrainChunk);
            // Defer dirty-cache acceptance until the exact same OXCE
            // LOFT palette epoch is visible; do not lose the first chunk.
            if(!XPZ3DLoftR148S6::Shared().Bind(
                    terrainChunk.producerPid,terrainChunk.mapEpoch))continue;''')
replace_once(s2cpp,
 'XPZ3DTerrain::BuildVisualChunk(terrainChunk);',
 'XPZ3DTerrain::BuildVisualChunk(terrainChunk,\r\n'
 '                XPZ3DLoftR148S6::Shared().Rows());')

build=(S2_PARENT/"build_r148s5_s2.py").read_text(encoding="utf-8")
build=build.replace("r148s5-solid","r148s6-loft")
build=build.replace("R148S5_S2_BUILD_RECEIPT","R148S6_S2_BUILD_RECEIPT")
build=build.replace("r148s5.reset_r136_terrain_solid_actors",
                    "r148s6.reset_r136_terrain_loft_actors")
(S2/"build_r148s6_s2.py").write_text(build,encoding="utf-8")

for title,path in [
  ("R148S6 OXCE source",battlescape),
  ("R148S6 exact LOFT atlas",OX/"XPZ3DLoftRowsR148S6.h"),
  ("R148S6 native S2",s2cpp),
  ("R148S6 source voxel renderer",S2/"XPZ3DTerrainVisualMeshR148S6.h"),
]:
    print(title, path.stat().st_size,
          hashlib.sha256(path.read_bytes()).hexdigest()[:24],flush=True)
print("R148S6_STAGED",flush=True)
