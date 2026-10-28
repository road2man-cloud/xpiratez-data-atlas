// SPDX-License-Identifier: GPL-3.0-or-later
// Plan enumeration tests only; NO combat engine executions or damage estimates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseTacticalSave,enumerateNativePlans,parseGenerationArgs,writeNativePlans} from './generate-native-plans.mjs';
import {listPlans} from './search-native.mjs';
import {sha256} from './prepare-native.mjs';

const fixture=[
'---','battleGame:', '  units:',
'    - id: 1','      faction: 0','      status: 0','      position: [34,39,1]',
'      visible: true','      health: 240',
'    - id: 42','      faction: 1','      originalFaction: 0','      status: 0','      position: [35,42,1]',
'    - id: 1000001','      faction: 1','      status: 0','      position: [28,16,0]',
'      visible: true','      health: 70',
'    - id: 1000002','      faction: 1','      status: 0','      position: [22,41,1]',
'      visible: false','      health: 70',
'    - id: 1000003','      faction: 0','      originalFaction: 1','      status: 0','      position: [19,21,0]',
'      visible: true','      health: 70',
'  items:',
'    - id: 126','      type: STR_BOW_H','      owner: 1',
'      inventoryslot: STR_RIGHT_HAND','      ammoItem: 125',
'    - id: 127','      type: STR_BOW_H_QUIVER','      owner: 1',
'      inventoryslot: STR_BACK_PACK','      ammoqty: 16',
'    - id: 128','      type: STR_GAUSS_SNIPER','      owner: 42',
'      inventoryslot: STR_LEFT_HAND'
].join('\n');

