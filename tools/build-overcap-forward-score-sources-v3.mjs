// Raw-source score catalog. Keep missing/ambiguous/inherited points unresolved.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const root=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(root);
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),files=new Map(),defs=new Map();
for(const {file,sha256} of data.meta.source.rules){
 const b=fs.readFileSync(path.join(root,file));assert.equal(sha(b),sha256,file);
 const lines=b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);files.set(file,{sha256,lines});
 let section="";
 for(let i=0;i<lines.length;i++){
  const t=lines[i].match(/^([A-Za-z][A-Za-z0-9_]*):/);if(t)section=t[1];
  const m=lines[i].match(/^  - (?:name|type|id): (\w+)\s*(?:#.*)?$/);
  if(!m||!["research","events","manufacture","startingConditions"].includes(section))continue;
  let j=i+1;while(j<lines.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(lines[j]))j++;
  const l=lines.slice(i,j),k=section+":"+m[1];if(!defs.has(k))defs.set(k,[]);defs.get(k).push({lines:l,anchor:{file,sha256,startLine:i+1,endLine:j,blockSha256:sha(l.join("\n"))}});i=j-1;
 }
}
function points(section,id){
 const a=defs.get(section+":"+id)||[];
 if(a.length!==1)return {status:a.length?"AMBIGUOUS":"MISSING",points:null,anchors:a.map(x=>x.anchor)};
 const d=a[0],l=d.lines.filter(x=>/^    points:/.test(x)),inherits=d.lines.some(x=>/^    (refNode|<<):/.test(x));
 if(l.length>1||l.length===1&&!/^    points: -?\d+\s*(?:#.*)?$/.test(l[0])||inherits&&!l.length)return {status:"UNRESOLVED",points:null,anchor:d.anchor};
 return {status:l.length?"EXPLICIT":"NATIVE_DEFAULT_ZERO",points:l.length?Number(l[0].match(/-?\d+/)[0]):0,anchor:d.anchor};
}
const research=Object.fromEntries(Object.keys(data.researchRules).map(id=>[id,points("research",id)]));
const events={},manufacture={};for(const k of defs.keys()){
 if(k.startsWith("events:"))events[k.slice(7)]=points("events",k.slice(7));
 if(k.startsWith("manufacture:"))manufacture[k.slice(12)]=points("manufacture",k.slice(12));
}
const mapPath=dir+"overcap-forward-map-source-index-v3.json.gz",mapBytes=fs.readFileSync(mapPath),map=JSON.parse(gunzipSync(mapBytes));
assert.equal(map.sourceMetadataSha256,data.meta.source.metadataSha256);
const routes=map.byItem.STR_GDX_005;assert.equal(routes.length,1);const r=routes[0];assert.equal(r.status,"FIXED_SOURCE_CANDIDATE");assert.equal(r.count,1);
for(const a of Object.values(r.anchors)){
 const f=files.get(a.file);assert.equal(f.sha256,a.sha256);assert.equal(sha(f.lines.slice(a.startLine-1,a.endLine).join("\n")),a.blockSha256);
}
const sc=defs.get("startingConditions:"+r.startingCondition);assert.equal(sc.length,1);
function list(d,k){const i=d.lines.indexOf("    "+k+":");assert(i>=0,k);const a=[];for(let j=i+1;j<d.lines.length&&/^      - \w+\s*$/.test(d.lines[j]);j++)a.push(d.lines[j].trim().slice(2));return a;}
const constraints={id:r.startingCondition,allowedCraft:list(sc[0],"allowedCraft"),allowedSoldierTypes:list(sc[0],"allowedSoldierTypes"),allowedArmors:list(sc[0],"allowedArmors"),allowedItems:list(sc[0],"allowedItems"),anchor:sc[0].anchor};
const rawBlock=files.get(r.anchors.block.file).lines.slice(r.anchors.block.startLine-1,r.anchors.block.endLine);
assert(rawBlock.some(l=>/^\s+STR_GDX_005:\s*$/.test(l)));
const route={...r,startingConstraints:constraints,scope:"Fixed map sample candidate; actual compatible craft/roster, map placement, victory and recovered stock still conditional. No rank or mission reward admitted by this catalog."};
const rankSource=JSON.parse(fs.readFileSync(dir+"overcap-forward-persuasion-sources-v3.json"));
const rankRules=rankSource.scripts.filter(x=>x.minScore!==null);
assert.deepEqual(rankRules.map(x=>x.minScore),[2000,3000]);
const out={schema:"ATLAS_FORWARD_SCORE_SOURCES_V3",sourceMetadataSha256:data.meta.source.metadataSha256,nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),mapSourceSha256:sha(mapBytes),rankRules,research,events,manufacture,gdxPrison:route,native:{scoreFormula:"researchScores[funds.size()-1] + (monthsPassed>1 ? 400 : 0) + sum(region.activityXcom-region.activityAlien)",boundary:"GeoscapeState::time1Month: addMonth, determineAlienMissions, then monthlyFunding pushes a zero research score slot",research:"SavedGame::addFinishedResearch adds getPoints on first discovery when score=true, including queued zero-cost discoveries; not all model flags prove a native award",event:"GeoscapeEventState applies event points to region or research score; both enter aggregate score",sourceLines:{score:"SavedGame.cpp:3130-3140",monthly:"GeoscapeState.cpp:2865-2895",research:"SavedGame.cpp:1535-1585",event:"GeoscapeEventState.cpp:193-206",funding:"SavedGame.cpp:1114-1136",researchDefault:"RuleResearch.cpp:28-31"}},scope:"Source values and mission conditions only. Missing/inherited records remain null. No native score inferred from aggregate research count."};
fs.writeFileSync(dir+"overcap-forward-score-sources-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({research:Object.keys(research).length,known:Object.values(research).filter(r=>r.points!==null).length,unknown:Object.keys(research).filter(k=>research[k].points===null),events:Object.keys(events).length,manufacture:Object.keys(manufacture).length,gdx:{crafts:constraints.allowedCraft,items:constraints.allowedItems,sample:r.count}},null,2));
