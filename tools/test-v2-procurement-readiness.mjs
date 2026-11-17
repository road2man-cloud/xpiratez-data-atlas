import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createManufacturingPlanner } from '../public/manufacture-v2/planner/planner-core.mjs';
import { compareProcurementAcquisitions } from '../public/manufacture-v2/planner/procurement-whatif-core.mjs';
import { buildProcurementReadiness } from '../public/manufacture-v2/planner/procurement-readiness-core.mjs';

const mock=({facilities=false,research=false}={})=>{
  const meta=kind=>({schema:'xpiratez-v2-mod-'+kind+'/v1',sourceVersion:'v.o2',
    sourceManifestSha256:'v.o2-test-fixture',itemIndexSha256:'matching-v2-items'});
  const recipe=(id,fields)=>({id,koName:id,sourceFiles:['v2-test.rul'],
    fields,links:{unlockedByResearch:[]}});
  return createManufacturingPlanner({
    items:{meta:meta('items'),items:['A','B'].map(id=>({id,koName:id,fields:{}}))},
    research:{meta:meta('research'),entries:research?[{id:'R1',fields:{cost:10,dependencies:[]}}]:[]},
    manufacture:{meta:meta('manufacture'),entries:[
      recipe('MAKE_A',{cost:7,time:2,producedItems:{A:1},requiredItems:{B:1},
        ...(facilities?{requiresBaseFunc:['SHOP']}:{}),
        ...(research?{requires:['R1']}:{} )}),
      recipe('USE_A',{cost:3,time:1,requiredItems:{A:1}})
    ]}
  });
};
test('separates saved/start input from hypothetical additions without claiming consumption attribution',()=>{
  const planner=mock();
  const settings={jobs:[{key:'new',recipeId:'USE_A',batches:1}],
    maxDepth:0,inventory:{A:2}};
  const result=compareProcurementAcquisitions(planner,settings,{}, {A:4});
  const evidence=buildProcurementReadiness(planner,result,settings,{});
  const stock=evidence.supplies.find(x=>x.id==='A');
  assert.equal(stock.baseInput,2);
  assert.equal(stock.virtualAdded,4);
  assert.equal(stock.combinedStarting,6);
  assert.equal(stock.usedCombined,1);
  assert.equal(stock.possibleVirtualUsedMin,0);
  assert.equal(stock.possibleVirtualUsedMax,1);
  assert.equal(stock.remainingCombined,5);
  assert.equal(stock.attribution,'ambiguous-within-bounds');
  assert.equal(evidence.summary.hypotheticalUnits,4);
  assert.equal(evidence.jobs[0].materialState,'clear-in-hypothesis');
  assert.equal(evidence.jobs[0].facilityState,'not-checked');
  assert.equal(evidence.jobs[0].researchState,'not-checked');
  assert.equal(evidence.jobs[0].conclusion,'실제 게임 제조 가능성 미판정');
  assert.deepEqual(settings.inventory,{A:2});
});
test('material quantity greater than original stock forces a minimum virtual-source consumption',()=>{
  const planner=mock();
  const settings={jobs:[{key:'new',recipeId:'USE_A',batches:6}],
    maxDepth:0,inventory:{A:2}};
  const result=compareProcurementAcquisitions(planner,settings,{}, {A:4});
  const evidence=buildProcurementReadiness(planner,result,settings,{});
  const a=evidence.supplies.find(x=>x.id==='A');
  assert.equal(a.usedCombined,6);
  assert.equal(a.possibleVirtualUsedMin,4);
  assert.equal(a.possibleVirtualUsedMax,4);
  assert.equal(a.attribution,'fixed-by-totals');
  assert.equal(evidence.jobs[0].materialShortageUnits,0);
});
test('missing facilities and research discovered IDs remain independent blockers after material acquisition',()=>{
  const planner=mock({facilities:true,research:true});
  const settings={jobs:[{key:'saved',recipeId:'MAKE_A',batches:1},
    {key:'new',recipeId:'USE_A',batches:1}],
    inventory:{B:1},maxDepth:0,saveDiscoveredResearchIds:[]};
  const context={base:{facilitiesPresent:true,facilities:[]},
    facilitiesIndex:{facilities:[]}};
  const compare=compareProcurementAcquisitions(planner,settings,context, {A:1});
  const evidence=buildProcurementReadiness(planner,compare,settings,context);
  assert.equal(evidence.jobs.length,2);
  assert.equal(evidence.jobs[0].materialState,'clear-in-hypothesis');
  assert.equal(evidence.jobs[0].facilityState,'declared-missing');
  assert.deepEqual(evidence.jobs[0].missingFunctions,['SHOP']);
  assert.equal(evidence.jobs[0].researchState,'not-in-discovered');
  assert.deepEqual(evidence.jobs[0].researchNotDiscovered,['R1']);
  assert.equal(evidence.jobs[0].futureOutputsCredited,false);
  assert.equal(evidence.jobs[0].firstAction.type,'facility');
  assert.equal(evidence.jobs[1].materialState,'clear-in-hypothesis');
  assert.equal(evidence.summary.missingFacilityJobs,1);
  assert.equal(evidence.summary.notDiscoveredResearchJobs,1);
});
test('unmet external materials are first actionable obstacle; no evidence is never labelled ready',()=>{
  const p=mock();
  const settings={jobs:[{key:'new',recipeId:'USE_A',batches:2}],
    inventory:{A:0},maxDepth:0};
  const report=compareProcurementAcquisitions(p,settings,{}, {});
  const evidence=buildProcurementReadiness(p,report,settings,{});
  assert.equal(evidence.jobs[0].materialState,'external-shortage');
  assert.equal(evidence.jobs[0].firstAction.type,'materials');
  assert.equal(evidence.summary.materialShortageJobs,1);
  assert.equal(evidence.summary.noEvidenceFacilityJobs,1);
  assert.equal(evidence.summary.noEvidenceResearchJobs,1);
});
test('declared facilities and discovered research matches are partial evidence, never full manufacturing approval',()=>{
  const p=mock({facilities:true,research:true});
  const settings={jobs:[{key:'new',recipeId:'MAKE_A',batches:1}],
    inventory:{B:1},maxDepth:0,saveDiscoveredResearchIds:['R1']};
  const ctx={base:{facilitiesPresent:true,facilities:[{type:'FORGE',buildTime:0}]},
    facilitiesIndex:{facilities:[{id:'FORGE',fields:{provideBaseFunc:['SHOP']}}]}};
  const evidence=buildProcurementReadiness(p,compareProcurementAcquisitions(p,settings,ctx,{}),settings,ctx);
  assert.equal(evidence.jobs[0].facilityState,'declared-covered');
  assert.equal(evidence.jobs[0].researchState,'present-in-discovered');
  assert.equal(evidence.jobs[0].materialState,'clear-in-hypothesis');
  assert.equal(evidence.jobs[0].firstAction.type,'unknown');
  assert(!Object.values(evidence.jobs[0]).includes('ready'));
});
test('missing facility roster never becomes an invented facility shortage',()=>{
  const p=mock({facilities:true});
  const settings={jobs:[{key:'new',recipeId:'MAKE_A',batches:1}],
    inventory:{B:1},maxDepth:0};
  const ctx={base:{facilitiesPresent:false,facilities:[]},facilitiesIndex:{facilities:[]}};
  const report=compareProcurementAcquisitions(p,settings,ctx,{});
  const evidence=buildProcurementReadiness(p,report,settings,ctx);
  assert.equal(evidence.jobs[0].facilityState,'not-checked');
  assert.equal(evidence.summary.noEvidenceFacilityJobs,1);
});

