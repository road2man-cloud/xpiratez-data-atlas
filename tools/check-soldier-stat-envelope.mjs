import fs from "node:fs";
import assert from "node:assert/strict";
import {initialState,STAT_KEYS,eligibleTransformation} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope,advanceStatEnvelope,effectiveEnvelope} from "../public/soldiers/modern/stat-envelope.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const halfId="manufacture:STR_HALF_UBER_GIRL_RECRUITMENT";
const state=initialState(data,halfId);
const start=createStatEnvelope(data,halfId);
assert.equal(start.kind,"ready");
assert.deepEqual([start.low.firing,start.high.firing],[60,60]);
assert.deepEqual([start.initialLow.firing,start.initialHigh.firing],[30,36]);
assert.deepEqual([start.low.psiStrength,start.high.psiStrength],[20,70]);
assert.equal(start.sourceExact,false);
const rev=data.transformations.find(t=>t.id==="STR_REVOLUTIONARY_TRAINING");
const result=advanceStatEnvelope(rev,start,data,state);
assert.deepEqual([result.low.firing,result.high.firing],[45,70],
  "firing 60 + rolled 15..40 - 50% of 60");
assert.deepEqual([result.low.health,result.high.health],[39,54],
  "health 45 + rolled 5..20 - trunc(25% of 45)");
assert(result.randomSteps.includes(rev.id));
assert.equal(result.sourceExact,false);
const afterRandom={...state,currentStats:{...state.currentStats,firing:60,health:45}};
const reqBase={id:"RNG_CHECK",allowedSoldierTypes:[state.soldierType],
  allowsLiveSoldiers:true,allowsWoundedSoldiers:false,allowsDeadSoldiers:false,
  requiredPreviousTransformations:[],forbiddenPreviousTransformations:[],
  requiredCommendations:{},requires:[],requiresBaseFunc:[],requiredItems:{},cost:0};
const minReq={...reqBase,requiredMinStats:{firing:55}};
assert.equal(eligibleTransformation(minReq,afterRandom,data,{mode:"future"}).kind,"eligible",
  "old point-estimate wrongly pretended all rolls pass firing 55");
const guarded=eligibleTransformation(minReq,afterRandom,data,{mode:"future",statEnvelope:result});
assert.equal(guarded.kind,"conditional","random firing 45..70 must not pass as exact 55");
assert(guarded.conditions.some(x=>x.includes("45~70")));
assert.equal(eligibleTransformation({...reqBase,requiredMaxStats:{firing:65}},
  afterRandom,data,{mode:"future",statEnvelope:result}).kind,"conditional");
assert.equal(eligibleTransformation({...reqBase,requiredMinStats:{firing:45}},
  afterRandom,data,{mode:"future",statEnvelope:result}).kind,"eligible");
