// Preserve concrete failed-attempt evidence for any unresolved v.o2 origins.
// Source rules and all currently published candidates are read-only. No invented grant.
// A failed bounded search is NOT proof of a permanent campaign impossibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
import {decodeOriginReport} from './origin-report-codec.mjs';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json'));
assert.equal(data.meta.mod.version,'v.o2');
assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
assert.deepEqual(report.sourceHashes,data.meta.source.rules);
assert.equal(report.summary.profiles,72);
data.sourceItemIds=new Set(catalog.itemIds);
const rows=[];
for(const record of report.records.filter(r=>!r.candidates.length)){
  const id=record.unresolved?.id;
  assert(data.researchRules[id],'Unresolved research topic not indexed: '+record.profileId);
  const root=data.researchRules[id];
  const goals=[...new Set([
    id,
    ...root.dependencies.slice(0,5),
    ...record.researchBottlenecks.flatMap(x=>x.id?[x.id]:[])
  ])].slice(0,6);
  const trials=[],episodes=[];
  for(const goal of goals){
    const planner=createFoundationResearchPlanner(data,{
      maxAttempts:260,maxDepth:38,maxSteps:430,collectFailures:true
    });
    const result=planner.ensure([goal]);
    trials.push({goal,success:result.ok,attempts:result.attempts,
      ...(result.ok?{endedMonth:result.node.world.month,steps:result.node.steps.length}:
      {unresolved:result.unresolved,reason:result.reason})});
    const seen=new Set();
    for(const f of result.failures||[]){
      const match=/이벤트 종료:\s*(\d+)개월,\s*현재\s*(\d+)개월/.exec(f.reason);
      if(!match)continue;
      const item={probe:goal,blockedResearch:f.goal,event:f.event,script:f.script,
        deadlineMonth:Number(match[1]),attemptMonth:Number(match[2]),
        method:f.method,reason:f.reason};
      const key=[item.probe,item.blockedResearch,item.event,item.script,
        item.deadlineMonth,item.attemptMonth].join('|');
      if(seen.has(key))continue;seen.add(key);
      episodes.push(item);
    }
  }
  rows.push({profileId:record.profileId,rootResearch:id,reportedReason:record.unresolved?.reason||'',
    recordedGateIds:record.researchBottlenecks.map(g=>g.id),
    probes:trials,deadlineFailures:episodes.slice(0,18),
    searchScope:'BOUNDED_FAILED_ATTEMPTS_NOT_IMPOSSIBILITY_PROOF'});
}
const output={schemaVersion:1,sourceVersion:'v.o2',
  sourceHashes:data.meta.source.rules,registryHash:report.sourceHash,
  note:'Failed planner attempts start from zero research; incidents identify a failed chronology only, not all alternative paths or game impossibility.',
  unresolvedCount:rows.length,rows};
assert.equal(output.unresolvedCount,report.summary.unresolved);
const filename='public/data/soldier-unresolved-diagnostics.json';
if(process.argv.includes('--check')){
  const expected=JSON.parse(fs.readFileSync(filename,'utf8'));
  assert.deepEqual(expected,output);
  console.log('PASS unresolved chronology diagnostics: '+rows.length+
    ' source-matched origins / '+rows.reduce((n,r)=>n+r.deadlineFailures.length,0)+
    ' scoped expiration attempts; no witness overwrite');
}else if(process.argv.includes('--build')){
  fs.writeFileSync(filename,JSON.stringify(output)+'\n');
  console.log('Built '+filename+': '+rows.length+' unresolved, '+
    rows.reduce((n,r)=>n+r.deadlineFailures.length,0)+' failed window observations');
}else throw Error('Use --build or --check');
