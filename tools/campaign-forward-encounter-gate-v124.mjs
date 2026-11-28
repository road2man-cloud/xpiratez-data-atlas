// V124: migrate the source-checked V119 game encounter/score adapters.
// Upstream: 18b3b4d3b012351e5cffc13d4457547555a3f3ea.
// These conditional witnesses are not evidence of native battle victory or score history.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const arr=x=>Array.isArray(x)?x:[];
const sorted=x=>[...x].sort();
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export function createEncounterGate(data,snapshot,raw,baseGate,root='.'){
 const {files,facilities,items,research,events,eventScripts,alienDeployments,alienMissions,missionScripts,ufos,alienRaces,regions,textures,units,armors}=raw;
 const check=(w,z)=>assert.equal(z.sourceFingerprint,w.sourceFingerprint,'source fingerprint changed');
 function applyBase(w,a){const q=baseGate.apply(w,a);assert(q.ok,q.reason);return q.world;}
const relevantItems=["STR_NEWSPAPER","STR_COLT45","STR_RIFLE_AK","STR_GUNS_N_AMMO","STR_CRACK","STR_GLAMOUR"];
const distressScripts=["recurringTerrorNoPenalty","recurringTerrorNoPenalty1","recurringTerror"];
const atMonth=(table,month)=>{
 const k=Object.keys(table||{}).map(Number).filter(k=>Number.isInteger(k)&&k<=month).sort((a,b)=>b-a)[0];
 return k===undefined?null:table[k];
};
const countIn=(a,id)=>a.filter(x=>x===id).length;
const candidateIndex=[];
for(const scriptId of distressScripts){
 const s=missionScripts[scriptId];if(!s)continue;
 const first=s.firstMonth??0,last=s.lastMonth??null;
 for(const [m,weights] of Object.entries(s.missionWeights||{})){
  for(const [missionId,weight] of Object.entries(weights)){
   const mRule=alienMissions[missionId];if(!mRule||!(weight>0))continue;
   for(const [month,races] of Object.entries(mRule.raceWeights||{})){
    for(const [race,raceWeight] of Object.entries(races)){
     if(!(raceWeight>0))continue;
     for(const wave of arr(mRule.waves).filter(w=>w.objective===true)){
      const u=ufos[wave.ufo],deployment=u?.raceBonus?.[race]?.missionCustomDeploy;
      const d=alienDeployments[deployment];if(!d)continue;
      for(const [rowIndex,row] of arr(d.data).entries()){
       if(!arr(row.itemSets).length)continue;
       for(const item of relevantItems){
        const counts=row.itemSets.map(set=>countIn(set,item));
        if(!counts.some(Boolean))continue;
        candidateIndex.push({script:scriptId,mission:missionId,missionWeightFrom:Number(m),missionWeight:weight,raceWeightFrom:Number(month),race,raceWeight,ufo:wave.ufo,deployment,rowIndex,alienRank:row.alienRank,lowQty:row.lowQty,highQty:row.highQty,dQty:row.dQty,item,countsByItemSet:counts,allSetsCarry:counts.every(n=>n>0),explicitRecover:items[item]?.recover??null,firstMonth:first,lastMonth:last,executionOdds:s.executionOdds,researchTriggers:s.researchTriggers||{},regionWeights:s.regionWeights||{},status:"CONDITIONAL_ENCOUNTER_CANDIDATE",tacticalRecoveryProven:false});
       }
      }
     }
    }
   }
  }
 }
}
const chosen=candidateIndex.find(x=>x.script==="recurringTerrorNoPenalty"&&x.mission==="STR_MUTANT_POGROM_DISTRESS_NO_PENALTY"&&x.race==="STR_NAZIS"&&x.raceWeightFrom===0&&x.missionWeightFrom===0&&x.item==="STR_NEWSPAPER"&&x.allSetsCarry&&x.lowQty===1&&x.highQty===1&&x.dQty===0&&x.explicitRecover===true);
assert(chosen,"No conservative newspaper candidate");
const recoveryAction={type:"conditionalDistressRecovery",script:chosen.script,mission:chosen.mission,race:chosen.race,ufo:chosen.ufo,deployment:chosen.deployment,rowIndex:chosen.rowIndex,item:chosen.item,count:1,sourceFileSha256:files["Piratez_Factions.rul"],assumeMissionGeneration:true,assumeEncounterAndVictory:true,assumePhysicalRecovery:true};
function applyRecovery(w,a){
 assert.deepEqual(a,recoveryAction,"Unsupported recovery action");
 assert(!w.pendingFree,"Resolve free award before encounter");
 assert(!w.conditionalDistressRecoveries?.length,"Repeated recovery unsupported");
 const s=missionScripts[a.script],m=alienMissions[a.mission],u=ufos[a.ufo],d=alienDeployments[a.deployment];
 assert(Object.keys(s).every(k=>["type","missionWeights","regionWeights","useTable","executionOdds","researchTriggers","firstMonth","lastMonth","startDelay","randomDelay"].includes(k)),"Unsupported mission trigger");
 assert(Number.isInteger(w.month)&&w.month>=(s.firstMonth??0)&&(s.lastMonth==null||w.month<=s.lastMonth));
 assert(s.executionOdds>0&&atMonth(s.missionWeights,w.month)?.[a.mission]>0&&Object.values(atMonth(s.regionWeights,w.month)||{}).some(x=>x>0));
 assert(Object.entries(s.researchTriggers||{}).every(([k,v])=>active(w,k)===v),"Research gate unmet");
 assert(atMonth(m.raceWeights,w.month)?.[a.race]>0,"Race unavailable this month");
 assert(arr(m.waves).some(v=>v.objective===true&&v.ufo===a.ufo));
 assert(u.raceBonus[a.race].missionCustomDeploy===a.deployment&&alienRaces[a.race]);
 const row=d.data[a.rowIndex];assert(row.lowQty===1&&row.highQty===1&&row.dQty===0&&arr(row.itemSets).length&&row.itemSets.every(set=>countIn(set,a.item)>=a.count));
 assert(items[a.item].recover===true);
 const z=structuredClone(w);z.items[a.item]=(z.items[a.item]||0)+a.count;
 z.conditionalDistressRecoveries=[{...a,month:w.month}];
 check(w,z);return z;
}
const trophy="STR_TROPHY_TARGET_200_JACK",bountyScript="CrackHouse",bountyMission="STR_LOC_CRACKHOUSE",bountyRegion="REGION_CRACKHOUSE";
const bs=missionScripts[bountyScript],bm=alienMissions[bountyMission],bd=alienDeployments[bountyMission],br=regions[bountyRegion];
assert(bs&&bm&&bd&&br&&items[trophy]&&research[trophy]);
assert.equal(bm.objective,3);assert.equal(bm.spawnZone,0);
assert.deepEqual(bs.missionWeights,{"0":{[bountyMission]:100}});
assert.deepEqual(bs.regionWeights,{"0":{[bountyRegion]:100}});
assert.equal(bs.useTable,false);
assert.deepEqual(bm.raceWeights,{"0":{"STR_BANDIT_TOWN":100}});
assert(bm.waves.some(x=>x.ufo==="dummy"&&x.objective===true));
assert(arr(br.missionZones[0]).length&&br.missionZones[0].every(a=>a[4]===-122));
assert.deepEqual(textures[-122].deployments,{[bountyMission]:100});
assert(!bd.unlockedResearch&&!bd.startingCondition);
const trophyRow=bd.data.findIndex(row=>row.lowQty===1&&row.highQty===1&&row.dQty===0&&arr(row.itemSets).length&&row.itemSets.every(set=>set.includes(trophy)));
assert(trophyRow>=0&&items[trophy].recover!==false&&!items[trophy].fixed&&!items[trophy].liveAlien);
assert.deepEqual(research[trophy].unlocks,["STR_ANY_BASIC_TROPHY_UNLOCKED"]);
const nativeDir=path.join(root,"tools/headless-simulator/native"),lock=read(path.join(nativeDir,"source.lock.json")),archive=path.join(nativeDir,lock.archive);
assert.equal(createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),lock.archiveSha256);
const itemCpp=execFileSync("tar",["--force-local","-xOf",archive,"./src/Mod/RuleItem.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
const missionCpp=execFileSync("tar",["--force-local","-xOf",archive,"./src/Savegame/AlienMission.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
assert(itemCpp.includes("_recover(true)")&&itemCpp.includes('reader.tryRead("recover", _recover)'));
assert(missionCpp.includes("texture->getRandomDeployment()"));
const trophyAction={type:"conditionalBountyRecovery",script:bountyScript,mission:bountyMission,region:bountyRegion,texture:-122,race:"STR_BANDIT_TOWN",rowIndex:trophyRow,item:trophy,count:1,sourceFileSha256:files["Piratez_Factions.rul"],planetSha256:files["Piratez_Planet.rul"],nativeArchiveSha256:lock.archiveSha256,assumeMissionGeneration:true,assumeTransport:true,assumeEncounterAndVictory:true,assumePhysicalRecovery:true};
const rankIds=[1,2,3,4].map(i=>"STR_CAPTAINS_RANK_0"+i);
function rankAction(id){
 const i=rankIds.indexOf(id);assert(i>=0);
 const s=eventScripts[id],e=events[id];
 assert.deepEqual(e.researchList,[id]);assert.deepEqual(s.eventWeights,{"0":{[id]:100}});
 assert.equal(s.firstMonth,i+1);assert.equal(s.minScore,2000+i*1000);
 assert(Object.keys(s).every(k=>["type","eventWeights","firstMonth","minScore","researchTriggers","executionOdds"].includes(k)));
 assert(Object.keys(e).every(k=>["name","type","description","background","music","researchList","timer","timerRandom"].includes(k)));
 const indexed=arr(data.eventResearchSources[id]).find(x=>x.event===id)?.scripts.find(x=>x.script===id);
 assert(indexed&&indexed.firstMonth===s.firstMonth&&indexed.otherConditions.minScore===s.minScore);
 assert.deepEqual(sorted(indexed.researchPositive),sorted(Object.entries(s.researchTriggers).filter(([,v])=>v===true).map(([k])=>k)));
 assert.deepEqual(sorted(indexed.researchNegative),sorted(Object.entries(s.researchTriggers).filter(([,v])=>v===false).map(([k])=>k)));
 return {type:"eventResearch",event:id,script:id,research:id,assumeOutcome:true,conditionalScoreThreshold:{minScore:s.minScore,firstMonth:s.firstMonth,achievementAssumed:true,nativeScoreHistoryProven:false,sourceFileSha256:files["Piratez_Events.rul"]}};
}
const captive="STR_NAZI_LEADER",leader=units[captive],leaderItem=items[captive],leaderRule=research[captive];
const dep=alienDeployments[recoveryAction.deployment],row=dep.data[recoveryAction.rowIndex],raceRule=alienRaces[recoveryAction.race];
assert(leader&&leaderItem&&leaderRule&&raceRule.members[row.alienRank]===captive);
assert(leader.canSurrender===true&&leaderItem.liveAlien===true&&leaderItem.recover===true);
assert(!leaderItem.recoveryTransformations&&!leader.spawnUnit);
assert(leaderRule.unlocks.includes("STR_ALIEN_ORIGINS")&&leaderRule.getOneFree.includes("STR_OLD_BOOKS"));
const armor=armors[leader.armor];assert(armor&&arr(armor.corpseBattle).length&&items[armor.corpseBattle[0]]?.recover!==false);
const debriefCpp=execFileSync("tar",["--force-local","-xOf",archive,"./src/Battlescape/DebriefingState.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
const facilityCpp=execFileSync("tar",["--force-local","-xOf",archive,"./src/Mod/RuleBaseFacility.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
assert(debriefCpp.includes("getLiveAlienGeoscape()")&&debriefCpp.includes("getAvailableContainment(ruleLiveAlienItem->getPrisonType())")&&debriefCpp.includes("addItemsToBaseStores(ruleLiveAlienItem, base, 1, false)"));
assert(itemCpp.includes("_liveAlienPrisonType(0)")&&facilityCpp.includes("_prisonType(0)"));
const captureAction={type:"conditionalDistressWithCaptive",encounter:recoveryAction,unit:captive,item:captive,armor:leader.armor,prisonType:leaderItem.liveAlienPrisonType??0,count:1,assumeSurrenderOrNonlethalCapture:true,assumeLiveRecovery:true,assumeNativeUnitItemMapping:true,nativeArchiveSha256:lock.archiveSha256,sourceFileSha256:files["Piratez_Factions.rul"]};
const bountyCaptives=[
 {rowIndex:2,item:"STR_HUMAN_MALE_3",count:1},
 {rowIndex:3,item:"STR_HUMAN_SHARP_GUY",count:1}
].map(x=>{
 const row=bd.data[x.rowIndex],u=units[x.item],i=items[x.item];
 assert(row.lowQty>=x.count&&row.highQty>=x.count&&row.dQty===0);
 assert(alienRaces[trophyAction.race].members[row.alienRank]===x.item);
 assert(u?.canSurrender===true&&i?.recover===true&&i?.liveAlien===true&&!u.spawnUnit&&!i.recoveryTransformations);
 assert(arr(armors[u.armor]?.corpseBattle).length&&items[armors[u.armor].corpseBattle[0]]?.recover!==false);
 assert(research[x.item]?.destroyItem===true);
 return {...x,armor:u.armor,prisonType:i.liveAlienPrisonType??0};
});
const multiBountyAction={type:"conditionalBountyWithCaptives",encounter:trophyAction,captives:bountyCaptives,assumeSurrenderOrNonlethalCapture:true,assumeLiveRecovery:true,assumeNativeUnitItemMapping:true};
function apply(w,a){
 if(a.type==="conditionalBountyWithCaptives"){
  assert.deepEqual(a,multiBountyAction);assert(!w.conditionalBountyCaptives?.length);
  const usage=[];
  for(const p of new Set(a.captives.map(x=>x.prisonType))){
   const capacity=snapshot.facilities.filter(id=>w.facilities.has(id)).reduce((n,id)=>n+((facilities[id]?.prisonType??0)===p?Number(facilities[id]?.aliens||0):0),0);
   let used=0;for(const stock of [w.items,w.otherItems])for(const [id,n] of Object.entries(stock||{})){const i=items[id];if(i?.liveAlien&&(i.liveAlienPrisonType??0)===p)used+=n;}
   const need=a.captives.filter(x=>x.prisonType===p).reduce((n,x)=>n+x.count,0);
   assert(capacity-used>=need,"Detention capacity insufficient");usage.push({prisonType:p,capacity,usedBefore:used,added:need});
  }
  const z=apply(w,a.encounter);
  for(const x of a.captives)z.items[x.item]=(z.items[x.item]||0)+x.count;
  z.conditionalBountyCaptives=[{...a,month:w.month,usage}];check(w,z);return z;
 }
 if(a.type==="conditionalDistressWithCaptive"){
  assert.deepEqual(a,captureAction);assert(!w.conditionalCaptiveRecoveries?.length);
  const prisonType=a.prisonType;
  // Count only known starting detention capacity that is still present,
  // ignoring possible additional capacity. Never add a facility.
  const capacity=snapshot.facilities.filter(id=>w.facilities.has(id)).reduce((n,id)=>{
   const f=facilities[id];return n+((f?.prisonType??0)===prisonType?Number(f?.aliens||0):0);
  },0);
  let used=0;
  for(const stock of [w.items,w.otherItems])for(const [id,n] of Object.entries(stock||{})){
   const i=items[id];if(i?.liveAlien&&(i.liveAlienPrisonType??0)===prisonType)used+=n;
  }
  assert(capacity-used>=a.count,"Insufficient known detention capacity");
  // Both items originate from the SAME previously indexed battle.
  // The existing one-use marker prevents duplicate newspaper credit.
  const z=applyRecovery(w,a.encounter);
  z.items[captive]=(z.items[captive]||0)+a.count;
  z.conditionalCaptiveRecoveries=[{...a,month:w.month,capacity,usedBefore:used}];check(w,z);return z;
 }
 if(a.type==="conditionalBountyRecovery"){
  assert.deepEqual(a,trophyAction);assert(!w.pendingFree&&!w.conditionalBountyRecoveries?.length);
  assert(Object.keys(bs).every(k=>["type","missionWeights","regionWeights","useTable","executionOdds","researchTriggers","firstMonth","lastMonth","startDelay","randomDelay"].includes(k)));
  assert(bs.executionOdds>0&&w.month>=(bs.firstMonth??0)&&(bs.lastMonth==null||w.month<=bs.lastMonth));
  assert(Object.entries(bs.researchTriggers||{}).every(([k,v])=>active(w,k)===v),"Bounty mission research trigger unmet");
  assert(atMonth(bs.missionWeights,w.month)?.[bountyMission]>0&&atMonth(bs.regionWeights,w.month)?.[bountyRegion]>0);
  const z=structuredClone(w);z.items[trophy]=(z.items[trophy]||0)+1;z.conditionalBountyRecoveries=[{...a,month:w.month}];check(w,z);return z;
 }
 if(a.conditionalScoreThreshold){
  assert.deepEqual(a,rankAction(a.research));const rs=eventScripts[a.research],need=rs.minScore;
  assert(!w.pendingFree&&!w.generatedEvents?.[a.event]&&w.month>=rs.firstMonth);
  assert(Object.entries(rs.researchTriggers).every(([k,v])=>active(w,k)===v),"Rank research prerequisites unmet");
  // Score is an explicitly assumed predicate for this event only. Never
  // manufacture a persistent score, funds, mission record or native proof.
  assert(!Number.isFinite(w.score)||w.score>=need,"Known score below required threshold");
  const {conditionalScoreThreshold,...eventStep}=a;
  const z=applyBase({...w,score:Number.isFinite(w.score)?w.score:need},eventStep);
  if(Object.hasOwn(w,"score"))z.score=w.score;else delete z.score;
  z.conditionalRankScoreChecks=[...(w.conditionalRankScoreChecks||[]),{research:a.research,month:w.month,...conditionalScoreThreshold}];
  check(w,z);return z;
 }
 throw Error('unsupported-special-action:'+a.type);
}

 const types=new Set(['conditionalDistressRecovery','conditionalDistressWithCaptive','conditionalBountyRecovery','conditionalBountyWithCaptives']);
 return {
  apply(w,a){
   if(!types.has(a.type)&&!a.conditionalScoreThreshold)return baseGate.apply(w,a);
   try{
    assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);
    assert(!w.pendingFree,'resolve pending free research before encounter/score action');
    const world=a.type==='conditionalDistressRecovery'?applyRecovery(w,a):apply(w,a);
    return {ok:true,world,assumed:true,notes:[a.conditionalScoreThreshold?'event-scoped-score-assumption-no-persistent-credit':'source-checked-conditional-game-encounter-recovery','native-gameplay-not-certified']};
   }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
  },
  supportedActions:[recoveryAction,captureAction,trophyAction,multiBountyAction,...rankIds.map(rankAction)]
 };
}
