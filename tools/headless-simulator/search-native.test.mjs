// SPDX-License-Identifier: GPL-3.0-or-later
// These are parser/scoring/launch guard fixtures, NOT battle simulations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseBatchArgs,listPlans,parseBattleUnits,scoreNativeTerminal,scoreNativeCheckpoint,betterNativeScore,runNativeBatch} from './search-native.mjs';
const fakeUnits=(hp,status=0,stun=0)=>[
  '---','battleGame:','  units:',
  '    - id: 1','      faction: 0',`      status: ${status}`, `      health: ${hp}`, `      stunlevel: ${stun}`,
  '    - id: 1000014','      faction: 1','      status: 0','      health: 70','      stunlevel: 0',
  '  items:','    - id: 55'
].join('\n');

test('batch requires explicit plans and seeds; cannot be mistaken for old --runs',()=>{
  assert.throws(()=>parseBatchArgs(['--runs','5000']),/REQUIRED_ARGUMENT: --plans/);
  const b=parseBatchArgs(['--plans','my-plans','--count','5000','--start-seed','123','--experimental','--out','dest']);
  assert.equal(b.count,5000);assert.equal(b.startSeed,123n);
  assert.equal(b.args['--experimental'],true);assert.equal(b.args['--out'],'dest');
  assert.throws(()=>parseBatchArgs(['--plans','p','--count','5000','--out','o']),/MULTIPLE_TRIALS/);
  assert.throws(()=>parseBatchArgs(['--plans','p','--count','10001','--start-seed','1','--out','o']),/COUNT/);
  assert.throws(()=>parseBatchArgs(['--plans','p','--count','2','--start-seed','18446744073709551615','--out','o']),/OVERFLOW/);
  assert.throws(()=>parseBatchArgs(['--plans','p','--seed','1','--out','o']),/PLAN_AND_SEED/);
  assert.throws(()=>parseBatchArgs(['--plans','p','--plan','policy.actions','--out','o']),/PLAN_AND_SEED/);
  assert.throws(()=>parseBatchArgs(['--plans','p','--count','2','--count','3','--out','o']),/DUPLICATE/);
});
test('only regular explicit action plans are accepted',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-action-plans-'));
  try {
    fs.writeFileSync(path.join(root,'b.actions'),'observe\nstop\n');
    fs.writeFileSync(path.join(root,'a.actions'),'observe\nend_turn\nstop\n');
    fs.writeFileSync(path.join(root,'ignored.txt'),'none');
    const plans=listPlans(root);
    assert.deepEqual(plans.map(x=>x.name),['a.actions','b.actions']);
    assert.ok(plans.every(x=>x.sha256.length===64));
    fs.writeFileSync(path.join(root,'blank.actions'),'');
    assert.throws(()=>listPlans(root),/INVALID_PLAN_SIZE/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('unit metadata is read from literal full OXCE save, without simulating',()=>{
  const units=parseBattleUnits(fakeUnits(240));
  assert.equal(units.length,2);assert.deepEqual(units[0],{id:1,faction:0,status:0,health:240,stunlevel:0,originalFaction:0});
  assert.throws(()=>parseBattleUnits('---\n  items:\n'),/MISSING_OR_AMBIGUOUS/);
  assert.throws(()=>parseBattleUnits(fakeUnits(240).replace('      health: 240\n','')),/INCOMPLETE_BATTLE_UNIT/);
});
test('zero-death native wins depend on engine finish outcome not enemy count',()=>{
  const initial=parseBattleUnits(fakeUnits(240)),after=parseBattleUnits(fakeUnits(87,0,61));
  const won=scoreNativeTerminal(initial,after,'WON');
  assert.equal(won.netHpLoss,153);
  assert.equal(won.dead,0);
  assert.equal(won.zeroDeathNativeWin,true);
  assert.equal(won.zeroHpLossNativeWin,false);
  assert.equal(won.battleVictoryCertified,false);
  const unfinished=scoreNativeTerminal(initial,after,'NEXT_STAGE');
  assert.equal(unfinished.zeroDeathNativeWin,false);
  assert.throws(()=>scoreNativeTerminal(initial,after,'UNFINISHED'),/OUTCOME_REQUIRED/);
});
test('unconscious is not automatically dead; death is scored separately',()=>{
  const initial=parseBattleUnits(fakeUnits(240));
  const stunned=scoreNativeTerminal(initial,parseBattleUnits(fakeUnits(87,7,89)),'WON');
  assert.equal(stunned.dead,0);assert.equal(stunned.unconscious,1);
  const killed=scoreNativeTerminal(initial,parseBattleUnits(fakeUnits(0,6,0)),'WON');
  assert.equal(killed.dead,1);assert.equal(killed.zeroDeathNativeWin,false);
  assert.throws(()=>scoreNativeTerminal(initial,parseBattleUnits(fakeUnits(240,10,0)),'WON'),/AMBIGUOUS_PLAYER_TERMINAL_STATUS/);
});
test('missing original player cannot be scored as zero casualties',()=>{
  const initial=parseBattleUnits(fakeUnits(240));
  assert.throws(()=>scoreNativeTerminal(initial,parseBattleUnits(fakeUnits(240).replace('    - id: 1','    - id: 2')),'WON'),/ORIGINAL_PLAYER_UNIT_MISSING/);
});
test('mind-controlled ORIGINAL ally remains in casualty denominator',()=>{
  const original= fakeUnits(240).replace('      faction: 0\n      status: 0',
    '      faction: 1\n      originalFaction: 0\n      status: 0');
  const initial=parseBattleUnits(original);
  assert.equal(initial[0].originalFaction,0);
  const after=parseBattleUnits(fakeUnits(240));
  const score=scoreNativeTerminal(initial,after,'WON');
  assert.equal(score.initialAllies,1);
  assert.equal(score.lostControl,0);
  assert.equal(score.zeroConsciousNativeWin,true);
  const stillControlled=scoreNativeTerminal(initial,initial,'WON');
  assert.equal(stillControlled.lostControl,1);
  assert.equal(stillControlled.zeroConsciousNativeWin,false);
  assert.equal(stillControlled.zeroDeathNativeWin,true);
  const hostileTemporarilyControlled=fakeUnits(240).replace(
    '      faction: 1\n      status: 0',
    '      faction: 0\n      originalFaction: 1\n      status: 0');
  assert.equal(scoreNativeTerminal(parseBattleUnits(hostileTemporarilyControlled),
    parseBattleUnits(hostileTemporarilyControlled),'WON').initialAllies,1);
});
test('full intact win requires no new stun or unconsciousness',()=>{
  const start=parseBattleUnits(fakeUnits(240));
  const stunned=scoreNativeTerminal(start,parseBattleUnits(fakeUnits(240,0,3)),'WON');
  assert.equal(stunned.netHpLoss,0);
  assert.equal(stunned.netStunIncrease,3);
  assert.equal(stunned.zeroHpLossNativeWin,true);
  assert.equal(stunned.zeroNetHpAndStunLossNativeWin,false);
  const unconscious=scoreNativeTerminal(start,parseBattleUnits(fakeUnits(240,7,3)),'WON');
  assert.equal(unconscious.zeroConsciousNativeWin,false);
  assert.equal(unconscious.zeroNetHpAndStunLossNativeWin,false);
  const intact=scoreNativeTerminal(start,start,'WON');
  assert.equal(intact.zeroNetHpAndStunLossNativeWin,true);
});
test('native ranking prioritizes original-team safety above HP',()=>{
  const best={dead:0,unconscious:0,lostControl:1,netHpLoss:0,netStunIncrease:0};
  const candidate={dead:0,unconscious:0,lostControl:0,netHpLoss:90,netStunIncrease:1};
  assert.equal(betterNativeScore(candidate,best),true);
  assert.equal(betterNativeScore(best,candidate),false);
  assert.equal(betterNativeScore(candidate,null),true);
  assert.equal(betterNativeScore(candidate,candidate),false);
  assert.throws(()=>betterNativeScore({dead:0},{dead:0}),/INVALID_NATIVE_RANKING_SCORE/);
});
test('first-turn ranking reads original native checkpoint only, never implies battle victory',()=>{
  const original=parseBattleUnits(fakeUnits(240));
  const sample={phase:'final',turn:2,side:0,units:[
    {id:1,faction:0,status:0,health:87,stun:61},
    {id:1000014,faction:1,status:0,health:70,stun:0}
  ]};
  const safety=scoreNativeCheckpoint(original,sample,1);
  assert.equal(safety.kind,'NONTERMINAL_NATIVE_CHECKPOINT_ONLY');
  assert.equal(safety.netHpLoss,153);
  assert.equal(safety.netStunIncrease,61);
  assert.equal(safety.dead,0);
  assert.equal(safety.nativeMissionOutcome,null);
  assert.equal(safety.battleVictoryCertified,false);
  assert.equal(scoreNativeCheckpoint(original,{...sample,turn:1},1),null);
  assert.equal(scoreNativeCheckpoint(original,{...sample,side:1},1),null);
  assert.equal(scoreNativeCheckpoint(original,{...sample,phase:'requested'},1),null);
  assert.throws(()=>scoreNativeCheckpoint(original,{...sample,units:[]},1),/UNITS_MISSING/);
  const controlled=scoreNativeCheckpoint(original,{...sample,units:[
    {id:1,faction:1,status:7,health:87,stun:90},
    {id:1000014,faction:1,status:0,health:70,stun:0}
  ]},1);
  assert.equal(controlled.lostControl,1);
  assert.equal(controlled.unconscious,1);
  assert.equal(controlled.dead,0);
  assert.throws(()=>scoreNativeCheckpoint(original,{...sample,units:[
    {...sample.units[0],status:5},sample.units[1]
  ]},1),/AMBIGUOUS_PLAYER_CHECKPOINT_STATUS/);
});
test('native batch execution is rejected on Windows source machine',async()=>{
  if(process.platform==='win32')await assert.rejects(()=>runNativeBatch({}),/GPT_LINUX_EXECUTION_REQUIRED/);
});
