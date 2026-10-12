import fs from "node:fs";
import path from "node:path";
import {minimumOpensToProfit} from "./research-decision-insights.mjs";

const at=process.argv.indexOf("--data");
const dir=path.resolve(at>=0&&process.argv[at+1]?process.argv[at+1]:"public/items/data");
const read=(...p)=>JSON.parse(fs.readFileSync(path.join(dir,...p),"utf8"));
const assert=(x,message)=>{if(!x)throw Error("Research decision regression: "+message)};
const meta=read("research-editorial-meta.json");

// Pure economic rules are checked even while main still contains v4 sidecars.
assert(minimumOpensToProfit(200000,2200)===91,"cash bag recovery must take 91 additional openings");
assert(minimumOpensToProfit(60000,5800)===11,"money purse recovery must take 11 additional openings");
assert(minimumOpensToProfit(100,0)===null,"zero margin cannot recover the specimen");
assert(minimumOpensToProfit(100,-2)===null,"loss-making extraction cannot recover the specimen");
assert(minimumOpensToProfit(100,25)===5,"break-even is not profit");
assert(minimumOpensToProfit(NaN,20)===null,"unknown input price is not zero");

if(meta.version<5){
  console.log("Research editorial v"+meta.version+" is awaiting regeneration; tested economic math.");
  process.exit(0);
}
const ix=read("research-index.json").index||[];
const buckets=new Map();
const details=new Map();
function editorial(id){
  const row=ix.find(x=>x.id===id);
  assert(row,"missing indexed research "+id);
  if(!buckets.has(row.bucket))buckets.set(row.bucket,read("research-editorial-chunks",row.bucket+".json").details);
  return buckets.get(row.bucket)[id];
}
for(const row of ix){
  const e=editorial(row.id);
  assert(e,"missing editorial "+row.id);
  for(const field of ["verdict","unlockLogic"]){
    assert(typeof e[field]==="string"&&e[field].trim().length>=20,row.id+" missing "+field);
    assert(!/\b(?:undefined|null|NaN|Infinity)\b/.test(e[field]),row.id+" broken "+field);
  }
  if(row.requiredByCount>0){
    assert(e.downstreamLogic.includes("충분조건이 아니"),row.id+" downstream must not imply sufficiency");
  }
}
const wine=editorial("STR_WINE");
for(const s of ["사과","코스모포르토바야 보드카","불길 위를 걷다","생존","파티(연관)"]){
  assert(wine.unlockLogic.includes(s),"wine missing actual prerequisite "+s);
}
assert(wine.unlockLogic.includes("중 한 경로")&&wine.unlockLogic.includes("전부 완료할 필요는 없습니다"),
  "wine OR-path must be clearly identified");
assert(wine.unlockLogic.includes("와인 실물은 이 연구의 필요조건이 아닙니다"),
  "wine physical possession must not be mistaken for a gate");
assert(wine.unlockLogic.includes("표본")&&wine.unlockLogic.includes("소모"),
  "wine must mention Apple and Vodka specimen research");

for(const [id,price,output,margin,opens,total,hours] of [
  ["STR_CASH_BAG",200000,202200,2200,91,92,455],
  ["STR_MONEY_PURSE",60000,65800,5800,11,12,55]
]){
  const e=editorial(id),text=e.verdict+" "+e.economics;
  for(const amount of [price,output,margin,opens,total,hours]){
    assert(text.includes(amount.toLocaleString("ko-KR")),id+" missing economic number "+amount);
  }
  assert(e.economics.includes("표본 1개"),id+" specimen must be counted");
  assert(e.economics.includes("이미 연구가 완료됐다면"),id+" sunk cost caveat missing");
  assert(e.economics.includes("기술자")&&e.economics.includes("미반영"),
    id+" opportunity costs must be disclosed");
}
const bonus=editorial("STR_DOLLAR_BRIEFCASE");
assert(!bonus.economics.includes("총 92개"),"unrelated bounty exchange incorrectly treated as cash bag");
console.log(JSON.stringify({version:meta.version,checked:ix.length,wine:true,cashBag:true,moneyPurse:true}));
