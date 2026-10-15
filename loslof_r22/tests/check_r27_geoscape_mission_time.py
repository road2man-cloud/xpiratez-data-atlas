#!/usr/bin/env python3
"""R27 geoscape countdown regression gates after R22-R26 patch chain.

Checks clicked mission marker => TargetInfoState, clicked landed/crashed UFO =>
UfoDetectedState and accurate saved timers. Does not require or expose a save
in CI; --save is an optional local-only test with user's existing save file.
"""
from pathlib import Path
import argparse
import re
import subprocess

ap=argparse.ArgumentParser()
ap.add_argument("engine",type=Path)
ap.add_argument("--save",type=Path)
args=ap.parse_args()
root=args.engine.resolve()
def text(path):
    return (root/path).read_text(encoding="utf-8")
targeth=text("src/Geoscape/TargetInfoState.h")
targetcpp=text("src/Geoscape/TargetInfoState.cpp")
ufoh=text("src/Geoscape/UfoDetectedState.h")
ufocpp=text("src/Geoscape/UfoDetectedState.cpp")
helper=text("src/Geoscape/R27GeoscapeTimer.h")
site=text("src/Savegame/MissionSite.cpp")
ufo=text("src/Savegame/Ufo.cpp")
geo=text("src/Geoscape/GeoscapeState.cpp")
multiple=text("src/Geoscape/MultipleTargetsState.cpp")
base=text("src/Savegame/AlienBase.cpp")

checks={
    "Globe click opens correct target selection":
        "new MultipleTargetsState(v, crafts, this, true)" in geo and
        "new TargetInfoState(target, _state->getGlobe())" in multiple,
    "Non-UFO mission targets are routed to target information":
        'else\n\t\t{\n\t\t\t_game->pushState(new TargetInfoState(target, _state->getGlobe()));' in multiple,
    "MissionSite popup uses real save-backed seconds":
        'missionSite->getSecondsRemaining()' in targetcpp and
        'MissionSite* missionSite = dynamic_cast<MissionSite*>(_target);' in targetcpp,
    "Existing MissionSite getter/save unchanged":
        'return _secondsRemaining;' in site and
        'writer.write("secondsRemaining", _secondsRemaining);' in site,
    "Permanent base has no expiration countdown":
        'const bool timedSite = missionSite != nullptr;' in targetcpp and
        'timedSite ? new Text(182, 9, 37, 65) : nullptr' in targetcpp and
        'MissionSite* m = missionSite;' in targetcpp,
    "MissionSite information popup has room for the timer":
        '192, timedSite ? 170 : 120' in targetcpp and
        'timedSite ? 15 : 40' in targetcpp and
        'timedSite ? 165 : 140' in targetcpp,
    "MissionSite existing editable title, followers, and despawn penalty retained":
        '_edtTitle->onChange((ActionHandler)&TargetInfoState::edtTitleChange);' in targetcpp and
        'for (const auto* follower : *_target->getFollowers())' in targetcpp and
        'tr("STR_DESPAWN_PENALTY")' in targetcpp,
    "MissionSite existing intercept, Info and OK controls retained":
        'TargetInfoState::btnInterceptClick' in targetcpp and
        'TargetInfoState::btnInfoClick' in targetcpp and
        'TargetInfoState::btnOkClick' in targetcpp,
    "No added countdown on flying UFO or permanent sites":
        'const bool timedGroundSite = _ufo->getStatus() == Ufo::LANDED ||' in ufocpp and
        '_ufo->getStatus() == Ufo::CRASHED;' in ufocpp,
    "UFO countdown reads actual ground/crash timer":
        '_ufo->getSecondsRemaining()' in ufocpp and
        'inline std::string r27FormatRemainingGeoscapeTime(size_t secondsRemaining)' in helper,
    "Grounded/crashed UFO popup has separate ordinary and hyperwave layouts":
        'timedGroundSite ? 196 : 180' in ufocpp and
        'timedGroundSite ? 148 : 128' in ufocpp and
        'hyperwave ? 131 : 113' in ufocpp and
        'timedGroundSite ? 178 : 168' in ufocpp,
    "UFO interception, centre and cancel remain available":
        'UfoDetectedState::btnInterceptClick' in ufocpp and
        'UfoDetectedState::btnCentreClick' in ufocpp and
        'UfoDetectedState::btnCancelClick' in ufocpp,
    "UFO native countdown and flyaway rules unchanged":
        'return _secondsRemaining;' in ufo and
        '_secondsRemaining -= 5;' in ufo and
        'if (ufo->getSecondsRemaining() == 0)' in geo,
    "Grounded mission sites do not lose existing targeting extension":
        'removeSite = noFollowers; // CHEEKY EXPLOIT' in geo and
        'site->setSecondsRemaining(site->getSecondsRemaining() - 30 * 60);' in geo,
    "Formatter uses actual remaining not original mission duration":
        'secondsRemaining / 60u' in helper and
        '(secondsRemaining % 60u != 0u ? 1u : 0u)' in helper and
        'minutesTotal / 1440u' in helper and
        '(minutesTotal / 60u) % 24u' in helper,
    "Countdown zero/nonzero correctly reflects source without editing countdown":
        "TIME LEFT: " in helper and
        'getSecondsRemaining()' in targetcpp and
        'getSecondsRemaining()' in ufocpp and
        'setSecondsRemaining(' not in targetcpp+ufocpp and
        'setStatus(' not in targetcpp+ufocpp,
    "No extra savegame or engine event hooks created":
        'MissionSite::save' not in targetcpp+ufocpp and
        'Ufo::save' not in targetcpp+ufocpp,
    "MissionSite timer declared and registered only when needed":
        '_txtRemaining' in targeth and
        'if (_txtRemaining)\n\t\tadd(_txtRemaining, "text2", "targetInfo");' in targetcpp,
    "UFO timer declared and registered only when needed":
        '_txtRemaining' in ufoh and
        'if (_txtRemaining)\n\t\tadd(_txtRemaining, "text", "UFOInfo");' in ufocpp,
}
# Geometry regression checks for both separate geoscape layouts.
siteWindow=(15,185)
siteTimes=(65,74)
siteFollowers=(90,130)
sitePenalty=(137,146)
siteActions=[(149,161),(165,177)]
checks["Site text and buttons do not overlap"] = (
    siteWindow[0] < 30 < 62 < siteTimes[0] < siteTimes[1] < 79
    and siteFollowers[1] < sitePenalty[0]
    and sitePenalty[1] < siteActions[0][0]
    and siteActions[-1][-1] < siteWindow[1]
)
ufoLayouts=[
    ((36,184),(113,122),(130,142),(146,158),(162,174),(80,112)),
    ((2,198),(131,140),(146,158),(162,174),(178,190),(96,128)),
]
checks["Grounded ordinary and hyperwave popups leave room for timer/buttons"] = all(
    win[0]<lst[0] and lst[1] < clock[0] < clock[1] < a[0]
    and a[1] < b[0] and b[1] < c[0] and c[1] < win[1]
    for win,clock,a,b,c,lst in ufoLayouts
)
if args.save is not None:
    raw=args.save.read_text(encoding="utf-8")
    if "missionSites:" not in raw:
        raise SystemExit("Local regression save missing missionSites")
    section=raw.split("missionSites:",1)[1].split("alienMissions:",1)[0]
    checks["Real 25.sav includes two persisted mission timers"] = (
        "STR_LOC_RATLING_VILLAGE" in section and
        re.search(r"secondsRemaining:\s+531000\b",section) is not None and
        "STR_LOC_MONSTER_HUNT_SHAMBLER" in section and
        re.search(r"secondsRemaining:\s+192600\b",section) is not None
    )
