// SPDX-License-Identifier: GPL-3.0-or-later
// Scheduling/adapter tests only: these are NOT complete battle replays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sha256,patchGame} from './prepare-native.mjs';
import {verifySource} from './build-native.mjs';
import {FIXED_CLOCK_POLICY,verifyClockAdapter,patchClockTimer,patchClockGame,applyClockAdapter} from './clock-patch.mjs';
import {parseArgs,nativeClockEnvironment} from './run-native.mjs';
import {compare} from './compare-replays.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const CORE=['src/Battlescape/AIModule.cpp','src/Battlescape/TileEngine.cpp','src/Battlescape/Pathfinding.cpp','src/Battlescape/Projectile.cpp','src/Savegame/BattleUnit.cpp','src/Savegame/BattleItem.cpp','src/Engine/RNG.cpp'];
function extract(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-clock-source-'));
  const r=spawnSync('tar',['-xzf','native/oxce-source.tar.gz','-C',root],{cwd:HERE,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'native-source-manifest.json'),'utf8'));
  verifySource(root,manifest);
  return {root,manifest};
}

test('clock adapter and immutable source snapshot are separately fingerprinted',()=>{
  const lock=verifyClockAdapter();
  assert.equal(lock.defaultEnabled,false);
  assert.equal(lock.fullBattleReplayVerified,false);
  assert.equal(lock.interactiveParityCertified,false);
  assert.equal(lock.policy,FIXED_CLOCK_POLICY);
});

test('fixed time is explicit; an inherited experiment cannot silently enable it',()=>{
  const a=parseArgs(['--experimental','--fixed-clock']);
  assert.equal(a['--fixed-clock'],true);
  const old={XPZ_NATIVE_LOGICAL_CLOCK:'untrusted-old-mode',UNCHANGED:'yes'};
  assert.deepEqual(nativeClockEnvironment({},old),{UNCHANGED:'yes'});
  assert.deepEqual(nativeClockEnvironment(a,old),{UNCHANGED:'yes',XPZ_NATIVE_LOGICAL_CLOCK:FIXED_CLOCK_POLICY});
  assert.equal(old.XPZ_NATIVE_LOGICAL_CLOCK,'untrusted-old-mode');
});

test('clock patch fails closed for unknown or already modified source',()=>{
  assert.throws(()=>patchClockTimer('not Timer.cpp'),/UNSUPPORTED_CLOCK_SOURCE_LAYOUT/);
  assert.throws(()=>patchClockGame('not Game.cpp'),/UNSUPPORTED_CLOCK_SOURCE_LAYOUT/);
  const original=patchGame('\t\t// Process rendering\noriginal_render();');
  const patched=patchClockGame(original);
  assert.ok(patched.includes('NativeReplayClock::advance();'));
  assert.ok(patched.includes('nativeActive->think();'));
  assert.ok(patched.includes('banner->close();'));
  assert.ok(patched.includes('original_render();'));
  assert.throws(()=>patchClockGame(patched),/ALREADY_PATCHED/);
});

