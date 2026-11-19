#!/usr/bin/env python3
"""R148S7 cumulative original-PCK material integration, isolated build files."""
from pathlib import Path
import shutil,hashlib
ROOT=Path(r"D:\daphne_auto\XPZ3D_R148S7_PCK_MATERIAL_20261119")
PARENT=Path(r"D:\daphne_auto\XPZ3D_R148S6_AUTHENTIC_LOFT_20261119")
OX,S2=ROOT/"oxce",ROOT/"s2"
for d in [OX,S2,ROOT/"build",S2/"assets"]:
    d.mkdir(parents=True,exist_ok=True)
def replace_once(f,old,new):
    orig=f.read_bytes()
    old=old.encode('ascii');new=new.encode('ascii')
    count=orig.count(old)
    if count!=1: raise ValueError("ANCHOR_COUNT={} {} {}".format(count,f,old[:120]))
    f.write_bytes(orig.replace(old,new,1))
def replace_many(f,old,new,number):
    data=f.read_bytes()
    old=old.encode('ascii');new=new.encode('ascii')
    if data.count(old)!=number:raise ValueError("COUNT={} {} {}".format(data.count(old),f,old))
    f.write_bytes(data.replace(old,new))
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()[:23]

for f in (PARENT/"oxce").glob("*.h"):shutil.copy2(f,OX/f.name)
shutil.copy2(PARENT/"oxce"/"BattlescapeState.cpp",OX/"BattlescapeState.cpp")
shutil.copy2(ROOT/"XPZ3DPCKAppearanceR148S7.h",OX/"XPZ3DPCKAppearanceR148S7.h")
for f in (PARENT/"s2").glob("*.h"):shutil.copy2(f,S2/f.name)
shutil.copy2(PARENT/"s2"/"iMissionBase-r136.cpp",S2/"iMissionBase-r136.cpp")
for f in (PARENT/"s2"/"assets").glob("*"):
    if f.is_file():shutil.copy2(f,S2/"assets"/f.name)
shutil.copy2(ROOT/"XPZ3DTerrainGpuOverlayR148S7.h",S2/"XPZ3DTerrainGpuOverlayR148S7.h")
for folder in (OX,S2):
    wire=folder/"XPZ3DTerrainWireR137.h"
    replace_once(wire,"    uint16_t loftID[4][12];",
       "    uint32_t pckRgb[4][4]; // original PCK sprite 2x2 averaged palette RGB (0xffRRGGBB)\n    uint16_t loftID[4][12];")
    replace_once(wire,"static_assert(sizeof(XPZ3DTerrainCell)==116",
                      "static_assert(sizeof(XPZ3DTerrainCell)==180")
    replace_once(wire,"static_assert(sizeof(XPZ3DTerrainPacket)==7488",
                      "static_assert(sizeof(XPZ3DTerrainPacket)==11584")
    replace_once(wire,"static const uint32_t Version=3;",
                      "static const uint32_t Version=4;")
    replace_once(wire,"XPZ3D_OXCE_TERRAIN_R148S6_ACK3",
                      "XPZ3D_OXCE_TERRAIN_R148S7_ACK4")
    ring=folder/"XPZ3DTerrainRingR137.h"
    replace_once(ring,"XPZ3D_OXCE_TERRAIN_RING_R148S6",
                      "XPZ3D_OXCE_TERRAIN_RING_R148S7")
    replace_once(ring,"r_->version=2;","r_->version=3;")
    replace_many(ring,"r_->version!=2","r_->version!=3",2)

adapter=OX/"XPZ3DOXCEMapAdapterR137.h"
replace_once(adapter,'#include "XPZ3DTerrainIncrementalR137.h"',
  '#include "XPZ3DTerrainIncrementalR137.h"\n#include "XPZ3DPCKAppearanceR148S7.h"')
replace_once(adapter,"s.current=save; ++s.epoch;",
                     "s.current=save; ++s.epoch;\n    XPZ3DPCKR148S7::Shared().Reset();")
replace_once(adapter,"s.current=save;++s.epoch;",
                     "s.current=save;++s.epoch;XPZ3DPCKR148S7::Shared().Reset();")
replace_once(adapter,"void XPZ3DPublishLiveTerrain(SavedBattleGame *save)",
                     "void XPZ3DPublishLiveTerrain(SavedBattleGame *save,const SDL_Color* palette)")
replace_once(adapter,"[save](uint32_t x,uint32_t y,uint32_t z,XPZ3DTerrainCell& dest)",
                     "[save,palette](uint32_t x,uint32_t y,uint32_t z,XPZ3DTerrainCell& dest)")
