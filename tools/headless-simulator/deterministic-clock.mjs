#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Replaces only wall-clock scheduling in ORIGINAL OXCE headless mode.
// Gameplay/AI/ballistics/movement/RNG algorithms are untouched.
// This makes the script-visible animFrame deterministic, not cosmetic-only.
import fs from 'node:fs';
import path from 'node:path';
import {sha256} from './prepare-native.mjs';

export const NATIVE_STEP_MS=16;
function replaceOnce(src, oldText, newText, where) {
  if(src.split(oldText).length!==2)throw new Error('UNSUPPORTED_NATIVE_CLOCK_LAYOUT: '+where);
  return src.replace(oldText,newText);
}
export function patchTimerHeader(src) {
  src=src.replace(/\r\n/g,'\n');
  if(src.includes('advanceNativeClock'))throw new Error('NATIVE_CLOCK_ALREADY_PATCHED');
  return replaceOnce(src,'static Uint32 gameSlowSpeed;',
    'static Uint32 gameSlowSpeed;\n\t/// Advances the deterministic clock only in headless native replay.\n\tstatic void advanceNativeClock(Uint32 milliseconds);','Timer.h declaration');
}
export function patchTimerCpp(src) {
  src=src.replace(/\r\n/g,'\n');
  if(src.includes('nativeClockScaled'))throw new Error('NATIVE_CLOCK_ALREADY_PATCHED');
  src=replaceOnce(src,'#include "Timer.h"',
    '#include <cstdlib>\n#include "Timer.h"','Timer.cpp include');
  src=replaceOnce(src,'const Uint32 accurate = 4;\nUint32 slowTick()\n{',
    'const Uint32 accurate = 4;\nUint64 nativeClockScaled = 0;\nUint32 slowTick()\n{\n\tif (std::getenv("XPZ_NATIVE_PLAN")) return static_cast<Uint32>(nativeClockScaled >> accurate);',
    'Timer.cpp slowTick');
  src=replaceOnce(src,'Uint32 Timer::gameSlowSpeed = 1;',
    'void Timer::advanceNativeClock(Uint32 milliseconds)\n{\n\t// Match the original slowTick 4-bit fixed-point precision and speed.\n\tif (!std::getenv("XPZ_NATIVE_PLAN")) return;\n\tif (gameSlowSpeed == 0) return;\n\tnativeClockScaled += (static_cast<Uint64>(milliseconds) << accurate) / gameSlowSpeed;\n}\n\nUint32 Timer::gameSlowSpeed = 1;',
    'Timer.cpp clock advance');
  return src;
}
export function patchGameCpp(src) {
  src=src.replace(/\r\n/g,'\n');
  if(src.includes('advanceNativeClock'))throw new Error('NATIVE_CLOCK_ALREADY_PATCHED');
  src=replaceOnce(src,'#include "../Battlescape/NextTurnState.h"',
    '#include "../Battlescape/NextTurnState.h"\n#include "Timer.h"','Game.cpp Timer include');
  src=replaceOnce(src,'\t\t\tnativeActive->think();',
    '\t\t\t// Fixed 16ms simulation tick: no wall-clock jitter between seeded runs.\n\t\t\tTimer::advanceNativeClock(16);\n\t\t\tnativeActive->think();','Game.cpp native think');
  src=replaceOnce(src,'\t\t\tSDL_Delay(1);\n\t\t\tcontinue;',
    '\t\t\t// Native input/think runs without real-time throttling.\n\t\t\tcontinue;', 'Game.cpp headless delay');
  return src;
}
export function applyNativeClock(root) {
  const entries=[
    ['src/Engine/Timer.h',patchTimerHeader],
    ['src/Engine/Timer.cpp',patchTimerCpp],
    ['src/Engine/Game.cpp',patchGameCpp]
  ];
  const patchedFiles={};
  for(const [rel,patch] of entries) {
    const file=path.join(root,rel);
    const updated=patch(fs.readFileSync(file,'utf8'));
    fs.writeFileSync(file,updated);
    patchedFiles[rel]=sha256(Buffer.from(updated));
  }
  return {schema:1,mode:'DETERMINISTIC_NATIVE_TIMER_NO_SURROGATE',
    stepMilliseconds:NATIVE_STEP_MS, patchedFiles};
}
