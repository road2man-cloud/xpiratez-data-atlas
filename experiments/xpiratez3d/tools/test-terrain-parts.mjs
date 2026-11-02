import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexTileParts} from './audit-terrain-parts.mjs';
const battle=()=>({
  dims:[4,3,2],sourceHash:'a'.repeat(64),battleId:'12345678abcdef00',
  terrainSets:['FOREST','ROAD'],
  tiles:[
    {x:1,y:1,z:0,ids:[2,3,-1,4],sets:[0,1,-1,0],flags:8},
    {x:2,y:1,z:1,ids:[1,-1,6,-1],sets:[1,-1,0,-1],flags:16},
  ]
});
const manifest=()=>({
  schema:'xpz3d.oxce-terrain-mesh.v1',
  source:{battleId:'12345678abcdef00',mapSize:[4,3,2]},
  conversion:{region:[0,0,4,3]},
  counts:{mapTilePartReferences:5,meshedPartInstances:3,missingSolidLofts:0,
    excludedOpenedDoors:2}
});
test('every nonempty source floor/wall/object part receives a stable identity',()=>{
  const r=indexTileParts(battle());
  assert.equal(r.selectedSavedTileRecords,2);
  assert.equal(r.sourcePartSlotsSeen,8);
  assert.equal(r.referencedParts,5);
  assert.equal(r.emptySlots,3);
  assert.deepEqual(r.bySourcePart,{floor:2,northWall:1,object:1,westWall:1});
  assert.equal(r.savedOpenDoorFlags,2);
  assert.equal(r.nativeDestructionCallbacksMapped,false);
});

test('changing the MCD ID preserves source slot identity but changes definition digest',()=>{
  const b=battle(),a=indexTileParts(b);
  b.tiles[0].ids[3]=5;
  const changed=indexTileParts(b);
  assert.equal(changed.referencedParts,a.referencedParts);
  assert.notEqual(changed.sourcePartDefinitionDigest,a.sourcePartDefinitionDigest);
});

test('partial terrain region matches source tile crop exactly',()=>{
  const b=battle(),r=indexTileParts(b,{region:[1,1,1,1]});
  assert.equal(r.selectedSavedTileRecords,1);
  assert.equal(r.referencedParts,3);
  assert.deepEqual(r.byFloor,{'0':3});
});
test('stage26 conversion part-loss gate fails closed',()=>{
  const b=battle(),m=manifest();
  const ok=indexTileParts(b,{terrainManifest:m});
  assert.equal(ok.stage26MeshAccounting.allPartsAccounted,true);
  m.counts.meshedPartInstances=2;
  assert.throws(()=>indexTileParts(b,{terrainManifest:m}),/Mesh converter omitted/);
});
test('invalid source records and duplicate part slots cannot be silently skipped',()=>{
  const b=battle();
  b.tiles.push({...b.tiles[0]});
  assert.throws(()=>indexTileParts(b),/Duplicated source object/);
  b.tiles.pop();b.tiles[0].sets[0]=-1;
  assert.throws(()=>indexTileParts(b),/Corrupt tile part/);
});
