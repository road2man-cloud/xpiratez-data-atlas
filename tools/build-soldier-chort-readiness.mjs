// X-Piratez 2.1 canonical source-backed Chort starting-origin audit.
// Distinguishes rule-level eligibility, individual Psi and replayed conditional paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {sharedTerminalSourceAudit,sharedTerminalCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';

const file='public/data/soldier-chort-readiness.json';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const sourceCatalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
const names=sourceCatalog.names||{};
const named=id=>({id,name:names[id]||id});
const evidenceCompatible=c=>c.campaignContext?.kind==='compatible';
const audit=sharedTerminalSourceAudit(data);
const recordById=new Map(report.records.map(r=>[r.profileId,r]));
const profileById=new Map(data.profiles.map(p=>[p.id,p]));
const sources=audit.origins.map(origin=>{
  const profile=profileById.get(origin.id),record=recordById.get(origin.id);
  assert(profile&&record,'Missing registered candidate/source: '+origin.id);
  const witnesses=sharedTerminalCandidates(record,evidenceCompatible);
  const projected=witnesses.map(c=>({candidate:c,
    result:projectCandidateGrowthLimit(record,c,data)}));
  assert(projected.every(p=>p.result.kind==='conditional-upper-envelope'),
    'Unprojectable Chort source witness: '+origin.id);
  const highest=projected.reduce((a,b)=>!a||b.result.total>a.result.total?b:a,null);
  return {
    id:origin.id,source:origin.name,sourceType:profile.sourceType,
    startBody:origin.soldierType,startBodyName:profile.soldierKoName||origin.soldierType,
    psiMin:origin.psiMin,psiMax:origin.psiMax,initialPsiStatus:origin.initialPsiStatus,
    startingRank:profile.rank??0,
    acquisitionCost:profile.cost??null,
    acquisitionTimeRaw:profile.time??null,
    salary:profile.salary??null,
    acquisitionRequiredItems:Object.entries(profile.acquisitionRequiredItems||{}).map(([id,quantity])=>({...named(id),quantity})),
    acquisitionResearch:(profile.requires||[]).map(named),
    acquisitionBaseFunctions:profile.requiresBaseFunc||[],
    replayedChortCandidates:witnesses.length,
    bestConditionalGrowth:highest?.result.total??null,
    bestCandidateId:highest?.candidate.id??null,
    // A replay certificate is not a realized transformation or an attainable stat maximum.
    replayMeaning:witnesses.length?'conditional-chronology-witness':'no-complete-chort-witness-yet'
  };
});
const result={
  kind:'xpz-chort-starting-source-audit-v1',
  sourceVersion:report.sourceVersion,sourceHash:report.sourceHash,
  sourceRules:data.meta.source.rules,
  transformationId:audit.transformId,finalSoldierType:audit.bodyId,
  transformation:{
    name:audit.rule.koName||audit.transformId,
    psiThreshold:audit.threshold,
    minRank:audit.rule.minRank,
    resetPreviousTraining:audit.rule.reset===true,
    requiredItems:Object.entries(audit.rule.requiredItems||{}).map(([id,quantity])=>({...named(id),quantity})),
    requiredResearch:(audit.rule.requires||[]).map(named),
    baseFunctions:audit.rule.requiresBaseFunc||[],
    forbiddenTraining:(audit.rule.forbiddenPreviousTransformations||[]).map(named),
    transformationCost:audit.rule.cost??null,
    transformationTimeRaw:audit.rule.time??null
  },
  summary:{
    permittedStartBodyTypes:audit.types.length,
    sourceOrigins:sources.length,
    initiallyMeetsPsi:sources.filter(s=>s.initialPsiStatus==='meets').length,
    individuallyCheckPsi:sources.filter(s=>s.initialPsiStatus==='depends').length,
    belowInitialPsi:sources.filter(s=>s.initialPsiStatus==='below').length,
    originsWithChronologyWitness:sources.filter(s=>s.replayedChortCandidates>0).length,
    chronologyWitnesses:sources.reduce((n,s)=>n+s.replayedChortCandidates,0),
    certifiedGlobalMaxima:0
  },
  sources
};
assert.equal(result.summary.sourceOrigins,42);
assert.equal(result.summary.permittedStartBodyTypes,16);
assert.equal(result.summary.initiallyMeetsPsi,17);
assert.equal(result.summary.individuallyCheckPsi,25);
assert.equal(result.summary.belowInitialPsi,0);
assert.equal(result.summary.chronologyWitnesses,61);
assert.equal(result.summary.originsWithChronologyWitness,3);
const farmer=sources.find(s=>s.id==='direct:STR_SOLDIER_PEASANT');
const clone=sources.find(s=>s.id==='manufacture:STR_THEBAN_ASSAULT_CLONE');
assert(farmer&&clone);
assert.deepEqual([farmer.acquisitionCost,farmer.psiMin,farmer.psiMax],[5000,20,70]);
assert.deepEqual([clone.acquisitionCost,clone.psiMin,clone.psiMax],[10000,50,50]);
assert(clone.replayedChortCandidates>0&&clone.bestConditionalGrowth===2131);
const json=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--stdout'))process.stdout.write(json);
else if(process.argv.includes('--check')){
  // Git text checkout can be CRLF on Windows even when the canonical blob uses LF.
  assert.equal(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),json,
    'Published Chort eligibility snapshot stale');
  console.log('PASS Chort readiness audit: '+JSON.stringify(result.summary));
}else throw Error('Use --stdout to create the source snapshot or --check to verify it');
