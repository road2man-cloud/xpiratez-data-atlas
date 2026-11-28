import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import assert from "node:assert/strict";
const arg=process.argv.find(x=>x.startsWith("--catalog-ref="))?.slice(14)||"FETCH_HEAD";
const ref=execFileSync("git",["rev-parse",arg+"^{commit}"],{encoding:"utf8"}).trim();
const sha=b=>createHash("sha256").update(b).digest("hex"),hashes={};
function read(path){
 const b=execFileSync("git",["show",ref+":"+path],{maxBuffer:128*1024*1024});
 hashes[path]=sha(b);return JSON.parse(path.endsWith(".gz")?gunzipSync(b):b);
}
const data=read("public/data/soldiers-modern-index.json");
assert.equal(sha(fs.readFileSync("public/data/soldiers-modern-index.json")),hashes["public/data/soldiers-modern-index.json"],"Base rules differ from catalog commit");
assert.equal(data.meta.mod.version,"v.o2");
const arr=x=>Array.isArray(x)?x:[],entries=x=>Object.entries(x||{}),positiveMap=x=>Object.fromEntries(entries(x).filter(([,n])=>Number.isSafeInteger(n)&&n>0));
const targets=new Set(Object.entries(data.researchRules).filter(([,r])=>r.cost>0&&r.needItem).map(([id,r])=>r.neededItem||id));
const itemData=read("public/data/items-v2-index.json"),itemIds=new Set(itemData.items.map(x=>x.id));
const rawRecipes=read("public/data/manufacture-v2-index.json").entries;
const recipes=[];
for(const m of rawRecipes){
 const f=m.fields||{};
 if(arr(f.randomProducedItems).length||f.randomProducedItems&&!Array.isArray(f.randomProducedItems)||f.refund)continue;
 const outputs=f.producedItems?positiveMap(f.producedItems):itemIds.has(m.id)?{[m.id]:1}:{};
 if(!Object.keys(outputs).length||Object.keys(outputs).some(id=>!itemIds.has(id))||entries(f.producedItems).length&&entries(f.producedItems).length!==Object.keys(outputs).length)continue;
 const requirements=positiveMap(f.requiredItems);
 if(Object.keys(requirements).length!==entries(f.requiredItems).length||Object.keys(requirements).some(id=>!itemIds.has(id)))continue;
 if(!arr(f.requires).length||!Number.isFinite(f.cost??0)||!Number.isFinite(f.time)||f.time<=0)continue;
 // Require a matching deterministic output in the soldier supply index.
 const match=entries(outputs).some(([id,n])=>arr(data.itemSupply[id]?.manufacture).some(r=>r.id===m.id&&r.quantity===n));
 if(!match)continue;
 recipes.push({id:m.id,outputs,requiredItems:requirements,requires:arr(f.requires),functions:arr(f.requiresBaseFunc),cost:f.cost??0,time:f.time});
}
// Include finite chains of required intermediate materials, not just samples.
let changed=true;
while(changed){changed=false;for(const r of recipes)if(Object.keys(r.outputs).some(id=>targets.has(id)))for(const id of Object.keys(r.requiredItems))if(!targets.has(id)){targets.add(id);changed=true;}}
const selectedRecipes=recipes.filter(r=>Object.keys(r.outputs).some(id=>targets.has(id)));
const buys={};
for(const [id,s] of entries(data.itemSupply)){
 if(!targets.has(id)||!s.exists||!(s.buyCost>0)||arr(s.buyRequirements).length||s.buyRequiresCountry)continue;
 // No-research purchases are not established as initial stock. Model them
 // only after the observed first lab choice, under the ordinary-effort policy.
 buys[id]={id,cost:s.buyCost,requires:arr(s.buyRequires),functions:arr(s.buyRequiresBaseFunc)};
}
const facilities={};
for(const f of read("public/data/facilities-v2-index.json").facilities){
 const s=data.baseFacilityFunctions[f.id],v=f.fields||{};
 if(!s||!arr(s.research).length||!arr(s.provides).length||!Number.isFinite(v.buildCost)||v.buildCost<0||!Number.isFinite(v.buildTime)||v.buildTime<=0)continue;
 facilities[f.id]={id:f.id,research:s.research,requires:arr(s.requires),provides:s.provides,cost:v.buildCost,days:v.buildTime,size:v.size??1};
}
const map={researchTriggers:"research",itemTriggers:"item",facilityTriggers:"facility",xcomBaseInRegionTriggers:"region",xcomBaseInCountryTriggers:"country",soldierTypeTriggers:"soldierType",pactTriggers:"pact"};
const conditionKeys=new Set(["firstMonth","lastMonth","executionOdds","minDifficulty","maxDifficulty","minFunds","maxFunds","minScore","maxScore","counterMin","counterMax","missionVarName","missionMarkerName"]);
function scriptFor(s,id){
 const c=s.conditions||{},t=s.triggerMaps||{};
 if(Object.keys(c).some(k=>!conditionKeys.has(k))||Object.keys(t).some(k=>!map[k]))return null;
 const monthWeights=arr(s.eventWeights).map(b=>({month:Number(b.bucket),weight:arr(b.entries).find(x=>x.eventId===id)?.weight??0,totalWeight:b.totalWeight})).filter(b=>Number.isFinite(b.month)&&Number.isFinite(b.weight)&&Number.isFinite(b.totalWeight));
 if(!monthWeights.some(b=>b.weight>0))return null;
 const out={script:s.id,mode:"weighted",eventId:id,monthWeights,firstMonth:c.firstMonth??0,lastMonth:c.lastMonth??null,executionOdds:c.executionOdds??100,otherConditions:Object.fromEntries(entries(c).filter(([k])=>!["firstMonth","lastMonth","executionOdds"].includes(k)))};
 for(const [k,name] of entries(map)){out[name+"Positive"]=arr(t[k]).filter(x=>x.value===true).map(x=>x.id);out[name+"Negative"]=arr(t[k]).filter(x=>x.value===false).map(x=>x.id);if(arr(t[k]).some(x=>typeof x.value!=="boolean"))return null;}
 return out;
}
const events={},excluded={};
for(const b of "0123456789abcdef")for(const e of Object.values(read("public/data/event-chunks/"+b+".json.gz").details)){
 const r=e.raw||{},fixed={};
 for(const id of arr(r.everyItemList))fixed[id]=(fixed[id]||0)+1;
 for(const [id,n] of entries(positiveMap(r.everyMultiItemList)))fixed[id]=(fixed[id]||0)+n;
 const random=arr(r.randomItemList).length||arr(r.randomMultiItemList).length||entries(r.weightedItemList).length;
 const other=!!(r.interruptResearch||r.spawnedPersonType||r.spawnedPersons||r.spawnedSoldier||arr(r.regionList).length||r.city||r.invert||r.spawnedCraftType);
 const funds=Number(r.funds||0),points=Number(r.points||0);
 if(random||other||funds<0||!Number.isFinite(funds)||!Number.isFinite(points)||Object.keys(fixed).some(id=>!itemIds.has(id))||entries(r.everyMultiItemList).length!==entries(positiveMap(r.everyMultiItemList)).length){excluded[e.id]=random?"UNMODELED_RANDOM_ITEM_OUTCOME":"UNMODELED_EVENT_SIDE_EFFECT";continue;}
 const research=arr(r.researchList),scripts=arr(e.scripts).map(s=>scriptFor(s,e.id)).filter(Boolean);
 if(!research.length&&!Object.keys(fixed).some(id=>targets.has(id)))continue;
 events[e.id]={id:e.id,research,fixed,points,funds,scripts};
}
const out={schema:"ATLAS_FORWARD_SUPPLY_CATALOG_V2",sourceCommit:ref,sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,targets:[...targets].sort(),recipes:selectedRecipes,buys,facilities,events,excluded,scope:"Conservative fixed-item events, indexed deterministic recipes and purchase/facility gates. Random items, unindexed event side effects and repeated events remain open; actual economy and game execution not certified."};
fs.writeFileSync("tools/data/overcap-forward-supply-catalog-v2.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({sourceCommit:ref,targets:out.targets.length,recipes:selectedRecipes.length,buys:Object.keys(buys).length,facilities:Object.keys(facilities).length,events:Object.keys(events).length,itemEvents:Object.values(events).filter(e=>!e.research.length&&Object.keys(e.fixed).length).length,excluded:Object.keys(excluded).length},null,2));
