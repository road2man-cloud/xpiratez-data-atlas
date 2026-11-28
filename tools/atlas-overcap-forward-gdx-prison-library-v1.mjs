// V163: conditional GDX prison document recovery, explicit research unlock,
// library construction and deterministic implicit-output book manufacture.
import assert from 'node:assert/strict';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[],qty=(w,k)=>Number(w.items[k]||0),active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createGdxPrisonLibrary(data,rp,proof,proofSha){
 assert.equal(proof.schema,'ATLAS_OVERCAP_GDX_PRISON_LIBRARY_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.deepEqual(proof.sourceFiles,data.meta.source.rules);
 const raw=(section,id)=>{const x=proof.rows.find(r=>r.section===section&&r.id===id);assert(x,section+'/'+id);return x.raw;};
 const site='STR_LOC_GDX_PRISON',sid='gdxPrisonMission',document='STR_GDX_005',done='STR_LOC_GDX_PRISON_DONE',school='STR_SCHOOL_BOOKS',library='STR_LIBRARY',plot='STR_PLOTTING',book='STR_PILLOW_BOOK';
 const mission=raw('alienMissions',site),script=raw('missionScripts',sid),dep=raw('alienDeployments',site),terrain=raw('terrains','GDX_PRISON'),map=raw('mapScripts','GDX_PRISON'),start=raw('startingConditions',dep.startingCondition);
 assert.equal(mission.type,site);assert.equal(mission.objective,3);assert.equal(mission.waves.length,1);assert.equal(mission.waves[0].trajectory,'CA_SPAWN');assert.equal(mission.waves[0].count,1);
 assert.deepEqual(mission.raceWeights,{'0':{STR_SECTOID_HOUSE:100}});
 assert.deepEqual(script.missionWeights,{'0':{[site]:100}});assert.equal(script.executionOdds,100);assert.equal(script.useTable,false);
 assert.deepEqual(script.researchTriggers,{STR_GDX_004:true,[done]:false});
 assert.deepEqual(dep.terrains,[terrain.name]);assert.equal(dep.unlockedResearch,done);assert.equal(terrain.script,map.type);
 assert.equal(dep.width,40);assert.equal(dep.length,40);
 const cmd=map.commands.find(c=>c.groups===7);
 assert(cmd&&cmd.type==='addBlock'&&cmd.executions===1&&cmd.size===2);
 const candidates=terrain.mapBlocks.filter(b=>arr([b.groups].flat()).includes(7)&&b.width===20&&b.length===20);
 assert.equal(candidates.length,1);const block=candidates[0];
 assert.equal(block.name,'ABASE_03');assert.equal(block.items[document].length,1);
 assert.notEqual(raw('items',document).recover,false);assert(!raw('items',document).recoveryTransformations);
 const missionAction={type:'missionResearch',research:done,deployment:site,script:sid,assumeOutcome:true};
 const source=raw('research',document),schoolRule=raw('research',school);
 assert(source.needItem&&source.destroyItem&&source.unlocks.includes(school));
 assert.deepEqual(source.unlocks,data.researchRules[document].unlocks);
 assert.deepEqual(schoolRule.dependencies,data.researchRules[school].dependencies);
 assert.deepEqual(schoolRule.disables,data.researchRules[school].disables);
 assert(!arr(schoolRule.requires).length);
 const f=raw('facilities',library),indexed=data.forwardSupply.facilities[library];
 assert.equal(f.buildCost,1050000);assert.equal(f.buildTime,18);assert.deepEqual(f.requires,[library]);assert.deepEqual(f.provideBaseFunc,['LIB']);
 assert(!f.buildCostItems&&!arr(f.requiresBaseFunc).length);
 assert.equal(indexed.cost,f.buildCost);assert.equal(indexed.days,f.buildTime);assert.deepEqual(indexed.provides,f.provideBaseFunc);
 const recipe=raw('manufacture',book);
 assert.equal(recipe.name,book);assert(!Object.hasOwn(recipe,'producedItems')&&!recipe.randomProducedItems&&!recipe.spawnedPersonType&&!recipe.events&&!recipe.transferTimes);
 assert.deepEqual(recipe.requires,[plot]);assert.deepEqual(recipe.requiresBaseFunc,['LIB']);
 assert.deepEqual(recipe.requiredItems,{STR_PORN:3});assert.equal(recipe.cost,50);assert.equal(recipe.time,690);
 const indexRecipe=arr(data.itemSupply[book]?.manufacture).find(r=>r.id===book);
 assert(indexRecipe?.implicit===true&&indexRecipe.quantity===1);
 assert.deepEqual(indexRecipe.requires,recipe.requires);assert.deepEqual(indexRecipe.requiresBaseFunc,recipe.requiresBaseFunc);assert.deepEqual(indexRecipe.requiredItems,recipe.requiredItems);assert.equal(indexRecipe.cost,recipe.cost);
 function transition(s,a,w,evidence,cost=0){
  assert.equal(w.funds,s.income-s.procurement-cost-s.careerSpend);
  return {...s,world:w,procurement:s.procurement+cost,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:{sourceSha256:proofSha,...evidence},stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 function recoveryOption(s){
  if(!rp.settled(s)||!same(s.actions.at(-1),missionAction)||!s.world.completedMissions?.has(site)||s.trace.at(-1)?.stateHash!==exactStateHash(s.world)||qty(s.world,document)!==0)return null;
  return {type:'sourceGdxPrisonDocumentRecovery',deployment:site,script:sid,map:map.type,block:block.name,item:document,count:1,assumeGeneratedSite:true,assumeValidCraftAndSquad:true,assumeVictory:true,assumeIntactDocumentRecovery:true};
 }
 function startOption(s){
  if(!rp.settled(s)||s.world.facilities.has(library)||s.world.forwardLibraryBuild||!f.requires.every(k=>active(s.world,k))||s.world.funds<f.buildCost)return null;
  return {type:'sourceStartLibrary',id:library,month:s.world.month,cost:f.buildCost,assumeBuildableTile:true};
 }
 function completeOption(s){
  const p=s.world.forwardLibraryBuild;
  if(!rp.settled(s)||!p||s.world.month!==p.month+1||s.actions.at(-1)?.type!=='sourceMonthlyBoundary')return null;
  return {type:'sourceCompleteLibrary',id:library,days:f.buildTime,assumeElapsedDays:true};
 }
 function bookOption(s){
  const w=s.world;
  if(!rp.settled(s)||w.forwardLibraryBuild||!recipe.requires.every(k=>active(w,k))||!recipe.requiresBaseFunc.every(k=>w.baseFunctions.has(k))||w.funds<recipe.cost||qty(w,'STR_PORN')<3)return null;
  return {type:'sourceManufactureImplicitBook',id:book,count:1,cost:recipe.cost,engineerHours:recipe.time,consumed:{...recipe.requiredItems},assumeWorkshopAndCapacity:true,assumeElapsedManufacturingTime:true,assumeRetainOutput:true};
 }
 function apply(s,a){
  const w=structuredClone(s.world);
  if(a.type==='sourceGdxPrisonDocumentRecovery'){
   assert(same(recoveryOption(s),a),'Missing immediate successful mission or duplicate recovery');
   w.items[document]=qty(w,document)+1;
   return transition(s,a,w,{kind:'SOURCE_BOUND_FIXED_MISSION_DOCUMENT',fixedPositions:block.items[document],mapCommand:cmd,eligibleBlockCount:1,allowedSoldierTypes:start.allowedSoldierTypes,allowedCraft:start.allowedCraft,missionDelaysUnmodeled:true,otherLootAndScoreUnmodeled:true});
  }
  if(a.type==='sourceStartLibrary'){
   assert(same(startOption(s),a),'Library construction unavailable');
   w.funds-=f.buildCost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+f.buildCost;
   w.forwardLibraryBuild={month:w.month,days:f.buildTime};
   return transition(s,a,w,{kind:'SOURCE_BOUND_LIBRARY_START',cost:f.buildCost,monthlyMaintenance:f.monthlyCost,freeTileConditional:true},f.buildCost);
  }
  if(a.type==='sourceCompleteLibrary'){
   assert(same(completeOption(s),a),'Missing outstanding construction or elapsed month');
   delete w.forwardLibraryBuild;w.facilities.add(library);for(const k of f.provideBaseFunc)w.baseFunctions.add(k);
   return transition(s,a,w,{kind:'CONDITIONAL_LIBRARY_COMPLETION',days:f.buildTime,provides:f.provideBaseFunc,elapsedCalendarDaysConditional:true});
  }
  assert.equal(a.type,'sourceManufactureImplicitBook');assert(same(bookOption(s),a),'Recipe or stock unavailable');
  for(const [k,n] of Object.entries(recipe.requiredItems))w.items[k]=qty(w,k)-n;
  w.items[book]=qty(w,book)+1;w.funds-=recipe.cost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+recipe.cost;
  return transition(s,a,w,{kind:'NATIVE_DEFAULT_MANUFACTURE_OUTPUT',producedItems:{[book]:1},engineSource:'RuleManufacture.cpp:34-38',engineerHours:recipe.time,workshopAndDurationConditional:true},recipe.cost);
 }
 return {missionAction,recoveryOption,startOption,completeOption,bookOption,apply,buildCost:f.buildCost,bookCost:recipe.cost};
}
