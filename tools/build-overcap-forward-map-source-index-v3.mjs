// Resolve map-loot provenance against the actual deployment map script.
// The old terrain-default script is not valid when a deployment overrides it.
// This creates source-backed acquisition tasks, never automatic inventory.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
const arg=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(arg);
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],load=p=>JSON.parse(fs.readFileSync(p));
const data=load("public/data/soldiers-modern-index.json"),sampleIndex=load("tools/data/overcap-forward-sample-source-index-v3.json");
assert.equal(data.meta.source.metadataSha256,sampleIndex.sourceMetadataSha256);
const sections=new Set(["terrains","mapScripts","missionScripts","alienMissions","alienDeployments","startingConditions"]),defs=new Map(),terrainAliases=new Map();
for(const {file,sha256} of data.meta.source.rules){
 const b=fs.readFileSync(path.join(arg,file));assert.equal(sha(b),sha256,file);
 const lines=b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);
 let section="";
 for(let i=0;i<lines.length;i++){
  const top=lines[i].match(/^([A-Za-z][A-Za-z0-9_]*):/);if(top)section=top[1];
  const m=lines[i].match(/^  - (?:type|name): ([A-Za-z0-9_]+)(?:\s+#.*)?\s*$/);
  if(!m||!sections.has(section))continue;
  let j=i+1;while(j<lines.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(lines[j]))j++;
  const l=lines.slice(i,j),key=section+":"+m[1],entry={id:m[1],section,file,lines:l,anchor:{file,startLine:i+1,endLine:j,sha256,blockSha256:sha(l.join("\n"))}};
  if(!defs.has(key))defs.set(key,[]);defs.get(key).push(entry);
  if(section==="terrains"){
   const alias=l.find(s=>/^    mapBlocks: &[A-Za-z0-9_]+/.test(s))?.match(/&([A-Za-z0-9_]+)/)?.[1];
   if(alias){if(!terrainAliases.has(alias))terrainAliases.set(alias,[]);terrainAliases.get(alias).push(entry);}
  }
  i=j-1;
 }
}
const get=(section,id)=>{const d=defs.get(section+":"+id);return d?.length===1?d[0]:null;};
const scalar=(d,k)=>d?.lines.find(l=>l.startsWith("    "+k+": "))?.slice(k.length+6).split(/\s+#/)[0].trim()||null;
const topFields=d=>d?d.lines.map(l=>l.match(/^    ([A-Za-z][A-Za-z0-9_]*):/)?.[1]).filter(Boolean):[];
function list(d,k){
 if(!d)return [];
 const i=d.lines.findIndex(l=>l===("    "+k+":"));if(i<0)return [];
 const a=[];for(let j=i+1;j<d.lines.length&&!/^    [A-Za-z]/.test(d.lines[j]);j++){const m=d.lines[j].match(/^      - ([A-Za-z0-9_]+)\s*$/);if(m)a.push(m[1]);}
 return a;
}
function mapBlock(terrain,name){
 if(!terrain)return null;
 const alias=scalar(terrain,"mapBlocks");
 let owner=terrain;
 if(alias?.startsWith("*")){const a=terrainAliases.get(alias.slice(1));if(a?.length!==1)return null;owner=a[0];}
 const hits=owner.lines.map((l,i)=>[l,i]).filter(([l])=>l.match(/^      - name: ([A-Za-z0-9_]+)/)?.[1]===name);
 if(hits.length!==1)return null;
 const i=hits[0][1];let j=i+1;while(j<owner.lines.length&&!/^      - name:|^    [A-Za-z]/.test(owner.lines[j]))j++;
 const l=owner.lines.slice(i,j),prop=k=>l.find(s=>s.startsWith("        "+k+": "))?.slice(k.length+10).trim()||null;
 const group=prop("groups"),groups=group===null?[0]:/^\d+$/.test(group)?[Number(group)]:/^\[\d+(,\s*\d+)*\]$/.test(group)?JSON.parse(group):null;
 return {lines:l,anchor:{...owner.anchor,startLine:owner.anchor.startLine+i,endLine:owner.anchor.startLine+j-1,blockSha256:sha(l.join("\n"))},width:Number(prop("width")),length:Number(prop("length")),groups,terrainOwner:owner.id};
}
function commands(d){
 if(!d)return [];
 const out=[];let row=null;
 for(const l of d.lines.slice(1)){
  const m=l.match(/^\s{4,6}- type: ([A-Za-z0-9_]+)\s*$/);
  if(m){row={type:m[1],fields:{},step:out.length+1};out.push(row);continue;}
  if(row){const m=l.match(/^\s{6,8}([A-Za-z][A-Za-z0-9_]*):\s*(.*?)\s*$/);if(m)row.fields[m[1]]=m[2];}
 }return out;
}
const nums=(s,def)=>s===undefined?[def]:/^\d+$/.test(s)?[Number(s)]:/^\[\d+(,\s*\d+)*\]$/.test(s)?JSON.parse(s):null;
function matches(cmd,b){
 if(cmd.type!=="addBlock"||!b?.groups)return false;
 const f=cmd.fields,sz=nums(f.size,1),gs=nums(f.groups,0);
 if(!sz||!gs||f.blocks!==undefined||f.executionChances==="0"||f.executions==="0")return false;
 return sz.some(s=>s*10===b.width&&s*10===b.length)&&gs.some(x=>b.groups.includes(x));
}
const routes=[],counts={};
for(const [item,s] of Object.entries(data.itemSupply))for(const x of arr(s.mapLoot?.sources)){
 const terrain=get("terrains",x.terrain),block=mapBlock(terrain,x.block);
 for(const m of arr(x.missionPaths)){
  const deploy=get("alienDeployments",m.deployment),mission=get("alienMissions",m.mission),script=get("missionScripts",m.script);
  const override=scalar(deploy,"script"),actualScript=override||scalar(terrain,"script"),map=get("mapScripts",actualScript);
  const commandMatches=commands(map).filter(c=>matches(c,block));
  const reasons=[];
  if(!terrain||!block||!deploy||!mission||!script||!map)reasons.push("RAW_DEFINITION_MISSING_OR_AMBIGUOUS");
  if(deploy&&!list(deploy,"terrains").includes(x.terrain))reasons.push("TERRAIN_NOT_EXPLICIT_IN_DEPLOYMENT");
  if(m.mission!==m.deployment)reasons.push("INDIRECT_MISSION_DEPLOYMENT_LINK");
  if(!commandMatches.length)reasons.push("NO_SIMPLE_ADDBLOCK_WITNESS_FOR_ACTUAL_SCRIPT");
  if(x.placement==="fixedOnBlock"){
   const i=block?.lines.findIndex(l=>l.match(/^\s+([A-Za-z0-9_]+):\s*$/)?.[1]===item)??-1;
   let count=0;if(i>=0)for(let k=i+1;k<block.lines.length&&/^\s{12,}- \[/.test(block.lines[k]);k++)count++;
   if(count!==x.count)reasons.push("FIXED_ITEM_COUNT_NOT_RAW_CONFIRMED");
  }else reasons.push("RANDOM_MAP_POOL_REQUIRES_EXPLICIT_OUTCOME");
  if(x.missionPathsTruncated)reasons.push("OTHER_MISSION_PATHS_TRUNCATED");
  const scriptFields=topFields(script),extraTriggerFields=scriptFields.filter(k=>/Triggers$|^(min|max|counter|missionVar|missionMarker)/.test(k)&&!["researchTriggers","itemTriggers"].includes(k));
  if(extraTriggerFields.length)reasons.push("ADDITIONAL_MISSION_CONTEXT_REQUIRED");
  const status=reasons.length?"OPEN_SOURCE_TASK":"FIXED_SOURCE_CANDIDATE";
  counts[status]=(counts[status]||0)+1;
  routes.push({item,placement:x.placement,count:x.count??null,draws:x.draws||null,terrain:x.terrain,block:x.block,terrainScript:x.mapScript,actualScript,scriptOverridden:!!override&&override!==x.mapScript,mission:m.mission,deployment:m.deployment,missionScript:m.script,missionConditions:m,extraTriggerFields,startingCondition:scalar(deploy,"startingCondition"),successResearch:scalar(deploy,"unlockedResearch"),commandMatches,anchors:{terrain:terrain?.anchor||null,block:block?.anchor||null,mapScript:map?.anchor||null,mission:mission?.anchor||null,deployment:deploy?.anchor||null,missionScript:script?.anchor||null},status,reasons,admitted:false,recoveryRequirements:["Actual mission appearance within source window","Compatible craft and roster","Selected terrain and actual map block placement","Item survival and recovery","Apply mission victory reward once if present"]});
 }
}
const byItem={};for(const r of routes){(byItem[r.item]??=[]).push(r);}
const output={schema:"ATLAS_FORWARD_MAP_SOURCE_INDEX_V3",sourceMetadataSha256:data.meta.source.metadataSha256,sourceIndexSha256:sha(fs.readFileSync("tools/data/overcap-forward-sample-source-index-v3.json")),summary:{items:Object.keys(byItem).length,routes:routes.length,scriptOverrideRoutes:routes.filter(r=>r.scriptOverridden).length,overrideWithoutSimpleCommand:routes.filter(r=>r.scriptOverridden&&!r.commandMatches.length).length,withActualCommand:routes.filter(r=>r.commandMatches.length).length,...counts},byItem,scope:"Raw-source anchored map acquisition tasks. No grant is admitted: simple matching addBlock is not proof of successful placement or recovery; unindexed, inherited and random cases remain OPEN."};
fs.writeFileSync("tools/data/overcap-forward-map-source-index-v3.json.gz",gzipSync(JSON.stringify(output),{level:9}));
console.log(JSON.stringify({summary:output.summary,targets:["STR_GDX_005","STR_PADD","STR_ACADEMY_CORPSE","STR_GOVT_CORPSE"].map(item=>({item,routes:byItem[item]?.length||0,candidates:arr(byItem[item]).filter(r=>r.status==="FIXED_SOURCE_CANDIDATE").length,actualScriptExample:arr(byItem[item]).filter(r=>r.commandMatches.length).slice(0,1).map(r=>[r.actualScript,r.block,r.deployment,r.missionScript])}))},null,2));
