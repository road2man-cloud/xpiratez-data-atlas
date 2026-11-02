// Source-only tests. No proprietary ruleset or saved game is required.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  extractArmorRules, combineArmorRules, auditArmorFootprints,
} from './audit-armor-footprints.mjs';
import {auditBattleSpace} from './audit-battle-space.mjs';
import {planSpatialConversion} from './spatial-contract.mjs';

const coreText = 'armors:\n' +
  '  - type: HUMAN\n    spriteSheet: HUMAN.PCK\n    loftempsSet: [ 4 ]\n' +
  '  - type: RIDER\n    size: 2\n    movementType: MT_WALK\n' +
  '  - type: TURRET\n    size: 2\n' +
  'items:\n  - type: RIDER\n    size: 32\n';
const overlayText = 'armors:\n' +
  '  - type: RIDER\n    layersDefaultPrefix: UBERGAL\n' +
  '  - type: HUMAN\n    layersDefaultPrefix: HUM\n';
const synthetic = () => {
  const defs=combineArmorRules([
    extractArmorRules(coreText,'core.rul'),extractArmorRules(overlayText,'appearance.rul'),
  ]);
  return {rules:defs,fingerprints:[],fileCount:2,allDefinitions:5};
};
const battle=()=>({
  schema:'xpz3d.battle-start.v1',
  battleId:'12345678abcdef00',
  origin:{sourceSha256:'a'.repeat(64)},
  mission:{mapSize:[60,60,4]},
  units:[
    {unitId:1,armorRule:'RIDER',unitRule:'SOLDIER',faction:0,tile:[12,48,0],facing:2},
    {unitId:2,armorRule:'HUMAN',unitRule:'SOLDIER',faction:0,tile:[20,20,0],facing:4},
    {unitId:3,armorRule:'TURRET',unitRule:'SOLDIER',faction:1,tile:[30,30,0],facing:0},
  ],
});

test('strictly extracts armor scalar sizes, not same-named item rules',()=>{
  const records=extractArmorRules(coreText,'core.rul');
  assert.deepEqual(records.map(r=>r.type),['HUMAN','RIDER','TURRET']);
  assert.deepEqual(records.map(r=>r.directSize),[null,2,2]);
  assert.equal(records[0].loftempsSet,'[ 4 ]');
});

test('appearance-only overlays do not erase source footprint size',()=>{
  const c=synthetic();
  assert.equal(c.rules.get('RIDER').size,2);
  assert.equal(c.rules.get('RIDER').sizeConfidence,'EXPLICIT_RULE');
  assert.equal(c.rules.get('RIDER').sourceOverrides,2);
  assert.equal(c.rules.get('HUMAN').size,null);
});

test('explicit conflicting armor sizes remain ambiguous',()=>{
  const records=extractArmorRules('armors:\n  - type: RIDER\n    size: 1\n','other.rul');
  const c=combineArmorRules([extractArmorRules(coreText,'core.rul'),records]);
  assert.equal(c.get('RIDER').size,null);
  assert.equal(c.get('RIDER').sizeConfidence,'CONFLICTING_EXPLICIT_RULES');
  assert.deepEqual(c.get('RIDER').conflicts,[2,1]);
});

test('effective source sizes are not silently defaulted to 1x1',()=>{
  const b=battle(),c=synthetic();
  const a=auditArmorFootprints(b,c,planSpatialConversion({mapSize:b.mission.mapSize}));
  assert.equal(a.actorsWithDirectRulesetSize,2);
  assert.deepEqual(a.sizes,{'2':2});
  assert.deepEqual(a.explicitSizedUnits.map(u=>u.unitId),[1,3]);
  assert.equal(a.unresolvedArmorRules.length,1);
  assert.equal(a.unresolvedArmorRules[0].armorRule,'HUMAN');
  assert.deepEqual(a.knownFootprintOverlaps,[]);
});

test('auditing one source battle centers 2x2 sources on footprint, not top-left tile',()=>{
  const b=battle(),c=synthetic();
  const a=auditBattleSpace(b,{armorCatalog:c});
  assert.deepEqual(a.sourceFootprints.confirmedBySize,{'2':2});
  assert.equal(a.sourceFootprints.unresolvedOrEngineDefault,1);
  assert.deepEqual(a.firstSampleUnits[0].sourceAnchorWorldMeters,[15.625,60.625,0]);
  assert.deepEqual(a.firstSampleUnits[0].intendedWorldMeters,[16.25,61.25,0]);
  assert.equal(a.firstSampleUnits[0].pathCellCandidates,16);
  assert.equal(a.firstSampleUnits[1].pathCellCandidates,4);
  assert.equal(a.nativeSpawnedAtProjectedPositionCount,0);
  assert.equal(a.outOfBoundsOrUnconvertible,0);
});

test('a 2x2 source actor near the map edge is not clipped or silently reduced',()=>{
  const b=battle(),c=synthetic();
  b.units[0].tile=[59,59,0];
  const a=auditBattleSpace(b,{armorCatalog:c});
  assert.equal(a.projectedCandidates,2);
  assert.equal(a.outOfBoundsOrUnconvertible,1);
  assert.equal(a.sourceUnitIssues.invalid[0].unitId,1);
  assert.equal(a.sourceUnitIssues.invalid[0].problem,'FOOTPRINT_BOUNDS');
});
