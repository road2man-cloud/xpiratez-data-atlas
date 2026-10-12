#!/usr/bin/env python3
"""Native integration static guard for incremental LOS/LOF Monte Carlo.

This is *not* a combat playthrough or proof of exact R21 probabilities.
It prevents classic regressions: restarting each frame, repeating same RNG
seed, spilling 1024 projectile batches into one frozen render frame, or
confusing 384 risk traversals with 1024 hit-probability trials.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
m=(root/"src/Battlescape/Map.cpp").read_text(encoding="utf-8")
h=(root/"src/Battlescape/Map.h").read_text(encoding="utf-8")
segment=m.split("void Map::r22DrawStats(",1)[1].split("\n}\n",1)[0]
checks={
  "progressive 1024 hit/miss/block trials": "_r22SampleCount < 1024U" in segment
      and "1024U-_r22SampleCount" in segment,
  "bounded per-frame projectile count": "256U/projectilesPerTrial" in segment
      and "frameBudget" in segment,
  "R19 384-sample risk heatmap limit": "_r22RiskSamples < 384U" in segment,
  "separate risk probability denominator": "entry.second*100U<_r22RiskSamples" in segment
      and "entry.second*100U/_r22RiskSamples" in segment,
  "nonrepeating deterministic per-batch seed":
      "sampleSeed=key^" in segment and "_r22SampleCount+1ULL" in segment,
  "game RNG state restored after every batch":
      "RNG::globalRandomState()=previous;" in segment,
  "cache keeps counters across frames":
      "_r22SampleCount+=samples;" in segment and "_r22HitSamples+=hit;" in segment
      and "_r22BlockedSamples+=blocked;" in segment
      and "_r22MissSamples+=missed;" in segment,
  "no premature recompute of incomplete result":
      "_r22SampleCount >= 1024U" in segment and "staleFinished" in segment,
  "F8 and target lock cache reset": "_r22StatsKey = 0;" in m,
  "convergence drives redraw, without force-redraw once finished":
      "if (_r22SampleCount < 1024U) _redraw=true;" in segment,
  "risk hatching at medium/high rates": "if (riskPct>=25U)" in segment
      and "if (riskPct>=50U)" in segment,
  "do not flood map with translucent fills": "SDL_FillRect" not in segment,
  "H/B/M classification is one of three outcomes":
      "if (anyHit) ++hit;" in segment and
      "else if (allBlocked) ++blocked;" in segment and
      "else ++missed;" in segment,
  "new counters held only in Map": all(x in h for x in
      ["_r22HitSamples","_r22BlockedSamples","_r22MissSamples","_r22RiskSamples"]),
}
bad=[]
for name,yes in checks.items():
    print(("PASS" if yes else "FAIL")+" "+name)
    if not yes:bad.append(name)
print(f"Progressive MC static tests: {len(checks)-len(bad)}/{len(checks)}")
if bad: raise SystemExit("Progressive MC static checks failed: "+", ".join(bad))
