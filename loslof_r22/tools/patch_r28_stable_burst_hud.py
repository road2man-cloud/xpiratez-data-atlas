#!/usr/bin/env python3
"""R28: stable Monte Carlo preview when a 6-shot burst spends ammunition.

R27's preview key included the EXACT ammo quantity. Firing a burst consumed
6 cartridges, invalidating the key and seeding a completely unrelated random
sample even though accuracy/trajectory statistics of a still-loaded MP40
hadn't changed. For 6-shot auto: first HUD frame has FOUR completed burst
trials, then only TWENTY, but displayed full-percent H/B/M as if reliable.

Saturate the preview ammo signature at the amount needed for a complete
action. Preserve the different key when ammunition is scarce. Show a short
sample-count indicator (number of complete bursts, not bullets) and a
consistent tilde on the estimated burst-hit value.

Does NOT change actual shots, real in-game projectile RNG, weapon rules,
terrain, visibility, damage, saves or any R22-R27 behavior outside
src/Battlescape/Map.cpp's read-only probability overlay.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

PIN = "3e722e09b655ab67acfb59fc8585dc70b583826c"
FILE = "src/Battlescape/Map.cpp"

def change_one(code, old, replacement, why):
    n=code.count(old)
    if n!=1:
        raise RuntimeError(f"R28 {why}: expected one anchor, found {n}: {old[:120]!r}")
    return code.replace(old,replacement,1)

def patch(code):
    code=change_one(code,
        '    const int shots = conf ? conf->shots : 1;\n'
        '    const bool shotgun = ammo->getRules()->getShotgunPellets() > 0 &&',
        '    const int shots = conf ? conf->shots : 1;\n'
        '    // Fully loaded for the action? A lower-but-still-sufficient clip\n'
        '    // DOES NOT change weapon accuracy or the burst distribution.\n'
        '    // Saturating the clip cache signature keeps the same deterministic\n'
        '    // Monte Carlo stream after spending 6 of 42 SMG rounds.\n'
        '    // Below full-burst capacity, preserve distinct cache keys.\n'
        '    const int roundsPerShot = conf ? std::max(1, conf->spendPerShot) : 1;\n'
        '    const int roundsForBurst = shots * roundsPerShot;\n'
        '    const int ammoSignature = ammo->getRules()->getClipSize() > 0\n'
        '        ? std::min(ammo->getAmmoQuantity(), roundsForBurst)\n'
        '        : ammo->getAmmoQuantity();\n'
        '    const bool shotgun = ammo->getRules()->getShotgunPellets() > 0 &&',
        "clip capacity signature")
    code=change_one(code,
        '                  (int)ammo->getAmmoQuantity(),shots,pellets})',
        '                  ammoSignature,shots,pellets})',
        "replace direct ammo count in Monte Carlo scenario key")
    code=change_one(code,
        '        label << "ACC~" << displayedAccuracy << "% "\n'
        '              << "H " << _r22HitSamples*100U/_r22SampleCount\n'
        '              << "% B " << _r22BlockedSamples*100U/_r22SampleCount\n'
        '              << "% M " << _r22MissSamples*100U/_r22SampleCount\n'
        '              << "%";',
        '        // All H/B/M samples are estimates, NOT the native hit stat.\n'
        '        // Show n to distinguish an unstable 20-burst sample from\n'
        '        // 1,024-burst convergence; auto counts whole bursts, not shots.\n'
        '        label << "ACC~" << displayedAccuracy << "% "\n'
        '              << "H~" << _r22HitSamples*100U/_r22SampleCount\n'
        '              << "% B " << _r22BlockedSamples*100U/_r22SampleCount\n'
        '              << "% M " << _r22MissSamples*100U/_r22SampleCount\n'
        '              << "% n" << _r22SampleCount;',
        "HUD shows Monte Carlo sample count and estimated burst H")
    return code

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("engine", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args=parser.parse_args()
    root=args.engine.resolve()
    src=root/FILE
    if not src.is_file(): raise SystemExit("R28: missing Map.cpp")
    version=(root/"src/version.h").read_text(encoding="utf-8")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',version):
        raise SystemExit("R28: unrecognized engine")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN: raise SystemExit(f"R28: pinned SHA required {PIN}, got {sha}")
    updated=patch(src.read_text(encoding="utf-8"))
    if not args.dry_run: src.write_text(updated,encoding="utf-8")
    print(json.dumps({
        "r28":"read-only auto H/B/M Monte Carlo saturation and sample count",
        "native_accuracy_and_projectiles_changed":False,
        "clip_full_burst_signatures":{"42":6,"39":6,"33":6,"7":6,"6":6,"5":5},
        "sha256":hashlib.sha256(updated.encode("utf-8")).hexdigest(),
    },indent=2))
if __name__=="__main__":main()
