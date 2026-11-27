// Conservative static scheduling only. Never evidence of active research or final admission.
export function makeOvercapContinuationQueue(unified, registry){
 if(!unified.sourceMetadataSha256||unified.sourceMetadataSha256!==registry.sourceMetadataSha256)throw Error("source metadata mismatch");
 const branches=registry.branches.filter(b=>!b.sourceRootConflict&&b.historyCount);
 const commitments=b=>[...new Set([...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean))].sort();
 const all=new Set(branches.flatMap(commitments));
 const dict=Object.fromEntries(branches.map(b=>[b.id,commitments(b)]));
 const priority=["STR_SOLDIER_HERO","STR_SOLDIER_REPENTANT","STR_SOLDIER_WEIRDGAL"];
 const jobs=unified.rows.map(r=>{
  if(!r.sourceReplayVerified||r.finalAdmission||r.branch!==null||r.commendationStatsIncluded)throw Error("unexpected source status "+r.id);
  const observed=[...new Set(r.researchActions.filter(k=>all.has(k)))].sort(),candidates=[];
  for(const b of branches){
   const required=dict[b.id];if(observed.some(k=>!required.includes(k)))continue;
   const missing=required.filter(k=>!observed.includes(k));
   candidates.push({id:b.id,missingCount:missing.length});
  }
  candidates.sort((a,b)=>a.missingCount-b.missingCount||a.id.localeCompare(b.id));
  return {id:r.id,sourceRecordId:r.sourceRecordId,sourceActionHash:r.hash,origin:r.origin,body:r.body,difficulties:r.difficulties,observedCommitments:observed,order:r.order,traits:r.traits,candidates,status:candidates.length?"BRANCH_CANDIDATE_NOT_REPLAYED":"NO_STATIC_BRANCH_CANDIDATE",finalAdmission:false,materialBudgetVerified:false};
 });
 const p=b=>{const i=priority.indexOf(b);return i<0?priority.length:i};
 jobs.sort((a,b)=>p(a.body)-p(b.body)||Number(!a.candidates.length)-Number(!b.candidates.length)||(a.candidates[0]?.missingCount??999)-(b.candidates[0]?.missingCount??999)||a.id.localeCompare(b.id));
 const byBody={};for(const j of jobs){const s=byBody[j.body]??={rows:0,candidatePairs:0,fullObservedPairs:0,blocked:0};s.rows++;s.candidatePairs+=j.candidates.length;s.fullObservedPairs+=j.candidates.filter(c=>c.missingCount===0).length;s.blocked+=Number(!j.candidates.length);}
 return {schema:"ATLAS_OVERCAP_CONTINUATION_QUEUE_V1",sourceMetadataSha256:unified.sourceMetadataSha256,sourceHash:unified.sourceHash,sourceLedgerHash:unified.sourceLedgerHash,scope:"Static branch candidates; observed historical actions do not prove active commitments, material availability, or a replayed endpoint.",summary:{rows:jobs.length,branches:branches.length,candidatePairs:jobs.reduce((s,j)=>s+j.candidates.length,0),fullObservedPairs:jobs.reduce((s,j)=>s+j.candidates.filter(c=>!c.missingCount).length,0),blocked:jobs.filter(j=>!j.candidates.length).length,finalAdmission:0,byBody},branchCommitments:dict,jobs};
}
export function overcapContinuationPairs(queue,{body="",sourceId=""}={}){
 if(queue.schema!=="ATLAS_OVERCAP_CONTINUATION_QUEUE_V1")throw Error("unsupported queue");
 const pairs=new Set();
 for(const j of queue.jobs)if((!body||j.body===body)&&(!sourceId||j.id===sourceId))for(const c of j.candidates)pairs.add(j.origin+"|"+c.id);
 if(!pairs.size)throw Error("no eligible overcap candidate pairs");
 return pairs;
}
