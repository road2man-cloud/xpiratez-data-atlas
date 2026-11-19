import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {BIRTH_STAT_KEYS,newbornDistribution,newbornRawPairs} from
  '../public/soldiers/modern/birth-rng-math.js';
import {registeredRouteDistribution} from '../public/soldiers/modern/route-roll-math.js';
import {rankGrowthPlacements} from '../public/soldiers/modern/route-growth-placement.js';
const published=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const noTraining=id=>({profileId:id,steps:[],transforms:[]});
let origins=0;
for(const p of published.profiles){
  const r=registeredRouteDistribution(published,p.id,noTraining(p.id));
  assert.equal(r.kind,'conditional-route-distribution',p.id+' '+r.reason);
  assert(Math.abs(r.expectedTotal-newbornDistribution(published,p.id).total)<1e-7,p.id);
  assert(Math.abs(r.statGateProbability-1)<1e-7,p.id);
  origins++;
}
assert.equal(origins,72);
const empty=Object.fromEntries(BIRTH_STAT_KEYS.map(key=>[key,key==='health'?1:key==='bravery'?10:0]));
const min={...empty,tu:5},max={...empty,tu:7};
const fixed={...empty,tu:12};
const rule=(id,more={})=>({id,allowedSoldierTypes:['S'],...more});
const model=(rules,traits={})=>{
  const profile={id:'P',soldierType:'S',currentStatsOverride:{tu:12},
    currentStatsBeforeTraits:{min:fixed,max:fixed},
    initialStatsBeforeTraits:{min,max},
    previousTransformations:traits.previous||{},
    traitCounts:traits.counts||{},traitStats:traits.stats||{}};
  return {profiles:[profile],
    soldiers:[{id:'S',minStats:min,maxStats:max,
      statCaps:{...empty,tu:13}}],
    transformations:rules,bonuses:[
      {id:'B',stats:{tu:5}},{id:'C',stats:{tu:2}}
    ]};
};
const run=(data,ids,options)=>registeredRouteDistribution(data,'P',
  {profileId:'P',transforms:ids,steps:ids.map(transform=>({type:'transform',transform}))},
  options);
const raw=newbornRawPairs(model([]),'P');
assert.deepEqual(raw.tu.map(x=>x.slice(0,2)),[[12,5],[12,6],[12,7]]);
const pct=model([rule('GAINED',{percentGainedStatChange:{tu:100}})]);
const gained=run(pct,['GAINED']);
assert.equal(gained.kind,'conditional-route-distribution');
assert.deepEqual(gained.perStat.tu.map(([n])=>n),[17,18,19]);
assert(Math.abs(gained.stats.tu-18)<1e-8);
const ranked=rankGrowthPlacements(pct,'P',
  {profileId:'P',transforms:['GAINED'],steps:[{type:'transform',transform:'GAINED'}]},
  {tu:{attempts:1,kernel:[[1,1]]}},'tu');
assert.equal(ranked.kind,'conditional-placement-ranking');
assert.equal(ranked.examined,2);
assert.equal(ranked.best.boundary,0);
assert(ranked.positions[0].score>ranked.positions[1].score);
assert.equal(rankGrowthPlacements(pct,'P',noTraining('P'),{},'bad').kind,'unverified');
const min13=model([rule('GATE',{requiredMinStats:{tu:13}})]);
assert.equal(run(min13,['GATE']).kind,'stat-gated');
const twoEvents={attempts:2,kernel:[[0,.5],[1,.5]]};
const before=run(min13,['GATE'],{growthSchedule:[{
  beforeTransform:0,stats:{tu:twoEvents}
}]});
assert.equal(before.kind,'conditional-route-distribution',before.reason);
assert(Math.abs(before.statGateProbability-.75)<1e-9);
assert.equal(before.stats.tu,13);
const after=run(min13,['GATE'],{growthSchedule:[{
  beforeTransform:1,stats:{tu:twoEvents}
}]});
assert.equal(after.kind,'stat-gated');
const soft=model([rule('SOFT',{flatOverallStatChange:{tu:4},
  upperBoundAtStatCaps:true,upperBoundType:1})]);
soft.soldiers[0].statCaps.tu=10;
assert.equal(run(soft,['SOFT']).stats.tu,12); // already over cap remains high
const hard=model([rule('HARD',{flatOverallStatChange:{tu:4},
  upperBoundAtStatCaps:true,upperBoundType:2})]);
hard.soldiers[0].statCaps.tu=10;
assert.equal(run(hard,['HARD']).stats.tu,10); // explicit hard limit reduces raw
const reset=model([rule('RESET',{reset:true,soldierBonusType:'C'})],
  {counts:{B:1},stats:{tu:5}});
assert.equal(run(reset,[]).stats.tu,17);
const resetRoll=run(reset,['RESET']);
assert.equal(resetRoll.stats.tu,14);
assert.equal(resetRoll.rawStats.tu,12);
assert.equal(resetRoll.bonus.tu,2);
const removal=model([rule('OLD',{soldierBonusType:'B'}),
  rule('REMOVE',{removeTransformations:['OLD']})],
  {previous:{OLD:1},counts:{B:1},stats:{tu:5}});
assert.equal(run(removal,['REMOVE']).stats.tu,12);
const random=model([rule('RANDOM',{flatMin:{tu:1},flatMax:{tu:3}})]);
const randomResult=run(random,['RANDOM']);
assert.deepEqual(randomResult.perStat.tu.map(([n])=>n),[13,14,15]);
assert(Math.abs(randomResult.stats.tu-14)<1e-8);
assert.equal(run(random,['RANDOM'],{maxStates:1}).kind,'unverified');
assert.equal(registeredRouteDistribution(random,'P',
  {profileId:'P',transforms:['RANDOM'],steps:[]}).kind,'unverified');
assert.equal(run(model([]),[],{growthSchedule:[{
  beforeTransform:2,stats:{tu:twoEvents}}]}).kind,'unverified');
const envelope=JSON.parse(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const report=envelope.compression==='gzip'?
  JSON.parse(zlib.gunzipSync(Buffer.from(envelope.payload,'base64'))):envelope;
let ready=0;
for(const row of report.records){
  if(!row.candidates.length)continue;
  const projection=registeredRouteDistribution(published,row.profileId,row.candidates[0]);
  assert.equal(projection.kind,'conditional-route-distribution',
    row.profileId+' '+projection.reason);
  ready++;
}
assert.equal(ready,66);
console.log('PASS registered route RNG: '+origins+' newborn parity, '+ready+
  ' source-backed complete-route samples, growth timing, gates, reset, removal, cap, random');
