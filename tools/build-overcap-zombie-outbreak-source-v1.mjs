// V159: exact raw proof for late zombie outbreak, containment and extraction.
// Hash every original ruleset file; reject overlays rather than silently merge.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sha=b=>createHash('sha256').update(b).digest('hex');
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const root=arg('source'),yaml=createRequire(import.meta.url)(arg('yaml')||'js-yaml');assert(root);
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
const lock=JSON.parse(fs.readFileSync('tools/headless-simulator/native/source.lock.json'));
assert.equal(sha(fs.readFileSync('tools/headless-simulator/native/'+lock.archive)),lock.archiveSha256);
assert.equal(sha(fs.readFileSync(path.join(root,'metadata.yml'))),data.meta.source.metadataSha256);
const wanted={
 missionScripts:['zombieOutbreakLate'],
 alienMissions:['STR_LOC_ZOMBIE_OUTBREAK2'],
 alienDeployments:['STR_LOC_ZOMBIE_OUTBREAK2'],
 alienRaces:['STR_ZOMBIE'],
 units:['STR_ZOMBIE_GRUBAS_TERRORIST','STR_ZOMBIE_BUSTER_TERRORIST'],
 armors:['ZOMBIE_GRUBAS_ARMOR','ZOMBIE_BUSTER_ARMOR'],
 items:['STR_ZOMBIE_GRUBAS_TERRORIST','STR_ZOMBIE_GRUBAS_CORPSE','STR_ZOMBIE_BUSTER_CORPSE'],
 facilities:['STR_BURROW'],
 research:['STR_ZOMBIE','STR_ZOMBIE_GRUBAS_TERRORIST','STR_ZOMBIE_BUSTER_CORPSE'],
 manufacture:['STR_ZOMBIE_BUSTER_CORPSE_EXTRACTION']
};
const hashes=data.meta.source.rules,rows=[];
assert.deepEqual(fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort(),hashes.map(x=>x.file).sort());
for(const f of hashes){
 const b=fs.readFileSync(path.join(root,'Ruleset',f.file));assert.equal(sha(b),f.sha256,f.file);
 yaml.loadAll(b.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  for(const [section,ids] of Object.entries(wanted))for(const r of doc?.[section]||[]){
   const id=r.type||r.name||r.id||r.delete;if(!ids.includes(id))continue;
   assert(!r.delete&&!r.refNode,'Unmodeled inheritance/delete: '+section+'/'+id);
   assert(!rows.some(x=>x.section===section&&x.id===id),'Multiple raw overlays: '+section+'/'+id);
   rows.push({section,id,file:f.file,sha256:f.sha256,raw:r});
  }
 },{json:true});
}
assert.equal(rows.length,Object.values(wanted).flat().length);
const report={schema:'ATLAS_OVERCAP_ZOMBIE_OUTBREAK_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,engineArchiveSha256:lock.archiveSha256,engineVersion:lock.engineVersion,engineEvidence:['BattlescapeGenerator.cpp:1704-1752','AlienRace.cpp:101-118','Unit.cpp:34-40,165-172','Armor.cpp:89-102','RuleItem.cpp:176','DebriefingState.cpp:2433-2451,2673-2768'],rows:rows.sort((a,b)=>(a.section+'/'+a.id).localeCompare(b.section+'/'+b.id)),scope:'One explicit conditional late outbreak deployment. Raw spawn eligibility, recovery mappings, containment, and deterministic extraction. No native combat execution.'};
const out='tools/data/overcap-zombie-outbreak-source-v1-'+sha(JSON.stringify(report)).slice(0,20)+'.json';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(fs.readFileSync(out)),report);else fs.writeFileSync(out,JSON.stringify(report)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,rows:rows.length,files:[...new Set(rows.map(r=>r.file))]}));
