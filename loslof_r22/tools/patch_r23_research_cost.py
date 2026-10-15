#!/usr/bin/env python3
"""R23: read-only research cost UI layered on the exact R22 virtual-origin build.

This patch changes only ResearchState, NewResearchListState, and
ResearchInfoState.  It does not alter research RNG, saved games, or the R22
LOS/LOF, throwing, or targeting patches.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ENGINE_SHA = "3e722e09b655ab67acfb59fc8585dc70b583826c"
PATHS = (
    "src/Basescape/ResearchState.cpp",
    "src/Basescape/NewResearchListState.cpp",
    "src/Basescape/ResearchInfoState.cpp",
    "src/Basescape/ResearchInfoState.h",
)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one exact upstream anchor, got {count}: {old[:100]!r}")
    return text.replace(old, new, 1)


def patch(files):
    current, new, info, header = files

    # Already-running projects store the definitive, randomized cost in savegame.
    current = replace_once(
        current,
        'std::string wstr = tr(r->getName());\n'
        '\t\t_lstResearch->addRow(3, wstr.c_str(), sstr.str().c_str(), tr(proj->getResearchProgress()).c_str());',
        'std::ostringstream title;\n'
        '\t\ttitle << tr(r->getName()) << " [" << proj->getCost() << "]";\n'
        '\t\tconst std::string wstr = title.str();\n'
        '\t\t_lstResearch->addRow(3, wstr.c_str(), sstr.str().c_str(), tr(proj->getResearchProgress()).c_str());',
        "running projects display actual total",
    )

    # New-research rows show the rule's *base* cost. The actual randomized
    # amount is determined when the project is created in ResearchInfoState.
    new = replace_once(new, "#include <locale>\n", "#include <locale>\n#include <sstream>\n", "new-list include")
    new = replace_once(new, "_lstResearch->setColumns(1, 190);",
                       "_lstResearch->setColumns(2, 148, 42);",
                       "separate base-cost column")
    new = replace_once(
        new,
        '_lstResearch->addRow(1, tr(rule->getName()).c_str());',
        'std::ostringstream baseCost;\n'
        '\t\t\tbaseCost << rule->getCost();\n'
        '\t\t\tconst std::string baseCostText = baseCost.str();\n'
        '\t\t\t_lstResearch->addRow(2, tr(rule->getName()).c_str(), baseCostText.c_str());',
        "new research base cost",
    )

    # Exact actual total appears in the project allocation dialog. In that
    # screen the RNG has already generated the project's fixed _cost.
    header = replace_once(
        header,
        'Text *_txtTitle, *_txtAvailableScientist, *_txtAvailableSpace, *_txtAllocatedScientist, *_txtMore, *_txtLess;',
        'Text *_txtTitle, *_txtCost, *_txtAvailableScientist, *_txtAvailableSpace, *_txtAllocatedScientist, *_txtMore, *_txtLess;',
        "dialog member",
    )
    info = replace_once(info, "#include <climits>\n", "#include <climits>\n#include <sstream>\n", "dialog include")
    info = replace_once(
        info,
        '_txtTitle = new Text(210, 17, 61, 40);\n\n'
        '\t_txtAvailableScientist = new Text(210, 9, 61, 60);\n'
        '\t_txtAvailableSpace = new Text(210, 9, 61, 70);\n'
        '\t_txtAllocatedScientist = new Text(210, 17, 61, 80);\n'
        '\t_txtMore = new Text(110, 17, 85, 100);\n'
        '\t_txtLess = new Text(110, 17, 85, 120);\n'
        '\t_btnCancel = new TextButton(90, 16, 61, 145);\n'
        '\t_btnOk = new TextButton(90, 16, 169, 145);\n\n'
        '\t_btnMore = new ArrowButton(ARROW_BIG_UP, 13, 14, 195, 100);\n'
        '\t_btnLess = new ArrowButton(ARROW_BIG_DOWN, 13, 14, 195, 120);',
        '_txtTitle = new Text(210, 17, 61, 40);\n'
        '\t_txtCost = new Text(210, 9, 61, 58);\n\n'
        '\t_txtAvailableScientist = new Text(210, 9, 61, 69);\n'
        '\t_txtAvailableSpace = new Text(210, 9, 61, 79);\n'
        '\t_txtAllocatedScientist = new Text(210, 17, 61, 89);\n'
        '\t_txtMore = new Text(110, 17, 85, 108);\n'
        '\t_txtLess = new Text(110, 17, 85, 127);\n'
        '\t_btnCancel = new TextButton(90, 16, 61, 152);\n'
        '\t_btnOk = new TextButton(90, 16, 169, 152);\n\n'
        '\t_btnMore = new ArrowButton(ARROW_BIG_UP, 13, 14, 195, 108);\n'
        '\t_btnLess = new ArrowButton(ARROW_BIG_DOWN, 13, 14, 195, 127);',
        "dialog geometry",
    )
    info = replace_once(info,
                        'add(_txtTitle, "text", "allocateResearch");',
                        'add(_txtTitle, "text", "allocateResearch");\n'
                        '\tadd(_txtCost, "text", "allocateResearch");',
                        "dialog cost registration")
    info = replace_once(
        info,
        '_txtTitle->setText(_rule ? tr(_rule->getName()) : tr(_project->getRules()->getName()));',
        '_txtTitle->setText(_rule ? tr(_rule->getName()) : tr(_project->getRules()->getName()));\n'
        '\tstd::ostringstream researchCost;\n'
        '\tif (_rule)\n'
        '\t{\n'
        '\t\t// A new project has already rolled its actual cost (50-150% of base).\n'
        '\t\tresearchCost << "RP TOTAL: " << _project->getCost()\n'
        '\t\t             << " (BASE: " << _rule->getCost() << ")";\n'
        '\t}\n'
        '\telse\n'
        '\t{\n'
        '\t\t// Existing research uses spent and fixed total from the savegame.\n'
        '\t\tresearchCost << "RP: " << _project->getSpent()\n'
        '\t\t             << " / " << _project->getCost() << " TOTAL";\n'
        '\t}\n'
        '\t_txtCost->setText(researchCost.str());',
        "dialog actual and spent cost",
    )
    return current, new, info, header


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("engine", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = args.engine.resolve()
    paths = [root / rel for rel in PATHS]
    ver = root / "src/version.h"
    if not all(p.is_file() for p in paths + [ver]):
        raise SystemExit("R23: pinned engine research files missing")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     ver.read_text(encoding="utf-8")):
        raise SystemExit("R23: unexpected engine version")
    if (root / ".git").exists():
        sha = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"],
                                      text=True).strip()
        if sha != ENGINE_SHA:
            raise SystemExit(f"R23: engine SHA {sha}, expected {ENGINE_SHA}")
    original = tuple(p.read_text(encoding="utf-8") for p in paths)
    updated = patch(original)
    if not args.dry_run:
        for path, content in zip(paths, updated):
            path.write_text(content, encoding="utf-8")
    print(json.dumps({
        "R23": "research cost UI",
        "R22_patch_stack": "unchanged",
        "research_rules_or_RNG_changed": False,
        "paths": {rel: hashlib.sha256(content.encode("utf-8")).hexdigest()
                  for rel, content in zip(PATHS, updated)},
    }, indent=2))


if __name__ == "__main__":
    main()
