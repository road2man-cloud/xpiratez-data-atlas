// SPDX-License-Identifier: GPL-3.0-or-later
// Orchestration/validation unit tests; NOT a combat simulator or native win.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compareNativeSafety,dedupeAndRankNativeNodes,parseNativeBeamArgs,
  observedNativeEnemyProgress,runNativeBeam,NATIVE_BEAM_MODE} from './native-turn-beam.mjs';

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
test('enemy progress only counts unit outcomes OBSERVED in OXCE checkpoint',()=>{
  const original=[
    {id:1,originalFaction:0,faction:0,health:240},
    {id:1000024,originalFaction:1,faction:1,health:96},
    {id:1000025,originalFaction:1,faction:1,health:96},
    {id:1000001,originalFaction:1,faction:1,health:90}
  ];
  const checkpoint={units:[
    {id:1,faction:0,status:0,health:193,stun:0},
    {id:1000024,faction:1,status:6,health:0,stun:0},
    {id:1000025,faction:1,status:0,health:55,stun:0},
    // Missing enemy 1000001 is explicitly UNKNOWN, not assumed killed.
  ]};
  const p=observedNativeEnemyProgress(original,checkpoint);
  assert.equal(p.originalEnemyCount,3);
  assert.equal(p.observedEnemyNeutralized,1);
  assert.equal(p.observedEnemyHpLoss,96+41);
  assert.equal(p.unresolvedEnemyCount,1);
  assert.equal(p.progressSource,'ORIGINAL_OXCE_UNIT_CHECKPOINT_NOT_A_SIMULATION');
  const hidden=observedNativeEnemyProgress(original,{units:[checkpoint.units[0]]});
  assert.equal(hidden.observedEnemyNeutralized,0);
  assert.equal(hidden.unresolvedEnemyCount,3);
  assert.throws(()=>observedNativeEnemyProgress(original,{units:[
    checkpoint.units[0],checkpoint.units[0]
  ]}),/INVALID_NATIVE_ENEMY_CHECKPOINT/);
});
test('beam retains one aggressive native progress state without sacrificing an ally',()=>{
  const p=(dead,hp,neutral,enemyHp)=>({
    id:String(hp)+'-'+String(neutral),snapshotSha256:String(neutral+hp+dead).padStart(64,'b'),
    score:score(dead,0,0,hp,0),trail:['plan'],
    enemyProgress:{unresolvedEnemyCount:0,observedEnemyNeutralized:neutral,observedEnemyHpLoss:enemyHp}
  });
  // Snapshot IDs must be valid hex, and distinct.
  const safe=p(0,47,0,0),other=p(0,50,0,5),attack=p(0,72,2,120);
  const casualty=p(1,0,20,700);
  const selected=dedupeAndRankNativeNodes([safe,other,attack,casualty],2);
  assert.deepEqual(selected.map(x=>x.id),[safe.id,attack.id]);
  assert.ok(selected.every(x=>x.score.dead===0));
  assert.deepEqual(dedupeAndRankNativeNodes([safe,attack],1).map(x=>x.id),[safe.id]);
});
test('beam CLI preserves input save RNG and cannot select numerical approximation',()=>{
  const p=parseNativeBeamArgs(['--experimental','--save','turn2.sav',
    '--binary','binary','--manifest','manifest','--data','data','--user','user',
    '--config','config','--out','output','--depth','3','--width','2',
    '--candidates','64','--focus','1','--supports','12,19,33','--max-trials','300',
    '--baseline-save','original3.sav','--pairs','40']);
  assert.equal(p.cfg.depth,3);
  assert.equal(p.cfg.width,2);
  assert.equal(p.cfg.candidates,64);
  assert.equal(p.cfg.maxTrials,300);
  assert.equal(p.cfg.pairActions,40);
  assert.equal(p.cfg.baselineSave,'original3.sav');
  assert.deepEqual(p.cfg.supportIds,[12,19,33]);
  assert.equal(p.args['--seed'],undefined);
  assert.equal(NATIVE_BEAM_MODE,'ORIGINAL_OXCE_ACTUAL_SAVE_ONLY');
  for(const args of [
    ['--out','dest','--depth','0'],
    ['--out','dest','--width','0'],
    ['--out','dest','--candidates','2001'],
    ['--out','dest','--pairs','1001'],
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
