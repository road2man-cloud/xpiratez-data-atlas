import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args=process.argv.slice(2),i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const readGz=(...p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dataDir,...p))).toString("utf8"));
const db=readGz("events-index.json.gz"),rows=db.index||[];
const surfaceDb=fs.existsSync(path.join(dataDir,"event-surfaces-index.json.gz"))?readGz("event-surfaces-index.json.gz"):{index:[],counts:{}};
const detailCache={},editorialCache={};
function detail(x){detailCache[x.bucket]??=readGz("event-chunks",x.bucket+".json.gz").details;return detailCache[x.bucket][x.id]}
function editorial(x){editorialCache[x.bucket]??=readGz("event-editorial-chunks",x.bucket+".json.gz").details;return editorialCache[x.bucket][x.id]}
function assert(v,msg){if(!v)throw new Error(msg)}
function get(id){const x=rows.find(y=>y.id===id);assert(x,"Missing event "+id);return{x,d:detail(x),e:editorial(x)}}

assert(rows.length===792,"Expected 792 events, got "+rows.length);
assert(new Set(rows.map(x=>x.id)).size===rows.length,"Duplicate event ids");
assert(db.counts?.scripts===643,"Expected 643 event scripts");
assert(db.counts?.withScripts===792&&db.counts?.withoutScripts===0,"Event script coverage regression");
assert(db.counts?.researchRewards===269,"Research reward event count regression");
assert(db.counts?.itemRewards===368,"Item reward event count regression");
assert(db.counts?.randomRewards===45,"Random reward event count regression");
assert(db.counts?.recruitment===9,"Recruitment event count regression");
assert(db.counts?.boundedWindow===85,"Bounded event window count regression");
assert(db.counts?.chance===592,"Conditional chance event count regression");
assert(db.counts?.negativeGate===306,"Negative gate event count regression");
assert(!rows.some(x=>x.id==="STR_LOC_ACADEMY_OUTPOST"),"Scientific Experiments must not be misclassified as an events: row");
const scienceMission=(surfaceDb.index||[]).find(x=>x.kind==="mission"&&x.id==="STR_LOC_ACADEMY_OUTPOST");
assert(scienceMission?.koName==="과학 실험","Scientific Experiments alienMission missing from cross-search index");
assert(scienceMission.searchText.includes("과학 실험"),"Scientific Experiments mission search text regression");
const scienceVariants=(surfaceDb.index||[]).filter(x=>x.kind==="deployment"&&x.searchText.includes("과학 실험"));
assert(scienceVariants.length>=4,"Scientific Experiments regional deployment surfaces missing");
assert(scienceVariants.some(x=>x.id==="STR_LOC_ACADEMY_OUTPOST_JUNGLE"&&x.koName.includes("정글")),"Scientific Experiments jungle deployment surface regression");
assert(surfaceDb.counts?.deployments>=280,"Event-like deployment surface coverage regression");

const editorialFields=["overview","trigger","result","value","action","missRisk","verification"];
for(const x of rows){
  const d=detail(x),e=editorial(x);
  assert(d?.id===x.id,"Missing event detail "+x.id);
  assert(e,"Missing event editorial "+x.id);
  assert(Array.isArray(d.scripts)&&Array.isArray(d.roles),"Bad event arrays "+x.id);
  assert(d.primaryRole===x.primaryRole,"Primary role mismatch "+x.id);
  assert(Array.isArray(d.triggerSummary?.kinds),"Missing trigger summary "+x.id);
  assert(Array.isArray(d.effects?.researchRewards)&&Array.isArray(d.effects?.guaranteedItems),"Bad event effects "+x.id);
  for(const k of editorialFields){
    assert(typeof e[k]==="string"&&e[k].length>=45,"Weak event editorial "+x.id+" "+k);
    assert(!/\b(?:undefined|null|NaN)\b/.test(e[k]),"Invalid event editorial token "+x.id+" "+k);
  }
}

