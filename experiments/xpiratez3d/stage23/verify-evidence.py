#!/usr/bin/env python3
"""Fail-closed offline auditor for recorded Stage 23 REAL Silent Storm engine runs.

Does not run or simulate the engine; this verifies internal consistency of the
logs copied verbatim from the isolated GOG Windows runtime. Do not interpret
this auditor alone as proof of a separately installed/rebuilt executable.
"""
from __future__ import annotations

import hashlib
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence"
EXPECTED_SHA256 = "B567425C8499236F21DDDD0E856B785AA528D5CCE28C68361E3357AF3CC0B723"
FILES = (
    "driver.log", "result.txt", "_saveload.log", "_xpz_interface_stack.log",
    "_xpz_world_steps.log", "_xpz_native_units.log", "_xpz_stage23_move.log",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")
    print(f"PASS: {message}")


def verify_manifest() -> None:
    manifest = HERE / "MANIFEST.sha256"
    require(manifest.is_file(), "evidence SHA-256 manifest recorded")
    expected = {f"{mode}/{name}" for mode in
                ("realtime", "turnbased", "failed-not-instant") for name in FILES}
    seen: set[str] = set()
    for line in manifest.read_text(encoding="utf-8-sig").splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-f0-9]{64})  (\S+)", line)
        require(bool(match), "manifest row syntax valid")
        sha, rel = match.groups()
        require(rel in expected and rel not in seen,
                f"manifest path unique and scoped to Stage23 logs: {rel}")
        path = EVIDENCE / rel
        require(path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == sha,
                f"verbatim captured evidence SHA-256 matches: {rel}")
        seen.add(rel)
    require(seen == expected, "all 21 required evidence files covered by manifest")


def read(mode: str) -> dict[str, str]:
    root = EVIDENCE / mode
    require(root.is_dir(), f"{mode}: evidence folder present")
    data: dict[str, str] = {}
    for name in FILES:
        path = root / name
        require(path.is_file() and path.stat().st_size > 0, f"{mode}: {name} recorded")
        data[name] = path.read_text(encoding="utf-8-sig")
    return data


def one_line(haystack: str, marker: str, where: str) -> str:
    candidates = [s for s in haystack.splitlines() if marker in s]
    require(len(candidates) == 1, f"{where}: exactly one {marker!r} row")
    return candidates[0]


def events(log: str, name: str) -> list[str]:
    return [s for s in log.splitlines() if f"event={name} " in s]


def fields(row: str) -> dict[str, str]:
    return dict(re.findall(r"(?<!\S)([a-z_]+)=([^\s]+)", row))


def xy(row: str) -> tuple[int, int]:
    values = fields(row)["tile"].split(",")
    return int(values[0]), int(values[1])


def real(row: str) -> tuple[float, float, float]:
    return tuple(float(v) for v in fields(row)["real"].split(","))  # type: ignore[return-value]


