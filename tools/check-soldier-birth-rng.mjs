import assert from "node:assert/strict";
import fs from "node:fs";
import {newbornDistribution,newbornPairChance,newbornTailChance,distributionQuantile,BIRTH_STAT_KEYS} from
  "../public/soldiers/modern/birth-rng-math.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
assert.equal(data.profiles.length,72);
for(const profile of data.profiles){
  const result=newbornDistribution(data,profile.id);
  const mass=result.totalDistribution.reduce((sum,[,p])=>sum+p,0);
  assert(Math.abs(mass-1)<1e-9,profile.id+" probability mass");
  assert(Math.abs(result.total-Object.values(result.stats).reduce((a,b)=>a+b,0))<1e-9,profile.id+" total moment");
  assert(result.totalBand.min<=result.totalBand.p10,profile.id+" percentile order");
  assert(result.totalBand.p10<=result.totalBand.p50,profile.id+" percentile order");
  assert(result.totalBand.p50<=result.totalBand.p90,profile.id+" percentile order");
  assert(result.totalBand.p90<=result.totalBand.max,profile.id+" percentile order");
  assert(Object.values(result.stats).every(Number.isFinite),profile.id+" finite values");
}
const zero=Object.fromEntries(BIRTH_STAT_KEYS.map(key=>[key,0]));
const synthetic={
  currentStatsOverride:{tu:0,bravery:40,health:-1,psiSkill:0},
  traitStats:{tu:2,bravery:10,health:3,psiSkill:10},
  effectiveStats:{
    min:{...zero,tu:3,bravery:50,health:3},
    max:{...zero,tu:5,bravery:50,health:3}
  }
};
const mock={
  soldiers:[{id:"S",minStats:{...zero,tu:1,bravery:30,health:2},
    maxStats:{...zero,tu:3,bravery:50,health:4,psiSkill:20}}],
  profiles:[{...synthetic,id:"A",soldierType:"S"},{...synthetic,id:"B",soldierType:"S"}]
};
const A=newbornDistribution(mock,"A"),B=newbornDistribution(mock,"B");
assert(Math.abs(A.total-(4+50+3))<1e-9);
assert.deepEqual(A.totalBand,{min:56,p10:56,p50:57,p90:58,max:58});
assert.deepEqual(A.distributions.psiSkill,[[0,1]]);
assert.deepEqual(A.distributions.tu.map(([x])=>x),[3,4,5]);
const win=newbornPairChance(A,B);
assert(Math.abs(win.win-1/3)<1e-12);
assert(Math.abs(win.tie-1/3)<1e-12);
assert(Math.abs(win.lose-1/3)<1e-12);
assert(Math.abs(newbornTailChance(A,57)-2/3)<1e-12);
assert.equal(newbornTailChance(A,59),0);
assert.equal(newbornTailChance(A,55),1);
assert.equal(newbornTailChance(A,57.1),null);
assert.equal(distributionQuantile([[2,0.5],[3,0.5]],0.5),2);
const galOrigin=data.profiles.find(p=>p.soldierType==="STR_SOLDIER");
const freakOrigin=data.profiles.find(p=>p.soldierType==="STR_SOLDIER_X");
assert(galOrigin&&freakOrigin,"required source profiles for comparison");
const gal=newbornDistribution(data,galOrigin.id);
const freak=newbornDistribution(data,freakOrigin.id);
assert.equal(gal.bands.bravery.min%10,0);
assert.equal(freak.bands.psiSkill.min,0);
const chance=newbornPairChance(freak,gal);
assert(chance.win>0&&chance.win<1);
console.log("PASS 72 birth RNG profiles, exact finite convolution, quantiles and win/tie probabilities",
  JSON.stringify({gal:gal.total,freak:freak.total,freakWins:chance.win}));
