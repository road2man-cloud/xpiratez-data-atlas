import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const at=args.indexOf("--data");
const dataDir=path.resolve(at>=0&&args[at+1]?args[at+1]:"public/items/data");
const read=(...p)=>JSON.parse(fs.readFileSync(path.join(dataDir,...p),"utf8"));

const items=read("items-index.json").index||[];
const research=read("research-index.json").index||[];
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
const researchFields=["core","effect","action","route","decision","watch"];
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

console.log(JSON.stringify({
  itemCount:items.length,
  researchCount:research.length,
  genericItem,
  genericResearch,
  itemStats,
  researchStats
},null,2));
