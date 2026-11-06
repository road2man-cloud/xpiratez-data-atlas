// Reproducible 2.1 census of observed COMMON FINAL BODY outcomes.
// Only registered, campaign-compatible, source-replayed candidates count here.
// Not a proof that no unsearched transformation route exists.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {originRankingCandidates,sharedTerminalCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {preferredOriginCandidate} from '../public/soldiers/modern/origin-route-tiebreak.js';

const source=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const bodyById=new Map(source.soldiers.map(x=>[x.id,x]));
const observed=new Map();
const compatible=c=>c.campaignContext?.kind==='compatible';
let ordinaryCount=0,specialCount=0;
for(const record of report.records){
  const ordinary=originRankingCandidates(record,compatible);
  specialCount+=sharedTerminalCandidates(record,compatible).length;
  ordinaryCount+=ordinary.length;
  const projections=ordinary.map(c=>({
    ...c,growth:projectCandidateGrowthLimit(record,c,source)
  }));
  for(const c of projections)assert.equal(c.growth.kind,'conditional-upper-envelope',
    'A non-ready growth path cannot enter the observed census: '+c.id);
  const best=projections.reduce((winner,c)=>
    preferredOriginCandidate(winner,c,x=>x.growth.total),null);
  for(const c of projections){
    const row=observed.get(c.finalSoldierType)||{
      id:c.finalSoldierType,sourceOrigins:new Set(),sourceSoldierTypes:new Set(),
      selectedOrigins:new Set(),witnessCount:0,highestGrowthSum:0
    };
    assert(bodyById.has(row.id),'Unknown final soldier body '+row.id);
    row.sourceOrigins.add(record.profileId);
    row.sourceSoldierTypes.add(record.soldierType);
    if(best===c)row.selectedOrigins.add(record.profileId);
    row.witnessCount++;
    row.highestGrowthSum=Math.max(row.highestGrowthSum,c.growth.total);
    observed.set(row.id,row);
  }
}
assert.equal(report.records.length,72);
assert.equal(ordinaryCount,4306);
assert.equal(specialCount,61);
const bodies=[...observed.values()].map(row=>({
  id:row.id,name:bodyById.get(row.id).koName||row.id,
  sourceOriginCount:row.sourceOrigins.size,
  distinctBirthBodyTypes:row.sourceSoldierTypes.size,
  chosenAsBestOriginCount:row.selectedOrigins.size,
  witnessCount:row.witnessCount,highestConditionalGrowthSum:row.highestGrowthSum,
  sourceSoldierTypes:[...row.sourceSoldierTypes].sort(),
  observedBirthOrigins:[...row.sourceOrigins].sort()
})).sort((a,b)=>b.chosenAsBestOriginCount-a.chosenAsBestOriginCount||
  b.sourceOriginCount-a.sourceOriginCount||a.id.localeCompare(b.id));
const multiclass=bodies.filter(x=>x.distinctBirthBodyTypes>1);
const audit={
  kind:'xpz-observed-shared-final-bodies-v1',sourceVersion:report.sourceVersion,
  sourceHash:report.sourceHash,registeredBirthOrigins:report.records.length,
  compatibleCandidates:ordinaryCount,chortCandidatesExcluded:specialCount,
  observedIndependentFinalBodies:bodies.length,
  observedBodiesWithMultipleBirthTypes:multiclass.length,
  possibleExtraSharedTargets:multiclass.map(x=>x.id),
  interpretation:'Only observed, source-backed, compatible routes. A zero does not prove unsearched transformations impossible. No body is automatically excluded from birth rankings.',
  bodies
};
if(process.argv.includes('--check')){
  const existing=JSON.parse(fs.readFileSync('public/data/soldier-observed-final-body-census.json','utf8'));
  assert.deepEqual(existing,audit,'Published observed final-body census does not match original 2.1 witnesses');
  const html=fs.readFileSync('public/soldiers/modern/index.html','utf8');
  assert(html.includes('data-other-final-body-census="true"'),'User-facing census explanation missing');
  assert(html.includes('코르트 외 최종 병종 '+bodies.length+'종'),'Displayed body count stale');
  assert(html.includes('추가 분리 검토 후보 '+multiclass.length+'종'),'Displayed shared-target count stale');
  console.log('PASS observed other-final-body census: '+ordinaryCount+' paths / '+bodies.length+
    ' final bodies / '+multiclass.length+' multi-birth-type shared targets; no automatic exclusions');
}else process.stdout.write(JSON.stringify(audit,null,2)+'\n');
