import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
const base='public/data/';
const read=name=>JSON.parse(fs.readFileSync(base+name+'.json','utf8'));
function write(name,data){
  const bytes=Buffer.from(JSON.stringify(data));
  fs.mkdirSync(base+name.slice(0,name.lastIndexOf('/')+1),{recursive:true});
  fs.writeFileSync(base+name+'.json.gz',gzipSync(bytes,{level:9}));
  console.log(name,bytes.length,'raw bytes',gzipSync(bytes,{level:9}).length,'gzip bytes');
}
const soldiers=read('soldiers-index');
const {enhancementBuildSets,...soldierRuntime}=soldiers;
// Exact original combination sets, deferred until the final-build view is used.
write('soldiers-builds',{enhancementBuildSets});
write('soldiers-runtime',soldierRuntime);
const trainings=read('trainings-index');
const rawRules={};
const transformations=trainings.transformations.map(({rawRule,...t})=>{rawRules[t.id]=rawRule;return t;});
// Retain every name for search/labels; only referenced traits need effect fields.
const used=new Set(transformations.map(t=>t.soldierBonusType).filter(Boolean));
const bonuses=Object.fromEntries(Object.entries(trainings.bonuses).map(([id,b])=>[id,used.has(id)?b:{id:b.id,koName:b.koName,enName:b.enName}]));
write('trainings-runtime',{...trainings,transformations,bonuses});
write('training-raw-rules',{rawRules});
const manufacture=read('manufacture-index');
const fields=['id','bucket','koName','enName','category','categoryKo','role','roleKo','time','cost','requiredItemCount','inputSummary','outputSummary','outputItemCount','randomOptionCount','researchCount','researchCost','baseFuncs','baseFuncCount','economicComparable','opportunityNet','opportunityNetPerEngineerHour'];
write('manufacture-search',{search:Object.fromEntries(manufacture.index.map(row=>[row.id,row.searchText]))});
write('manufacture-runtime',{...manufacture,index:manufacture.index.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))});
// Preserve ordinal research IDs used by progression plan buckets.
write('soldier-research-labels',{topics:read('progression-research').topics.map(({id,koName,enName})=>({id,koName,enName}))});
// Existing canonical progression remains available to other DBs.
fs.writeFileSync(base+'progression.json.gz',gzipSync(fs.readFileSync(base+'progression.json'),{level:9}));
fs.writeFileSync(base+'choice-simulator-index.json.gz',gzipSync(fs.readFileSync(base+'choice-simulator-index.json'),{level:9}));
const progression=read('progression');
write('crafts-runtime',{
  crafts:progression.crafts,
  recipes:Object.fromEntries(Object.entries(progression.recipes).map(([id,r])=>[id,{id:r.id,koName:r.koName,enName:r.enName,eventVariants:(r.eventVariants||[]).map(v=>({eventId:v.eventId}))}])),
  events:Object.fromEntries(Object.entries(progression.events).map(([id,e])=>[id,{id:e.id,koName:e.koName,enName:e.enName}]))
});
