// SPDX-License-Identifier: GPL-3.0-or-later
// These are parser/scoring/launch guard fixtures, NOT battle simulations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseBatchArgs,listPlans,parseBattleUnits,scoreNativeTerminal,runNativeBatch} from './search-native.mjs';
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
  assert.equal(units.length,2);assert.deepEqual(units[0],{id:1,faction:0,status:0,health:240,stunlevel:0});
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
test('native batch execution is rejected on Windows source machine',async()=>{
  if(process.platform==='win32')await assert.rejects(()=>runNativeBatch({}),/GPT_LINUX_EXECUTION_REQUIRED/);
});
