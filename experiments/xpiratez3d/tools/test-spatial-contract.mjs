// Deterministic tests of the OXCE -> Silent Storm *spatial* contract.
// No game installation, saves or GOG assets are needed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  planSpatialConversion, tileToWorld, worldToTile, voxelToWorld,
  tileNavCandidates, footprintToNativeCells, projectUnit,
  facingVector, tilePartReference, auditExistingTerrainManifest,
} from './spatial-contract.mjs';

const p60 = () => planSpatialConversion({mapSize: [60,60,7]});

test('60x60 default map remains 75m square on a 120x120 native path grid', () => {
  const p = p60();
  assert.deepEqual(p.nativeGrid, [120,120]);
  assert.deepEqual(p.contentExtentMeters, [75,75,17.5]);
  assert.deepEqual(p.marginsCells, {left:0,right:0,top:0,bottom:0});
  assert.equal(p.cellsPerTile, 2);
  assert.equal(p.voxel.widthMeters, 1.25/16);
  assert.equal(p.voxel.loftSliceMeters, 2.5/12);
  assert.equal(p.enlargedGridIsPaddingOnly, false);
});

test('60x60 in 160x160 pads by 20 cells (12.5m each), not stretching the map', () => {
  const p=planSpatialConversion({mapSize: [60,60,7],nativeGrid:[160,160]});
  assert.deepEqual(p.marginsCells, {left:20,right:20,top:20,bottom:20});
  assert.deepEqual(p.contentExtentMeters, [75,75,17.5]);
  assert.deepEqual(p.gridExtentMeters, [100,100]);
  assert.deepEqual(p.contentOriginMeters, [12.5,12.5,0]);
  assert.deepEqual(tileToWorld(p,[0,0,0]), [13.125,13.125,0]);
  assert.equal(p.enlargedGridIsPaddingOnly, true);
});

test('non-square maps remain non-square: never convert 80x60 to 160x160 by default', () => {
  const p=planSpatialConversion({mapSize:[80,60,4]});
  assert.deepEqual(p.nativeGrid,[160,120]);
  assert.deepEqual(p.contentExtentMeters,[100,75,10]);
  assert.deepEqual(tileToWorld(p,[79,59,3]),[99.375,74.375,7.5]);
});

test('odd padding splits deterministically, without hidden fractions', () => {
  const p=planSpatialConversion({mapSize:[13,9,2],nativeGrid:[31,21]});
  assert.deepEqual(p.marginsCells,{left:2,right:3,top:1,bottom:2});
  assert.deepEqual(p.nativeGrid,[31,21]);
  assert.deepEqual(p.contentCells,[26,18]);
});

test('original tile centers, voxel edges and map bounds round-trip', () => {
  const p=p60();
  for (const tile of [[0,0,0],[12,48,0],[24,19,1],[59,59,6]]) {
    assert.deepEqual(worldToTile(p,tileToWorld(p,tile)),tile);
  }
  assert.deepEqual(tileToWorld(p,[12,48,0]),[15.625,60.625,0]);
  assert.deepEqual(voxelToWorld(p,[12,48,1],[0,0,0]),[15,60,2.5]);
  assert.deepEqual(voxelToWorld(p,[12,48,1],[16,16,24]),[16.25,61.25,5]);
  assert.throws(()=>worldToTile(p,[75,30,0]),{code:'BOUNDS'});
  assert.throws(()=>worldToTile(p,[-0.01,30,0]),{code:'BOUNDS'});
  assert.throws(()=>tileToWorld(p,[60,30,0]),{code:'TILE_BOUNDS'});
  assert.throws(()=>tileToWorld(p,[1,1,7]),{code:'TILE_BOUNDS'});
});

