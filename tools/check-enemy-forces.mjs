import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args=process.argv.slice(2),i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const readGz=(...p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dataDir,...p))));
const db=readGz("enemy-forces-index.json.gz"),support=readGz("enemy-force-support.json.gz"),eventLinks=readGz("event-force-links.json.gz"),surfaceDb=readGz("event-surfaces-index.json.gz");
const rows=db.index||[],forceCache={},editorialCache={};
function force(row){forceCache[row.bucket]??=readGz("enemy-force-chunks",row.bucket+".json.gz").details;return forceCache[row.bucket][row.id]}
function editorial(row){editorialCache[row.bucket]??=readGz("enemy-force-editorial-chunks",row.bucket+".json.gz").details;return editorialCache[row.bucket][row.id]}
function assert(v,msg){if(!v)throw new Error(msg)}
function close(a,b,eps=1e-8){return Math.abs(Number(a)-Number(b))<=eps*Math.max(1,Math.abs(Number(a)),Math.abs(Number(b)))}
assert(rows.length===339,"Expected 339 enemy missions, got "+rows.length);
assert(db.counts.waves===723,"Wave count regression");
assert(db.counts.races===129&&db.counts.units===435&&db.counts.deployments===489,"Support count regression");
assert(db.counts.eventLinkedMissions>=80,"Event-linked force coverage regression");
assert(support.meta.version>=2&&support.meta.difficultyLevels?.length===5,"Difficulty level metadata missing");
assert(JSON.stringify(support.meta.difficultyMechanics.difficultyCoefficient)===JSON.stringify([-2,0,1,3,7]),"XPiratez difficulty coefficient regression");
assert(JSON.stringify(support.meta.difficultyMechanics.aimAndArmorMultipliers)===JSON.stringify([0.75,1,1,1,1]),"XPiratez aim/armor coefficient regression");
assert(support.meta.difficultyMechanics.statGrowthMultipliers.tu===7&&support.meta.difficultyMechanics.statGrowthMultipliers.health===3,"XPiratez stat growth regression");
assert(surfaceDb.counts?.missions===339,"Event surface mission count regression");
assert(surfaceDb.counts?.deployments===286,"Event surface deployment count regression");
assert(surfaceDb.counts?.total===625,"Event surface total count regression");
assert(surfaceDb.index.some(x=>x.kind==="deployment"&&x.id==="STR_LOC_ACADEMY_OUTPOST_TEMPERATE"&&x.searchText.includes("과학 실험")),"Scientific Experiments deployment surface regression");
assert(surfaceDb.index.some(x=>x.kind==="deployment"&&x.alertName&&x.briefingDesc),"Alert/briefing deployment surface regression");
for(const row of rows){
  const d=force(row),e=editorial(row);assert(d?.id===row.id,"Missing force detail "+row.id);assert(e,"Missing force editorial "+row.id);
  for(const k of ["overview","spawn","movement","encounter","threat","action","caution"])assert(typeof e[k]==="string"&&e[k].length>=55,"Weak force editorial "+row.id+" "+k);
  for(const group of d.raceWeights||[]){const s=(group.options||[]).reduce((n,x)=>n+Number(x.relativeShare||0),0);assert(close(s,1),"Race weight shares do not sum to 1 "+row.id+" "+group.bucket)}
  for(const s of d.scripts||[]){
    if(s.totalWeight>0)assert(close(s.relativeShare,s.weight/s.totalWeight),"Mission share mismatch "+row.id+" "+s.id);
    for(const g of s.raceWeightsOverride||[]){const sum=(g.options||[]).reduce((n,x)=>n+Number(x.relativeShare||0),0);assert(close(sum,1),"Script race shares do not sum to 1 "+row.id+" "+s.id)}
  }
  for(const site of d.siteDeployments||[]){
    const dep=support.deployments[site.id];assert(dep,"Unresolved site deployment "+row.id+" "+site.id);
    if(site.source==="alienDeployment.customUfo")assert(dep.customUfo===row.id,"Bad customUfo site reverse link "+site.id+" -> "+row.id);
    if(site.source==="alienMission.siteType")assert(d.siteType===site.id,"Bad siteType reverse link "+row.id);
  }
  for(const w of d.waves||[]){
    if(w.trajectory)for(const p of w.trajectory.waypoints||[])assert(close(p.baseEffectiveSpeed,w.ufo.speedMax*p.speedPct/100),"Trajectory speed mismatch "+row.id+" wave "+w.index);
    for(const x of Object.values(w.raceEffects||{})){
      assert(close(x.effectiveSpeedMax,x.speedMaxBase+x.speedMaxRaceBonus),"Race speed bonus mismatch "+row.id+" "+x.raceId);
      for(const dep of x.deploymentCandidates||[]){
        assert(support.deployments[dep.id],"Missing wave deployment "+row.id+" "+dep.id);
        if(dep.source==="alienDeployment.customUfo")assert(support.deployments[dep.id].customUfo===w.ufoId,"Invalid customUfo wave link "+row.id+" "+dep.id);
      }
    }
  }
}
for(const race of Object.values(support.races||{}))for(const rank of race.ranks||[]){
  if(!(rank.candidates||[]).length)continue;
  const s=rank.candidates.reduce((n,x)=>n+Number(x.probability||0),0);assert(close(s,1),"membersRandom probability mismatch "+race.id+" rank "+rank.rank);
}
let checkedDifficultyRows=0;
for(const dep of Object.values(support.deployments||{})){
  assert(dep.difficultyTotals?.length===5,"Missing deployment difficulty totals: "+dep.id);
  for(const r of dep.data||[]){
    checkedDifficultyRows++;
    assert(Number.isFinite(r.alienRank)&&r.lowQty>=0&&r.highQty>=0&&r.dQty>=0&&r.extraQty>=0,"Invalid deployment qty "+dep.id);
    assert(r.difficultyQty?.length===5,"Missing rank difficulty distribution "+dep.id+" rank "+r.alienRank);
    for(let diff=0;diff<5;diff++){
      const q=r.difficultyQty[diff],base=diff<2?r.lowQty:diff<4?r.lowQty+Math.trunc((r.highQty-r.lowQty)/2):r.highQty;
      assert(q.difficulty===diff&&q.min===base&&q.max===base+r.dQty+r.extraQty&&close(q.average,(q.min+q.max)/2),"Engine difficulty formula mismatch "+dep.id+" rank "+r.alienRank+" diff "+diff);
      assert(q.min>=0&&q.max>=q.min,"Negative difficulty quantity "+dep.id+" rank "+r.alienRank+" diff "+diff);
    }
    for(const set of r.itemSets||[])assert(Array.isArray(set.items),"Bad item set "+dep.id);
  }
  for(let diff=0;diff<5;diff++){
    const t=dep.difficultyTotals[diff],r=dep.data||[];
    assert(t.difficulty===diff&&t.min===r.reduce((s,x)=>s+x.difficultyQty[diff].min,0)&&t.max===r.reduce((s,x)=>s+x.difficultyQty[diff].max,0)&&close(t.average,r.reduce((s,x)=>s+x.difficultyQty[diff].average,0)),"Deployment difficulty totals mismatch "+dep.id+" diff "+diff);
  }
}
assert(checkedDifficultyRows>1500,"Insufficient rank difficulty coverage");
let checkedDifficultyUnits=0;
const statKeys=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const mechanics=support.meta.difficultyMechanics;
for(const unit of Object.values(support.units||{})){
  if(unit.missing)continue;
  checkedDifficultyUnits++;
  assert(unit.difficultyProfiles?.length===5,"Missing difficulty-adjusted unit stats "+unit.id);
  for(let diff=0;diff<5;diff++){
    const p=unit.difficultyProfiles[diff],coeff=mechanics.difficultyCoefficient[diff],aim=mechanics.aimAndArmorMultipliers[diff];
    assert(p.difficulty===diff,"Incorrect difficulty unit index "+unit.id);
    for(const key of statKeys){
      if(unit.stats?.[key]==null&&unit.armorStatBonuses?.[key]==null)continue;
      const base=Number(unit.stats?.[key]||0)+Number(unit.armorStatBonuses?.[key]||0);
      const grown=key==="mana"?base:base+Math.trunc(base*coeff*Number(mechanics.statGrowthMultipliers[key]||0)/100);
      const expected=key==="firing"?Math.trunc(grown*aim):grown;
      assert(close(p.stats[key],expected),"Unit difficulty stat mismatch "+unit.id+" "+key+" diff "+diff);
    }
    for(const side of ["front","left","right","rear","under"]){
      assert(p.armor[side]===Math.trunc(Number(unit.armor?.[side]||0)*aim),"Unit difficulty armor mismatch "+unit.id+" "+side+" diff "+diff);
    }
  }
}
assert(checkedDifficultyUnits===435,"Difficulty-adjusted enemy stat coverage regression");
// Ensure every explicit deployment.customUfo → alienMission reference is published.
const missionIds=new Set(rows.map(r=>r.id));
let customUfoSiteCount=0,sameIdSiteCount=0,briefingSiteCount=0;
for(const dep of Object.values(support.deployments||{})){
  if(missionIds.has(dep.customUfo)){
    customUfoSiteCount++;
    const linked=getRawMission(dep.customUfo);
    assert(linked.siteDeployments?.some(x=>x.id===dep.id&&x.source==="alienDeployment.customUfo"),"Missing customUfo site "+dep.id);
  }
  if(missionIds.has(dep.id)&&getRawMission(dep.id).objective===3){
    sameIdSiteCount++;
    assert(getRawMission(dep.id).siteDeployments?.some(x=>x.id===dep.id),"Missing same-ID mission deployment "+dep.id);
  }
  if(dep.briefingTitle&&missionIds.has(dep.briefingTitle)&&getRawMission(dep.briefingTitle).objective===3&&dep.id.startsWith(dep.briefingTitle+"_")&&(!dep.customUfo||dep.customUfo===dep.briefingTitle)){
    briefingSiteCount++;
    assert(getRawMission(dep.briefingTitle).siteDeployments?.some(x=>x.id===dep.id),"Missing biome/title site "+dep.id);
  }
}
assert(customUfoSiteCount>=4&&sameIdSiteCount>=20&&briefingSiteCount>=3,"Unexpected customUfo/sameID/briefing site coverage");
function getRawMission(id){const row=rows.find(x=>x.id===id);return row&&force(row)}