test('patch changes time samples only and leaves every core battle/RNG file untouched',()=>{
  const {root,manifest}=extract();
  try{
    const timerBefore=fs.readFileSync(path.join(root,'src/Engine/Timer.cpp'),'utf8').replace(/\r\n/g,'\n');
    const hashes=Object.fromEntries(CORE.map(p=>[p,sha256(fs.readFileSync(path.join(root,p)))]));
    const patched=applyClockAdapter(root,manifest);
    verifySource(root,patched);
    assert.equal(patched.sourceTreeSha256,manifest.sourceTreeSha256);
    assert.equal(patched.driverSha256,manifest.driverSha256);
    assert.equal(patched.fixedClockDefault,false);
    for(const p of CORE){
      assert.equal(sha256(fs.readFileSync(path.join(root,p))),hashes[p]);
      assert.equal(Object.hasOwn(patched.patchedFiles,p),false,p);
    }
    const timerAfter=fs.readFileSync(path.join(root,'src/Engine/Timer.cpp'),'utf8');
    const reversed=timerAfter.replace('#include "../Headless/ReplayClock.h"\n','')
      .replaceAll('NativeReplayClock::ticks(SDL_GetTicks())','SDL_GetTicks()');
    assert.equal(reversed,timerBefore,'Original timer scheduling logic must remain intact');
    assert.throws(()=>applyClockAdapter(root,patched),/ALREADY_PATCHED/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('strict comparison never mixes timing policies or drops differing saved frames',()=>{
  const a={backend:'OXCE_NATIVE',planCompleted:true,seed:'PRESERVE_SAVE_RNG',clockPolicy:FIXED_CLOCK_POLICY,clockAdapterSha256:'d'.repeat(64),
    checkpoints:[{phase:'final',turn:2,side:0,rng:'123',command_index:2,snapshotSha256:'b'.repeat(64)}]};
  for(const k of ['sourceTreeSha256','driverSha256','archiveSha256','binarySha256','planSha256','configSha256','inputSaveSha256'])a[k]='a'.repeat(64);
  assert.equal(compare(a,structuredClone(a)).nativeReplayIdentical,true);
  const b=structuredClone(a);b.clockPolicy='wall-clock';
  assert.throws(()=>compare(a,b),/INCOMPARABLE_INPUT: clockPolicy/);
  b.clockPolicy=a.clockPolicy;delete b.clockAdapterSha256;
  assert.throws(()=>compare(a,b),/REPLAY_FINGERPRINT_MISSING: clockAdapterSha256/);
  b.clockAdapterSha256=a.clockAdapterSha256;b.checkpoints[0].snapshotSha256='c'.repeat(64);
  assert.equal(compare(a,b).nativeReplayIdentical,false);
});

// Compile the ACTUAL archived Timer.cpp, not a reimplementation. Only its
// surrounding UI/SDL declarations are stubbed. No game or battle is executed.
test('original C++ Timer callbacks are invariant to host-time jitter in fixed mode',
  {skip:process.platform!=='linux'?'C++ timer probe is required on Linux CI/GPT, not the Windows game PC':false},()=>{
  const {root,manifest}=extract();
  try{
    applyClockAdapter(root,manifest);
    const probe=path.join(root,'clock-probe');
    fs.mkdirSync(path.join(probe,'Engine'),{recursive:true});
    fs.mkdirSync(path.join(probe,'Headless'),{recursive:true});
    for(const f of ['Timer.cpp','Timer.h'])fs.copyFileSync(path.join(root,'src/Engine',f),path.join(probe,'Engine',f));
    fs.copyFileSync(path.join(root,'src/Headless/ReplayClock.h'),path.join(probe,'Headless/ReplayClock.h'));
    const stubs={
      'SDL.h':'#pragma once\n#include <cstdint>\nusing Uint32=std::uint32_t; using Uint64=std::uint64_t; using Sint64=std::int64_t;\nUint32 SDL_GetTicks();\n',
      'State.h':'#pragma once\nnamespace OpenXcom { class Game; class State { public: Game* _game; int count=0, frames=0; void step(); void animate(); }; }\n',
      'Surface.h':'#pragma once\nnamespace OpenXcom { class Surface { public: void tick() {} }; }\n',
      'Game.h':'#pragma once\nnamespace OpenXcom { class State; class Game { public: bool isState(State*) const { return true; } }; }\n',
      'Options.h':'#pragma once\nnamespace OpenXcom { namespace Options { inline int maxFrameSkip=8; } }\n'
    };
    for(const [n,s] of Object.entries(stubs))fs.writeFileSync(path.join(probe,'Engine',n),s);
    fs.writeFileSync(path.join(probe,'probe.cpp'),[
      '#include "Engine/Timer.h"','#include "Engine/Game.h"','#include "Headless/ReplayClock.h"',
      '#include <iostream>','#include <sstream>','#include <cstdlib>',
      'static Uint32 hostTicks=0; static std::ostringstream sequence;',
      'Uint32 SDL_GetTicks(){return hostTicks;}',
      'void OpenXcom::State::step(){++count; sequence << "S" << NativeReplayClock::ticks(hostTicks) << ",";}',
      'void OpenXcom::State::animate(){++frames; sequence << "A" << NativeReplayClock::ticks(hostTicks) << ",";}',
      'int main(int argc,char**argv){',
      '  using namespace OpenXcom; int jitter=argc>1?std::atoi(argv[1]):0;',
      '  Game game; State state; state._game=&game;',
      '  Timer simulation(10,true),animation(16,true);',
      '  simulation.onTimer(&State::step); animation.onTimer(&State::animate);',
      '  simulation.start(); animation.start();',
      '  for(int i=1;i<=1000;++i){',
      '    hostTicks += jitter ? (i%13==0 ? 17 : 2) : 1;',
      '    NativeReplayClock::advance(); simulation.think(&state,nullptr); animation.think(&state,nullptr);',
      '  }',
      '  std::cout << "fixed=" << NativeReplayClock::enabled() << " state=" << state.count << " anim=" << state.frames << "\\n" << sequence.str() << "\\n";',
      '}'
    ].join('\n'));
    const exe=path.join(probe,'probe');
    const compilation=spawnSync(process.env.CXX||'g++',['-std=c++17','-O2','-I'+path.join(probe,'Engine'),path.join(probe,'Engine/Timer.cpp'),path.join(probe,'probe.cpp'),'-o',exe],{encoding:'utf8',timeout:60000});
    assert.equal(compilation.status,0,compilation.stderr||String(compilation.error));
    const run=(jitter,fixed,withPlan=true)=>{
      const env={...process.env};delete env.XPZ_NATIVE_LOGICAL_CLOCK;delete env.XPZ_NATIVE_PLAN;
      if(withPlan)env.XPZ_NATIVE_PLAN='scheduling-test-not-a-battle';
      if(fixed)env.XPZ_NATIVE_LOGICAL_CLOCK=FIXED_CLOCK_POLICY;
      const r=spawnSync(exe,[String(jitter)],{env,encoding:'utf8',timeout:5000});
      assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
    };
    const stable=run(0,true);
    assert.match(stable,/fixed=1 state=100 anim=62/);
    assert.equal(stable,run(1,true),'Host clock jitter must not change native timer callback order or counts');
    const wall=run(0,false);assert.match(wall,/fixed=0 state=100 anim=62/);
    assert.notEqual(wall,run(1,false),'Control: unmodified wall-clock sampling should observe changed elapsed time');
    assert.equal(wall,run(0,true,false),'No native plan means the GUI clock remains unchanged');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