test('explicit Y-axis inversion round-trips all legal source positions', () => {
  const p=planSpatialConversion({mapSize:[40,30,4], invertY:true});
  assert.deepEqual(tileToWorld(p,[0,0,0]),[0.625,36.875,0]);
  assert.deepEqual(tileToWorld(p,[0,29,0]),[0.625,0.625,0]);
  for(const t of [[0,0,0],[1,5,1],[39,29,3]])assert.deepEqual(worldToTile(p,tileToWorld(p,t)),t);
  const fp=footprintToNativeCells(p,[2,3,0],[2,3]);
  assert.deepEqual(fp.nativeRectCells,[4,48,4,6]);
});

test('even tile-to-nav ratio yields 4 equal-nearest candidates, never fake exact placement', () => {
  const p=p60(), v=tileNavCandidates(p,[12,48,0]);
  assert.equal(v.candidates.length,4);
  assert.deepEqual(new Set(v.candidates.map(x=>x.cell.join(','))),
    new Set(['24,96','25,96','24,97','25,97']));
  assert.ok(v.candidates.every(c=>Math.abs(c.horizontalErrorMeters-Math.SQRT2*0.3125)<1e-8));
  assert.ok(v.candidates.every(c=>c.nativePassabilityChecked===false));
  assert.equal(v.selectedCell,null);
  assert.equal(v.nativePathLayerResolved,false);
  assert.deepEqual(v.idealCenterMeters,[15.625,60.625,0]);
});

test('odd tile-to-nav ratio gives one exact center path cell', () => {
  const p=planSpatialConversion({mapSize:[60,60,4],xyTileMeters:1.875});
  const v=tileNavCandidates(p,[12,48,0]);
  assert.deepEqual(p.nativeGrid,[180,180]);
  assert.deepEqual(v.candidates[0].cell,[37,145]);
  assert.equal(v.candidates[0].horizontalErrorMeters,0);
});

test('larger unit footprint is not flattened to one S2 cell, but collision size is unresolved', () => {
  const p=p60(), f=footprintToNativeCells(p,[4,5,0],[2,2]);
  assert.deepEqual(f.nativeRectCells,[8,10,4,4]);
  assert.deepEqual(f.physicalDimensionsMeters,[2.5,2.5]);
  assert.deepEqual(f.intendedCenterMeters,[6.25,7.5,0]);
  assert.equal(f.s2CollisionProfileMapped,false);
  assert.equal(f.modelScaleMapped,false);
  assert.throws(()=>footprintToNativeCells(p,[59,59,0],[2,2]),{code:'FOOTPRINT_BOUNDS'});
});

test('stable unit ID and faction are preserved, S2 placement/model remain unverified', () => {
  const p=p60();
  const u=projectUnit(p,{unitId:61,unitKey:'unit:61',faction:0,armorRule:'STR_LOKNAR_COAT_UC',tile:[24,19,1],facing:4});
  assert.equal(u.unitId,61);
  assert.deepEqual(u.intendedWorldMeters,[30.625,24.375,2.5]);
  assert.equal(u.s2CandidateCells.length,4);
  assert.equal(u.state,'CANDIDATES_ONLY');
  assert.equal(u.nativeSpawnVerified,false);
  assert.equal(u.visualModelMapped,false);
  assert.equal(u.requiresNativeGroundHeightAndPassability,true);
  assert.deepEqual(u.facing.world,[0,1]);
  assert.equal(u.facing.s2DirectionIndex,null);
  const dead=projectUnit(p,{unitId:999,unitRule:'ZOMBIE',tile:null});
  assert.equal(dead.state,'NOT_DEPLOYED_OR_NO_TILE');
  assert.throws(()=>projectUnit(p,{unitId:999,tile:[0,0,8]}),{code:'UNIT_TILE'});
  assert.throws(()=>facingVector(p,8),{code:'FACING'});
  const big=projectUnit(p,{unitId:1,tile:[12,48,0],armorRule:'STR_HYENA_RIDER_ARMOR_UC'},
    {footprintTiles:[2,2]});
  assert.deepEqual(big.sourceTileAnchorWorldMeters,[15.625,60.625,0]);
  assert.deepEqual(big.intendedWorldMeters,[16.25,61.25,0]);
  assert.deepEqual(big.footprint.nativeRectCells,[24,96,4,4]);
  assert.equal(big.s2CandidateCells.length,16);
  assert.equal(big.nativeSpawnVerified,false);
});

