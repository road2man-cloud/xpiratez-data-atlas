// Common source extraction for legacy 1.1.1 acquisition indexes. The UI
// shares a facility graph, not any v.o2 game rule or per-save assumption.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const strings=value=>[...new Set((Array.isArray(value)?value:[])
  .map(x=>typeof x==='string'?x:x?.id).filter(x=>typeof x==='string'&&x))];
export function buildLegacyFacilityTechSource({sourceVersion,sourceMetadataSha256,requiredEngine}){
  const root=path.resolve('public/data');
  const index=JSON.parse(fs.readFileSync(path.join(root,'facilities-index.json'),'utf8'));
  assert.equal(index.meta.mod.version,sourceVersion,'Mixed item/facility game versions');
  assert.equal(index.meta.mod.requiredExtendedVersion,requiredEngine,'Mixed facility OXCE versions');
  assert.equal(index.meta.source.metadataSha256,sourceMetadataSha256,
    'Facility and item/research source metadata differ');
  const raw=new Map();
  for(const bucket of '0123456789abcdef'){
    const file=path.join(root,'facility-chunks',bucket+'.json');
    const details=JSON.parse(fs.readFileSync(file,'utf8')).details;
    for(const [id,d] of Object.entries(details||{})){
      assert(!raw.has(id)&&d.id===id,'Duplicate or mismatched facility '+id);
      raw.set(id,d);
    }
  }
  assert.equal(raw.size,index.index.length);
  const facilities={},functions={};
  for(const row of index.index){
    const d=raw.get(row.id);
    assert(d&&d.koName===row.koName,'Facility index/detail mismatch '+row.id);
    const provides=strings(d.provideBaseFunc);
    const record={id:d.id,name:d.koName,english:d.enName,
      available:d.available===true,stateOnly:d.stateOnly===true,
      startingCount:Number(d.startingCount)||0,
      requires:strings(d.requires),requiresBaseFunc:strings(d.requiresBaseFunc),
      provideBaseFunc:provides,
      buildCost:d.buildCost??null,buildTime:d.buildTime??null,
      buildItems:(d.buildItems||[]).filter(x=>x.id).map(x=>({id:x.id,qty:Number(x.build)||0})),
      buildOverFacilities:strings(d.buildOverFacilities),
      maxAllowedPerBase:d.maxAllowedPerBase??null,
      sourceFiles:strings(d.sourceFiles)};
    facilities[row.id]=record;
    for(const func of provides)(functions[func]??=[]).push(row.id);
  }
  for(const providers of Object.values(functions))providers.sort();
  return {meta:{schemaVersion:1,sourceVersion,requiredEngine,sourceMetadataSha256,
    facilityCount:raw.size,functionCount:Object.keys(functions).length,
    limitation:'An indexed provider is not proof that its facility can be built in the current base'},
    facilities,functions};
}
