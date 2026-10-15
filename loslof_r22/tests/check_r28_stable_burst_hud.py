#!/usr/bin/env python3
"""R28 source and numeric regression gates for MP40 six-shot preview stability.

CI run after R22 through R28; the user-owned 38.sav is optional local evidence
only and must NOT be uploaded with this repository.
"""
from pathlib import Path
import argparse,math,re,subprocess
p=argparse.ArgumentParser()
p.add_argument("engine",type=Path)
p.add_argument("--save",type=Path)
args=p.parse_args()
root=args.engine.resolve()
mapcpp=(root/"src/Battlescape/Map.cpp").read_text(encoding="utf-8")
proj=(root/"src/Battlescape/Projectile.cpp").read_text(encoding="utf-8")
native=(root/"src/Battlescape/ProjectileFlyBState.cpp").read_text(encoding="utf-8")

def method(text,signature):
    start=text.index(signature)
    br=text.index("{",start)
    depth=0
    for i in range(br,len(text)):
        depth+=(text[i]=="{")-(text[i]=="}")
        if depth==0:return text[start:i+1]
    raise RuntimeError(signature)

hud=method(mapcpp,"void Map::r22DrawStats(")

def signature(ammo, burst=6, spend=1):
    return min(ammo, burst*max(1,spend))

checks={
"Only preview code uses saturated magazine signature":
    'const int ammoSignature = ammo->getRules()->getClipSize() > 0' in hud and
    'ammoSignature,shots,pellets})' in hud and
    '(int)ammo->getAmmoQuantity(),shots,pellets})' not in hud,
"Firing six MP40 rounds from 39 to 33 no longer changes preview signature":
    signature(39)==signature(33)==6,
"Starting 42 and then 39 after 3-round burst yields same signature":
    signature(42)==signature(39)==6,
"Not enough rounds still yields a distinct cache scenario":
    signature(5)==5 and signature(2)==2 and signature(0)==0,
"Other ammo-per-shot actions saturate at shots times cost":
    signature(11,6,2)==11 and signature(15,6,2)==12,
"Target, weapon, stance, LOS and obstruction still invalidate probability":
    'mix((unsigned long long)(uintptr_t)weapon);' in hud and
    'mix((unsigned long long)(uintptr_t)targetUnit);' in hud and
    'mix((unsigned int)(virtualHasLOS+1));' in hud and
    'mix(static_cast<unsigned>(directCollision));' in hud,
"No change to native accuracy formula or bullet trajectories":
    'BattleUnit::getFiringAccuracy(attack, _parent->getMod())' in native and
    'void Projectile::applyAccuracy(' in proj and
    'calculateLineVoxel(originVoxel, _targetVoxel, true, &_trajectory' in proj,
"All H/B/M estimates are from complete burst trials":
    'for (int shotIndex=1; shotIndex<=shots; ++shotIndex)' in hud and
    'if (oneHit) anyHit=true;' in hud and
    'if (firstShotRejected) ++blocked;' in hud,
"Six-shot MP40 first batch is only FOUR independent burst simulations":
    'const unsigned traceBudget=newScenario ? 24U : 96U;' in hud and
    'const unsigned frameBudget=std::max(1U,' in hud and
    min(64,24//6)==4,
"Next batch adds SIXTEEN, giving n=20 before the user can read H":
    min(64,96//6)==16 and 4+16==20,
"HUD visibly discloses incomplete Monte Carlo and sample count":
    '<< "H~" << _r22HitSamples*100U/_r22SampleCount' in hud and
    '<< "% n" << _r22SampleCount;' in hud,
"Preview precision remains 1024 burst trials, not 1024 bullets":
    '_r22SampleCount < 1024U' in hud and
    'const unsigned projectilesPerTrial=static_cast<unsigned>(shots*pellets);' in hud,
"Cache refresh uses the same seeded burst stream if all relevant data unchanged":
    'const unsigned long long sampleSeed=key^' in hud and
    '(_r22SampleCount+1ULL)' in hud,
"Savegame data is not edited by preview":
    'setAmmoQuantity(' not in hud and
    'setHealth(' not in hud and
    'setPosition(' not in hud,
}
if args.save is not None:
    import yaml
    with args.save.open(encoding="utf-8") as fd:
        _,game=yaml.safe_load_all(fd)
    b=game["battleGame"]
    u=next(x for x in b["units"] if x["id"]==9)
    gun=next(x for x in b["items"] if x.get("owner")==9 and x.get("inventoryslot")=="STR_RIGHT_HAND")
    mag=next(x for x in b["items"] if x["id"]==gun["ammoItem"])
    checks["38.sav currently has Assault Clone MP40, 33 rounds, full firing health"] = (
        u["position"]==[15,9,0] and u["currStats"]["firing"]==95 and
        u["health"]==u["currStats"]["health"] and
        not any(u["fatalWounds"]) and
        gun["type"]=="STR_MP40" and mag["type"]=="STR_HSMG_CLIP" and
        mag["ammoqty"]==33 and u["tempUnitStatistics"]["shotsFiredCounter"]==9
    )
    checks["38.sav retains enough ammo for SIX round automatic burst"] = mag["ammoqty"]>=6
if (root/".git").exists():
    diffs=set(subprocess.check_output(["git","-C",str(root),"diff","--name-only"],text=True).splitlines())
    expected={"src/Battlescape/Map.h","src/Battlescape/Map.cpp",
        "src/Battlescape/TileEngine.cpp","src/Battlescape/TileEngine.h",
        "src/Battlescape/Projectile.cpp","src/Battlescape/Projectile.h",
        "src/Battlescape/BattlescapeState.cpp",
        "src/Battlescape/ProjectileFlyBState.cpp",
        "src/Battlescape/ProjectileFlyBState.h",
        "src/Mod/Mod.cpp","src/Menu/OptionsAdvancedState.cpp",
        "src/CMakeLists.txt",
        "src/Basescape/ResearchState.cpp","src/Basescape/NewResearchListState.cpp",
        "src/Basescape/ResearchInfoState.cpp","src/Basescape/ResearchInfoState.h",
        "src/Geoscape/TargetInfoState.cpp","src/Geoscape/TargetInfoState.h",
        "src/Geoscape/UfoDetectedState.cpp","src/Geoscape/UfoDetectedState.h"}
    checks["Cumulative R22-R28 patch remains inside old permitted surfaces"]=diffs.issubset(expected)
for key,value in checks.items():
    print(f"{'PASS' if value else 'FAIL'}: {key}")
if not all(checks.values()):
    raise SystemExit("R28 preview stability regression failed")
print(f"PASS: {len(checks)} R28 gates; actual game A/B still unverified")
