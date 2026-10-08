import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2),i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const read=(...p)=>JSON.parse(fs.readFileSync(path.join(dataDir,...p),"utf8"));
const db=read("manufacture-index.json"),rows=db.index||[];
const detailCache={},editorialCache={};
function detail(x){detailCache[x.bucket]??=read("manufacture-chunks",x.bucket+".json").details;return detailCache[x.bucket][x.id]}
function editorial(x){editorialCache[x.bucket]??=read("manufacture-editorial-chunks",x.bucket+".json").details;return editorialCache[x.bucket][x.id]}
function assert(v,msg){if(!v)throw new Error(msg)}
function close(a,b,eps=1e-6){return Math.abs(Number(a)-Number(b))<=eps*Math.max(1,Math.abs(Number(a)),Math.abs(Number(b)))}
assert(rows.length===2158,"Expected 2158 manufacture recipes, got "+rows.length);
assert(new Set(rows.map(x=>x.id)).size===rows.length,"Duplicate manufacture ids");
assert(db.counts?.random===115,"Random recipe count regression");
assert(db.counts?.recruitment===53,"Recruitment recipe count regression");
assert(db.counts?.craft===53,"Craft recipe count regression");
assert(db.counts?.economicComparable>=1900,"Economic coverage regression");

const fields=["overview","unlock","inputsOutputs","economics","execution","decision","caution"];
for(const x of rows){
  const d=detail(x),e=editorial(x);
  assert(d?.id===x.id,"Missing manufacture detail "+x.id);
  assert(e,"Missing manufacture editorial "+x.id);
  for(const k of fields){
    assert(typeof e[k]==="string"&&e[k].length>=35,"Weak manufacture editorial "+x.id+" "+k);
    assert(!/\b(?:undefined|null|NaN)\b/.test(e[k]),"Invalid token in manufacture editorial "+x.id+" "+k);
    assert(!/(?:농부을|보나벤투라은)/.test(e[k]),"Known Korean particle regression "+x.id+" "+k);
  }
  assert(Array.isArray(d.requiredItems)&&Array.isArray(d.deterministicOutputs)&&Array.isArray(d.randomOutputs),"Bad manufacture arrays "+x.id);
  assert(Array.isArray(d.directResearch)&&Array.isArray(d.baseFuncDetails),"Bad manufacture unlock metadata "+x.id);
  const ec=d.economics||{};
  if(ec.economicComparable){
    assert(close(ec.opportunityNet,ec.expectedOutputSellValue-ec.manufactureCashCost-ec.inputSellOpportunityValue),"Opportunity net mismatch "+x.id);
    if(d.time>0)assert(close(ec.opportunityNetPerEngineerHour,ec.opportunityNet/d.time),"Per-hour economics mismatch "+x.id);
  }
}
function get(id){const x=rows.find(y=>y.id===id);assert(x,"Missing recipe "+id);return{x,d:detail(x),e:editorial(x)}}
{
  const {d,e}=get("STR_MEDI_KIT");
  assert(d.time===420&&d.cost===1000,"Medikit manufacture time/cost regression");
  assert(d.requiredItems.some(x=>x.id==="STR_COCONUT"&&x.qty===1),"Medikit material regression");
  assert(d.requiresBaseFunc.includes("ALKO"),"Medikit baseFunc regression");
  assert(d.economics.opportunityNet===18899,"Medikit economics regression");
  assert(e.economics.includes("18,899"),"Medikit editorial economics regression");
}
{
  const {d,e}=get("STR_SAILOR_UNIFORM");
  assert(d.time===100&&d.cost===500&&d.requiresBaseFunc.includes("SHOP"),"Sailor uniform manufacture regression");
  assert(d.requiredItems.some(x=>x.id==="STR_RAIDER_CORPSE"&&x.qty===1),"Sailor uniform material regression");
  assert(d.economics.opportunityNet===-1350&&/마이너스|손해/.test(e.decision),"Sailor uniform opportunity-cost regression");
}
{
  const {d,e}=get("STR_THEBAN_ASSAULT_CLONE");
  assert(d.spawnedPersonType==="STR_SOLDIER_PEASANT"&&d.spawnedSoldier?.initialStats?.tu===70,"Assault clone spawned soldier regression");
  assert(d.deterministicOutputs.some(x=>x.id==="STR_UAC_CARBINE"),"Assault clone equipment regression");
  assert(!d.economics.economicComparable&&e.overview.includes("병사"),"Assault clone valuation regression");
}
{
  const {d,e}=get("STR_EXPEDITION_DEBRIEF");
  assert(d.randomOutputs.length===13&&d.randomWeightTotal>0,"Expedition random output regression");
  assert(e.caution.includes("랜덤"),"Random manufacture caution regression");
}
{
  const {d,e}=get("STR_VENTURA");
  assert(d.craftOutput?.id==="STR_VENTURA"&&!d.economics.economicComparable,"Ventura craft valuation regression");
  assert(e.overview.includes("기체"),"Ventura editorial regression");
}

const editorialTexts=rows.flatMap(x=>Object.values(editorial(x)));
const exactCounts=new Map();for(const t of editorialTexts)exactCounts.set(t,(exactCounts.get(t)||0)+1);
const maxRepeat=Math.max(...exactCounts.values());
assert(maxRepeat<800,"Manufacture editorial repetition regression: "+maxRepeat);

const bytes=fs.readdirSync(path.join(dataDir,"manufacture-chunks")).reduce((s,f)=>s+fs.statSync(path.join(dataDir,"manufacture-chunks",f)).size,0)+
  fs.readdirSync(path.join(dataDir,"manufacture-editorial-chunks")).reduce((s,f)=>s+fs.statSync(path.join(dataDir,"manufacture-editorial-chunks",f)).size,0)+
  fs.statSync(path.join(dataDir,"manufacture-index.json")).size;
assert(bytes<20*1024*1024,"Manufacture DB bloat regression");
console.log(`OK manufacture DB: ${rows.length} recipes, ${db.counts.categories} categories, ${db.counts.random} random, ${db.counts.recruitment} recruitment, ${db.counts.craft} craft, ${db.counts.economicComparable} economic-comparable, ${(bytes/1048576).toFixed(1)} MiB`);
