"""R186 native release gate: grid-fitted stow paths plus inherited patches."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path(__file__).resolve().parent
inv = (root / "src/Battlescape/InventoryState.cpp").read_text(encoding="utf-8")
trans = (root / "src/Basescape/TransferItemsState.cpp").read_text(encoding="utf-8")
main = (root / "src/main.cpp").read_text(encoding="utf-8")
helper = (root / "src/Battlescape/GrenadeTuLabel.h").read_text(encoding="utf-8")

checks = {
    "grenade_both_action_tus": all(t in inv for t in (
        "isGrenadeOrProxy()", "getActionTUs(BA_PRIME, item)", "getActionTUs(BA_THROW, item)")),
    "grenade_retrieval_move_tu": all(t in inv for t in ("item->getMoveToCost(hand)", "item->getSlot()->getType() != INV_HAND", "retrieveTu")),
    "grenade_hand_occupied_cost": all(t in inv for t in ("actor->getItem(hand)", "held->getMoveToCost(section)", "clearHandTu", "isFixed()")),
    "grenade_hand_unavailable_state": "clearMode = R184_CLEAR_BLOCKED" in inv,
    "grenade_hand_legality": all(t in inv for t in ("canBePlacedIntoInventorySection(hand)", "held->getRules()->canBePlacedIntoInventorySection(section)", "onGround && !actor->getTile()")), 
    "grenade_retrieval_in_total": "clearTu + retrieveTu + activePrime + throwTu" in helper,
    "grenade_prepared_state": "item->getFuseTimer() >= 0" in inv,
    "grenade_budget_actual_actor": "_tu ? actor->getTimeUnits() : -1" in inv,
    "grenade_budget_label": "r184GrenadeTuLabel" in inv and "totalTu > availableTu" in helper,
    "grenade_no_false_prebattle_warning": "tactical && availableTu >= 0" in helper,
    "grenade_two_line_compact_fallback": "for (int style = 0; style < 5; ++style)" in inv
        and "_txtAmmo->getTextWidth() <= _txtAmmo->getWidth()" in inv,
    "grenade_primed_avoids_second_prime": "primed ? 0 : primeTu" in helper,
    "grenade_tu_clamp": "std::max(0, primeTu)" in helper,
    "autoall_one_round_exclusion": "choice.rule->getClipSize() == 1" in inv,
    "autoall_frag_prioritized": "usableOwnedFrag" in inv and "STR_GRENADE_FRAG" in inv,
    "autoall_both_hands": "leftHandOccupied" in inv,
    "autoall_low_tu": "r164LowTuMode" in inv,
    "transfer_search_r148": "r148SearchState" in trans,
    "transfer_sort_r138": "r138ApplyColumnSort" in trans,
    "exchange_click_persisted": "_chosen = static_cast<int>(index)" in trans,
    "craft_only_no_crew_transfer": "assigned->setCraft(0)" in trans
        and "netPersonnelTo > 0" in trans,
    "exchange_capacity_diagnostics": "exchangeBlockReason" in trans,
    "grenade_stow_uses_real_geometry": all(t in inv for t in ("section->fitItemInSlot(held->getRules(), slot.x, slot.y)", "existing->occupiesSlot(slot.x, slot.y, held)", "section->getSlots()")),
    "grenade_stow_item_supported": "held->getRules()->canBePlacedIntoInventorySection(section)" in inv,
    "grenade_stow_respects_contents": "existing != held && existing->getSlot() == section" in inv,
    "grenade_stow_and_ground_both_considered": "R184_CLEAR_STOW" in helper and "R184_CLEAR_DROP" in helper and "actor->getTile()" in inv,
    "grenade_tie_prefers_stow": "preferPreservation" in inv,
    "grenade_twohand_opposite_occupied": "r184HandClearTarget" in inv and "R184_HAND_CLEAR_OTHER" in inv,
    "grenade_twohand_clears_opposite": all(t in inv for t in ("oppositeHeld->getRules()->isBlockingBothHands()", "R184_HAND_CLEAR_TWO", "R184_HAND_CLEAR_OTHER")),
    "grenade_compact_preserves_prime_throw": '"P" << activePrime << "/T" << throwTu' in helper,
    "grenade_dual_collision_checked": all(t in inv for t in ("r184BestClearPlan(firstOptions, &secondOptions)", "r184PlacesConflict", "secondOptions = legalPlacements(second, true)")) or (("r184BestClearPlan(firstOptions, &secondOptions)" in inv) and ("r184PlacesConflict" in helper)),
    "grenade_dual_plan_both_drops": "R184_CLEAR_MIXED" in helper and "ground" in inv,
    "grenade_ground_paged_grid": all(t in inv for t in ("pageWidth = (320 - section->getX()) / RuleInventory::SLOT_W", "candidateCells.push_back(slot)", "r186GroundWindows", "onGround")),
    "grenade_adaptive_beyond_six_pages": "r186GroundWindows(pageWidth, greatestX)" in inv and "6 * pageWidth" not in inv,
    "grenade_ground_per_page_budget": "pageBudget.accepted(slot.x)" in inv and "pageBudget.canAccept(slot.x)" in inv,
    "grenade_ground_one_pass": "section->getType() != INV_GROUND" in inv,
    "version_title": "R186-GRENADE-ADAPTIVE-GROUND-ALLPATCH" in main,
}

test_exe = root / "build/grenade_tu_label_test.exe"
ground_test_exe = root / "build/ground_scan_test.exe"
checks["ground_scan_test_exists"] = ground_test_exe.exists()
if ground_test_exe.exists():
    try:
        scan_result = subprocess.run([str(ground_test_exe)], stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True, timeout=15)
        checks["ground_scan_test_passes"] = scan_result.returncode == 0
    except Exception:
        checks["ground_scan_test_passes"] = False
else:
    checks["ground_scan_test_passes"] = False
checks["formatter_cpp_test_exists"] = test_exe.exists()
if test_exe.exists():
    try:
        test_result = subprocess.run([str(test_exe)], stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True, timeout=15)
        checks["formatter_cpp_test_passes"] = test_result.returncode == 0
    except Exception:
        checks["formatter_cpp_test_passes"] = False
else:
    checks["formatter_cpp_test_passes"] = False

def members(path):
    data = path.read_bytes()
    if not data.startswith(b"!<arch>\n"):
        raise ValueError("Invalid ar archive " + str(path))
    i = 8
    strings = b""
    output = {}
    while i + 60 <= len(data):
        header = data[i:i+60]
        i += 60
        name = header[:16].decode("ascii").strip()
        size = int(header[48:58].strip())
        body = data[i:i+size]
        i += size + (size % 2)
        if name == "//":
            strings = body
            continue
        if name == "/":
            continue
        if name.startswith("/") and name[1:].isdigit():
            name = strings[int(name[1:]):].split(b"/\n", 1)[0].decode()
        elif name.startswith("#1/"):
            n = int(name[3:])
            name = body[:n].decode()
            body = body[n:]
        else:
            name = name.rstrip("/")
        output[name] = hashlib.sha256(body).hexdigest()
    return output

parent = Path(r"D:\daphne_auto\XPZ_R185_GIT_WORKTREE_20261120"
              r"\experiments\openxcom-native\r185-ground-grid"
              r"\build\objects_r185_cumulative_ground_grid.a")
archive = root / "build/objects_r186_cumulative_adaptive_ground.a"
exe = root / "build/openxcom_R186_ALLPATCH_GRENADE_ADAPTIVE_GROUND.exe"
previous = members(parent)
current = members(archive)
changed = sorted(k for k in previous.keys() | current.keys()
                 if previous.get(k) != current.get(k))
checks["413_cumulative_members"] = len(previous) == len(current) == 413
checks["only_expected_object_changes"] = set(changed) <= {
    "InventoryState.cpp.obj", "TransferItemsState.cpp.obj", "main.cpp.obj"
} and "InventoryState.cpp.obj" in changed
checks["exe_exists"] = exe.is_file()

report = {
    "release": "R186",
    "status": "PASS" if all(checks.values()) else "FAIL",
    "checks": checks,
    "changed_objects": changed,
    "parent_objects": len(previous),
    "output_objects": len(current),
    "exe_sha256": hashlib.sha256(exe.read_bytes()).hexdigest() if exe.is_file() else None,
    "gameplay_verified": False,
}
(root / "R186_FEATURE_AUDIT.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
for name, good in checks.items():
    print(("PASS" if good else "FAIL"), name, flush=True)
print("OBJECT_CHANGES:", changed, flush=True)
sys.exit(0 if report["status"] == "PASS" else 2)
