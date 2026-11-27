import {STAT_KEYS,statChangeEngineEstimate} from './soldiers/modern/eligibility.js';

// Candidate production, not a campaign-feasibility certificate.
// Enumerate every body and every same-body maxStats transformation.
export function buildOverCapTrainingCandidates(data) {
  const rows=[],unknown=[];
  for(const body of data.soldiers) {
    for(const rule of data.transformations) {
      if(rule.upperBoundAtMaxStats!==true || rule.createsClone || rule.producedItem ||
         (rule.producedSoldierType && rule.producedSoldierType!==body.id) ||
         !rule.allowedSoldierTypes?.includes(body.id) ||
         rule.forbiddenSoldierTypes?.includes(body.id)) continue;
      const axes=STAT_KEYS.filter(k=>Number.isSafeInteger(body.maxStats?.[k]) &&
        Number.isSafeInteger(body.statCaps?.[k]) && body.maxStats[k]>body.statCaps[k]);
      if(!axes.length) continue;
      if(STAT_KEYS.some(k=>!Number.isSafeInteger(body.statCaps?.[k]) ||
        !Number.isSafeInteger(body.minStats?.[k]) || !Number.isSafeInteger(body.maxStats?.[k]))) {
        unknown.push({body:body.id,rule:rule.id,reason:'missing stat bounds'});continue;
      }
      const currentStats={...body.statCaps},initialStats={...body.minStats};
      const result=statChangeEngineEstimate(rule,{soldierType:body.id,currentStats,initialStats},data);
      const gains=axes.map(k=>({stat:k,battleCap:currentStats[k],maxStats:body.maxStats[k],
        representative:result.stats[k],extra:Math.max(0,result.stats[k]-currentStats[k])}));
      const positive=gains.filter(g=>g.extra>0);
      if(!positive.length&&!result.hasUnmodelled)continue;
      rows.push({body:body.id,rule:rule.id,gains,extra:positive.reduce((s,g)=>s+g.extra,0),
        uncertain:result.hasUnmodelled,requires:rule.requires||[],
        previous:rule.requiredPreviousTransformations||[],
        forbiddenPrevious:rule.forbiddenPreviousTransformations||[],
        scope:'CONDITIONAL_CAP_FIRST_CANDIDATE',campaignVerified:false});
    }
  }
  rows.sort((a,b)=>b.extra-a.extra||a.body.localeCompare(b.body)||a.rule.localeCompare(b.rule));
  return {rows,unknown,scope:'ALL_BODY_SAME_BODY_MAX_STATS_CANDIDATES'};
}

// Feed only eligible candidates to a caller's canonical replay queue.
// Never replace existing witnesses or silently treat eligibility as satisfied.
export function scheduleOverCapCandidates(report,states,enqueue) {
  let count=0;
  for(const row of report.rows)for(const state of states) {
    if(state.soldierType!==row.body)continue;
    enqueue({state,transform:row.rule,growBefore:true,priority:row.extra,
      requiresCanonicalReplay:true,uncertain:row.uncertain});count++;
  }
  return count;
}
