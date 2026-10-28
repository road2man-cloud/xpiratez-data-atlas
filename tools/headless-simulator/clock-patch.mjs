// SPDX-License-Identifier: GPL-3.0-or-later
// Optional deterministic scheduling for the ORIGINAL engine. No combat model.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const FIXED_CLOCK_POLICY='fixed-1ms-v1';
function once(text,anchor,replacement,label){
  if(text.split(anchor).length!==2)throw new Error('UNSUPPORTED_CLOCK_SOURCE_LAYOUT: '+label);
  return text.replace(anchor,replacement);
}
export function clockFingerprint(){
  const headerSha256=sha256(fs.readFileSync(path.join(HERE,'native/ReplayClock.h')));
  const patcherSha256=sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
  return {headerSha256,patcherSha256,adapterSha256:sha256(JSON.stringify({headerSha256,patcherSha256}))};
}
export function verifyClockAdapter(){
  const lock=JSON.parse(fs.readFileSync(path.join(HERE,'native/clock.lock.json'),'utf8'));
  const sourceLock=JSON.parse(fs.readFileSync(path.join(HERE,'native/source.lock.json'),'utf8'));
  if(lock.schema!==1||lock.backend!=='OXCE_NATIVE_CLOCK_ADAPTER'||lock.policy!==FIXED_CLOCK_POLICY)
    throw new Error('INVALID_CLOCK_ADAPTER_LOCK');
  if(lock.sourceTreeSha256!==sourceLock.sourceTreeSha256||lock.sourceArchiveSha256!==sourceLock.archiveSha256)
    throw new Error('CLOCK_BASE_SOURCE_MISMATCH');
  for(const [name,value] of Object.entries(clockFingerprint()))
    if(lock[name]!==value)throw new Error('CLOCK_ADAPTER_HASH_MISMATCH: '+name);
  return lock;
}
export function patchClockTimer(text){
  text=text.replace(/\r\n/g,'\n');
  if(text.includes('NativeReplayClock'))throw new Error('CLOCK_SOURCE_ALREADY_PATCHED');
  if(!text.includes('Uint32 slowTick()')||text.split('SDL_GetTicks()').length!==3)
    throw new Error('UNSUPPORTED_CLOCK_SOURCE_LAYOUT: Timer clock reads');
  // Keep the original slowTick calculation, timer intervals, frame skipping,
  // callback ordering and gameSlowSpeed. Replace ONLY its two time samples.
  text=once(text,'#include "Timer.h"','#include "Timer.h"\n#include "../Headless/ReplayClock.h"','Timer include');
  return text.replaceAll('SDL_GetTicks()','NativeReplayClock::ticks(SDL_GetTicks())');
}
export function patchClockGame(text){
  text=text.replace(/\r\n/g,'\n');
  if(text.includes('NativeReplayClock'))throw new Error('CLOCK_SOURCE_ALREADY_PATCHED');
  text=once(text,'#include <cstdlib>','#include <cstdlib>\n#include "../Headless/ReplayClock.h"','Game include');
  text=once(text,'\t\t\tnativeActive->think();',
    '\t\t\t// Advance virtual time once per native main-loop iteration, not per read.\n'+
    '\t\t\tNativeReplayClock::advance();\n\t\t\tnativeActive->think();','native think');
  return once(text,'\t\t\tSDL_Delay(1);\n\t\t\tcontinue;',
    '\t\t\t// Yield to loader/audio threads without tying simulation time to host load.\n'+
    '\t\t\tSDL_Delay(NativeReplayClock::enabled() ? 0 : 1);\n\t\t\tcontinue;','native yield');
}
export function applyClockAdapter(root,original){
  const lock=verifyClockAdapter();
  if(original.clockAdapterSha256)throw new Error('CLOCK_SOURCE_ALREADY_PATCHED');
  if(original.sourceTreeSha256!==lock.sourceTreeSha256)throw new Error('CLOCK_BASE_SOURCE_MISMATCH');
  const relative=['src/Engine/Timer.cpp','src/Engine/Game.cpp'];
  const sources=relative.map(name=>{
    const bytes=fs.readFileSync(path.join(root,name));
    const expected=original.patchedFiles[name]||original.sourceFiles[name];
    if(!expected||sha256(bytes)!==expected)throw new Error('CLOCK_INPUT_HASH_MISMATCH: '+name);
    return bytes.toString('utf8');
  });
  // Resolve every insertion point before writing any build-stage file.
  const updates={
    'src/Engine/Timer.cpp':patchClockTimer(sources[0]),
    'src/Engine/Game.cpp':patchClockGame(sources[1]),
    'src/Headless/ReplayClock.h':fs.readFileSync(path.join(HERE,'native/ReplayClock.h'),'utf8')
  };
  const manifest=structuredClone(original);
  manifest.clockAdapterSha256=lock.adapterSha256;
  manifest.fixedClockPolicy=lock.policy;
  manifest.fixedClockDefault=false;
  for(const [name,text] of Object.entries(updates)){
    fs.writeFileSync(path.join(root,name),text);
    manifest.patchedFiles[name]=sha256(Buffer.from(text));
  }
  fs.writeFileSync(path.join(root,'native-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