{
  const {d,e}=get("STR_CBT_TOURNAMENT_CHALLENGER_NINJA");
  assert(d.primaryRole==="research-grant","Ninja challenger role regression");
  assert(d.effects.researchRewards.some(x=>x.id==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA"),"Ninja challenger research reward regression");
  const s=d.scripts.find(x=>x.id==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA");
  assert(s?.conditions?.executionOdds===50,"Ninja challenger odds regression");
  const rt=s.triggerMaps?.researchTriggers||[],ft=s.triggerMaps?.facilityTriggers||[];
  assert(rt.some(x=>x.id==="STR_DUMBASS_CBT_CHAMPION"&&x.value===true),"Ninja challenger champion gate regression");
  assert(rt.some(x=>x.id==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA"&&x.value===false),"Ninja challenger false research gate regression");
  assert(ft.some(x=>x.id==="STR_VIP_CLUB_FAC"&&x.value===true)&&ft.some(x=>x.id==="STR_LUXURY_SPA"&&x.value===true),"Ninja challenger facility gate regression");
  assert(e.trigger.includes("50")&&e.missRisk.length>=45,"Ninja challenger editorial regression");
}
{
  const {d}=get("STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT");
  const s=d.scripts.find(x=>x.id==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT");
  assert(s?.conditions?.executionOdds===100,"Ninja defeat odds regression");
  const rt=s.triggerMaps?.researchTriggers||[],ft=s.triggerMaps?.facilityTriggers||[];
  assert(rt.some(x=>x.id==="STR_SUPER_SEXY_MARTIAL_DANCE"&&x.value===true),"Ninja defeat dance gate regression");
  assert(rt.some(x=>x.id==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA"&&x.value===true),"Ninja defeat challenger gate regression");
  assert(rt.some(x=>x.id==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT"&&x.value===false),"Ninja defeat false self gate regression");
  assert(ft.some(x=>x.id==="STR_VIP_CLUB_FAC"&&x.value===true)&&ft.some(x=>x.id==="STR_LUXURY_SPA"&&x.value===true),"Ninja defeat facility gate regression");
}
{
  const {d,e}=get("STR_START_LOCATION_EVENT_MEDUSA");
  assert(d.primaryRole==="starting","Medusa starting-event role regression");
  assert(d.effects.spawnedPersonType==="STR_SOLDIER_LAMIA"&&d.effects.spawnedPersons===4,"Medusa recruit regression");
  assert(d.effects.researchRewards.some(x=>x.id==="STR_LAMIA_BRONZE_ARMOR"),"Medusa research reward regression");
  assert(d.effects.guaranteedItems.some(x=>x.id==="STR_CUTLASS"&&x.qty===2),"Medusa cutlass reward regression");
  assert(d.effects.guaranteedItems.some(x=>x.id==="STR_BARBARIAN_AX"&&x.qty===2),"Medusa axe reward regression");
  const s=d.scripts.find(x=>x.id==="STR_START_LOCATION_EVENT_MEDUSA");
  assert(s?.conditions?.firstMonth===0&&s?.conditions?.lastMonth===0&&s?.conditions?.executionOdds===100,"Medusa timing regression");
  assert((s.triggerMaps?.xcomBaseInRegionTriggers||[]).some(x=>x.id==="STR_CENTRAL_ASIA"&&x.value===true),"Medusa region trigger regression");
  assert(e.value.includes("병사")||e.value.includes("인원"),"Medusa editorial value regression");
}
{
  const {d}=get("STR_START_COUNTRY_AUSTRALIA_EVENT");
  assert(d.effects.funds===-75000,"Australia starting funds regression");
  assert(d.effects.researchRewards.some(x=>x.id==="STR_AUSTRALIA"),"Australia starting research regression");
  const s=d.scripts.find(x=>x.id==="STR_START_COUNTRY_AUSTRALIA_EVENT");
  assert((s?.triggerMaps?.xcomBaseInCountryTriggers||[]).some(x=>x.id==="STR_AUSTRALIA"&&x.value===true),"Australia country trigger regression");
}

const editorialTexts=rows.flatMap(x=>Object.values(editorial(x)));
const exactCounts=new Map();for(const t of editorialTexts)exactCounts.set(t,(exactCounts.get(t)||0)+1);
const maxRepeat=Math.max(...exactCounts.values());
assert(maxRepeat<500,"Event editorial repetition regression: "+maxRepeat);
const bytes=fs.readdirSync(path.join(dataDir,"event-chunks")).reduce((s,f)=>s+fs.statSync(path.join(dataDir,"event-chunks",f)).size,0)+
  fs.readdirSync(path.join(dataDir,"event-editorial-chunks")).reduce((s,f)=>s+fs.statSync(path.join(dataDir,"event-editorial-chunks",f)).size,0)+
  fs.statSync(path.join(dataDir,"events-index.json.gz")).size;
assert(bytes<2*1024*1024,"Event DB gzip bloat regression");
assert(db.compression==="gzip","Event DB compression metadata missing");
const eventApp=path.resolve("public/events/app.js"),eventHtml=path.resolve("public/events/index.html");
if(fs.existsSync(eventApp)){const s=fs.readFileSync(eventApp,"utf8");assert(s.includes("event-surfaces-index.json.gz")&&s.includes("renderMissionSurface")&&s.includes("../forces/#force=")&&s.includes("../forces/#deployment="),"Event cross-search frontend regression")}
if(fs.existsSync(eventHtml)){const s=fs.readFileSync(eventHtml,"utf8");assert(s.includes("missionSurface")&&s.includes("이벤트형 미션"),"Event mission-surface UI regression")}
console.log(`OK event DB: ${rows.length} events, ${db.counts.scripts} scripts, ${db.counts.researchRewards} research rewards, ${db.counts.itemRewards} item rewards, ${db.counts.boundedWindow} bounded windows, ${db.counts.negativeGate} negative gates, ${(bytes/1048576).toFixed(1)} MiB`);
