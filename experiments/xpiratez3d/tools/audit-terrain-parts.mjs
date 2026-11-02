#!/usr/bin/env node
// Semantic provenance for OXCE's 4 tile-part slots: floor/west/north/object.
// Stable IDs allow a visual replacement, collider and destruction state to
// refer to the SAME original part even if its MCD record changes.
// No actual geometry or licensed assets are exported.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {tilePartReference} from './spatial-contract.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function need(x, message) {if(!x) throw new Error(message);}
function count(map,k){map[k]=(map[k]||0)+1;}
function counts(map) {
  return Object.fromEntries(Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})));
}
export function indexTileParts(battle, {region=null,terrainManifest=null}={}) {
  need(Array.isArray(battle?.dims) && battle.dims.length===3 &&
    Array.isArray(battle?.tiles) && Array.isArray(battle?.terrainSets) &&
    typeof battle.battleId==='string' && battle.battleId.length>=8,
    'Missing identity/size/terrain sets in decoded OXCE battle');
  const [W,H,Z]=battle.dims;
  const crop=region ?? [0,0,W,H];
  need(Array.isArray(crop)&&crop.length===4 && crop.every(Number.isSafeInteger) &&
    crop[0]>=0 && crop[1]>=0 && crop[2]>0 && crop[3]>0 &&
    crop[0]+crop[2]<=W && crop[1]+crop[3]<=H,'Bad source tile region');
  const keySet=new Set(), geomPairs=[], kinds={},datasets={},floors={};
  let selectedTiles=0,skippedEmpty=0,openedDoorFlag=0;
  for(const t of battle.tiles){
    need(Number.isSafeInteger(t.x)&&Number.isSafeInteger(t.y)&&Number.isSafeInteger(t.z) &&
      t.x>=0 && t.y>=0 && t.z>=0 && t.x<W && t.y<H && t.z<Z &&
      Array.isArray(t.ids)&&Array.isArray(t.sets)&&
      t.ids.length===4 && t.sets.length===4,
      'Malformed OXCE saved tile');
    if(t.x<crop[0]||t.x>=crop[0]+crop[2]||t.y<crop[1]||t.y>=crop[1]+crop[3])continue;
    selectedTiles++;
    for(let part=0;part<4;part++){
      const id=t.ids[part],set=t.sets[part];
      if(id===-1&&set===-1){skippedEmpty++;continue;}
      need(Number.isSafeInteger(id)&&id>=0&&Number.isSafeInteger(set)&&set>=0 &&
        set<battle.terrainSets.length, 'Corrupt tile part data at '+[t.x,t.y,t.z,part]);
      const terrain=battle.terrainSets[set];
      need(typeof terrain==='string' && terrain.length>0,'Unknown OXCE MCD dataset');
      const flaggedOpen=(part===1 && (t.flags&8)!==0) ||
        (part===2 && (t.flags&16)!==0);
      const entry=tilePartReference({
        battleId:battle.battleId,tile:[t.x,t.y,t.z],
        part,dataset:terrain,mcdId:id,
        state:flaggedOpen?'saved-open-flag':'saved-part-state-unverified',
      });
      need(!keySet.has(entry.sourceRef),'Duplicated source object/part identity: '+entry.sourceRef);
      keySet.add(entry.sourceRef);
      // Do not retain mesh vertices, color textures, MCD record bytes, or unit names.
      geomPairs.push(entry.sourceRef+'='+entry.definitionRef);
      count(kinds,entry.partKind);
      count(datasets,terrain);
      count(floors,t.z);
      if(flaggedOpen)openedDoorFlag++;
    }
  }
  geomPairs.sort();
  const reply={
    schema:'xpz3d.tile-part-provenance.v1',
    sourceBattleId:battle.battleId,
    sourceSaveSha256:battle.sourceHash||null,
    sourceSize:[...battle.dims],
    region:[...crop],selectedSavedTileRecords:selectedTiles,
    sourcePartSlotsSeen:selectedTiles*4,
    emptySlots:skippedEmpty,
    referencedParts:keySet.size,
    sourcePartDefinitionDigest:sha(geomPairs.join('\n')),
    bySourcePart:counts(kinds),byTerrainDataset:counts(datasets),
    byFloor:counts(floors),
    nativeS2MeshCollidersIndividuallyBound:false,
    nativeDestructionCallbacksMapped:false,
    savedOpenDoorFlags:openedDoorFlag,
    geometryMcdOverrideRulesApplied:false,
    notes:[
      'SourceRef is stable by battleId/tile/part; MCD ID is the changing definition.',
      'Matching each source object to a destructible/visible S2 entity is NOT done here.',
      'Saved door flags and MCD door state must be reconciled before registering native movable doors.',
    ]
  };
  if(terrainManifest){
    need(terrainManifest.schema==='xpz3d.oxce-terrain-mesh.v1' &&
      terrainManifest.source.battleId===battle.battleId &&
      (battle.sourceHash==null || terrainManifest.source.saveSha256==null ||
       terrainManifest.source.saveSha256===battle.sourceHash) &&
      JSON.stringify(terrainManifest.source.mapSize)===JSON.stringify(battle.dims),
      'Incompatible Stage26 terrain manifest');
    need(JSON.stringify(terrainManifest.conversion.region)===JSON.stringify(crop),
      'Terrain crop region differs');
    const c=terrainManifest.counts;
    reply.stage26MeshAccounting={
      manifestReferencedParts:c.mapTilePartReferences,
      manifestMeshedParts:c.meshedPartInstances,
      manifestEmptyLoftSkipped:c.missingSolidLofts,
      manifestOpenDoorsSkipped:c.excludedOpenedDoors,
      sourceReferencesMatch:c.mapTilePartReferences===keySet.size,
      accountedTotal:c.meshedPartInstances+c.missingSolidLofts+c.excludedOpenedDoors,
    };
    reply.stage26MeshAccounting.allPartsAccounted=
      reply.stage26MeshAccounting.sourceReferencesMatch &&
      reply.stage26MeshAccounting.accountedTotal===keySet.size;
    need(reply.stage26MeshAccounting.allPartsAccounted,
      'Mesh converter omitted or double-counted a source part: FAIL');
  }
  return reply;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const args=process.argv.slice(2),opt={};
    while(args.length){
      const name=args.shift();
      need(['--save','--battle','--terrain'].includes(name)&&args.length>0,
        'Usage: --save file.sav [--battle battle-start.json] [--terrain terrain-manifest.json]');
      opt[name.slice(2)]=args.shift();
    }
    need(opt.save,'Source OXCE battle save required');
    // Reuse Stage24 identity and Stage26 tile decoding; do not make a new YAML parser.
    const module=await import('../stage26/convert-terrain.mjs');
    const battle=module.readBattle(path.resolve(opt.save),opt.battle?path.resolve(opt.battle):null);
    if(!opt.battle){
      const bridge=await import('../stage24/bridge.mjs');
      const identity=bridge.extractBattle(path.resolve(opt.save));
      need(identity.origin.sourceSha256===battle.sourceHash &&
        JSON.stringify(identity.mission.mapSize)===JSON.stringify(battle.dims),
        'Stage24/Stage26 decoder mismatch');
      battle.battleId=identity.battleId;
    }
    const terrain=opt.terrain?
      JSON.parse(fs.readFileSync(path.resolve(opt.terrain),'utf8')):null;
    console.log(JSON.stringify(indexTileParts(battle,{
      region:terrain?.conversion?.region??null,terrainManifest:terrain}),null,2));
  }catch(e){
    console.error('[XPZ3D tile-part provenance] '+e.message);
    process.exitCode=1;
  }
}
