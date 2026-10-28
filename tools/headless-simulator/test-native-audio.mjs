#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Source-level only audit of headless-only mute. No SDL heuristic, no battle.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
import {applyNativeAudio} from './native-audio.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-audio-'));
try{
  const lock=JSON.parse(fs.readFileSync(path.join(HERE,'native/source.lock.json'),'utf8'));
  if(sha256(fs.readFileSync(path.join(HERE,'native/oxce-source.tar.gz')))!==lock.archiveSha256)
    throw new Error('NATIVE_SOURCE_ARCHIVE_CHANGED');
  const extract=spawnSync('tar',['-xzf','native/oxce-source.tar.gz','-C',tmp],{
    cwd:HERE,encoding:'utf8'
  });
  if(extract.error||extract.status!==0)
    throw new Error('EXTRACT_NATIVE_SOURCE_FAILED');
  const gameFile=path.join(tmp,'src/Engine/Game.cpp');
  const before=fs.readFileSync(gameFile,'utf8');
  const receipt=applyNativeAudio(tmp);
  const after=fs.readFileSync(gameFile,'utf8');
  if(receipt.schema!==1||
     receipt.mode!=='ORIGINAL_OXCE_GAME_NATIVE_MUTE_NO_SURROGATE'||
     receipt.noGameplayCodeModified!==true||
     !after.includes('if (std::getenv("XPZ_NATIVE_PLAN"))')||
     !after.includes('Options::mute = true;')||
     !after.includes('if (SDL_InitSubSystem(SDL_INIT_AUDIO) < 0)')||
     after.indexOf('Options::mute = true;')>=after.indexOf('if (SDL_InitSubSystem(SDL_INIT_AUDIO) < 0)')||
     sha256(Buffer.from(after))!==receipt.patchedFiles['src/Engine/Game.cpp']||
     !after.includes(before.slice(before.indexOf('if (SDL_InitSubSystem(SDL_INIT_AUDIO) < 0)'))))
    throw new Error('NATIVE_AUDIO_SOURCE_GUARD_INVALID');
  console.log(JSON.stringify({mode:receipt.mode,sourceHash:lock.archiveSha256,
    audioPatchSha256:sha256(JSON.stringify(receipt)),
    originalAudioFunctionBodyPreserved:true,
    gameplaySimulated:false,parityCertified:false},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
