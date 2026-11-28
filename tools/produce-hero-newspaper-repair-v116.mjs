// V116: source-backed distress mission loot candidates and explicit conditional recovery. No native tactical or scheduler certification.
 // No invented inventory, event repeat, economic state, or final admission.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
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
const files={},facilities={},items={},research={},events={},eventScripts={},alienDeployments={},alienMissions={},missionScripts={},ufos={},alienRaces={},terrains={};
const game=required("game");
function load(p,expected){
 const bytes=fs.readFileSync(p),name=path.basename(p),digest=createHash("sha256").update(bytes).digest("hex");
 assert.equal(digest,expected||prefix.sourceFiles[name],"Source hash mismatch "+name);
 files[name]=digest;
 const doc=yaml.load(bytes.toString("utf8"),{json:true})||{};
 for(const [k,dst] of Object.entries({facilities,items,research,events,eventScripts,alienDeployments,alienMissions,missionScripts,ufos,alienRaces,terrains}))for(const row of doc[k]||[]){
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
function apply(w,a){
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
const report={schema:"V116_HERO_NEWSPAPER_REPAIR",sourceMetadataSha256:source,sourceFilesHash:hash(files),snapshotHash:hash(snapshot),initialResearch:sorted(prefix.initialResearch),eventSource:{event:EVENT,script:SCRIPT,weights,executionOdds:script.executionOdds,bundle},legacyBranchHint:bid,scope:"SOURCE_INDEXED_CONDITIONAL_MISSION_RECOVERY_NOT_NATIVE_GAME_CERTIFICATION",candidateIndex,fixedMapCandidates,recoveryAction,seedHash:hash(seed),seedSchema:seed.schema,target:target.id,targetMinStats:target.requiredMinStats,medalPolicy:"OXCE_871_STAT_GAIN_DEBRIEF_GATE_V1",researchResults:[],routes:[],blockers:[],registered:false,finalAdmission:false,gameCertified:false};
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
assert.equal(previous.schema,"V115_HERO_GOLD_GATE_CONTINUATIONS");assert.equal(previous.seedHash,hash(seed));assert.equal(previous.sourceMetadataSha256,source);
const gods=previous.routes.find(r=>r.stage==="RESEARCH:STR_GODS_E1"&&r.seedActionHash===best.actionHash);assert(gods&&hash([...best.actions,...gods.suffix])===gods.actionHash);
for(const a of gods.suffix)append(n,a);
assert(active(n.world,"STR_GODS_E1"));
save(best,n,"V115_RESEARCH_RETAINED");
append(n,recoveryAction);
save(best,n,"CONDITIONAL_NEWSPAPER_RECOVERY",{assumptions:["mission generation, geographic accessibility, transport, encounter, victory, item recovery and game debrief are unproven","only one newspaper credited from original guaranteed item-set presence; no money, score or other loot credited"],recovery:n.world.conditionalDistressRecoveries});
function attempt(id,commit=true){
 const before=n.steps.length;
 try{
  let trial=n;
  if(!active(trial.world,id)){const q=planner.ensure([id],trial);if(!q.ok){report.researchResults.push({id,status:"REPAIR_PENDING",reason:q.reason,attempts:q.attempts,failures:arr(q.failures).slice(0,10),deadEnds:arr(q.deadEnds).slice(0,10),prefixActionHash:hash(trial.steps)});persist();console.log(JSON.stringify({id,status:"REPAIR_PENDING",reason:q.reason}));return false;}trial=q.node;}
  assert(active(trial.world,id)&&commitments.every(k=>active(trial.world,k)));
  save(best,trial,"RESEARCH:"+id,{assumptionClass:"CONDITIONAL_DISTRESS_RECOVERY"});
  report.researchResults.push({id,status:"CONDITIONAL_RESEARCH_PRODUCED",addedActions:trial.steps.slice(before),actionHash:hash(trial.steps)});
  if(commit)n=trial;persist();return true;
 }catch(e){report.researchResults.push({id,status:"REPAIR_PENDING",reason:String(e.message)});persist();return false;}
}
for(const id of get("goals","STR_NEWSPAPER,STR_CAPTAINS_RANK_04,STR_SHADOW_CHASING,STR_DARK_STAR,STR_CODEX_GOLD_AWAKENED,STR_PSI_LAB,STR_GLAMOUR_USE").split(","))attempt(id);
report.summary={encounterCandidates:candidateIndex.length,newspaperCandidates:candidateIndex.filter(x=>x.item==="STR_NEWSPAPER").length,fixedMapCandidates:fixedMapCandidates.length,conditionalRecoveryWitnesses:report.routes.filter(x=>x.stage==="CONDITIONAL_NEWSPAPER_RECOVERY").length,researchWitnesses:report.researchResults.filter(r=>r.status==="CONDITIONAL_RESEARCH_PRODUCED").length,researchBlockers:report.researchResults.filter(r=>r.status==="REPAIR_PENDING").length,ascensionCompleted:0};
persist();console.log(JSON.stringify(report.summary));
