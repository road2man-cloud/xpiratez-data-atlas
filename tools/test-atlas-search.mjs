import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sources,toRecords,find,target,related} from '../public/branch-soldier-atlas-search-core.js';
const records=sources.flatMap(s=>toRecords(s.key,JSON.parse(fs.readFileSync(new URL('../public/data/'+s.file+'.json',import.meta.url)))));
const byKey=new Map(records.map(r=>[r.kind+':'+r.id,r]));
assert.equal(byKey.size,records.length,'duplicate typed IDs');
const byId=new Map();
for(const r of records){if(!byId.has(r.id))byId.set(r.id,[]);byId.get(r.id).push(r);}
const counts={};
for(const r of records){counts[r.kind]=(counts[r.kind]||0)+1;assert(r.name);const url=target(r);if(url){const page=url.split('?')[0];assert(fs.existsSync(new URL('../public/'+page+'index.html',import.meta.url)),page);}}
assert.equal(counts.origin,72);
assert(find(records,'농부','origin').length>0);
assert(find(records,'라미아','soldier').length>0);
assert.equal(find(records,'STR_PERSONAL_ATTENTION','training')[0]?.id,'STR_PERSONAL_ATTENTION');
assert(find(records,'personal attention','training').length>0);
assert(find(records,'STR_PERSONAL_ATTENTION').some(r=>r.kind==='research'));
const tr=byKey.get('training:STR_PERSONAL_ATTENTION');
assert(related(tr,byKey,byId).some(r=>r.record.kind==='research'));
assert(related(tr,byKey,byId).some(r=>r.record.kind==='bonus'));
assert.throws(()=>toRecords('research',{meta:{sourceVersion:'v.o1.1.1'},entries:[]}));
console.log(JSON.stringify({counts,total:records.length,related:related(tr,byKey,byId).length,tests:'passed'},null,2));