def verify(mode: str, turnbased: bool) -> None:
    print(f"\n=== STAGE23 {mode.upper()} ===")
    data = read(mode)
    driver, result, ack, stack, world, units, moves = (
        data["driver.log"], data["result.txt"], data["_saveload.log"],
        data["_xpz_interface_stack.log"], data["_xpz_world_steps.log"],
        data["_xpz_native_units.log"], data["_xpz_stage23_move.log"],
    )
    require(re.search(r"^FINAL=NATIVE_MOVEMENT_PASS$", result, re.M) is not None,
            f"{mode}: final result is explicit native-movement PASS")
    sm = re.search(r"^SESSION=(s23[a-f0-9]+)$", result, re.M)
    pm = re.search(r"ENGINE_READY pid=(\d+)", driver)
    sha = re.search(r"BUILD_SHA256=([A-F0-9]{64})\b", driver)
    require(bool(sm and pm and sha), f"{mode}: session, PID and engine build hash recorded")
    session, pid = sm.group(1), pm.group(1)
    require(sha.group(1) == EXPECTED_SHA256,
            f"{mode}: same exact pinned x86 Release engine SHA-256")
    require(f"[harness] READY session={session} pid={pid}" in ack,
            f"{mode}: READY PID and session match engine acknowledgments")
    accepted = [int(x) for x in re.findall(
        rf"^\[harness\] ACK session={session} seq=(\d+) pid={pid} ", ack, re.M)]
    dispatched = [int(x) for x in re.findall(
        rf"^\[harness\] DISPATCH session={session} seq=(\d+) ", ack, re.M)]
    require(accepted and accepted == list(range(1, accepted[-1] + 1)),
            f"{mode}: every positive command sequence acknowledged exactly once")
    require(dispatched == accepted,
            f"{mode}: every ACK has one DISPATCH (including exit)")
    require(f"[harness] DUPLICATE session={session} seq=1 " in ack and
            "[harness] FAIL reason=stale-session" in ack and
            "DUPLICATE_REJECTED" in driver and "STALE_SESSION_REJECTED" in driver,
            f"{mode}: duplicate and stale-session negative transport controls")
    requires = ("FIRST_HINT_VISIBLE", "HINT_POP_OK number=1", "HINT_POP_OK number=2",
                "WORLD_STEP_PASS", "NATIVE_SPAWN_PASS", "BLOCKED_ORDER_REJECTED_PASS",
                "BLOCKED_ORDER_NO_DRIFT_PASS", "NATIVE_MOVE_SUBMIT",
                "NATIVE_ANIMATION_SETTLED_PASS", "NATIVE_MOVEMENT_PASS")
    indices = [driver.find(m) for m in requires]
    require(all(i >= 0 for i in indices) and indices == sorted(indices),
            f"{mode}: experiment gates executed in causal order")
    pushes = re.findall(r"^event=push_interface depth=2 top=class NGame::CShowHintInterface", stack, re.M)
    pops = re.findall(r"^event=pop_interface depth=1 top=class NGame::CMission", stack, re.M)
    require(len(pushes) == len(pops) == 2, f"{mode}: two native hint pushes and pops")
    gate = re.search(r"WORLD_STEP_PASS before=(\d+) after=(\d+) hints=(\d+)", driver)
    require(bool(gate) and int(gate[1]) < int(gate[2]) and int(gate[3]) == 2,
            f"{mode}: world continues after two hint dismissals")
    segs = [int(v) for v in re.findall(r"^event=world_segment count=(\d+)", world, re.M)]
    require(len(segs) >= 4 and segs == sorted(segs) and max(segs) > int(gate[2]),
            f"{mode}: native engine world segments monotonically increase")
    adds = events(units, "world_add_completed")
    require(len(adds) == 1, f"{mode}: exactly one new actor inserted into real world")
    add = fields(adds[0])
    require(tuple(int(add[v]) for v in
                  ("world_before", "world_after", "player_before", "player_after")) == (6, 7, 1, 2),
            f"{mode}: CWorld::AddUnitInGame 6->7; friendly player 1->2")
    require(f"actor={add['actor_ptr']}" in driver,
            f"{mode}: native actor identity reported to test driver")
    require(f"console summonunit 730" in ack, f"{mode}: unit created by native summon command")
    require("TURN_BASED_PLAYER_TURN_PASS" in driver if turnbased else
            "TURN_BASED_PLAYER_TURN_PASS" not in driver,
            f"{mode}: correct combat mode gate")
    probe_modes = [fields(s) for s in events(moves, "probe")]
    require(any(p.get("mode") == "status" and
                p.get("realtime") == ("0" if turnbased else "1") for p in probe_modes),
            f"{mode}: engine's own real-time/turn-based state matches requested mode")
    if turnbased:
        require(len(events(moves, "combat_requested")) == 1,
                f"{mode}: native start-combat order issued once")
        require(any(p.get("mode") == "status" and p.get("realtime") == "0" and
                    p.get("player_turn") == "1" for p in probe_modes),
                f"{mode}: human player turn confirmed in real engine")
    baseline = one_line(driver, "NATIVE_UNIT_BASELINE", mode)
    snapshots = [s for s in moves.splitlines() if "event=snapshot index=1 " in s]
    require(len(snapshots) >= 3, f"{mode}: multiple native spawned-unit snapshots")
    initial = snapshots[0]
    initial_v = fields(initial)
    native_unit = initial_v["unit"]
    require(f"ptr={native_unit} " in baseline and
            initial_v["moving"] == initial_v["path"] == "0",
            f"{mode}: unambiguous spawned-unit baseline")
    require(all(fields(s)["unit"] == native_unit for s in snapshots),
            f"{mode}: identity persists across all movement samples")
    blocked = one_line(moves, "event=blocked_preflight ", mode)
    bl = fields(blocked)
    require(bl["unit"] == native_unit and bl["passable"] == "0" and
            bl["cando"] == "8" and bl["submitted"] == "0",
            f"{mode}: blocked target fails real CanDo preflight")
    rejected = one_line(moves, "event=blocked_order_result ", mode)
    rb = fields(rejected)
    require(rb["unit"] == native_unit and rb["preview"] == rb["result"] == "8" and
            all(rb[x] == "1" for x in ("same_tile", "same_ap", "same_path")) and
            rb["path_before"] == rb["path_after"] == "0",
            f"{mode}: actual blocked move command rejected without state changes")
    order = one_line(driver, "BLOCKED_ORDER_NO_DRIFT_PASS", mode)
    require(f"unit={native_unit}" in order, f"{mode}: native blocked no-drift check recorded")
    # The driver waited 550 ms and took a *new* snapshot after the refused order.
    rejected_tick = int(fields(rejected)["tick"])
    after_reject = [s for s in snapshots if
                    int(fields(s)["tick"]) > rejected_tick]
    require(bool(after_reject), f"{mode}: independent post-rejection snapshot")
    no_drift = after_reject[0]
    a, b = fields(initial), fields(no_drift)
    rx, ry, _ = real(initial)
    brx, bry, _ = real(no_drift)
    require(xy(initial) == xy(no_drift) and a["ap"] == b["ap"] and
            b["moving"] == b["path"] == "0" and
            math.hypot(brx - rx, bry - ry) < 0.03,
            f"{mode}: blocked order caused no tile, AP, path or real-position drift")
    submission = one_line(moves, "event=move_submit ", mode)
    sub = fields(submission)
    require(sub["unit"] == native_unit and sub["preview"] == sub["result"] == "1" and
            sub["selected"] == "1" and sub["index"] == "1",
            f"{mode}: real native move command accepted for spawned unit")
    require(tuple(int(i) for i in sub["from"].split(",")) == xy(initial) and
            int(sub["ap_before"]) == int(a["ap"]),
            f"{mode}: move starts from measured baseline and AP")
    target = tuple(int(i) for i in sub["to"].split(","))
    submit_tick = int(sub["tick"])
    later = [s for s in snapshots if int(fields(s)["tick"]) > submit_tick]
    require(bool(later), f"{mode}: post-command position samples present")
    finished = [s for s in later if xy(s) == target and
                fields(s)["moving"] == fields(s)["path"] == "0"]
    require(bool(finished), f"{mode}: target reached AND movement animation and path finished")
    last = finished[-1]
    last_v = fields(last)
    require(all(fields(s)['ap'] == last_v['ap'] for s in finished),
            f"{mode}: AP agrees across every settled target-state snapshot")
    require(all(math.hypot(real(s)[0] - real(last)[0],
                           real(s)[1] - real(last)[1]) < 0.05 for s in finished),
            f"{mode}: every settled target snapshot has stable real coordinates")
    fx, fy, _ = real(last)
    require(xy(initial) != target and math.hypot(fx - rx, fy - ry) >= 0.25,
            f"{mode}: tile and actual floating-point 3D position changed")
    require(last_v["selected"] == "1" and "NATIVE_ANIMATION_SETTLED_PASS" in driver,
            f"{mode}: same selected unit returned to stable non-moving state")
    if turnbased:
        require(int(a["ap"]) == 53 and int(last_v["ap"]) == 41 and
                "TURN_BASED_AP_SPEND_PASS before=53 after=41 cost=12" in driver,
                f"{mode}: native combat AP decreased by 12")
    else:
        require(int(a["ap"]) == int(last_v["ap"]) == 53 and
                "REALTIME_AP_UNCHANGED_EXPECTED before=53 after=53" in driver and
                any(fields(s).get("path") == "1" for s in later),
                f"{mode}: realtime AP remains unchanged; active native movement path was observed")
    report = re.search(r"NATIVE_MOVEMENT_PASS actor=(\S+) destination=(\d+),(\d+).*segments=(\d+),(\d+)", driver)
    require(bool(report) and report[1] == native_unit and
            (int(report[2]), int(report[3])) == target and
            int(report[5]) > int(report[4]),
            f"{mode}: world segments advance across same-unit movement")
    require("CURSOR_CLIP_RELEASED" in driver and "QUIT_REQUEST_SENT" in driver,
            f"{mode}: test requests isolated engine quit and releases pointer confinement")
    print(f"{mode.upper()}_EVIDENCE_PASS: pid={pid} unit={native_unit} tile={xy(initial)}->{target} ap={a['ap']}->{last_v['ap']}")


