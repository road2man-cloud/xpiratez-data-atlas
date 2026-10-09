import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args=process.argv.slice(2);
const at=args.indexOf("--data");
const dataDir=path.resolve(at>=0&&args[at+1]?args[at+1]:"public/items/data");
const worldAt=args.indexOf("--world"),worldDir=path.resolve(worldAt>=0&&args[worldAt+1]?args[worldAt+1]:"public/data");
const read=(...p)=>JSON.parse(fs.readFileSync(path.join(dataDir,...p),"utf8"));
const world=(...p)=>JSON.parse(fs.readFileSync(path.join(worldDir,...p),"utf8"));
const worldGz=(...p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(worldDir,...p))));

const items=read("items-index.json").index||[];
const research=read("research-index.json").index||[];
const researchInsights=read("research-insight-index.json").index||[];
const insightIx=new Map(researchInsights.map(x=>[x.id,x]));
const itemBuckets=new Map(),researchBuckets=new Map();

function itemEditorial(row){
  if(!itemBuckets.has(row.bucket))itemBuckets.set(row.bucket,read("item-editorial-chunks",row.bucket+".json").details);
  return itemBuckets.get(row.bucket)[row.id];
}
function researchEditorial(row){
  if(!researchBuckets.has(row.bucket))researchBuckets.set(row.bucket,read("research-editorial-chunks",row.bucket+".json").details);
  return researchBuckets.get(row.bucket)[row.id];
}
function stats(rows,getter,fields){
  const out={};
  for(const field of fields){
    const texts=rows.map(r=>String(getter(r)?.[field]||"").trim());
    const lengths=texts.map(x=>x.length).sort((a,b)=>a-b);
    const counts=new Map();
    for(const t of texts)counts.set(t,(counts.get(t)||0)+1);
    const repeated=[...counts.entries()].filter(([t,n])=>t&&n>1).sort((a,b)=>b[1]-a[1]);
    out[field]={
      min:lengths[0]||0,
      median:lengths[Math.floor(lengths.length/2)]||0,
      max:lengths.at(-1)||0,
      unique:counts.size,
      mostRepeated:repeated[0]?.[1]||1,
      repeatedTexts:repeated.slice(0,5)
    };
  }
  return out;
}
function assert(cond,msg){if(!cond)throw new Error(msg)}
function allTexts(rows,getter,fields){return rows.flatMap(r=>fields.map(f=>({id:r.id,field:f,text:String(getter(r)?.[f]||"")})))}

const itemFields=["overview","effect","acquisition","progression","decision","watch","uses","economics"];
const researchFields=["core","context","effect","action","route","decision","watch"];
const itemStats=stats(items,itemEditorial,itemFields);
const researchStats=stats(research,researchEditorial,researchFields);
const texts=[
  ...allTexts(items,itemEditorial,itemFields).map(x=>({...x,type:"item"})),
  ...allTexts(research,researchEditorial,researchFields).map(x=>({...x,type:"research"}))
];

for(const x of texts){
  assert(x.text.trim().length>=35,`Too-short editorial: ${x.type} ${x.id} ${x.field}`);
  assert(!/\b(?:undefined|null|NaN)\b/.test(x.text),`Invalid token in editorial: ${x.type} ${x.id} ${x.field}`);
  assert(!/(?:은은|는는|을을|를를|이다다|다다\.)/.test(x.text),`Broken Korean particle/repetition: ${x.type} ${x.id} ${x.field}: ${x.text}`);
  assert(!/주 역할 other|\bundefined\b|\bnull\b|\bNaN\b/.test(x.text),`Internal token leaked into editorial: ${x.type} ${x.id} ${x.field}: ${x.text}`);
  assert(!/\s{3,}/.test(x.text),`Excess whitespace: ${x.type} ${x.id} ${x.field}`);
}

for(const [field,s] of Object.entries(itemStats)){
  assert(s.mostRepeated<=750,`Item editorial repetition regression ${field}: ${s.mostRepeated} :: ${s.repeatedTexts[0]?.[0]||""}`);
}
for(const [field,s] of Object.entries(researchStats)){
  assert(s.mostRepeated<=750,`Research editorial repetition regression ${field}: ${s.mostRepeated} :: ${s.repeatedTexts[0]?.[0]||""}`);
}

const genericItem=texts.filter(x=>x.type==="item"&&x.text.includes("현재 세이브의 재고·자금·연구 목표가 달라지면")).length;
const genericResearch=texts.filter(x=>x.type==="research"&&x.text.includes("현재 세이브에서 바로 이어서 사용할 후속 보상이 없다면")).length;
assert(genericItem<=50,`Too many fallback item editorials: ${genericItem}`);
assert(genericResearch<=100,`Too many fallback research editorials: ${genericResearch}`);

