#!/usr/bin/env python3
"""R27: show remaining day/hour/minute timers on clicked geoscape mission markers.

Apply after the pinned R22-R26 patch chain. Sites read MissionSite::_secondsRemaining.
Landed/crashed UFOs use Ufo::_secondsRemaining. Non-timed targets are
untouched. There are NO writes to savegames, mission clocks or native
geoscape expiry logic.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
FILES = (
    "src/Geoscape/TargetInfoState.h",
    "src/Geoscape/TargetInfoState.cpp",
    "src/Geoscape/UfoDetectedState.h",
    "src/Geoscape/UfoDetectedState.cpp",
)
TIMER_PATH = "src/Geoscape/R27GeoscapeTimer.h"

TIMER_HEADER = r'''#pragma once
/*
 * XPiratez / OXCE R27: read-only geoscape countdown rendering.
 *
 * Display the saved live timer, never the original mission duration.
 * Round up to a full minute so the UI does not prematurely say 0m.
 * No game state, clock or rule data is altered.
 */
#include <cstddef>
#include <sstream>
#include <string>

namespace OpenXcom
{

inline std::string r27FormatRemainingGeoscapeTime(size_t secondsRemaining)
{
    const size_t minutesTotal = secondsRemaining / 60u +
        (secondsRemaining % 60u != 0u ? 1u : 0u);
    const size_t days = minutesTotal / 1440u;
    const size_t hours = (minutesTotal / 60u) % 24u;
    const size_t minutes = minutesTotal % 60u;

    std::ostringstream ss;
    ss << "TIME LEFT: " << days << "d " << hours << "h";
    if (minutes != 0u)
        ss << " " << minutes << "m";
    return ss.str();
}

} // namespace OpenXcom
'''


def once(src, old, new, where):
    n = src.count(old)
    if n != 1:
        raise RuntimeError(f"R27 {where}: one anchor required, got {n}: {old[:110]!r}")
    return src.replace(old, new, 1)


def patch(targeth, targetcpp, ufoh, ufocpp):
    # Keep TargetInfoState's exact old geometry for permanent AlienBase and
    # untimed target types. Add space only to the MissionSite popup.
    targeth = once(
        targeth,
        "Text *_txtTargetted, *_txtFollowers, *_txtPenalty;",
        "Text *_txtTargetted, *_txtFollowers, *_txtPenalty, *_txtRemaining;",
        "target dialog timer member"
    )
    targetcpp = once(
        targetcpp,
        '#include "TargetInfoState.h"\n',
        '#include "TargetInfoState.h"\n#include "R27GeoscapeTimer.h"\n',
        "site shared formatter"
    )
    targetcpp = once(
        targetcpp,
        '\t_screen = false;\n\n\t// Create objects\n'
        '\t_window = new Window(this, 192, 120, 32, 40, POPUP_BOTH);\n'
        '\t_btnIntercept = new TextButton(160, 12, 48, 124);\n'
        '\t_btnInfo = new TextButton(77, 12, 48, 140);\n'
        '\t_btnOk = new TextButton(77, 12, 131, 140);\n'
        '\t_edtTitle = new TextEdit(this, 182, 32, 37, 46);\n'
        '\t_txtTargetted = new Text(182, 9, 37, 78);\n'
        '\t_txtFollowers = new Text(182, 40, 37, 88);\n'
        '\t_txtPenalty = new Text(160, 9, 48, 114);',
        '\t_screen = false;\n'
        '\t// MissionSite stores the real remaining lifespan in seconds.\n'
        '\t// Only its popup is enlarged, preserving all other target layouts.\n'
        '\tMissionSite* missionSite = dynamic_cast<MissionSite*>(_target);\n'
        '\tconst bool timedSite = missionSite != nullptr;\n\n'
        '\t// Create objects\n'
        '\t_window = new Window(this, 192, timedSite ? 170 : 120, 32,\n'
        '\t\t\ttimedSite ? 15 : 40, POPUP_BOTH);\n'
        '\t_btnIntercept = new TextButton(160, 12, 48, timedSite ? 149 : 124);\n'
        '\t_btnInfo = new TextButton(77, 12, 48, timedSite ? 165 : 140);\n'
        '\t_btnOk = new TextButton(77, 12, 131, timedSite ? 165 : 140);\n'
        '\t_edtTitle = new TextEdit(this, 182, 32, 37, timedSite ? 30 : 46);\n'
        '\t_txtTargetted = new Text(182, 9, 37, timedSite ? 79 : 78);\n'
        '\t_txtFollowers = new Text(182, 40, 37, timedSite ? 90 : 88);\n'
        '\t_txtPenalty = new Text(160, 9, 48, timedSite ? 137 : 114);\n'
        '\t_txtRemaining = timedSite ? new Text(182, 9, 37, 65) : nullptr;',
        "site dialog geometry"
    )
    targetcpp = once(
        targetcpp,
        '\tadd(_txtPenalty, "text2", "targetInfo");',
        '\tadd(_txtPenalty, "text2", "targetInfo");\n'
        '\tif (_txtRemaining)\n'
        '\t\tadd(_txtRemaining, "text2", "targetInfo");',
        "site registration"
    )
    targetcpp = once(
        targetcpp,
        '\t_txtFollowers->setText(ss.str());\n\n\t// info\n'
        '\tMissionSite* m = dynamic_cast<MissionSite*>(_target);',
        '\t_txtFollowers->setText(ss.str());\n'
        '\tif (_txtRemaining)\n'
        '\t{\n'
        '\t\t_txtRemaining->setAlign(ALIGN_CENTER);\n'
        '\t\t_txtRemaining->setText(r27FormatRemainingGeoscapeTime(\n'
        '\t\t\tmissionSite->getSecondsRemaining()));\n'
        '\t}\n\n\t// info\n'
        '\tMissionSite* m = missionSite;',
        "site actual countdown"
    )

    # Globe-clicked crashed/landed UFOs use a separate state; expose their
    # nonzero/zero ground timers without decorating moving UFOs.
    ufoh = once(
        ufoh,
        "Text *_txtUfo, *_txtDetected, *_txtHyperwave;",
        "Text *_txtUfo, *_txtDetected, *_txtHyperwave, *_txtRemaining;",
        "ufo dialog timer member"
    )
    ufocpp = once(
        ufocpp,
        '#include "UfoDetectedState.h"\n',
        '#include "UfoDetectedState.h"\n#include "R27GeoscapeTimer.h"\n',
        "ufo shared formatter"
    )
    ufocpp = once(
        ufocpp,
        '\t_screen = false;\n\n\t// Create objects\n'
        '\tif (hyperwave)\n'
        '\t{\n'
        '\t\t_window = new Window(this, 224, 180, 16, 10, POPUP_BOTH);\n'
        '\t}\n'
        '\telse\n'
        '\t{\n'
        '\t\t_window = new Window(this, 224, 128, 16, 44, POPUP_BOTH);\n'
        '\t}',
        '\t_screen = false;\n'
        '\t// Grounded UFOs take off and crashes disappear when this saved\n'
        '\t// countdown runs out. Flying UFOs have no such ground timer.\n'
        '\tconst bool timedGroundSite = _ufo->getStatus() == Ufo::LANDED ||\n'
        '\t\t_ufo->getStatus() == Ufo::CRASHED;\n\n'
        '\t// Create objects. Keep the normal UFO popup untouched.\n'
        '\tif (hyperwave)\n'
        '\t{\n'
        '\t\t_window = new Window(this, 224, timedGroundSite ? 196 : 180,\n'
        '\t\t\t16, timedGroundSite ? 2 : 10, POPUP_BOTH);\n'
        '\t}\n'
        '\telse\n'
        '\t{\n'
        '\t\t_window = new Window(this, 224, timedGroundSite ? 148 : 128,\n'
        '\t\t\t16, timedGroundSite ? 36 : 44, POPUP_BOTH);\n'
        '\t}',
        "grounded ufo popup geometry"
    )
    ufocpp = once(
        ufocpp,
        '\t_lstInfo2 = new TextList(217, 32, 28, 96);\n\n'
        '\tif (hyperwave)\n'
        '\t{\n'
        '\t\t_btnIntercept->setY(136);\n'
        '\t\t_btnCentre->setY(152);\n'
        '\t\t_btnCancel->setY(168);\n'
        '\t\t_txtUfo->setY(20);\n'
        '\t\t_txtDetected->setY(36);\n'
        '\t\t_lstInfo->setY(60);\n'
        '\t}\n'
        '\telse\n'
        '\t{\n'
        '\t\t_txtHyperwave->setVisible(false);\n'
        '\t\t_lstInfo2->setVisible(false);\n'
        '\t}',
        '\t_lstInfo2 = new TextList(217, 32, 28, 96);\n'
        '\t_txtRemaining = timedGroundSite ? new Text(207, 9, 28,\n'
        '\t\t\thyperwave ? 131 : 113) : nullptr;\n\n'
        '\tif (hyperwave)\n'
        '\t{\n'
        '\t\t_btnIntercept->setY(timedGroundSite ? 146 : 136);\n'
        '\t\t_btnCentre->setY(timedGroundSite ? 162 : 152);\n'
        '\t\t_btnCancel->setY(timedGroundSite ? 178 : 168);\n'
        '\t\t_txtUfo->setY(20);\n'
        '\t\t_txtDetected->setY(36);\n'
        '\t\t_lstInfo->setY(60);\n'
        '\t}\n'
        '\telse\n'
        '\t{\n'
        '\t\t_txtHyperwave->setVisible(false);\n'
        '\t\t_lstInfo2->setVisible(false);\n'
        '\t\tif (timedGroundSite)\n'
        '\t\t{\n'
        '\t\t\t_btnIntercept->setY(130);\n'
        '\t\t\t_btnCentre->setY(146);\n'
        '\t\t\t_btnCancel->setY(162);\n'
        '\t\t}\n'
        '\t}',
        "ufo timer placement and button space"
    )
    ufocpp = once(
        ufocpp,
        '\tadd(_lstInfo2, "text", "UFOInfo");',
        '\tadd(_lstInfo2, "text", "UFOInfo");\n'
        '\tif (_txtRemaining)\n'
        '\t\tadd(_txtRemaining, "text", "UFOInfo");',
        "ufo timer registration"
    )
    ufocpp = once(
        ufocpp,
        '\t_txtUfo->setText(_ufo->getName(_game->getLanguage()));',
        '\t_txtUfo->setText(_ufo->getName(_game->getLanguage()));\n'
        '\tif (_txtRemaining)\n'
        '\t{\n'
        '\t\t_txtRemaining->setAlign(ALIGN_CENTER);\n'
        '\t\t_txtRemaining->setText(r27FormatRemainingGeoscapeTime(\n'
        '\t\t\t_ufo->getSecondsRemaining()));\n'
        '\t}',
        "ufo timer saved data"
    )
    return targeth, targetcpp, ufoh, ufocpp


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("engine", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args=parser.parse_args()
    root=args.engine.resolve()
    targets=[root/x for x in FILES]
    targetTimer=root/TIMER_PATH
    if not all(x.is_file() for x in targets+[root/"src/version.h"]):
        raise SystemExit("R27: missing pinned engine files")
    version=(root/"src/version.h").read_text(encoding="utf-8")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise SystemExit("R27: unsupported engine")
    if (root/".git").is_dir():
        actual=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if actual!=PIN:
            raise SystemExit(f"R27: expected pinned engine SHA {PIN}; got {actual}")
    if targetTimer.exists():
        raise SystemExit("R27: timer header already exists; refusing double-patch")
    before=[p.read_text(encoding="utf-8") for p in targets]
    after=patch(*before)
    if not args.dry_run:
        for p,s in zip(targets,after):
            p.write_text(s, encoding="utf-8")
        targetTimer.write_text(TIMER_HEADER, encoding="utf-8")
    hashes={rel:hashlib.sha256(s.encode("utf-8")).hexdigest()
            for rel,s in zip(FILES,after)}
    hashes[TIMER_PATH]=hashlib.sha256(TIMER_HEADER.encode("utf-8")).hexdigest()
    print(json.dumps({
        "patch":"R27 time left when clicking mission and grounded/crashed UFO",
        "timers":"MissionSite.getSecondsRemaining / Ufo.getSecondsRemaining",
        "no_clock_or_save_change":True,
        "files":hashes,
    }, indent=2))


if __name__=="__main__":
    main()
