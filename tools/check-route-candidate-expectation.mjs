import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {candidateRollSummary,rankCandidateRollSummaries,ROUTE_EXPECTATION_OBJECTIVES}
  from '../public/soldiers/modern/route-candidate-expectation.js';
import {registeredRouteDistribution}
  from '../public/soldiers/modern/route-roll-math.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const envelope=JSON.parse(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const report=envelope.compression==='gzip'?
  JSON.parse(zlib.gunzipSync(Buffer.from(envelope.payload,'base64'))):envelope;
const origin=report.records.find(x=>x.candidates.length>3);
assert(origin);
const sample=origin.candidates.slice(0,4);
const baseline=sample.map(candidate=>candidateRollSummary(data,origin.profileId,candidate));
assert(baseline.every(x=>x.kind==='source-conditional-candidate'));
for(let i=0;i<sample.length;i++){
  const exact=registeredRouteDistribution(data,origin.profileId,sample[i]);
  assert(Math.abs(baseline[i].expectedTotal-exact.expectedTotal)<1e-9);
  assert(Math.abs(baseline[i].statGateProbability-exact.statGateProbability)<1e-9);
}
const modeBefore=candidateRollSummary(data,origin.profileId,sample[0],
  {timing:'before',attempts:2,success:50});
const modeAfter=candidateRollSummary(data,origin.profileId,sample[0],
  {timing:'after',attempts:2,success:50});
assert.equal(modeBefore.kind,'source-conditional-candidate',modeBefore.reason);
assert.equal(modeAfter.kind,'source-conditional-candidate',modeAfter.reason);
assert.equal(candidateRollSummary(data,'wrong-origin',sample[0]).kind,'unverified');
assert.equal(candidateRollSummary(data,origin.profileId,sample[0],
  {timing:'invalid'}).kind,'unverified');

const keys=ROUTE_EXPECTATION_OBJECTIVES.filter(x=>x!=='total');
assert.equal(keys.length,12);
const model=(id,score,prob,body='S')=>({
  kind:'source-conditional-candidate',id,finalSoldierType:body,
  expectedTotal:score,stats:Object.fromEntries(keys.map(k=>[k,k==='tu'?score:0])),
  statGateProbability:prob,transformCount:0,researchCount:0,assumptions:0
});
const entries=[
  model('more',110,.25),model('safer',100,.90),model('dominated',95,.20),
  model('other-body',90,1,'T'),model('tie-one',100,.9),model('tie-two',100,.9),
  {kind:'stat-gated',id:'blocked',reason:'stat gate 0'},
  {kind:'unverified',id:'missing',reason:'unknown engine'}
];
const ranked=rankCandidateRollSummaries(entries);
assert.equal(ranked.kind,'conditional-candidate-ranking');
assert.equal(ranked.registered,8);
assert.equal(ranked.computed,6);
assert.equal(ranked.statBlocked.length,1);
assert.equal(ranked.unverified.length,1);
assert.equal(ranked.ranked[0].id,'more');
assert(ranked.ranked.find(x=>x.id==='safer').onFrontier);
assert(ranked.ranked.find(x=>x.id==='tie-one').onFrontier);
assert.equal(ranked.ranked.find(x=>x.id==='dominated').onFrontier,false);
assert(ranked.ranked.find(x=>x.id==='other-body').onFrontier);
assert.equal(ranked.frontierCount,5);
assert.equal(rankCandidateRollSummaries(entries,{minGate:.8}).ranked.length,4);
assert.equal(rankCandidateRollSummaries(entries,{body:'T'}).ranked.length,1);
assert.equal(rankCandidateRollSummaries(entries,{objective:'tu'}).ranked[0].id,'more');
assert.equal(rankCandidateRollSummaries(entries,{objective:'missing'}).kind,'unverified');
assert.equal(rankCandidateRollSummaries(entries,{minGate:-.1}).kind,'unverified');
assert.equal(rankCandidateRollSummaries([model('dup',1,.9),model('dup',2,1)]).kind,'unverified');
assert.equal(rankCandidateRollSummaries([{...model('bad',100,.5),stats:{tu:12}}]).kind,'unverified');

const realRank=rankCandidateRollSummaries(baseline,{objective:'tu',minGate:0});
assert.equal(realRank.kind,'conditional-candidate-ranking');
assert.equal(realRank.registered,sample.length);
assert(realRank.ranked.every(x=>x.statGateProbability>=0&&x.statGateProbability<=1));
assert(realRank.best);
console.log('PASS source registered candidate expectation ranking, 12 goals, two-axis frontiers, body separation, missing-source fail-closed, hypothetical growth settings');
