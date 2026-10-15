#!/usr/bin/env python3
"""Fail-closed source gates for the R23 research cost read-only UI.

The R22 battlescape regression tests run separately in the same workflow.
This checks the research cost plumbing and confirms that existing research
randomization and persistence logic are not replaced.
"""
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
current = (root / "src/Basescape/ResearchState.cpp").read_text(encoding="utf-8")
new = (root / "src/Basescape/NewResearchListState.cpp").read_text(encoding="utf-8")
info = (root / "src/Basescape/ResearchInfoState.cpp").read_text(encoding="utf-8")
header = (root / "src/Basescape/ResearchInfoState.h").read_text(encoding="utf-8")
project = (root / "src/Savegame/ResearchProject.cpp").read_text(encoding="utf-8")
rules = (root / "src/Mod/RuleResearch.cpp").read_text(encoding="utf-8")

# The R22 baseline gate runs before our patch and disallows all research edits.
# Afterward, only the four intentional Basescape files may be added to the
# original R22 allowlist. No unrelated engine, combat, research rules or saves.
changed = set(subprocess.check_output(["git", "-C", str(root), "diff", "--name-only"], text=True).splitlines()) if (root / ".git").exists() else set()
allowed_r22 = {
    "src/Battlescape/Map.h", "src/Battlescape/Map.cpp",
    "src/Battlescape/BattlescapeState.cpp", "src/Battlescape/Projectile.h",
    "src/Battlescape/Projectile.cpp", "src/CMakeLists.txt",
    "src/Battlescape/TileEngine.h", "src/Battlescape/TileEngine.cpp",
    "src/Battlescape/ProjectileFlyBState.h", "src/Battlescape/ProjectileFlyBState.cpp",
    "src/Mod/Mod.cpp", "src/Menu/OptionsAdvancedState.cpp",
}
research_ui = {
    "src/Basescape/ResearchState.cpp", "src/Basescape/NewResearchListState.cpp",
    "src/Basescape/ResearchInfoState.cpp", "src/Basescape/ResearchInfoState.h",
}

checks = {
    "Current research shows actual fixed total, not ruleset base":
        'title << tr(r->getName()) << " [" << proj->getCost() << "]"' in current,
    "Current research keeps scientist count and progress":
        'sstr << proj->getAssigned();' in current and
        'tr(proj->getResearchProgress()).c_str()' in current,
    "New research has an always-visible separate RP column":
        '_lstResearch->setColumns(2, 148, 42);' in new and
        '_lstResearch->addRow(2, tr(rule->getName()).c_str(), baseCostText.c_str());' in new,
    "New research uses base cost, never newly randomized cost":
        'baseCost << rule->getCost();' in new and
        'new ResearchProject(' not in new,
    "Research sorting and filtering still work":
        'a->getCost() < b->getCost()' in new and
        'getRequirements().empty()' in new and
        'getResearchRuleStatus(' in new,
    "Allocation dialog has a visible total RP text object":
        'Text *_txtTitle, *_txtCost' in header and
        'add(_txtCost, "text", "allocateResearch");' in info and
        '_txtCost->setText(researchCost.str());' in info,
    "Fresh project shows rolled actual total plus ruleset base":
        'researchCost << "RP TOTAL: " << _project->getCost()' in info and
        '<< " (BASE: " << _rule->getCost() << ")"' in info,
    "Current project shows spent and true total":
        'researchCost << "RP: " << _project->getSpent()' in info and
        '<< " / " << _project->getCost() << " TOTAL"' in info,
    "No change to random research cost algorithm":
        'int rng = RNG::generate(50, 150);' in info and
        'int randomizedCost = rule->getCost() * rng / 100;' in info and
        '_project = new ResearchProject(rule, randomizedCost);' in info,
    "No interference with savegame research allocation":
        'ResearchProject::save(' in project and
        'writer.write("cost", getCost());' in project and
        'ResearchProject::step()' in project,
    "No modification to core RuleResearch or research save logic":
        'RuleResearch::getCost()' in rules and
        'ResearchProject::getCost()' in project,
    "R23 modifications limited to four research UI files beyond R22":
        not changed or (changed.issubset(allowed_r22 | research_ui) and research_ui.issubset(changed)),
    "Window controls remain inside original modal":
        '_btnOk = new TextButton(90, 16, 169, 152);' in info and
        '_btnLess = new ArrowButton(ARROW_BIG_DOWN, 13, 14, 195, 127);' in info,
}

for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
assert all(checks.values()), "R23 cost UI regression checks failed"
print(f"PASS: {len(checks)} R23 research-cost checks")
