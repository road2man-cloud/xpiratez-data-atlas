#!/usr/bin/env node
// Find distinct actual tactical layouts without touching user OXCE saves.
// Prints only mission type, source dimensions and counts; no roster/personal names.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractBattle} from '../stage24/bridge.mjs';

export function scanBattleSaves(dir,{limit=200}={}){
  const files=fs.readdirSync(dir,{withFileTypes:true})
    .filter(d=>d.isFile()&&d.name.toLowerCase().endsWith('.sav'))
    .map(d=>({name:d.name,full:path.join(dir,d.name),
      stamp:fs.statSync(path.join(dir,d.name)).mtimeMs}))
    .sort((a,b)=>b.stamp-a.stamp).slice(0,limit);
  const layout=new Map(), problems=[], notInBattle=[];
  for(const file of files){
    try{
      const b=extractBattle(file.full);
      const id=b.mission.type+'/'+b.mission.mapSize.join('x')+'/'+
        (b.mission.tilePayloadSha256||'missing');
      if(!layout.has(id))layout.set(id,{
        missionType:b.mission.type,mapSize:b.mission.mapSize,
        unitCount:b.counts.units,items:b.counts.items,
        geometricTilePayloadHash:b.mission.tilePayloadSha256,
        savesWithSameLayout:0,exampleFile:file.name,
      });
      layout.get(id).savesWithSameLayout++;
    }catch(e){
      if(e.code==='NOT_IN_BATTLE')notInBattle.push(file.name);
      else problems.push({file:file.name,code:e.code||'UNKNOWN',reason:e.message});
    }
  }
  const values=[...layout.values()];
  const shapeCounts={};
  for(const x of values){
    const k=x.mapSize.join('x');
    shapeCounts[k]=(shapeCounts[k]||0)+1;
  }
  return {schema:'xpz3d.real-battle-map-diversity.v1',
    filesInspected:files.length,
    distinctGeneratedBattleLayouts:values.length,
    distinctMapShapes:shapeCounts,
    representativeLayouts:values.sort((a,b)=>a.missionType.localeCompare(b.missionType)),
    savesWithoutGeneratedBattle:notInBattle.length,
    unreadableOrUnsupported:problems,
    readOnly:true,
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length<1)throw Error('Usage: node scan-battle-map-diversity.mjs save_directory [limit]');
    const result=scanBattleSaves(path.resolve(args[0]),{limit:args[1]?Number(args[1]):200});
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error('[XPZ3D map diversity] '+e.message);process.exitCode=1;}
}