test('only visible hostile ORIGINAL units and controllable original allies become candidate pairs',()=>{
  const data=parseTacticalSave(fixture);
  assert.equal(data.units.length,5);
  assert.equal(data.items.length,3);
  const e=enumerateNativePlans(data);
  assert.equal(e.originalAllies,1);
  assert.equal(e.visibleOriginalHostiles,1);
  assert.equal(e.handItems,1);
  assert.equal(e.plans.length,3);
  assert.deepEqual(e.plans.map(x=>x.mode),['snap','aimed','auto']);
  assert.equal(e.plans[0].item,126);
  assert.equal(e.plans[0].itemType,'STR_BOW_H');
  assert.equal(e.plans[0].target,1000001);
  assert.deepEqual(e.plans[0].targetPosition,[28,16,0]);
  assert.match(e.plans[0].script,/fire 1 126 snap 28 16 0/);
  assert.match(e.plans[0].script,/end_turn\nobserve\nstop/);
  assert.equal(e.engineEvaluated,false);
  assert.ok(e.plans.every(p=>p.sha256===sha256(Buffer.from(p.script))));
});
test('plans never declare estimated hits, victory or action legality',()=>{
  const one=enumerateNativePlans(parseTacticalSave(fixture),{modes:['snap'],endTurn:false});
  assert.equal(one.plans.length,1);
  assert.doesNotMatch(one.plans[0].script,/end_turn|winRate|damage|victory/);
  assert.match(one.plans[0].script,/engine|OXCE/i);
  assert.throws(()=>enumerateNativePlans(parseTacticalSave(fixture),{modes:['snapshot']}),/INVALID_SHOT_MODES/);
  assert.throws(()=>enumerateNativePlans(parseTacticalSave(fixture),{modes:['snap','snap']}),/INVALID_SHOT_MODES/);
  assert.throws(()=>enumerateNativePlans(parseTacticalSave(fixture),{maxPlans:2}),/PLAN_COUNT_EXCEEDS_MAX/);
});
test('hidden enemies and inventory-only equipment cannot produce fake attacks',()=>{
  const hidden=parseTacticalSave(fixture.replace('      visible: true\n      health: 70','      visible: false\n      health: 70'));
  assert.throws(()=>enumerateNativePlans(hidden),/NO_VISIBLE_ORIGINAL_HOSTILES/);
  const unarmed=parseTacticalSave(fixture.replace('      inventoryslot: STR_RIGHT_HAND','      inventoryslot: STR_BACK_PACK'));
  assert.throws(()=>enumerateNativePlans(unarmed),/NO_HAND_ITEMS/);
});
test('strict parser rejects ambiguous or incomplete OXCE unit/item lists',()=>{
  assert.throws(()=>parseTacticalSave('---\n  units:\n    - id: 1\n'),/TACTICAL_SAVE_UNITS_OR_ITEMS_MISSING/);
  assert.throws(()=>parseTacticalSave(fixture.replace('    - id: 42','    - id: 1')),/DUPLICATE_OR_INVALID_ID/);
  assert.throws(()=>parseTacticalSave(fixture.replace('      position: [34,39,1]','')),/INCOMPLETE_UNIT_STATE/);
  assert.throws(()=>parseTacticalSave(fixture.replace('      type: STR_BOW_H','')),/MISSING_ITEM_TYPE/);
});
test('writes independently hash-pinned .actions; never copies or alters source save',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-plan-generation-'));
  try{
    const src=path.join(root,'save','source.sav'),out=path.join(root,'generated','plans');
    fs.mkdirSync(path.dirname(src),{recursive:true});
    fs.writeFileSync(src,fixture);
    const digest=sha256(fs.readFileSync(src));
    const manifest=writeNativePlans(src,out,{modes:['snap']});
    assert.equal(manifest.planCount,1);
    assert.equal(manifest.sourceSaveSha256,digest);
    assert.equal(manifest.engineEvaluated,false);
    assert.equal(sha256(fs.readFileSync(src)),digest);
    assert.deepEqual(listPlans(out).map(p=>p.name),['fire-u1-item126-enemy1000001-snap.actions']);
    assert.equal(fs.readFileSync(path.join(out,'plan-manifest.json'),'utf8').includes('STR_BOW_H'),true);
    assert.throws(()=>writeNativePlans(src,out),/OUTPUT_ALREADY_EXISTS/);
    assert.throws(()=>writeNativePlans(src,path.join(root,'save','inside-save-dir')),/PLAN_OUTPUT_MUST_BE_OUTSIDE_SAVE_DIRECTORY/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('explicit actor, item and visible-target IDs narrow OXCE candidates without predicted legality',()=>{
  const parsed=parseGenerationArgs(['3.sav','plans','--actors','1','--items','126',
    '--targets','1000001','--modes','snap,aimed']);
  assert.deepEqual(parsed.options.actorIds,[1]);
  assert.deepEqual(parsed.options.itemIds,[126]);
  assert.deepEqual(parsed.options.targetIds,[1000001]);
  const save=parseTacticalSave(fixture);
  const options=parsed.options;
  const result=enumerateNativePlans(save,options);
  assert.equal(result.plans.length,2);
  assert.deepEqual(result.plans.map(p=>p.mode),['snap','aimed']);
  assert.ok(result.plans.every(p=>p.target===1000001&&p.item===126));
  assert.equal(result.engineEvaluated,false);
  assert.throws(()=>enumerateNativePlans(save,{itemIds:[999]}),/UNKNOWN_OR_NOT_ELIGIBLE_ITEM_ID/);
  assert.throws(()=>enumerateNativePlans(save,{actorIds:[42]}),/UNKNOWN_OR_NOT_ELIGIBLE_ACTOR_ID/);
  assert.throws(()=>enumerateNativePlans(save,{targetIds:[1000002]}),/UNKNOWN_OR_NOT_ELIGIBLE_TARGET_ID/);
  assert.throws(()=>enumerateNativePlans(save,{itemIds:[126,126]}),/INVALID_ITEM_IDS/);
  assert.throws(()=>parseGenerationArgs(['3.sav','plans','--items','126,126']),/DUPLICATE_OR_INVALID_ITEMS_IDS/);
  assert.throws(()=>parseGenerationArgs(['3.sav','plans','--targets','1,x']),/INVALID_TARGETS_IDS/);
});
test('argument grammar does not permit silently invented modes or duplicates',()=>{
  const parsed=parseGenerationArgs(['17.sav','plans','--modes','snap,aimed','--no-end-turn','--max-plans','2']);
  assert.deepEqual(parsed.options,{modes:['snap','aimed'],endTurn:false,maxPlans:2});
  assert.throws(()=>parseGenerationArgs([]),/Usage/);
  assert.throws(()=>parseGenerationArgs(['x','y','--modes','snap','--modes','auto']),/DUPLICATE_ARGUMENT/);
  assert.throws(()=>parseGenerationArgs(['x','y','--count','1000']),/UNSUPPORTED_ARGUMENT/);
});
