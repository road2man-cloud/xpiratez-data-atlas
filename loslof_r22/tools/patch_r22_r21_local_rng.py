#!/usr/bin/env python3
"""R21-derived R22 upgrade: keep Monte Carlo RNG local, native combat untouched.
The uploaded R21 COFF confirms calculateTrajectoryPreview takes RNG::RandomState&.
Equivalent R22 implementation uses an optional preview-only RNG pointer with a
null default, preserving every real game caller and its original global RNG.
No R21 facing/HUD/input mechanics are brought back.
"""
from pathlib import Path
import argparse,hashlib,json,re,subprocess
PIN="3e722e09b655ab67acfb59fc8585dc70b583826c"
def one(s,a,b):
    n=s.count(a)
    if n!=1:raise RuntimeError("R21 local RNG anchor count %d: %r"%(n,a[:100]))
    return s.replace(a,b,1)
def patch(ph,pc,mc):
    ph=one(ph,
        'int calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit = true, bool onlyVisible = false);',
        'int calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit = true, bool onlyVisible = false, RNG::RandomState *previewRng = nullptr);')
    ph=one(ph,
        'void applyAccuracy(Position origin, Position *target, double accuracy, bool keepRange, bool extendLine);',
        'void applyAccuracy(Position origin, Position *target, double accuracy, bool keepRange, bool extendLine, RNG::RandomState *previewRng = nullptr);')
    ph=one(ph,'class Projectile\n{','class Projectile\n{')
    # Header already depends on RNG only by pointer; forward-declare namespace.
    ph=one(ph,'class Projectile\n{','namespace RNG { class RandomState; }\nclass Projectile\n{')
    pc=one(pc,
        'int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit, bool onlyVisible)',
        'int Projectile::calculateTrajectory(double accuracy, const Position& originVoxel, bool excludeUnit, bool onlyVisible, RNG::RandomState *previewRng)')
    pc=one(pc,
        'applyAccuracy(originVoxel, &_targetVoxel, accuracy, false, extendLine);',
        'applyAccuracy(originVoxel, &_targetVoxel, accuracy, false, extendLine, previewRng);')
    pc=one(pc,
        'void Projectile::applyAccuracy(Position origin, Position *target, double accuracy, bool keepRange, bool extendLine)',
        'void Projectile::applyAccuracy(Position origin, Position *target, double accuracy, bool keepRange, bool extendLine, RNG::RandomState *previewRng)')
    left=pc.index('void Projectile::applyAccuracy(')
    right=pc.index('\n}\n',left)+3
    part=pc[left:right]
    part=one(part,'\tint deviation = RNG::generate(0, 100) - (accuracy * 100);',
        '\t// R21-style dedicated preview stream; null keeps native gameplay RNG.\n'
        '\tauto generate = [&](int minimum, int maximum) -> int {\n'
        '\t\treturn previewRng ? previewRng->generate(minimum,maximum) : RNG::generate(minimum,maximum);\n'
        '\t};\n'
        '\tint deviation = generate(0, 100) - (accuracy * 100);')
    part=part.replace('RNG::generate(0, deviation)', 'generate(0, deviation)')
    part=part.replace('RNG::generate(0, deviation / 2)', 'generate(0, deviation / 2)')
    if 'RNG::generate(0, deviation)' in part:raise RuntimeError("unconverted RNG")
    pc=pc[:left]+part+pc[right:]
    mc=one(mc,
        '        } keep(sampleSeed ? sampleSeed : 1ULL);',
        '        } keep(sampleSeed ? sampleSeed : 1ULL);')
    # Keep the existing save/restore guard as defense-in-depth for any
    # other engine helper consuming the global RNG.
    mc=one(mc,
        '        } keep(sampleSeed ? sampleSeed : 1ULL);',
        '        } keep(sampleSeed ? sampleSeed : 1ULL);\n'
        '        RNG::RandomState previewRng(sampleSeed ? sampleSeed : 1ULL);')
    mc=one(mc,'projectile.calculateTrajectory(acc,muzzle,true,true)',
       'projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng)')
    return ph,pc,mc
def main():
    ap=argparse.ArgumentParser();ap.add_argument("engine",type=Path);ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args();root=args.engine.resolve()
    names=["src/Battlescape/Projectile.h","src/Battlescape/Projectile.cpp","src/Battlescape/Map.cpp"]
    files=[root/n for n in names];ver=root/"src/version.h"
    if not all(f.is_file() for f in files+[ver]):raise SystemExit("Missing pinned files")
    if not re.search(r'OPENXCOM_VERSION_SHORT\s+"Extended 8\.6(?:\.0)?"',ver.read_text(encoding="utf-8")):raise SystemExit("Engine version mismatch")
    if (root/".git").exists():
        sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
        if sha!=PIN:raise SystemExit("Engine source SHA mismatch")
    before=[f.read_text(encoding="utf-8") for f in files]
    after=patch(*before)
    if not args.dry_run:
        for f,s in zip(files,after):f.write_text(s,encoding="utf-8")
    print(json.dumps({"R21_source":"uploaded x86 COFF preview RNG reference",
        "R21_parity":False,"native_gameplay_modified":False,
        "paths":{n:hashlib.sha256(s.encode()).hexdigest() for n,s in zip(names,after)}},indent=2))
if __name__=="__main__":main()
