import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args=process.argv.slice(2);
const arg=(key,fallback)=>{const i=args.indexOf(key);return i>=0&&args[i+1]?args[i+1]:fallback};
const itemDir=path.resolve(arg("--items","public/items/data"));
const worldDir=path.resolve(arg("--world","public/data"));
const outDir=path.resolve(arg("--out",itemDir));
const read=(root,...parts)=>JSON.parse(fs.readFileSync(path.join(root,...parts),"utf8"));
const readGz=(root,...parts)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,...parts))));
const items=read(itemDir,"items-index.json").index||[];
const itemById=new Map(items.map(x=>[x.id,x]));
const entityNames=read(itemDir,"entities.json").names||{};
const name=id=>entityNames[id]?.[0]||itemById.get(id)?.koName||id;
const buckets=new Map();
const details=new Map(items.map(x=>[x.id,{
  id:x.id,
  consumes:[],produces:[],manufactureResearchGates:[],
  eventGrants:[],eventResearchGrants:[],eventConditions:[],transformations:[],researchUnlocks:[],
  specimenResearch:null,
  economy:{
    monthlyMaintenance:x.monthlyMaintenance??0,
    ...(x.monthlyMaintenance<0?{
      monthlyMaintenanceRelief:-x.monthlyMaintenance,sellValue:x.costSell??null,size:x.size??null,
      holdingMonthsToExceedSale:x.costSell>0?x.costSell/(-x.monthlyMaintenance):null
    }:{}),
    ...(x.monthlyMaintenance>0?{monthlyMaintenanceCost:x.monthlyMaintenance}:{}),
    ...(x.size<0&&x.monthlyMaintenance>=0?{size:x.size}:{})
  }
}]));
function add(id,key,value){
  const d=details.get(id);
  if(d)d[key].push(value);
}
const manufactureIndex=read(worldDir,"manufacture-index.json").index||[];
const manufactureBucketCache=new Map();
function manufactureDetail(row){
  if(!manufactureBucketCache.has(row.bucket))manufactureBucketCache.set(row.bucket,read(worldDir,"manufacture-chunks",row.bucket+".json").details);
  return manufactureBucketCache.get(row.bucket)[row.id];
}
function smallOutput(d){
  const fixed=(d.deterministicOutputs||[]).slice(0,5).map(x=>({id:x.id,qty:x.qty}));
  const other=[];
  if(d.spawnedPersonType)other.push({id:d.spawnedPersonType,kind:"person"});
  if(d.craftOutput)other.push({id:d.craftOutput.id,kind:"craft"});
  const options=d.randomOutputs||[];
  const samples=[...options.slice(0,2),...options.slice(-2)];
  const seen=new Set(),randomSample=[];
  for(const op of samples){
    if(seen.has(op.index))continue;seen.add(op.index);
    for(const x of (op.outputs||[]).slice(0,2))randomSample.push({id:x.id,qty:x.qty});
  }
  return{fixed,other,randomOptions:options.length,...(randomSample.length?{randomSample}:{})};
}
for(const row of manufactureIndex){
  const d=manufactureDetail(row);
  if(!d)throw new Error("Missing manufacture detail "+row.id);
  const common={id:row.id,role:d.role,baseFuncs:d.requiresBaseFunc||[]};
  const output=smallOutput(d);
  for(const x of d.requiredItems||[])add(x.id,"consumes",{...common,qty:x.qty,output});
  for(const x of d.deterministicOutputs||[])add(x.id,"produces",{id:row.id,qty:x.qty,kind:"fixed"});
  for(const option of d.randomOutputs||[])for(const x of option.outputs||[]){
    add(x.id,"produces",{id:row.id,qty:x.qty,kind:"random",option:option.index,
      relativeShare:option.probability});
  }
  // The 'requires' array is a research/flag gate, not an item cost.
  for(const id of d.directRequires||[])if(itemById.has(id))add(id,"manufactureResearchGates",{id:row.id});
}
const eventIndex=readGz(worldDir,"events-index.json.gz").index||[];
const eventBucketCache=new Map();
function eventDetail(row){
  if(!eventBucketCache.has(row.bucket))eventBucketCache.set(row.bucket,readGz(worldDir,"event-chunks",row.bucket+".json.gz").details);
  return eventBucketCache.get(row.bucket)[row.id];
}
for(const row of eventIndex){
  const d=eventDetail(row);
  if(!d)throw new Error("Missing event detail "+row.id);
  for(const x of d.effects?.guaranteedItems||[])add(x.id,"eventGrants",{id:row.id,kind:"fixed",qty:x.qty});
  for(const x of d.effects?.randomItems?.list||[])add(x.id,"eventGrants",{id:row.id,kind:"random-list",qty:1,
    relativeShare:x.relativeShare});
  for(const option of d.effects?.randomItems?.multi||[])for(const x of option.items||[])
    add(x.id,"eventGrants",{id:row.id,kind:"random-bundle",qty:x.qty,option:option.index});
  for(const x of d.effects?.researchRewards||[])if(itemById.has(x.id))add(x.id,"eventResearchGrants",{id:row.id});
  for(const script of d.scripts||[])for(const trigger of script.triggerMaps?.itemTriggers||[]){
    add(trigger.id,"eventConditions",{id:row.id,scriptId:script.id,required:trigger.value});
  }
}
const researchIndex=read(itemDir,"research-index.json").index||[];
const researchBucketCache=new Map(),insightBucketCache=new Map(),seenTransformations=new Set();
for(const row of researchIndex){
  if(!insightBucketCache.has(row.bucket))insightBucketCache.set(row.bucket,read(itemDir,"research-insight-chunks",row.bucket+".json").details);
  for(const t of insightBucketCache.get(row.bucket)[row.id]?.insight?.transformations||[]){
    if(seenTransformations.has(t.id))continue;
    seenTransformations.add(t.id);
    for(const x of t.requiredItems||[])add(x.id,"transformations",{id:t.id,qty:x.qty,
      cost:t.cost,baseFuncs:t.requiresBaseFunc||[]});
  }
}
const itemBucketCache=new Map();
for(const row of items){
  if(!itemBucketCache.has(row.bucket))itemBucketCache.set(row.bucket,read(itemDir,"chunks",row.bucket+".json").details);
  const d=itemBucketCache.get(row.bucket)[row.id],usage=details.get(row.id);
  if(!d)throw new Error("Missing item detail "+row.id);
  for(const r of d.research||[]){
    if(r.id===row.id&&(r.paths||[]).includes("name"))usage.specimenResearch={
      id:r.id,needItem:r.needItem===true,destroyItem:r.destroyItem===true};
    if((r.paths||[]).some(p=>p.startsWith("dependencies.")||p.startsWith("requires.")))
      usage.researchUnlocks.push({id:r.id});
  }
}
const index=[],chunkContents={};
let materialEdges=0,producerEdges=0,eventEdges=0,transformEdges=0,maintenancePositive=0;
for(const row of items){
  const d=details.get(row.id);
  const sorted=xs=>xs.sort((a,b)=>a.id.localeCompare(b.id)||String(a.kind||"").localeCompare(String(b.kind||""))||(a.option||0)-(b.option||0));
  for(const key of ["consumes","produces","eventGrants","eventResearchGrants","eventConditions","transformations","manufactureResearchGates","researchUnlocks"])sorted(d[key]);
  for(const key of ["researchUnlocks","manufactureResearchGates","eventConditions","eventResearchGrants"]){
    const seen=new Set();
    d[key]=d[key].filter(x=>{const k=[x.id,x.scriptId||"",x.required??""].join("|");if(seen.has(k))return false;seen.add(k);return true});
  }
  const allRecipes=new Set([...d.consumes,...d.produces,...d.manufactureResearchGates].map(x=>x.id));
  const counter={id:row.id,materialUses:d.consumes.length,manufactureSources:new Set(d.produces.map(x=>x.id)).size,
    manufactureTotalRecipes:allRecipes.size,eventSources:new Set(d.eventGrants.map(x=>x.id)).size,transformationUses:d.transformations.length,
    researchFlags:d.researchUnlocks.length,monthlyMaintenanceRelief:d.economy.monthlyMaintenanceRelief};
  index.push(counter);
  (chunkContents[row.bucket]||={})[row.id]=d;
  materialEdges+=d.consumes.length;producerEdges+=d.produces.length;
  eventEdges+=d.eventGrants.length;transformEdges+=d.transformations.length;
  if(d.economy.monthlyMaintenanceRelief>0)maintenancePositive++;
}
fs.mkdirSync(path.join(outDir,"item-usage-chunks"),{recursive:true});
for(const [bucket,group] of Object.entries(chunkContents))
  fs.writeFileSync(path.join(outDir,"item-usage-chunks",bucket+".json"),JSON.stringify({details:group}));
const meta={version:1,generator:"item cross-system usage v1",evidence:"ruleset-derived cross references",
  itemCount:items.length,manufactureCount:manufactureIndex.length,eventCount:eventIndex.length,
  transformationCount:seenTransformations.size,materialEdges,producerEdges,eventEdges,
  transformEdges,negativeMaintenanceItems:maintenancePositive};
fs.writeFileSync(path.join(outDir,"item-usage-index.json"),JSON.stringify({meta,index}));
console.log(JSON.stringify(meta));