test('source tile component identity remains per floor/wall/object for later destruction', () => {
  const mk=part=>tilePartReference({battleId:'71c6d7292d67a5db8e58c3283b2a1522',
    tile:[12,48,0],part,dataset:'FOREST_SNOW',mcdId:7});
  const a=[0,1,2,3].map(mk);
  assert.deepEqual(a.map(x=>x.partKind),['floor','westWall','northWall','object']);
  assert.equal(new Set(a.map(x=>x.sourceRef)).size,4);
  assert.equal(a[3].destructionUnit,'source tile part, NOT aggregate material chunk');
  const broken=tilePartReference({battleId:'71c6d7292d67a5db8e58c3283b2a1522',
    tile:[12,48,0],part:3,dataset:'FOREST_SNOW',mcdId:8,state:'damaged'});
  assert.equal(broken.sourceRef,a[3].sourceRef);
  assert.notEqual(broken.definitionRef,a[3].definitionRef);
  assert.throws(()=>mk(4),{code:'PART'});
});

test('8-bit native width overflow fails instead of wrapping and silently losing tiles', () => {
  assert.throws(()=>planSpatialConversion({mapSize:[128,128,3]}),{code:'NATIVE_LIMIT'});
  assert.throws(()=>planSpatialConversion({mapSize:[100,100,3],nativeGrid:[160,160]}),
    {code:'NATIVE_CROP'});
  assert.throws(()=>planSpatialConversion({mapSize:[60,60,3],xyTileMeters:1.6666666666667}),
    {code:'NONINTEGER_NAV_RATIO'});
});

test('a Stage26 160 grid with fractional cell/tile is a 33.3% scene stretch, not extra detail', () => {
  const plan=p60();
  const manifest = pitch=>({
    schema:'xpz3d.oxce-terrain-mesh.v1',
    source:{mapSize:[60,60,7],battleId:'71c6d7292d67a5db8e58c3283b2a1522'},
    conversion:{sourceTileMeters:pitch,s2CellMeters:0.625,s2Grid:[160,160],
      floorHeightMeters:2.5,oxceMcdRulesetPatchesApplied:false,exactSpriteTextures:false}
  });
  const old=auditExistingTerrainManifest(plan,manifest(160*.625/60));
  assert.ok(Math.abs(old.xyContentLinearRatio-4/3)<1e-8);
  assert.ok(Math.abs(old.xyAreaRatio-16/9)<1e-8);
  assert.equal(old.sourceWorldSizePreserved,false);
  assert.ok(old.warnings.includes('SCALE_STRETCH: visual and physical map width changed'));
  const padded=auditExistingTerrainManifest(
    planSpatialConversion({mapSize:[60,60,7],nativeGrid:[160,160]}),
    manifest(1.25));
  assert.equal(padded.sourceWorldSizePreserved,true);
  assert.equal(padded.nativeGridMatches,true);
});

test('scene conversion is required to document unresolved real game rules', () => {
  const p=p60(), m={schema:'xpz3d.oxce-terrain-mesh.v1',
    source:{mapSize:[60,60,7]},
    conversion:{sourceTileMeters:1.25,s2CellMeters:0.625,s2Grid:[120,120],
      floorHeightMeters:2.5,oxceMcdRulesetPatchesApplied:false,exactSpriteTextures:false}};
  const r=auditExistingTerrainManifest(p,m);
  assert.equal(r.sourceWorldSizePreserved,true);
  assert.ok(r.warnings.includes('MCD_RULESET_OVERRIDES_NOT_APPLIED'));
  assert.ok(r.warnings.includes('VISUAL_TEXTURES_NOT_IMPORTED'));
});