const after={...state,bonusIds:new Set([...state.bonusIds,rev.soldierBonusType])};
const equipped=effectiveEnvelope(result,after,data);
assert.equal(equipped.kind,"ready");
assert(equipped.low.firing<=equipped.high.firing);
assert.equal(effectiveEnvelope(result,after,data,{
  commendations:{STR_MEDAL_WEAPON_PROFICIENCY_NAME:1}
}).kind,"unverified","do not silently drop per-weapon mastery bonuses");
const afterPercentage={
  id:"FOLLOWUP",allowedSoldierTypes:["STR_SOLDIER_PEASANT"],
  flatOverallStatChange:{},flatMin:{},flatMax:{},
  percentOverallStatChange:{firing:25},percentMin:{},percentMax:{},
  percentGainedStatChange:{},percentGainedMin:{},percentGainedMax:{},
  lowerBoundAtMinStats:false,upperBoundAtMaxStats:false,upperBoundAtStatCaps:false
};
const twice=advanceStatEnvelope(afterPercentage,result,data,state);
for(let roll=15;roll<=40;roll++){
  const firstFiring=60+roll+Math.trunc(60*-50/100);
  const secondFiring=firstFiring+Math.trunc(firstFiring*25/100);
  assert(secondFiring>=twice.low.firing&&secondFiring<=twice.high.firing,
    "two-step RNG/percent chain must contain actual rolled outcomes");
}
assert.deepEqual([twice.low.firing,twice.high.firing],[56,87]);
const rawExact=initialState(data,halfId);
rawExact.exactStats=true;
rawExact.currentStats={...state.currentStats,firing:67,health:45};
rawExact.initialStats={...state.initialStats,firing:34};
const exact=createStatEnvelope(data,halfId,{state:rawExact});
assert.equal(exact.low.firing,67);
assert.equal(exact.high.firing,67);
const unknown=createStatEnvelope(data,halfId,{state:{...state,sourceId:null,exactStats:false}});
assert.equal(unknown.kind,"unverified");
assert.equal(effectiveEnvelope(exact,{...state,armorId:"NONEXISTENT"},data).kind,"unverified");
// Use an independent scalar reference implementation against exhaustive
// small integer roll/starting-stat combinations.
const pct=(value,percent)=>Math.trunc(value*percent/100);
function engineScalar(rule,c,i,rolled,flatRollPercent,cap,sameType=true,key="firing"){
  let delta=(rule.flatOverallStatChange?.[key]||0)+rolled+
    pct(c,rule.percentOverallStatChange?.[key]||0)+pct(c,flatRollPercent)+
    pct(c-i,rule.percentGainedStatChange?.[key]||0);
  if(key==="bravery")delta=Math.trunc((delta+(delta<0?-5:5))/10)*10;
  if(rule.lowerBoundAtMinStats)delta=Math.max(delta,(rule._floor||0)-c);
  if(rule.upperBoundAtStatCaps||rule.upperBoundAtMaxStats){
    if(rule.upperBoundType===1||(rule.upperBoundType===0&&sameType)){
      if(delta>0)delta=c<=cap?Math.min(delta,cap-c):0;
    }else delta=Math.min(delta,cap-c);
  }
  return c+delta;
}
let seed=0x193A71B2;
const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed};
const randint=(lo,hi)=>lo+(random()%(hi-lo+1));
const syntheticData={soldiers:[{id:"T",minStats:{firing:0,bravery:0},
  maxStats:{firing:20,bravery:30},statCaps:{firing:16,bravery:20}}]};
for(let run=0;run<420;run++){
  const lo=randint(0,10),hi=randint(lo,12);
  const initLo=randint(0,8),initHi=randint(initLo,11);
  const flatLo=randint(-8,2),flatHi=randint(flatLo,8);
  const pctRollLo=randint(-45,-5),pctRollHi=randint(pctRollLo,20);
  const k=run%7===0?"bravery":"firing";
  const constant=randint(-10,12),basePercent=randint(-50,45),gainedPercent=randint(-45,30);
  const upper=run%3===0;
  const lower=run%5===0;
  const cap=(upper?randint(8,17):16);
  const rule={
    id:"S"+run,allowedSoldierTypes:["T"],upperBoundType:run%2===0?1:2,
    upperBoundAtStatCaps:upper,lowerBoundAtMinStats:lower,
    flatOverallStatChange:{[k]:constant},
    flatMin:{[k]:flatLo},flatMax:{[k]:flatHi},
    percentOverallStatChange:{[k]:basePercent},
    percentMin:{[k]:pctRollLo},percentMax:{[k]:pctRollHi},
    percentGainedStatChange:{[k]:gainedPercent},
    percentGainedMin:{[k]:0},percentGainedMax:{[k]:0}
  };
  syntheticData.soldiers[0].minStats[k]=0;
  syntheticData.soldiers[0].statCaps[k]=cap;
  const old={
    kind:"ready",source:"test",sourceExact:false,randomSteps:[],notes:[],
    low:{[k]:lo},high:{[k]:hi},
    initialLow:{[k]:initLo},initialHigh:{[k]:initHi}
  };
  const bounds=advanceStatEnvelope(rule,old,syntheticData,{soldierType:"T"});
  const lowerVal=bounds.low[k],upperVal=bounds.high[k];
  for(let c=lo;c<=hi;c++)for(let i=initLo;i<=initHi;i++)
    for(let f=flatLo;f<=flatHi;f++)
      for(let p=pctRollLo;p<=pctRollHi;p++){
        const actual=engineScalar(rule,c,i,f,p,cap,true,k);
        assert(lowerVal<=actual&&actual<=upperVal,
          "UNSAFE RANGE "+run+"/"+k+": "+actual+" outside ["+lowerVal+","+upperVal+"] from "+
          JSON.stringify({c,i,f,p,rule}));
      }
}
console.log("PASS conservative stat intervals: exact X-Piratez revolutionary 45..70 firing / 39..54 health, "+
  "420 exhaustive OXCE arithmetic/cap combinations, no falsely narrow ranges, no future RNG certainty");
