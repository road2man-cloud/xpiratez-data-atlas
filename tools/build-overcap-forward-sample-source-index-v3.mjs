// Full research-sample acquisition index. Discovery only, not permission to
// grant an item. Keep source coverage independent of soldier-specific supply.
import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {compilePurchaseGate} from "./atlas-overcap-forward-purchase-gate-v3.mjs";
const arg=process.argv.find(x=>x.startsWith("--catalog-ref="))?.slice(14)||"FETCH_HEAD";
const ref=execFileSync("git",["rev-parse",arg+"^{commit}"],{encoding:"utf8"}).trim();
const sha=b=>createHash("sha256").update(b).digest("hex"),hashes={};
function read(p){
 const b=execFileSync("git",["show",ref+":"+p],{maxBuffer:128*1024*1024});
 hashes[p]=sha(b);return JSON.parse(p.endsWith(".gz")?gunzipSync(b):b);
}
const data=read("public/data/soldiers-modern-index.json"),items=read("public/data/items-v2-index.json"),research=read("public/data/research-v2-index.json"),manufacture=read("public/data/manufacture-v2-index.json");
assert.equal(data.meta.mod.version,"v.o2");
const baseHashes=new Map(data.meta.source.rules.map(r=>[r.file,r.sha256]));
for(const d of [items,research,manufacture]){
 assert.equal(d.meta.sourceVersion,"v.o2");
 const rr=d.meta.sourceFiles.filter(r=>r.path.startsWith("Ruleset/"));
 assert.equal(rr.length,baseHashes.size);
 for(const r of rr)assert.equal(r.sha256,baseHashes.get(r.path.split("/").at(-1)),r.path);
 assert.equal(d.meta.sourceFiles.find(r=>r.path==="metadata.yml")?.sha256,data.meta.source.metadataSha256);
}
const arr=x=>Array.isArray(x)?x:[],pairs=x=>Object.entries(x||{}),rules=data.researchRules;
const byItem=new Map(items.items.map(x=>[x.id,x])),itemRows={},researchRows={};
for(const [id,r] of pairs(rules))if(r.needItem){
 const item=r.neededItem||id;
 const row=itemRows[item]??={id:item,researchIds:[],manufacture:[],events:[],researchItemGrants:[],legacyMapLoot:null};
 row.researchIds.push(id);
 researchRows[id]={id,item,cost:r.cost,requires:arr(r.requires),dependencies:arr(r.dependencies),functions:arr(r.requiresBaseFunc),destroyItem:!!r.destroyItem,returnsItem:!!r.returnsItem,alternativeResearchAwards:[],unlockSources:[]};
}
function researchAward(target,entry){if(researchRows[target])researchRows[target].alternativeResearchAwards.push(entry);}
function itemGrant(item,entry){if(itemRows[item])itemRows[item].researchItemGrants.push(entry);}
for(const [source,r] of pairs(rules)){
 for(const target of arr(r.getOneFree))researchAward(target,{source,kind:"FREE_RESEARCH",sequential:!!r.sequentialGetOneFree,poolSize:arr(r.getOneFree).length});
 for(const [guard,targets] of pairs(r.getOneFreeProtected))for(const target of arr(targets))researchAward(target,{source,kind:"PROTECTED_FREE",guard,poolSize:arr(targets).length});
 if(r.lookup)researchAward(r.lookup,{source,kind:"LOOKUP"});
 for(const target of arr(r.unlocks))if(researchRows[target])researchRows[target].unlockSources.push(source);
}
for(const e of research.entries){
 const f=e.fields||{};
 if(typeof f.spawnedItem==="string")itemGrant(f.spawnedItem,{source:e.id,kind:"SPAWNED_ITEM_INDEX_CANDIDATE",count:null,admitted:false});
}
for(const e of manufacture.entries){
 const f=e.fields||{},fixed=f.producedItems||{};
 const outputs=Object.keys(fixed).length?fixed:(!f.spawnedItem&&!f.craftProduced&&!f.craft&&!arr(f.randomProducedItems).length&&byItem.has(e.id)?{[e.id]:1}:{});
 for(const [id,n] of pairs(outputs))if(itemRows[id]&&Number.isSafeInteger(n)&&n>0)itemRows[id].manufacture.push({id:e.id,kind:"FIXED_OUTPUT_CANDIDATE",quantity:n,requires:arr(f.requires),functions:arr(f.requiresBaseFunc),inputs:f.requiredItems||{},cost:f.cost??null,time:f.time??null,admitted:false});
 const random=arr(f.randomProducedItems),totalWeight=random.reduce((a,x)=>a+Math.max(0,Number(x?.[0])||0),0);
 for(const [weight,outputs] of random)if(weight>0)for(const [id,n] of pairs(outputs))if(itemRows[id]&&n>0)itemRows[id].manufacture.push({id:e.id,kind:"RANDOM_OUTPUT_CANDIDATE",quantity:n,weight,totalWeight,requires:arr(f.requires),functions:arr(f.requiresBaseFunc),inputs:f.requiredItems||{},admitted:false});
}
for(const b of "0123456789abcdef")for(const e of Object.values(read("public/data/event-chunks/"+b+".json.gz").details)){
 const r=e.raw||{},scripts=arr(e.scripts).map(s=>s.id),counts={};
 for(const id of arr(r.everyItemList))counts[id]=(counts[id]||0)+1;
 for(const [id,n] of pairs(r.everyMultiItemList))if(n>0)counts[id]=(counts[id]||0)+n;
 function add(id,x){if(itemRows[id])itemRows[id].events.push({event:e.id,scripts,...x,admitted:false});}
 for(const [id,n] of pairs(counts))add(id,{kind:"FIXED_EVENT_CANDIDATE",quantity:n});
 for(const id of new Set(arr(r.randomItemList)))add(id,{kind:"RANDOM_EVENT_CANDIDATE",choices:arr(r.randomItemList).length});
 for(const [id,weight] of pairs(r.weightedItemList))if(weight>0)add(id,{kind:"WEIGHTED_EVENT_CANDIDATE",weight});
 for(const group of arr(r.randomMultiItemList))for(const [id,n] of pairs(group))if(n>0)add(id,{kind:"RANDOM_MULTI_EVENT_CANDIDATE",quantity:n,choices:arr(r.randomMultiItemList).length});
 for(const id of arr(r.researchList))researchAward(id,{source:e.id,kind:"EVENT_RESEARCH",scripts,admitted:false});
}
for(const [id,row] of pairs(itemRows)){
 const item=byItem.get(id),s=data.itemSupply[id],f=item?.fields||{};
 row.koName=item?.koName||null;row.itemIndexPresent=!!item;row.legacySupplyPresent=!!s;
 row.purchase=s?compilePurchaseGate(id,s):{id,status:"INCOMPLETE_FULL_PURCHASE_FIELDS",cost:f.costBuy??null,generalRequires:arr(f.requires),buyRequires:arr(f.requiresBuy),functions:null,country:null};
 if(s){
  row.legacyMapLoot=s.mapLoot||null;
  for(const x of arr(s.researchGrants))row.researchItemGrants.push({...x,kind:"LEGACY_SOURCE_INDEX_GRANT",admitted:false});
 }
 // Self-research purchase cycle is not a first acquisition, regardless of cost.
 row.purchase.selfResearchGate=row.researchIds.filter(k=>[...arr(row.purchase.generalRequires),...arr(row.purchase.buyRequires)].includes(k));
 row.hasIndexedCandidate=!!(row.events.length||row.manufacture.length||row.researchItemGrants.length||row.legacyMapLoot?.sourceCount||row.purchase.status==="SOURCE_COMPLETE_CONDITIONAL"&&!row.purchase.selfResearchGate.length);
}
const rs=Object.values(researchRows),is=Object.values(itemRows);
const summary={researchSampleRules:rs.length,positiveCostSampleRules:rs.filter(r=>r.cost>0).length,uniqueSampleItems:is.length,itemIndexPresent:is.filter(r=>r.itemIndexPresent).length,legacySupplyPresent:is.filter(r=>r.legacySupplyPresent).length,legacySupplyMissing:is.filter(r=>!r.legacySupplyPresent).length,positiveCostSampleRulesMissingLegacySupply:rs.filter(r=>r.cost>0&&!itemRows[r.item].legacySupplyPresent).length,alternativeResearchAwardRules:rs.filter(r=>r.alternativeResearchAwards.length).length,alternativeAwardLinks:rs.reduce((n,r)=>n+r.alternativeResearchAwards.length,0),fixedOrRandomEventCandidateItems:is.filter(r=>r.events.length).length,manufactureCandidateItems:is.filter(r=>r.manufacture.length).length,completeConditionalPurchaseGates:is.filter(r=>r.purchase.status==="SOURCE_COMPLETE_CONDITIONAL").length,missingFullPurchaseFields:is.filter(r=>r.purchase.status==="INCOMPLETE_FULL_PURCHASE_FIELDS").length,selfResearchPurchaseGates:is.filter(r=>r.purchase.selfResearchGate.length).length};
const out={schema:"ATLAS_FORWARD_SAMPLE_SOURCE_INDEX_V3",sourceCommit:ref,sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,summary,items:itemRows,research:researchRows,scope:"Complete research-sample ID coverage from current v.o2 indexes; discovery candidates only. Missing full purchase fields, map/mission recovery and random outcomes remain unresolved; no automatic item grants. Not a normalization receipt."};
fs.writeFileSync("tools/data/overcap-forward-sample-source-index-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({summary,wrench:out.research.STR_WRENCH&&{item:out.items.STR_WRENCH.purchase,noItemAwardSources:out.research.STR_WRENCH.alternativeResearchAwards.filter(x=>rules[x.source]&&!rules[x.source].needItem)}},null,2));
