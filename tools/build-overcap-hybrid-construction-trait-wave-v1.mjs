// V174: recover construction stock, construct facilities, and apply traits in
// the hybrid campaign. Selected tactical outcomes remain conditional.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {restoreV173,createHybridGdx} from './build-overcap-hybrid-gdx-wave-v1.mjs';
import {createPsiSupport} from './build-overcap-psi-support-wave-v1.mjs';
import {createGuildPistolRecovery} from './build-overcap-trait-guild-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,repeatCash,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {member} from './population-growth-replay-core.mjs';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';
const PRIOR='tools/data/overcap-hybrid-gdx-wave-v1-829c18c1dd453c52b35a.json.gz';
const PSI='tools/data/overcap-psi-support-wave-v1-dfd6237af3dd2b53dc72.json';
const GUILD='tools/data/overcap-trait-guild-wave-v1-d654bdb07ed5b1c84918.json';
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const UI='public/data/soldier-forward-trait-progress-v173.json';
const PROFILE='manufacture:STR_RAIDER_SCOUT_RECRUITMENT';
const HOT='STR_LOC_HOT_PURSUITS',TRAITORS='STR_LOC_TRAITORS',CAVE='STR_WITCH_CAVE',MED='STR_MED_BAY';
const arr=x=>Array.isArray(x)?x:[];
const active=(s,k)=>s.world.researched.has(k)&&!s.world.disabled.has(k);
const qty=(s,k)=>Number(s.world.items[k]||0);
const hash=s=>receipt(s).stateHash;
const fileSha=p=>sha(fs.readFileSync(p));
const prior=read(PRIOR),psi=read(PSI),guild=read(GUILD);
assert.equal(prior.proofSha256,sha(JSON.stringify(prior.proof)));
assert.equal(psi.proofSha256,sha(JSON.stringify(psi.proof)));
assert.equal(guild.sourceProofSha256,sha(JSON.stringify(guild.sourceProof)));
const old=createHybridGdx(prior.proof),ps=createPsiSupport(psi.proof),gun=createGuildPistolRecovery(guild.sourceProof);
const plans=[
 {id:HOT,script:'HotPursuits',region:'REGION_HOT_PURSUITS',terrain:'CHEMTOWNHOTPURSUITS',map:'CHEMTOWNFIRE',block:'CHEMTOWN01B',item:'STR_SKULL',blocks:2,fixed:2,draws:[{block:0,slot:0,count:1},{block:0,slot:1,count:1},{block:1,slot:0,count:1}],count:5},
 {id:TRAITORS,script:'traitorsAtLarge',region:'REGION_TRAITORS',terrain:'COMRCURBAN',map:'COMRCURBAN',block:'COMRCURBAN07',item:'STR_MEDICAL_SUPPLIES',blocks:1,fixed:0,draws:[{block:0,slot:0,count:10}],count:10}
];
function extractProof(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const y=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const sourceFiles={};
 function load(file){const b=fs.readFileSync(root+'/'+file),h=sha(b);assert.equal(h,data.meta.source.rules.find(x=>x.file===file).sha256);sourceFiles[file]=h;return y.load(b.toString('utf8'),{json:true});}
 const p=load('Piratez.rul'),f=load('Piratez_Factions.rul'),planet=load('Piratez_Planet.rul'),maps=load('Piratez_Mapscripts.rul');
 const cases=plans.map(spec=>{
  const script=f.missionScripts.find(x=>x.type===spec.script),mission=f.alienMissions.find(x=>x.type===spec.id),dep=f.alienDeployments.find(x=>x.type===spec.id),terrain=planet.terrains.find(x=>x.name===spec.terrain),map=maps.mapScripts.find(x=>x.type===spec.map),region=planet.regions.find(x=>x.type===spec.region),item=p.items.find(x=>x.type===spec.item);
  assert([script,mission,dep,terrain,map,region,item].every(Boolean));
  const block=terrain.mapBlocks.find(x=>x.name===spec.block),zone=region.missionZones[mission.spawnZone],textures=[...new Set(zone.map(x=>x[4]))];assert(block&&zone.length);
  return {id:spec.id,script,mission,deployment:Object.fromEntries(Object.entries(dep).filter(([k])=>!['data','briefing'].includes(k))),terrain:{name:terrain.name,script:terrain.script,blocks:terrain.mapBlocks.map(b=>({name:b.name,width:b.width,length:b.length,groups:b.groups??0}))},block,map,region:{id:region.type,zoneCount:zone.length,textures},textureRules:planet.globe.textures.filter(x=>textures.includes(x.id)),item};
 });
 const archive='tools/headless-simulator/native/'+lock.archive;assert.equal(fileSha(archive),lock.archiveSha256);
 const engineEvidence={};
 for(const [id,file,needles] of [
 ['map','./src/Battlescape/BattlescapeGenerator.cpp',['mapblock->getItems()','mapblock->getRandomizedItems()','if (rngItems.mixed)','command->getExecutions()']],
 ['site','./src/Savegame/AlienMission.cpp',['texture->getRandomDeployment()']],
 ['recovery','./src/Battlescape/DebriefingState.cpp',['!rule->isFixed() && rule->isRecoverable()','recoverItems(battle->getTile(i)->getInventory(), base, craft)']]
 ]){
  const t=execFileSync('tar',['-xOf',archive,file],{encoding:'utf8'}),lines=t.split(/\r?\n/);
  engineEvidence[id]={file,sha256:sha(t),matches:needles.map(n=>{const i=lines.findIndex(x=>x.includes(n));assert(i>=0,n);return {line:i+1,text:lines[i].trim()};})};
 }
 return {schema:'ATLAS_OVERCAP_CONSTRUCTION_STOCK_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles,engineArchiveSha256:lock.archiveSha256,engineEvidence,cases};
}
export function createConstructionRecovery(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_CONSTRUCTION_STOCK_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [k,h] of Object.entries(proof.sourceFiles))assert.equal(h,data.meta.source.rules.find(x=>x.file===k).sha256);
 for(const spec of plans){
  const q=proof.cases.find(x=>x.id===spec.id);assert(q);
  const {script,mission,deployment,terrain,block,map,region,textureRules,item}=q;
  assert.equal(script.type,spec.script);assert.equal(script.useTable,false);assert(script.executionOdds>0);
  assert.deepEqual(script.missionWeights,{'0':{[spec.id]:100}});assert.deepEqual(script.regionWeights,{'0':{[spec.region]:100}});
  assert(Object.keys(script).every(k=>['type','firstMonth','lastMonth','missionWeights','regionWeights','useTable','executionOdds','researchTriggers','startDelay','randomDelay','minDifficulty','maxDifficulty'].includes(k)));
  assert.equal(mission.type,spec.id);assert.equal(mission.objective,3);assert.equal(mission.waves.length,1);assert.equal(mission.waves[0].trajectory,'CA_SPAWN');assert.equal(mission.waves[0].count,1);assert(mission.waves[0].objective);assert.equal(mission.waves[0].ufo,'dummy');
  assert.equal(region.id,spec.region);assert(region.zoneCount>0);assert.equal(textureRules.length,1);assert.deepEqual(textureRules[0].deployments,{[spec.id]:100});
  assert.equal(deployment.type,spec.id);assert(deployment.terrains.includes(spec.terrain));assert(!deployment.startingCondition&&!deployment.missionBountyItem&&!deployment.script);
  assert.equal(terrain.name,spec.terrain);assert.equal(terrain.script,map.type);assert.equal(map.type,spec.map);assert.equal(block.name,spec.block);
  assert.equal(item.type,spec.item);assert.notEqual(item.recover,false);assert.notEqual(item.fixed,true);assert(!item.recoveryTransformations);
  const fixed=arr(block.items?.[spec.item]).length*spec.blocks;assert.equal(fixed,spec.fixed);
  if(spec.id===HOT){
   assert.equal(deployment.unlockedResearch,'STR_HOT_PURSUITS_DONE');
   const cmd=map.commands.find(x=>x.type==='addBlock'&&x.groups===9);assert(cmd.executions>=spec.blocks);
   assert.deepEqual(terrain.blocks.filter(x=>[x.groups].flat().includes(9)).map(x=>x.name),[spec.block]);
  }else{
   assert(!deployment.unlockedResearch);
   assert(map.commands.some(x=>x.type==='addBlock'&&x.size===2&&x.groups==null&&x.executions>=1));
   assert.equal(block.width,20);assert.equal(block.length,20);
  }
  const slots=new Set();let random=0;
  for(const d of spec.draws){assert(d.block>=0&&d.block<spec.blocks);const key=d.block+':'+d.slot;assert(!slots.has(key));slots.add(key);
   const row=block.randomizedItems[d.slot];assert(row.itemList.includes(spec.item));assert(d.count<=row.amount&&(row.mixed===true||d.count===row.amount));random+=d.count;}
  assert.equal(fixed+random,spec.count);
 }
 function option(s,id){
  const spec=plans.find(x=>x.id===id),q=proof.cases.find(x=>x.id===id);if(!spec)return null;
  const w=s.world,p=s.actions.at(-1),sc=q.script,slot=spec.script+':'+w.month;
  if(!rp.settled(s)||arr(w.forwardConstructionRecovery).some(x=>x.id===id||x.slot===slot))return null;
  if(w.month<(sc.firstMonth??0)||(sc.lastMonth!=null&&sc.lastMonth>=0&&w.month>sc.lastMonth)||w.difficulty<(sc.minDifficulty??0)||w.difficulty>(sc.maxDifficulty??4)||Object.entries(sc.researchTriggers||{}).some(([k,v])=>active(s,k)!==v))return null;
  if(id===HOT){if(p?.type!=='missionResearch'||p.deployment!==id||p.script!==spec.script||!w.completedMissions?.has(id)||s.actions.at(-2)?.type!=='sourceMonthlyBoundary'||s.actions.at(-2).month!==w.month)return null;}
  else if(p?.type!=='sourceMonthlyBoundary'||p.month!==w.month)return null;
  return {type:'sourceConstructionStockRecovery',id,script:spec.script,region:spec.region,month:w.month,terrain:spec.terrain,map:spec.map,block:spec.block,selectedBlocks:spec.blocks,selectedDraws:spec.draws,item:spec.item,count:spec.count,assumeGeneratedMissionAndTerrain:true,assumeSelectedBlocksPlaced:true,assumeSelectedRandomItems:true,assumeValidSquadAndCraft:true,assumeVictoryAndIntactRecovery:true};
 }
 function apply(s,a){
  assert.deepEqual(a,option(s,a.id));const q=proof.cases.find(x=>x.id===a.id),w=structuredClone(s.world);
  w.forwardConstructionRecovery=[...arr(w.forwardConstructionRecovery),{id:a.id,slot:a.script+':'+a.month}];w.items[a.item]=qty(s,a.item)+a.count;
  return {...s,world:w,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:{kind:'SOURCE_BOUND_SELECTED_MAP_BLOCK_LOOT',proofSha256:sha(JSON.stringify(proof)),scriptOdds:q.script.executionOdds,selectedTerrain:a.terrain,selectedBlocks:a.selectedBlocks,selectedDraws:a.selectedDraws.map(d=>({...d,pool:q.block.randomizedItems[d.slot].itemList,amount:q.block.randomizedItems[d.slot].amount,mixed:q.block.randomizedItems[d.slot].mixed??false})),fixedPerBlock:arr(q.block.items?.[a.item]).length,combatPlacementRecoveryAndTimingConditional:true,otherLootAndScoreUnmodeled:true}}]};
 }
 function step(s,a){
  if(a.type==='sourceConstructionStockRecovery')return apply(s,a);
  if(a.type==='sourceGuildPistolRecovery')return gun.apply(s,a);
  return old.step(s,a);
 }
 return {option,apply,step};
}
function snap(s){return {month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),funds:s.world.funds,actions:s.actions.length,activeResearch:[...s.world.researched].filter(k=>active(s,k)).sort(),disabled:[...s.world.disabled].sort(),stock:{...s.world.items},facilities:[...s.world.facilities].sort(),functions:[...s.world.baseFunctions].sort()};}
function careerSnap(s){const m=member(s.world),f=rp.finish(s);return {body:f.body,statKeys:STAT_KEYS,raw:f.raw,bonus:f.bonus,effective:f.vector,traits:[...m.state.bonusCounts],history:[...m.state.history],stateHash:hash(s),month:s.world.month,balance:s.world.funds};}
export function restoreV174(path,route=null){
 const r=read(path);assert.equal(r.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(r.priorSha256,fileSha(PRIOR));assert.equal(r.proofSha256,sha(JSON.stringify(r.proof)));
 for(const [p,h] of Object.entries(r.sources))assert.equal(fileSha(p),h);
 const ad=createConstructionRecovery(r.proof);let s=restoreV173(PRIOR);assert.equal(hash(s),r.seed.stateHash);
 for(const a of r.actions)s=ad.step(s,a);assert.equal(hash(s),r.continuation.stateHash);
 if(route){const row=r.routes.find(x=>x.id===route);assert(row);for(const a of row.applied)s=rp.career(s,a);assert.equal(hash(s),row.actual.stateHash);}
 return s;
}
function build(){
 const proof=extractProof(),ad=createConstructionRecovery(proof),seed=restoreV173(PRIOR),bulk=read(BULK);assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 let s=seed;const milestones=[],errors=[];
 function advance(label,fn){const before=s;try{const n=fn(before);assert.deepEqual(n.actions.slice(0,before.actions.length),before.actions);assert(n.world.funds>=0);
  if(n.actions.length>before.actions.length){s=n;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(before,k)),stateHash:hash(s)});}
 }catch(e){errors.push({label,reason:String(e.message)});}}
 function research(id,bonus=null){advance(id,st=>active(st,id)?st:lab(st,id,bonus));}
 function event(st,adapter,item=null){const n=monthly.advance(st),o=adapter.options(n,item)[0];assert(o,'Event unavailable '+adapter.id+' '+item);return settle(adapter.apply(n,o.action));}
 function fund(st,amount){let n=st;for(let i=0;n.world.funds<amount;i++){assert(i<12);n=event(n,repeatCash);}return n;}
 research('STR_BOUNTY_HUNTING');
 advance('Recover skull stock',st=>{
  let n=monthly.advance(st);const a=rp.options(n).find(o=>o.action.type==='missionResearch'&&o.action.deployment===HOT&&o.action.script==='HotPursuits');assert(a);n=ad.step(n,a.action);const o=ad.option(n,HOT);assert(o);return ad.apply(n,o);
 });
 advance('Recover medical stock',st=>{let n=monthly.advance(st);const o=ad.option(n,TRAITORS);assert(o);return ad.apply(n,o);});
 advance('Construct witch cave',st=>{
  if(st.world.facilities.has(CAVE))return st;const m=ps.requirements(st,CAVE);assert(!m.research.length&&!m.functions.length&&!Object.keys(m.items).length,JSON.stringify(m));let n=fund(st,st.world.funds+m.funds);const a=ps.startOption(n,CAVE);assert(a);n=ps.applyFacility(n,a);for(let i=0;i<Math.ceil(a.days/28);i++)n=monthly.advance(n);const d=ps.completeOption(n);assert(d);return ps.applyFacility(n,d);
 });
 advance('Construct medical facility',st=>{
  if(st.world.facilities.has(MED))return st;const m=old.facMissing(st,MED);assert(!m.research.length&&!m.functions.length&&!Object.keys(m.items).length,JSON.stringify(m));let n=fund(st,st.world.funds+m.funds);const a=old.facStart(n,MED);assert(a);n=old.transition(n,a);for(let i=0;i<Math.ceil(a.days/28);i++)n=monthly.advance(n);const d=old.facComplete(n);assert(d);return old.transition(n,d);
 });
 for(const id of ['STR_SOLDIER_TYPE_BASIC','STR_GYMNASTICS','STR_GYM_ADVANCE','STR_PSI_INITIATION_PREQ'])research(id);
 // Existing legacy target origin, independently acquired on this branch.
 advance('Scout interrogation / clans',st=>active(st,'STR_RAIDER_CLANS')?st:lab(event(st,repeatEnemy,'STR_RAIDER_SCOUT'),'STR_RAIDER_SCOUT','STR_RAIDER_CLANS'));
 research('STR_RAIDER_SCOUT_RECRUITMENT');
 advance('Scout recruitment stock',st=>qty(st,'STR_RAIDER_SCOUT')>=1?st:event(st,repeatEnemy,'STR_RAIDER_SCOUT'));
 research('STR_MISSION_GUILD_OUTPOST');
 advance('Guild pistol recovery',st=>{if(active(st,'STR_REVOLVER'))return st;let n=monthly.advance(st);const a=gun.option(n);assert(a);return gun.apply(n,a);});
 for(const id of ['STR_REVOLVER','STR_PISTOLS_SUMMARY'])research(id);
 advance('Rifle research via captured scout',st=>{
  if(active(st,'STR_RIFLES_SUMMARY'))return st;
  // Preserve the physical recruit: interrogate a separately captured specimen.
  let n=event(st,repeatEnemy,'STR_RAIDER_SCOUT');
  const o=rp.options(n).find(x=>x.action.type==='repeatResearch'&&x.action.id==='STR_RAIDER_SCOUT');assert(o);
  n=settle(rp.research(n,o.action),'STR_RIFLE_AK');assert(active(n,'STR_RIFLE_AK'));assert(qty(n,'STR_RAIDER_SCOUT')>=1);
  return lab(n,'STR_RIFLES_SUMMARY');
 });
 for(const id of ['STR_BASIC_FIREARMS_TRAINING','STR_CLOCKWORK_GUN_PRODUCTION'])research(id);
 advance('Captain log 01',st=>{if(active(st,'STR_CAPTAINS_LOG_01'))return st;let n=monthly.advance(st);const o=rp.options(n).find(x=>x.action.type==='eventResearch'&&x.action.research==='STR_CAPTAINS_LOG_01'&&x.action.event==='STR_CAP_LOG_1_AWFUL');assert(o);return settle(ad.step(n,o.action));});
 research('STR_PERSONAL_ATTENTION');
 // Additional independently eligible research. Do not import old branch grants.
 for(const id of ['STR_BIKINI_PRODUCTION','STR_TAMED_REAPER','STR_MUTANT_PHYSIOLOGY','STR_PSI_INITIATION','STR_PSIONIC_LABORATORY'])if(rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))research(id);
 // Keep enough cash for both explicit trainings and origin manufacture.
 advance('Origin and training funds',st=>fund(st,30000));
 const acq=bulk.acquisitions.find(a=>a.profile===PROFILE);assert(acq);
 advance('Recruit and grow actual scout',st=>{
  const a=bulk.groups.find(g=>g.acquisition===acq.id).stages[0].action;
  let n=rp.career(st,a);return rp.career(n,{type:'conditionalCapGrowth',soldier:'origin',assumption:true});
 });
 const actions=s.actions.slice(seed.actions.length),selected=['STR_BASIC_FIREARMS_TRAINING','STR_PERSONAL_ATTENTION'],routes=new Map(),links=[];
 if(s.actions.some(a=>a.type==='recruit'&&a.profile===PROFILE)){
  for(const g of bulk.groups.filter(g=>g.acquisition===acq.id)){
   const requested=g.stages.filter(st=>selected.includes(st.action.transform)).map(st=>st.action),key=JSON.stringify(requested);
   if(!routes.has(key)){let n=s;const applied=[],blocked=[];
    for(const a of requested){try{n=rp.career(n,a);applied.push(a);}catch(e){blocked.push({action:a,reason:String(e.message)});}}
    let rr=s;for(const a of applied)rr=rp.career(rr,a);assert.deepEqual(receipt(rr),receipt(n));
    const id=sha(JSON.stringify(['hybrid',hash(s),requested,applied])).slice(0,24);routes.set(key,{id,requested,applied,blocked,actual:careerSnap(n),finalAdmission:false});
   }
   const route=routes.get(key);if(route.applied.length)for(const goal of g.goalIds)links.push({goal,group:g.id,partialRoute:route.id,status:'CONDITIONAL_REORDERED_TRAIT_PREFIX',finalAdmission:false});
  }
 }
 const produced=[...routes.values()].filter(r=>r.applied.length),deps=data.researchRules.STR_PSI_COMMUNION.dependencies;
 const report={schema:'ATLAS_OVERCAP_HYBRID_CONSTRUCTION_TRAIT_WAVE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:fileSha(PRIOR),sources:Object.fromEntries([PSI,GUILD,BULK,UI].map(p=>[p,fileSha(p)])),proof,proofSha256:sha(JSON.stringify(proof)),scope:'Selected conditional map generation, intact item recovery, construction, origin recruitment, and exact model trait transitions. Not native tactical replay or complete economy/time. Partial trait orders do not establish legacy final maxima.',seed:snap(seed),continuation:snap(s),actions,trace:s.trace.slice(seed.trace.length),milestones,errors,routes:produced,links,blockers:Object.fromEntries(['STR_PSI_COMMUNION',...deps].map(id=>[id,{active:active(s,id),dependencies:arr(data.researchRules[id]?.dependencies).filter(k=>!active(s,k)),functions:arr(data.researchRules[id]?.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k))}])),summary:{preservedGoals:bulk.goals.length,newActions:actions.length,newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(seed,k)),newFacilities:[...s.world.facilities].filter(k=>!seed.world.facilities.has(k)),recoveredStock:actions.filter(a=>a.type==='sourceConstructionStockRecovery').map(a=>({id:a.item,count:a.count})),newBirths:actions.filter(a=>a.type==='recruit').length,newTraitApplications:produced.reduce((n,r)=>n+r.applied.length,0),partialRoutes:produced.length,uniqueAppliedStates:new Set(produced.map(r=>r.actual.stateHash)).size,linkedGoals:links.length,psiBefore:deps.filter(k=>active(seed,k)).length,psiAfter:deps.filter(k=>active(s,k)).length,finalAdmission:0},actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
 let replay=restoreV173(PRIOR);for(const a of actions)replay=ad.step(replay,a);assert.deepEqual(receipt(replay),receipt(s));
 const bytes=gzipSync(JSON.stringify(report)+'\n',{level:9}),out='tools/data/overcap-hybrid-construction-trait-wave-v1-'+sha(bytes).slice(0,20)+'.json.gz';
 if(fs.existsSync(out))assert(fs.readFileSync(out).equals(bytes));else fs.writeFileSync(out,bytes,{flag:'wx'});
 const ui=read(UI);assert.equal(ui.sourceMetadataSha256,data.meta.source.metadataSha256);const b=ui.branches.find(x=>x.id==='hybrid');assert.equal(b.stateHash,hash(seed));const orig=ui.goals.map(g=>g.id);
 Object.assign(b,{month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),actionCount:s.actions.length,checkpoint:{...b.checkpoint,version:174,newActions:report.summary.newActions,newResearch:report.summary.newResearch.length,psiDone:report.summary.psiAfter,psiMissing:report.blockers.STR_PSI_COMMUNION.dependencies,facilities:report.summary.newFacilities,weed:qty(s,'STR_SECTOWEED'),caveMissing:s.world.facilities.has(CAVE)?{}:ps.requirements(s,CAVE).items,medMissing:s.world.facilities.has(MED)?{}:old.facMissing(s,MED).items,partialRoutes:produced.length,linkedGoals:links.length,conditional:true}});
 for(const g of ui.groups){const row=g.branches.find(x=>x.id==='hybrid');row.missing=g.required.filter(k=>!active(s,k));row.disabled=g.required.filter(k=>s.world.disabled.has(k));}
 for(const a of ui.acquisitions){const row=a.branches.find(x=>x.id==='hybrid'),origAcq=bulk.acquisitions.find(x=>x.id===a.id);assert(origAcq);row.missing=rp.missing(s,origAcq.requirements);row.originAlreadyRecruited=s.actions.some(x=>x.type==='recruit'&&x.profile===origAcq.profile);}
 const partialMap=new Map(links.map(x=>[x.goal,x.partialRoute]));for(const g of ui.goals)if(partialMap.has(g.id))g.hybridPartialRoute=partialMap.get(g.id);
 ui.hybridPartialRoutes=produced.map(r=>({id:r.id,body:r.actual.body,traits:r.actual.traits,statKeys:r.actual.statKeys,effective:r.actual.effective,applied:r.applied.map(a=>a.transform),finalAdmission:false}));
 ui.hybridPartialSource=out;ui.hybridPartialSourceSha256=sha(bytes);ui.previousProducer=ui.producer;ui.producer=out;ui.producerSha256=sha(bytes);
 assert.deepEqual(ui.goals.map(g=>g.id),orig);assert.equal(ui.finalAdmission,0);
 const uiPath='public/data/soldier-forward-trait-progress-v174.json',uiBytes=JSON.stringify(ui)+'\n';fs.writeFileSync(uiPath,uiBytes);
 console.log(JSON.stringify({out,bytes:bytes.length,uiPath,uiBytes:Buffer.byteLength(uiBytes),summary:{...report.summary,newResearchCount:report.summary.newResearch.length,newResearch:undefined},month:s.world.month,balance:s.world.funds,errors,blockers:report.blockers,routes:produced.map(r=>({id:r.id,applied:r.applied.map(x=>x.transform),traits:r.actual.traits,effective:r.actual.effective,balance:r.actual.balance})),hash:hash(s)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
