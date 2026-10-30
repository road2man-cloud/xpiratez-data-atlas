// SPDX-License-Identifier: GPL-3.0-or-later
// This suite tests conversation protocol and factual native-checkpoint scoring.
// It does not claim to execute OXCE battles or certify GUI parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeRequest,actionLine,scoreNativeCheckpoints,runDialogueBatch,fingerprintGameResources,newPlanTotals,recordNativeTrial,summarizeTotals} from './chat-batch.mjs';

const request=()=>({
  schema:1,backend:'OXCE_NATIVE',
  native:{binary:'/runtime/oxce-native',manifest:'/runtime/native-build.json',
    data:'/game/data',user:'/game/user',config:'/game/options.cfg',save:'/game/5__.sav',
    fixedClock:true,experimentalAcknowledged:true},
  output:'/work/results-new',
  plans:[
    {id:'fire-aimed',actions:[
      {op:'observe'}, {op:'kneel',unitId:9},
      {op:'fire',unitId:9,itemId:115,mode:'aimed',target:{x:12,y:3,z:1}},
      {op:'end_turn'},{op:'stop'}
    ]}
  ],
  sampling:{runsPerPlan:1000,firstSeed:'1234567890'}
});
test('generates native commands without calculating battle results',()=>{
  const q=normalizeRequest(request());
  assert.equal(q.plans.length,1);
  assert.equal(q.count,1000);
  assert.equal(q.firstSeed,'1234567890');
  assert.equal(q.engine['--fixed-clock'],true);
  assert.equal(q.engine['--experimental'],true);
  assert.equal(q.plans[0].text,'observe\nkneel 9\nfire 9 115 aimed 12 3 1\nend_turn\nstop\n');
  assert.match(q.plans[0].sha256,/^[a-f0-9]{64}$/);
});
test('rejects unsupported commands, malformed fields and hidden extra instructions',()=>{
  assert.throws(()=>actionLine({op:'teleport',unitId:9}),/UNSUPPORTED_ACTION/);
  assert.throws(()=>actionLine({op:'fire',unitId:9,itemId:10,mode:'burst',target:{x:1,y:2,z:3}}),/FIRE_MODE/);
  assert.throws(()=>actionLine({op:'kneel',unitId:9,damageMultiplier:400}),/UNKNOWN_FIELD/);
  assert.throws(()=>actionLine({op:'move',unitId:1,target:{x:-2,y:0,z:0}}),/INVALID_COORDINATE/);
  assert.throws(()=>actionLine({op:'observe',special:'cheat'}),/UNKNOWN_FIELD/);
  assert.throws(()=>actionLine({op:'fire',unitId:1,itemId:2,mode:'snap',target:{x:1,y:2,z:3},raw:'\nstop'}),/UNKNOWN_FIELD/);
});
test('rejects imaginary or misleading Monte Carlo sample requests',()=>{
  const a=request();
  a.sampling={runsPerPlan:10001,firstSeed:'1'};
  assert.throws(()=>normalizeRequest(a),/INVALID_SAMPLE_COUNT/);
  a.sampling={runsPerPlan:1000};
  assert.throws(()=>normalizeRequest(a),/MULTIPLE_RUNS_REQUIRE_SEED/);
  a.sampling={runsPerPlan:1000,firstSeed:'18446744073709551615'};
  assert.throws(()=>normalizeRequest(a),/SEED_OVERFLOW/);
  a.sampling={runsPerPlan:1,firstSeed:'0'};
  assert.throws(()=>normalizeRequest(a),/INVALID_UINT64_START_SEED/);
  a.sampling={runsPerPlan:1,firstSeed:'11'};
  a.plans[0].id='../../evil';
  assert.throws(()=>normalizeRequest(a),/INVALID_OR_DUPLICATE_PLAN_ID/);
});
test('experimental native adapter requires explicit acknowledgment',()=>{
  const a=request();delete a.native.experimentalAcknowledged;
  assert.throws(()=>normalizeRequest(a),/EXPLICIT_NATIVE_EXPERIMENTAL_ACKNOWLEDGMENT_REQUIRED/);
});
test('one plan uses the save RNG unless an explicit first seed is specified',()=>{
  const a=request();
  a.sampling={runsPerPlan:1};
  const n=normalizeRequest(a);
  assert.equal(n.firstSeed,null);
  assert.equal(n.count,1);
});
test('stop cannot conceal arbitrary subsequent commands',()=>{
  const a=request();
  a.plans[0].actions=[{op:'stop'},{op:'end_turn'}];
  assert.throws(()=>normalizeRequest(a),/STOP_MUST_BE_LAST/);
  a.plans[0].actions=[{op:'stop'},{op:'stop'}];
  assert.throws(()=>normalizeRequest(a),/STOP_MUST_BE_LAST/);
});
test('native checkpoints produce exact reported state deltas, not victory claims',()=>{
  const units=[
    {id:1,faction:0,health:100,status:0,position:[1,2,0]},
    {id:99,faction:1,health:80,status:0,position:[8,9,0]},
    {id:78,faction:2,health:70,status:0,position:[8,0,0]}
  ];
  const final=[
    {id:1,faction:0,health:72,status:0,position:[2,2,0]},
    {id:99,faction:1,health:0,status:6,position:[8,9,0]},
    {id:78,faction:2,health:70,status:0,position:[8,0,0]}
  ];
  const observed=scoreNativeCheckpoints([
    {turn:3,side:0,rng:'100',units},
    {turn:3,side:0,rng:'200',units:final}
  ]);
  assert.equal(observed.playerHpLost,28);
  assert.equal(observed.hostileHpLost,80);
  assert.equal(observed.hostileHpAtOrBelowZero,1);
  assert.equal(observed.kind,'NATIVE_CHECKPOINT_STATE_DELTA_NOT_VICTORY');
  assert.equal(observed.unitChanges.length,2);
  assert.equal(Object.hasOwn(observed,'winProbability'),false);
});
test('missing or duplicated unit evidence is rejected',()=>{
  const a={id:1,faction:0,health:100,status:0,position:[0,0,0]};
  assert.throws(()=>scoreNativeCheckpoints([{units:[a,a]},{units:[a]}]),/INVALID_INITIAL_UNIT_ID/);
  assert.throws(()=>scoreNativeCheckpoints([{units:[a]},{units:[]}]),/MISSING_NATIVE_UNIT/);
  assert.throws(()=>scoreNativeCheckpoints([{units:[a]}]),/NATIVE_CHECKPOINTS_REQUIRED/);
});
test('ten-thousand-trial tallies count only native completed results',()=>{
  const totals=newPlanTotals([{id:'A'},{id:'B'}],10000);
  recordNativeTrial(totals,{plan:'A',status:'completed',observation:{playerHpLost:12,hostileHpLost:50,playerHpAtOrBelowZero:0}});
  recordNativeTrial(totals,{plan:'A',status:'error'});
  recordNativeTrial(totals,{plan:'B',status:'completed',observation:{playerHpLost:20,hostileHpLost:70,playerHpAtOrBelowZero:1}});
  const sum=summarizeTotals(totals);
  assert.deepEqual(sum.map(x=>[x.planned,x.attempted,x.completed,x.failed]),[[10000,2,1,1],[10000,1,1,0]]);
  assert.equal(sum[0].meanPlayerHpLost,12);
  assert.equal(sum[0].nativeWins,'UNOBSERVABLE_IN_THIS_ADAPTER');
  assert.equal(sum[1].playerHpNonpositiveObserved,1);
  assert.throws(()=>recordNativeTrial(totals,{plan:'missing',status:'error'}),/UNKNOWN_TRIAL_PLAN/);
});
test('game resources are hashed from bytes and detect real modifications',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-resources-'));
  try{
    const data=path.join(root,'data'),user=path.join(root,'user');
    fs.mkdirSync(path.join(data,'Ruleset'),{recursive:true});fs.mkdirSync(user);
    const file=path.join(data,'Ruleset','Combat.rul');fs.writeFileSync(file,'value: 123\n');
    const args={'--data':data,'--user':user};
    const first=await fingerprintGameResources(args);
    assert.equal(first.files,1);assert.equal(first.bytes,11);
    const repeat=await fingerprintGameResources(args);
    assert.equal(first.sha256,repeat.sha256);
    fs.writeFileSync(file,'value: 124\n');
    const changed=await fingerprintGameResources(args);
    assert.notEqual(first.sha256,changed.sha256);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Windows native engine is blocked without explicit Windows experimental gate',async()=>{
  if(process.platform==='win32')
    await assert.rejects(()=>runDialogueBatch(request()),/NATIVE_PLATFORM_NOT_AUTHORIZED/);
  const a=request();a.native.experimentalWindows=true;
  assert.equal(normalizeRequest(a).engine['--experimental-windows'],true);
});
