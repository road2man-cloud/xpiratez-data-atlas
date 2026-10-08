import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const outDir=path.resolve(arg("--out","public/data"));
const repoRoot=path.resolve(arg("--repo","."));
if(!source){console.error("Usage: node tools/build-enemy-force-data.mjs --source <.../Piratez> [--out public/data]");process.exit(2)}
const modRoot=path.resolve(source),rulesDir=path.join(modRoot,"Ruleset"),langDir=path.join(modRoot,"Language");
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const loadJson=p=>JSON.parse(fs.readFileSync(path.resolve(repoRoot,p),"utf8"));
const loadYaml=p=>{const docs=[];yaml.loadAll(read(p),d=>{if(d)docs.push(d)},{json:true});return docs};

function deepMerge(a,b){
  if(a&&b&&typeof a==="object"&&!Array.isArray(a)&&b&&typeof b==="object"&&!Array.isArray(b)){
    const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?deepMerge(out[k],v):v;return out;
  }
  return b;
}
const identityKeys=["type","name","id","article","race","category","region","deployment","missionName","script","eventScript","cutscene","commendation"];
function identityOf(x){if(!x||typeof x!=="object"||Array.isArray(x))return null;for(const k of identityKeys)if(typeof x[k]==="string")return k+":"+x[k];return null}
function mergeSection(oldValue,newValue){
  if(!Array.isArray(oldValue)||!Array.isArray(newValue))return deepMerge(oldValue,newValue);
  const out=[...oldValue],pos=new Map();out.forEach((x,i)=>{const id=identityOf(x);if(id)pos.set(id,i)});
  for(const x of newValue){
    if(x&&typeof x==="object"&&!Array.isArray(x)&&typeof x.delete==="string"){
      const idx=out.findIndex(y=>y&&typeof y==="object"&&Object.values(y).includes(x.delete));if(idx>=0)out.splice(idx,1);continue;
    }
    const id=identityOf(x);if(id&&pos.has(id)){const i=pos.get(id);out[i]=deepMerge(out[i],x)}else{out.push(x);if(id)pos.set(id,out.length-1)}
  }
  return out;
}
function resolveRefNode(value,depth=0){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  if(depth>64)throw new Error("refNode nesting exceeded 64 levels");
  const child={...value},parent=child.refNode;delete child.refNode;
  return parent&&typeof parent==="object"&&!Array.isArray(parent)?deepMerge(resolveRefNode(parent,depth+1),child):child;
}
const merged={},sourceHistory={};
for(const file of fs.readdirSync(rulesDir).filter(f=>f.toLowerCase().endsWith(".rul")).sort()){
  for(const doc of loadYaml(path.join(rulesDir,file))){
    for(const [section,value] of Object.entries(doc)){
      merged[section]=section in merged?mergeSection(merged[section],value):value;
      if(Array.isArray(value))for(const entry of value){const id=identityOf(entry);if(id){const a=sourceHistory[id]||=[];if(a.at(-1)!==file)a.push(file)}}
    }
  }
}
const effective={...merged};
for(const section of ["ufos","alienMissions","missionScripts","ufoTrajectories","alienDeployments","alienRaces","units","events"]){
  if(Array.isArray(merged[section]))effective[section]=merged[section].map(v=>resolveRefNode(v));
}

function locale(code){const p=path.join(langDir,code+".yml");if(!fs.existsSync(p))return{};const d=yaml.load(read(p),{json:true})||{};return d[code]||d}
const ko=locale("ko"),en=locale("en-US");
function tr(id,which="ko"){if(typeof id!=="string")return String(id??"");const a=which==="ko"?ko:en,b=which==="ko"?en:ko;const v=a[id]??b[id]??id;return Array.isArray(v)?v.join(" / "):String(v).replaceAll("{NEWLINE}"," ").replace(/\s+/g," ").trim()}
function named(id){return{id,koName:tr(id,"ko"),enName:tr(id,"en")}}
function arr(v){return Array.isArray(v)?v:(v==null?[]:[v])}
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function num(v){return Number.isFinite(Number(v))?Number(v):0}
function uniq(xs){return[...new Set(arr(xs).filter(Boolean))]}
function bucket(id){return crypto.createHash("sha1").update(id).digest("hex")[0]}
function fmt(v){return Number(v||0).toLocaleString("ko-KR",{maximumFractionDigits:2})}
function pct(v){return v==null?"—":(Number(v)*100).toFixed(Number(v)*100<10?2:1)+"%"}
const difficultyLevels=[
  {id:0,key:"beginner",koName:"초보",enName:"Beginner"},
  {id:1,key:"experienced",koName:"경험자",enName:"Experienced"},
  {id:2,key:"veteran",koName:"베테랑",enName:"Veteran"},
  {id:3,key:"genius",koName:"천재",enName:"Genius"},
  {id:4,key:"superhuman",koName:"초인",enName:"Superhuman"}
];
// OXCE BattlescapeGenerator::deployAliens(): inclusive, independent integer RNG(0,dQty)
// and RNG(0,extraQty); medQty is not read by this engine routine.
function deploymentDifficultyQty(row,difficulty){
  const low=num(row.lowQty),high=num(row.highQty),random=num(row.dQty)+num(row.extraQty);
  const base=difficulty<2?low:difficulty<4?low+Math.trunc((high-low)/2):high;
  return{difficulty,min:base,max:base+random,average:base+random/2};
}
function difficultyTotals(rows){
  return difficultyLevels.map(level=>{
    const quantities=rows.map(row=>row.difficultyQty[level.id]);
    return{difficulty:level.id,min:quantities.reduce((s,x)=>s+x.min,0),max:quantities.reduce((s,x)=>s+x.max,0),average:quantities.reduce((s,x)=>s+x.average,0)};
  });
}
function hasBatchim(s){const t=String(s||"").trim();for(let i=t.length-1;i>=0;i--){const c=t.charCodeAt(i);if(c>=0xac00&&c<=0xd7a3)return(c-0xac00)%28!==0;if(/[A-Za-z0-9]/.test(t[i]))return false}return false}
function topic(s){const v=String(s||"").trim();return v+(hasBatchim(v)?"은":"는")}
function expanded(text,fallback){const t=String(text||"").trim();return t.length>=55?t:[t,fallback].filter(Boolean).join(" ")}
function gzipJson(p,data){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,zlib.gzipSync(Buffer.from(JSON.stringify(data)),{level:9}))}

