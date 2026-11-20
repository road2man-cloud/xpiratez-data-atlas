import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {BIRTH_STAT_KEYS} from '../public/soldiers/modern/birth-rng-math.js';
import {chanceWithinIndependentRolls,enumerateRouteBirthFloors}
  from '../public/soldiers/modern/route-birth-screen-frontier.js';

assert.equal(chanceWithinIndependentRolls(0,100),0);
assert.equal(chanceWithinIndependentRolls(1,2),1);
assert.equal(chanceWithinIndependentRolls(0.25,2),0.4375);
assert.equal(chanceWithinIndependentRolls(0.25,3),0.578125);
assert.equal(chanceWithinIndependentRolls(-.1,2),null);
assert.equal(chanceWithinIndependentRolls(.2,0),null);
assert(Math.abs(chanceWithinIndependentRolls(1e-12,10000)-1e-8)<1e-12);

const blank=Object.fromEntries(BIRTH_STAT_KEYS.map(k=>[k,k==='health'?1:k==='bravery'?10:0]));
const low={...blank,tu:5},high={...blank,tu:7};
const profile={id:'X',soldierType:'S',currentStatsOverride:{},
  initialStatsBeforeTraits:{min:low,max:high},
  currentStatsBeforeTraits:{min:low,max:high},
  effectiveStats:{min:low,max:high},traitStats:{},traitCounts:{}};
const body={id:'S',minStats:low,maxStats:high,statCaps:{...high,tu:10}};
const gate={id:'G',allowedSoldierTypes:['S'],requiredMinStats:{tu:7}};
const data={profiles:[profile],soldiers:[body],transformations:[gate],bonuses:[]};
const path=transforms=>({id:transforms.join('+')||'none',profileId:'X',
  finalSoldierType:'S',transforms,
  steps:transforms.map(transform=>({type:'transform',transform}))});
const none=path([]),gated=path(['G']);
const options={screenStat:'tu',objective:'tu',draws:1,requiredChance:.5};
const ungated=enumerateRouteBirthFloors(data,'X',none,options);
assert.equal(ungated.kind,'conditional-screen-frontier',ungated.reason);
assert.equal(ungated.sourceValues,3);
assert.equal(ungated.enumerated.length,3);
assert.deepEqual(ungated.enumerated.map(x=>x.minimum),[5,6,7]);
assert.deepEqual(ungated.enumerated.map(x=>x.screenProbability),
  [1,2/3,1/3]);
assert.deepEqual(ungated.enumerated.map(x=>x.pathChance),[1,1,1]);
assert.deepEqual(ungated.enumerated.map(x=>x.jointChance),[1,2/3,1/3]);
assert.deepEqual(ungated.enumerated.map(x=>x.expectedObjective),[6,6.5,7]);
assert.equal(ungated.selected.minimum,6);
assert.equal(ungated.frontierCount,3);
assert(Math.abs(ungated.enumerated[1].expectedJointDraws-1.5)<1e-10);
const two=enumerateRouteBirthFloors(data,'X',none,{...options,draws:2});
assert.equal(two.selected.minimum,7);
const threshold95=enumerateRouteBirthFloors(data,'X',none,{
  ...options,draws:1,requiredChance:.95
});
assert.equal(threshold95.selected.minimum,5);
const impossible=enumerateRouteBirthFloors(data,'X',none,{
  ...options,draws:1,requiredChance:1.01
});
assert.equal(impossible.kind,'unverified');
const gatedResult=enumerateRouteBirthFloors(data,'X',gated,{
  ...options,draws:2
});
assert.equal(gatedResult.kind,'conditional-screen-frontier');
for(const row of gatedResult.enumerated){
  assert(Math.abs(row.jointChance-1/3)<1e-10);
  assert(Math.abs(row.chanceWithinDraws-5/9)<1e-10);
  assert.equal(row.expectedObjective,7);
}
const before=enumerateRouteBirthFloors(data,'X',gated,{
  ...options,draws:2,growthSchedule:[{
    beforeTransform:0,stats:{tu:{attempts:1,kernel:[[1,1]]}}
  }]
});
assert(Math.abs(before.enumerated[0].jointChance-2/3)<1e-10);
assert(Math.abs(before.enumerated[1].jointChance-2/3)<1e-10);
assert(Math.abs(before.enumerated[2].jointChance-1/3)<1e-10);
assert.equal(enumerateRouteBirthFloors(data,'X',none,{
  ...options,maxThresholds:2
}).kind,'unverified');
assert.equal(enumerateRouteBirthFloors(data,'wrong',none,options).kind,'unverified');
assert.equal(enumerateRouteBirthFloors(data,'X',none,{
  ...options,screenStat:'nonsense'
}).kind,'unverified');

const actualData=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const envelope=JSON.parse(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const report=envelope.compression==='gzip'?
  JSON.parse(zlib.gunzipSync(Buffer.from(envelope.payload,'base64'))):envelope;
const source=report.records.find(x=>x.candidates.length&&
  actualData.profiles.some(p=>p.id===x.profileId));
const now=Date.now();
const sourceResult=enumerateRouteBirthFloors(actualData,source.profileId,
  source.candidates[0],{screenStat:'tu',objective:'total',draws:8,requiredChance:.5});
assert.equal(sourceResult.kind,'conditional-screen-frontier',sourceResult.reason);
assert(sourceResult.enumerated.length>=1);
assert(sourceResult.enumerated.every(x=>x.jointChance<=x.screenProbability+1e-9));
console.log('PASS newborn one-stat floor search, independent-trial probabilities, 12-stat source route, gate-before-growth, attainable selection, runtime '+(Date.now()-now)+'ms');
