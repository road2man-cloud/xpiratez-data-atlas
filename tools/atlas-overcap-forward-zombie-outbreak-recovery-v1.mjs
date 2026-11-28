// V159: bounded source-backed containment and conditional mission recovery.
// Raw rule, difficulty, rank and stock are enforced. The mission is a
// counterfactual successful tactical outcome, not a native battle simulator.
import assert from 'node:assert/strict';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[],qty=(w,k)=>Number(w.items[k]||0);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createZombieOutbreakRecovery(data,rp,proof,proofSha){
 assert.equal(proof.schema,'ATLAS_OVERCAP_ZOMBIE_OUTBREAK_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.deepEqual(proof.sourceFiles,data.meta.source.rules);
 const get=(section,id)=>{const r=proof.rows.find(x=>x.section===section&&x.id===id);assert(r,section+'/'+id);return r.raw;};
 const missionId='STR_LOC_ZOMBIE_OUTBREAK2',scriptId='zombieOutbreakLate',raceId='STR_ZOMBIE';
 const grubas='STR_ZOMBIE_GRUBAS_TERRORIST',buster='STR_ZOMBIE_BUSTER_TERRORIST',corpse='STR_ZOMBIE_BUSTER_CORPSE',facility='STR_BURROW';
 const mission=get('alienMissions',missionId),script=get('missionScripts',scriptId),dep=get('alienDeployments',missionId),race=get('alienRaces',raceId),f=get('facilities',facility);
 assert.equal(mission.type,dep.type);assert.equal(mission.objective,3);assert.equal(mission.waves.length,1);
 assert.deepEqual(mission.waves[0],{ufo:missionId,count:1,trajectory:'CA_SPAWN',timer:60,objective:true});
 assert.deepEqual(mission.raceWeights,{'0':{[raceId]:100}});
 assert(Object.keys(script).every(k=>['type','missionWeights','regionWeights','useTable','executionOdds','firstMonth','lastMonth','startDelay','randomDelay','researchTriggers','minDifficulty','maxDifficulty'].includes(k)),'Unsupported mission gate');
 assert.equal(script.useTable,false);assert.equal(script.firstMonth,11);
 assert.equal(script.missionWeights['0'][missionId],75);
 assert.equal(f.prisonType,2);assert.equal(f.aliens,10);assert.equal(f.buildCost,75000);assert.equal(f.buildTime,14);
 assert(!f.requires?.length&&!f.requiresBaseFunc?.length&&!f.provideBaseFunc?.length,'Facility prerequisite adapter needed');
 const live=get('items',grubas),g=get('units',grubas),b=get('units',buster),ga=get('armors',g.armor),ba=get('armors',b.armor),ci=get('items',corpse);
 assert(live.liveAlien&&live.recover&&live.prisonType===f.prisonType&&!live.recoveryTransformations);
 assert.equal(g.liveAlien??g.type,grubas);assert.notEqual(g.capturable,false);assert(!g.spawnUnit);
 assert.equal(ga.corpseBattle[0],'STR_ZOMBIE_GRUBAS_CORPSE');assert.notEqual(get('items',ga.corpseBattle[0]).recover,false);
 assert.equal(ba.corpseGeo??ba.corpseBattle[0],corpse);assert.equal(ba.corpseBattle.length,1);
 assert.equal(ci.battleType,11);assert.notEqual(ci.recover,false);assert.notEqual(ci.recoverCorpse,false);assert(!ci.recoveryTransformations);assert(!b.spawnUnit);
 const rankG=2,rankB=0;
 assert.deepEqual(race.membersRandom[rankG],[grubas]);assert.deepEqual(race.membersRandom[rankB],[buster]);
 const quantities=rank=>{const x=dep.data.filter(d=>d.alienRank===rank);assert.equal(x.length,1);return x[0];};
 function range(rank,difficulty){
  const d=quantities(rank);assert(!d.customUnitType);assert([0,1,2,3,4].includes(difficulty));
  const med=d.medQty||0,lo=d.lowQty,hi=d.highQty;
  const n=[lo,med>0?lo+Math.trunc((med-lo)/2):lo,med>0?med:lo+Math.trunc((hi-lo)/2),med>0?med+Math.trunc((hi-med)/2):lo+Math.trunc((hi-lo)/2),hi][difficulty];
  assert([n,d.dQty,d.extraQty??0].every(Number.isSafeInteger));
  return {base:n,maximum:n+d.dQty+(d.extraQty??0)};
 }
 function transition(s,a,w,evidence,cost=0){
  return {...s,world:w,procurement:s.procurement+cost,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:{sourceSha256:proofSha,...evidence},stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 function constructionOption(s){
  const w=s.world;
  if(!s.root||!rp.settled(s)||w.facilities.has(facility)||w.funds<f.buildCost||w.forwardContainmentBuild)return null;
  return {type:'sourceStartContainment',id:facility,cost:f.buildCost,month:w.month,assumeBuildableTile:true};
 }
 function completeOption(s){
  const p=s.world.forwardContainmentBuild;
  if(!rp.settled(s)||!p||p.id!==facility||p.month!==s.world.month||s.actions.at(-1)?.type!=='sourceStartContainment')return null;
  return {type:'sourceCompleteContainment',id:facility,days:f.buildTime,assumeElapsedDays:true};
 }
 function recoveryOptions(s){
  const w=s.world,prev=s.actions.at(-1);
  if(!s.root||!rp.settled(s)||prev?.type!=='sourceMonthlyBoundary'||prev.month!==w.month||w.month<script.firstMonth||script.lastMonth!=null&&w.month>script.lastMonth||!w.facilities.has(facility)||w.forwardContainmentBuild)return [];
  if(w.difficulty<(script.minDifficulty??0)||w.difficulty>(script.maxDifficulty??4))return [];
  for(const [k,v] of Object.entries(script.researchTriggers||{}))if(active(w,k)!==v)return [];
  // Require a fresh modeled site, not an earlier victory or another reward
  // on the same monthly boundary. Other base inventories remain unknown.
  const slot=scriptId+':'+w.month;
  if((w.forwardSpecimenMissions||[]).includes(slot))return [];
  if(qty(w,grubas)>=f.aliens||qty(w,grubas)!==0)return [];
  const gr=range(rankG,w.difficulty),br=range(rankB,w.difficulty);
  if(gr.base<1||br.base<2)return [];
  const a={type:'sourceZombieOutbreakRecovery',script:scriptId,deployment:missionId,race:raceId,month:w.month,live:{[grubas]:1},corpses:{[corpse]:2},assumeMissionGenerated:true,assumeReachableSite:true,assumeValidSquad:true,assumeVictory:true,assumeSuccessfulPlacement:true,assumeCapturableAndRecovered:true,assumeAvailableContainment:true,assumeCorpsesSurvived:true,assumeNoAdditionalResourceCredit:true};
  return [{action:a,evidence:{kind:'CONDITIONAL_MISSION_SPECIMEN_RECOVERY',scriptExecutionOdds:script.executionOdds,missionSelectionWeight:75,missionSelectionTotal:100,raceWeight:100,raceTotal:100,rankEvidence:[{rank:rankG,unit:grubas,...gr},{rank:rankB,unit:buster,...br}],containment:{facility,prisonType:f.prisonType,capacity:f.aliens,knownLiveStock:qty(w,grubas)},unmodeled:['Native tactical outcome and mission arrival','All other recovered items and score','Capture tools, craft, squad, placement, recovery and actual free capacity','Calendar delays and full base economy']}}];
 }
 function apply(s,a){
  const w=structuredClone(s.world);
  if(a.type==='sourceStartContainment'){
   assert(same(constructionOption(s),a),'Construction unavailable');
   w.funds-=f.buildCost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+f.buildCost;
   w.forwardContainmentBuild={id:facility,month:w.month,days:f.buildTime};
   assert.equal(w.funds,s.income-s.procurement-f.buildCost-s.careerSpend);
   return transition(s,a,w,{kind:'RAW_CONTAINMENT_CONSTRUCTION_START',cost:f.buildCost,monthlyMaintenance:f.monthlyCost,freeTileAndLaborConditional:true},f.buildCost);
  }
  if(a.type==='sourceCompleteContainment'){
   assert(same(completeOption(s),a),'Missing pending construction');
   delete w.forwardContainmentBuild;w.facilities.add(facility);
   return transition(s,a,w,{kind:'RAW_CONTAINMENT_CONSTRUCTION_COMPLETE',days:f.buildTime,prisonType:f.prisonType,capacity:f.aliens,elapsedWithinMonthConditional:true});
  }
  const o=recoveryOptions(s).find(x=>same(x.action,a));assert(o,'No eligible source-backed specimen outcome');
  const slot=scriptId+':'+w.month;w.forwardSpecimenMissions=[...arr(w.forwardSpecimenMissions),slot];
  for(const [id,n] of Object.entries({...a.live,...a.corpses}))w.items[id]=qty(w,id)+n;
  return transition(s,a,w,o.evidence);
 }
 const recipe=get('manufacture','STR_ZOMBIE_BUSTER_CORPSE_EXTRACTION'),indexed=data.forwardSupply.recipes.find(r=>r.id===recipe.name);
 assert(indexed);assert.deepEqual(indexed.outputs,recipe.producedItems);assert.deepEqual(indexed.requiredItems,recipe.requiredItems);assert.deepEqual(indexed.requires,recipe.requires);assert.deepEqual(indexed.functions,recipe.requiresBaseFunc);assert.equal(indexed.cost,recipe.cost);assert.equal(indexed.time,recipe.time);
 for(const id of [grubas,corpse,raceId]){
  const r=get('research',id),d=data.researchRules[id];assert.equal(r.cost,d.cost);assert.equal(!!r.needItem,d.needItem);assert.equal(!!r.destroyItem,d.destroyItem);assert.deepEqual(arr(r.dependencies),d.dependencies);assert.deepEqual(arr(r.requiresBaseFunc),d.requiresBaseFunc);assert.equal(r.lookup??null,d.lookup);
 }
 return {constructionOption,completeOption,recoveryOptions,apply,recipe:indexed};
}
