import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {originRankingCandidates,sharedTerminalCandidates,sharedTerminalSourceAudit,
  isSharedTerminalCandidate} from '../public/soldiers/modern/shared-terminal-targets.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const compatible=c=>c.campaignContext?.kind==='compatible';
const audit=sharedTerminalSourceAudit(data);
assert.equal(audit.bodyId,'STR_SOLDIER_CHORT');
assert.equal(audit.transformId,'STR_CHORT_SUMMONING');
assert.equal(audit.rule.reset,true);
assert.equal(audit.types.length,16);
assert.equal(new Set(audit.types.map(x=>x.id)).size,16);
assert.equal(audit.threshold,40);
assert.equal(audit.origins.length,42);
assert.equal(audit.fixedPsi,17);
assert.equal(audit.variablePsi,25);
assert.equal(audit.belowPsi,0);
assert(audit.types.some(x=>x.id==='STR_SOLDIER_PEASANT'&&x.name==='농부'));
const peasant=audit.origins.find(x=>x.id==='direct:STR_SOLDIER_PEASANT');
assert(peasant&&peasant.initialPsiStatus==='depends'&&peasant.psiMin===20&&peasant.psiMax===70);
const clone=audit.origins.find(x=>x.id==='manufacture:STR_THEBAN_ASSAULT_CLONE');
assert(clone&&clone.psiMin===50&&clone.psiMax===50&&clone.initialPsiStatus==='meets');

let ranked=0,terminal=0,withTerminal=0;
for(const record of report.records){
  const ordinary=originRankingCandidates(record,compatible);
  const specials=sharedTerminalCandidates(record,compatible);
  const all=record.candidates.filter(compatible);
  assert.equal(ordinary.length+specials.length,all.length);
  assert(ordinary.every(c=>!isSharedTerminalCandidate(c)),
    'Shared target leaked into birth ranking: '+record.profileId);
  assert(specials.every(c=>isSharedTerminalCandidate(c)),
    'Unrelated transformation was misplaced as shared terminal');
  assert(ordinary.length>0,'An origin lost ALL independent paths: '+record.profileId);
  if(specials.length)withTerminal++;
  ranked+=ordinary.length;terminal+=specials.length;
}
assert.equal(ranked+terminal,report.summary.compatibleWitnesses);
assert(report.summary.compatibleWitnesses>=4367,'Previously verified paths disappeared');
assert(ranked>=4306,'Previously verified ordinary origin paths disappeared');
assert.equal(terminal,61);
assert.equal(withTerminal,3);

// The assault clone's original witness is preserved, but its separate
// Chort growth cap can never overwrite that origin's own ordinary top row.
const assault=report.records.find(x=>x.profileId==='manufacture:STR_THEBAN_ASSAULT_CLONE');
const ordinary=originRankingCandidates(assault,compatible);
const specials=sharedTerminalCandidates(assault,compatible);
const chortBest=specials.reduce((v,c)=>{
  const g=projectCandidateGrowthLimit(assault,c,data);
  return g.kind==='conditional-upper-envelope'&&g.total>v?g.total:v;
},-1);
assert.equal(chortBest,2131);
assert(ordinary.every(c=>c.finalSoldierType!=='STR_SOLDIER_CHORT'));
assert(specials.some(c=>c.id==='b6f71815d00481953550'),
  'Published Chort paths must remain available as replay evidence');

// Classification is by terminal BODY, never by whether Chort appears in
// earlier training history. A later body-changing route is not a Chort result.
assert.equal(isSharedTerminalCandidate({
  finalSoldierType:'STR_SOLDIER_NEKOMIMI',transforms:['STR_CHORT_SUMMONING']}),false);
console.log('PASS shared terminal separation: 16 permitted source bodies, 42 origins (17 fixed / 25 variable Psi), 61 Chort paths retained separately, '+ranked+' independent paths across all 72 births');
