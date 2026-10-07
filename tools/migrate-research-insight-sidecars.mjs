import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const dataDir=path.resolve(arg("--data","public/items/data"));
const file=(...parts)=>path.join(dataDir,...parts);
const readJson=(...parts)=>JSON.parse(fs.readFileSync(file(...parts),"utf8"));
const writeJson=(value,...parts)=>fs.writeFileSync(file(...parts),JSON.stringify(value));

const research=readJson("research-index.json");
const entities=readJson("entities.json").names||{};
if(!Array.isArray(research.index))throw new Error("Missing research index");

const buckets=new Map();
for(const row of research.index){
  if(!buckets.has(row.bucket))buckets.set(row.bucket,readJson("research-chunks",row.bucket+".json").details);
}

const existingInsightIndex=fs.existsSync(file("research-insight-index.json"))?readJson("research-insight-index.json").index||[]:[];
const existingInsightIndexById=new Map(existingInsightIndex.map(x=>[x.id,x]));
const existingInsightBuckets=new Map();
function existingInsight(id,bucket){
  if(!existingInsightBuckets.has(bucket)){
    const p=file("research-insight-chunks",bucket+".json");
    existingInsightBuckets.set(bucket,fs.existsSync(p)?readJson("research-insight-chunks",bucket+".json").details:{});
  }
  return existingInsightBuckets.get(bucket)[id]?.insight||null;
}
function directSummary(d){
  return d.koName+": 연구량 "+(d.cost??"—")+" · 완료 점수 "+(d.points??"—")+(d.needItem?" · 실물 표본 "+(d.destroyItem?"필요·소모":"필요"):"");
}
function insightTerms(insight){
  return [...new Set([
    ...(insight.roles||[]),
    ...(insight.transformations||[]).map(x=>x.id),
    ...(insight.transformations||[]).map(x=>x.soldierBonus?.id).filter(Boolean),
    ...(insight.semanticReferences||[]).map(x=>x.id),
    ...(insight.semanticReferences||[]).flatMap(x=>x.events||[])
  ])];
}
function namesForTerms(terms){
  return [...new Set(terms.filter(x=>typeof x==="string"&&x.startsWith("STR_")).flatMap(id=>entities[id]||[]))];
}
function eventLinksFor(insight){
  return (insight.semanticReferences||[]).filter(x=>["event-grant","event-research-link"].includes(x.kind)).map(x=>({
    id:x.id,kind:x.kind,paths:x.paths,
    ...(x.scripts?.length?{scripts:x.scripts}:{}),
    ...(x.eventRequires?.length?{eventRequires:x.eventRequires}:{}),
    ...(x.requiresBaseFunc?.length?{requiresBaseFunc:x.requiresBaseFunc}:{})
  }));
}

const sidecars={},insightIndex=[];
let migrated=0;
for(const row of research.index){
  const details=buckets.get(row.bucket),d=details?.[row.id];
  if(!d)throw new Error("Missing research detail "+row.id);
  const insight=d.insight||existingInsight(row.id,row.bucket);
  if(!insight)throw new Error("Missing source insight "+row.id);
  if(!insight.evidence)insight.evidence="derived-from-ruleset";
  if(insight.prerequisite){
    const p=insight.prerequisite;
    insight.prerequisite={
      topicCount:p.topicCount??0,
      prerequisiteCost:p.prerequisiteCost??0,
      requiresBaseFunc:p.requiresBaseFunc||[],
      sampleTopicCount:p.sampleTopicCount??p.sampleTopics?.length??0,
      branchTopicCount:p.branchTopicCount??p.branchTopics?.length??0
    };
  }
  const terms=Array.isArray(row.insightTerms)?row.insightTerms:existingInsightIndexById.get(row.id)?.insightTerms||insightTerms(insight);
  const names=Array.isArray(row.insightNames)?row.insightNames:existingInsightIndexById.get(row.id)?.insightNames||namesForTerms(terms);
  const links=eventLinksFor(insight);
  (sidecars[row.bucket]||={})[row.id]={id:row.id,bucket:row.bucket,insight};
  insightIndex.push({
    id:row.id,bucket:row.bucket,
    insightKinds:insight.roles||[],
    primaryInsightKind:insight.primaryRole||insight.roles?.[0]||"other",
    insightTerms:terms,insightNames:names,
    ...(d.dependencies?.length?{dependencyIds:d.dependencies}:{}),
    ...(insight.disables?.length?{disableIds:insight.disables}:{}),
    ...(links.length?{eventLinks:links}:{})
  });
  if(Object.prototype.hasOwnProperty.call(d,"insight")){delete d.insight;migrated++}
  d.summaryKo=directSummary(d);
  for(const k of ["insightKinds","primaryInsightKind","insightTerms","insightNames"])delete row[k];
}
insightIndex.sort((a,b)=>a.id.localeCompare(b.id));

fs.mkdirSync(file("research-insight-chunks"),{recursive:true});
for(const [bucket,details] of Object.entries(sidecars))writeJson({details},"research-insight-chunks",bucket+".json");
writeJson({version:1,index:insightIndex},"research-insight-index.json");
for(const [bucket,details] of buckets)writeJson({details},"research-chunks",bucket+".json");
writeJson(research,"research-index.json");

console.log(`Migrated ${migrated} embedded research insights; wrote ${insightIndex.length} sidecar entries.`);
