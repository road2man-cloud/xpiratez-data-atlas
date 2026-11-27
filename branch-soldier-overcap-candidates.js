import {STAT_KEYS,statChangeEngineEstimate} from './soldiers/modern/eligibility.js';

// Conditional candidate generation. No research/trait/chronology admission is implied.
export function buildOverCapTrainingCandidates(data) {
  const rows=[],unknown=[],bodies=[];
  const integer=Number.isSafeInteger;
  for(const body of data.soldiers) {
    const complete=STAT_KEYS.every(k=>integer(body.statCaps?.[k])&&integer(body.minStats?.[k])&&integer(body.maxStats?.[k]));
    const axes=STAT_KEYS.filter(k=>integer(body.maxStats?.[k])&&integer(body.statCaps?.[k])&&body.maxStats[k]>body.statCaps[k]);
    bodies.push({id:body.id,name:body.koName||body.enName||body.id,axes:axes.map(k=>({stat:k,battleCap:body.statCaps[k],maxStats:body.maxStats[k]})),complete});
    if(!complete){unknown.push({body:body.id,reason:'missing stat bounds'});continue}
    if(!axes.length)continue;
    const grow=(stats)=>Object.fromEntries(STAT_KEYS.map(k=>{
      const v=stats[k],cap=body.statCaps[k];
      return [k,(k==='mana'&&!data.growthRules?.manaPrimary&&!data.growthRules?.manaSecondary)||v>=cap?v:k==='bravery'?v+10*Math.floor((cap-v)/10):cap];
    }));
    const initialStats={...body.minStats},base=grow(initialStats);
    const estimate=(rule,currentStats)=>statChangeEngineEstimate(rule,{soldierType:body.id,currentStats,initialStats},data);
    // For bounded independent roll intervals, choose the positive or negative
    // endpoint according to the coefficient; do not call this an expectation.
    const endpoint=(rule,stats,high)=>{
      const r={...rule};
      for(const field of ['flat','percent','percentGained']){
        r[field+'Min']={};r[field+'Max']={};
        for(const k of STAT_KEYS){
          const lo=rule[field+'Min']?.[k]??0,hi=rule[field+'Max']?.[k]??0;
          const coefficient=field==='flat'?1:field==='percent'?stats[k]:stats[k]-initialStats[k];
          const v=(high===(coefficient>=0))?hi:lo;
          r[field+'Min'][k]=r[field+'Max'][k]=v;
        }
      }
      const result=estimate(r,stats).stats;
      for(const k of STAT_KEYS)if(rule.rerollStats?.[k]===true)
        result[k]=k==='psiSkill'?body.minStats[k]:k==='bravery'?10*Math.trunc((high?body.maxStats[k]:body.minStats[k])/10):(high?body.maxStats[k]:body.minStats[k]);
      return result;
    };
    for(const rule of data.transformations) {
      if(rule.upperBoundAtMaxStats!==true||rule.createsClone||rule.producedItem||
        rule.allowsLiveSoldiers===false||(rule.producedSoldierType&&rule.producedSoldierType!==body.id)||
        !rule.allowedSoldierTypes?.includes(body.id)||rule.forbiddenSoldierTypes?.includes(body.id))continue;
      const uncertain=STAT_KEYS.some(k=>rule.rerollStats?.[k]===true||['flat','percent','percentGained'].some(f=>(rule[f+'Min']?.[k]??0)!==(rule[f+'Max']?.[k]??0)));
      const afterLow=grow(endpoint(rule,base,false)),afterHigh=grow(endpoint(rule,base,true));
      const beforeLow=grow(endpoint(rule,initialStats,false)),beforeHigh=grow(endpoint(rule,initialStats,true));
      if([afterLow,afterHigh,beforeLow,beforeHigh].some(v=>STAT_KEYS.some(k=>!integer(v[k])||v[k]<(k==='health'?1:0)))){
        unknown.push({body:body.id,rule:rule.id,reason:'invalid representative result'});continue;
      }
      const gains=axes.map(k=>({stat:k,battleCap:body.statCaps[k],maxStats:body.maxStats[k],baseline:base[k],
        representative:afterLow[k],high:afterHigh[k],beforeGrowth:beforeLow[k],beforeGrowthHigh:beforeHigh[k],
        extra:Math.max(0,afterLow[k]-Math.max(base[k],body.statCaps[k])),
        possibleExtra:Math.max(0,afterHigh[k]-Math.max(base[k],body.statCaps[k])),
        timingGain:uncertain?null:afterLow[k]-beforeLow[k]})).filter(g=>g.possibleExtra>0);
      if(!gains.length)continue;
      const extra=gains.reduce((s,g)=>s+g.extra,0),possibleExtra=gains.reduce((s,g)=>s+g.possibleExtra,0);
      rows.push({body:body.id,bodyName:body.koName||body.enName||body.id,rule:rule.id,ruleName:rule.koName||rule.enName||rule.id,
        gains,extra,possibleExtra,uncertain,requires:rule.requires||[],requiresBaseFunc:rule.requiresBaseFunc||[],
        requiredItems:rule.requiredItems||{},previous:rule.requiredPreviousTransformations||[],
        forbiddenPrevious:rule.forbiddenPreviousTransformations||[],requiredMinStats:rule.requiredMinStats||null,
        requiredMaxStats:rule.requiredMaxStats||null,minRank:rule.minRank??0,requiredCommendations:rule.requiredCommendations||{},
        upperBoundAtStatCaps:rule.upperBoundAtStatCaps===true,scope:'CONDITIONAL_CAP_FIRST_CANDIDATE',campaignVerified:false});
    }
  }
  rows.sort((a,b)=>b.extra-a.extra||b.possibleExtra-a.possibleExtra||a.body.localeCompare(b.body)||a.rule.localeCompare(b.rule));
  return {rows,unknown,bodies,scope:'ALL_BODY_SAME_BODY_MAX_STATS_CANDIDATES'};
}

export function scheduleOverCapCandidates(report,states,enqueue){
  let count=0;
  const byBody=new Map();
  for(const state of states){const group=byBody.get(state.soldierType)||[];group.push(state);byBody.set(state.soldierType,group)}
  for(const row of report.rows)for(const state of byBody.get(row.body)||[]){
    enqueue({state,transform:row.rule,growBefore:true,priority:row.extra,possiblePriority:row.possibleExtra,
      requiresCanonicalReplay:true,uncertain:row.uncertain});count++;
  }
  return count;
}

export function makeOverCapReport(data,sourceRuntimeBlob=null){
  const result=buildOverCapTrainingCandidates(data);
  return {schema:'ATLAS_OVERCAP_CANDIDATES_V2',sourceMetadataSha256:data.meta?.source?.metadataSha256??null,
    modVersion:data.meta?.mod?.version??null,sourceRuntimeBlob,statLabels:data.statLabels,summary:{
      scannedBodies:result.bodies.length,scannedRules:data.transformations.length,
      capGapBodies:result.bodies.filter(b=>b.axes.length>0).length,beneficiaryBodies:new Set(result.rows.map(r=>r.body)).size,
      candidates:result.rows.length,positiveRepresentative:result.rows.filter(r=>r.extra>0).length,
      randomCandidates:result.rows.filter(r=>r.uncertain).length,unknown:result.unknown.length},...result};
}
