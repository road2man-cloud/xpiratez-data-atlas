// V118: replace one existing conditional encounter with a combined newspaper/prisoner outcome, then produce research and rank continuations.
 // No invented inventory, event repeat, economic state, or final admission.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {campaignStartWorld,labVerdict,applyCampaignStartStep,START_RESEARCH} from "../public/soldiers/modern/campaign-start-gate-v1.js";
import {createCampaignStartResearchPlanner} from "../public/soldiers/modern/campaign-start-research-planner-v1.js";
import {careerStatVectors} from "../public/soldiers/modern/campaign-start-career-actions-v1.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {verifyLifecycleEngineSource} from "./population-shared-lifecycle-replay.mjs";

const args=new Map();
for(const a of process.argv.slice(2)){const m=/^--([a-z-]+)=(.+)$/.exec(a);assert(m&&!args.has(m[1]),"Invalid option "+a);args.set(m[1],m[2]);}
const get=(k,d)=>args.get(k)??d;
const required=k=>{const v=get(k);assert(v,"Missing --"+k);return v;};
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sorted=x=>[...x].sort();
const data=read("public/data/soldiers-modern-index.json"),prefix=read(required("prefix"));
const source=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,"v.o2");
assert.equal(prefix.sourceMetadataSha256,source);
assert.equal(prefix.snapshot.sourceFingerprint,source);
assert.deepEqual(sorted(prefix.initialResearch),sorted(Object.keys(START_RESEARCH)));
assert(!prefix.snapshot.researched.length&&!prefix.snapshot.disabled.length);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const yaml=createRequire(path.resolve("package.json"))("js-yaml");
const files={},facilities={},items={},research={},events={},eventScripts={},alienDeployments={},alienMissions={},missionScripts={},ufos={},alienRaces={},terrains={},regions={},textures={},units={},armors={};
const game=required("game");
function load(p,expected){
 const bytes=fs.readFileSync(p),name=path.basename(p),digest=createHash("sha256").update(bytes).digest("hex");
 assert.equal(digest,expected||prefix.sourceFiles[name],"Source hash mismatch "+name);
 files[name]=digest;
 const doc=yaml.load(bytes.toString("utf8"),{json:true})||{};
 for(const t of arr(doc.globe?.textures))textures[t.id]={...textures[t.id],...t};
 for(const [k,dst] of Object.entries({facilities,items,research,events,eventScripts,alienDeployments,alienMissions,missionScripts,ufos,alienRaces,terrains,regions,units,armors}))for(const row of doc[k]||[]){
  if(row.delete){delete dst[row.delete];continue;}const id=row.type||row.name||row.id;if(id)dst[id]={...dst[id],...row};
 }
}
for(const n of ["vars","startingBase","facilities","items","research"])load(path.join(game,"standard/xcom1",n+".rul"));
for(const e of [...data.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,"en")))load(path.join(game,"user/mods/Piratez/Ruleset",e.file),e.sha256);
for(const [n,h] of Object.entries(prefix.sourceFiles))assert.equal(files[n],h);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
data.campaignAssets={sourceFingerprint:source,facilities,items,researchGrants};
const EVENT="STR_KNOCK_KNOCK_PENITENT",SCRIPT="STR_KNOCK_KNOCK_0",ITEM="STR_HERO",PROFILE="manufacture:STR_HERO_RECRUITMENT";
const ev=events[EVENT],rawScript=eventScripts[SCRIPT];
const er=arr(data.eventResearchSources[ITEM]).find(x=>x.event===EVENT);
const script=arr(er?.scripts).find(s=>s.script===SCRIPT);
assert(ev&&rawScript&&script&&items[ITEM]&&er.choiceCount===1);
assert.deepEqual(ev.everyItemList,[ITEM]);assert.deepEqual(ev.researchList,[ITEM]);
assert(Object.keys(ev).every(k=>["name","type","description","background","music","everyItemList","researchList","timer","timerRandom"].includes(k)),"Unmodeled event reward");
assert(Object.keys(rawScript).every(k=>["type","eventWeights","firstMonth","lastMonth","executionOdds","researchTriggers"].includes(k)),"Unmodeled script trigger");
assert.equal(rawScript.executionOdds,script.executionOdds);
assert.equal(rawScript.firstMonth??0,script.firstMonth??0);
assert.equal(rawScript.lastMonth??null,script.lastMonth??null);
assert.deepEqual(sorted(Object.keys(rawScript.researchTriggers||{}).filter(k=>rawScript.researchTriggers[k])),sorted(script.researchPositive||[]));
assert.deepEqual(sorted(Object.keys(rawScript.researchTriggers||{}).filter(k=>!rawScript.researchTriggers[k])),sorted(script.researchNegative||[]));
const weights=Object.entries(rawScript.eventWeights).map(([month,w])=>({month:Number(month),weight:w[EVENT]||0,totalWeight:Object.values(w).reduce((a,b)=>a+b,0)})).sort((a,b)=>a.month-b.month);
assert.deepEqual(weights,script.monthWeights);
const bundle={policy:"V112_FIXED_MIXED_EVENT_BUNDLE",sourceFileSha256:files["Piratez_Events.rul"],item:ITEM,count:1};
const birth=data.profiles.find(p=>p.id===PROFILE);assert(birth&&birth.soldierType==="STR_SOLDIER_HERO");
const eventAction={type:"eventResearch",event:EVENT,script:SCRIPT,research:ITEM,assumeOutcome:true,fixedEventBundle:bundle};
const db=JSON.parse(gunzipSync(fs.readFileSync(required("db"))));
assert.equal(db.sourceMetadataSha256,source);
const bid=get("branch","branch-f895d2081b9effabafd34560"),branch=db.branches.find(b=>b.id===bid);assert(branch&&!branch.sourceRootConflict);
const commitments=[...(branch.captain||[]),...Object.values(branch.choices||{})].filter(Boolean);
const forbidden=new Set([...(branch.blockedResearch||[]),...db.branches.flatMap(b=>[...(b.captain||[]),...Object.values(b.choices||{})]).filter(k=>k&&!commitments.includes(k))]);
function check(w,z){
 assert(![...z.researched].some(k=>forbidden.has(k)),"Branch conflict");
 assert(!commitments.some(k=>active(w,k)&&!active(z,k)),"Branch commitment lost");
}
// A candidate is an indexed encounter configuration, not a claim that the
// scheduler generated it or a tactical battle was won. Recovery is permitted
// only for the one conservative action validated against original tables.
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
const fixedMapCandidates=[];
for(const t of Object.values(terrains))for(const block of arr(t.mapBlocks))for(const item of relevantItems){
 const positions=block.items?.[item];if(!Array.isArray(positions)||!positions.length)continue;
 fixedMapCandidates.push({terrain:t.name||t.type,block:block.name,item,count:positions.length,deployments:Object.values(alienDeployments).filter(d=>arr(d.terrains).includes(t.name||t.type)).map(d=>d.type),status:"MAP_BLOCK_CANDIDATE_NOT_RECOVERY_PROOF"});
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
const nativeDir="tools/headless-simulator/native",lock=read(path.join(nativeDir,"source.lock.json")),archive=path.join(nativeDir,lock.archive);
assert.equal(createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),lock.archiveSha256);
const itemCpp=execFileSync("tar",["-xOf",archive,"./src/Mod/RuleItem.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
const missionCpp=execFileSync("tar",["-xOf",archive,"./src/Savegame/AlienMission.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
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
const debriefCpp=execFileSync("tar",["-xOf",archive,"./src/Battlescape/DebriefingState.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
const facilityCpp=execFileSync("tar",["-xOf",archive,"./src/Mod/RuleBaseFacility.cpp"],{encoding:"utf8",maxBuffer:4*1024*1024});
assert(debriefCpp.includes("getLiveAlienGeoscape()")&&debriefCpp.includes("getAvailableContainment(ruleLiveAlienItem->getPrisonType())")&&debriefCpp.includes("addItemsToBaseStores(ruleLiveAlienItem, base, 1, false)"));
assert(itemCpp.includes("_liveAlienPrisonType(0)")&&facilityCpp.includes("_prisonType(0)"));
const captureAction={type:"conditionalDistressWithCaptive",encounter:recoveryAction,unit:captive,item:captive,armor:leader.armor,prisonType:leaderItem.liveAlienPrisonType??0,count:1,assumeSurrenderOrNonlethalCapture:true,assumeLiveRecovery:true,assumeNativeUnitItemMapping:true,nativeArchiveSha256:lock.archiveSha256,sourceFileSha256:files["Piratez_Factions.rul"]};
function apply(w,a){
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
 return applyBase(w,a);
}
function applyBase(w,a){
 if(a.type==="conditionalDistressRecovery")return applyRecovery(w,a);
 assert(!["externalInputs","campaignContext"].includes(a.type),"State injection");
 if(["research","repeatResearch"].includes(a.type)){const v=labVerdict(w,a.id,data,{repeat:a.type==="repeatResearch"});assert(v.ok,v.reason);}
 if(a.fixedEventBundle){
  assert.deepEqual(a,eventAction);assert(!w.generatedEvents?.[EVENT],"Event replay forbidden");
  const v=eventScriptVerdict({...script,eventId:EVENT},w,{mode:"current"});
  assert(!v.blocked.length&&!v.unknown.length,[...v.blocked,...v.unknown].join("; "));
  // Existing gate owns research/lookup, event count and source-backed research grants.
  // This adapter accounts for the fixed physical item once; never assumes another draw.
  const q=applyCampaignStartStep(w,a,data);assert(q.ok,q.reason);
  assert.equal(q.world.generatedEvents[EVENT],1);
  q.world.items[ITEM]=(q.world.items[ITEM]||0)+1;
  check(w,q.world);return q.world;
 }
 if(a.type==="eventResearch"){
  const e=arr(data.eventResearchSources?.[a.research]).find(x=>x.event===a.event),s=arr(e?.scripts).find(x=>x.script===a.script);
  assert(s,"Unindexed event");
  const triggerItems={...w.otherItems};for(const [k,n] of Object.entries(w.items))triggerItems[k]=(triggerItems[k]||0)+n;
  const v=eventScriptVerdict({...s,eventId:a.event},{...w,triggerItems,triggerFacilities:w.globalFacilities},{mode:"current"});
  assert(!v.blocked.length&&!v.unknown.length,[...v.blocked,...v.unknown].join("; "));
 }
 const q=applyCampaignStartStep(w,a,data);assert(q.ok,q.reason);check(w,q.world);return q.world;
}
const out=required("out"),snapshot=prefix.snapshot,attempts=Number(get("attempts","150"));
verifyLifecycleEngineSource();
const seed=read(required("seed"));
assert.equal(seed.schema,"V114_HERO_ORDERED_TRAINING_LANES");
assert.equal(seed.sourceMetadataSha256,source);
assert.equal(seed.snapshotHash,hash(snapshot));
assert.equal(seed.legacyBranchHint,bid);
assert.deepEqual(seed.eventSource.bundle,bundle);
const target=data.transformations.find(t=>t.id==="STR_HERO_GOLD_TRAINING");
assert(target?.includeBonusesForMinStats===true&&target.requiredMinStats.tu===90&&target.allowedSoldierTypes.includes(birth.soldierType));
const sg="STR_MEDAL_STATGAIN_NAME",cs="STR_MEDAL_CARREER_SCORE_NAME",ba="STR_MEDAL_ALIEN_BASE_ASSAULT_NAME";
const defs=data.commendationIndex,bonusById=new Map(data.bonuses.map(x=>[x.id,x]));
assert.deepEqual(Object.keys(defs[sg].criteria),["totalStatGain"]);
assert.deepEqual(Object.keys(defs[cs].criteria),["totalScore"]);
assert.deepEqual(Object.keys(defs[ba].criteria),["totalMissions"]);
assert([sg,cs,ba].every(id=>!Object.keys(defs[id].killCriteria||{}).length));
assert(!defs[sg].missionTypeFilter.length&&!defs[cs].missionTypeFilter.length&&defs[ba].missionTypeFilter.length>0);
function statGain(s){return STAT_KEYS.reduce((sum,k)=>{const x=s.currentStats[k],y=s.initialStats[k];assert(Number.isSafeInteger(x)&&Number.isSafeInteger(y));return sum+(k==="bravery"?Math.trunc((x-y)/10):x-y);},0);}
function medalTU(id,level){return bonusById.get(defs[id].bonusLevels[level])?.stats?.tu||0;}
const threshold=(id,level)=>defs[id].criteria[Object.keys(defs[id].criteria)[0]][level];
const allSeedRows=seed.stateGroups.map(g=>{const h=g.witnesses[0].actionHash,r=seed.routes.find(x=>x.actionHash===h);assert(r&&r.branchCommitmentsComplete&&hash(r.actions)===h);return r;});
const seedLimit=Number(get("seed-limit","5"));assert(Number.isSafeInteger(seedLimit)&&seedLimit>0);
const seedRows=allSeedRows.slice(0,seedLimit);
assert(Number.isSafeInteger(attempts)&&attempts>0&&!fs.existsSync(out));
const modes=get("modes","early,gold").split(",");assert(modes.every(m=>["early","gold"].includes(m))&&new Set(modes).size===modes.length);
const report={schema:"V118_HERO_CAPTIVE_RANK_REPAIR",sourceMetadataSha256:source,sourceFilesHash:hash(files),snapshotHash:hash(snapshot),initialResearch:sorted(prefix.initialResearch),eventSource:{event:EVENT,script:SCRIPT,weights,executionOdds:script.executionOdds,bundle},legacyBranchHint:bid,scope:"CONDITIONAL_CAPTIVE_AND_RANK_REPLAY_NOT_NATIVE_GAME_CERTIFICATION",captureAction,trophyAction,scorePolicy:"event-scoped assumption only; no persistent score credit",engineArchiveSha256:lock.archiveSha256,seedHash:hash(seed),seedSchema:seed.schema,target:target.id,targetMinStats:target.requiredMinStats,medalPolicy:"OXCE_871_STAT_GAIN_DEBRIEF_GATE_V1",researchResults:[],routes:[],blockers:[],registered:false,finalAdmission:false,gameCertified:false};
const persist=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
const planner=createCampaignStartResearchPlanner(data,snapshot,{maxAttempts:attempts,maxDepth:55,maxSteps:2500,methodLimit:40,forbiddenResearch:[...forbidden],preserveResearch:commitments,collectFailures:true});
function seedNode(row){
 const n=planner.newNode();
 for(const a of row.actions){n.world=apply(n.world,a);n.steps.push(a);}
 assert(!n.world.pendingFree&&commitments.every(k=>active(n.world,k)));
 assert.deepEqual(careerStatVectors(n.world.soldiers.find(s=>s.id==="origin"),data),row.stats);
 return n;
}
function append(n,a){n.world=apply(n.world,a);n.steps.push(a);}
function save(row,n,stage,extra={}){
 const seedActions=row.actions.length,suffix=n.steps.slice(seedActions);
 assert.equal(hash(n.steps.slice(0,seedActions)),row.actionHash);
 let w=campaignStartWorld(data,snapshot);for(const a of n.steps)w=apply(w,a);
 assert(!w.pendingFree&&commitments.every(k=>active(w,k)));
 const m=w.soldiers.find(s=>s.id==="origin"),stats=careerStatVectors(m,data);
 assert.deepEqual(stats,careerStatVectors(n.world.soldiers.find(s=>s.id==="origin"),data));
 const receipt={stage,seedActionHash:row.actionHash,seedSequence:row.sequence,actionHash:hash(n.steps),actionCount:n.steps.length,suffix,stats,medals:m.commendations||{},rawStatGain:statGain(m.state),permanentTU:stats.permanentStats.tu,gateTU:stats.stats.tu,missingResearch:target.requires.filter(k=>!active(w,k)),missingItems:Object.fromEntries(Object.entries(target.requiredItems||{}).map(([k,v])=>[k,Math.max(0,v-(w.items[k]||0))]).filter(([,v])=>v>0)),branchCommitmentsComplete:true,gameCertified:false,registered:false,finalAdmission:false,...extra};
 report.routes.push(receipt);persist();
 console.log(JSON.stringify({stage,seed:row.actionHash.slice(0,10),gateTU:receipt.gateTU,actions:receipt.actionCount}));
}
function addMedal(n,id,level,assumptions){
 const member=n.world.soldiers.find(s=>s.id==="origin");
 const need=threshold(id,level);assert(Number.isSafeInteger(need)&&need>0);
 if(id===sg){assert(statGain(member.state)>=need,"Stat gain threshold unmet");assumptions.push({medal:id,level,criterion:"totalStatGain",threshold:need,modeledValue:statGain(member.state),debriefAssumed:true});}
 else if(id===cs){assumptions.push({medal:id,level,criterion:"totalScore",threshold:need,achievementAssumed:true});}
 else if(id===ba){assumptions.push({medal:id,level,criterion:"totalMissions",threshold:need,missionTypeFilter:defs[id].missionTypeFilter,achievementAssumed:true,missionAvailabilityProven:false});}
 else throw Error("unsupported medal");
 append(n,{type:"conditionalMedal",soldier:"origin",medal:id,level,assumption:true});
}
function chooseLevel(id,need){return defs[id].bonusLevels.findIndex((_,i)=>medalTU(id,i)>=need);}
const best=seedRows[0];let n=seedNode(best);
const previous=read(required("previous"));
assert.equal(previous.schema,"V117_HERO_BOUNTY_RANK_REPAIR");assert.equal(previous.seedHash,hash(seed));assert.equal(previous.sourceMetadataSha256,source);
const old=previous.routes.find(r=>r.stage==="RESEARCH:STR_LOKNAR_ORIGINS"&&r.seedActionHash===best.actionHash);
assert(old&&hash([...best.actions,...old.suffix])===old.actionHash);
assert.equal(old.suffix.filter(a=>a.type==="conditionalDistressRecovery").length,1);
report.replacedLegacyAction={sourceActionHash:old.actionHash,sourceStage:old.stage,oldAction:recoveryAction,newAction:captureAction};
for(const a of old.suffix)append(n,a.type==="conditionalDistressRecovery"?captureAction:a);
assert(active(n.world,"STR_NEWSPAPER")&&active(n.world,"STR_ANY_BASIC_TROPHY_UNLOCKED")&&active(n.world,"STR_LOKNAR_ORIGINS")&&n.world.items[captive]>=1);
save(best,n,"CONDITIONAL_CAPTIVE_RECOVERY",{capture:n.world.conditionalCaptiveRecoveries});
function attempt(id){
 const before=n.steps.length,already=active(n.world,id);
 try{
  let trial=n;
  if(!already){const q=planner.ensure([id],trial);if(!q.ok)throw Error(q.reason.slice(0,1800));trial=q.node;}
  assert(active(trial.world,id)&&commitments.every(k=>active(trial.world,k)));
  save(best,trial,"RESEARCH:"+id,{assumptionClass:"CONDITIONAL_CAPTIVE_AND_SCORE_PREDICATES",rankScoreChecks:trial.world.conditionalRankScoreChecks||[]});
  report.researchResults.push({id,status:already?"ALREADY_ACTIVE":"CONDITIONAL_RESEARCH_PRODUCED",addedActions:trial.steps.slice(before),actionHash:hash(trial.steps)});
  n=trial;persist();return true;
 }catch(e){report.researchResults.push({id,status:"REPAIR_PENDING",reason:String(e.message),prefixActionHash:hash(n.steps)});persist();console.log(JSON.stringify({id,status:"REPAIR_PENDING",reason:String(e.message).slice(0,400)}));return false;}
}
function rank(id){
 if(active(n.world,id))return true;
 const a=rankAction(id),s=eventScripts[id];
 for(const [dep,required] of Object.entries(s.researchTriggers||{})){if(required&&!attempt(dep))return false;}
 try{
  if(n.world.month<s.firstMonth)append(n,{type:"advanceMonth",month:s.firstMonth,assumeContinuity:true});
  append(n,a);assert(active(n.world,id));
  save(best,n,"RANK:"+id,{rankScoreChecks:n.world.conditionalRankScoreChecks});
  report.researchResults.push({id,status:"CONDITIONAL_RANK_PRODUCED",minScore:s.minScore,firstMonth:s.firstMonth,scoreAchievementProven:false,actionHash:hash(n.steps)});persist();return true;
 }catch(e){report.blockers.push({stage:id,reason:String(e.message),partialActionHash:hash(n.steps)});persist();return false;}
}
try{
 // Select an actual free-research outcome from the captured leader. It
 // consumes the prisoner through the usual research engine; no sample reuse.
 append(n,{type:"research",id:captive});
 if(n.world.pendingFree){
  assert(n.world.pendingFree.choices.includes("STR_OLD_BOOKS"));
  append(n,{type:"freeResearch",source:captive,research:"STR_OLD_BOOKS",assumeOutcome:true});
 }
 assert(active(n.world,captive)&&active(n.world,"STR_OLD_BOOKS"));
 save(best,n,"CAPTIVE_INTERROGATED");
 for(const id of rankIds.slice(1))if(!rank(id))break;
 for(const id of get("goals","STR_SCHOOL_BOOKS,STR_LIBRARY,STR_GODS_SUMMARY,STR_SHADOW_CHASING,STR_DARK_STAR,STR_PSI_LAB,STR_GLAMOUR_USE").split(",").filter(Boolean))attempt(id);
}catch(e){report.blockers.push({stage:"captivity",reason:String(e.message),partialActionHash:hash(n.steps)});persist();}
report.summary={newRankWitnesses:report.researchResults.filter(r=>r.status==="CONDITIONAL_RANK_PRODUCED").length,highestRank:rankIds.filter(k=>active(n.world,k)).length,captiveRecoveryWitnesses:report.routes.filter(r=>r.stage==="CONDITIONAL_CAPTIVE_RECOVERY").length,interrogated:active(n.world,captive),oldBooks:active(n.world,"STR_OLD_BOOKS"),alienOrigins:active(n.world,"STR_ALIEN_ORIGINS"),researchWitnesses:report.researchResults.filter(r=>r.status==="CONDITIONAL_RESEARCH_PRODUCED").length,alreadyActive:report.researchResults.filter(r=>r.status==="ALREADY_ACTIVE").length,researchBlockers:report.researchResults.filter(r=>r.status==="REPAIR_PENDING").length,blockers:report.blockers.length,ascensionCompleted:0};
persist();console.log(JSON.stringify(report.summary));
