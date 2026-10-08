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
  for(const w of d.waves||[]){
    if(w.trajectory)for(const p of w.trajectory.waypoints||[])assert(close(p.baseEffectiveSpeed,w.ufo.speedMax*p.speedPct/100),"Trajectory speed mismatch "+row.id+" wave "+w.index);
    for(const x of Object.values(w.raceEffects||{}))assert(close(x.effectiveSpeedMax,x.speedMaxBase+x.speedMaxRaceBonus),"Race speed bonus mismatch "+row.id+" "+x.raceId);
  }
}
for(const race of Object.values(support.races||{}))for(const rank of race.ranks||[]){
  if(!(rank.candidates||[]).length)continue;
  const s=rank.candidates.reduce((n,x)=>n+Number(x.probability||0),0);assert(close(s,1),"membersRandom probability mismatch "+race.id+" rank "+rank.rank);
}
for(const dep of Object.values(support.deployments||{}))for(const r of dep.data||[]){
  assert(Number.isFinite(r.alienRank)&&r.lowQty>=0&&r.highQty>=0&&r.dQty>=0,"Invalid deployment qty "+dep.id);
  for(const set of r.itemSets||[])assert(Array.isArray(set.items),"Bad item set "+dep.id);
}
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
if(fs.existsSync(appPath)){const app=fs.readFileSync(appPath,"utf8");assert(app.includes("deploymentMarkup")&&app.includes("trajectoryMarkup")&&app.includes("openDeploymentDetail")&&app.includes("#deployment="),"Enemy force frontend detail mapping missing")}
if(fs.existsSync(eventAppPath)){const app=fs.readFileSync(eventAppPath,"utf8");assert(app.includes("event-force-links.json.gz")&&app.includes("../forces/#force="),"Event -> enemy force frontend reverse link missing")}
const bytes=files.reduce((s,p)=>s+fs.statSync(path.join(dataDir,p)).size,0);
assert(bytes<4*1024*1024,"Enemy force DB gzip bloat regression "+(bytes/1048576).toFixed(1)+" MiB");
console.log("OK enemy force DB: "+rows.length+" missions, "+db.counts.waves+" waves, "+db.counts.ufos+" UFOs, "+db.counts.races+" races, "+db.counts.units+" units, "+db.counts.deployments+" deployments, "+db.counts.eventLinkedMissions+" event-linked, "+(bytes/1048576).toFixed(1)+" MiB");