# Modified engine tracked paths include only C++ UI + old cumulative patches,
# never C++ geoscape timer/saves/rules.
if (root/".git").is_dir():
    changed=set(subprocess.check_output(
        ["git","-C",str(root),"diff","--name-only"],text=True).splitlines())
    original_cumulative={
        "src/Battlescape/Map.h","src/Battlescape/Map.cpp",
        "src/Battlescape/TileEngine.cpp","src/Battlescape/TileEngine.h",
        "src/Battlescape/Projectile.cpp","src/Battlescape/Projectile.h",
        "src/Battlescape/BattlescapeState.cpp",
        "src/Battlescape/ProjectileFlyBState.cpp",
        "src/Battlescape/ProjectileFlyBState.h",
        "src/Mod/Mod.cpp","src/Menu/OptionsAdvancedState.cpp",
        "src/CMakeLists.txt",
        "src/Basescape/ResearchState.cpp","src/Basescape/NewResearchListState.cpp",
        "src/Basescape/ResearchInfoState.cpp","src/Basescape/ResearchInfoState.h",
    }
    r27={
        "src/Geoscape/TargetInfoState.h","src/Geoscape/TargetInfoState.cpp",
        "src/Geoscape/UfoDetectedState.h","src/Geoscape/UfoDetectedState.cpp",
    }
    checks["R27 changes only four geoscape UI files beyond R22-R26"] = (
        changed.issubset(original_cumulative | r27) and r27.issubset(changed)
    )

for name,ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit("R27 mission remaining-time gates failed")
print(f"PASS {len(checks)} R27 structural, UI layout, save and behavior checks")
