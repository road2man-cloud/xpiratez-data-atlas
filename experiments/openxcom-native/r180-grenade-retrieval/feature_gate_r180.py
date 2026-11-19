"""R180 native release gate: preserve preceding patches and require grenade TU budget UI."""
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
    "grenade_retrieval_move_tu": all(t in inv for t in ("item->getMoveToCost(right)", "item->getMoveToCost(left)", "item->getSlot()->getType() != INV_HAND", "retrieveTu")),
    "grenade_retrieval_in_total": "retrieveTu + effectivePrime + throwTu" in helper,
    "grenade_prepared_state": "item->getFuseTimer() >= 0" in inv,
    "grenade_budget_actual_actor": "_tu ? actor->getTimeUnits() : -1" in inv,
    "grenade_budget_label": "r180GrenadeTuLabel" in inv and "requiredTu > availableTu" in helper,
    "grenade_no_false_prebattle_warning": "tactical && availableTu >= 0" in helper,
    "grenade_two_line_compact_fallback": "for (int style = 0; style < 4; ++style)" in inv
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
    "version_title": "R180-GRENADE-RETRIEVAL-ALLPATCH" in main,
}

test_exe = root / "build/grenade_tu_label_test.exe"
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

parent = Path(r"D:\daphne_auto\XPZ_R179_GIT_WORKTREE_20261120"
              r"\experiments\openxcom-native\r179-grenade-tu"
              r"\build\objects_r179_cumulative_grenade_tu_budget.a")
archive = root / "build/objects_r180_cumulative_grenade_retrieval.a"
exe = root / "build/openxcom_R180_ALLPATCH_GRENADE_RETRIEVAL.exe"
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
    "release": "R180",
    "status": "PASS" if all(checks.values()) else "FAIL",
    "checks": checks,
    "changed_objects": changed,
    "parent_objects": len(previous),
    "output_objects": len(current),
    "exe_sha256": hashlib.sha256(exe.read_bytes()).hexdigest() if exe.is_file() else None,
    "gameplay_verified": False,
}
(root / "R180_FEATURE_AUDIT.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
for name, good in checks.items():
    print(("PASS" if good else "FAIL"), name, flush=True)
print("OBJECT_CHANGES:", changed, flush=True)
sys.exit(0 if report["status"] == "PASS" else 2)
