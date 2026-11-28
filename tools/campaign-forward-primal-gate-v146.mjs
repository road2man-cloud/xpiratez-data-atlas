// V146: source-bound primal mission victories and one-use bounty receipts.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {applyCampaignStartStep} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const same=(a,b)=>assert.deepEqual([...a].sort(),[...b].sort());
export function createPrimalGate(data,snapshot,raw,base,root){
 const {files,items,research,manufacture,crafts,startingConditions,missionScripts,alienMissions,alienDeployments,regions}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Battlescape/DebriefingState.cpp'],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert(cpp.includes('if (success && ruleDeploy && base)')&&cpp.includes('getUnlockedResearchOnSuccess()')&&cpp.includes('getMissionBountyItem()')&&cpp.includes('std::max(1, ruleDeploy->getMissionBountyItemCount())'));
 const condition='STR_STARCON_STONEAGE',craft='STR_HUNTING_PARTY',c=startingConditions[condition],m=manufacture[craft],cr=crafts[craft];
 assert(c.allowedSoldierTypes.includes('STR_SOLDIER_HERO')&&c.allowedCraft.includes(craft)&&c.allowedItemCategories.includes('STR_BAT_CAT_STONEAGE'));
 assert(cr.soldiers>=1&&cr.costBuy===0&&!(cr.requires||[]).length);
 assert(m.category==='STR_CRAFT'&&m.time===200&&m.cost===0&&!(m.requires||[]).length&&!Object.keys(m.requiredItems||{}).length);
 assert(Object.keys(m).every(k=>['name','category','space','time','cost','refund','listOrder'].includes(k)));
 const names=['Werewolf','Bullfrog','Shambler','Cockroach','Finale'];
 const specs=new Map();
 const done=names.slice(0,4).map(n=>'STR_MONSTER_HUNT_PRIMAL_'+n.toUpperCase()+'_DONE');
 for(const name of names){
  const upper=name.toUpperCase(),script='monsterHuntPrimal'+name,dep='STR_LOC_MONSTER_HUNT_PRIMAL_'+upper,s=missionScripts[script],d=alienDeployments[dep],mission=alienMissions[dep],id=name==='Finale'?'STR_QUEEN_SAVAGE':'STR_MONSTER_HUNT_PRIMAL_'+upper+'_DONE';
  const region='REGION_MONSTER_HUNT_PRIMAL_'+(name==='Cockroach'?'SCARABS':upper);
  assert(s&&d&&mission&&regions[region]&&research[id]);
  assert.deepEqual(s.missionWeights,{0:{[dep]:100}});assert.deepEqual(s.regionWeights,{0:{[region]:100}});
  assert.equal(s.useTable,false);assert.equal(s.executionOdds,name==='Finale'?100:65);
  const triggers=name==='Finale'?Object.fromEntries([['STR_WASTELAND_PRIESTESS_4',true],...done.map(k=>[k,true]),[id,false]]):{STR_MONSTER_HUNTS_PRIMAL:true,[id]:false};
  assert.deepEqual(s.researchTriggers,triggers);
  assert(Object.keys(s).every(k=>['type','missionWeights','regionWeights','useTable','executionOdds','researchTriggers','startDelay','randomDelay'].includes(k)));
  assert.equal(d.startingCondition,condition);assert.equal(d.unlockedResearch,id);assert(mission.waves.some(x=>x.objective===true));
  const route=data.missionResearchSources[id].find(x=>x.deployment===dep),ix=route.scripts.find(x=>x.script===script);
  assert.equal(route.reward,'mission-success');assert.equal(route.startingCondition,condition);assert.equal(ix.executionOdds,s.executionOdds);
  same(ix.researchPositive,Object.keys(triggers).filter(k=>triggers[k]));same(ix.researchNegative,Object.keys(triggers).filter(k=>!triggers[k]));
  assert(!Object.keys(ix.otherConditions||{}).length);
  assert.equal(d.missionBountyItem,name==='Finale'?'STR_SIVALINGA':undefined);
  const rewards=d.missionBountyItem?{[d.missionBountyItem]:Math.max(1,d.missionBountyItemCount||1)}:{};
  for(const k of Object.keys(rewards))assert(items[k]&&!items[k].liveAlien);
  specs.set(name,{name,script,dep,region,id,s,d,triggers,rewards});
 }
 const transportAction={type:'conditionalPrimalTransport',craft,recipe:craft,hours:m.time,assumeProductionCapacity:true,assumeProductionTime:true,assumeFreeHangarSlot:true,sourceFileSha256:files['Piratez.rul'],nativeArchiveSha256:lock.archiveSha256};
 const action=(name,month)=>{const x=specs.get(name);assert(x);return {type:'conditionalPrimalVictory',name,script:x.script,deployment:x.dep,research:x.id,region:x.region,craft,startingCondition:condition,month,assumeContinuity:true,assumeMissionGeneration:true,assumeTransportAndEligibleLoadout:true,assumeBattleVictory:true,assumeDebriefing:true,sourceFileSha256:files['Piratez_Factions.rul'],startingConditionSha256:files['Piratez_Globals.rul'],nativeArchiveSha256:lock.archiveSha256};};
 function apply(w,a){
  if(!['conditionalPrimalTransport','conditionalPrimalVictory'].includes(a.type))return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   if(a.type==='conditionalPrimalTransport'){
    assert.deepEqual(a,transportAction);assert(!w.conditionalPrimalTransport);
    assert(w.facilities.has('STR_HANGAR')&&w.baseFunctions.has('SHOP'),'known hangar/workshop missing');
    const z=structuredClone(w);z.conditionalPrimalTransport={craft,hours:m.time,conditionalCapacity:true,conditionalHangarSlot:true};return {ok:true,world:z,assumed:true,notes:['source-zero-cost-craft-recipe','craft-availability-and-capacity-conditional']};
   }
   assert.deepEqual(a,action(a.name,a.month));const x=specs.get(a.name);
   assert.equal(a.month,w.month+1);assert.equal(w.conditionalPrimalTransport?.craft,craft);
   assert(w.soldiers.some(s=>s.id==='origin'),'missing trained origin');
   const check=z=>{assert(!z.completedMissions?.has(x.dep)&&!z.researched.has(x.id)&&!z.disabled.has(x.id),'mission reward already completed or disabled');assert(Object.entries(x.triggers).every(([k,b])=>active(z,k)===b),'raw primal mission research trigger missing');};
   check(w);const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);check(q.world);
   const r=applyCampaignStartStep(q.world,{type:'missionResearch',deployment:x.dep,script:x.script,research:x.id,assumeOutcome:true},data);
   assert(r.ok,r.reason);assert(active(r.world,x.id)&&r.world.completedMissions.has(x.dep));
   for(const [k,n] of Object.entries(x.rewards))r.world.items[k]=(r.world.items[k]||0)+n;
   r.world.conditionalPrimalVictories=[...(r.world.conditionalPrimalVictories||[]),{name:x.name,script:x.script,deployment:x.dep,research:x.id,month:a.month,executionOdds:x.s.executionOdds,craft,startingCondition:condition,reward:x.rewards,assumedBattleVictory:true}];
   return {...r,assumed:true,notes:[...(r.notes||[]),'raw-mission-victory-and-complete-bounty','stoneage-transport-and-loadout-conditional','battle-not-native-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action,transportAction,names};
}
