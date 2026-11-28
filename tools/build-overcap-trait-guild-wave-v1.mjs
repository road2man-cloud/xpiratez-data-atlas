// V167: source-bound conditional game mission recovery, then existing trait production.
// The selected battle is modeled as a conditional witness, not a native tactical replay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {restoreLibrary,checkpointPath,data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {member} from './population-growth-replay-core.mjs';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';
const v165Path='tools/data/overcap-trait-forward-wave-v1-45144b3d36633f8bf180.json';
const v166Path='tools/data/overcap-trait-branch-fork-v1-c3b6ec68cf12ba118a1c.json';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const scriptId='guildOutpost2',missionId='STR_LOC_GUILD_OUTPOST',regionId='REGION_GUILD_OUTPOST_TEMPERATE',deploymentId='STR_LOC_GUILD_OUTPOST_TEMPERATE',raceId='STR_FLOATER_NONCOM',unitId='STR_GUILD_SOLDIER',itemId='STR_REVOLVER';
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id),qty=(s,id)=>Number(s.world.items[id]||0);
const step=(s,a)=>a.type==='sourceMonthlyBoundary'?monthly.advance(s,a):monthly.scripted(a)?monthly.applyLegacy(s,a,(w,x)=>rp.research(w,x)):rp.research(s,a);
export function restoreV166Old(){
 const a=read(v165Path),b=read(v166Path);
 assert.equal(a.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(b.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(b.priorSha256,sha(fs.readFileSync(v165Path)));
 let s=restoreLibrary().s;
 for(const x of a.newActions)s=step(s,x);
 assert.equal(receipt(s).stateHash,a.continuation.stateHash);
 for(const x of b.old.actions)s=step(s,x);
 assert.equal(receipt(s).stateHash,b.old.state.stateHash);
 return s;
}
function extractProof(){
 const dir=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const yaml=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const sourceFiles={};
 function parse(f){const bytes=fs.readFileSync(dir+'/'+f);const h=sha(bytes);assert.equal(h,data.meta.source.rules.find(x=>x.file===f).sha256);sourceFiles[f]=h;return yaml.load(bytes.toString('utf8'),{json:true});}
 const f=parse('Piratez_Factions.rul'),p=parse('Piratez_Planet.rul'),r=parse('Piratez.rul');
 const script=f.missionScripts.find(x=>x.type===scriptId);
 const mission=f.alienMissions.find(x=>x.type===missionId);
 const region=p.regions.find(x=>x.type===regionId);
 const texture=p.globe.textures.find(x=>x.id===-22);
 const deployment=f.alienDeployments.find(x=>x.type===deploymentId);
 const race=f.alienRaces.find(x=>x.id===raceId);
 const unit=f.units.find(x=>x.type===unitId);
 const item=r.items.find(x=>x.type===itemId);
 assert([script,mission,region,texture,deployment,race,unit,item].every(Boolean));
 // Only relevant fields, not whole original rules.
 const sourceArchive='tools/headless-simulator/native/'+lock.archive;
 assert.equal(sha(fs.readFileSync(sourceArchive)),lock.archiveSha256);
 const sources={};
 for(const [name,file,needles] of [
 ['equipment','./src/Battlescape/BattlescapeGenerator.cpp',['getAlienItemLevels().at(_save->getAlienItemLevel()).at(RNG::generate(0,9))','dd.itemSets.at(itemLevel).items']],
 ['site','./src/Savegame/AlienMission.cpp',['texture->getRandomDeployment()']],
 ['recovery','./src/Battlescape/DebriefingState.cpp',['!rule->isFixed() && rule->isRecoverable()','recoverItems(battle->getTile(i)->getInventory(), base, craft)']]
 ]){
  const text=execFileSync('tar',['-xOf',sourceArchive,file],{encoding:'utf8'}),lines=text.split(/\r?\n/);
  sources[name]={file,sha256:sha(text),matches:needles.map(n=>{const i=lines.findIndex(x=>x.includes(n));assert(i>=0,n);return {line:i+1,text:lines[i].trim()};})};
 }
 return {schema:'ATLAS_OVERCAP_GUILD_PISTOL_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles,engineArchiveSha256:lock.archiveSha256,engineEvidence:sources,
 script,mission,region:{type:region.type,spawnZone:mission.spawnZone,zoneCount:region.missionZones.length,textureIds:[...new Set(region.missionZones[mission.spawnZone].map(x=>x[4]))]},texture,
 deployment:{type:deployment.type,data:deployment.data.filter(x=>x.alienRank===5),unlockedResearch:deployment.unlockedResearch??null},
 race:{id:race.id,members:race.members},unit:{type:unit.type,isLivingWeapon:unit.livingWeapon??false},item:{type:item.type,recover:item.recover??true,fixed:item.fixed??false,recoveryTransformations:item.recoveryTransformations??null,battleType:item.battleType},itemLevels:f.alienItemLevels};
}
export function createGuildPistolRecovery(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_GUILD_PISTOL_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [f,h] of Object.entries(proof.sourceFiles))assert.equal(h,data.meta.source.rules.find(x=>x.file===f).sha256);
 assert.deepEqual(proof.script.researchTriggers,{STR_MISSION_GUILD_OUTPOST:true});
 assert.equal(proof.script.type,scriptId);
 assert.equal(proof.script.useTable,false);
 assert.equal(proof.script.missionWeights['0'][missionId],100);
 assert(proof.script.regionWeights['0'][regionId]>0&&proof.script.executionOdds>0);
 assert.equal(proof.mission.type,missionId);assert.equal(proof.mission.objective,3);
 assert.equal(proof.mission.waves[0].trajectory,'CA_SPAWN');
 assert(proof.mission.raceWeights['0'][raceId]>0);
 assert.deepEqual(proof.region.textureIds,[-22]);
 assert.equal(proof.texture.deployments[deploymentId],100);
 assert.equal(proof.deployment.unlockedResearch,null);
 assert.equal(proof.race.members[5],unitId);
 assert.equal(proof.unit.isLivingWeapon,false);
 const d=proof.deployment.data[0];
 assert(d.alienRank===5&&d.lowQty>0&&d.itemSets[0].includes(itemId));
 assert.equal(proof.item.type,itemId);assert(proof.item.recover&&!proof.item.fixed&&!proof.item.recoveryTransformations);
 assert.equal(proof.item.battleType,1);
 assert.equal(proof.itemLevels.length,1);assert(proof.itemLevels[0].includes(0));
 function option(s){
  if(!rp.settled(s)||!active(s,'STR_MISSION_GUILD_OUTPOST')||s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||s.world.forwardGuildPistolRecovery)return null;
  return {type:'sourceGuildPistolRecovery',month:s.world.month,script:scriptId,mission:missionId,region:regionId,deployment:deploymentId,race:raceId,rank:5,unit:unitId,itemLevel:0,item:itemId,count:1,assumeSelectedScriptAndRegion:true,assumeSelectedRaceAndEquipment:true,assumeValidCraftAndSquad:true,assumeVictoryAndIntactRecovery:true};
 }
 function apply(s,a){
  assert.deepEqual(a,option(s),'Recovery not enabled or already applied');
  const w=structuredClone(s.world);
  w.forwardGuildPistolRecovery={month:a.month,script:a.script,mission:a.mission,item:a.item,count:a.count};
  w.items[itemId]=qty(s,itemId)+1;
  assert.equal(w.funds,s.world.funds);
  return {...s,world:w,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:{kind:'SOURCE_BOUND_CONDITIONAL_MISSION_EQUIPMENT_RECOVERY',proofSha256:sha(JSON.stringify(proof)),missionResearchGate:'STR_MISSION_GUILD_OUTPOST',scriptOdds:proof.script.executionOdds,regionWeight:proof.script.regionWeights['0'][regionId],raceWeight:proof.mission.raceWeights['0'][raceId],itemLevelSlots:proof.itemLevels[0].filter(x=>x===0).length,otherLootScoreElapsedTimeAndCombatUnmodeled:true}}]};
 }
 return {option,apply};
}
function build(){
 const proof=extractProof(),adapter=createGuildPistolRecovery(proof);
 const seed=restoreV166Old();
 const bulk=read(bulkPath);assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 let s=seed;const milestones=[],errors=[];
 const snap=st=>{const m=member(st.world),f=rp.finish(st);return {body:f.body,statKeys:STAT_KEYS,raw:f.raw,bonus:f.bonus,effective:f.vector,traits:[...m.state.bonusCounts],history:[...m.state.history],stateHash:receipt(st).stateHash,month:st.world.month,balance:st.world.funds};};
 function advance(label,fn){
  const before=s;
  try{const next=fn(before);assert.deepEqual(next.actions.slice(0,before.actions.length),before.actions);if(next.actions.length>before.actions.length){s=next;milestones.push({label,actions:next.actions.slice(before.actions.length),research:[...next.world.researched].filter(id=>!active(before,id)&&active(next,id)),stateHash:receipt(next).stateHash});}}
  catch(e){errors.push({label,reason:String(e.message)});}
 }
 advance('Guild outpost research',st=>lab(st,'STR_MISSION_GUILD_OUTPOST'));
 advance('Selected guild mission pistol recovery',st=>{let n=monthly.advance(st);const a=adapter.option(n);assert(a);return adapter.apply(n,a);});
 for(const id of [itemId,'STR_PISTOLS_SUMMARY','STR_BASIC_FIREARMS_TRAINING','STR_FIREARMS_SUMMARY','STR_FLINTLOCKS_PRODUCTION','STR_CLOCKWORK_GUN_PRODUCTION'])advance(id,st=>lab(st,id));
 advance('Captain log late monthly event',st=>{
  if(active(st,'STR_CAPTAINS_LOG_01'))return st;
  let n=monthly.advance(st);
  const o=rp.options(n).find(x=>x.action.type==='eventResearch'&&x.action.event==='STR_CAP_LOG_1_AWFUL'&&x.action.research==='STR_CAPTAINS_LOG_01');
  assert(o,'Late log event not available');
  n=settle(step(n,o.action));assert(active(n,'STR_CAPTAINS_LOG_01'));return n;
 });
 advance('Personal attention research',st=>lab(st,'STR_PERSONAL_ATTENTION'));
 const campaignActions=s.actions.slice(seed.actions.length);
 let replay=restoreV166Old();for(const a of campaignActions)replay=a.type==='sourceGuildPistolRecovery'?adapter.apply(replay,a):step(replay,a);
 assert.deepEqual(receipt(replay),receipt(s));
 const selected=['STR_BASIC_FIREARMS_TRAINING','STR_PERSONAL_ATTENTION'];
 const groups=bulk.groups.filter(g=>checkpointGroup(g)&&g.stages.some(st=>selected.includes(st.action.transform)));
 function checkpointGroup(g){return bulk.acquisitions.find(a=>a.id===g.acquisition)?.profile==='manufacture:STR_RAIDER_SCOUT_RECRUITMENT';}
 const resultMap=new Map(),links=[];
 for(const g of groups){
  const actions=g.stages.filter(st=>selected.includes(st.action.transform)).map(st=>st.action);
  const key=JSON.stringify(actions);
  if(!resultMap.has(key)){
   let n=s;const applied=[],blocked=[];
   for(const a of actions){try{n=rp.career(n,a);applied.push(a);}catch(e){blocked.push({action:a,reason:String(e.message)});}}
   let rr=s;for(const a of applied)rr=rp.career(rr,a);assert.deepEqual(receipt(rr),receipt(n));
   const id=sha(JSON.stringify([receipt(s).stateHash,applied])).slice(0,24);
   resultMap.set(key,{id,requested:actions,applied,blocked,actual:snap(n),finalAdmission:false});
  }
  const route=resultMap.get(key);
  for(const id of g.goalIds){
   const goal=bulk.goals.find(x=>x.id===id);assert(goal);
   links.push({goal:id,group:g.id,originProfile:'manufacture:STR_RAIDER_SCOUT_RECRUITMENT',legacyBranch:goal.legacyBranch,targetBody:goal.targetBody,expectedTraits:goal.legacyExpected.traits,expectedHistory:goal.legacyExpected.history,expectedEffective:goal.legacyExpected.effective,partialRoute:route.id,remainingOriginalActions:g.stages.filter(st=>st.action.type==='transform'&&!route.applied.some(a=>a.transform===st.action.transform)).map(st=>st.action),status:route.applied.length?'CONDITIONAL_REORDERED_TRAIT_PREFIX':'BLOCKED',finalAdmission:false});
  }
 }
 const routes=[...resultMap.values()],produced=routes.filter(x=>x.applied.length);
 const summary={preservedGoals:bulk.goals.length,linkedGoals:links.length,linkedGroups:groups.length,actualAppliedRouteVariants:produced.length,uniqueAppliedStates:new Set(produced.map(x=>x.actual.stateHash)).size,goalsWithAppliedTrait:links.filter(x=>x.status==='CONDITIONAL_REORDERED_TRAIT_PREFIX').length,distinctAppliedTrainings:[...new Set(produced.flatMap(x=>x.applied.map(a=>a.transform)))],newActions:campaignActions.length,newActiveResearch:[...s.world.researched].filter(id=>!active(seed,id)&&active(s,id)),finalAdmission:0,actualGameCertified:0};
 const report={schema:'ATLAS_OVERCAP_TRAIT_GUILD_WAVE_V1',scope:'Conditionally generated game mission and equipment recovery; not an executed tactical battle. Other loot, global score, full economy and elapsed time unmodeled. Reordered partial trait results cannot be promoted to final target maxima.',sourceMetadataSha256:data.meta.source.metadataSha256,sourceProof:proof,sourceProofSha256:sha(JSON.stringify(proof)),v165Path,v165Sha256:sha(fs.readFileSync(v165Path)),v166Path,v166Sha256:sha(fs.readFileSync(v166Path)),bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),seed:snap(seed),continuation:snap(s),campaignActions,campaignTrace:s.trace.slice(seed.trace.length),milestones,errors,routes,links,summary,normalizationComplete:false,actualGameCertified:false,finalAdmission:false};
 const bytes=JSON.stringify(report)+'\n',out='tools/data/overcap-trait-guild-wave-v1-'+sha(bytes).slice(0,20)+'.json';
 if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
 console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),summary,errors,month:s.world.month,routes:routes.map(r=>({id:r.id,applied:r.applied.map(a=>a.transform),blocked:r.blocked,body:r.actual.body,traits:r.actual.traits,effective:r.actual.effective}))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
