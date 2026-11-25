import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,statKeys,exactCareerUrl} from '../public/branch-soldier-atlas-career-core.js';
import {rowsWithMissingOrigins,statValue,filterTable,sortTable,bodyCareerSummary} from '../public/branch-soldier-atlas-table-core.js';
const read=n=>fs.readFileSync(new URL('../public/data/'+n,import.meta.url));
const modern=JSON.parse(read('soldiers-modern-index.json'));
const metadata=modern.meta.source.metadataSha256;
const registry=JSON.parse(gunzipSync(read('branch-soldier-results.json.gz')));
assert.equal(registry.sourceMetadataSha256,metadata);
const branches=new Map(registry.branches.map(b=>[b.id,b]));
const profiles=new Map(modern.profiles.map(p=>[p.id,p]));
const names=Object.fromEntries([...modern.soldiers,...modern.transformations,...modern.bonuses].map(r=>[r.id,r.koName||r.enName||r.id]));
const ctx={profiles,branches,names,branchCaptains:new Map([...branches].map(([id,b])=>[id,b.captain])),selected:new Set()};
const records=ledgers.flatMap(l=>{
 const raw=JSON.parse(gunzipSync(read(l.file+'.json.gz'))),canonical=l.registryKey?registry[l.registryKey]:raw;
 assert(canonical,`missing shared ledger ${l.key}`);
 assert.deepEqual(canonical.routes,raw.routes,`source mismatch ${l.key}`);
 const result=project(l,canonical,metadata);assert.deepEqual(result.rejected,[]);return result.rows;
});
assert(records.some(r=>r.fixedModelOptimum));
const rows=rowsWithMissingOrigins(records,modern.profiles);
assert.equal(new Set(rows.map(r=>r.origin)).size,profiles.size);
assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
assert.equal(filterTable(rows,{},ctx).length,rows.length);
const missing=filterTable(rows,{missingOnly:true},ctx);
assert(missing.every(r=>!records.some(x=>x.origin===r.origin)&&r.cap===null));
assert.equal(records.length+missing.length,rows.length);
assert(missing.every(r=>statValue(r,'firing','cap',profiles)===null));
assert(missing.every(r=>statValue(r,'firing','birthMax',profiles)===profiles.get(r.origin).effectiveStats.max.firing));
for(const key of statKeys){
 const ordered=sortTable(rows,key,'desc','cap',ctx).filter(r=>!r.missing);
 assert(ordered.every((r,i)=>!i||statValue(ordered[i-1],key,'cap',profiles)>=statValue(r,key,'cap',profiles)));
}
// The default body view must select one real row, not assemble independent maxima.
const bodies=modern.soldiers.map(s=>({id:s.id,name:s.koName,candidates:[]}));
const bodyContext={profiles,names};
const bodyResults=bodyCareerSummary(bodies,records,bodyContext);
assert.equal(bodyResults.length,modern.soldiers.length);
for(const objective of ['total',...statKeys]){
 const result=bodyCareerSummary(bodies,records,{...bodyContext,stat:objective});
 const score=r=>objective==='total'?r.cap.reduce((a,b)=>a+b,0):r.cap[statKeys.indexOf(objective)];
 for(const row of result){
  const eligible=records.filter(r=>r.body===row.id);
  assert.equal(row.count,eligible.length);
  if(!eligible.length){assert.equal(row.best,null);continue}
  assert(eligible.includes(row.best),'Representative must be an original route');
  assert.equal(score(row.best),Math.max(...eligible.map(score)));
  const u=new URL(exactCareerUrl(row.best),'https://atlas.invalid/');
  assert.equal(u.searchParams.get('group'),'routes');
  assert.equal(u.searchParams.get('q'),row.best.id);
  const same=filterTable(records,{origin:row.best.origin,body:row.best.body,branch:row.best.branch,q:row.best.id},ctx);
  assert(same.some(r=>r.key===row.best.key));
 }
}
const knownBody=bodyResults.find(b=>b.best);
const artificialUpper={id:knownBody.id,name:knownBody.name,candidates:[{route:'legacy-ceiling-test',originProfile:knownBody.best.origin,stats:{firing:9999}}]};
const separate=bodyCareerSummary([artificialUpper],records,bodyContext)[0];
assert.equal(separate.independent.firing.value,9999);
assert.notEqual(separate.best.cap[statKeys.indexOf('firing')],9999);
const sample=records.find(r=>r.traits?.length&&r.order.length);
assert(sample);const matching=filterTable(rows,{origin:sample.origin,training:sample.order[0],trait:sample.traits[0],branch:sample.branch},ctx);
assert(matching.some(r=>r.key===sample.key));assert(matching.every(r=>r.origin===sample.origin&&r.branch===sample.branch&&r.order.includes(sample.order[0])&&r.traits.includes(sample.traits[0])));
const pair=[...new Set(records.map(r=>r.branch))].slice(0,2);
assert(filterTable(rows,{a:pair[0],b:pair[1]},ctx).every(r=>pair.includes(r.branch)));
ctx.selected.add(sample.key);assert.deepEqual(filterTable(rows,{selectedOnly:true},ctx).map(r=>r.key),[sample.key]);
assert.equal(filterTable(rows,{certified:true},ctx).length,0);
const html=fs.readFileSync(new URL('../public/soldiers/modern/index.html',import.meta.url),'utf8');
const retired=fs.readFileSync(new URL('../public/career/index.html',import.meta.url),'utf8');
assert.equal((html.match(/<table\b/g)||[]).length,1);
assert(!html.includes('roleButtons')&&!html.includes('roleAdvanced'));
assert(html.includes('id="originTable"')&&html.includes('value="routes"'));
assert(!retired.includes('<table')&&retired.includes('location.replace(target.href)'));
assert.equal(filterTable(rows,{fixedOptimumOnly:true},ctx).length,records.filter(r=>r.fixedModelOptimum).length);
console.log(JSON.stringify({routes:records.length,rows:rows.length,origins:profiles.size,missing:missing.length,stats:statKeys.length,branches:branches.size,requiredResearchRecorded:records.filter(r=>r.requiredResearch!==null).length,bodyRepresentatives:bodyResults.filter(r=>r.best).length},null,2));
