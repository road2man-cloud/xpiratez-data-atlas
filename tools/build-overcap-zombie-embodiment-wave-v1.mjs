// V168: produce zombie embodiment supply and a separate poltergeist fork.
// No legacy-state injection. Selected tactical recovery is conditional.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {restoreV166Old,createGuildPistolRecovery} from './build-overcap-trait-guild-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const priorPath='tools/data/overcap-trait-guild-wave-v1-d654bdb07ed5b1c84918.json';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const qty=(s,id)=>Number(s.world.items[id]||0);
const standardStep=(s,a)=>a.type==='sourceMonthlyBoundary'?monthly.advance(s,a):monthly.scripted(a)?monthly.applyLegacy(s,a,(w,x)=>rp.research(w,x)):rp.research(s,a);
export function restoreV167(){
 const report=read(priorPath);
 assert.equal(report.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(report.sourceProofSha256,sha(JSON.stringify(report.sourceProof)));
 const adapter=createGuildPistolRecovery(report.sourceProof);
 let s=restoreV166Old();
 assert.equal(receipt(s).stateHash,report.seed.stateHash);
 for(const a of report.campaignActions)s=a.type==='sourceGuildPistolRecovery'?adapter.apply(s,a):standardStep(s,a);
 assert.equal(receipt(s).stateHash,report.continuation.stateHash);
 return s;
}
const SAD='STR_ZOMBIE_SADAKO_TERRORIST',SADC='STR_ZOMBIE_SADAKO_CORPSE',CAR='STR_ZOMBIE_CARRIE_TERRORIST',CARC='STR_ZOMBIE_CARRIE_CORPSE',STER='STR_ZOMBIE_STERILE_TERRORIST';
const VILLAGE='STR_LOC_RATLING_VILLAGE',OUTBREAK='STR_LOC_ZOMBIE_OUTBREAK2',RACE='STR_ZOMBIE';
const RECIPE='STR_ZOMBIE_SADAKO_TERRORIST_EXTRACTION',SUST='STR_ZOMBIE_SUSTENANCE';
const SPECS=[
 {script:'ratlingVillage2',deployment:VILLAGE,region:'REGION_LOC_RATLING_VILLAGE',live:[{unit:SAD,rank:3,count:2}],corpses:[{unit:SAD,rank:3,item:SADC,count:1},{unit:CAR,rank:6,item:CARC,count:1}]},
 {script:'zombieOutbreakLate',deployment:OUTBREAK,region:'STR_NORTH_AMERICA',live:[{unit:STER,rank:5,count:1}],corpses:[]}
];
const arr=x=>Array.isArray(x)?x:[];
function extractProof(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const yaml=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const sourceFiles={};
 function load(file){const bytes=fs.readFileSync(root+'/'+file),h=sha(bytes);assert.equal(h,data.meta.source.rules.find(x=>x.file===file).sha256);sourceFiles[file]=h;return yaml.load(bytes.toString('utf8'),{json:true});}
 const p=load('Piratez.rul'),f=load('Piratez_Factions.rul'),pl=load('Piratez_Planet.rul'),a=load('Piratez_Armors.rul'),e=load('Piratez_Events.rul');
 const itemMap=new Map([...arr(p.items),...arr(f.items)].filter(x=>x.type).map(x=>[x.type,x]));
 const race=f.alienRaces.find(x=>x.id===RACE);
 const units=[SAD,CAR,STER].map(id=>{
  const unit=f.units.find(x=>x.type===id);assert(unit);
  const armor=a.armors.find(x=>x.type===unit.armor)||p.armors?.find(x=>x.type===unit.armor);assert(armor);
  const corpse=armor.corpseGeo||armor.corpseBattle?.[0];
  return {unit,armor:{type:armor.type,corpseBattle:armor.corpseBattle,corpseGeo:armor.corpseGeo??null},live:itemMap.get(id),corpse:itemMap.get(corpse)};
 });
 const missions=SPECS.map(spec=>{
  const script=f.missionScripts.find(x=>x.type===spec.script),mission=f.alienMissions.find(x=>x.type===spec.deployment),deployment=f.alienDeployments.find(x=>x.type===spec.deployment);
  const region=pl.regions.find(x=>x.type===spec.region);assert(script&&mission&&deployment&&region);
  const zone=region.missionZones[mission.spawnZone];assert(zone?.length);
  const textures=[...new Set(zone.map(x=>x[4]))];
  return {script,mission,deployment:{type:deployment.type,unlockedResearch:deployment.unlockedResearch??null,startingCondition:deployment.startingCondition??null,data:deployment.data.filter(x=>[...spec.live,...spec.corpses].some(t=>t.rank===x.alienRank))},region:{type:region.type,zoneCount:zone.length,textures},textureRules:spec.deployment===VILLAGE?pl.globe.textures.filter(x=>textures.includes(x.id)):[]};
 });
 const facilities=p.facilities.filter(x=>['STR_JAIL','STR_BURROW'].includes(x.type)).map(x=>({id:x.type,capacity:x.aliens,prisonType:x.prisonType??0}));
 const liveCatalog=Object.fromEntries([...itemMap].filter(([k,v])=>v.liveAlien===true).map(([k,v])=>[k,v.prisonType??0]).sort(([a],[b])=>a.localeCompare(b)));
 const recipe=p.manufacture.find(x=>x.name===RECIPE);
 const research=p.research.filter(x=>[SAD,SADC,CARC,STER,SUST,'STR_POLTERGEIST','STR_EMBRACE_THE_POWER'].includes(x.name));
 const event=e.events.find(x=>x.name==='STR_PLAGUE_POLTERGEIST'),eventScript=e.eventScripts.find(x=>x.type==='STR_PLAGUE_POLTERGEIST');
 const archive='tools/headless-simulator/native/'+lock.archive;
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const engineEvidence={};
 for(const [key,file,needles] of [
 ['spawn','./src/Battlescape/BattlescapeGenerator.cpp',['quantity = dd.medQty > 0 ? dd.medQty :','race->getMember(dd.alienRank)']],
 ['site','./src/Savegame/AlienMission.cpp',['texture->getRandomDeployment()']],
 ['recovery','./src/Battlescape/DebriefingState.cpp',['recoverItems(battle->getTile(i)->getInventory(), base, craft)','getLiveAlienGeoscape()']]
 ]){
  const t=execFileSync('tar',['-xOf',archive,file],{encoding:'utf8'}),lines=t.split(/\r?\n/);
  engineEvidence[key]={file,sha256:sha(t),lines:needles.map(n=>{const i=lines.findIndex(x=>x.includes(n));assert(i>=0,n);return i+1;})};
 }
 return {schema:'ATLAS_OVERCAP_ZOMBIE_EMBODIMENT_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles,engineArchiveSha256:lock.archiveSha256,engineEvidence,race:{id:race.id,membersRandom:race.membersRandom},units,missions,facilities,liveCatalog,recipe,research,event,eventScript};
}
export function createSpecimenAdapter(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_ZOMBIE_EMBODIMENT_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [k,v] of Object.entries(proof.sourceFiles))assert.equal(v,data.meta.source.rules.find(x=>x.file===k).sha256);
 assert.equal(proof.race.id,RACE);
 for(const spec of SPECS){
  const r=proof.missions.find(x=>x.script.type===spec.script),{script,mission,deployment,region,textureRules}=r;
  assert.equal(script.useTable,false);assert(script.executionOdds>0);
  assert(Object.keys(script).every(k=>['type','firstMonth','lastMonth','missionWeights','regionWeights','useTable','executionOdds','startDelay','randomDelay','researchTriggers','minDifficulty','maxDifficulty'].includes(k)));
  assert(script.missionWeights['0'][spec.deployment]>0&&script.regionWeights['0'][spec.region]>0);
  assert.equal(region.type,spec.region);assert(region.zoneCount>0);
  assert.equal(mission.type,spec.deployment);assert.equal(deployment.type,spec.deployment);
  assert.equal(mission.objective,3);assert.equal(mission.waves.length,1);assert.equal(mission.waves[0].trajectory,'CA_SPAWN');assert.equal(mission.waves[0].count,1);assert(mission.waves[0].objective);
  assert(mission.raceWeights['0'][RACE]>0);
  if(spec.deployment===VILLAGE){assert.deepEqual(region.textures,[-5]);assert.deepEqual(textureRules[0].deployments,{[VILLAGE]:100});assert.equal(mission.waves[0].ufo,'dummy');}
  else assert.equal(mission.waves[0].ufo,spec.deployment);
  for(const t of [...spec.live,...spec.corpses]){
   const u=proof.units.find(x=>x.unit.type===t.unit);assert(u);
   assert.equal(u.unit.liveAlien??u.unit.type,t.unit);assert(!u.unit.spawnUnit);
   assert(proof.race.membersRandom[t.rank].includes(t.unit));
   const d=deployment.data.filter(x=>x.alienRank===t.rank);assert.equal(d.length,1);assert(!d[0].customUnitType);
   if(t.item){assert.equal(u.armor.corpseGeo??u.armor.corpseBattle[0],t.item);assert.equal(u.corpse.type,t.item);assert.equal(u.corpse.battleType,11);assert.notEqual(u.corpse.recover,false);assert.notEqual(u.corpse.recoverCorpse,false);assert(!u.corpse.recoveryTransformations);}
   else{assert.notEqual(u.unit.capturable,false);assert(u.live.liveAlien&&u.live.recover);assert(!u.live.recoveryTransformations);assert.equal(proof.liveCatalog[t.unit],u.live.prisonType??0);}
  }
 }
 const indexed=data.forwardSupply.recipes.find(r=>r.id===RECIPE),recipe=proof.recipe;
 assert(indexed&&recipe);assert.deepEqual(indexed.outputs,recipe.producedItems);assert.deepEqual(indexed.requiredItems,recipe.requiredItems);assert.deepEqual(indexed.requires,recipe.requires);assert.deepEqual(indexed.functions,recipe.requiresBaseFunc);assert.equal(indexed.cost,recipe.cost);assert.equal(indexed.time,recipe.time);
 for(const r of proof.research){const d=data.researchRules[r.name];assert(d);assert.deepEqual(arr(r.dependencies),d.dependencies);assert.deepEqual(arr(r.requiresBaseFunc),d.requiresBaseFunc);assert.equal(!!r.needItem,d.needItem);assert.equal(!!r.destroyItem,d.destroyItem);}
 assert.deepEqual(proof.eventScript.researchTriggers,{STR_PSI_LAB:true,STR_EMBRACE_THE_POWER:true});
 assert.deepEqual(proof.event.everyItemList,['STR_POLTERGEIST']);
 assert.deepEqual(data.forwardSupply.events.STR_PLAGUE_POLTERGEIST.fixed,{STR_POLTERGEIST:1});
 function option(s,scriptId){
  const spec=SPECS.find(x=>x.script===scriptId);if(!spec)return null;
  const w=s.world,prev=s.actions.at(-1),r=proof.missions.find(x=>x.script.type===spec.script),sc=r.script;
  if(!rp.settled(s)||prev?.type!=='sourceMonthlyBoundary'||prev.month!==w.month||w.month<(sc.firstMonth??0)||(sc.lastMonth!=null&&w.month>sc.lastMonth)||w.difficulty<(sc.minDifficulty??0)||w.difficulty>(sc.maxDifficulty??4))return null;
  if(Object.entries(sc.researchTriggers||{}).some(([k,v])=>active(s,k)!==v))return null;
  if(r.deployment.unlockedResearch&&!active(s,r.deployment.unlockedResearch))return null; // never omit a new mission research reward
  if(r.deployment.startingCondition)return null;
  const slot=spec.script+':'+w.month;
  if(arr(w.forwardSpecimenMissions).includes(slot))return null;
  const counts={};
  for(const t of [...spec.live,...spec.corpses])counts[t.rank]=(counts[t.rank]||0)+t.count;
  const rankEvidence=Object.entries(counts).map(([rank,count])=>{
   const d=r.deployment.data.find(x=>x.alienRank===Number(rank));assert(d);
   const lo=d.lowQty,hi=d.highQty,med=d.medQty||0,n=[lo,med?lo+Math.trunc((med-lo)/2):lo,med||lo+Math.trunc((hi-lo)/2),med?med+Math.trunc((hi-med)/2):lo+Math.trunc((hi-lo)/2),hi][w.difficulty];
   assert(Number.isSafeInteger(n)&&n>=count,'Selected specimen exceeds base spawn quantity');
   return {rank:Number(rank),base:n,selected:count};
  });
  const containment=[];
  for(const type of new Set(spec.live.map(t=>proof.liveCatalog[t.unit]))){
   const capacity=proof.facilities.filter(f=>f.prisonType===type&&w.facilities.has(f.id)).reduce((n,f)=>n+f.capacity,0);
   const known=Object.entries(w.items).filter(([id])=>proof.liveCatalog[id]===type).reduce((n,[,q])=>n+q,0);
   const added=spec.live.filter(t=>proof.liveCatalog[t.unit]===type).reduce((n,t)=>n+t.count,0);
   if(capacity<known+added)return null;
   containment.push({prisonType:type,capacity,known,added});
  }
  const action={type:'sourceZombieEmbodimentSpecimenRecovery',month:w.month,script:spec.script,deployment:spec.deployment,region:spec.region,race:RACE,live:Object.fromEntries(spec.live.map(t=>[t.unit,t.count])),corpses:Object.fromEntries(spec.corpses.map(t=>[t.item,t.count])),assumeSelectedMissionAndRace:true,assumeSelectedUnitsAndPlacement:true,assumeValidCraftAndSquad:true,assumeVictoryAndSuccessfulCapture:true,assumeIntactCorpseRecovery:true,assumeFreeActualContainment:true};
  const mw=sc.missionWeights['0'],rw=r.mission.raceWeights['0'];
  return {action,evidence:{kind:'CONDITIONAL_DISTINCT_MISSION_SPECIMEN_RECOVERY',proofSha256:sha(JSON.stringify(proof)),slot,scriptOdds:sc.executionOdds,missionWeight:mw[spec.deployment],missionTotal:Object.values(mw).reduce((a,b)=>a+b,0),raceWeight:rw[RACE],raceTotal:Object.values(rw).reduce((a,b)=>a+b,0),rankEvidence,containment,otherLootAndScoreUnmodeled:true}};
 }
 function apply(s,a){
  const o=option(s,a.script);assert(o);assert.deepEqual(o.action,a);
  const w=structuredClone(s.world);w.forwardSpecimenMissions=[...arr(w.forwardSpecimenMissions),o.evidence.slot];
  for(const [id,n] of Object.entries({...a.live,...a.corpses}))w.items[id]=qty(s,id)+n;
  assert.equal(w.funds,s.income-s.procurement-s.careerSpend);
  return {...s,world:w,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:o.evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 // Reserve manufacture is for a future acquisition, not a missing research sample.
 assert(Object.keys(recipe).every(k=>['name','category','requires','space','time','cost','requiresBaseFunc','requiredItems','producedItems','listOrder'].includes(k)));
 function extractionOption(s){
  if(!rp.settled(s)||s.world.forwardZombieEmbodimentReserve||qty(s,'STR_ZOMBIE_BRAIN')!==0||s.world.funds<recipe.cost)return null;
  if(!recipe.requires.every(id=>active(s,id))||!recipe.requiresBaseFunc.every(id=>s.world.baseFunctions.has(id))||!Object.entries(recipe.requiredItems).every(([id,n])=>qty(s,id)>=n))return null;
  return {type:'sourceZombieEmbodimentReserveExtraction',id:recipe.name,goal:'manufacture:STR_ZOMBIE_EMBODIMENT',count:1,inputs:recipe.requiredItems,outputs:recipe.producedItems,cost:recipe.cost,engineerHours:recipe.time,assumeWorkshopCapacity:true,assumeElapsedManufacture:true};
 }
 function extract(s,a){
  assert.deepEqual(extractionOption(s),a);
  const w=structuredClone(s.world);
  for(const [id,n] of Object.entries(recipe.requiredItems))w.items[id]=qty(s,id)-n;
  for(const [id,n] of Object.entries(recipe.producedItems))w.items[id]=qty(s,id)+n;
  w.funds-=recipe.cost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+recipe.cost;
  w.forwardZombieEmbodimentReserve={recipe:recipe.name,goal:a.goal,count:1};
  const procurement=s.procurement+recipe.cost;
  assert.equal(w.funds,s.income-procurement-s.careerSpend);
  return {...s,world:w,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:{kind:'SOURCE_BOUND_ACQUISITION_RESERVE_MANUFACTURE',proofSha256:sha(JSON.stringify(proof)),research:recipe.requires,functions:recipe.requiresBaseFunc,inputs:recipe.requiredItems,outputs:recipe.producedItems,engineerHours:recipe.time,workshopAndDurationConditional:true}}]};
 }
 return {option,apply,extractionOption,extract};
}
export function restoreV168(path,branch='common'){
 const report=read(path);assert.equal(report.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(report.sourceProofSha256,sha(JSON.stringify(report.sourceProof)));
 assert.equal(report.priorSha256,sha(fs.readFileSync(priorPath)));
 const ad=createSpecimenAdapter(report.sourceProof);let s=restoreV167();
 assert.equal(receipt(s).stateHash,report.seed.stateHash);
 const step=(s,a)=>a.type==='sourceZombieEmbodimentSpecimenRecovery'?ad.apply(s,a):a.type==='sourceZombieEmbodimentReserveExtraction'?ad.extract(s,a):standardStep(s,a);
 for(const a of report.common.actions)s=step(s,a);
 assert.equal(receipt(s).stateHash,report.common.state.stateHash);
 if(branch==='poltergeist'){for(const a of report.poltergeist.actions)s=step(s,a);assert.equal(receipt(s).stateHash,report.poltergeist.state.stateHash);}
 else assert.equal(branch,'common');
 return s;
}
function build(){
 const proof=extractProof(),ad=createSpecimenAdapter(proof),seed=restoreV167(),bulk=read(bulkPath);
 assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 const snap=s=>({root:s.root,month:s.world.month,difficulty:s.world.difficulty,stateHash:receipt(s).stateHash,balance:s.world.funds,stock:Object.fromEntries([SAD,SADC,CAR,CARC,STER,'STR_ZOMBIE_BRAIN','STR_ZOMBIE_ESSENCE','STR_POLTERGEIST','STR_GLAMOUR','STR_ELERIUM_115'].map(id=>[id,qty(s,id)])),activeResearch:[...s.world.researched].filter(id=>active(s,id)),disabled:[...s.world.disabled],functions:[...s.world.baseFunctions]});
 const capture=(s,id)=>{const n=monthly.advance(s);const o=ad.option(n,id);assert(o,'No specimen recovery option '+id);return ad.apply(n,o.action);};
 let s=capture(seed,'ratlingVillage2');
 for(const id of [SAD,SADC,CARC])s=lab(s,id);
 assert.equal(qty(s,SAD),1);
 const m=ad.extractionOption(s);assert(m,'Missing acquisition reserve extraction option');
 s=ad.extract(s,m);
 assert.equal(qty(s,'STR_ZOMBIE_BRAIN'),qty(seed,'STR_ZOMBIE_BRAIN')+1);
 assert.equal(qty(s,'STR_ZOMBIE_ESSENCE'),qty(seed,'STR_ZOMBIE_ESSENCE')+5);
 // Essence research requires alchemy, not merely possession of the material.
 s=capture(s,'zombieOutbreakLate');assert.equal(qty(s,STER),qty(seed,STER)+1);
 // Advance only enabled nonexclusive, nonrandom target-support lab projects.
 const acqs=bulk.acquisitions.filter(a=>['manufacture:STR_ZOMBIE_EMBODIMENT','manufacture:STR_POLTERGEIST_EMBODIMENT'].includes(a.profile));
 const groups=bulk.groups.filter(g=>acqs.some(a=>a.id===g.acquisition));
 const related=new Map();
 function visit(id,target,seen=new Set()){if(seen.has(id))return;seen.add(id);if(!related.has(id))related.set(id,new Set());related.get(id).add(target);if(active(s,id))return;const r=data.researchRules[id];for(const x of [...arr(r?.requires),...arr(r?.dependencies)])visit(x,target,seen);}
 for(const g of groups)for(const st of g.stages)for(const t of arr(st.requirements?.research))visit(t,t);
 for(let i=0;i<30;i++){
  const choices=rp.options(s).filter(o=>{const id=o.action.id,r=data.researchRules[id];return o.action.type==='research'&&related.has(id)&&r&&!active(s,id)&&!r.needItem&&!arr(r.disables).length&&!arr(r.getOneFree).length&&!Object.keys(r.getOneFreeProtected||{}).length;}).sort((a,b)=>related.get(b.action.id).size-related.get(a.action.id).size||a.action.id.localeCompare(b.action.id));
  if(!choices.length)break;s=lab(s,choices[0].action.id);
 }
 // Finish the direct lab steps only if the exact campaign enables them.
 for(const id of ['STR_ZOMBIE_ESSENCE',SUST])if(!active(s,id)&&rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))s=lab(s,id);
 const researchBlockers=Object.fromEntries(['STR_ALCHEMY','STR_ZOMBIE_ESSENCE',SUST,'STR_PSI_COMMUNION','STR_ZOMBIE_EMBODIMENT','STR_POLTERGEIST_EMBODIMENT'].map(id=>{const r=data.researchRules[id];return [id,{active:active(s,id),missingDependencies:arr(r.dependencies).filter(k=>!active(s,k)),missingFunctions:arr(r.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k)),disabled:s.world.disabled.has(id)}];}));
 const common=s;
 // Fork this choice, preserving the uncommitted reject/embrace branch.
 let pol=lab(common,'STR_EMBRACE_THE_POWER');
 assert(pol.world.disabled.has('STR_REJECT_THE_POWER'));assert(!common.world.disabled.has('STR_REJECT_THE_POWER'));
 pol=monthly.advance(pol);
 const event=rp.options(pol).find(o=>o.action.type==='sourceEventItems'&&o.action.event==='STR_PLAGUE_POLTERGEIST');assert(event,'Poltergeist event unavailable');
 pol=settle(standardStep(pol,event.action));assert.equal(qty(pol,'STR_POLTERGEIST'),qty(common,'STR_POLTERGEIST')+1);
 pol=lab(pol,'STR_POLTERGEIST');assert.equal(qty(pol,'STR_POLTERGEIST'),1);
 const step=(s,a)=>a.type==='sourceZombieEmbodimentSpecimenRecovery'?ad.apply(s,a):a.type==='sourceZombieEmbodimentReserveExtraction'?ad.extract(s,a):standardStep(s,a);
 let rr=restoreV167();for(const a of common.actions.slice(seed.actions.length))rr=step(rr,a);assert.deepEqual(receipt(rr),receipt(common));
 for(const a of pol.actions.slice(common.actions.length))rr=step(rr,a);assert.deepEqual(receipt(rr),receipt(pol));
 const rows=acqs.map(a=>{
  const state=a.profile.includes('POLTERGEIST')?pol:common,missing=rp.missing(state,a.requirements);
  const links=groups.filter(g=>g.acquisition===a.id).map(g=>({group:g.id,goals:g.goalIds,enabledTraitResearch:[...new Set(g.stages.filter(st=>st.action.type==='transform'&&arr(st.requirements?.research).every(k=>active(state,k))).map(st=>st.action.transform))]}));
  return {profile:a.profile,acquisition:a.id,goalIds:a.goalIds,legacyDifficulty:a.context.difficulty,modeledDifficulty:state.world.difficulty,legacyDifficultyMatches:a.context.difficulty===state.world.difficulty,branch:a.profile.includes('POLTERGEIST')?'poltergeist':'common',requirements:a.requirements,missing,links,originNotYetRecruited:true,actualGameCertified:false,finalAdmission:false};
 });
 const distinctGoals=new Set(rows.flatMap(r=>r.goalIds));assert.equal(distinctGoals.size,124);
 const report={schema:'ATLAS_OVERCAP_ZOMBIE_EMBODIMENT_WAVE_V1',scope:'Conditionally generated game battles and selected recoveries. No native tactical replay, full score, total campaign economy or exact timing. Material preparation only: existing origin is retained, no new legacy target acquisition or trait application is counted.',sourceMetadataSha256:data.meta.source.metadataSha256,sourceProof:proof,sourceProofSha256:sha(JSON.stringify(proof)),priorPath,priorSha256:sha(fs.readFileSync(priorPath)),bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),seed:snap(seed),common:{state:snap(common),actions:common.actions.slice(seed.actions.length),trace:common.trace.slice(seed.trace.length)},poltergeist:{state:snap(pol),actions:pol.actions.slice(common.actions.length),trace:pol.trace.slice(common.trace.length)},acquisitions:rows,researchBlockers,summary:{preservedGoals:bulk.goals.length,materialSupportGoals:distinctGoals.size,materialSupportGroups:groups.length,commonActions:common.actions.length-seed.actions.length,poltergeistActions:pol.actions.length-common.actions.length,commonNewActive:[...common.world.researched].filter(id=>active(common,id)&&!active(seed,id)),poltergeistNewActive:[...pol.world.researched].filter(id=>active(pol,id)&&!active(common,id)),newBirths:0,newTraitApplications:0,finalAdmission:0,actualGameCertified:0},actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
 const bytes=JSON.stringify(report)+'\n',out='tools/data/overcap-zombie-embodiment-wave-v1-'+sha(bytes).slice(0,20)+'.json';
 if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
 console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),summary:report.summary,common:{month:common.world.month,stock:report.common.state.stock,stateHash:report.common.state.stateHash},poltergeist:{month:pol.world.month,stock:report.poltergeist.state.stock,stateHash:report.poltergeist.state.stateHash},acquisitions:rows.map(({profile,missing,legacyDifficultyMatches})=>({profile,missing,legacyDifficultyMatches}))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
