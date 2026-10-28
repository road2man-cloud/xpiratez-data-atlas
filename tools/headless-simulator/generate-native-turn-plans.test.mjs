// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256} from './prepare-native.mjs';
import {parseTacticalSave} from './generate-native-plans.mjs';
import {enumerateNativeTurnPlans,parseNativeTurnArgs,writeNativeTurnPlans} from './generate-native-turn-plans.mjs';

function fakeSave() {
  return [
    'name: 3',
    '---','battleGame:','  units:',
    '    - id: 1','      faction: 0','      status: 0','      health: 193',
    '      position: [24,37,0]',
    '    - id: 12','      faction: 0','      status: 0','      health: 95',
    '      kneeled: true','      position: [24,42,1]',
    '    - id: 19','      faction: 0','      status: 0','      health: 109',
    '      position: [24,39,1]',
    '    - id: 1000024','      faction: 1','      visible: true',
    '      status: 0','      health: 96','      position: [24,35,0]',
    '    - id: 1000025','      faction: 1','      visible: true',
    '      status: 0','      health: 96','      position: [26,36,0]',
    '    - id: 1000017','      faction: 1','      visible: false',
    '      status: 0','      health: 93','      position: [22,25,0]',
    '  items:',
    '    - id: 109','      type: STR_SMG_10MM','      owner: 19','      inventoryslot: STR_RIGHT_HAND',
    '    - id: 225','      type: STR_MELEE','      owner: 1','      inventoryslot: STR_RIGHT_HAND',
    '    - id: 174','      type: STR_SSRL_2','      owner: 19','      inventoryslot: STR_BACK_PACK',
    '    - id: 301','      type: STR_GRENADE','      owner: 12','      inventoryslot: STR_BELT'
  ].join('\n');
}
test('reads original kneeled state and only visible enemies',()=>{
  const battle=parseTacticalSave(fakeSave());
  assert.equal(battle.units.find(u=>u.id===12).kneeled,true);
  const data=enumerateNativeTurnPlans(battle,{focusId:1,supportIds:[12,19],moveRadius:1,maxPlans:300});
  assert.deepEqual(data.visibleTargetIds,[1000024,1000025]);
  assert.deepEqual(data.kneelEligibleSupportIds,[19]);
  assert.ok(data.plans.some(p=>p.kind==='FOCUS_MOVE'));
  assert.ok(data.plans.some(p=>p.kind==='FOCUS_TURN'));
  assert.ok(data.plans.some(p=>p.kind==='NATIVE_SHOT_PROPOSAL'));
  const rocket=data.plans.find(p=>p.kind==='NATIVE_STORED_WEAPON_EQUIP_FIRE_PROPOSAL');
  assert.ok(rocket);
  assert.match(rocket.script,/inventory 19 174 left 0 0/);
  assert.match(rocket.script,/fire 19 174 (aimed|snap)/);
  const grenade=data.plans.find(p=>p.kind==='NATIVE_GRENADE_THROW_PROPOSAL');
  assert.ok(grenade);
  assert.match(grenade.script,/inventory 12 301 left 0 0/);
  assert.match(grenade.script,/prime 12 301 [01]/);
  assert.match(grenade.script,/throw 12 301/);
  assert.ok(data.plans.every(p=>!p.script.includes('kneel 12\n')));
  assert.ok(data.plans.every(p=>!p.script.includes('1000017')));
  assert.ok(data.plans.every(p=>p.script.includes('\nend_turn\nobserve\nstop\n')));
  assert.ok(data.plans.every(p=>p.name.endsWith('.actions')));
  assert.equal(data.engineEvaluated,false);
  assert.equal(data.truncated,false);
});
test('plan generation is deterministic, bounded, and never claims a simulated win',()=>{
  const s=parseTacticalSave(fakeSave());
  const a=enumerateNativeTurnPlans(s,{focusId:1,moveRadius:2,maxPlans:9});
  const b=enumerateNativeTurnPlans(s,{focusId:1,moveRadius:2,maxPlans:9});
  assert.deepEqual(a,b);
  assert.equal(a.selectedCount,9);
  assert.ok(a.allCandidates>9);
  assert.equal(a.truncated,true);
  assert.equal(a.plans[0].name,'baseline-endturn.actions');
  assert.ok(a.plans.some(p=>p.kind==='NATIVE_STORED_WEAPON_EQUIP_FIRE_PROPOSAL'));
  assert.ok(a.plans.some(p=>p.kind==='NATIVE_GRENADE_THROW_PROPOSAL'));
  assert.ok(!JSON.stringify(a).includes('winRate'));
  assert.ok(!JSON.stringify(a).includes('estimatedDamage'));
});
test('invalid, duplicated, hidden and unconscious identifiers are rejected',()=>{
  const s=parseTacticalSave(fakeSave());
  for(const options of [
    {focusId:999},{focusId:1,supportIds:[12,12]},{focusId:1,supportIds:[1]},
    {focusId:1,targetIds:[1000017]},{focusId:1,targetIds:[1000024,1000024]},
    {focusId:1,moveRadius:-1},{focusId:1,moveRadius:15},{focusId:1,maxPlans:0}
  ])assert.throws(()=>enumerateNativeTurnPlans(s,options));
  const dead=structuredClone(s);dead.units.find(u=>u.id===1).status=6;
  assert.throws(()=>enumerateNativeTurnPlans(dead,{focusId:1}),/FOCUS_IS_NOT_CONTROLLABLE/);
});
test('CLI rejects unknown flags and requires ids and range',()=>{
  const p=parseNativeTurnArgs(['turn2.sav','plans','--focus','1','--supports','12,19',
    '--targets','1000024,1000025','--radius','2','--max-plans','50']);
  assert.equal(p.opts.focusId,1);
  assert.deepEqual(p.opts.supportIds,[12,19]);
  assert.deepEqual(p.opts.targetIds,[1000024,1000025]);
  for(const args of [
    [],['3.sav','x','--focus','x'],['3.sav','x','--radius','-1'],
    ['3.sav','x','--supports','19,foo'],['3.sav','x','--wat'],
    ['3.sav','x','--max-plans','0']
  ])assert.throws(()=>parseNativeTurnArgs(args));
});
test('writes candidate manifests next to plans without changing original save',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-turn-plans-'));
  try {
    fs.mkdirSync(path.join(root,'input'));
    const save=path.join(root,'input','turn2.sav');
    fs.writeFileSync(save,fakeSave());
    const hash=sha256(fs.readFileSync(save));
    const out=path.join(root,'native-turn2-plans');
    const m=writeNativeTurnPlans(save,out,{focusId:1,supportIds:[12,19],maxPlans:10});
    assert.equal(m.sourceSaveSha256,hash);
    assert.equal(m.selectedCount,10);
    assert.equal(m.engineEvaluated,false);
    assert.equal(sha256(fs.readFileSync(save)),hash);
    for(const p of m.plans){
      assert.equal(sha256(fs.readFileSync(path.join(out,p.name))),p.sha256);
      assert.ok(fs.readFileSync(path.join(out,p.name),'utf8').endsWith('stop\n'));
    }
    assert.throws(()=>writeNativeTurnPlans(save,out),/OUTPUT_ALREADY_EXISTS/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
