import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,statKeys,exactCareerUrl,routeFilterIds,filterRows,compileResearchSearch,researchActionId,filterCareerRequirements} from '../public/branch-soldier-atlas-career-core.js';
import {rowsWithMissingOrigins,statValue,filterTable,sortTable,bodyCareerSummary,indexCareerBranches,branchCareerRows,normalizeStatMinimums,readStatMinimums,writeStatMinimums,filterStatMinimums} from '../public/branch-soldier-atlas-table-core.js';
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
// Compact research search must agree with the actual witness prefix. A required
// research field is not accepted as a completed/recorded research action.
const researchSources=new Map(),researchRaw=new Map();
for(const l of ledgers.filter(l=>l.index)){
 const raw=JSON.parse(gunzipSync(read(l.index+'.json.gz')));
 researchRaw.set(l.key,raw);researchSources.set(l.key,compileResearchSearch(l,raw,metadata));
}
const researchIndex={hasWitness:r=>researchSources.get(r.source)?.hasWitness(r)===true,matches:(r,ids)=>researchSources.get(r.source)?.matches(r,ids)===true};
const exactResearchIds=r=>{
 if(!researchIndex.hasWitness(r))return null;
 const raw=researchRaw.get(r.source),ids=new Set();let i=raw.routes[r.id].prefix;
 while(i!==null){const n=raw.nodes[i],id=researchActionId(n.action);if(id)ids.add(id);i=n.parent;}
 return ids;
};
const witnesses=records.filter(r=>researchIndex.hasWitness(r));
const sampleResearch=witnesses.find(r=>profiles.get(r.origin)?.requires?.length&&Object.keys(profiles.get(r.origin)?.acquisitionRequiredItems||{}).length&&exactResearchIds(r).size>=2);
assert(sampleResearch,'No research/recruitment witness');
const sampleProfile=profiles.get(sampleResearch.origin),req=sampleProfile.requires[0],item=Object.keys(sampleProfile.acquisitionRequiredItems)[0];
const researchIds=[...exactResearchIds(sampleResearch)].filter(id=>id!==req).slice(0,2);
assert.equal(researchIds.length,2);
const researchFilters={researchAction:researchIds.join(','),recruitResearch:req,recruitItem:item};
const expectedResearch=records.filter(r=>{const ids=exactResearchIds(r),p=profiles.get(r.origin);return ids&&researchIds.every(id=>ids.has(id))&&p?.requires?.includes(req)&&Number(p?.acquisitionRequiredItems?.[item])>0;});
const researchContext={...ctx,researchIndex};
const matchedResearch=filterTable(rows,researchFilters,researchContext);
assert.deepEqual(matchedResearch.map(r=>r.key),expectedResearch.map(r=>r.key));
assert(matchedResearch.includes(sampleResearch));
assert.deepEqual(branchCareerRows(branchIndex,sampleResearch.branch,researchFilters,researchContext).map(r=>r.key),expectedResearch.filter(r=>r.branch===sampleResearch.branch).map(r=>r.key));
assert.equal(filterCareerRequirements([sampleResearch],researchFilters,{profiles}).length,0);
assert(!researchIndex.matches({...sampleResearch,hash:'different'},researchIds));
assert(!researchIndex.matches({...sampleResearch,branch:'different'},researchIds));
assert(!researchIndex.matches(sampleResearch,['STR_NONEXISTENT_RESEARCH_TEST']));
assert.equal(researchActionId({type:'transform',id:'STR_NONRESEARCH_TEST'}),null);
console.log(JSON.stringify({researchWitnesses:witnesses.length,researchActionIds:new Set([...researchSources.values()].flatMap(s=>s.ids)).size,example:{researchIds,req,item,matches:matchedResearch.length}}));
// A minimum in one column cannot borrow a value from a different witness.
const minimums={tu:90,firing:120,health:60};
const minimumMatches={};
for(const metric of ['cap','current','birthMin','birthMax']){
 const expected=rows.filter(r=>Object.entries(minimums).every(([k,v])=>Number.isFinite(statValue(r,k,metric,profiles))&&statValue(r,k,metric,profiles)>=v));
 const matches=filterTable(rows,{metric,minima:minimums},ctx);
 assert.deepEqual(matches.map(r=>r.key),expected.map(r=>r.key));
 minimumMatches[metric]=matches.length;
 if(metric==='cap'||metric==='current'){
  for(const [branch] of branchIndex)assert.deepEqual(branchCareerRows(branchIndex,branch,{metric,minima:minimums}).map(r=>r.key),expected.filter(r=>r.branch===branch).map(r=>r.key));
 }
}
const blankVector=statKeys.map(()=>0);
const v=(tu,firing)=>blankVector.map((n,i)=>statKeys[i]==='tu'?tu:statKeys[i]==='firing'?firing:n);
const splitRows=[{...records[0],key:'minimum-a',cap:v(100,40)},{...records[0],key:'minimum-b',cap:v(40,130)}];
assert.equal(filterStatMinimums(splitRows,{tu:90,firing:120}).length,0);
assert.equal(filterStatMinimums([{...records[0],cap:null}],{tu:0}).length,0);
assert.equal(filterStatMinimums(splitRows,{total:160}).length,1);
assert.deepEqual(normalizeStatMinimums({tu:'0',firing:'120',health:'',mana:-1,total:'x',unsupported:99}),{tu:0,firing:120});
const p=new URLSearchParams('branch=branch-a&min_tu=1&min_health=999');
writeStatMinimums(p,{tu:90,firing:120,total:0});
assert.deepEqual(readStatMinimums(p),{tu:90,firing:120,total:0});
assert.equal(p.get('branch'),'branch-a');assert.equal(p.has('min_health'),false);
writeStatMinimums(p,{});assert.deepEqual(readStatMinimums(p),{});
const multiMinimum=filterTable(rows,{metric:'cap',minima:minimums,minDepth:'8',minTraits:'5'},ctx);
assert(multiMinimum.every(r=>r.order.length>=8&&r.traits?.length>=5&&Object.entries(minimums).every(([k,v])=>statValue(r,k,'cap',profiles)>=v)));
console.log(JSON.stringify({minimums,minimumMatches,withDepthAndTraits:multiMinimum.length}));
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
