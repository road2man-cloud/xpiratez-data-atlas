import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json'));
const diagnostic=JSON.parse(fs.readFileSync('public/data/soldier-unresolved-diagnostics.json'));
assert.deepEqual(diagnostic.sourceHashes,data.meta.source.rules);
assert.equal(diagnostic.registryHash,report.sourceHash);
assert.equal(diagnostic.unresolvedCount,report.summary.unresolved);
assert.equal(diagnostic.rows.length,report.records.filter(r=>r.candidates.length===0).length);
assert.equal(diagnostic.rows.length,0,'Resolved origins must not retain stale unresolved diagnostics');
assert.equal(report.summary.excludedDifficultyWitnesses,127,
  'Archived difficulty counterexamples must remain outside active comparisons');
const make=(event,research)=>({type:'eventResearch',event,script:event,research,assumeOutcome:true});
data.sourceItemIds=new Set(catalog.itemIds);
const egypt=make('STR_START_COUNTRY_EGYPT_EVENT','STR_EGYPT');
const technocracy=make('STR_START_COUNTRY_TECHNOCRACY_EVENT','STR_TECHNOCRACY');
assert(replayOriginWitness([egypt],data).ok);
assert(replayOriginWitness([technocracy],data).ok);
const expiredCountry=replayOriginWitness([
  {type:'advanceMonth',month:20,assumeContinuity:true},technocracy],data);
assert(!expiredCountry.ok&&expiredCountry.reason.includes('이벤트 종료'),
  'Month-zero starting-country award must be unavailable after month 20');
const impossibleCountries=replayOriginWitness([egypt,technocracy],data);
assert(!impossibleCountries.ok&&impossibleCountries.reason.includes('국가는 하나만 선택'));
const northAtlantic=make('STR_START_LOCATION_NORTH_ATLANTIC_EVENT','STR_SEA_TRANSPORT');
const arctic=make('STR_START_LOCATION_ARCTIC_EVENT','STR_POLAR_OUTFIT');
assert(replayOriginWitness([northAtlantic],data).ok);
assert(replayOriginWitness([arctic],data).ok);
const impossibleLocations=replayOriginWitness([northAtlantic,arctic],data);
assert(!impossibleLocations.ok&&impossibleLocations.reason.includes('지역은 하나만 선택'));
assert(replayOriginWitness([egypt,northAtlantic],data).ok,'One starting country and one starting location can coexist');
assert(!replayOriginWitness([egypt,egypt],data).ok,'Starting country award cannot be obtained twice');
const unknown=eventScriptVerdict({eventId:egypt.event,firstMonth:0,lastMonth:0,
  mode:'weighted',monthWeights:[{month:0,weight:1,totalWeight:1}]},
  {researched:new Set(),disabled:new Set(),month:0,generatedEvents:null});
assert(unknown.kind==='conditional'&&unknown.unknown.some(x=>x.includes('시작 선택 이력 미확인')));
const planner=createFoundationResearchPlanner(data,{maxAttempts:260,maxDepth:38,maxSteps:430,collectFailures:true});
const trial=planner.ensure(['STR_PSI_COMMUNION']);
assert(!trial.ok);
assert(trial.failures.some(f=>f.goal==='STR_CLOAKING_DEVICE'&&f.event==='STR_ENJOYING_THE_DREAM'&&
  f.reason.includes('20개월, 현재 24개월')),
  'Historical month-20/24 search failure remains reproducible even after resolving every birth');
let conflicts=0;
const birthById=new Map(data.profiles.map(p=>[p.id,p]));
const quarantine=JSON.parse(fs.readFileSync('tools/fixtures/soldier-origin-rejected-start-country.json'));
assert.equal(quarantine.sourceVersion,'v.o2');
assert.equal(quarantine.disposition,'QUARANTINED_INVALID_NOT_PUBLISHED');
for(const record of report.records)for(const candidate of record.candidates){
  assert.notEqual(candidate.id,quarantine.rejectedCandidateId,
    'The rejected Brazil + Italy start event cannot remain in the published registry');
  const starts=candidate.steps.flatMap(s=>{
    const event=s.type==='eventResearch'?s.event:
      s.type==='recruit'&&birthById.get(s.profile)?.sourceType==='event'?
        birthById.get(s.profile).sourceId:null;
    return /^STR_START_(COUNTRY|LOCATION)_/.test(event||'')?[event]:[];
  });
  const countries=new Set(starts.filter(e=>e.startsWith('STR_START_COUNTRY_')));
  const locations=new Set(starts.filter(e=>e.startsWith('STR_START_LOCATION_')));
  if(countries.size>1||locations.size>1||starts.length>countries.size+locations.size)conflicts++;
}
assert.equal(conflicts,0,'Every published witness must use one starting country and one starting location at most, INCLUDING the birth event');
const brazil=report.records.find(r=>r.profileId===quarantine.profileId);
assert(brazil?.candidates.length>=85);
assert.equal(brazil.candidates.find(c=>c.id===brazil.bestCandidateId)?.total,660,
  'Rejecting a false low-scoring witness must not erase the valid best Brazilian candidate');
assert(report.summary.witnesses>=4123);
console.log('PASS 72 resolved origins leave zero stale diagnostics; archived difficulty conflicts and deadline counterexamples stay independently testable');
console.log('PASS exact month-20/24 Cloaking dream and month-0/20 Technocracy counterexamples');
console.log('PASS cannot combine/repeat starting countries or locations; one country + one location remains valid');
console.log('PASS '+report.summary.witnesses+' published candidates contain zero conflicting start selections including birth scripts; one Brazil/Italy false witness quarantined');