test('cross-version data, duplicate additions, or impossible provenance are rejected',()=>{
  const p=mock();
  const settings={jobs:[{key:'new',recipeId:'USE_A',batches:1}],inventory:{A:0},maxDepth:0};
  const report=compareProcurementAcquisitions(p,settings,{}, {A:1});
  assert.throws(()=>buildProcurementReadiness(p,{schema:'legacy-1.1'},settings),/2.1/);
  const duplicate={...report,additions:[report.additions[0],report.additions[0]]};
  assert.throws(()=>buildProcurementReadiness(p,duplicate,settings),/출처/);
  const forged={...report,after:{...report.after,inventory:{
    ...report.after.inventory,usedStarting:{A:20}}}};
  assert.throws(()=>buildProcurementReadiness(p,forged,settings),/수량/);
});
test('full current X-Piratez v.o2 indexes produce non-empty evidence without touching legacy data',()=>{
  const root=fileURLToPath(new URL('../public/data/',import.meta.url));
  const read=name=>JSON.parse(fs.readFileSync(root+name+'-v2-index.json','utf8'));
  const p=createManufacturingPlanner({
    items:read('items'),research:read('research'),manufacture:read('manufacture')
  });
  const settings={jobs:[{key:'new',recipeId:'STR_3RL_HE_XXX',batches:1}],
    inventory:{},maxDepth:0};
  const report=compareProcurementAcquisitions(p,settings,{},{});
  const result=buildProcurementReadiness(p,report,settings,{});
  assert.equal(result.schema,'xpiratez-v2-manufacture-evidence-matrix/v1');
  assert.equal(result.sourceVersion,'v.o2');
  assert.equal(result.jobs.length,1);
  assert(result.jobs[0].materialShortageUnits>0);
});