def verify_failed_control() -> None:
    mode = "failed-not-instant"
    print("\n=== STAGE23 HISTORICAL FAIL (NEGATIVE CONTROL) ===")
    data = read(mode)
    result, driver, moves = data["result.txt"], data["driver.log"], data["_xpz_stage23_move.log"]
    require(re.search(r"^FINAL=FAIL$", result, re.M) is not None and
            "Native movement not proved" in result and
            "NATIVE_MOVEMENT_PASS" not in driver,
            "failed-not-instant: historical nonmoving build never marked as PASS")
    submit = one_line(moves, "event=move_submit ", mode)
    sub = fields(submit)
    require(sub["preview"] == sub["result"] == "1",
            "failed-not-instant: command was superficially accepted")
    snapshots = [s for s in moves.splitlines() if "event=snapshot index=1 " in s]
    require(len(snapshots) >= 5, "failed-not-instant: repeated native coordinate snapshots")
    start, end = fields(snapshots[0]), fields(snapshots[-1])
    require(all(fields(s)["unit"] == sub["unit"] for s in snapshots),
            "failed-not-instant: same unit tracked throughout failed movement")
    require(all(xy(s) == xy(snapshots[0]) for s in snapshots) and
            all(real(s) == real(snapshots[0]) for s in snapshots),
            "failed-not-instant: accepted order never changed tile or real position")
    require(any(fields(s)["path"] == "1" for s in snapshots) and
            any(fields(s)["moving"] == "1" for s in snapshots),
            "failed-not-instant: path/moving flags alone are insufficient")
    require("CURSOR_CLIP_RELEASED" in driver,
            "failed-not-instant: cleanup executed despite test failure")
    print("NEGATIVE_CONTROL_EVIDENCE_PASS: prevents false positives on move-queued-only")


def main() -> None:
    verify_manifest()
    verify("realtime", False)
    verify("turnbased", True)
    verify_failed_control()
    print("\nSTAGE23_OFFLINE_EVIDENCE_PASS")


if __name__ == "__main__":
    main()
