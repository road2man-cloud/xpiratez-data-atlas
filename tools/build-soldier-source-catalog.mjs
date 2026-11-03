// Small exact-version naming/item-existence catalog, NOT another research DB.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import yaml from 'js-yaml';
const source=process.argv[process.argv.indexOf('--source')+1];
if(!process.argv.includes('--source')||!source)throw Error('--source <v.o2 mod> required');
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const itemIds=new Set();
for(const file of data.meta.source.rules){
  const full=path.join(source,'Ruleset',file.file);
  if(hash(full)!==file.sha256)throw Error('현재 v.o2 규칙 해시 불일치: '+file.file);
  yaml.loadAll(fs.readFileSync(full,'utf8').replace(/^\uFEFF/,''),doc=>{
    for(const item of doc?.items||[]){if(item.delete)itemIds.delete(item.delete);else if(item.type)itemIds.add(item.type);}
  },{json:true});
}
const koPath=path.join(source,'Language','ko.yml'),enPath=path.join(source,'Language','en-US.yml');
let ko={},koParsed=true;
try{const text=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(koPath));
  const doc=yaml.load(text.replace(/^\uFEFF/,''),{json:true});ko=doc.ko||doc;
}catch{koParsed=false;console.log('NOTICE: live Korean locale is not valid UTF-8/YAML; keep indexed v.o2 names and English fallback. No game files modified.');}
const enDoc=yaml.load(fs.readFileSync(enPath,'utf8').replace(/^\uFEFF/,''),{json:true});
const en=enDoc['en-US']||enDoc;
for(const row of [...data.soldiers,...data.transformations,...data.bonuses])if(row.koName)ko[row.id]=row.koName;
for(const row of data.profiles)if(row.sourceKoName)ko[row.sourceId]=row.sourceKoName;
// Include v.o2 event, mission, map, and facility provenance names in the
// SAME source-hashed label catalog. The legacy event DB is v.o1.1.1; it
// cannot name or supply present-version soldier origins.
const eventIds=[
  ...data.profiles.flatMap(p=>[p.sourceId,...(p.acquisitionEventScripts||[]).map(s=>s.script)]),
  ...Object.values(data.eventResearchSources||{}).flatMap(rows=>rows.flatMap(e=>
    [e.event,...(e.scripts||[]).map(s=>s.script)])),
  ...Object.values(data.missionResearchSources||{}).flatMap(rows=>rows.flatMap(m=>
    [m.deployment,m.startingCondition,...(m.scripts||[]).map(s=>s.script)])),
  ...Object.values(data.itemSupply||{}).flatMap(s=>[
    ...(s.eventGrants||[]).flatMap(e=>[e.event,...(e.scriptRoutes||[]).map(r=>r.script)]),
    ...(s.mapLoot?.sources||[]).flatMap(e=>[
      e.terrain,e.mapScript,e.block,...(e.missionPaths||[]).flatMap(m=>
        [m.deployment,m.mission,m.script])])
  ]),
  ...Object.keys(data.baseFacilityFunctions||{})
];
const ids=new Set([
  ...Object.keys(data.researchRules),...itemIds,
  ...data.transformations.map(x=>x.id),...data.soldiers.map(x=>x.id),
  ...eventIds.filter(x=>typeof x==='string'&&x.length)
]);
const names=Object.fromEntries([...ids].sort().map(id=>[id,String(ko[id]??en[id]??id).replaceAll('{NEWLINE}',' ').replaceAll('{SMALLLINE}',' ')]));
const out={schemaVersion:1,sourceVersion:'v.o2',sourceHashes:data.meta.source.rules,koParsed,
  translationNote:koParsed?'current source locale':'indexed v.o2 names and current source English; invalid live Korean locale was not used',
  languages:[{file:'Language/ko.yml',sha256:hash(koPath)},{file:'Language/en-US.yml',sha256:hash(enPath)}],
  itemIds:[...itemIds].sort(),names};
fs.writeFileSync('public/data/soldier-source-catalog.json',JSON.stringify(out)+'\n');
console.log(JSON.stringify({items:itemIds.size,names:Object.keys(names).length}));
