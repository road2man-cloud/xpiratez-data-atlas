// V154: supplement missing item-supply evidence from hash-matched v.o2 rules.
// This catalog does not grant a single item. It retains complete random pools,
// actual map/deployment witnesses, and recipe side effects for future adapters.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {buildMapLootSources} from './soldier-map-provenance.mjs';
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const root=arg('source',null);assert(root,'--source=<mod root> required');
const require=createRequire(import.meta.url),yaml=require(arg('yaml','js-yaml'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
const wanted=['STR_BOOK_OF_SERMONS','STR_RAIDER_SCOUT','STR_RAIDER_FLAME_GUARD','STR_ZOMBIE_STERILE_TERRORIST','STR_LOOTBOX_EXPEDITION','STR_CASINO_KUPON_3','STR_GLAMOUR'];
const arr=x=>Array.isArray(x)?x:[];
const hashes=data.meta.source.rules;
assert.equal(sha(fs.readFileSync(path.join(root,'metadata.yml'))),data.meta.source.metadataSha256);
const files=fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort((a,b)=>a.localeCompare(b,'en'));
assert.deepEqual(files,[...hashes.map(f=>f.file)].sort((a,b)=>a.localeCompare(b,'en')));
const sections=new Set(['items','research','manufacture','terrains','mapScripts','alienDeployments','alienMissions','missionScripts','events','eventScripts','units','alienRaces']);
function merge(a,b){if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?merge(out[k],v):v;return out;}return b;}
const identity=x=>{for(const k of ['type','name','id','article','race','category','region','deployment','missionName','script','eventScript','cutscene','commendation'])if(typeof x?.[k]==='string')return k+':'+x[k];return null;};
function mergeSection(a,b){
 if(!Array.isArray(a)||!Array.isArray(b))return merge(a,b);
 const out=[...a],idx=new Map();const rebuild=()=>{idx.clear();out.forEach((x,i)=>{const id=identity(x);if(id)idx.set(id,i);});};rebuild();
 for(const x of b){
  if(typeof x?.delete==='string'){const i=out.findIndex(y=>y&&typeof y==='object'&&Object.values(y).includes(x.delete));if(i>=0){out.splice(i,1);rebuild();}continue;}
  const id=identity(x);if(id&&idx.has(id)){const i=idx.get(id);out[i]=merge(out[i],x);}else{out.push(x);if(id)idx.set(id,out.length-1);}
 }return out;
}
function resolve(v,depth=0){assert(depth<=32);if(!v||typeof v!=='object'||Array.isArray(v))return v;const {refNode,...child}=v;return refNode&&typeof refNode==='object'&&!Array.isArray(refNode)?merge(resolve(refNode,depth+1),child):child;}
const merged={};
for(const file of files){
 const bytes=fs.readFileSync(path.join(root,'Ruleset',file));assert.equal(sha(bytes),hashes.find(x=>x.file===file).sha256,file);
 yaml.loadAll(bytes.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  for(const [k,v] of Object.entries(doc||{}))if(sections.has(k))merged[k]=k in merged?mergeSection(merged[k],v):v;
 },{json:true});
}
for(const [k,v] of Object.entries(merged))merged[k]=Array.isArray(v)?v.map(x=>resolve(x)):resolve(v);
const loot=buildMapLootSources(merged,wanted,{maxPerItem:10000});
const contains=(value,id)=>JSON.stringify(value??null).includes(JSON.stringify(id));
const items=wanted.map(id=>{
 const item=arr(merged.items).find(r=>r.type===id);
 const research=arr(merged.research).filter(r=>r.name===id||r.spawnedItem===id||contains(r.spawnedItemList,id));
 const events=arr(merged.events).filter(r=>[r.everyItemList,r.everyMultiItemList,r.randomItemList,r.randomMultiItemList,r.weightedItemList].some(x=>contains(x,id))).map(r=>({id:r.name,raw:r,scripts:arr(merged.eventScripts).filter(s=>contains(s,r.name)),randomSlots:arr(r.randomItemList).filter(k=>k===id).length,randomPoolSize:arr(r.randomItemList).length}));
 const manufacture=arr(merged.manufacture).filter(r=>contains(r.producedItems,id)||contains(r.randomProducedItems,id)||r.name===id).map(r=>({id:r.name,raw:r,randomOutcomes:arr(r.randomProducedItems).map((x,index)=>({index,weight:x[0],outputs:x[1]})).filter(x=>x.outputs?.[id]>0),randomWeightTotal:arr(r.randomProducedItems).reduce((n,x)=>n+Number(x[0]||0),0)}));
 const unitEquipment=arr(merged.units).filter(r=>contains(r.builtInWeaponSets,id)).map(r=>({id:r.type,race:r.race,rank:r.rank,weaponSets:r.builtInWeaponSets}));
 return {id,itemDefined:!!item,research:research.map(r=>({id:r.name,requires:r.requires||[],dependencies:r.dependencies||[],needItem:r.needItem??false,destroyItem:r.destroyItem??false,spawnedItem:r.spawnedItem??null,spawnedItemList:r.spawnedItemList??null})),events,manufacture,unitEquipment,mapLoot:loot[id]||{sourceCount:0,sources:[]},sourceStatus:'RAW_SOURCE_PROVENANCE_ONLY',recovered:0};
});
const report={schema:'ATLAS_OVERCAP_SUPPLEMENTAL_SUPPLY_V1',sourceVersion:'v.o2',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,scope:'Hash-matched original rules. Source existence is not delivery; map placement, mission success, equipment extraction and random outcomes require a separate chronological witness.',items};
const out='tools/data/overcap-supplemental-supply-v1-'+sha(JSON.stringify(report)).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(gunzipSync(fs.readFileSync(out))),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary:items.map(i=>({id:i.id,events:i.events.map(e=>({id:e.id,slots:e.randomSlots,pool:e.randomPoolSize,scriptCount:e.scripts.length})),recipes:i.manufacture.map(m=>({id:m.id,randomOutcomes:m.randomOutcomes.length,weight:m.randomWeightTotal})),units:i.unitEquipment.map(u=>u.id),mapSources:i.mapLoot.sourceCount,missionPaths:i.mapLoot.sources.reduce((n,s)=>n+s.missionPaths.length,0),fixedMaps:i.mapLoot.sources.filter(s=>s.placement==='fixedOnBlock').length}))}).slice(0,24000));
