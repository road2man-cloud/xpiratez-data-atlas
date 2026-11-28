// Narrow raw-source compiler for the early GDX bridge. All source bytes
// must match the installed v.o2 metadata. No arbitrary inventory grants.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(dir);
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),sha=b=>createHash("sha256").update(b).digest("hex");
const wanted=new Set(["alienMissions","alienDeployments","alienRaces","missionScripts","units","items","armors","facilities","events","eventScripts"]),defs=new Map(),levels=[];
for(const {file,sha256} of data.meta.source.rules){
 const b=fs.readFileSync(path.join(dir,file));assert.equal(sha(b),sha256,file);
 const a=b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);
 function slice(i,j){const lines=a.slice(i,j);return {lines,anchor:{file,sha256,startLine:i+1,endLine:j,blockSha256:sha(lines.join("\n"))}};}
 let sec="";
 for(let i=0;i<a.length;i++){
  const t=a[i].match(/^([A-Za-z][A-Za-z0-9_]*):/);if(t)sec=t[1];
  if(a[i]==="alienItemLevels:"){let j=i+1;while(j<a.length&&/^  - \[/.test(a[j]))j++;levels.push(slice(i,j));}
  const m=a[i].match(/^  - (?:id|type|name): (\w+)\s*(?:#.*)?$/);if(!m||!wanted.has(sec))continue;
  let j=i+1;while(j<a.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(a[j]))j++;
  const k=sec+":"+m[1];if(!defs.has(k))defs.set(k,[]);defs.get(k).push(slice(i,j));i=j-1;
 }
}
function get(sec,id){const a=defs.get(sec+":"+id)||[];assert.equal(a.length,1,sec+":"+id);return a[0];}
function scalar(d,k){return d.lines.find(l=>l.startsWith("    "+k+": "))?.slice(k.length+6).split(/\s+#/)[0].trim()??null;}
function number(d,k,def=null){const v=scalar(d,k);if(v===null)return def;assert(/^[-]?\d+$/.test(v),k+":"+v);return Number(v);}
function requireLine(d,l){assert(d.lines.includes(l),d.anchor.file+":"+l);}
const mission=get("alienMissions","STR_LOC_HT_HOUSE"),deployment=get("alienDeployments","STR_LOC_HT_HOUSE"),race=get("alienRaces","STR_SECTOID_NONCOM"),script=get("missionScripts","watchTower");
const members=race.lines.filter(l=>/^      - STR_/.test(l)).map(l=>l.trim().split(/\s+/)[1]);
assert.equal(members[5],"STR_SECTOID_SOLDIER");
requireLine(deployment,"      - alienRank: 5");for(const l of ["        lowQty: 4","        highQty: 4","        dQty: 0"])requireLine(deployment,l);
assert.equal(scalar(deployment,"startingCondition"),null);
assert.equal(scalar(deployment,"unlockedResearch"),null);
const sets=[];let row=null,inside=false;
for(const l of deployment.lines){if(l==="        itemSets:"){inside=true;continue;}if(inside&&/^          -\s*$/.test(l)){row=[];sets.push(row);continue;}if(inside&&/^            - STR_/.test(l)){row.push(l.trim().slice(2));continue;}if(inside&&l.trim())break;}
assert.equal(sets.length,5);assert(sets[2].includes("STR_BEER"));assert.equal(levels.length,1);
const levelRows=levels[0].lines.slice(1).map(l=>JSON.parse(l.trim().slice(2)));assert(levelRows.every(r=>r.length===10));assert(levelRows[0].includes(2));
const raceWeights=[];let inRace=false,bucket=null;
for(const l of mission.lines){if(l==="    raceWeights:"){inRace=true;continue;}if(inRace&&/^      \d+:$/.test(l)){bucket={month:Number(l.trim().slice(0,-1)),weights:{}};raceWeights.push(bucket);continue;}if(inRace&&/^          STR_/.test(l)){const [k,v]=l.trim().split(": ");bucket.weights[k]=Number(v);continue;}if(inRace&&l.trim())break;}
assert(raceWeights.length&&raceWeights.every(x=>x.weights.STR_SECTOID_NONCOM>0));
assert.equal(number(script,"firstMonth"),0);assert.equal(number(script,"lastMonth"),16);assert.equal(number(script,"executionOdds"),16);
requireLine(script,"        STR_LOC_HT_HOUSE: 100");requireLine(script,"        REGION_HT_HOUSE: 100");assert(!script.lines.some(l=>/^    .*Triggers:/.test(l)));
const unit=get("units","STR_SECTOID_SOLDIER"),item=get("items","STR_SECTOID_SOLDIER"),beer=get("items","STR_BEER"),jail=get("facilities","STR_JAIL"),armor=get("armors",scalar(unit,"armor")),corpse=get("items","STR_ACADEMY_0_CORPSE_BATTLE");
assert.equal(scalar(unit,"liveAlien"),null);assert.equal(scalar(unit,"canSurrender"),"true");requireLine(armor,"      - STR_ACADEMY_0_CORPSE_BATTLE");
assert.equal(number(item,"prisonType",0),0);assert.equal(number(jail,"aliens"),15);
for(const d of [item,beer,corpse])assert(!d.lines.some(l=>/^    (refNode|recover|recoveryTransformations|recoveryDividers|fixedWeapon):/.test(l)));
assert.equal(scalar(beer,"isConsumable"),"true"); // recovery assumes unused, unprimed beer
const orders=[];
for(const [id,month,research] of [["STR_GDX_EVENT_ORDERS_1",4,"STR_GDX_001"],["STR_GDX_EVENT_ORDERS_2",9,"STR_GDX_002"]]){
 const ev=get("events",id),sc=get("eventScripts",id),r=data.eventResearchSources[research].find(x=>x.event===id);
 assert.equal(r.choiceCount,1);assert.equal(r.scripts.length,1);
 const s=r.scripts[0];assert.equal(s.firstMonth,month);assert.equal(s.executionOdds,50);assert.equal(s.script,id);
 requireLine(ev,"    researchList: ["+research+"]");requireLine(ev,"    interruptResearch: "+research);assert.equal(number(ev,"points"),-100);
 assert.equal(number(sc,"firstMonth"),month);assert.equal(number(sc,"executionOdds"),50);requireLine(sc,"        "+id+": 100");
 for(const k of s.researchPositive)requireLine(sc,"       "+k+": true");
 for(const k of s.researchNegative)requireLine(sc,"       "+k+": false");
 assert.deepEqual(s.otherConditions,{});
 const allowed=new Set(["description","background","researchList","interruptResearch","points","timer","timerRandom"]);
 assert(ev.lines.filter(l=>/^    \w+:/.test(l)).every(l=>allowed.has(l.trim().split(":")[0])));
 orders.push({id,research,script:s,interruptResearch:research,points:-100,timer:number(ev,"timer"),timerRandom:number(ev,"timerRandom"),eventAnchor:ev.anchor,scriptAnchor:sc.anchor});
}
const capture={id:"watchtower-sectoid-capture",deployment:"STR_LOC_HT_HOUSE",missionScript:"watchTower",race:"STR_SECTOID_NONCOM",rank:5,availableUnits:4,selectedUnitCount:1,loot:{STR_SECTOID_SOLDIER:1,STR_BEER:1},beerItemSetIndex:2,beerItemSet:sets[2],raceWeights,itemLevels:levelRows,firstMonth:0,lastMonth:16,executionOdds:16,prisonType:0,requiredFacility:"STR_JAIL",nominalCapacity:15,anchors:{mission:mission.anchor,deployment:deployment.anchor,script:script.anchor,race:race.anchor,unit:unit.anchor,armor:armor.anchor,corpse:corpse.anchor,item:item.anchor,beer:beer.anchor,jail:jail.anchor,itemLevels:levels[0].anchor},assumptions:["Mission generates in its specified region and is reachable by a compatible roster/craft","Selected race outcome and one enemy successfully spawns and is captured alive","Distinct enemy has level-2 equipment; one unused and unprimed beer survives and is recovered","At least one suitable free containment slot is actually available; no inferred occupancy from partial inventory","Victory, non-aborted recovery, score and full inventory remain unobserved"]};
const out={schema:"ATLAS_FORWARD_GDX_BRIDGE_SOURCES_V3",sourceMetadataSha256:data.meta.source.metadataSha256,nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),capture,orders,scope:"Source-bounded conditional capture and GDX timed research events. No actual battles, elapsed days, complete containment occupancy or score certified."};
fs.writeFileSync("tools/data/overcap-forward-gdx-bridge-sources-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({capture:capture.loot,raceWeights,orders:orders.map(o=>({id:o.id,month:o.script.firstMonth,requires:o.script.researchPositive,interrupt:o.interruptResearch}))},null,2));
