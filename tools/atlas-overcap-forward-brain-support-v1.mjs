// V160: explicit retained-starting-facility correction, material-aware
// personal laboratory construction and selected live specimen recovery.
// This augments an older partial model; it is not a native campaign result.
import assert from 'node:assert/strict';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[],qty=(w,k)=>Number(w.items[k]||0);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createBrainSupport(data,rp,proof,proofSha,outbreakProof,outbreakSha){
 assert.equal(proof.schema,'ATLAS_OVERCAP_BRAIN_SUPPORT_SOURCE_V1');
 assert.equal(outbreakProof.schema,'ATLAS_OVERCAP_ZOMBIE_OUTBREAK_SOURCE_V1');
 for(const p of [proof,outbreakProof]){
  assert.equal(p.sourceMetadataSha256,data.meta.source.metadataSha256);
  assert.deepEqual(p.sourceFiles,data.meta.source.rules);
 }
 assert.equal(proof.engineArchiveSha256,outbreakProof.engineArchiveSha256);
 const get=(p,section,id)=>{const r=p.rows.find(x=>x.section===section&&x.id===id);assert(r,section+'/'+id);return r.raw;};
 const raw=(section,id)=>get(proof,section,id),old=(section,id)=>get(outbreakProof,section,id);
 const labId='STR_LABORATORY',jailId='STR_JAIL',personalId='STR_PERSONAL_LABS',wire='STR_SC_WIRE';
 const buster='STR_ZOMBIE_BUSTER_TERRORIST',carrie='STR_ZOMBIE_CARRIE_TERRORIST',brain='STR_ZOMBIE_BRAIN',device='STR_ZOMBIE_COMMUNICATION_DEVICE';
 const lab=raw('facilities',labId),jail=raw('facilities',jailId),personal=raw('facilities',personalId),wireRule=raw('items',wire);
 const starts=proof.startingBase.facilities.filter(x=>[labId,jailId].includes(x.type));
 assert.equal(starts.length,2);assert.equal(new Set(starts.map(x=>x.type)).size,2);
 assert.deepEqual(lab.provideBaseFunc,['LAB','CPU']);assert.equal(jail.prisonType??0,0);assert.equal(jail.aliens,15);
 assert.deepEqual(personal.requires,[personalId]);assert.deepEqual(personal.requiresBaseFunc,['CPU']);
 assert.deepEqual(personal.provideBaseFunc,['STUDY','LAB']);assert.equal(personal.maxAllowedPerBase,1);
 assert.deepEqual(personal.buildCostItems,{[wire]:{build:25,refund:25}});
 const materialCount=personal.buildCostItems[wire].build;
 assert.equal(personal.buildCost,950000);assert.equal(personal.buildTime,28);
 assert.equal(wireRule.costBuy,2500);assert.deepEqual(wireRule.requiresBuy,['STR_CONTACT_GENERAL_SUPPLIES']);
 assert(!wireRule.requiresBuyBaseFunc?.length&&!wireRule.requiresBuyCountry&&!wireRule.requires?.length);
 assert.deepEqual(data.forwardSupply.buys[wire],{id:wire,cost:wireRule.costBuy,requires:wireRule.requiresBuy,functions:[]});
 const recipe=raw('manufacture','STR_ZOMBIE_BUSTER_TERRORIST_EXTRACTION'),indexed=data.forwardSupply.recipes.find(r=>r.id===recipe.name);
 assert(indexed);assert.deepEqual(indexed.outputs,recipe.producedItems);assert.deepEqual(indexed.requiredItems,recipe.requiredItems);assert.deepEqual(indexed.requires,recipe.requires);assert.deepEqual(indexed.functions,recipe.requiresBaseFunc);assert.equal(indexed.cost,recipe.cost);assert.equal(indexed.time,recipe.time);
 for(const id of [buster,carrie,brain,device]){
  const r=raw('research',id),d=data.researchRules[id];
  assert.equal(r.cost,d.cost);assert.equal(!!r.needItem,d.needItem);assert.equal(!!r.destroyItem,d.destroyItem);assert.deepEqual(arr(r.dependencies),d.dependencies);assert.deepEqual(arr(r.requiresBaseFunc),d.requiresBaseFunc);assert.deepEqual(arr(r.unlocks),d.unlocks);
 }
 const race=old('alienRaces','STR_ZOMBIE');
 const routes=[
  {unit:buster,count:2,rank:0,script:old('missionScripts','zombieOutbreakLate'),mission:old('alienMissions','STR_LOC_ZOMBIE_OUTBREAK2'),dep:old('alienDeployments','STR_LOC_ZOMBIE_OUTBREAK2'),unitRule:old('units',buster),item:raw('items',buster),armor:old('armors','ZOMBIE_BUSTER_ARMOR'),corpse:old('items','STR_ZOMBIE_BUSTER_CORPSE')},
  {unit:carrie,count:1,rank:6,script:raw('missionScripts','ratlingVillage2'),mission:raw('alienMissions','STR_LOC_RATLING_VILLAGE'),dep:raw('alienDeployments','STR_LOC_RATLING_VILLAGE'),unitRule:raw('units',carrie),item:raw('items',carrie),armor:raw('armors','ZOMBIE_CARRIE_ARMOR'),corpse:raw('items','STR_ZOMBIE_CARRIE_CORPSE')}
 ];
 for(const r of routes){
  assert.equal(r.mission.type,r.dep.type);assert.equal(r.mission.objective,3);assert.equal(r.mission.waves.length,1);assert.equal(r.mission.waves[0].trajectory,'CA_SPAWN');assert.equal(r.mission.waves[0].count,1);
  assert(r.mission.raceWeights['0'].STR_ZOMBIE>0);assert(r.script.missionWeights['0'][r.mission.type]>0);assert.equal(r.script.useTable,false);
  assert(Object.keys(r.script).every(k=>['type','missionWeights','regionWeights','useTable','executionOdds','firstMonth','lastMonth','startDelay','randomDelay','researchTriggers','minDifficulty','maxDifficulty'].includes(k)),'Unmodeled mission gate');
  assert.equal(r.unitRule.liveAlien??r.unitRule.type,r.unit);assert.notEqual(r.unitRule.capturable,false);assert(!r.unitRule.spawnUnit);
  assert.equal(r.unitRule.armor,r.armor.type);assert.equal(r.armor.corpseBattle[0],r.corpse.type);assert.notEqual(r.corpse.recover,false);
  assert(r.item.liveAlien&&r.item.recover&&(r.item.prisonType??0)===0&&!r.item.recoveryTransformations);
  assert(race.membersRandom[r.rank].includes(r.unit));
 }
 function transition(s,a,w,evidence,cost=0){
  assert.equal(w.funds,s.income-s.procurement-cost-s.careerSpend);
  return {...s,world:w,procurement:s.procurement+cost,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:{sourceSha256:proofSha,outbreakSourceSha256:outbreakSha,...evidence},stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 function retainOption(s){
  const w=s.world;
  if(!s.root||!rp.settled(s)||w.forwardRetainedStartingSupport||w.facilities.has(jailId)&&w.facilities.has(labId)&&lab.provideBaseFunc.every(k=>w.baseFunctions.has(k)))return null;
  // No history rewrite or refund: the old trace remains intact and all
  // omitted resource history is explicitly unresolved.
  return {type:'sourceRetainStartingSupport',facilities:[labId,jailId],assumeDefaultStartingBase:true,assumeRetainedSinceStart:true};
 }
 function orderOption(s){
  const w=s.world,n=materialCount-qty(w,wire);
  if(!rp.settled(s)||w.forwardLabWireOrder||w.facilities.has(personalId)||n<=0||!wireRule.requiresBuy.every(k=>active(w,k))||w.funds<n*wireRule.costBuy)return null;
  return {type:'sourceOrderLabWire',item:wire,count:n,unitCost:wireRule.costBuy,assumePurchaseAvailable:true};
 }
 function deliveryOption(s){
  const p=s.world.forwardLabWireOrder;
  if(!rp.settled(s)||!p||s.actions.at(-1)?.type!=='sourceOrderLabWire')return null;
  return {type:'sourceDeliverLabWire',item:wire,count:p.count,assumeTransferArrived:true};
 }
 function constructionOption(s){
  const w=s.world;
  if(!rp.settled(s)||w.forwardLabWireOrder||w.forwardPersonalLabBuild||w.facilities.has(personalId)||w.funds<personal.buildCost||qty(w,wire)<materialCount||!personal.requires.every(k=>active(w,k))||!personal.requiresBaseFunc.every(k=>w.baseFunctions.has(k)))return null;
  return {type:'sourceStartPersonalLab',id:personalId,month:w.month,cost:personal.buildCost,materials:{[wire]:materialCount},assumeBuildableTile:true};
 }
 function completionOption(s){
  const p=s.world.forwardPersonalLabBuild;
  if(!rp.settled(s)||!p||s.world.month!==p.month+1||s.actions.at(-1)?.type!=='sourceMonthlyBoundary')return null;
  return {type:'sourceCompletePersonalLab',id:personalId,days:personal.buildTime,assumeElapsedDays:true};
 }
 function missionOption(s,unit){
  const w=s.world,r=routes.find(x=>x.unit===unit);if(!r)return null;
  const prev=s.actions.at(-1);
  if(!rp.settled(s)||w.forwardPersonalLabBuild||w.forwardLabWireOrder||prev?.type!=='sourceMonthlyBoundary'||prev.month!==w.month||!w.facilities.has(jailId)||!w.forwardRetainedStartingSupport||w.month<(r.script.firstMonth??0)||r.script.lastMonth!=null&&w.month>r.script.lastMonth)return null;
  if(w.difficulty<(r.script.minDifficulty??0)||w.difficulty>(r.script.maxDifficulty??4))return null;
  for(const [k,v] of Object.entries(r.script.researchTriggers||{}))if(active(w,k)!==v)return null;
  const slot=r.script.type+':'+w.month;if(arr(w.forwardSpecimenMissions).includes(slot))return null;
  const dd=r.dep.data.filter(x=>x.alienRank===r.rank);assert.equal(dd.length,1);const d=dd[0];assert(!d.customUnitType);
  const med=d.medQty||0,lo=d.lowQty,hi=d.highQty;
  assert([0,1,2,3,4].includes(w.difficulty));
  const base=[lo,med>0?lo+Math.trunc((med-lo)/2):lo,med>0?med:lo+Math.trunc((hi-lo)/2),med>0?med+Math.trunc((hi-med)/2):lo+Math.trunc((hi-lo)/2),hi][w.difficulty];
  const candidates=race.membersRandom[r.rank];
  if(base<r.count||qty(w,buster)+qty(w,carrie)+r.count>jail.aliens)return null;
  const action={type:'sourceLiveZombieRecovery',script:r.script.type,deployment:r.dep.type,race:'STR_ZOMBIE',month:w.month,unit,count:r.count,assumeMissionGenerated:true,assumeReachableSite:true,assumeValidSquad:true,assumeVictory:true,assumeSuccessfulPlacement:true,assumeSelectedMembers:true,assumeCapturedAndRecovered:true,assumeFreeContainment:true};
  const mw=r.script.missionWeights['0'],rw=r.mission.raceWeights['0'];
  return {action,evidence:{kind:'CONDITIONAL_LIVE_SPECIMEN_RECOVERY',executionOdds:r.script.executionOdds,missionWeight:mw[r.dep.type],missionTotal:Object.values(mw).reduce((n,v)=>n+v,0),raceWeight:rw.STR_ZOMBIE,raceTotal:Object.values(rw).reduce((n,v)=>n+v,0),rank:r.rank,baseSpawnCount:base,maximumSpawnCount:base+d.dQty+(d.extraQty??0),memberChoices:candidates,matchingChoices:candidates.filter(k=>k===unit).length,prisonType:0,containment:jailId,capacity:jail.aliens,missionResearchAlreadyActive:!!r.dep.unlockedResearch&&active(w,r.dep.unlockedResearch),otherLootAndScoreUnmodeled:true}};
 }
 function apply(s,a){
  const w=structuredClone(s.world);
  if(a.type==='sourceRetainStartingSupport'){
   assert(same(retainOption(s),a),'Starting support correction unavailable');
   w.facilities.add(labId);w.facilities.add(jailId);for(const k of lab.provideBaseFunc)w.baseFunctions.add(k);
   w.forwardRetainedStartingSupport=true;
   return transition(s,a,w,{kind:'RAW_STARTING_BASE_RETENTION_ASSUMPTION',startingFacilities:starts,notNewConstruction:true,notRetroactiveRecredit:true,fullStartingStockAndEconomyStillUnmodeled:true});
  }
  if(a.type==='sourceOrderLabWire'){
   assert(same(orderOption(s),a),'Wire order unavailable');const cost=a.count*a.unitCost;
   w.funds-=cost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+cost;w.forwardLabWireOrder={count:a.count};
   return transition(s,a,w,{kind:'RAW_PURCHASE_FOR_BUILD_MATERIAL',cost,requiredResearch:wireRule.requiresBuy},cost);
  }
  if(a.type==='sourceDeliverLabWire'){
   assert(same(deliveryOption(s),a),'No matching outstanding order');w.items[wire]=qty(w,wire)+a.count;delete w.forwardLabWireOrder;
   return transition(s,a,w,{kind:'CONDITIONAL_PURCHASE_DELIVERY',count:a.count});
  }
  if(a.type==='sourceStartPersonalLab'){
   assert(same(constructionOption(s),a),'Facility gate or build material missing');
   w.items[wire]=qty(w,wire)-materialCount;w.funds-=personal.buildCost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+personal.buildCost;
   w.forwardPersonalLabBuild={month:w.month,days:personal.buildTime};return transition(s,a,w,{kind:'RAW_MATERIAL_AWARE_FACILITY_BUILD',monthlyMaintenance:personal.monthlyCost,requiredFunctions:personal.requiresBaseFunc,consumedMaterials:a.materials,freeTileConditional:true},personal.buildCost);
  }
  if(a.type==='sourceCompletePersonalLab'){
   assert(same(completionOption(s),a),'No eligible completed construction');delete w.forwardPersonalLabBuild;
   w.facilities.add(personalId);for(const k of personal.provideBaseFunc)w.baseFunctions.add(k);
   return transition(s,a,w,{kind:'CONDITIONAL_FACILITY_COMPLETION',days:personal.buildTime,provides:personal.provideBaseFunc,elapsedCalendarDaysConditional:true});
  }
  assert.equal(a.type,'sourceLiveZombieRecovery');
  const o=missionOption(s,a.unit);assert(o&&same(o.action,a),'No source-backed live specimen outcome');
  const slot=a.script+':'+w.month;w.forwardSpecimenMissions=[...arr(w.forwardSpecimenMissions),slot];w.items[a.unit]=qty(w,a.unit)+a.count;
  return transition(s,a,w,o.evidence);
 }
 return {retainOption,orderOption,deliveryOption,constructionOption,completionOption,missionOption,apply,recipe:indexed,requiredWire:materialCount,wireUnitCost:wireRule.costBuy,buildCost:personal.buildCost};
}
