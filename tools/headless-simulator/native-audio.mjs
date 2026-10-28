#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Native-only sound suppression and acknowledgement of blocking OK dialog.
// Gameplay, original AI, attacks, projectiles and RNG are unmodified.
// The OK dialogue requires input which a no-rendering process cannot provide.
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
  text=text.replace(ANCHOR,GUARD);
  // Original UI event handler is called, not a reimplementation of death,
  // unconsciousness or environment effects that caused this dialog.
  const include='#include "../Battlescape/NextTurnState.h"';
  if(text.split(include).length!==2)throw new Error('NATIVE_MODAL_INCLUDE_ANCHOR_MISSING');
  text=text.replace(include,include+'\n#include "../Battlescape/InfoboxOKState.h"');
  const bannerClose='\t\t\t\t\tbanner->close();\n\t\t\t\t}';
  if(text.split(bannerClose).length!==2)throw new Error('NATIVE_MODAL_HANDLER_ANCHOR_MISSING');
  text=text.replace(bannerClose,bannerClose+
    '\n\t\t\t\telse if (auto* dialog = dynamic_cast<InfoboxOKState*>(nativeActive))'+
    '\n\t\t\t\t{'+
    '\n\t\t\t\t\tLog(LOG_INFO) << "[XPZ_NATIVE] acknowledge InfoboxOKState";'+
    '\n\t\t\t\t\tdialog->btnOkClick(nullptr);'+
    '\n\t\t\t\t}');
  return text;
}
export function applyNativeAudio(root){
  const p=path.join(root,'src/Engine/Game.cpp');
  const prior=fs.readFileSync(p,'utf8');
  const patched=patchNativeAudio(prior);
  fs.writeFileSync(p,patched);
  return {schema:1,mode:'ORIGINAL_OXCE_GAME_NATIVE_MUTE_AND_MODAL_ACK',
    path:'src/Engine/Game.cpp',
    priorSha256:sha256(Buffer.from(prior)),
    patchedFiles:{'src/Engine/Game.cpp':sha256(Buffer.from(patched))},
    noGameplayCodeModified:true,modalAck:'ORIGINAL_INFOBOX_OK_BUTTON_HANDLER'};
}
