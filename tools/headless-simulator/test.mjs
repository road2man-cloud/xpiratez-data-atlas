import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSave, battle, experiment, clearLine } from './simulate.mjs';
const fixture = [
'name: example','---','  missionType: STR_UFO_GROUND_ASSAULT',
'  units:',
'    - id: 1','      faction: 0','      genUnitType: SOLDIER','      position: [2,3,0]','      health: 100','      tu: 90','      armor: [20,20,20,20,20]',
'      currStats:','        firing: 75',
'    - id: 1000000','      faction: 1','      genUnitType: STR_CHURCH_SOLDIER','      position: [8,3,0]','      health: 50','      armor: [5,5,5,5,5]',
'  items:','    - id: 7','      type: STR_SMG_10MM','      owner: 1','      inventoryslot: STR_RIGHT_HAND'
].join('\n');
test('parse save',()=>{const s=parseSave(fixture);assert.equal(s.units.length,2);assert.equal(s.units[0].weapon,'STR_SMG_10MM');assert.equal(s.units[0].stat_firing,75);assert.deepEqual(s.units[0].position,[2,3,0]);});
test('determinism',()=>{const s=parseSave(fixture);assert.deepEqual(battle(s,{seed:1337}),battle(s,{seed:1337}));});
test('batch reproducibility',()=>{const s=parseSave(fixture);const a=experiment(s,{runs:50,seed:99});assert.deepEqual(a,experiment(s,{runs:50,seed:99}));assert.equal(a.verifiedFullEngine,false);for(const x of a.strategies){assert.equal(x.runs,50);assert.ok(x.flawless<=x.victories)}});
test('geometry unknown by default',()=>{const s=parseSave(fixture);assert.equal(clearLine(null,s.units[0],s.units[1]),null);assert.match(experiment(s,{runs:1}).geometry,/UNAVAILABLE/);});
test('reject non-tactical save',()=>assert.throws(()=>parseSave('---\n  something: true'),/No battle units/));
