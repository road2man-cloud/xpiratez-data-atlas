#!/usr/bin/env python3
"""Fail-closed offline verification of the Stage 22 recorded REAL engine trace.

This does not simulate the engine. It checks the captured evidence for internal
contradictions; the Windows smoke script is the source of live proof.
"""
from __future__ import annotations

import re
from pathlib import Path


def check(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"FAIL: {message}")
    print(f"PASS: {message}")


base = Path(__file__).resolve().parent / "evidence"
def read(filename: str) -> str:
    return (base / filename).read_text(encoding="utf-8-sig")


result = read("result.txt")
driver = read("driver.log")
acks = read("_saveload.log")
stack = read("_xpz_interface_stack.log")
world = read("_xpz_world_steps.log")
units = read("_xpz_native_units.log")

check("FINAL=NATIVE_SPAWN_PASS" in result, "recorded final status")
session_match = re.search(r"SESSION=(s22[a-f0-9]+)", result)
check(bool(session_match), "single expected run session")
session = session_match.group(1)
pid_match = re.search(r"ENGINE_READY pid=(\d+)", driver)
check(bool(pid_match), "ready PID in driver")
pid = pid_match.group(1)
check(f"[harness] READY session={session} pid={pid}" in acks, "engine READY belongs to run PID+session")

ack_sequences = [int(x) for x in re.findall(
    rf"\[harness\] ACK session={session} seq=(\d+) pid={pid} ", acks
)]
dispatched_sequences = [int(x) for x in re.findall(
    rf"\[harness\] DISPATCH session={session} seq=(\d+) ", acks
)]
check(ack_sequences == list(range(1, 9)), "ACK seq 1..8 exactly once")
check(dispatched_sequences == list(range(1, 9)), "DISPATCH seq 1..8 exactly once")
check("DUPLICATE" in acks and "FAIL reason=stale-session" in acks,
      "duplicate and stale-session commands rejected")

stack_pushes = re.findall(r"^event=push_interface depth=2 top=class NGame::CShowHintInterface", stack, re.M)
stack_pops = re.findall(r"^event=pop_interface depth=1 top=class NGame::CMission", stack, re.M)
check(len(stack_pushes) == 2 and len(stack_pops) == 2, "exactly 2 hint pushes and 2 native pops")
check(driver.find("FIRST_HINT_VISIBLE") < driver.find("HINT_POP_OK number=1")
      < driver.find("HINT_POP_OK number=2") < driver.find("WORLD_STEP_PASS"),
      "post-hint gate is in correct chronological order")
proof = re.search(r"WORLD_STEP_PASS before=(\d+) after=(\d+) hints=(\d+)", driver)
check(bool(proof) and int(proof[1]) < int(proof[2]) and int(proof[3]) == 2,
      "post-hint segment counter increased with two hints")
segments = [int(x) for x in re.findall(r"^event=world_segment count=(\d+)", world, re.M)]
scene_times = [int(x) for x in re.findall(r"^event=world_update calls=\d+ scene_time=(\d+)", world, re.M)]
check(50 in segments and 90 in segments and 130 in segments and 170 in segments,
      "real engine segment counters 50, 90, 130, 170")
check(1906 in scene_times and 3906 in scene_times and 5906 in scene_times and 7906 in scene_times,
      "world time actually increased beyond hint dismissal")

add_rows = re.findall(
    r"^event=world_add_completed world_before=(\d+) world_after=(\d+) "
    r"player_before=(\d+) player_after=(\d+) actor_ptr=(\S+)",
    units, re.M
)
check(len(add_rows) == 2, "exactly two native world insertion completions")
for i, (wb, wa, pb, pa, actor) in enumerate(add_rows, 1):
    check(int(wa) == int(wb) + 1 and int(pa) == int(pb) + 1,
          f"native spawn {i} increments world and player exactly +1")
check(add_rows[0][4] != add_rows[1][4], "two distinct runtime actors")
check((int(add_rows[0][0]), int(add_rows[0][1]),
       int(add_rows[1][0]), int(add_rows[1][1])) == (6, 7, 7, 8),
      "world count continuous 6 -> 7 -> 8")
check("command=console summonunit 999999" in acks
      and "INVALID_ID_NO_SPAWN_PASS" in driver and len(add_rows) == 2,
      "invalid person ID added no third native actor")
check("CURSOR_CLIP_RELEASED" in driver and
      "command=quit" in acks and "seq=8 quit" in acks,
      "isolated engine quit and cursor release recorded")
print("STAGE22_OFFLINE_EVIDENCE_PASS")
