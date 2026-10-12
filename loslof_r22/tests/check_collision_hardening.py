#!/usr/bin/env python3
"""Extra fail-closed static checks for the R22 collision/cache hardening stage.

Use on patched OXCE sources AFTER
preview -> ballistics -> recovery -> safety -> throw integration.
This checks integration, not gameplay equivalence to lost R21 binary.
"""
from pathlib import Path
import subprocess
import sys
import re

root=Path(sys.argv[1]).resolve()
s=(root/"src/Battlescape/Map.cpp").read_text(encoding="utf-8")
h=(root/"src/Battlescape/Map.h").read_text(encoding="utf-8")
assert s.count("void Map::r22DrawStats(")==1
body=s.split("void Map::r22DrawStats(",1)[1].split("\n}\n",1)[0]
pairs={
    "native overlapping selected target": "targetTile->getOverlappingUnit(_save)" in body,
    "native overlapping collision victim": "t->getOverlappingUnit(_save)" in body,
    "no hidden enemy in target classification": "if (targetUnit && !targetUnit->getVisible()) targetUnit=nullptr;" in body,
    "no hidden enemy in victim classification": "if (victim && !victim->getVisible()) victim=nullptr;" in body,
    "no false terrain hit on unit collision": "status!=V_OUTOFBOUNDS && status!=V_UNIT" in body,
    "clear stale stats if no selected action": "clearInvalidPreview(); return;" in body,
    "clear stale risk cache": "_r22TileRisks.clear();" in body,
    "clear stale HBM label": "_r22StatsText.clear();" in body,
    "clear stale sample count": "_r22SampleCount = 0;" in body,
    "weapon identity included": "mix((unsigned long long)(uintptr_t)weapon);" in body,
    "weapon rule identity included": "mix((unsigned long long)(uintptr_t)weapon->getRules());" in body,
    "ammo identity included": "mix((unsigned long long)(uintptr_t)ammo);" in body,
    "ammo rule identity included": "mix((unsigned long long)(uintptr_t)ammo->getRules());" in body,
    "current accuracy included": "accuracy*1000000.0" in body,
    "current unit-target identity included": "mix((unsigned long long)(uintptr_t)targetUnit);" in body,
    "current accuracy computed BEFORE cache": body.index("double accuracy=")<body.index("unsigned long long key="),
    "shots computed with native config": "conf ? conf->shots : 1" in body,
    "pellets computed from native ammunition": "getShotgunPellets()" in body,
    "RNG state restored": "RNG::globalRandomState()=previous;" in body,
    "still no authored real fire behavior replacement": 'void Map::r22DrawStats(' in s,
}
bad=[]
for name,ok in pairs.items():
    print(("PASS" if ok else "FAIL")+" "+name)
    if not ok:bad.append(name)
print(f"Collision/cache static guards: {len(pairs)-len(bad)}/{len(pairs)}")
if bad:
    raise SystemExit("FAILED COLLISION/CACHE CHECKS: "+", ".join(bad))
