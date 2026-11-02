#!/usr/bin/env node
// Read-only audit of real Stage24 manifest and optional Stage26 terrain output.
// No native save, game installation, proprietary asset, or derived roster is written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  planSpatialConversion, projectUnit, worldToTile,
  auditExistingTerrainManifest,
} from './spatial-contract.mjs';
import {scanArmorDirectory} from './audit-armor-footprints.mjs';

function need(ok, message) { if (!ok) throw new Error(message); }
function parseArgs(args) {
  const o = {};
  while(args.length) {
    const name = args.shift();
    need(['--battle','--save','--terrain','--grid','--tile-meters','--floor-meters',
      '--ruleset-dir','--invert-y'].includes(name), 'Unknown flag: ' + name);
    if(name === '--invert-y') { o.invertY = true; continue; }
    need(args.length > 0, 'Missing value after ' + name);
    o[name.slice(2)] = args.shift();
  }
  need(o.battle||o.save, 'Supply --battle battle-start.json OR --save generated-battle.sav (read only)');
  return o;
}
function freq(rows, f) {
  const value = {};
  for(const row of rows) {
    const k = String(f(row));
    value[k] = (value[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(value).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})));
}
export function auditBattleSpace(battle, opts = {}) {
  need(battle?.schema === 'xpz3d.battle-start.v1', 'Expected Stage24 OXCE battle-start manifest');
  const plan = planSpatialConversion({
    mapSize: battle.mission?.mapSize, xyTileMeters: opts.xyTileMeters ?? 1.25,
    floorMeters: opts.floorMeters ?? 2.5,
    nativeGrid: opts.grid ?? null, invertY: Boolean(opts.invertY),
  });
  const all = [], unavailable = [], invalid = [];
  for(const unit of battle.units || []) {
    try {
      const rule=opts.armorCatalog?.rules.get(unit.armorRule);
      const confirmedSize=rule?.sizeConfidence==='EXPLICIT_RULE'?rule.size:null;
      const p = projectUnit(plan, unit,{footprintTiles:confirmedSize?[confirmedSize,confirmedSize]:null});
      if(p.state === 'NOT_DEPLOYED_OR_NO_TILE') {
        unavailable.push({unitId:unit.unitId, reason:'NO_SOURCE_TILE'});
      } else {
        need(JSON.stringify(worldToTile(plan, p.sourceTileAnchorWorldMeters)) ===
          JSON.stringify(unit.tile), 'unit source tile anchor round-trip failed');
        all.push({id:unit.unitId, faction:unit.faction, tile:[...unit.tile],
          ideal:p.intendedWorldMeters, sourceAnchor:p.sourceTileAnchorWorldMeters,
          knownSourceSize:confirmedSize,pathCellCandidates:p.s2CandidateCells.length,
          firstCandidate:p.s2CandidateCells[0].cell, nativeVerified:false,
          unsupportedArmorGeometry:p.sourceArmorRule || null});
      }
    } catch (e) {
      invalid.push({unitId:unit.unitId, tile:unit.tile ?? null,
        problem:e.code || e.message});
    }
  }
  const seen = new Map(), overlaps=[];
  for(const actor of all){
    const key=actor.tile.join(',');
    if(seen.has(key))overlaps.push({tile:actor.tile,ids:[seen.get(key),actor.id]});
    else seen.set(key,actor.id);
  }
  const planSummary={
    sourceMapSize:[...plan.mapSize],nativeGrid:[...plan.nativeGrid],
    originalMapExtentMeters:[...plan.contentExtentMeters],
    navigationWorldExtentMeters:[...plan.gridExtentMeters],
    contentOriginMeters:[...plan.contentOriginMeters],
    navMarginCells:{...plan.marginsCells},cellsPerTile:plan.cellsPerTile,
    tilePitchMeters:plan.xyTileMeters,floorPitchMeters:plan.floorMeters,
    s2NativeCellMeters:plan.s2CellMeters, s2GridIsPaddingOnly:plan.enlargedGridIsPaddingOnly,
    invertY:plan.axis.invertY,
  };
  const reply = {
    schema:'xpz3d.stage24-spatial-audit.v1',
    sourceBattleId:battle.battleId,sourceSha256:battle.origin?.sourceSha256,
    transform:planSummary,
    sourceRosterTotal:(battle.units||[]).length,
    projectedCandidates:all.length,
    noSourceTile:unavailable.length,
    outOfBoundsOrUnconvertible:invalid.length,
    perFaction:freq(all,a=>a.faction),
    perFloor:freq(all,a=>a.tile[2]),
    suspectedTileCooccupancy:overlaps,
    sourceFootprints:opts.armorCatalog ? {
      directlyConfirmed:all.filter(u=>u.knownSourceSize!=null).length,
      unresolvedOrEngineDefault:all.filter(u=>u.knownSourceSize==null).length,
      confirmedBySize:freq(all.filter(u=>u.knownSourceSize!=null),u=>u.knownSourceSize),
      rulesetFingerprintCount:opts.armorCatalog.fingerprints.length,
    } : {status:'NO_RULESET_SUPPLIED',footprintsUnverified:all.length},
    firstSampleUnits:all.slice(0,4).map(({id,faction,tile,ideal,sourceAnchor,
      knownSourceSize,pathCellCandidates,firstCandidate,nativeVerified})=>({
      id,faction,tile,intendedWorldMeters:ideal,sourceAnchorWorldMeters:sourceAnchor,
      directRulesetSourceSize:knownSourceSize,pathCellCandidates,
      nearestCandidateCell:firstCandidate,nativeVerified})),
    nativeSpawnedAtProjectedPositionCount:0,
    unitsWithVerifiedColliderOrVisualModelCount:0,
    warnings:[
      'Projection is a coordinate contract; no native S2 actor placement is attempted.',
      'Source actor dimensions must be read from OXCE armor / unit-size rules; no guessed 3D collider.',
      'Source sprite/LOFT geometry differs from photoreal model art; preserve source-semantic collision separately.',
      'Facing vector is projected from OXCE compass convention; S2 facing index remains uncalibrated.',
    ],
    sourceUnitIssues:{notDeployed:unavailable,invalid},
  };
  if(opts.terrain) {
    const terrain=opts.terrain;
    need(terrain.source.battleId === battle.battleId &&
      terrain.source.saveSha256 === battle.origin.sourceSha256,
      'Terrain manifest does not match this OXCE battle/source save');
    reply.terrainAudit=auditExistingTerrainManifest(plan,terrain);
    reply.terrainAudit.region=terrain.conversion.region;
    reply.terrainAudit.isPartial=terrain.conversion.partial;
    reply.terrainAudit.genuineGeometryObserved=terrain.counts?.meshedPartInstances ?? null;
    // Stage26 currently batches multiple parts into one collider, losing the
    // source-tile-part identity required for per-object destruction.
    reply.terrainAudit.destructibleSourcePartIdentityPreserved=false;
    if (!reply.terrainAudit.nativeGridMatches)
      reply.warnings.push('S2 native grid mismatch: planning cannot be assumed compatible with this scene.');
    if (!reply.terrainAudit.sourceWorldSizePreserved)
      reply.warnings.push('Existing terrain converter stretched this source map. Re-run with fixed pitch + padding after native integration.');
  }
  return reply;
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o=parseArgs(process.argv.slice(2));
    const battle=o.battle?JSON.parse(fs.readFileSync(path.resolve(o.battle),'utf8')):null;
    const fromSave=o.save ? (await import('../stage24/bridge.mjs')).extractBattle(path.resolve(o.save)) : null;
    if(battle&&fromSave)need(battle.origin.sourceSha256===fromSave.origin.sourceSha256 &&
      battle.battleId===fromSave.battleId,'Bridge manifest and battle save do not match');
    const source=battle??fromSave;
    const terrain=o.terrain?JSON.parse(fs.readFileSync(path.resolve(o.terrain),'utf8')):null;
    const grid=o.grid?o.grid.split(',').map(Number):null;
    const armorCatalog=o['ruleset-dir']?scanArmorDirectory(path.resolve(o['ruleset-dir'])):null;
    const audit=auditBattleSpace(source,{terrain,grid,armorCatalog,
      xyTileMeters:o['tile-meters']?Number(o['tile-meters']):undefined,
      floorMeters:o['floor-meters']?Number(o['floor-meters']):undefined,
      invertY:o.invertY});
    console.log(JSON.stringify(audit,null,2));
  }catch(err) {
    console.error('[XPZ3D spatial audit] '+(err.code||'ERROR')+': '+err.message);
    process.exitCode=1;
  }
}
