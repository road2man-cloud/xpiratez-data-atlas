#!/usr/bin/env python3
"""Audit captured native S2 Stage25 evidence; never start the game or alter saves.

A successful native renderer boot, valid destination, adjacent TT_MOVE graph edge,
and actual moving unit are distinct gates. Original GOG assets/binaries are absent.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "evidence"
ENGINE_SHA256 = "627CCE6F1FD25645B3389541455102F9C7166EBF634E9A8C009E9FB7E8F5D6FF"
TEXT_NAMES = (
    "receipt.json", "driver.log", "_xpz_stage25_map.log",
    "_xpz_stage23_move.log", "_xpz_native_units.log",
    "_saveload.log", "_xpz_interface_stack.log", "_xpz_world_steps.log",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def capture(case: str) -> dict[str, str]:
    return {name: (ROOT / case / name).read_text(encoding="utf-8-sig")
            for name in TEXT_NAMES}


def event_rows(text: str, event: str) -> list[str]:
    return [line for line in text.splitlines()
            if re.search(r"\bevent=" + re.escape(event) + r"\b", line)]


def group(pattern: str, text: str, where: str) -> re.Match[str]:
    match = re.search(pattern, text)
    require(match is not None, f"{where}: missing {pattern}")
    return match


def log_pid(text: str, expected: int, what: str) -> None:
    for match in re.finditer(r"\bpid=(\d+)\b", text):
        require(int(match[1]) == expected, f"{what}: stale/foreign PID")


def validate_transport(session: str, pid: int, saveload: str) -> None:
    require(f"[harness] READY session={session} pid={pid}" in saveload,
            "READY session or PID mismatch")
    acks = re.findall(r"\[harness\] ACK session=(\S+) seq=(\d+) pid=(\d+) command=(.+)", saveload)
    dispatches = re.findall(r"\[harness\] DISPATCH session=(\S+) seq=(\d+) (.+)", saveload)
    require(len(acks) >= 6 and len(acks) == len(dispatches),
            "ACK / DISPATCH count or min length mismatch")
    nums = [int(row[1]) for row in acks]
    require(nums == list(range(1, len(nums) + 1)), "nonconsecutive/duplicate ACK sequence")
    require([int(row[1]) for row in dispatches] == nums, "DISPATCH sequence mismatch")
    for row in acks:
        require(row[0] == session and int(row[2]) == pid, "foreign command ACK")
    for row in dispatches:
        require(row[0] == session, "foreign command DISPATCH")
    commands = {row[3] for row in acks}
    require("console xpz3d_stage23 deckscan" in commands, "missing deckscan command")
    require("console xpz3d_stage23 move" in commands, "missing actual move command")


def parse_snapshot(line: str) -> dict:
    m = group(
        r"event=snapshot index=1 unit=(\S+) tile=(\d+),(\d+) layer=(\d+)"
        r".*ap=(-?\d+) selected=(\d+) moving=(\d+) path=(\d+)"
        r" real=([-0-9.]+),([-0-9.]+),([-0-9.]+)",
        line, "actor snapshot",
    )
    return {"actor": m[1], "x": int(m[2]), "y": int(m[3]),
            "layer": int(m[4]), "ap": int(m[5]),
            "selected": int(m[6]), "moving": int(m[7]),
            "path": int(m[8]), "pos": tuple(map(float, m.group(9, 10, 11)))}


def validate_movement(move: str) -> dict:
    rows = move.splitlines()
    submits = event_rows(move, "move_submit")
    require(len(submits) == 1, "native movement submitted zero/multiple orders")
    sub = group(
        r"event=move_submit index=1 unit=(\S+) from=(\d+),(\d+)"
        r" to=(\d+),(\d+) layer=(\d+) preview=(\d+) result=(\d+)"
        r" ap_before=(-?\d+) selected=(\d+)", submits[0], "move submission",
    )
    require((int(sub[7]), int(sub[8]), int(sub[10])) == (1, 1, 1),
            "native engine did not accept selected move")
    row_index = rows.index(submits[0])
    before = [parse_snapshot(line) for line in rows[:row_index]
              if "event=snapshot index=1 " in line]
    after = [parse_snapshot(line) for line in rows[row_index + 1:]
             if "event=snapshot index=1 " in line]
    require(before and after, "missing both before/after native actor snapshots")
    start, end = before[-1], after[-1]
    require(start["actor"] == sub[1] == end["actor"], "actor runtime identity mismatch")
    require((start["x"], start["y"]) == (int(sub[2]), int(sub[3])),
            "native origin differs from submission")
    require((end["x"], end["y"]) == (int(sub[4]), int(sub[5])),
            "actual tile did not reach command destination")
    require((start["x"], start["y"]) != (end["x"], end["y"]), "no grid movement")
    require(start["layer"] == end["layer"] == int(sub[6]) == 0,
            "ground native motion unexpectedly changed layer")
    displacement = math.dist(start["pos"], end["pos"])
    require(displacement >= 0.25, f"no actual 3D movement: {displacement}")
    require(end["moving"] == 0 and end["path"] == 0, "native animation/path not settled")
    require(end["selected"] == 1, "moved actor not selected at completion")
    require(end["ap"] < start["ap"], "turn-based move did not consume AP")
    return {"from": (start["x"], start["y"]), "to": (end["x"], end["y"]),
            "world_displacement_m": round(displacement, 3),
            "ap_cost": start["ap"] - end["ap"]}


def validate_final(blob: dict[str, str], size: int) -> dict:
    receipt = json.loads(blob["receipt.json"])
    r = receipt
    require(r.get("schema") == "xpz3d.stage25.engine-run.v1", "receipt schema mismatch")
    require(r.get("result") == "PASS_NATIVE_SCENE_AND_NAV_SETUP", "receipt is not PASS")
    require(r.get("engineSha256") == ENGINE_SHA256, "wrong game binary hash")
    require(r.get("navigationRequested") == [size, size], "wrong native grid request")
    require(r.get("navigationExtentMeters") == [size * 0.625] * 2,
            "grid metres not consistent with pitch")
    require(r.get("floorSlotsCompiled") == 12, "12 floor slots not compiled")
    require(r.get("nivalMeshObjectsCreated") == 50 and
            r.get("nativeAIHullRegistrations") == 50, "native tower/hulls not all registered")
    require(r.get("towerLevelsRendered") == 10 and r.get("nativeWorldExecuted") is True and
            r.get("spawnedNativeActor") is True and r.get("nativeCameraMissionReached") is True,
            "no genuine native world with inserted actor")
    require(r.get("nativeGroundMovementVerified") is True, "native ground move not recorded")
    require(r.get("pathToDeck10Verified") is False and
            r.get("physicalCollisionTested") is False and
            r.get("crossFloorShotVerified") is False, "unsupported claims in receipt")

    d = r.get("nativeDeckScan") or {}
    require(d.get("layerCount") == 11 and d.get("validLayers") == 10 and
            d.get("floorMask") == 1023 and d.get("standMask") == 1023 and
            d.get("adjacentEdgeMask") == 1023 and
            d.get("completeTenDecks") is True and d.get("routesVerified") is False,
            "false positive on ten-floor path-node/standing/local edge result")

    driver, maplog, move = (blob[x] for x in
                            ("driver.log", "_xpz_stage25_map.log", "_xpz_stage23_move.log"))
    boot = group(r"NATIVE_ENGINE_STARTED pid=(\d+) size=(\d+) hash=([0-9A-F]{64})",
                 driver, "native engine boot")
    pid = int(boot[1])
    require(int(boot[2]) == size and boot[3] == ENGINE_SHA256, "driver binary not matching receipt")
    require("NATIVE_GROUND_MOVEMENT_PASS size=" + str(size) in driver and
            "CURSOR_RELEASED" in driver and
            "FINAL=PASS_NATIVE_SCENE_AND_NAV_SETUP" in driver,
            "driver did not report native success or cleanup")
    require(f"event=native_nav_coloured size={size} " in maplog, "no real nav colouring")
    require("event=native_hulls_registered decks=10 count=50" in maplog and
            "event=native_3d_tower_created levels=10 meshes=50" in maplog,
            "no 50 AI hulls and 50 renderer mesh objects")
    validate_transport(r["session"], pid, blob["_saveload.log"])
    log_pid(move, pid, "native movement/deckscan")

    begins = event_rows(move, "deckscan_begin")
    ends = event_rows(move, "deckscan_end")
    require(len(begins) == len(ends) == 1, "unexpected deck scan count")
    require("layers=11 sample=56,56 slots=12" in begins[0], "wrong fixed tower coordinate")
    end = group(r"layers=(\d+) valid_layers=(\d+) floor_mask=(\d+)"
                r" complete_ten_decks=(\d+) stand_mask=(\d+)"
                r" adjacent_edge_mask=(\d+) routes_verified=(\d+)", ends[0],
                "native ten-floor end")
    require(tuple(map(int, end.groups())) == (11, 10, 1023, 1, 1023, 1023, 0),
            "native floor result doesn't match receipt")
    floors: set[int] = set()
    layers = event_rows(move, "deckscan_layer")
    require(len(layers) == 11, f"expected 11 layer measurements, got {len(layers)}")
    for line in layers:
        m = group(
            r"index=(\d+) floor=(\d+) pass=(\d+) destination=(\d+) z=([-0-9.]+)"
            r" stand=(-?\d+) adjacent_stand=(-?\d+) lateral_transition=(-?\d+)",
            line, "native per-layer record")
        layer, floor, passability, dest = map(int, m.group(1, 2, 3, 4))
        z = float(m[5])
        stand, adjacent, transition = map(int, m.group(6, 7, 8))
        if (passability, dest, stand, adjacent, transition) == (0, 1, 0, 0, 2):
            require(0 <= floor < 10 and abs(z - (floor * 2.5 + 0.22)) < 0.15,
                    "native height/floor incorrect")
            require(floor not in floors, "floor appears twice")
            floors.add(floor)
        else:
            require(layer == 1 and passability == 1 and dest == 0,
                    "unexpected invalid/isolated floor")
    require(floors == set(range(10)), f"missing floor from actual layer logs: {floors}")

    adds = event_rows(blob["_xpz_native_units.log"], "world_add_completed")
    require(len(adds) == 1 and
            "world_before=1 world_after=2 player_before=1 player_after=2" in adds[0],
            "not a native world/roster actor insertion")
    return {"size": size, "pid": pid, "sha": ENGINE_SHA256,
            "local_floor_nodes": len(floors), "stand_and_edge_mask": 1023,
            **validate_movement(move)}


def validate_baseline(blob: dict[str, str]) -> dict:
    receipt = json.loads(blob["receipt.json"])
    d = receipt["nativeDeckScan"]
    require(d["floorMask"] == 255 and d["validLayers"] == 8 and
            d["completeTenDecks"] is False and d["routesVerified"] is False,
            "historical eight-floor-clamp failure missing; do not rewrite history")
    move = blob["_xpz_stage23_move.log"]
    end = event_rows(move, "deckscan_end")
    require(len(end) == 1 and "floor_mask=255 complete_ten_decks=0" in end[0],
            "pre-fix native evidence does not establish eight-floor defect")
    layers = event_rows(move, "deckscan_layer")
    require(sum("pass=0 destination=1" in x for x in layers) == 8,
            "pre-fix actual path only works for eight floors")
    require(sum("pass=1 destination=0" in x for x in layers) == 3,
            "pre-fix top two floors do not show failed passability")
    return {"historical_clamp_floor_mask": 255, "expected": "FAIL_10_FLOORS"}


def falsification_suite(original: dict[str, str]) -> int:
    mutations = (
        ("forged receipt mask", "receipt.json", lambda s: s.replace(
            '"adjacentEdgeMask":  1023', '"adjacentEdgeMask":  255')),
        ("wrong executable hash", "receipt.json", lambda s: s.replace(
            ENGINE_SHA256, "0" * 64)),
        ("missing tenth local edge", "_xpz_stage23_move.log",
         lambda s: s.replace("floor=9 pass=0 destination=1 z=22.720 stand=0 adjacent_stand=0 lateral_transition=2",
                             "floor=9 pass=0 destination=1 z=22.720 stand=0 adjacent_stand=0 lateral_transition=0")),
        ("forged accepted command", "_xpz_stage23_move.log",
         lambda s: s.replace("preview=1 result=1 ap_before", "preview=1 result=8 ap_before")),
        ("actor identity mismatch", "_xpz_stage23_move.log",
         lambda s: s.replace("event=move_submit index=1 unit=", "event=move_submit index=1 unit=BAD")),
        ("false 3D motion", "_xpz_stage23_move.log",
         lambda s: re.sub(
             r"(event=snapshot index=1 .*tile=3,8 .*real=)[-0-9.]+,[-0-9.]+,[-0-9.]+",
             r"\g<1>0.165,4.999,1.009", s)),
        ("stale startup", "_saveload.log",
         lambda s: s.replace("[harness] READY session=", "[harness] READY session=forged")),
        ("failed driver", "driver.log",
         lambda s: s.replace("FINAL=PASS_NATIVE_SCENE_AND_NAV_SETUP",
                             "FINAL=FAIL")),
    )
    for name, file, mutate in mutations:
        test = copy.deepcopy(original)
        test[file] = mutate(test[file])
        require(test[file] != original[file],
                f"falsification injection unexpectedly did nothing: {name}")
        try:
            validate_final(test, 120)
        except ValueError:
            continue
        raise ValueError(f"falsification check DID NOT REJECT: {name}")
    return len(mutations)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="in-memory forged-evidence rejection")
    args = parser.parse_args()
    base = validate_baseline(capture("clamp-before-120"))
    small_blob = capture("native-deck-edge-120")
    small = validate_final(small_blob, 120)
    large = validate_final(capture("native-deck-edge-160"), 160)
    output: dict = {"status": "PASS_ARCHIVED_NATIVE_EVIDENCE", "before": base,
                    "after": [small, large],
                    "vertical_paths_verified": False, "high_floor_actor_movement_verified": False}
    if args.self_test:
        output["tamper_tests_rejected"] = falsification_suite(small_blob)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
