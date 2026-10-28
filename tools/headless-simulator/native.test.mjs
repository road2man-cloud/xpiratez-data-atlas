// SPDX-License-Identifier: GPL-3.0-or-later
// Adapter integrity tests. These are NOT combat/parity/success-rate tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {patchBattle,patchGame,sha256,prepare} from './prepare-native.mjs';
import {patchTimerHeader,patchTimerCpp,patchGameCpp,applyNativeClock} from './deterministic-clock.mjs';
import {patchFinishBattle,patchOutcomeGame,applyNativeOutcome} from './native-outcome.mjs';
import {parseArgs,preflight,verifyRuntime} from './run-native.mjs';
import {verifySource,prepareBuildAssetDirectories} from './build-native.mjs';
import {compare} from './compare-replays.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));

test('retired numerical simulator and its success-looking tests do not exist',()=>{
  assert.equal(fs.existsSync(path.join(ROOT,'simulate.mjs')),false);
  assert.equal(fs.existsSync(path.join(ROOT,'test.mjs')),false);
});
test('old launch command fails rather than returning invented battle statistics',()=>{
  const r=spawnSync(process.execPath,[path.join(ROOT,'simulate.mjs'),'17.sav','--runs','5000'],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.equal(r.stdout,'');
});
test('native insertion preserves the original battle think body',()=>{
  const source='\nnamespace OpenXcom\n{\nint BattlescapeGame::think()\n{\n int ret = -1;\n return ret;\n}\n}\n';
  const patched=patchBattle(source);
  assert.ok(patched.includes('NativeReplay::tick(this)'));
  assert.ok(patched.includes(' int ret = -1;\n return ret;'));
  assert.ok(patched.includes('_playerPanicHandled'));
  assert.throws(()=>patchBattle(patched),/ALREADY_PATCHED/);
});
test('an unfamiliar engine layout is not silently patched',()=>{
  assert.throws(()=>patchBattle('not an OXCE source'),/UNSUPPORTED_SOURCE_LAYOUT/);
  assert.throws(()=>patchGame('not an OXCE source'),/UNSUPPORTED_SOURCE_LAYOUT/);
});
test('headless hook suppresses rendering without replacing state think',()=>{
  const patched=patchGame('\t\t// Process rendering\noriginal_render_body();');
  assert.ok(patched.includes('nativeActive->think();'));
  assert.ok(patched.includes('original_render_body();'));
  assert.throws(()=>patchGame(patched),/ALREADY_PATCHED/);
});
test('turn banner acknowledgement preserves native initialization and avoids double-pop',()=>{
  const patched=patchGame('\t\t// Process rendering\noriginal_render_body();');
  assert.ok(patched.includes('dynamic_cast<NextTurnState*>(nativeActive)'));
  assert.ok(patched.includes('!_states.empty() && _states.back() == nativeActive'));
  assert.ok(patched.indexOf('nativeActive->think();') < patched.indexOf('banner->close();'));
  assert.equal(patched.includes('determineReinforcements('),false);
  assert.equal(patched.includes('applyEnvironmentalCondition'),false);
  assert.equal(patched.includes('RNG::setSeed'),false);
});
test('headless deterministic clock replaces wall-clock scheduling only',()=>{
  const header=patchTimerHeader('class Timer {\nstatic Uint32 gameSlowSpeed;\n};');
  assert.match(header,/advanceNativeClock/);
  const cpp=patchTimerCpp('#include "Timer.h"\nnamespace OpenXcom {\nnamespace {\nconst Uint32 accurate = 4;\nUint32 slowTick()\n{\n return 0;\n}\n}\nUint32 Timer::gameSlowSpeed = 1;');
  assert.match(cpp,/nativeClockScaled/);
  assert.match(cpp,/XPZ_NATIVE_PLAN/);
  const game=patchGameCpp('#include "../Battlescape/NextTurnState.h"\n\t\t\tnativeActive->think();\n\t\t\tSDL_Delay(1);\n\t\t\tcontinue;');
  assert.match(game,/Timer::advanceNativeClock\(16\)/);
  assert.doesNotMatch(game,/SDL_Delay\(1\)/);
  assert.throws(()=>patchTimerCpp(cpp),/ALREADY_PATCHED/);
  assert.throws(()=>patchGameCpp(game),/ALREADY_PATCHED/);
});
test('clock patch applies to exact archived OXCE source, not combat algorithms',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-clock-'));
  try{
    const x=spawnSync('tar',['-xzf','native/oxce-source.tar.gz','-C',dir],{encoding:'utf8',cwd:ROOT});
    assert.equal(x.status,0,x.stderr);
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,'native-source-manifest.json'),'utf8'));
    verifySource(dir,manifest);
    const result=applyNativeClock(dir);
    assert.equal(result.stepMilliseconds,16);
    const observer=applyNativeOutcome(dir);
    assert.equal(observer.mode,'ORIGINAL_OXCE_FINISHBATTLE_OBSERVER');
    assert.deepEqual(Object.keys(observer.patchedFiles),[
      'src/Battlescape/BattlescapeState.cpp','src/Engine/Game.cpp','src/Headless/NativeOutcome.h'
    ]);
    for(const [f,digest] of Object.entries(observer.patchedFiles))
      assert.equal(sha256(fs.readFileSync(path.join(dir,f))),digest);
    assert.deepEqual(Object.keys(result.patchedFiles),['src/Engine/Timer.h','src/Engine/Timer.cpp','src/Engine/Game.cpp']);
    for(const [f,digest] of Object.entries(result.patchedFiles)) {
      if(f==='src/Engine/Game.cpp')continue; // Followed by the outcome observer hook.
      assert.equal(sha256(fs.readFileSync(path.join(dir,f))),digest);
    }
    for(const f of ['src/Engine/RNG.cpp','src/Battlescape/TileEngine.cpp','src/Battlescape/AIModule.cpp'])
      assert.equal(sha256(fs.readFileSync(path.join(dir,f))),manifest.sourceFiles[f]);
    assert.throws(()=>applyNativeClock(dir),/ALREADY_PATCHED/);
    assert.throws(()=>applyNativeOutcome(dir),/ALREADY_PATCHED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native finish hook records original finishBattle without inventing a win rule',()=>{
  const source=[
    '#include "../Engine/Timer.h"',
    'void BattlescapeState::finishBattle(bool abort, int inExitArea)',
    '{',
    ' std::string nextStage; bool isPreview=false;',
    '}',
    '',
    '/**',
    ' * Shows the launch button.',
    ' */'
  ].join('\n');
  const patched=patchFinishBattle(source);
  assert.ok(patched.includes('NativeOutcome::recordFinish(abort, inExitArea'));
  assert.ok(patched.includes('getSavedGame()->save("xpz-native-battle-entry.sav"'));
  assert.ok(patched.includes('getSavedGame()->save("xpz-native-battle-finish.sav"'));
  assert.ok(patched.indexOf('save("xpz-native-battle-entry.sav"') < patched.indexOf('std::string nextStage;'));
  assert.ok(patched.indexOf('save("xpz-native-battle-finish.sav"') > patched.indexOf('std::string nextStage;'));
  assert.ok(patched.includes('RNG::getSeed()'));
  assert.ok(patched.includes(' std::string nextStage; bool isPreview=false;'));
  assert.throws(()=>patchFinishBattle(patched),/ALREADY_PATCHED/);
  const game=patchOutcomeGame('#include "Timer.h"\n\t\t\tnativeActive->think();\n\t\t\t\t\tbanner->close();');
  assert.ok(game.includes('NativeOutcome::finished()'));
  assert.ok(game.indexOf('nativeActive->think();')<game.indexOf('NativeOutcome::finished()'));
  assert.equal((game.match(/NativeOutcome::finished\(\)/g)||[]).length,2);
  assert.ok(game.indexOf('banner->close();')<game.lastIndexOf('NativeOutcome::finished()'));
  assert.throws(()=>patchOutcomeGame(game),/ALREADY_PATCHED/);
});
test('unverified native execution requires explicit opt-in',()=>{
  assert.throws(()=>preflight({},'linux'),/NATIVE_PARITY_NOT_CERTIFIED/);
});
test('Windows source PC cannot become an accidental battle execution fallback',()=>{
  assert.throws(()=>preflight({'--experimental':true},'win32'),/GPT_LINUX_EXECUTION_REQUIRED/);
});
test('unknown options and duplicates fail closed',()=>{
  assert.throws(()=>parseArgs(['--runs','5000']),/UNSUPPORTED/);
  assert.throws(()=>parseArgs(['--seed','1','--seed','2']),/DUPLICATE/);
  assert.throws(()=>parseArgs(['--binary']),/MISSING/);
  assert.equal(parseArgs(['--experimental','--seed','123'])['--seed'],'123');
});
test('source archive and every expected native source file match the lock',()=>{
  const lock=JSON.parse(fs.readFileSync(path.join(ROOT,'native/source.lock.json'),'utf8'));
  const archive=path.join(ROOT,'native/oxce-source.tar.gz');
  assert.equal(sha256(fs.readFileSync(archive)),lock.archiveSha256);
  assert.equal(fs.statSync(archive).size,lock.archiveBytes);
  // Git for Windows may check out the text header with CRLF. Pin its LF-normalized source bytes.
  const driver=fs.readFileSync(path.join(ROOT,'native/ReplayDriver.h'),'utf8').replace(/\r\n/g,'\n');
  assert.equal(sha256(Buffer.from(driver)),lock.driverSha256);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-integrity-'));
  try{
    const r=spawnSync('tar',['-xzf','native/oxce-source.tar.gz','-C',temp],{encoding:'utf8',cwd:ROOT});
    assert.equal(r.status,0,r.stderr);
    const m=JSON.parse(fs.readFileSync(path.join(temp,'native-source-manifest.json'),'utf8'));
    assert.equal(m.sourceTreeSha256,lock.sourceTreeSha256);
    assert.equal(Object.keys(m.sourceFiles).length,lock.originalSourceFiles);
    verifySource(temp,m);
    for(const f of ['src/Battlescape/AIModule.cpp','src/Battlescape/TileEngine.cpp','src/Battlescape/Pathfinding.cpp','src/Savegame/BattleUnit.cpp','src/Savegame/BattleItem.cpp','src/Engine/RNG.cpp']){
      assert.equal(sha256(fs.readFileSync(path.join(temp,f))),m.sourceFiles[f]);
      assert.equal(Object.hasOwn(m.patchedFiles,f),false,'Combat algorithm was modified: '+f);
    }
    fs.appendFileSync(path.join(temp,'src/Engine/RNG.cpp'),'\n// tamper\n');
    assert.throws(()=>verifySource(temp,m),/SOURCE_FILE_HASH_MISMATCH/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('explicit authoritative src overlay is fingerprinted without changing either original tree',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-overlay-'));
  const base=path.join(temp,'base'),overlay=path.join(temp,'overlay'),out=path.join(temp,'prepared');
  const fixture={
    'CMakeLists.txt':'# build fixture only\n','LICENSE.txt':'test fixture\n',
    'src/Battlescape/BattlescapeGame.cpp':'\nnamespace OpenXcom\n{\nint BattlescapeGame::think()\n{\n return -1;\n}\n}\n',
    'src/Engine/Game.cpp':'\t\t// Process rendering\nrender();\n',
    'src/Engine/RNG.cpp':'// base RNG fixture\n'
  };
  try{
    for(const [p,text] of Object.entries(fixture)){
      const dest=path.join(base,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);
    }
    fs.mkdirSync(path.join(overlay,'src/Engine'),{recursive:true});
    fs.writeFileSync(path.join(overlay,'src/Engine/RNG.cpp'),'// authoritative RNG fixture\n');
    const m=prepare(base,out,overlay);
    assert.equal(m.sourceOverlayApplied,true);
    assert.deepEqual(m.overlayFiles,['src/Engine/RNG.cpp']);
    assert.equal(fs.readFileSync(path.join(base,'src/Engine/RNG.cpp'),'utf8'),fixture['src/Engine/RNG.cpp']);
    assert.equal(fs.readFileSync(path.join(out,'src/Engine/RNG.cpp'),'utf8'),'// authoritative RNG fixture\n');
    verifySource(out,m);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('source-only build stages empty resource folders without inventing game data',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-packaging-'));
  try{
    prepareBuildAssetDirectories(temp);
    prepareBuildAssetDirectories(temp);
    for(const name of ['TFTD','UFO','common','standard'])
      assert.deepEqual(fs.readdirSync(path.join(temp,'bin',name)),[]);
    assert.deepEqual(fs.readdirSync(temp),['bin']);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('offline SDL runtime validates every library hash and rejects tampering',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-runtime-integrity-'));
  const names=['libSDL-1.2.so.0','libSDL_image-1.2.so.0','libSDL_gfx.so.15','libSDL_mixer-1.2.so.0'];
  try{
    fs.mkdirSync(path.join(dir,'lib'));
    const m={schema:1,purpose:'ORIGINAL_SDL_RUNTIME_ONLY',arch:'x86_64',libraries:{}};
    for(const name of names){const b=Buffer.from('hash fixture only; not executable: '+name);fs.writeFileSync(path.join(dir,'lib',name),b);m.libraries[name]={sha256:sha256(b)};}
    fs.writeFileSync(path.join(dir,'runtime-manifest.json'),JSON.stringify(m));
    const runtime=verifyRuntime(dir);
    assert.match(runtime.manifestSha256,/^[a-f0-9]{64}$/);
    fs.appendFileSync(path.join(dir,'lib',names[0]),'tamper');
    assert.throws(()=>verifyRuntime(dir),/RUNTIME_LIBRARY_HASH_MISMATCH/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native comparison rejects different binary, adapter archive, plan or RNG inputs',()=>{
  const a={backend:'OXCE_NATIVE',planCompleted:true,seed:'PRESERVE_SAVE_RNG',runtimeManifestSha256:null,display:'dummy',checkpoints:[{phase:'final',turn:2,side:0,rng:'18446744073709551615',command_index:2,snapshotSha256:'b'.repeat(64)}]};
  const fields=['sourceTreeSha256','driverSha256','archiveSha256','clockPatchSha256','outcomePatchSha256','binarySha256','planSha256','configSha256','inputSaveSha256'];
  for(const k of fields)a[k]='a'.repeat(64);
  assert.equal(compare(a,structuredClone(a)).nativeReplayIdentical,true);
  for(const k of fields){const b=structuredClone(a);b[k]='c'.repeat(64);assert.throws(()=>compare(a,b),/INCOMPARABLE_INPUT/);delete b[k];assert.throws(()=>compare(a,b),/REPLAY_FINGERPRINT_MISSING/);}
  const b=structuredClone(a);b.seed='1';assert.throws(()=>compare(a,b),/INCOMPARABLE_INPUT: seed/);
  b.seed=a.seed;b.checkpoints[0].rng='18446744073709551614';assert.equal(compare(a,b).nativeReplayIdentical,false);
});
test('native driver forwards commands and never generates outcome probabilities',()=>{
  const code=fs.readFileSync(path.join(ROOT,'native/ReplayDriver.h'),'utf8');
  for(const x of ['game->primaryAction(target)','game->requestEndTurn(false)','RNG::getSeed()','getGeoscapeSave()->save'])assert.ok(code.includes(x),x);
  for(const x of ['xorshift','std::mt19937','winRate','resolveFire','meanDeaths'])assert.equal(code.includes(x),false,x);
});