const itemIndex=loadJson("public/items/data/items-index.json").index||[];
const itemMap=new Map(itemIndex.map(x=>[x.id,x]));
const armorIndex=loadJson("public/data/armors-index.json").index||[];
const armorMap=new Map(armorIndex.map(x=>[x.id,x]));

const ufos=arr(effective.ufos).filter(x=>x&&typeof x.type==="string");
const missions=arr(effective.alienMissions).filter(x=>x&&typeof x.type==="string");
const scripts=arr(effective.missionScripts).filter(x=>x&&typeof x.type==="string");
const trajectories=arr(effective.ufoTrajectories).filter(x=>x&&typeof x.id==="string");
const deployments=arr(effective.alienDeployments).filter(x=>x&&typeof x.type==="string");
const races=arr(effective.alienRaces).filter(x=>x&&typeof x.id==="string");
const units=arr(effective.units).filter(x=>x&&typeof x.type==="string");
const events=arr(effective.events).filter(x=>x&&typeof x.name==="string");
const ufoMap=new Map(ufos.map(x=>[x.type,x])),missionMap=new Map(missions.map(x=>[x.type,x]));
const trajectoryMap=new Map(trajectories.map(x=>[x.id,x])),deploymentMap=new Map(deployments.map(x=>[x.type,x]));
const raceMap=new Map(races.map(x=>[x.id,x])),unitMap=new Map(units.map(x=>[x.type,x]));
// Tactical sites can be tied to a mission/UFO via alienDeployment.customUfo
// even when alienMission.siteType and UFO.missionCustomDeploy are absent.
const deploymentsByCustomUfo=new Map(),deploymentsByBriefingTitle=new Map();
for(const d of deployments){
  if(typeof d.customUfo==="string"){
    if(!deploymentsByCustomUfo.has(d.customUfo))deploymentsByCustomUfo.set(d.customUfo,[]);
    deploymentsByCustomUfo.get(d.customUfo).push(d.type);
  }
  const title=obj(d.briefing).title;
  if(typeof title==="string"){
    if(!deploymentsByBriefingTitle.has(title))deploymentsByBriefingTitle.set(title,[]);
    deploymentsByBriefingTitle.get(title).push(d.type);
  }
}

function weightedBuckets(v){
  const rows=[];
  for(const [key,map] of Object.entries(obj(v))){
    const options=Object.entries(obj(map)).filter(([,w])=>Number.isFinite(Number(w))&&Number(w)>0).map(([id,weight])=>({id,weight:num(weight)}));
    const total=options.reduce((s,x)=>s+x.weight,0);
    rows.push({bucket:String(key),totalWeight:total,options:options.map(x=>({...x,relativeShare:total>0?x.weight/total:null}))});
  }
  return rows.sort((a,b)=>Number(a.bucket)-Number(b.bucket));
}
function compactTriggers(s){
  const out={};
  for(const k of ["researchTriggers","itemTriggers","facilityTriggers","xcomBaseInRegionTriggers","xcomBaseInCountryTriggers"])if(s[k]&&typeof s[k]==="object")out[k]=Object.entries(s[k]).map(([id,value])=>({...named(id),value}));
  return out;
}
function scriptConditions(s){
  const keys=["firstMonth","lastMonth","executionOdds","startDelay","randomDelay","minDifficulty","maxDifficulty","minScore","maxScore","targetBaseOdds","maxRuns","varName","missionVarName","counterMin","counterMax"];
  const out={};for(const k of keys)if(s[k]!=null)out[k]=s[k];return out;
}
const scriptsByMission=new Map();
for(const s of scripts){
  for(const group of weightedBuckets(s.missionWeights))for(const op of group.options){
    if(!missionMap.has(op.id))continue;
    if(!scriptsByMission.has(op.id))scriptsByMission.set(op.id,[]);
    scriptsByMission.get(op.id).push({id:s.type,bucket:group.bucket,weight:op.weight,totalWeight:group.totalWeight,relativeShare:op.relativeShare,conditions:scriptConditions(s),triggers:compactTriggers(s),raceWeightsOverride:weightedBuckets(s.raceWeights),sourceFiles:sourceHistory["type:"+s.type]||[]});
  }
}
function aggregateMap(v){const m=new Map();for(const [id,qty] of Object.entries(obj(v)))m.set(id,(m.get(id)||0)+num(qty));return m}
const eventRewards=new Map();
for(const e of events){
  const research=new Set(arr(e.researchList).filter(x=>typeof x==="string")),items=aggregateMap(e.everyMultiItemList);
  for(const id of arr(e.everyItemList).filter(x=>typeof x==="string"))items.set(id,(items.get(id)||0)+1);
  eventRewards.set(e.name,{research,items:new Set(items.keys()),...named(e.name)});
}
function upstreamEventsForScript(script){
  const positive=[],negative=[];
  for(const [kind,rewardKey] of [["researchTriggers","research"],["itemTriggers","items"]]){
    for(const [triggerId,value] of Object.entries(obj(script[kind]))){
      for(const [eventId,rewards] of eventRewards){
        if(!rewards[rewardKey].has(triggerId))continue;
        (value===false?negative:positive).push({eventId,eventKoName:rewards.koName,eventEnName:rewards.enName,kind,triggerId,triggerKoName:tr(triggerId,"ko"),triggerEnName:tr(triggerId,"en")});
      }
    }
  }
  return{positive,negative};
}

