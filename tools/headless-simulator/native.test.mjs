// SPDX-License-Identifier: GPL-3.0-or-later
// Adapter integrity tests. These are NOT combat/parity/success-rate tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {patchBattle,patchGame,sha256} from './prepare-native.mjs';
import {parseArgs,preflight} from './run-native.mjs';
import {verifySource,prepareBuildAssetDirectories} from './build-native.mjs';
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
  assert.ok(patched.includes('_states.back()->think();'));
  assert.ok(patched.includes('original_render_body();'));
  assert.throws(()=>patchGame(patched),/ALREADY_PATCHED/);
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
  assert.equal(sha256(fs.readFileSync(path.join(ROOT,'native/ReplayDriver.h'))),lock.driverSha256);
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
test('native driver forwards commands and never generates outcome probabilities',()=>{
  const code=fs.readFileSync(path.join(ROOT,'native/ReplayDriver.h'),'utf8');
  for(const x of ['game->primaryAction(target)','game->requestEndTurn(false)','RNG::getSeed()','getGeoscapeSave()->save'])assert.ok(code.includes(x),x);
  for(const x of ['xorshift','std::mt19937','winRate','resolveFire','meanDeaths'])assert.equal(code.includes(x),false,x);
});
