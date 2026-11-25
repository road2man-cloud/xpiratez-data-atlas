import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,statKeys,exactCareerUrl,routeFilterIds,filterRows} from '../public/branch-soldier-atlas-career-core.js';
import {rowsWithMissingOrigins,statValue,filterTable,sortTable,bodyCareerSummary,indexCareerBranches,branchCareerRows} from '../public/branch-soldier-atlas-table-core.js';
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
const branchIndex=indexCareerBranches(records);
// Multiple selections are conjunctions on one recorded route, never unions
// across separate witnesses. Repeated query params and comma lists agree.
const multiSample=records.find(r=>new Set(r.order).size>=2&&new Set(r.traits||[]).size>=2);
assert(multiSample,'No real multi-condition witness');
const trainingIds=[...new Set(multiSample.order)].slice(0,2);
const traitIds=[...new Set(multiSample.traits)].slice(0,2);
const multiFilters={training:trainingIds.join(','),trait:traitIds.join(',')};
assert.deepEqual(routeFilterIds([trainingIds.join(','),trainingIds[0],'']),trainingIds);
const expectedMulti=records.filter(r=>trainingIds.every(id=>r.order.includes(id))&&traitIds.every(id=>r.traits?.includes(id)));
const multiMatches=filterTable(rows,multiFilters,ctx);
assert.deepEqual(multiMatches.map(r=>r.key),expectedMulti.map(r=>r.key));
assert(multiMatches.some(r=>r.key===multiSample.key));
assert.deepEqual(filterRows(records,{training:trainingIds,trait:traitIds}).map(r=>r.key),expectedMulti.map(r=>r.key));
assert.deepEqual(branchCareerRows(branchIndex,multiSample.branch,multiFilters).map(r=>r.key),expectedMulti.filter(r=>r.branch===multiSample.branch).map(r=>r.key));
assert.equal(filterTable(rows,{training:[...trainingIds,'STR_NONEXISTENT_FILTER_TEST']},ctx).length,0);
const mutuallySeparate=[{...multiSample,key:'one',order:[trainingIds[0]],traits:[traitIds[0]]},{...multiSample,key:'two',order:[trainingIds[1]],traits:[traitIds[1]]}];
assert.equal(filterRows(mutuallySeparate,multiFilters).length,0);
assert.equal(filterRows([{...multiSample,traits:null}],multiFilters).length,0);
assert.equal(filterRows(records,{training:trainingIds[0]}).length,records.filter(r=>r.order.includes(trainingIds[0])).length);
console.log(JSON.stringify({multiFilterExample:{training:trainingIds,traits:traitIds,matches:multiMatches.length,branchMatches:expectedMulti.filter(r=>r.branch===multiSample.branch).length}}));
const deep=filterTable(rows,{minDepth:'8',minTraits:'5'},ctx);
assert(deep.every(r=>r.order.length>=8&&r.traits!==null&&r.traits.length>=5));
assert.equal(filterTable(rows,{minTraits:'0'},ctx).length,records.filter(r=>r.traits!==null).length);
const depthRank=bodyCareerSummary(bodies,records,{...bodyContext,stat:'depth'});
for(const b of depthRank)if(b.best)assert.equal(b.best.order.length,Math.max(...records.filter(r=>r.body===b.id).map(r=>r.order.length)));
const traitRank=bodyCareerSummary(bodies,records,{...bodyContext,stat:'traitCount'});
for(const b of traitRank)if(b.best)assert.equal(b.best.traits.length,Math.max(...records.filter(r=>r.body===b.id&&r.traits!==null).map(r=>r.traits.length)));
console.log(JSON.stringify({deepAndTraits:deep.length,maxDepth:Math.max(...records.map(r=>r.order.length)),maxTraits:Math.max(...records.map(r=>r.traits?.length??-1))}));
assert.equal([...branchIndex.values()].reduce((n,v)=>n+v.length,0),records.length);
let branchBodyPairs=0;
for(const [branch,group] of branchIndex){
 assert(branches.has(branch)&&group.every(r=>r.branch===branch));
 const summaries=bodyCareerSummary(bodies,branchCareerRows(branchIndex,branch),{...bodyContext,branch});
 for(const row of summaries){
  const exact=group.filter(r=>r.body===row.id);
  assert.equal(row.count,exact.length);
  if(!exact.length){assert.equal(row.best,null);continue}
  branchBodyPairs++;
  assert(exact.includes(row.best));
  assert.equal(row.best.cap.reduce((a,b)=>a+b,0),Math.max(...exact.map(r=>r.cap.reduce((a,b)=>a+b,0))));
 }
}
const scopedBranch=branchCareerRows(branchIndex,sample.branch,{origin:sample.origin,body:sample.body,training:sample.order[0],trait:sample.traits[0],difficulty:sample.difficulties[0]??''});
assert(scopedBranch.includes(sample));
assert(scopedBranch.every(r=>r.branch===sample.branch&&r.origin===sample.origin&&r.body===sample.body&&r.order.includes(sample.order[0])&&r.traits.includes(sample.traits[0])));
assert.equal(branchCareerRows(branchIndex,'nonexistent-branch').length,0);
for(const file of ['../public/captains/index.html','../modules/captains/index.html']){
 const page=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 assert.equal((page.match(/id="integratedBranches"/g)||[]).length,1);
 assert(page.indexOf('id="integratedBranches"')<page.indexOf('id="branchLegacy"'));
}
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
console.log(JSON.stringify({routes:records.length,rows:rows.length,origins:profiles.size,missing:missing.length,stats:statKeys.length,branches:branches.size,requiredResearchRecorded:records.filter(r=>r.requiredResearch!==null).length,bodyRepresentatives:bodyResults.filter(r=>r.best).length,careerBranches:branchIndex.size,branchBodyPairs},null,2));
