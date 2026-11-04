// Versioned acquisition sources: legacy item rules + cross-system usage +
// original manufacture recipe gates. Event grants remain conditional on event
// occurrence and are NEVER converted to guaranteed game-time acquisitions.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {buildLegacyFacilityTechSource} from './legacy-facility-tech-source.mjs';

const itemsRoot=path.resolve('public/items/data');
const globalRoot=path.resolve('public/data');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const ids=v=>[...new Set((Array.isArray(v)?v:[]).filter(x=>typeof x==='string'&&x))];
const itemIndex=read(path.join(itemsRoot,'items-index.json'));
const usageIndex=read(path.join(itemsRoot,'item-usage-index.json'));
const mfgIndex=read(path.join(globalRoot,'manufacture-index.json'));
const entityNames=read(path.join(itemsRoot,'entities.json')).names||{};
assert.equal(itemIndex.meta.mod.version,'v.o1.1.1','Unexpected item source version');
assert.equal(itemIndex.meta.mod.requiredExtendedVersion,'8.6','Unexpected OXCE version');
assert.equal(mfgIndex.meta.sourceVersion,'XPiratez '+itemIndex.meta.mod.version,
  'Manufacture and item source version mismatch');
assert.equal(itemIndex.index.length,usageIndex.meta.itemCount);
assert.equal(mfgIndex.index.length,usageIndex.meta.manufactureCount);
const itemDetail=new Map(),usageDetail=new Map(),mfgDetail=new Map();
const itemFiles={},usageFiles={},mfgFiles={};
for(const bucket of '0123456789abcdef'){
  const load=(root,prefix,dest,shaMap)=>{
    const file=path.join(root,prefix,bucket+'.json');
    const bytes=fs.readFileSync(file);
    shaMap[bucket]=hash(bytes);
    for(const [id,d] of Object.entries(JSON.parse(bytes).details)){
      assert(!dest.has(id),'Duplicate detail ID '+id);
      dest.set(id,d);
    }
  };
  load(itemsRoot,'chunks',itemDetail,itemFiles);
  load(itemsRoot,'item-usage-chunks',usageDetail,usageFiles);
  load(globalRoot,'manufacture-chunks',mfgDetail,mfgFiles);
}
assert.equal(itemDetail.size,itemIndex.index.length);
assert.equal(usageDetail.size,itemIndex.index.length);
assert.equal(mfgDetail.size,mfgIndex.index.length);
const items={},recipes={},usedRecipeIds=new Set(),eventIds=new Set();
let totalProducers=0,totalEvents=0,randomProducers=0;
for(const row of itemIndex.index){
  const d=itemDetail.get(row.id),usage=usageDetail.get(row.id);
  assert(d&&usage&&usage.id===row.id,'Item or usage detail mismatched '+row.id);
  const raw=d.raw||{};
  const buy=Number(d.effectiveCore?.costBuy??raw.costBuy??row.costBuy);
  const producers=(usage.produces||[]).map(x=>{
    assert(mfgDetail.has(x.id),'Missing linked manufacture recipe '+x.id);
    assert(Number.isFinite(Number(x.qty))&&Number(x.qty)>0,'Invalid production quantity');
    const recipe=mfgDetail.get(x.id);
    const random=x.kind==='random'?
      (recipe.randomOutputs||[]).find(o=>o.index===x.option):null;
    const outcome=x.kind==='random'?random?.outputs:recipe.deterministicOutputs;
    assert(outcome?.some(o=>o.id===row.id&&Number(o.qty)===Number(x.qty)),
      'Indexed producer output differs from original recipe '+row.id+' '+x.id);
    if(x.kind==='random')assert(x.relativeShare!=null&&
      Math.abs(Number(x.relativeShare)-Number(random?.probability))<1e-10,
      'Random-list probability differs from original source recipe '+row.id+' '+x.id);
    usedRecipeIds.add(x.id);
    totalProducers++;
    if(x.kind==='random')randomProducers++;
    return {id:x.id,kind:x.kind,qty:x.qty,option:x.option??null,
      relativeShare:x.relativeShare??null};
  });
  const grants=(usage.eventGrants||[]).map(g=>{
    totalEvents++;
    assert(g.id&&g.kind&&Number(g.qty)>0,'Malformed event item grant '+row.id);
    eventIds.add(g.id);
    return {id:g.id,kind:g.kind,qty:g.qty,option:g.option??null,
      relativeShare:g.relativeShare??null};
  });
  items[row.id]={
    id:row.id,name:d.koName,english:d.enName,
    costBuy:Number.isFinite(buy)&&buy>0?buy:null,
    requiresBuy:ids(raw.requiresBuy),
    purchaseSource:raw.costBuy!=null?'effective item rule':'inherited/default/indexed price',
    producers,grants,
    sourceFiles:ids(d.sourceFiles),
    // This limited route index cannot certify tactical map loot, drops,
    // per-store inventory, mission completion, or other external sources.
    acquisitionCoverage:'purchase price + manufacturing outcome + global event grant index only'
  };
}
for(const id of usedRecipeIds){
  const d=mfgDetail.get(id);
  recipes[id]={
    id:d.id,name:d.koName,english:d.enName,role:d.role,roleKo:d.roleKo,
    time:d.time,cost:d.cost,space:d.space,
    directRequires:ids(d.directRequires),requiresBaseFunc:ids(d.requiresBaseFunc),
    requiredItems:(d.requiredItems||[]).map(x=>({id:x.id,qty:x.qty})),
    sourceFiles:ids(d.sourceFiles),
    // The complete recipe output list is in manufacture-chunks, and per-item
    // outcome probability is taken only from usage's original random table.
    outcomeScope:'production outcome tied to the source recipe; no game-time success probability'
  };
}
// Event script gates are indexed separately from their reward outcome.
// A script is a possible occurrence route, not a guarantee it will fire.
const eventDetail=new Map(),eventFiles={};
for(const bucket of '0123456789abcdef'){
  const file=path.join(globalRoot,'event-chunks',bucket+'.json.gz');
  const bytes=fs.readFileSync(file);
  eventFiles[bucket]=hash(bytes);
  for(const [id,detail] of Object.entries(JSON.parse(zlib.gunzipSync(bytes)).details||{})){
    assert(!eventDetail.has(id),'Duplicate event ID '+id);
    eventDetail.set(id,detail);
  }
}
const events=Object.fromEntries([...eventIds].sort().map(id=>{
  const detail=eventDetail.get(id);
  const scripts=(detail?.scripts||[]).filter(s=>(s.eventRefs||[]).includes(id)||
    (s.eventWeights||[]).some(w=>(w.entries||[]).some(e=>e.eventId===id))||
    (s.oneTimeRandomEvents?.entries||[]).some(e=>e.eventId===id)||
    (s.oneTimeSequentialEvents||[]).some(e=>e.eventId===id));
  return [id,{
    name:detail?.koName||entityNames[id]?.[0]||id,
    english:detail?.enName||entityNames[id]?.[1]||null,
    occurrenceCoverage:detail?'indexed event scripts; source-specific scheduling remains unproven':'no event detail found',
    scripts:scripts.map(s=>({id:s.id,conditions:s.conditions||{},
      triggerMaps:s.triggerMaps||{},eventWeights:s.eventWeights||[],
      oneTimeRandomEvents:s.oneTimeRandomEvents||null,
      oneTimeSequentialEvents:s.oneTimeSequentialEvents||[],sourceFiles:s.sourceFiles||[]})),
    sourceFiles:detail?.sourceFiles||[]
  }];
}));
const facilities=buildLegacyFacilityTechSource({
  sourceVersion:itemIndex.meta.mod.version,
  sourceMetadataSha256:itemIndex.meta.source.metadataSha256,
  requiredEngine:itemIndex.meta.mod.requiredExtendedVersion
});
const result={meta:{
  schemaVersion:1,sourceVersion:itemIndex.meta.mod.version,
  requiredEngine:itemIndex.meta.mod.requiredExtendedVersion,
  sourceMetadataSha256:itemIndex.meta.source.metadataSha256,
  count:Object.keys(items).length,recipes:Object.keys(recipes).length,
  totalProducers,totalEvents,randomProducers,
  itemDetailSha256:itemFiles,itemUsageSha256:usageFiles,manufactureSha256:mfgFiles,
  eventDetailSha256:eventFiles,
  limitations:'Other tactical loot and missions are not fully indexed; shop stock and event occurrence not proven'
},items,recipes,events,facilities};
const serialized=JSON.stringify(result)+'\n';
const out=path.resolve('public/items/acquisition-index.json');
const zipped=zlib.gzipSync(Buffer.from(serialized),{level:9,mtime:0});
// Normalize OS marker in the GZIP header (Windows=10, Linux=3) for CI.
zipped[9]=255;
if(process.argv.includes('--check')){
  assert.equal(fs.readFileSync(out,'utf8'),serialized,'Stale item acquisition JSON');
  assert.deepEqual(fs.readFileSync(out+'.gz'),zipped,'Stale item acquisition gzip');
  console.log('PASS legacy item acquisition sources: '+result.meta.count+' items / '+
    result.meta.recipes+' recipes / '+totalProducers+' production edges / '+totalEvents+' event edges');
}else{
  fs.writeFileSync(out,serialized);
  fs.writeFileSync(out+'.gz',zipped);
  console.log('Built item acquisition index: '+Buffer.byteLength(serialized)+'B, compressed '+zipped.length+'B');
}