replace_once(adapter,
 "                    const MapData* partData=tile->getMapData(parts[i]);",
 """                    const MapData* partData=tile->getMapData(parts[i]);
                    // R148S7: sample the original, already-loaded MCD PCK
                    // sprites with the active tactical palette. Pure visual
                    // metadata, not OXCE tile/visibility logic.
                    const XPZ3DPCKR148S7::Appearance sourceColors=
                        XPZ3DPCKR148S7::Shared().Sample(partData,palette);
                    for(int region=0;region<4;++region)
                        dest.pckRgb[i][region]=sourceColors.rgb[region];""")
battlescape=OX/"BattlescapeState.cpp"
replace_once(battlescape,"XPZ3DPublishLiveTerrain(_save);",
                     "XPZ3DPublishLiveTerrain(_save,_game->getScreen()->getPalette());")
# Keep exact original LOFT mesh topology, only attach PCK-derived region colour
# to the two triangles of each fused exposed surface.
visual=S2/"XPZ3DTerrainVisualMeshR148S7.h"
shutil.copy2(PARENT/"s2"/"XPZ3DTerrainVisualMeshR148S6.h",visual)
replace_once(visual,
 "    VisualVertex v[3];uint16_t mcd,dataset;uint8_t part;",
 "    VisualVertex v[3];uint16_t mcd,dataset;uint8_t part;uint32_t pckColor;")
replace_once(visual,
 "                    const VisualVertex& d,uint16_t mcd,\n                    uint16_t dataset,uint8_t part) {",
 "                    const VisualVertex& d,uint16_t mcd,\n                    uint16_t dataset,uint8_t part,uint32_t sourceColor) {")
replace_once(visual,
 "    const VisualTriangle first={{a,b,c},mcd,dataset,part};\n    const VisualTriangle second={{a,c,d},mcd,dataset,part};",
 "    const VisualTriangle first={{a,b,c},mcd,dataset,part,sourceColor};\n    const VisualTriangle second={{a,c,d},mcd,dataset,part,sourceColor};")
replace_once(visual,
 "                       uint16_t mcd,uint16_t dataset,uint8_t part) {",
 "                       uint16_t mcd,uint16_t dataset,uint8_t part,\n                       const uint32_t sourceColors[4]) {")
replace_once(visual,
 "                    if(sign>0)AddQuad(out,v0,v1,v2,v3,mcd,dataset,part);\n                    else AddQuad(out,v0,v3,v2,v1,mcd,dataset,part);",
 """                    // PCK is an isometric 2D sprite, not native 3D UVs.
                    // Select among sampled source-sprite quadrants using the
                    // exposed face's XY position and LOFT height. This
                    // preserves source colours without pretending exact UVs.
                    const int cx=(a[0]+c[0])/2;
                    const int cy=(a[1]+c[1])/2;
                    const int cz=(a[2]+c[2])/2;
                    const int region=(cx>cy?1:0)|(cz<6?2:0);
                    const uint32_t pckRgb=sourceColors[region];
                    if(sign>0)AddQuad(out,v0,v1,v2,v3,mcd,dataset,part,pckRgb);
                    else AddQuad(out,v0,v3,v2,v1,mcd,dataset,part,pckRgb);""")
replace_once(visual,
 "                           static_cast<uint8_t>(part));",
 "                           static_cast<uint8_t>(part),cell.pckRgb[part]);")
s2=S2/"iMissionBase-r136.cpp"
replace_once(s2,'#include "XPZ3DTerrainGpuOverlayR148S6.h"',
                   '#include "XPZ3DTerrainGpuOverlayR148S7.h"')
build=(PARENT/"s2"/"build_r148s6_s2.py").read_text(encoding="utf8")
build=build.replace("r148s6-loft","r148s7-pck").replace(
    "R148S6_S2_BUILD_RECEIPT","R148S7_S2_BUILD_RECEIPT").replace(
    "r148s6.reset_r136_terrain_loft_actors",
    "r148s7.reset_r136_terrain_loft_pck_actors")
(S2/"build_r148s7_s2.py").write_text(build,encoding="utf8")
source=(PARENT/"build_r148s6.ps1").read_text(encoding="utf8")
source=source.replace("XPZ3D_R148S6_AUTHENTIC_LOFT_20261119",
                      "XPZ3D_R148S7_PCK_MATERIAL_20261119")
source=source.replace("r148s6","r148s7").replace("R148S6","R148S7")
source=source.replace("ALLPATCH_AUTHENTIC_LOFT_ACTORS",
                      "ALLPATCH_LOFT_PCK_ACTORS")
(ROOT/"build_r148s7.ps1").write_text(source,encoding="utf8")
for label,path in [
 ("OXCE",battlescape),("WIRE",OX/"XPZ3DTerrainWireR137.h"),
 ("PCK-SAMPLER",OX/"XPZ3DPCKAppearanceR148S7.h"),
 ("LOFT-MESH",visual),("S2-OVERLAY",S2/"XPZ3DTerrainGpuOverlayR148S7.h")]:
    print("R148S7_STAGED",label,path.stat().st_size,sha(path),flush=True)
