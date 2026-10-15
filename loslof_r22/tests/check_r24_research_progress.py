#!/usr/bin/env python3
"""Fail closed on R24 current research numeric progress UI regression.

The full R22 gates and all R23 gates must run beforehand, unmodified.
The R24 patch must change only two presentation code paths, using the
ResearchProject's save-backed actual cost/spent values.
"""
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
current = (root / "src/Basescape/ResearchState.cpp").read_text(encoding="utf-8")
info = (root / "src/Basescape/ResearchInfoState.cpp").read_text(encoding="utf-8")
new = (root / "src/Basescape/NewResearchListState.cpp").read_text(encoding="utf-8")
rule = (root / "src/Savegame/ResearchProject.cpp").read_text(encoding="utf-8")

changed = set(subprocess.check_output(["git", "-C", str(root), "diff", "--name-only"], text=True).splitlines()) if (root / ".git").exists() else set()
r22 = {
    "src/Battlescape/Map.h", "src/Battlescape/Map.cpp",
    "src/Battlescape/BattlescapeState.cpp", "src/Battlescape/Projectile.h",
    "src/Battlescape/Projectile.cpp", "src/CMakeLists.txt",
    "src/Battlescape/TileEngine.h", "src/Battlescape/TileEngine.cpp",
    "src/Battlescape/ProjectileFlyBState.h", "src/Battlescape/ProjectileFlyBState.cpp",
    "src/Mod/Mod.cpp", "src/Menu/OptionsAdvancedState.cpp",
}
r23 = {
    "src/Basescape/ResearchState.cpp", "src/Basescape/NewResearchListState.cpp",
    "src/Basescape/ResearchInfoState.cpp", "src/Basescape/ResearchInfoState.h",
}
checks = {
    "List still shows the save-backed actual total in research title":
        'title << tr(r->getName()) << " [" << proj->getCost() << "]"' in current,
    "List reads already spent RP from the current project":
        'const int spent = std::max(0, proj->getSpent());' in current,
    "List reads actual randomized, fixed total":
        'const int total = proj->getCost();' in current,
    "List numeric progress is readable as RP and percent":
        'progress << spent << " (" << percent << "%)";' in current and
        '_lstResearch->addRow(3, wstr.c_str(), sstr.str().c_str(), progress.str().c_str());' in current,
    "List progress replaces vague estimates":
        'tr(proj->getResearchProgress()).c_str()' not in current,
    "Scientist count, list size, scroll and row semantics unchanged":
        'sstr << proj->getAssigned();' in current and
        '_lstResearch->setColumns(3, 158, 58, 70);' in current and
        '_lstResearch->scrollTo(scrl);' in current and
        '_lstResearch->setWordWrap(true);' in current,
    "List handles zero RP cost without divide-by-zero":
        'const int percent = total > 0' in current and
        '? std::min(100, static_cast<int>(100LL * spent / total)) : 100;' in current,
    "Progress never exceeds 100% after end-of-day overrun":
        'std::min(100, static_cast<int>(100LL * spent / total))' in current,
    "Dialog repeats the exact current project spent RP":
        'const int spent = std::max(0, _project->getSpent());' in info,
    "Dialog total reflects actual save-backed amount":
        'const int total = _project->getCost();' in info,
    "Dialog shows numerator, denominator and percentage":
        'researchCost << "RP: " << spent << " / " << total' in info and
        '<< " (" << percent << "%)";' in info,
    "Dialog also guards zero costs and completion overrun":
        'const int percent = total > 0' in info and
        '? std::min(100, static_cast<int>(100LL * spent / total)) : 100;' in info,
    "New project base cost is still shown as in R23":
        'baseCost << rule->getCost();' in new and
        '_lstResearch->setColumns(2, 148, 42);' in new,
    "New project randomized actual total still shown before starting":
        'researchCost << "RP TOTAL: " << _project->getCost()' in info and
        '<< " (BASE: " << _rule->getCost() << ")"' in info,
    "Randomized cost determination is left untouched":
        'int rng = RNG::generate(50, 150);' in info and
        'int randomizedCost = rule->getCost() * rng / 100;' in info,
    "Research progression and save persist actual spent and total":
        'ResearchProject::step()' in rule and
        '_spent += _assigned;' in rule and
        'writer.write("spent", getSpent());' in rule and
        'writer.write("cost", getCost());' in rule,
    "Only R22 and R23 research UI files changed":
        not changed or (r23.issubset(changed) and changed.issubset(r22 | r23)),
}
for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
if not all(checks.values()):
    raise SystemExit("R24 research progress static regression checks failed")
print(f"PASS: {len(checks)} R24 read-only research progress checks")
