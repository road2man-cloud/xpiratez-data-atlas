// V158: exact raw evidence for repeat-event research sources.
// Restricted to the listed topics, no global ruleset publication.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sha=b=>createHash('sha256').update(b).digest('hex');
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const root=arg('source'),yaml=createRequire(import.meta.url)(arg('yaml')||'js-yaml');assert(root);
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
assert.equal(sha(fs.readFileSync(path.join(root,'metadata.yml'))),data.meta.source.metadataSha256);
const wanted=['STR_GUILD_MEDIC','STR_HUMAN_MASTER','STR_HUMAN_NOBLEWOMAN','STR_ZOMBIE_STERILE_TERRORIST','STR_ZOMBIE_STERILE_CORPSE','STR_ZOMBIE_GRUBAS_CORPSE','STR_MEDICAL_SUPPLIES','STR_CRACK','STR_ARCANE_BOOK','STR_ZOMBIE_GRUBAS_TERRORIST','STR_VAMPIRE_ESSENCE','STR_ZOMBIE_ESSENCE','STR_VAMPIRE_BLOOD'];
const hashes=data.meta.source.rules,rows=[];
assert.deepEqual(fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort(),hashes.map(x=>x.file).sort());
for(const f of hashes){
 const b=fs.readFileSync(path.join(root,'Ruleset',f.file));assert.equal(sha(b),f.sha256,f.file);
 yaml.loadAll(b.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  for(const r of doc?.research||[]){if(!wanted.includes(r.name||r.delete))continue;assert(!r.delete&&!r.refNode,'Unsupported raw overlay');
   assert(!rows.some(x=>x.id===r.name),'Multiple overlays: '+r.name);
   rows.push({id:r.name,file:f.file,sha256:f.sha256,raw:r});
  }
 },{json:true});
}
assert.equal(rows.length,wanted.length);
const result={schema:'ATLAS_OVERCAP_REPEAT_RESEARCH_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,rows:rows.sort((a,b)=>a.id.localeCompare(b.id)),scope:'Exact original raw research records for narrowly scoped repeated event reward and research side effect checks.'};
const out='tools/data/overcap-repeat-research-source-v1-'+sha(JSON.stringify(result)).slice(0,20)+'.json';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(fs.readFileSync(out)),result);else fs.writeFileSync(out,JSON.stringify(result)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,rows:rows.map(x=>({id:x.id,fields:Object.keys(x.raw)}))}));
