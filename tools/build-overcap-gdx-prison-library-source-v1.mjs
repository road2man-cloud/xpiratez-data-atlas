// V163: hash-bound GDX prison, explicit unlock and library supply evidence.
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
assert.equal(sha(fs.readFileSync(path.join(root,'metadata.yml'))),data.meta.source.metadataSha256);
assert.equal(sha(fs.readFileSync('tools/headless-simulator/native/'+lock.archive)),lock.archiveSha256);
const wanted={missionScripts:['gdxPrisonMission'],alienMissions:['STR_LOC_GDX_PRISON'],alienDeployments:['STR_LOC_GDX_PRISON'],terrains:['GDX_PRISON'],mapScripts:['GDX_PRISON'],startingConditions:['STR_STARCON_PRISON'],items:['STR_GDX_005','STR_PILLOW_BOOK'],research:['STR_GDX_005','STR_LOC_GDX_PRISON_DONE','STR_SCHOOL_BOOKS','STR_SCHOOL_BOOKS_ITEM','STR_LIBRARY','STR_PLOTTING','STR_PILLOW_BOOK','STR_MASH','STR_SS_OPERATIONS','STR_MESS_HALL'],facilities:['STR_LIBRARY','STR_MASH','STR_MESS_HALL','STR_STILL'],manufacture:['STR_PILLOW_BOOK']};
const files=data.meta.source.rules,rows=[];let startingStill=null;
assert.deepEqual(fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort(),files.map(x=>x.file).sort());
for(const f of files){
 const b=fs.readFileSync(path.join(root,'Ruleset',f.file));assert.equal(sha(b),f.sha256,f.file);
 yaml.loadAll(b.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  if(doc?.startingBase){assert(!startingStill);const matches=doc.startingBase.facilities.filter(x=>x.type==='STR_STILL');assert.equal(matches.length,1);startingStill={file:f.file,sha256:f.sha256,placement:matches[0]};}
  for(const [section,ids] of Object.entries(wanted))for(const r of doc?.[section]||[]){
   const id=r.type||r.name||r.id||r.delete;if(!ids.includes(id))continue;
   assert(!r.refNode&&!r.delete&&!rows.some(x=>x.section===section&&x.id===id),section+'/'+id);
   // Only the placement/craft eligibility subset is needed from the starting condition.
   const raw=section==='startingConditions'?{type:r.type,allowedSoldierTypes:r.allowedSoldierTypes,allowedCraft:r.allowedCraft}:r;
   rows.push({section,id,file:f.file,sha256:f.sha256,raw});
  }
 },{json:true});
}
assert(startingStill);assert.equal(rows.length,Object.values(wanted).flat().length);
const report={schema:'ATLAS_OVERCAP_GDX_PRISON_LIBRARY_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:files,engineArchiveSha256:lock.archiveSha256,startingStill,rows:rows.sort((a,b)=>(a.section+'/'+a.id).localeCompare(b.section+'/'+b.id)),engineEvidence:['SavedGame.cpp:1743-1836 (explicit unlock bypasses dependencies, not requires)','SavedGame.cpp:3276-3329 (mission research grant)','DebriefingState.cpp:2135-2155','RuleItem.cpp:176 (recover default true)','RuleManufacture.cpp:34-38,62-64 (implicit output)'],scope:'Conditional mission recovery, explicit research unlock and facility/recipe facts. No native tactical or economic certification.'};
const out='tools/data/overcap-gdx-prison-library-source-v1-'+sha(JSON.stringify(report)).slice(0,20)+'.json';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(fs.readFileSync(out)),report);else fs.writeFileSync(out,JSON.stringify(report)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,rows:rows.length,files:[...new Set(rows.map(r=>r.file))],bytes:fs.statSync(out).size}));
