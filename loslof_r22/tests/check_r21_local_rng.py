#!/usr/bin/env python3
from pathlib import Path
import sys
r=Path(sys.argv[1])
h=(r/"src/Battlescape/Projectile.h").read_text()
p=(r/"src/Battlescape/Projectile.cpp").read_text()
m=(r/"src/Battlescape/Map.cpp").read_text()
checks={
"native call defaults preview RNG to null":'RNG::RandomState *previewRng = nullptr' in h,
"preview state passed only from R22 map":'projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng)' in m,
"R21-style RNG is independent":'RNG::RandomState previewRng(sampleSeed ? sampleSeed : 1ULL);' in m,
"existing RNG guard retained":'RNG::globalRandomState()=previous' in m,
"native applyAccuracy uses preview RNG only if supplied":'previewRng ? previewRng->generate(minimum,maximum) : RNG::generate(minimum,maximum)' in p,
"normal OXCE projectile callers unmodified":'int Projectile::calculateThrow(double accuracy)' in p and 'int Projectile::calculateTrajectory(double accuracy)' in p,
"native preview stage keeps no input interception":'r22PreviewClick' not in m
}
for name,ok in checks.items():print(("PASS " if ok else "FAIL ")+name)
if not all(checks.values()):raise SystemExit(1)
