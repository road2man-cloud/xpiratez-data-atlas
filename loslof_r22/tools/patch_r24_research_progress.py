#!/usr/bin/env python3
"""R24 research progress UI: spent RP and completion % on current research rows.

Apply only AFTER the exact R22 + R23 patch chain.  Does not modify saved
research cost, RNG, progress accumulation, scientist assignment, or combat.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
FILES = (
    "src/Basescape/ResearchState.cpp",
    "src/Basescape/ResearchInfoState.cpp",
)


def one(src, old, new, label):
    found = src.count(old)
    if found != 1:
        raise RuntimeError(f"R24 {label}: expected 1 R23 anchor; got {found}: {old[:100]!r}")
    return src.replace(old, new, 1)


def patch(current, info):
    # Current-list title already carries the *actual* total in [brackets]
    # from R23.  Rightmost progress column shows accumulated RP (percentage).
    # This retains list width, scientist allocation, scroll, and row height.
    current = one(
        current,
        '\t\tconst std::string wstr = title.str();\n'
        '\t\t_lstResearch->addRow(3, wstr.c_str(), sstr.str().c_str(), tr(proj->getResearchProgress()).c_str());',
        '\t\tconst std::string wstr = title.str();\n'
        '\t\tconst int spent = std::max(0, proj->getSpent());\n'
        '\t\tconst int total = proj->getCost();\n'
        '\t\t// Do not divide by zero for instantaneous (zero-RP) research.\n'
        '\t\t// A completed project can briefly exceed 100% before removal.\n'
        '\t\tconst int percent = total > 0\n'
        '\t\t\t? std::min(100, static_cast<int>(100LL * spent / total)) : 100;\n'
        '\t\tstd::ostringstream progress;\n'
        '\t\tprogress << spent << " (" << percent << "%)";\n'
        '\t\t_lstResearch->addRow(3, wstr.c_str(), sstr.str().c_str(), progress.str().c_str());',
        "current research list numeric progress",
    )

    # Dialog shows full numerator/denominator and % with exactly the SAME
    # ResearchProject save-backed values as the current research list.
    info = one(
        info,
        '\t\tresearchCost << "RP: " << _project->getSpent()\n'
        '\t\t             << " / " << _project->getCost() << " TOTAL";',
        '\t\tconst int spent = std::max(0, _project->getSpent());\n'
        '\t\tconst int total = _project->getCost();\n'
        '\t\tconst int percent = total > 0\n'
        '\t\t\t? std::min(100, static_cast<int>(100LL * spent / total)) : 100;\n'
        '\t\tresearchCost << "RP: " << spent << " / " << total\n'
        '\t\t             << " (" << percent << "%)";',
        "current research project dialog percentage",
    )
    return current, info


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("engine", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = args.engine.resolve()
    paths = [root / p for p in FILES]
    if not all(p.is_file() for p in paths + [root / "src/version.h"]):
        raise SystemExit("R24: missing pinned engine sources")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',
                     (root / "src/version.h").read_text(encoding="utf-8")):
        raise SystemExit("R24: incompatible engine")
    if (root / ".git").exists():
        actual = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"],
                                         text=True).strip()
        if actual != PIN:
            raise SystemExit(f"R24 engine version mismatch {actual} != {PIN}")
    originals = [p.read_text(encoding="utf-8") for p in paths]
    results = patch(*originals)
    if not args.dry_run:
        for p, updated in zip(paths, results):
            p.write_text(updated, encoding="utf-8")
    print(json.dumps({
        "r24_progress": "current list spent RP (%) and dialog spent/total (%)",
        "r22_r23_preserved": True,
        "research_rules_or_RNG_changed": False,
        "files": {name: hashlib.sha256(blob.encode("utf-8")).hexdigest()
                  for name, blob in zip(FILES, results)},
    }, indent=2))


if __name__ == "__main__":
    main()