const altitudeLabels={0:"지상/착륙",1:"초저고도",2:"저고도",3:"고고도",4:"초고고도",5:"우주/외곽"};
function trajectoryProfile(id,speedMax){
  const t=trajectoryMap.get(id);if(!t)return null;
  const waypoints=arr(t.waypoints).filter(Array.isArray).map((x,i)=>{
    const zone=num(x[0]),altitude=num(x[1]),speedPct=num(x[2]);
    return{index:i+1,zone,altitude,altitudeKo:altitudeLabels[altitude]||String(altitude),speedPct,baseEffectiveSpeed:speedMax*speedPct/100,isGround:altitude===0};
  });
  return{id,...named(id),groundTimer:t.groundTimer??0,waypoints,hasGround:waypoints.some(x=>x.isGround),sourceFiles:sourceHistory["id:"+id]||[]};
}
function itemInfo(id){const x=itemMap.get(id);return{id,koName:x?.koName||tr(id,"ko"),enName:x?.enName||tr(id,"en"),kind:x?.kind??null,power:x?.power??null,damageTypeKo:x?.damageTypeKo??null}}
const combatStatKeys=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
function unitDifficultyProfiles(u,armor){
  const stats=obj(u.stats),growth=obj(effective.statGrowthMultipliers),coefficients=arr(effective.difficultyCoefficient),aims=arr(effective.aimAndArmorMultipliers);
  const withArmor=Object.fromEntries(combatStatKeys.filter(k=>stats[k]!=null||num(armor?.[k])!==0).map(k=>[k,num(stats[k])+num(armor?.[k])]));
  const armorSides={front:num(armor?.frontArmor),left:num(armor?.leftArmor),right:num(armor?.rightArmor),rear:num(armor?.rearArmor),under:num(armor?.underArmor)};
  return difficultyLevels.map(level=>{
    const coeff=Number(coefficients[level.id]??level.id),aim=Number(aims[level.id]??1);
    const adjusted=Object.fromEntries(Object.entries(withArmor).map(([k,base])=>{
      const increased=k==="mana"?base:base+Math.trunc(base*coeff*num(growth[k])/100);
      return[k,k==="firing"?Math.trunc(increased*aim):increased];
    }));
    const scaledArmor=Object.fromEntries(Object.entries(armorSides).map(([k,value])=>[k,Math.trunc(value*aim)]));
    return{difficulty:level.id,stats:adjusted,armor:scaledArmor};
  });
}
function unitProfile(id){
  const u=unitMap.get(id);if(!u)return{...named(id),missing:true};
  const a=armorMap.get(u.armor);
  const built=uniq([...(Array.isArray(u.builtInWeapons)?u.builtInWeapons:[]),...arr(u.builtInWeaponSets).flatMap(arr),u.meleeWeapon,u.psiWeapon].filter(x=>typeof x==="string"));
  return{id,...named(id),race:u.race??null,rank:u.rank??null,stats:obj(u.stats),armorId:u.armor??null,
    armorStatBonuses:Object.fromEntries(combatStatKeys.filter(k=>num(a?.[k])!==0).map(k=>[k,num(a[k])])),
    difficultyProfiles:unitDifficultyProfiles(u,a),
    armor:a?{id:a.id,koName:a.koName,enName:a.enName,front:a.frontArmor,left:a.leftArmor,right:a.rightArmor,rear:a.rearArmor,under:a.underArmor,ap:a.ap,incendiary:a.incendiary,he:a.he,laser:a.laser,plasma:a.plasma,stun:a.stun,meleeResist:a.meleeResist,acid:a.acid}:u.armor?named(u.armor):null,
    builtInWeapons:built.map(itemInfo),livingWeapon:Boolean(u.livingWeapon),capturable:u.capturable??null,intelligence:u.intelligence??null,aggression:u.aggression??null,spotter:u.spotter??null,sniper:u.sniper??null,energyRecovery:u.energyRecovery??null,value:u.value??null,sourceFiles:sourceHistory["type:"+id]||[]};
}
function candidateWeights(race,rank,customUnitType){
  if(customUnitType)return[{...named(customUnitType),probability:1,weight:1}];
  if(!race)return[];
  const random=arr(race.membersRandom)[rank],source=Array.isArray(random)&&random.length?random:[arr(race.members)[rank]].filter(Boolean),counts=new Map();
  for(const id of source)if(typeof id==="string")counts.set(id,(counts.get(id)||0)+1);
  const total=[...counts.values()].reduce((a,b)=>a+b,0);
  return[...counts].map(([id,weight])=>({...named(id),weight,probability:total?weight/total:null}));
}
function deploymentProfile(id){
  const d=deploymentMap.get(id);if(!d)return null;
  const briefing=obj(d.briefing);
  const data=arr(d.data).map((row,i)=>({index:i+1,alienRank:num(row.alienRank),customUnitType:row.customUnitType??null,lowQty:num(row.lowQty),medQty:row.medQty??null,highQty:num(row.highQty),dQty:num(row.dQty),extraQty:num(row.extraQty),percentageOutsideUfo:row.percentageOutsideUfo??null,difficultyQty:difficultyLevels.map(level=>deploymentDifficultyQty(row,level.id)),itemSets:arr(row.itemSets).map((set,level)=>({level,items:arr(set).filter(x=>typeof x==="string").map(itemInfo)})),extraRandomItems:arr(row.extraRandomItems).map(arr).map(xs=>xs.filter(x=>typeof x==="string").map(itemInfo))}));
  return{id,...named(id),race:d.race??null,width:d.width??null,length:d.length??null,height:d.height??null,terrains:arr(d.terrains),duration:d.duration??null,
    alertId:d.alert??null,alertName:d.alert?tr(d.alert,"ko"):null,alertDescriptionId:d.alertDescription??null,alertDescription:d.alertDescription?tr(d.alertDescription,"ko"):null,
    markerNameId:d.markerName??null,markerName:d.markerName?tr(d.markerName,"ko"):null,customUfo:d.customUfo??null,briefingTitle:briefing.title??null,
    briefing:{titleId:briefing.title??null,title:briefing.title?tr(briefing.title,"ko"):null,descId:briefing.desc??null,desc:briefing.desc?tr(briefing.desc,"ko"):null},
    data,difficultyTotals:difficultyTotals(data),
    sourceFiles:sourceHistory["type:"+id]||[]};
}
function effectiveDeployFor(ufo,raceId){
  const rb=obj(ufo?.raceBonus)[raceId]||{};
  const candidates=[],seen=new Set();
  const add=(id,source)=>{if(!id||!deploymentMap.has(id)||seen.has(id))return;seen.add(id);candidates.push({id,source})};
  if(rb.missionCustomDeploy)add(rb.missionCustomDeploy,"raceBonus.missionCustomDeploy");
  else if(ufo?.missionCustomDeploy)add(ufo.missionCustomDeploy,"ufo.missionCustomDeploy");
  else if(ufo&&deploymentMap.has(ufo.type))add(ufo.type,"same-id deployment");
  if(ufo)for(const id of deploymentsByCustomUfo.get(ufo.type)||[])add(id,"alienDeployment.customUfo");
  return{id:candidates[0]?.id||null,source:candidates[0]?.source||"unresolved",deploymentCandidates:candidates,raceBonus:rb};
}
function raceProfile(id){
  const r=raceMap.get(id);if(!r)return{...named(id),missing:true};
  const max=Math.max(arr(r.members).length,arr(r.membersRandom).length);
  return{id,...named(id),ranks:Array.from({length:max},(_,rank)=>({rank,candidates:candidateWeights(r,rank,null)})),sourceFiles:sourceHistory["id:"+id]||[]};
}
function siteDeploymentsFor(m){
  const entries=[],seen=new Set();
  const add=(id,source)=>{if(!id||!deploymentMap.has(id)||seen.has(id))return;seen.add(id);entries.push({id,source})};
  add(m.siteType,"alienMission.siteType");
  // Explicit deployment.customUfo references outrank naming conventions.
  for(const id of deploymentsByCustomUfo.get(m.type)||[])add(id,"alienDeployment.customUfo");
  // OXCE map-site datasets also commonly use the mission name as deployment ID
  // or a biome suffix, without siteType/customUfo. Keep these as *inferred*
  // candidates, not proven runtime spawn paths.
  if(m.objective===3){
    add(m.type,"matching mission/deployment ID (inferred)");
    for(const id of deploymentsByBriefingTitle.get(m.type)||[]){
      const d=deploymentMap.get(id);
      if(id.startsWith(m.type+"_")&&(!d.customUfo||d.customUfo===m.type))add(id,"briefing.title + deployment ID prefix (inferred)");
    }
  }
  return entries;
}
function threatProfile(waves,siteDeployments,raceIds){
  const pairs=[];
  for(const w of waves)for(const re of Object.values(w.raceEffects||{}))for(const dep of re.deploymentCandidates||[])pairs.push({deploymentId:dep.id,raceId:re.raceId,mult:Math.max(1,w.count||1)});
  for(const dep of siteDeployments)for(const raceId of raceIds.length?raceIds:[""])pairs.push({deploymentId:dep.id,raceId,mult:1});
  const seen=new Set(),sizes=[],unitIds=new Set(),weaponIds=new Set();let maxHealth=0,maxFiring=0,maxReactions=0,maxMelee=0,maxArmor=0;
  for(const p of pairs){
    const key=p.deploymentId+"|"+p.raceId;if(seen.has(key))continue;seen.add(key);
    const d=deploymentMap.get(p.deploymentId),race=raceMap.get(p.raceId);if(!d)continue;
    let low=0,high=0;
    for(const row of arr(d.data)){
      low+=deploymentDifficultyQty(row,0).min*p.mult;high+=deploymentDifficultyQty(row,4).max*p.mult;
      for(const c of candidateWeights(race,num(row.alienRank),row.customUnitType)){
        unitIds.add(c.id);const u=unitMap.get(c.id);if(!u)continue;
        maxHealth=Math.max(maxHealth,num(u.stats?.health));maxFiring=Math.max(maxFiring,num(u.stats?.firing));maxReactions=Math.max(maxReactions,num(u.stats?.reactions));maxMelee=Math.max(maxMelee,num(u.stats?.melee));
        const a=armorMap.get(u.armor);if(a)maxArmor=Math.max(maxArmor,num(a.frontArmor),num(a.leftArmor),num(a.rightArmor),num(a.rearArmor),num(a.underArmor));
      }
      for(const set of arr(row.itemSets))for(const item of arr(set))if(typeof item==="string")weaponIds.add(item);
    }
    sizes.push({deploymentId:p.deploymentId,raceId:p.raceId,low,high});
  }
  return{sizes,unitIds:[...unitIds],weaponIds:[...weaponIds],maxHealth,maxFiring,maxReactions,maxMelee,maxArmor};
}
const support={meta:{version:2,generator:"enemy-force-support-v2",difficultyLevels,
  difficultyMechanics:{quantityRule:"BattlescapeGenerator::deployAliens",randomInclusive:true,randomTerms:["dQty","extraQty"],medianRule:"lowQty + trunc((highQty-lowQty)/2)",medQtyUsed:false,spawnNodeMayReduceActualCount:true,
    difficultyCoefficient:arr(effective.difficultyCoefficient),aimAndArmorMultipliers:arr(effective.aimAndArmorMultipliers),statGrowthMultipliers:obj(effective.statGrowthMultipliers),
    note:"수량 난수는 각 rank별 독립 추첨이며, 실제 전장 스폰 노드가 부족하면 유닛 배치가 실패할 수 있습니다. 장비 itemLevel은 경과 월과 alienItemLevels 표로 정해지고 난이도 구간과 별개입니다."}},
  units:Object.fromEntries(units.map(u=>[u.type,unitProfile(u.type)])),races:Object.fromEntries(races.map(r=>[r.id,raceProfile(r.id)])),deployments:Object.fromEntries(deployments.map(d=>[d.type,deploymentProfile(d.type)]))};

