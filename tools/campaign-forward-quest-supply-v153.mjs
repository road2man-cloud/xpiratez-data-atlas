// V153: narrow raw quest transitions; retain V152 and older action semantics.
// This is research-only reachability, not a tactical or economic simulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {applyCampaignStartStep} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const arr=x=>Array.isArray(x)?x:[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const table=(t,m)=>t?.[Object.keys(t||{}).map(Number).filter(k=>k<=m).sort((a,b)=>b-a)[0]]||{};
const allowed=(r,fields)=>Object.keys(r||{}).every(k=>fields.includes(k));
export function createQuestSupply(data,snapshot,raw,base,root){
 const {files,items,research,events,eventScripts,manufacture,missionScripts,alienMissions,alienDeployments,ufos,terrains,mapScripts,crafts,startingConditions}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert(cpp('Mod/RuleManufacture.cpp').includes('_producedItemsNames[name] = 1;'));
 assert(cpp('Battlescape/DebriefingState.cpp').includes('getUnlockedResearchOnSuccess()'));
 const efields=['name','type','description','background','music','researchList','timer','timerRandom','points','funds','everyItemList','everyMultiItemList','interruptResearch'];
 const sf=['type','name','eventWeights','oneTimeSequentialEvents','firstMonth','lastMonth','executionOdds','researchTriggers','itemTriggers','facilityTriggers','minDifficulty','maxDifficulty'];
 const mf=['type','name','missionWeights','regionWeights','useTable','executionOdds','researchTriggers','firstMonth','lastMonth','startDelay','randomDelay','facilityTriggers','itemTriggers','minDifficulty','maxDifficulty','targetBaseOdds'];
 function eligible(w,s,fields){
  if(!s||!allowed(s,fields)||(s.executionOdds??100)<=0||w.month<(s.firstMonth??0)||(s.lastMonth>=0&&w.month>s.lastMonth))return false;
  if(w.difficulty<(s.minDifficulty??0)||w.difficulty>(s.maxDifficulty??4))return false;
  if(!Object.entries(s.researchTriggers||{}).every(([k,v])=>typeof v==='boolean'&&active(w,k)===v))return false;
  if(!Object.entries(s.facilityTriggers||{}).every(([k,v])=>typeof v==='boolean'&&w.globalFacilities.has(k)===v))return false;
  if(!Object.entries(s.itemTriggers||{}).every(([k,v])=>typeof v==='boolean'&&((w.items[k]||0)+(w.otherItems?.[k]||0)>0)===v))return false;
  return true;
 }
 function eventAction(w,id){
  if(active(w,id)||w.disabled.has(id)||w.pendingFree)return null;
  for(const route of arr(data.eventResearchSources[id])){
   const e=events[route.event];
   if(!e||!allowed(e,efields)||!arr(e.researchList).includes(id)||w.generatedEvents?.[route.event]||(e.interruptResearch&&active(w,e.interruptResearch)))continue;
   for(const ix of arr(route.scripts)){
    const s=eventScripts[ix.script];if(!eligible(w,s,sf))continue;
    const sequence=arr(s.oneTimeSequentialEvents),i=sequence.indexOf(route.event);
    const seq=i>=0&&sequence.slice(0,i).every(k=>w.generatedEvents?.[k]);
    if(!seq&&!(table(s.eventWeights,w.month)[route.event]>0))continue;
    return {type:'researchQuestEventV153',research:id,event:route.event,script:ix.script,month:w.month,sequenceEarlier:seq?sequence.slice(0,i):[],assumeOutcome:true,sourceFingerprint:snapshot.sourceFingerprint,researchOnly:true};
   }
  }
  return null;
 }
 function mission(w,script,dep){
  const s=missionScripts[script],m=alienMissions[dep],d=alienDeployments[dep];
  if(!s||!m||!d||!eligible(w,s,mf)||s.useTable!==false||!(table(s.missionWeights,w.month)[dep]>0)||!arr(m.waves).some(x=>x.objective))return null;
  const condition=d.startingCondition||null,c=startingConditions[condition];
  let craft=null;
  if(condition&&!c)return null;
  if(c?.forbiddenSoldierTypes?.includes('STR_SOLDIER_HERO'))return null;
  if(c?.allowedSoldierTypes?.length&&!c.allowedSoldierTypes.includes('STR_SOLDIER_HERO'))return null;
  if(c?.allowedCraft?.length){
   craft=c.allowedCraft.find(k=>crafts[k]?.costBuy>0&&crafts[k]?.soldiers>0&&arr(crafts[k].requires).every(k=>active(w,k)));
   if(!craft)return null;
  }
  return {script,mission:dep,deployment:dep,condition,craft,month:w.month};
 }
 function mapBlock(dep,terrain,block){
  const d=alienDeployments[dep],t=terrains[terrain],b=arr(t?.mapBlocks).find(x=>x.name===block);
  if(!d||!t||!b)return null;
  for(const baseTerrain of arr(d.terrains)){
   const script=d.script||terrains[baseTerrain]?.script;
   const commands=arr(mapScripts[script]?.commands);
   for(const [i,c] of commands.entries()){
    if(c.type!=='addBlock'||c.conditionals||c.executionChances===0||c.executions===0)continue;
    const use=c.terrain||baseTerrain;
    if(use!==terrain)continue;
    if(c.groups!=null&&!arr([].concat(c.groups)).some(g=>[].concat(b.groups??0).includes(g)))continue;
    if(typeof c.size==='number'&&(b.width!==10*c.size||b.length!==10*c.size))continue;
    return {terrain,block,mapScript:script,command:i,externalTerrain:use!==baseTerrain};
   }
  }
  return null;
 }
 function victory(w,id){
  const spec={STR_TEC_040:['technocracySat','STR_LOC_COMMS_DISRUPTION'],STR_LOC_TAVERN_CELLAR_DONE:['TavernCellar','STR_LOC_TAVERN_CELLAR']}[id];
  if(!spec||active(w,id)||w.disabled.has(id)||w.completedMissions?.has(spec[1]))return null;
  const p=mission(w,...spec);if(!p||alienDeployments[spec[1]].unlockedResearch!==id)return null;
  let loot=null;
  if(id==='STR_TEC_040'){
   const b=mapBlock(spec[1],'ORBIT_COMMS_DISRUPTION','STATION_06');
   const count=terrains.ORBIT_COMMS_DISRUPTION?.mapBlocks?.find(x=>x.name==='STATION_06')?.items?.STR_TEC_001?.length;
   if(!b||count!==1)return null;
   loot={item:'STR_TEC_001',count,...b};
  }
  return {type:'researchQuestVictoryV153',research:id,proof:p,loot,assumeMissionVictory:true,assumeEligibleLoadout:true,assumeTransportAndRecovery:true,sourceFingerprint:snapshot.sourceFingerprint,researchOnly:true};
 }
 function specialProof(w,item){
  if(item==='STR_WIZ_081'){
   const p=mission(w,'redMageCryptekCaves','STR_LOC_CRYPTEK_CAVES'),b=mapBlock('STR_LOC_CRYPTEK_CAVES','CRYPTEK','CRYPTEK_00');
   if(p&&b&&terrains.CRYPTEK.mapBlocks.find(x=>x.name==='CRYPTEK_00').items[item]?.length)return {kind:'external-terrain-map',...p,...b,item};
  }
  if(item==='STR_ANG_001'){
   const script='HarassmentDemons',s=missionScripts[script],m='STR_MISSION_HARASSMENT_DEMONS',u='STR_VESSEL_BOGEYMAN_FLOCK';
   if(eligible(w,s,mf)&&s.useTable===false&&table(s.missionWeights,w.month)[m]>0&&arr(alienMissions[m]?.waves).some(x=>x.ufo===u&&x.count>0)&&alienDeployments[u]&&arr(ufos[u]?.battlescapeTerrainData?.mapBlocks).some(b=>b.items?.[item]?.length))return {kind:'conditional-wave-encounter-map',script,mission:m,ufo:u,deployment:u,block:'BEASTMANALTAR03',item,month:w.month,assumeInterceptableTacticalEncounter:true};
  }
  if(item==='STR_MAIDEN_VICTIM'||item==='STR_ANG_001'){
   const dep='STR_LOC_DEMON_SACRIFICE',p=mission(w,'DemonicSacrifice',dep);
   if(p&&arr(mapScripts[alienDeployments[dep].script]?.commands).some(c=>c.type==='addUFO'&&c.UFOName===dep)&&arr(ufos[dep]?.battlescapeTerrainData?.mapBlocks).some(b=>b.items?.[item]?.length))return {kind:'scripted-ufo-map',...p,ufo:dep,block:'DEMONALTAR01',item};
  }
  if(item==='STR_TOMB_GUARDIAN'){
   const dep='STR_LOC_ZOMBIE_PYRAMID',p=mission(w,'ZombiePyramids',dep),spawn='STR_SPAWN_ENEMY_TOMB_GUARDIAN';
   if(p&&items[spawn]?.spawnUnit===item&&items[spawn].spawnUnitFaction===1&&items[item]?.liveAlien===true&&items[item]?.recover===true&&arr(mapScripts[alienDeployments[dep].script]?.commands).some(c=>c.type==='addUFO'&&c.UFOName===dep)&&arr(ufos[dep]?.battlescapeTerrainData?.mapBlocks).some(b=>b.items?.[spawn]?.length))return {kind:'scripted-spawn-capture',...p,ufo:dep,block:'PYRAMID_PORTAL',spawn,item,assumeNonlethalCapture:true,assumeDetention:true};
  }
  return null;
 }
 const recipes=['STR_BOUNTY_HUNTING_C_PASS','STR_BOUNTY_HUNTING_B_PASS','STR_BOUNTY_HUNTING_PRIZE_MINI_SHOTGUN','STR_BOUNTY_HUNTING_PRIZE_BANK_FAVORS','STR_BOUNTY_HUNTING_PRIZE_ALLIANCE_FAVORS','STR_BOUNTY_HUNTING_PRIZE_JACK_FAVOR','STR_BOUNTY_HUNTING_PRIZE_DINOSAUR','STR_BOUNTY_HUNTING_PRIZE_HAND_MORTAR','STR_BOUNTY_HUNTING_PRIZE_CITY_PASS'];
 function implicitProof(w,item){
  if(!recipes.includes(item))return null;
  const r=manufacture[item];if(!r||!items[item]||Object.hasOwn(r,'producedItems')||arr(r.randomProducedItems).length||!allowed(r,['name','type','category','requires','requiresBaseFunc','space','time','cost','requiredItems','refund','listOrder'])||!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))return null;
  const inputs=[];
  for(const [k,n] of Object.entries(r.requiredItems||{})){
   if(!Number.isSafeInteger(n)||n<1)return null;
   const proof=(w.items[k]||0)>=n?{kind:'stock',item:k,count:w.items[k]}:base.action(w,k,n);
   if(!proof)return null;
   inputs.push({item:k,quantity:n,proof});
  }
  return {kind:'raw-default-output',recipe:item,output:1,inputs};
 }
 function action(w,item,minimum=1){
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000||(w.items[item]||0)>=minimum)return null;
  const proof=specialProof(w,item)||implicitProof(w,item);
  if(!proof)return base.action(w,item,minimum);
  if(!items[item]||items[item].recover===false)return null;
  return {type:'researchQuestSupplyV153',item,minimum,proof,sourceFingerprint:snapshot.sourceFingerprint,nativeArchiveSha256:lock.archiveSha256,researchOnly:true,assumeSourceAccess:true,assumeRequiredQuantity:true};
 }
 function apply(w,a){
  if(!['researchQuestEventV153','researchQuestVictoryV153','researchQuestSupplyV153'].includes(a.type))return base.apply(w,a);
  try{
   assert(w.researchOnly===true&&w.sourceFingerprint===snapshot.sourceFingerprint&&!w.pendingFree);
   if(a.type==='researchQuestSupplyV153'){
    assert.deepEqual(a,action(w,a.item,a.minimum));const z=structuredClone(w);z.items[a.item]=a.minimum;
    return {ok:true,world:z,assumed:true,notes:['raw-script-map-or-default-output-source','conditional-recovery-or-manufacture','quantity-and-economy-abstracted']};
   }
   if(a.type==='researchQuestVictoryV153'){
    assert.deepEqual(a,victory(w,a.research));const p=a.proof;
    const r=applyCampaignStartStep(w,{type:'missionResearch',deployment:p.deployment,script:p.script,research:a.research,assumeOutcome:true},data);
    assert(r.ok,r.reason);assert(active(r.world,a.research)&&r.world.completedMissions.has(p.deployment));
    if(a.loot)r.world.items[a.loot.item]=(r.world.items[a.loot.item]||0)+a.loot.count;
    return {...r,assumed:true,notes:[...(r.notes||[]),'source-bound-victory-and-same-battle-fixed-loot','conditional-transport-and-combat']};
   }
   assert.deepEqual(a,eventAction(w,a.research));const e=events[a.event];
   const r=applyCampaignStartStep(w,{type:'eventResearch',event:a.event,script:a.script,research:a.research,assumeOutcome:true},data);
   assert(r.ok,r.reason);assert(active(r.world,a.research)&&r.world.generatedEvents[a.event]);
   for(const k of arr(e.everyItemList))r.world.items[k]=(r.world.items[k]||0)+1;
   for(const [k,n] of Object.entries(e.everyMultiItemList||{}))r.world.items[k]=(r.world.items[k]||0)+n;
   if(Number.isFinite(r.world.score))r.world.score+=e.points??0;
   if(Number.isFinite(r.world.funds))r.world.funds+=e.funds??0;
   return {...r,assumed:true,notes:[...(r.notes||[]),'raw-sequential-or-weighted-quest-award','conditional-event-delivery']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action,award:(w,id)=>eventAction(w,id)||base.award(w,id),victory,counts:{targetedMapItems:4,implicitRewardRecipes:recipes.length}};
}
