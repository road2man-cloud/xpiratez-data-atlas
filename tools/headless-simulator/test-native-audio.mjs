#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// SDL1.2 Linux smoke test ONLY. Never runs OpenXcom or a battle.
// Proves the ORIGINAL Game::initAudio failure/mute route can be used to
// avoid shipping hundreds of MiB of music and sound files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {HEADLESS_AUDIO_DRIVER,HEADLESS_AUDIO_POLICY} from './run-native.mjs';
if(process.platform!=='linux')throw new Error('SDL_AUDIO_SMOKE_REQUIRES_LINUX');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-sdl-noaudio-'));
try{
  const src=path.join(temp,'test.cpp'),bin=path.join(temp,'noaudio');
  fs.writeFileSync(src,[
    '#include <SDL.h>',
    '#include <cstdio>',
    'int main(){',
    '  if(SDL_Init(SDL_INIT_AUDIO)==0){',
    '    std::fputs("SDL AUDIO UNEXPECTEDLY INITIALIZED\\n",stderr);',
    '    SDL_Quit();',
    '    return 1;',
    '  }',
    '  std::puts("SDL AUDIO UNAVAILABLE AS EXPECTED");',
    '  return 0;',
    '}',
    ''
  ].join('\n'));
  const flags=spawnSync('sdl-config',['--cflags','--libs'],{encoding:'utf8'});
  if(flags.error||flags.status!==0)throw new Error('SDL1_2_BUILD_DEPS_MISSING');
  const args=['-std=c++17',src,'-o',bin,...flags.stdout.trim().split(/\s+/)];
  const build=spawnSync('g++',args,{encoding:'utf8'});
  if(build.error||build.status!==0)
    throw new Error('SDL1_2_BUILD_FAILED: '+String(build.stderr||build.error).slice(-1500));
  const proof=spawnSync(bin,[],{encoding:'utf8',env:{
    ...process.env,SDL_AUDIODRIVER:HEADLESS_AUDIO_DRIVER
  }});
  if(proof.error||proof.status!==0||!proof.stdout?.includes('SDL AUDIO UNAVAILABLE AS EXPECTED'))
    throw new Error('SDL_AUDIO_MUTE_ASSUMPTION_FAILED: '+JSON.stringify({status:proof.status,stderr:proof.stderr,stdout:proof.stdout}));
  console.log(JSON.stringify({schema:1,audioPolicy:HEADLESS_AUDIO_POLICY,
    driver:HEADLESS_AUDIO_DRIVER,sdlInitializationRejected:true,
    originalOXCEMuteFallbackExpected:true,gameExecuted:false,battleExecuted:false},null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
