// V160: targeted hash-bound starting base, live specimen and laboratory proof.
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
const wanted={facilities:['STR_LABORATORY','STR_JAIL','STR_PERSONAL_LABS'],items:['STR_SC_WIRE','STR_ZOMBIE_BUSTER_TERRORIST','STR_ZOMBIE_CARRIE_TERRORIST','STR_ZOMBIE_CARRIE_CORPSE'],units:['STR_ZOMBIE_CARRIE_TERRORIST'],armors:['ZOMBIE_CARRIE_ARMOR'],research:['STR_ZOMBIE_BUSTER_TERRORIST','STR_ZOMBIE_BRAIN','STR_ZOMBIE_CARRIE_TERRORIST','STR_ZOMBIE_COMMUNICATION_DEVICE'],manufacture:['STR_ZOMBIE_BUSTER_TERRORIST_EXTRACTION'],alienMissions:['STR_LOC_RATLING_VILLAGE'],alienDeployments:['STR_LOC_RATLING_VILLAGE'],missionScripts:['ratlingVillage2']};
const hashes=data.meta.source.rules,rows=[];let start=null;
assert.deepEqual(fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort(),hashes.map(x=>x.file).sort());
for(const f of hashes){
 const bytes=fs.readFileSync(path.join(root,'Ruleset',f.file));assert.equal(sha(bytes),f.sha256,f.file);
 yaml.loadAll(bytes.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  if(doc?.startingBase){assert(!start,'Multiple starting base definitions');start={file:f.file,sha256:f.sha256,facilities:doc.startingBase.facilities,items:doc.startingBase.items};}
  for(const [section,ids] of Object.entries(wanted))for(const r of doc?.[section]||[]){
   const id=r.type||r.name||r.id||r.delete;if(!ids.includes(id))continue;
   assert(!r.refNode&&!r.delete&&!rows.some(x=>x.section===section&&x.id===id),section+'/'+id);
   rows.push({section,id,file:f.file,sha256:f.sha256,raw:r});
  }
 },{json:true});
}
assert(start);assert.equal(rows.length,Object.values(wanted).flat().length);
const report={schema:'ATLAS_OVERCAP_BRAIN_SUPPORT_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,engineArchiveSha256:lock.archiveSha256,startingBase:start,rows:rows.sort((a,b)=>(a.section+'/'+a.id).localeCompare(b.section+'/'+b.id)),scope:'Raw starting facility evidence and live specimen/extraction prerequisites. Starting item data are evidence only, not retroactively credited.'};
const out='tools/data/overcap-brain-support-source-v1-'+sha(JSON.stringify(report)).slice(0,20)+'.json';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(fs.readFileSync(out)),report);else fs.writeFileSync(out,JSON.stringify(report)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,rows:rows.length,startingFacilities:start.facilities.length,files:[...new Set(rows.map(r=>r.file))]}));
