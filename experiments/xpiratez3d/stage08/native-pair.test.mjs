// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBuildPair} from './build-paired.mjs';
import {compareControlAndObserver} from './compare-paired.mjs';
const hash=c=>c.repeat(64);
function fixture(){
  const controlBuild={
    schema:1,backend:'OXCE_NATIVE',parityCertified:false,
    sourceTreeSha256:hash('a'),archiveSha256:hash('b'),clockAdapterSha256:hash('c'),
    fixedClockPolicy:'fixed-1ms-v1',platform:'linux',arch:'x64',
    driverSha256:hash('d'),binarySha256:hash('e')};
  const observedBuild={...controlBuild,driverSha256:hash('f'),binarySha256:hash('0'),
    impactInstrumentationSha256:hash('1'),
    impactInstrumentation:{schema:'xpz3d-original-tileengine-hit-v1',
      defaultEnabled:false,observerFlag:'XPZ_NATIVE_IMPACT_TRACE=1',
      baseDriverSha256:hash('d')}
  };
  const result={
    backend:'OXCE_NATIVE',planCompleted:true,parityCertified:false,
    battleVictoryCertified:false,sourceTreeSha256:hash('a'),archiveSha256:hash('b'),
    clockAdapterSha256:hash('c'),clockPolicy:'fixed-1ms-v1',
    planSha256:hash('2'),configSha256:hash('3'),inputSaveSha256:hash('4'),
    driverSha256:hash('d'),binarySha256:hash('e'),seed:'PRESERVE_SAVE_RNG',
    checkpoints:[{phase:'initial',turn:1,side:0,rng:'42',command_index:0,
      snapshotSha256:hash('5')},{phase:'after_action',turn:1,side:0,rng:'99',
      command_index:1,snapshotSha256:hash('6')},
      {phase:'final',turn:1,side:0,rng:'99',command_index:1,snapshotSha256:hash('6')}]
  };
  const observed={...structuredClone(result),driverSha256:hash('f'),binarySha256:hash('0')};
  return {controlBuild,observedBuild,control:result,observed};
}
const valid=(f=fixture(),option={requireImpact:true,impacts:1})=>
  compareControlAndObserver(f.controlBuild,f.observedBuild,f.control,f.observed,option);
test('synthetic metadata contract is not itself gameplay parity',()=>{
  const r=valid();
  assert.equal(r.nativeBattleStateBitwiseIdentical,true);
  assert.equal(r.interactiveParityCertified,false);
  assert.equal(r.battleVictoryCertified,false);
  assert.equal(r.actualNativeRunRequired,true);
});
test('must build different actual OXCE binaries',()=>{
  const f=fixture();f.observedBuild.binarySha256=f.controlBuild.binarySha256;
  assert.throws(()=>valid(f),/INSTRUMENTED_BINARY_NOT_DISTINCT/);
});
test('observer must be off unless explicitly enabled',()=>{
  const f=fixture();f.observedBuild.impactInstrumentation.defaultEnabled=true;
  assert.throws(()=>valid(f),/OBSERVER_MUST_DEFAULT_OFF/);
});
test('reject missing impact data when real shot gate is requested',()=>{
  assert.throws(()=>valid(fixture(),{requireImpact:true,impacts:0}),/REQUIRED_ACTUAL_HIT_EVENT_MISSING/);
});
test('reject control/observer plan difference even if checkpoint matches',()=>{
  const f=fixture();f.observed.planSha256=hash('7');
  assert.throws(()=>valid(f),/INPUT_DIFFERENCE_planSha256/);
});
test('reject source code difference beyond allowed observer changes',()=>{
  const f=fixture();f.observedBuild.sourceTreeSha256=hash('9');
  assert.throws(()=>valid(f),/DIFFERENT_NATIVE_INPUT: sourceTreeSha256/);
});
test('reject missing source file or binary identity hashes',()=>{
  const f=fixture();delete f.observed.binarySha256;
  assert.throws(()=>valid(f),/MISSING_HASH_binarySha256/);
});
test('reject incomplete execution result',()=>{
  const f=fixture();f.control.planCompleted=false;
  assert.throws(()=>valid(f),/INCOMPLETE_NATIVE_RUN/);
});
test('report a changed native RNG state as actual parity failure',()=>{
  const f=fixture();f.observed.checkpoints[1].rng='100';
  const out=valid(f);
  assert.equal(out.nativeBattleStateBitwiseIdentical,false);
  assert.ok(out.differences.some(x=>x.key==='rng'));
});
test('report a changed full save hash as actual parity failure',()=>{
  const f=fixture();f.observed.checkpoints[2].snapshotSha256=hash('8');
  const out=valid(f);
  assert.equal(out.nativeBattleStateBitwiseIdentical,false);
  assert.deepEqual(out.differences[0].key,'snapshotSha256');
});
test('reject changing or removing the native fixed time clock',()=>{
  const f=fixture();f.observed.clockPolicy='wall-clock';
  assert.throws(()=>valid(f),/REQUIRES_FIXED_CLOCK/);
  const x=fixture();x.observedBuild.fixedClockPolicy='wall-clock';
  assert.throws(()=>valid(x),/DIFFERENT_NATIVE_INPUT: fixedClockPolicy/);
});
test('reject untraceable observer driver patch',()=>{
  const f=fixture();f.observedBuild.impactInstrumentation.baseDriverSha256=hash('a');
  assert.throws(()=>valid(f),/UNTRACKED_DRIVER_CHANGE/);
});
test('reject claimed gameplay win or parity certification',()=>{
  const f=fixture();f.observed.battleVictoryCertified=true;
  assert.throws(()=>valid(f),/PREMATURE_CERTIFICATION/);
});
test('reject checkpoint removal even with correct provenance',()=>{
  const f=fixture();f.observed.checkpoints.pop();
  assert.throws(()=>valid(f),/CHECKPOINT_COUNT_DIFFERENCE/);
});
test('reject missing native checkpoint SHA',()=>{
  const f=fixture();delete f.observed.checkpoints[1].snapshotSha256;
  assert.throws(()=>valid(f),/CHECKPOINT_1_MISSING_snapshotSha256/);
});
