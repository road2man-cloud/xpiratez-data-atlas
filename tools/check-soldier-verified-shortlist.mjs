import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {verifiedShortRoutes} from '../public/soldiers/modern/route-verified-shortlist.js';
import {originRankingCandidates,sharedTerminalCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {preferredOriginCandidate,sameRouteStatVector} from '../public/soldiers/modern/origin-route-tiebreak.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const data=read('public/data/soldiers-modern-index.json');
const dep=read('public/data/soldier-route-dependency-audit.json');
const iter=read('public/data/soldier-route-iterative-audit.json');
const compatible=c=>c.campaignContext?.kind==='compatible';
const score=c=>c.growth?.kind==='conditional-upper-envelope'?c.growth.total:-1;
const stats={origins:0,ordinaryRoutes:0,chortRoutes:0,strictShorterOrdinary:0,strictShorterChort:0};
for(const record of report.records){
  stats.origins++;
  for(const candidate of record.candidates)candidate.growth=projectCandidateGrowthLimit(record,candidate,data);
  for(const [target,select] of [['origin',originRankingCandidates],['chort',sharedTerminalCandidates]]){
    const choices=select(record,compatible);
    const selected=choices.reduce((win,c)=>preferredOriginCandidate(win,c,score),null);
    const matches=verifiedShortRoutes(record,selected,target,dep,iter);
    const key=target==='origin'?'ordinaryRoutes':'chortRoutes';
    stats[key]+=matches.length;
    for(const row of matches){
      const source=record.candidates.find(c=>c.id===row.sourceCandidate);
      assert(source && sameRouteStatVector(source,selected),'No different body/stat vector can leak into the shortlist');
      assert(row.remainingTransforms.length+row.stage===row.originalTransforms);
      assert(row.removedTransforms.length===row.stage);
    }
    if(matches.some(x=>x.remainingTransforms.length<(selected?.transforms||[]).length))
      stats[target==='origin'?'strictShorterOrdinary':'strictShorterChort']++;
    if(selected){
      const wrong={...selected,growth:{...selected.growth,
        stats:{...selected.growth.stats,firing:selected.growth.stats.firing+1}}};
      assert.equal(verifiedShortRoutes(record,wrong,target,dep,iter).length,0,
        'Changed aiming stat must not inherit short-route evidence');
    }
  }
}
const mrshan=report.records.find(r=>r.profileId==='event:STR_MRSHAN_FIGHTER_EVENT');
const chort=sharedTerminalCandidates(mrshan,compatible)
  .reduce((winner,c)=>preferredOriginCandidate(winner,c,score),null);
const shortened=verifiedShortRoutes(mrshan,chort,'chort',dep,iter);
assert.equal(shortened.filter(x=>x.stage===2).length,4);
assert(shortened.some(x=>x.stage===2&&x.remainingTransforms.length===2));
assert.equal(verifiedShortRoutes(mrshan,chort,'origin',dep,iter).length,0);
console.log('PASS replayed shortlist: '+JSON.stringify(stats)+
  '; 4 Chort double omissions, no cross-final body or vector equivalence');
