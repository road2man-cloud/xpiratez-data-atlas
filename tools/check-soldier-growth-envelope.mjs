import fs from "node:fs";
import assert from "node:assert/strict";
import {initialState,eligibleTransformation} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope,advanceStatEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope,growthPreview,GROWTH_PHASES} from "../public/soldiers/modern/growth-envelope.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
assert.equal(data.growthRules.manaPrimary,true);
assert.equal(data.growthRules.manaSecondary,true);
assert.equal(data.growthRules.maxTaggedArmorSecondaryPercent,20);
const tagged=data.armorCatalog.filter(x=>x.extraSecondaryGrowthPercent>0);
assert.equal(tagged.length,41);
assert(tagged.every(x=>x.extraSecondaryGrowthPercent<=100));
const source="manufacture:STR_HALF_UBER_GIRL_RECRUITMENT";
const state=initialState(data,source);
const before=createStatEnvelope(data,source);
const future=growthPreview(data,state,before);
assert.equal(future.combat.kind,"ready");
assert.equal(future.physical.kind,"ready");
assert.equal(future.combat.low.firing,60,"past history is not automatically grown");
assert.equal(future.combat.high.firing,125,"firing 120 cap + max six-point roll - 1");
assert.equal(future.combat.high.health,56,"secondary cap 55 + one overshoot");
assert.equal(future.combat.high.tu,81,"TU secondary cap 80 + one overshoot");
assert.equal(future.combat.high.stamina,146,"stamina secondary cap 145 + one overshoot");
assert.equal(future.combat.high.mana,165,"mana primary cap 160 + five overshoot");
assert.equal(future.combat.high.bravery,109,"bravery up to cap+9 when non-multiple-of-ten");
assert.equal(future.combat.high.psiStrength,70,
  "already overcap source roll must not be clamped down to new body cap");
assert.equal(future.physical.high.firing,85,
  "physical training stops at min(statCaps 120, trainingStatCaps 85)");
assert.equal(future.physical.high.health,45,
  "physical training cannot raise initial 45 health past trainingCap 40");
assert.equal(future.physical.high.tu,66);
assert.equal(future.physical.high.reactions,55,"physical training doesn't increase reactions");
assert.equal(future.physical.high.psiSkill,0,"physical training cannot unlock psi");
assert.equal(future.physical.high.mana,75,"physical training cannot increase mana");
const futureAfterTraining=growStatEnvelope(future.physical,state,data,"@BATTLE_GROWTH");
assert.equal(futureAfterTraining.high.firing,125);
assert.equal(futureAfterTraining.low.firing,60);
assert.deepEqual(futureAfterTraining.growthPhases,["@PHYS_TRAINING","@BATTLE_GROWTH"]);
const priorOvercap={...before,high:{...before.high,firing:131}};
assert.equal(growStatEnvelope(priorOvercap,state,data,"@BATTLE_GROWTH").high.firing,131);
assert.equal(growStatEnvelope(before,state,data,"@UNKNOWN").kind,"unverified");
const required={id:"GROWTH_GATE",allowedSoldierTypes:[state.soldierType],
  allowsLiveSoldiers:true,allowsWoundedSoldiers:false,allowsDeadSoldiers:false,
  requiredMinStats:{},requiredMaxStats:{firing:90},
  requiredPreviousTransformations:[],forbiddenPreviousTransformations:[],
  requiredCommendations:{},requires:[],requiresBaseFunc:[],requiredItems:{},cost:0};
assert.equal(eligibleTransformation(required,state,data,{mode:"future"}).kind,"eligible",
  "before growth firing=60 meets upper bound 90");
const guarded=eligibleTransformation(required,state,data,{
  mode:"future",statEnvelope:future.combat
});
assert.equal(guarded.kind,"conditional");
assert(guarded.conditions.some(x=>x.includes("60~125")));
const upperAfter=growStatEnvelope(before,state,data,"@BATTLE_GROWTH");
const percentRule={id:"TEST_PLUS_25",flatOverallStatChange:{},
  flatMin:{},flatMax:{},percentOverallStatChange:{firing:25},
  percentMin:{},percentMax:{},percentGainedStatChange:{},
  percentGainedMin:{},percentGainedMax:{},rerollStats:null,
  lowerBoundAtMinStats:false,upperBoundAtMaxStats:false,upperBoundAtStatCaps:false};
const transformed=advanceStatEnvelope(percentRule,upperAfter,data,state);
assert.equal(transformed.low.firing,75);
assert.equal(transformed.high.firing,156,
  "growth BEFORE percent transformation changes the resulting safe upper");
assert.equal(growStatEnvelope(
  advanceStatEnvelope(percentRule,before,data,state),state,data,"@BATTLE_GROWTH"
).high.firing,125,
  "growth AFTER the percent transformation is a DIFFERENT result (not interchangeable)");
const allCaps=data.soldiers.filter(x=>x.statCaps&&x.trainingStatCaps);
assert.equal(allCaps.length,29);
let checked=0;
function secondaryMax(c,cap,divisor,pct=0){
  let after=c<cap?c+Math.floor((cap-c)/divisor)+2:c;
  if(pct>0&&after<=cap){
    const gap=cap-after;
    after+=Math.max(1,Math.trunc(gap*pct/100));
  }
  return after;
}
for(let cap=0;cap<=180;cap+=3){
  const maxPrimary=cap+5,maxSecondary=cap+1;
  for(let c=0;c<=cap;c++){
    for(let exp=0;exp<=15;exp++){
      const primary=c<cap?c+(exp>10?6:exp>5?4:exp>2?3:exp>0?1:0):c;
      assert(primary<=maxPrimary);
    }
    for(const p of [0,5,10,20,100]){
      assert(secondaryMax(c,cap,10,p)<=maxSecondary);
      assert(secondaryMax(c,cap,15,p)<=maxSecondary);
      checked+=2;
    }
  }
}
console.log("PASS long-horizon OXCE growth: 41 armor-tag scripts <=20%, 29 body caps, "+
  checked+" exhaustive primary/secondary/armor limit checks, physical training/no overshoot, "+
  "RNG gate & order-sensitive percent transformation");