function raceIdsFromBuckets(buckets){return uniq(buckets.flatMap(b=>b.options.map(x=>x.id)))}
const eventForceLinks={};
function addEventLink(kind,row){const e=eventForceLinks[row.eventId]||={enables:[],blocks:[]};e[kind].push(row)}
const index=[],details={},editorials={};
let totalWaves=0,groundMissionCount=0,hunterMissionCount=0,eventLinkedCount=0;
for(const m of missions){
  const id=m.type,b=bucket(id),missionRaceWeights=weightedBuckets(m.raceWeights),scriptRows=scriptsByMission.get(id)||[];
  const scriptsDetailed=scriptRows.map(s=>{
    const raw=scripts.find(x=>x.type===s.id)||{},up=upstreamEventsForScript(raw);
    const make=(x)=>({eventId:x.eventId,eventKoName:x.eventKoName,eventEnName:x.eventEnName,scriptId:s.id,triggerKind:x.kind,triggerId:x.triggerId,triggerKoName:x.triggerKoName,triggerEnName:x.triggerEnName,missionId:id,missionKoName:tr(id,"ko"),missionEnName:tr(id,"en"),bucket:s.bucket,weight:s.weight,totalWeight:s.totalWeight,relativeShare:s.relativeShare});
    const causal={positive:up.positive.map(make),negative:up.negative.map(make)};
    for(const x of causal.positive)addEventLink("enables",x);for(const x of causal.negative)addEventLink("blocks",x);
    return{...s,upstreamEvents:causal};
  });
  const allRaceIds=uniq([...raceIdsFromBuckets(missionRaceWeights),...scriptsDetailed.flatMap(s=>raceIdsFromBuckets(s.raceWeightsOverride||[]))]);
  const waves=arr(m.waves).map((w,i)=>{
    const u=ufoMap.get(w.ufo),baseSpeed=num(u?.speedMax),traj=trajectoryProfile(w.trajectory,baseSpeed);
    const raceEffects=Object.fromEntries(allRaceIds.map(raceId=>{const dep=effectiveDeployFor(u,raceId),bonus=num(dep.raceBonus?.speedMax);return[raceId,{raceId,...named(raceId),speedMaxBase:baseSpeed,speedMaxRaceBonus:bonus,effectiveSpeedMax:baseSpeed+bonus,deploymentId:dep.id,deploymentSource:dep.source,deploymentCandidates:dep.deploymentCandidates}]}));
    return{index:i+1,ufoId:w.ufo,...named(w.ufo),count:num(w.count),timer:num(w.timer),trajectoryId:w.trajectory,objective:Boolean(w.objective),hunterKillerPercentage:w.hunterKillerPercentage??u?.hunterKillerPercentage??0,huntMode:w.huntMode??u?.huntMode??null,huntBehavior:w.huntBehavior??u?.huntBehavior??null,ufo:{size:u?.size??null,damageMax:u?.damageMax??null,speedMax:baseSpeed,accel:u?.accel??null,power:u?.power??null,range:u?.range??null,reload:u?.reload??null,score:u?.score??null,unmanned:Boolean(u?.unmanned),sourceFiles:sourceHistory["type:"+w.ufo]||[]},trajectory:traj,raceEffects};
  });
  totalWaves+=waves.reduce((s,w)=>s+w.count,0);
  const hasGround=waves.some(w=>w.trajectory?.hasGround),hasHunter=waves.some(w=>num(w.hunterKillerPercentage)>0);
  if(hasGround)groundMissionCount++;if(hasHunter)hunterMissionCount++;
  const upstreamPositive=uniq(scriptsDetailed.flatMap(s=>s.upstreamEvents.positive.map(x=>x.eventId)));if(upstreamPositive.length)eventLinkedCount++;
  const siteDeploymentId=m.siteType&&deploymentMap.has(m.siteType)?m.siteType:null,siteDeployments=siteDeploymentsFor(m);
  const detail={id,bucket:b,koName:tr(id,"ko"),enName:tr(id,"en"),objective:m.objective??null,operationType:m.operationType??null,points:m.points??0,spawnZone:m.spawnZone??null,siteType:m.siteType??null,siteDeploymentId,siteDeployments,raceWeights:missionRaceWeights,scripts:scriptsDetailed,waves,missionWeights:weightedBuckets(m.missionWeights),spawnUfo:m.spawnUfo??null,retaliationOdds:m.retaliationOdds??null,sourceFiles:sourceHistory["type:"+id]||[],raw:m};
  (details[b]||={})[id]=detail;
  const raceCount=allRaceIds.length,deployIds=uniq([...siteDeployments.map(x=>x.id),...waves.flatMap(w=>Object.values(w.raceEffects).flatMap(x=>x.deploymentCandidates.map(c=>c.id)))].filter(Boolean)),maxSpeed=Math.max(0,...waves.map(w=>w.ufo.speedMax),...waves.flatMap(w=>Object.values(w.raceEffects).map(x=>x.effectiveSpeedMax)));
  const threat=threatProfile(waves,siteDeployments,allRaceIds);
  const search=[id,detail.koName,detail.enName,...allRaceIds.flatMap(x=>[x,tr(x,"ko"),tr(x,"en")]),...deployIds.flatMap(x=>[x,tr(x,"ko"),tr(x,"en")]),...threat.unitIds.flatMap(x=>[x,tr(x,"ko"),tr(x,"en")]),...waves.flatMap(w=>[w.ufoId,w.koName,w.enName,w.trajectoryId]),...upstreamPositive.flatMap(x=>[x,tr(x,"ko"),tr(x,"en")])].filter(Boolean).join(" ").toLowerCase();
  index.push({id,bucket:b,koName:detail.koName,enName:detail.enName,scriptCount:scriptsDetailed.length,waveTypeCount:waves.length,waveCount:waves.reduce((s,w)=>s+w.count,0),raceCount,deploymentCount:deployIds.length,maxSpeed,hasGround,hasHunter,eventLinkCount:upstreamPositive.length,siteType:detail.siteType,objective:detail.objective,searchText:search});
  const scriptDesc=scriptsDetailed.length?scriptsDetailed.slice(0,4).map(s=>{
    const odds=s.conditions?.executionOdds,first=s.conditions?.firstMonth,last=s.conditions?.lastMonth;
    const when=first!=null||last!=null?" · 월 "+(first??"제한없음")+"~"+(last??"제한없음"):"";
    return s.id+" (mission share "+pct(s.relativeShare)+(odds!=null?" · executionOdds "+fmt(odds)+"%":"")+when+")";
  }).join(" / ")+(scriptsDetailed.length>4?" 외 "+(scriptsDetailed.length-4)+"개":""):"직접 연결 missionScript 없음";
  const eventDesc=upstreamPositive.length?("이벤트 "+upstreamPositive.slice(0,4).map(x=>tr(x,"ko")).join(" · ")+(upstreamPositive.length>4?" 외 "+(upstreamPositive.length-4)+"개":"")+"의 직접 보상이 positive gate를 충족할 수 있습니다."):"이벤트 직접 보상에서 positive gate로 이어지는 경로는 자동 검출되지 않았습니다.";
  const waveDesc=waves.length?waves.map(w=>w.koName+" ×"+w.count+" (speedMax "+fmt(w.ufo.speedMax)+", "+w.trajectoryId+")").slice(0,4).join(" / "):"UFO wave 없음";
  const moveParts=waves.slice(0,5).map(w=>{
    const eff=Math.max(w.ufo.speedMax,...Object.values(w.raceEffects||{}).map(x=>x.effectiveSpeedMax));
    const moving=arr(w.trajectory?.waypoints).filter(x=>!x.isGround).map(x=>eff*x.speedPct/100);
    const min=moving.length?Math.min(...moving):0,max=moving.length?Math.max(...moving):0;
    return w.koName+": "+(moving.length?(fmt(min)+(min!==max?"~"+fmt(max):"")):"이동속도 없음")+(w.trajectory?.hasGround?" · 착륙 groundTimer "+fmt(w.trajectory.groundTimer):"");
  });
  const groundDesc=moveParts.join(" / ")+(hasGround?" . altitude 0은 지상 이동이 아니라 착륙 상태입니다.":" . altitude 0 착륙 구간은 없습니다.");
  const raceTop=missionRaceWeights.flatMap(g=>g.options.slice().sort((a,b)=>b.relativeShare-a.relativeShare).slice(0,2).map(x=>tr(x.id,"ko")+" "+Math.round(x.relativeShare*1000)/10+"%"));
  const raceDesc=missionRaceWeights.length?"raceWeights "+missionRaceWeights.length+"개 버킷. 대표 조건부 후보: "+raceTop.slice(0,6).join(" · ")+".":"alienMission 자체 raceWeights가 비어 있으며 missionScript override나 다른 게임 로직에서 종족이 정해질 수 있습니다.";
  const firstSite=siteDeployments[0],firstRace=allRaceIds[0],exampleRow=firstSite&&deploymentMap.get(firstSite.id)?.data?.find(r=>candidateWeights(raceMap.get(firstRace),num(r.alienRank),r.customUnitType).length);
  const exampleCandidate=exampleRow&&candidateWeights(raceMap.get(firstRace),num(exampleRow.alienRank),exampleRow.customUnitType)[0];
  const example=exampleCandidate?" 예: "+tr(firstRace,"ko")+" / rank "+exampleRow.alienRank+" → "+tr(exampleCandidate.id,"ko")+" (low "+num(exampleRow.lowQty)+", high "+num(exampleRow.highQty)+").":"";
  const terrainNote=siteDeployments.length>1?" 지형별 배치 "+siteDeployments.length+"개가 구분되며 지형에 따른 선택 비율은 이 룰로 확정할 수 없습니다.":"";
  const diffExample=firstSite&&support.deployments[firstSite.id]?.difficultyTotals;
  const diffNote=diffExample?" 난이도별 이 배치의 규칙상 총 인원: 초보·경험자 "+fmt(diffExample[0].min)+"~"+fmt(diffExample[0].max)+", 베테랑·천재 "+fmt(diffExample[2].min)+"~"+fmt(diffExample[2].max)+", 초인 "+fmt(diffExample[4].min)+"~"+fmt(diffExample[4].max)+". 실제 스폰 인원은 배치 가능 노드에 좌우됩니다.":"";
  const compDesc=deployIds.length?("교전 배치 후보 "+deployIds.length+"개: "+deployIds.slice(0,4).map(x=>tr(x,"ko")).join(" · ")+(deployIds.length>4?" 외 "+(deployIds.length-4)+"개":"")+". alienRank는 race의 같은 rank 슬롯과 매핑됩니다."+terrainNote+example+diffNote):"직접 연결 가능한 alienDeployment가 없습니다. race의 구성원 목록만으로 실제 전술 출현 수량이나 rank를 확정할 수 없습니다.";
  const sizeLow=threat.sizes.length?Math.min(...threat.sizes.map(x=>x.low)):null,sizeHigh=threat.sizes.length?Math.max(...threat.sizes.map(x=>x.high)):null;
  const weaponNames=threat.weaponIds.filter(x=>["weapon","melee","grenade","damage-item","psi"].includes(itemMap.get(x)?.kind)).slice(0,6).map(x=>tr(x,"ko"));
  const threatParts=[];
  if(sizeLow!=null)threatParts.push("각 배치 후보의 생성 시도량: 초보 최소 "+fmt(sizeLow)+"~초인 최대 "+fmt(sizeHigh)+" (지형·종족 대체 배치 합산 금지)");
  if(threat.maxHealth)threatParts.push("후보 유닛 최대 체력 "+fmt(threat.maxHealth));
  if(threat.maxArmor)threatParts.push("최대 장갑면 "+fmt(threat.maxArmor));
  if(threat.maxFiring)threatParts.push("최대 사격 "+fmt(threat.maxFiring));
  if(threat.maxReactions)threatParts.push("최대 반응 "+fmt(threat.maxReactions));
  if(threat.maxMelee)threatParts.push("최대 근접 "+fmt(threat.maxMelee));
  if(weaponNames.length)threatParts.push("대표 장비 "+weaponNames.join(" · "));
  if(hasHunter)threatParts.push("hunter-killer wave 포함");
  const gates=uniq(scriptsDetailed.flatMap(s=>Object.values(s.triggers||{}).flat().filter(x=>x.value===true).map(x=>x.koName||x.id))).slice(0,5);
  const actionParts=[];
  if(upstreamPositive.length)actionParts.push("먼저 이벤트 "+upstreamPositive.slice(0,3).map(x=>tr(x,"ko")).join(" · ")+" 보상이 현재 세이브에 들어왔는지 확인합니다.");
  if(gates.length)actionParts.push("missionScript true gate는 "+gates.join(" · ")+"입니다.");
  if(hasHunter)actionParts.push("hunter-killer wave가 있으므로 단순 착륙 미션보다 추적·요격 압박을 우선 고려해야 합니다.");
  if(hasGround)actionParts.push("착륙 waypoint가 있으므로 groundTimer 구간이 실제 교전 가능한 창인지 wave별로 확인합니다.");
  if(raceTop.length)actionParts.push("교전 예상은 현재 버킷 raceWeights에서 가장 높은 "+raceTop.slice(0,3).join(" · ")+"부터 좁히는 편이 빠릅니다.");
  if(!actionParts.length)actionParts.push("현재 작전은 직접 missionScript/event gate 연결이 적으므로 원본 호출 경로와 wave 자체를 먼저 확인해야 합니다.");
  const unresolved=waves.reduce((n,w)=>n+Object.values(w.raceEffects||{}).filter(x=>!x.deploymentCandidates.length&&!(siteDeployments.length&&w.ufoId==="dummy")).length,0);
  const cautionParts=["missionWeights "+scriptsDetailed.length+"개 연결, race 후보 "+raceCount+"종, deployment 후보 "+deployIds.length+"개"];
  if(unresolved)cautionParts.push("race별 deployment 미해결 "+unresolved+"건");
  if(!scriptsDetailed.length)cautionParts.push("missionScript 직접 선택 경로 미검출");
  if(upstreamPositive.length)cautionParts.push("이벤트 연결 "+upstreamPositive.length+"개는 gate 충족 경로이지 즉시 스폰 보장이 아님");
  cautionParts.push("가중치 share는 같은 bucket 안 조건부 비율이며 최종 절대 발생확률이 아님");
  cautionParts.push("raceWeights는 종족 선택 비율이지 개별 유닛 출현 비율이 아님");
  if(siteDeployments.some(x=>x.source==="alienDeployment.customUfo"))cautionParts.push("customUfo는 전술 배치 연결이며, 지형별 deployment를 동시에 전부 등장시키는 규칙이 아님");
  if(siteDeployments.some(x=>x.source.includes("(inferred)")))cautionParts.push("같은 ID/브리핑 제목으로 찾은 배치는 정적 구조상 후보이며 실제 런타임 호출을 확정하는 직접 필드는 아님");
  cautionParts.push("lowQty/highQty는 난이도 세 구간별 기준 수량이며 dQty와 extraQty는 각각 독립 정수 난수의 추가 수량임");
  cautionParts.push("난이도별 인원은 스폰 시도량의 범위이며 스폰 노드 부족 시 실제 적 유닛 수는 감소할 수 있음");
  cautionParts.push("itemSets는 월별 장비 테크 레벨의 세트이지 난이도별 선택지 또는 세트 간 균등 랜덤확률 목록이 아님");
  (editorials[b]||={})[id]={
    overview:expanded(topic(detail.koName)+" alienMission 단위의 적 작전/부대 생성 규칙입니다. "+waveDesc+".","wave·UFO·종족·교전 배치를 함께 봐야 실제 적부대의 의미가 드러납니다."),
    spawn:expanded("생성 후보 경로: "+scriptDesc+". "+eventDesc,"missionScript의 조건과 가중치를 실제 생성 원인으로 봐야 합니다."),
    movement:expanded(detail.koName+" 이동: "+groundDesc.replace(" .","."),"UFO speedMax와 trajectory speed%를 분리해서 봐야 실제 이동속도를 계산할 수 있습니다."),
    encounter:expanded(raceDesc+" "+compDesc,"raceWeights와 alienDeployment의 역할을 섞지 않는 것이 중요합니다."),
    threat:expanded(threatParts.length?threatParts.join(" · ")+".":topic(detail.koName)+" 정적 deployment 매핑이 부족해 병력·스탯·무장 위협을 완전 계산할 수 없습니다. "+(raceTop.length?"race 후보는 "+raceTop.slice(0,4).join(" · ")+". ":"")+(detail.siteType?"siteType "+detail.siteType+"를 별도 확인해야 합니다.":"동적/사이트 호출 경로를 별도 확인해야 합니다."),"단순 UFO 이름만으로 전투 난도를 판단하면 오차가 큽니다."),
    action:expanded(actionParts.join(" "),"현재 세이브의 월·연구·아이템 조건을 먼저 대조하면 등장 가능성을 빠르게 좁힐 수 있습니다."),
    caution:expanded(cautionParts.join(". ")+".","가중치와 파생 확률은 조건부 값으로 읽어야 합니다.")
  };
}
index.sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));
for(const e of Object.values(eventForceLinks)){
  const dedupe=xs=>{const m=new Map();for(const x of xs){const k=[x.eventId,x.triggerKind,x.triggerId,x.missionId,x.bucket].join("|");if(!m.has(k))m.set(k,x)}return[...m.values()]};
  e.enables=dedupe(e.enables);e.blocks=dedupe(e.blocks);
}
const deploymentSurfaces=Object.values(support.deployments).filter(d=>d.alertId||d.alertDescriptionId||d.markerNameId||d.briefing?.titleId||d.briefing?.descId).map(d=>({
  kind:"deployment",id:d.id,koName:d.koName,enName:d.enName,
  alertName:d.alertName,markerName:d.markerName,briefingTitle:d.briefing?.title||null,briefingDesc:d.briefing?.desc||null,
  customUfo:d.customUfo,race:d.race,width:d.width,length:d.length,height:d.height,
  searchText:[d.id,d.koName,d.enName,d.alertId,d.alertName,d.alertDescriptionId,d.alertDescription,d.markerNameId,d.markerName,d.briefing?.titleId,d.briefing?.title,d.briefing?.descId,d.briefing?.desc,d.customUfo].filter(Boolean).join(" ").toLowerCase()
}));
const missionSurfaces=index.map(x=>({kind:"mission",id:x.id,koName:x.koName,enName:x.enName,scriptCount:x.scriptCount,waveCount:x.waveCount,raceCount:x.raceCount,hasGround:x.hasGround,hasHunter:x.hasHunter,searchText:x.searchText}));
const eventSurfaces=[...missionSurfaces,...deploymentSurfaces];
const counts={missions:index.length,waves:totalWaves,ufos:ufos.length,trajectories:trajectories.length,races:races.length,units:units.length,deployments:deployments.length,groundMissions:groundMissionCount,hunterMissions:hunterMissionCount,eventLinkedMissions:eventLinkedCount,eventSurfaceMissions:missionSurfaces.length,eventSurfaceDeployments:deploymentSurfaces.length};
gzipJson(path.join(outDir,"enemy-forces-index.json.gz"),{meta:{version:1,generator:"enemy-force-data-v1",compression:"gzip",sourceVersion:"XPiratez v.o1.1.1"},counts,index});
gzipJson(path.join(outDir,"event-surfaces-index.json.gz"),{meta:{version:1,generator:"event-surface-index-v1",compression:"gzip"},counts:{missions:missionSurfaces.length,deployments:deploymentSurfaces.length,total:eventSurfaces.length},index:eventSurfaces});
for(const [b,ds] of Object.entries(details))gzipJson(path.join(outDir,"enemy-force-chunks",b+".json.gz"),{details:ds});
for(const [b,ds] of Object.entries(editorials))gzipJson(path.join(outDir,"enemy-force-editorial-chunks",b+".json.gz"),{details:ds});
gzipJson(path.join(outDir,"enemy-force-support.json.gz"),support);
gzipJson(path.join(outDir,"event-force-links.json.gz"),eventForceLinks);
console.log(JSON.stringify({...counts,eventLinks:Object.keys(eventForceLinks).length}));
