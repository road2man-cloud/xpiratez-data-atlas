#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Disable ONLY audio initialization inside the native, no-rendering adapter.
// The original Game::initAudio body remains untouched after the headless guard.
// This avoids dependency on SDL's unspecified fallback audio-driver selection.
import fs from 'node:fs';
import path from 'node:path';
import {sha256} from './prepare-native.mjs';

const ANCHOR='\nvoid Game::initAudio()\n{';
const GUARD=[
  '\nvoid Game::initAudio()\n{',
  '\t// Native replay has no sound output. Gameplay RNG and logic are unchanged.',
  '\tif (std::getenv("XPZ_NATIVE_PLAN"))',
  '\t{',
  '\t\tOptions::mute = true;',
  '\t\treturn;',
  '\t}',
].join('\n');
export function patchNativeAudio(text){
  text=text.replace(/\r\n/g,'\n');
  if(text.includes('Native replay has no sound output'))
    throw new Error('NATIVE_AUDIO_ALREADY_PATCHED');
  if(text.split(ANCHOR).length!==2)
    throw new Error('UNSUPPORTED_NATIVE_AUDIO_LAYOUT');
  if(!text.includes('#include <cstdlib>'))
    throw new Error('NATIVE_AUDIO_CSTDLIB_MISSING');
  return text.replace(ANCHOR,GUARD);
}
export function applyNativeAudio(root){
  const p=path.join(root,'src/Engine/Game.cpp');
  const prior=fs.readFileSync(p,'utf8');
  const patched=patchNativeAudio(prior);
  fs.writeFileSync(p,patched);
  return {schema:1,mode:'ORIGINAL_OXCE_GAME_NATIVE_MUTE_NO_SURROGATE',
    path:'src/Engine/Game.cpp',
    priorSha256:sha256(Buffer.from(prior)),
    patchedFiles:{'src/Engine/Game.cpp':sha256(Buffer.from(patched))},
    noGameplayCodeModified:true};
}
