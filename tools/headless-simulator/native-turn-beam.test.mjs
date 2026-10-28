// SPDX-License-Identifier: GPL-3.0-or-later
// Orchestration/validation unit tests; NOT a combat simulator or native win.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compareNativeSafety,dedupeAndRankNativeNodes,parseNativeBeamArgs,
  runNativeBeam,NATIVE_BEAM_MODE} from './native-turn-beam.mjs';

const score=(dead,unconscious,control,hp,stun)=>({
  dead,unconscious,lostControl:control,netHpLoss:hp,netStunIncrease:stun
});
test('beam sort prefers original ally survival over HP or turn count',()=>{
  assert.ok(compareNativeSafety(score(0,0,0,47,3),score(1,0,0,0,0))<0);
  assert.ok(compareNativeSafety(score(0,0,0,47,3),score(0,1,0,0,0))<0);
  assert.ok(compareNativeSafety(score(0,0,0,47,3),score(0,0,1,0,0))<0);
  assert.ok(compareNativeSafety(score(0,0,0,47,3),score(0,0,0,200,0))<0);
  assert.ok(compareNativeSafety(score(0,0,0,47,0),score(0,0,0,47,5))<0);
  assert.equal(compareNativeSafety(score(0,0,0,47,3),score(0,0,0,47,3)),0);
  assert.throws(()=>compareNativeSafety({dead:0},{dead:0}),/INVALID_NATIVE_SCORE/);
});
test('beam retains only distinct ACTUAL native checkpoint hashes',()=>{
  const a={id:'a',snapshotSha256:'a'.repeat(64),score:score(0,0,0,47,0),trail:['a']};
  const b={id:'b',snapshotSha256:'a'.repeat(64),score:score(0,0,0,99,0),trail:['b']};
  const c={id:'c',snapshotSha256:'c'.repeat(64),score:score(0,0,0,80,0),trail:['c']};
  const d={id:'d',snapshotSha256:'d'.repeat(64),score:score(1,0,0,0,0),trail:['d']};
  assert.deepEqual(dedupeAndRankNativeNodes([d,b,c,a],2).map(x=>x.id),['a','c']);
  assert.throws(()=>dedupeAndRankNativeNodes([{...a,snapshotSha256:'bad'}],3),/INVALID_NATIVE_CHECKPOINT_HASH/);
});
test('beam CLI preserves input save RNG and cannot select numerical approximation',()=>{
  const p=parseNativeBeamArgs(['--experimental','--save','turn2.sav',
    '--binary','binary','--manifest','manifest','--data','data','--user','user',
    '--config','config','--out','output','--depth','3','--width','2',
    '--candidates','64','--focus','1','--supports','12,19,33','--max-trials','300',
    '--baseline-save','original3.sav']);
  assert.equal(p.cfg.depth,3);
  assert.equal(p.cfg.width,2);
  assert.equal(p.cfg.candidates,64);
  assert.equal(p.cfg.maxTrials,300);
  assert.equal(p.cfg.baselineSave,'original3.sav');
  assert.deepEqual(p.cfg.supportIds,[12,19,33]);
  assert.equal(p.args['--seed'],undefined);
  assert.equal(NATIVE_BEAM_MODE,'ORIGINAL_OXCE_ACTUAL_SAVE_ONLY');
  for(const args of [
    ['--out','dest','--depth','0'],
    ['--out','dest','--width','0'],
    ['--out','dest','--candidates','2001'],
    ['--out','dest','--max-trials','10001'],
    ['--out','dest','--seed','1'],
    ['--out','dest','--plan','fake.actions'],
    ['--out','dest','--supports','1,1'],
    ['--out','dest','--experimental']
  ])assert.throws(()=>parseNativeBeamArgs(args));
});
test('native beam cannot execute a battle on the Windows source computer',async()=>{
  if(process.platform==='win32')
    await assert.rejects(()=>runNativeBeam({}),/GPT_LINUX_NATIVE_EXECUTION_REQUIRED/);
});