function get(id){const row=rows.find(x=>x.id===id);assert(row,"Missing force "+id);return{row,d:force(row),e:editorial(row)}}
{
  const {d}=get("STR_MISSION_NINJA_ESTABLISH_BASE");
  assert(d.scripts.some(s=>s.id==="ninjaAirfieldNormal"&&s.conditions.executionOdds===10),"Ninja airfield script regression");
  const s=d.scripts.find(s=>s.id==="ninjaAirfieldNormal");
  assert(s.upstreamEvents.positive.some(x=>x.eventId==="STR_JACKS_WARNING"&&x.triggerId==="STR_NINJA_HIDEOUTS"),"Event -> ninja force chain regression");
  const castle=d.waves.find(w=>w.ufoId==="STR_VESSEL_NIN_CASTLE"),transport=d.waves.find(w=>w.ufoId==="STR_VESSEL_NIN_2");
  assert(castle?.ufo.speedMax===75&&castle.hunterKillerPercentage===100,"Ninja mobile fortress speed/hunter regression");
  assert(transport?.ufo.speedMax===3200&&transport.trajectory.waypoints.some(x=>x.baseEffectiveSpeed===1600),"Ninja transport trajectory regression");
  assert(castle.raceEffects.STR_NINJA?.deploymentId==="STR_VESSEL_NIN_CASTLE","Ninja deployment mapping regression");
}
{
  const {d}=get("STR_GOVT_CORRUPTION");
  const b0=d.raceWeights.find(x=>x.bucket==="0");assert(b0&&close(b0.options.find(x=>x.id==="STR_CHINA")?.relativeShare,0.2),"Govt race probability regression");
  const w=d.waves[0];assert(w.ufo.speedMax===2500&&w.trajectory.waypoints.some(x=>x.speedPct===20&&x.baseEffectiveSpeed===500),"Govt movement regression");
  assert(w.raceEffects.STR_CHINA?.deploymentId==="STR_VESSEL_GOVSHIP_ASSAULT_CHINA","Race-specific deployment regression");
  const dep=support.deployments.STR_VESSEL_GOVSHIP_ASSAULT_CHINA;assert(dep?.data?.[0]?.alienRank===5&&dep.data[0].lowQty===15&&dep.data[0].highQty===25&&dep.data[0].dQty===5,"Govt deployment quantity regression");
  const race=support.races.STR_CHINA,unitId=race.ranks[5].candidates[0]?.id;assert(unitId&&support.units[unitId]?.stats,"Enemy unit stats regression");
  assert(dep.data[0].itemSets[0].items.some(x=>x.id==="STR_RIFLE_SA80"),"Enemy loadout regression");
}
{
  const {d}=get("STR_LOC_ACADEMY_CRUISE");
  assert(d.siteDeployments.some(x=>x.id===d.id&&x.source.includes("(inferred)")),"Missing inferred same-ID Academy Cruise deployment");
  const town=get("STR_LOC_ACADEMY_TOWN").d;
  assert(town.siteDeployments.some(x=>x.id==="STR_LOC_ACADEMY_TOWN_TEMPERATE"&&x.source.includes("briefing.title")),"Missing Academy Town terrain/briefing mapping");
}
{
  // Scientific Experiments: academy 90% is a race roll, not an individual unit chance.
  const {d,e,row}=get("STR_LOC_ACADEMY_OUTPOST");
  const b0=d.raceWeights.find(x=>x.bucket==="0");
  assert(close(b0?.options.find(x=>x.id==="STR_SECTOID_NONCOM")?.relativeShare,0.9),"Scientific Experiments academy chance regression");
  assert(close(b0?.options.find(x=>x.id==="STR_ZOMBIE")?.relativeShare,0.1),"Scientific Experiments zombie chance regression");
  const expected=["TEMPERATE","JUNGLE","COLD","DESERT"].map(s=>"STR_LOC_ACADEMY_OUTPOST_"+s);
  assert(d.siteDeploymentId===null&&d.siteDeployments.length===4,"Scientific Experiments needs all four customUfo biomes");
  for(const id of expected)assert(d.siteDeployments.some(x=>x.id===id&&x.source==="alienDeployment.customUfo"),"Missing scientific biome "+id);
  const academy=support.races.STR_SECTOID_NONCOM;
  assert(academy.ranks.find(x=>x.rank===7)?.candidates[0]?.id==="STR_ADRONE_TERRORIST","Academy rank 7 must be drone");
  assert(academy.ranks.find(x=>x.rank===8)?.candidates[0]?.id==="STR_OSIRON_LAD","Academy rank 8 must be Osiron Yeoman");
  const temp=support.deployments.STR_LOC_ACADEMY_OUTPOST_TEMPERATE;
  assert(temp.customUfo===d.id&&temp.terrains.includes("FOREST"),"Temperate site terrain/customUfo missing");
  assert(temp.data.find(r=>r.alienRank===7)?.lowQty===1&&temp.data.find(r=>r.alienRank===7)?.highQty===2,"Academy drone quantities missing");
  const rank8=temp.data.find(r=>r.alienRank===8);
  assert(rank8?.lowQty===1&&rank8.highQty===4&&rank8.itemSets[0].items.some(x=>x.id==="STR_HARPOON"),"Academy rank8 equipment missing");
  assert(JSON.stringify(temp.difficultyTotals.map(x=>[x.min,x.max]))===JSON.stringify([[6,8],[6,8],[9,11],[9,11],[15,17]]),"Scientific Experiments difficulty 6-8 / 9-11 / 15-17 regression");
  assert(temp.data.find(x=>x.alienRank===9).difficultyQty[4].max===4,"Difficulty random dQty edge regression");
  assert(row.deploymentCount>=4&&e.encounter.includes("rank 7")&&row.searchText.includes("str_adrone_terrorist"),"Scientific site index/insight/unit search missing");
}
{
  const links=eventLinks.STR_JACKS_WARNING;assert(links?.enables?.some(x=>x.missionId==="STR_MISSION_NINJA_ESTABLISH_BASE"),"Event force reverse link regression");
}
const files=[
  "enemy-forces-index.json.gz","enemy-force-support.json.gz","event-force-links.json.gz","event-surfaces-index.json.gz",
  ...fs.readdirSync(path.join(dataDir,"enemy-force-chunks")).map(x=>"enemy-force-chunks/"+x),
  ...fs.readdirSync(path.join(dataDir,"enemy-force-editorial-chunks")).map(x=>"enemy-force-editorial-chunks/"+x)
];
const textByField={};for(const f of ["overview","spawn","movement","encounter","threat","action","caution"]){const m=new Map();for(const row of rows){const t=editorial(row)[f];m.set(t,(m.get(t)||0)+1)}textByField[f]={unique:m.size,maxRepeat:Math.max(...m.values())}}
assert(textByField.spawn.unique>250,"Enemy force spawn insight diversity regression");
assert(textByField.action.unique>220,"Enemy force action insight diversity regression");
assert(textByField.caution.unique>90,"Enemy force caution insight diversity regression");
assert(textByField.overview.maxRepeat<40,"Enemy force overview repetition regression");
const appPath=path.resolve("public/forces/app.js"),eventAppPath=path.resolve("public/events/app.js");
if(fs.existsSync(appPath)){const app=fs.readFileSync(appPath,"utf8");for(const snippet of ["deploymentMarkup","trajectoryMarkup","siteDeployments","unresolvedRosterMarkup","openDeploymentDetail","#deployment=","detailDifficultyControlMarkup","difficultySummaryMarkup"])assert(app.includes(snippet),"Enemy force frontend feature missing: "+snippet)}
if(fs.existsSync(eventAppPath)){const app=fs.readFileSync(eventAppPath,"utf8");assert(app.includes("event-force-links.json.gz")&&app.includes("../forces/#force="),"Event -> enemy force frontend reverse link missing")}
const bytes=files.reduce((s,p)=>s+fs.statSync(path.join(dataDir,p)).size,0);
assert(bytes<4*1024*1024,"Enemy force DB gzip bloat regression "+(bytes/1048576).toFixed(1)+" MiB");
console.log("OK enemy force DB: "+rows.length+" missions, "+db.counts.waves+" waves, "+db.counts.ufos+" UFOs, "+db.counts.races+" races, "+db.counts.units+" units, "+db.counts.deployments+" deployments, "+customUfoSiteCount+" customUfo, "+sameIdSiteCount+" same-ID, "+briefingSiteCount+" title-prefix site links, "+checkedDifficultyRows+" difficulty-checked rank rows, "+checkedDifficultyUnits+" difficulty-checked unit stats, "+db.counts.eventLinkedMissions+" event-linked, "+(bytes/1048576).toFixed(1)+" MiB");