// Semantic regressions: counting words is insufficient if a research hub is
// described as nothing but its first incidental manufactured item.
const rInsightCache=new Map();
let hubCount=0,complexCount=0,falseGateCount=0,positiveGateCount=0;
for(const r of research){
  if(!rInsightCache.has(r.bucket))rInsightCache.set(r.bucket,read("research-insight-chunks",r.bucket+".json").details);
  const insight=rInsightCache.get(r.bucket)[r.id]?.insight||{};
  const e=researchEditorial(r);
  const multi=(insight.roles||[]).filter(x=>x!=="ufopaedia"&&x!=="other").length>=2;
  if(multi)complexCount++;
  if(r.requiredByCount>=5){
    hubCount++;
    assert(e.core.includes("진행 허브"),"Research hub mislabeled as a single unlock: "+r.id+" -> "+e.core);
    assert(e.context.includes("직접 후속 연구 "+r.requiredByCount+"개"),"Research hub missing downstream coverage: "+r.id);
    assert(e.context.includes("다른 필요 연구"),"Research context promises automatic unlock: "+r.id);
  }
  const scripts=(insight.semanticReferences||[]).filter(x=>x.section==="events").flatMap(x=>[...(x.scripts||[]),...(x.scriptGate?[x.scriptGate]:[])]);
  const negative=scripts.some(s=>s.researchTriggers?.[r.id]===false);
  const positive=scripts.some(s=>s.researchTriggers?.[r.id]===true);
  if(negative){
    falseGateCount++;
    assert((e.context+" "+e.watch).includes("미보유"),"False event trigger hidden: "+r.id);
    assert(!e.action.includes("100% 발생 보장"),"False event trigger presented as guaranteed: "+r.id);
  }
  if(positive)positiveGateCount++;
}
assert(hubCount>=550,"Research hub coverage unexpectedly shrank: "+hubCount);
assert(complexCount>=1450,"Multi-role research coverage regressed: "+complexCount);
assert(falseGateCount>=90,"Research false event gate discovery regressed: "+falseGateCount);
const cunning=research.find(x=>x.id==="STR_CUNNING");
assert(cunning?.requiredByCount===16,"Cunning 16 direct research dependencies not recognized");
const cunningText=researchEditorial(cunning);
for(const key of ["교활함","16개","의사소통","사기와 도용","글래머 고용","게임 월 9","교활함 미보유","바론 스컬페이스","시발링가 돌","점수 +350"]){
  assert(Object.values(cunningText).some(t=>t.includes(key)),"Cunning missing important campaign fact: "+key);
}
assert(!cunningText.core.startsWith("교활함은 가죽 채찍"),"Cunning reduced to whip manufacturing");
assert(cunningText.effect.includes("가죽 채찍")&&cunningText.effect.includes("X그로그"),"Cunning direct manufacturing/free grant omitted");
assert(!cunningText.effect.includes("시발링가 돌"),"Separate event reward misrepresented as Cunning research output");
assert(cunningText.watch.includes("interruptResearch")||cunningText.context.includes("interruptResearch"),"Cunning event interruptResearch nuance omitted");

const scamming=research.find(x=>x.id==="STR_SCAMMING");
const scamText=researchEditorial(scamming);
for(const key of ["개인 자료 ×1","41개","+1,068","1회 보장","기술자-시간 20"]){
  assert(Object.values(scamText).some(t=>t.includes(key)),"Scamming manufacturing context missing: "+key);
}
const bounty=research.find(x=>x.id==="STR_BOUNTY_HUNTING");
const bountyText=researchEditorial(bounty);
assert(bountyText.context.includes("점수 -25"),"Bounty hunting negative event penalty hidden");
assert(bountyText.decision.includes("연구를 앞당기는")&&!bountyText.decision.includes("연구를 늦추는"),
  "Negative event penalty mistaken for beneficial opportunity cost");
const littleBird=research.find(x=>x.id==="STR_LITTLE_BIRD_ASSEMBLY");
assert(researchEditorial(littleBird).context.includes("헬리콥터 잔해"),
  "Research editorial context fails to preserve direct item spawns");

// All GPT/derived editorial surfaces are scanned, not only research and item.
const domains=[
  {name:"manufacture",index:world("manufacture-index.json").index||[],folder:"manufacture-editorial-chunks",fields:["overview","unlock","inputsOutputs","economics","execution","decision","caution"],gzip:false,min:2000},
  {name:"event",index:worldGz("events-index.json.gz").index||[],folder:"event-editorial-chunks",fields:["overview","trigger","result","value","action","missRisk","verification"],gzip:true,min:750},
  {name:"enemy-force",index:worldGz("enemy-forces-index.json.gz").index||[],folder:"enemy-force-editorial-chunks",fields:["overview","spawn","movement","encounter","threat","action","caution"],gzip:true,min:300}
];
const domainCoverage={};
for(const domain of domains){
  assert(domain.index.length>=domain.min,"Missing "+domain.name+" rows: "+domain.index.length);
  const cache=new Map();
  let chars=0;
  for(const row of domain.index){
    const name=row.bucket+".json"+(domain.gzip?".gz":"");
    if(!cache.has(name))cache.set(name,domain.gzip?worldGz(domain.folder,name).details:world(domain.folder,name).details);
    const e=cache.get(name)?.[row.id];
    assert(e,"Missing "+domain.name+" editorial: "+row.id);
    for(const field of domain.fields){
      const t=e[field];
      assert(typeof t==="string"&&t.trim().length>=40,"Shallow "+domain.name+" editorial "+row.id+"."+field);
      assert(!/\\b(?:undefined|null|NaN)\\b/.test(t),"Unresolved "+domain.name+" editorial "+row.id+"."+field);
      chars+=t.length;
    }
  }
  domainCoverage[domain.name]={rows:domain.index.length,fields:domain.fields.length,averageChars:Math.round(chars/domain.index.length)};
}
console.log("[context-audit] "+JSON.stringify({
  research:research.length,items:items.length,hubCount,complexCount,falseGateCount,positiveGateCount,
  domainCoverage
}));

console.log(JSON.stringify({
  itemCount:items.length,
  researchCount:research.length,
  genericItem,
  genericResearch,
  itemStats,
  researchStats
},null,2));
