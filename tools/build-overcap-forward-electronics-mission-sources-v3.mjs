// Source-extract two narrow mission scenarios and a weighted recipe.
// No blanket map loot admission: generation, block placement, item rolls,
// unit placement, victory and recovery are explicitly conditional.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(dir);
const sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p));
const data=load("public/data/soldiers-modern-index.json"),mapPath="tools/data/overcap-forward-map-source-index-v3.json.gz",mapBytes=fs.readFileSync(mapPath),map=JSON.parse(gunzipSync(mapBytes));
assert.equal(map.sourceMetadataSha256,data.meta.source.metadataSha256);
const files=new Map();
for(const {file,sha256} of data.meta.source.rules){const b=fs.readFileSync(path.join(dir,file));assert.equal(sha(b),sha256,file);files.set(file,{sha256,lines:b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/)});}
function slice(file,i,j){
 const f=files.get(file),lines=f.lines.slice(i,j);
 return {lines,anchor:{file,sha256:f.sha256,startLine:i+1,endLine:j,blockSha256:sha(lines.join("\n"))}};
}
function definition(section,id,{multiple=false}={}){
 const hits=[];
 for(const [file,f] of files){
  let sec="";
  for(let i=0;i<f.lines.length;i++){
   const l=f.lines[i],m=l.match(/^([A-Za-z][A-Za-z0-9_]*):/);if(m)sec=m[1];
   if(sec!==section||!new RegExp("^  - (?:name|type): "+id+"(?:\\s+#.*)?\\s*$").test(l))continue;
   let j=i+1;while(j<f.lines.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(f.lines[j]))j++;
   hits.push(slice(file,i,j));
  }
 }
 assert(hits.length&&(multiple||hits.length===1),section+":"+id);
 return multiple?hits:hits[0];
}
function mapRoute(item,deployment,missionScript,block){
 const a=map.byItem[item].filter(x=>x.deployment===deployment&&x.missionScript===missionScript&&x.block===block&&x.terrain===(deployment==="STR_LOC_NEOPHYTES"?"URBANJUNKUFO":"CATACOMBS"));
 assert.equal(a.length,1);const r=a[0];assert(r.commandMatches.length&&!r.extraTriggerFields.length&&r.mission===deployment);
 assert(r.reasons.every(x=>x==="RANDOM_MAP_POOL_REQUIRES_EXPLICIT_OUTCOME"),JSON.stringify(r.reasons));
 for(const anchor of Object.values(r.anchors)){assert(anchor);const actual=slice(anchor.file,anchor.startLine-1,anchor.endLine);assert.equal(actual.anchor.blockSha256,anchor.blockSha256);}
 return r;
}
const neo=mapRoute("STR_PADD","STR_LOC_NEOPHYTES","NeophytesMission1","URBANJUNK31");
const academy=mapRoute("STR_ACADEMY_CORPSE","STR_LOC_TAVERN_CELLAR","TavernCellar","CATACOMBS_15");
const govt=mapRoute("STR_GOVT_CORPSE","STR_LOC_TAVERN_CELLAR","TavernCellar","CATACOMBS_15");
assert.equal(neo.count,1);assert.equal(academy.actualScript,"CATACOMBS_TAVERN_CELLAR");assert.deepEqual(academy.anchors.block,govt.anchors.block);
const b=slice(academy.anchors.block.file,academy.anchors.block.startLine-1,academy.anchors.block.endLine);
const poolStart=b.lines.findIndex(l=>l.includes("itemList: &SECTION_CATACOMBS_LOOT"));assert(poolStart>2);
const pool=[];for(let i=poolStart+1;i<b.lines.length&&/^ {16}- STR_/.test(b.lines[i]);i++)pool.push(b.lines[i].trim().slice(2));
assert(pool.includes(academy.item)&&pool.includes(govt.item));assert.equal(b.lines[poolStart-1].trim(),"mixed: true");assert.equal(b.lines[poolStart-2].trim(),"amount: 2");
const position=JSON.parse(b.lines[poolStart-3].split("position: ")[1]);
assert(academy.draws.some(x=>x.mixed&&x.itemDraws===2&&x.poolLength===pool.length&&JSON.stringify(x.positions)===JSON.stringify(position)));
const neoDef=definition("alienDeployments",neo.deployment),neoText=neoDef.lines.join("\n");
assert(neoText.includes("      - alienRank: 8\n        lowQty: 3\n        highQty: 8\n        dQty: 1"));
const sets=[];let set=null,inside=false;
for(const l of neoDef.lines){
 if(l==="        itemSets:"){inside=true;continue;}
 if(inside&&/^          -\s*$/.test(l)){set=[];sets.push(set);continue;}
 if(inside&&/^            - STR_/.test(l)){assert(set);set.push(l.trim().slice(2));continue;}
 if(inside&&l.trim())break;
}
assert.equal(sets.length,5);assert.equal(sets[0].filter(x=>x==="STR_WASTELANDER_BACKPACK").length,1);
const levelDefs=[];
for(const [file,f] of files)for(let i=0;i<f.lines.length;i++)if(f.lines[i]==="alienItemLevels:"){
 let j=i+1;while(j<f.lines.length&&/^  - \[/.test(f.lines[j]))j++;
 levelDefs.push(slice(file,i,j));
}
assert.equal(levelDefs.length,1);
const levelRows=levelDefs[0].lines.slice(1).map(l=>JSON.parse(l.trim().slice(2)));
assert(levelRows.length&&levelRows.every(row=>row.length===10));
const recoverable={};
for(const item of ["STR_PADD","STR_WASTELANDER_BACKPACK","STR_ACADEMY_CORPSE","STR_GOVT_CORPSE","STR_STUN_BATON"]){
 const defs=definition("items",item,{multiple:true}),all=defs.flatMap(d=>d.lines);
 // These narrowly scoped items have no special recovery or inheritance
 // fields in their matching raw definitions. Other items need new support.
 assert(!all.some(l=>/^    (refNode|recover|recoveryTransformations|recoveryDividers|fixedWeapon|consumable|isConsumable):/.test(l)),item);
 assert(!all.some(l=>/^    battleType: 11\s*$/.test(l)),item);
 recoverable[item]={anchors:defs.map(d=>d.anchor),nativeDefaultRecover:true,nativeDefaultFixed:false,scope:"Ordinary recoverable item, not a BT_CORPSE unit body."};
}
const recipeDef=definition("manufacture","STR_WASTELANDER_BACKPACK_EX"),recipe={id:"STR_WASTELANDER_BACKPACK_EX",requires:[],functions:[],inputs:{},fixed:{},outcomes:[]};
let mode=null;
for(const l of recipeDef.lines.slice(1)){
 if(!l.trim()||/^\s*#/.test(l))continue;let m;
 if((m=l.match(/^    (requires|requiredItems|producedItems|randomProducedItems):\s*$/))){mode=m[1];continue;}
 if((m=l.match(/^    (space|time|cost): (\d+)\s*$/))){recipe[m[1]]=Number(m[2]);mode=null;continue;}
 if((m=l.match(/^    category: (STR_\w+)\s*$/))){recipe.category=m[1];mode=null;continue;}
 if(mode==="requires"&&(m=l.match(/^      - (STR_\w+)\s*$/))){recipe.requires.push(m[1]);continue;}
 if(["requiredItems","producedItems"].includes(mode)&&(m=l.match(/^      (STR_\w+): (\d+)\s*$/))){(mode==="requiredItems"?recipe.inputs:recipe.fixed)[m[1]]=Number(m[2]);continue;}
 if(mode==="randomProducedItems"&&(m=l.match(/^      - \[(\d+), \{(.+)\}\]\s*(?:#.*)?$/))){
  const items={};for(const p of m[2].split(", ")){const m=p.match(/^(STR_\w+): (\d+)$/);assert(m,p);items[m[1]]=Number(m[2]);}
  recipe.outcomes.push({weight:Number(m[1]),items});continue;
 }
 throw Error("Unmodeled recipe line: "+l);
}
recipe.totalWeight=recipe.outcomes.reduce((n,x)=>n+x.weight,0);assert.equal(recipe.inputs.STR_WASTELANDER_BACKPACK,1);assert.equal(recipe.cost,0);assert.equal(recipe.space,0);
const stunOutcome=recipe.outcomes.findIndex(x=>x.items.STR_STUN_BATON===1);assert(stunOutcome>=0);
const out={schema:"ATLAS_FORWARD_ELECTRONICS_MISSION_SOURCES_V3",sourceMetadataSha256:data.meta.source.metadataSha256,mapSourceSha256:sha(mapBytes),nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),recoverable,missions:[
 {id:"neophytes-electronics",route:neo,loot:{STR_PADD:1,STR_WASTELANDER_BACKPACK:2},fixedItem:{id:"STR_PADD",count:1},enemyEquipment:{deploymentAnchor:neoDef.anchor,rank:8,minimumQuantity:3,itemSetIndex:0,itemSet:sets[0],selectedDistinctUnits:2,alienItemLevels:levelRows,alienItemLevelsAnchor:levelDefs[0].anchor},assumptions:["Mission appears and is reachable by compatible surviving roster/craft","URBANJUNKUFO terrain and URBANJUNK31 block actually placed","Two distinct rank-8 units spawn with level-0 equipment and both backpacks survive","Non-aborted successful mission and actual recovery into base stores; only tracked loot retained as lower-bound"]},
 {id:"tavern-electronics",route:academy,otherRoute:govt,loot:{STR_ACADEMY_CORPSE:1,STR_GOVT_CORPSE:1},pool:{position,amount:2,mixed:true,items:pool,selected:["STR_ACADEMY_CORPSE","STR_GOVT_CORPSE"]},assumptions:["Mission appears; compatible foot roster satisfies underground starting condition","CATACOMBS_15 block actually placed by deployment-specific map script","Two mixed independent draws select the two ordinary component items","Non-aborted victory and actual recovery into base stores; other loot omitted"]}],recipe:{...recipe,anchor:recipeDef.anchor,stunOutcome},scope:"Source-bounded hypothetical combat/recovery scenarios. No actual game run, map generation, battle outcome or save certified. Inventory is a conservative tracked subset, not full debriefing."};
fs.writeFileSync("tools/data/overcap-forward-electronics-mission-sources-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({missions:out.missions.map(x=>({id:x.id,loot:x.loot,poolLength:x.pool?.items.length,levelRows:x.enemyEquipment?.alienItemLevels})),recipe:{outcomes:recipe.outcomes.length,totalWeight:recipe.totalWeight,stunOutcome:recipe.outcomes[stunOutcome]}},null,2));
