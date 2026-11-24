// Snapshot-based career gate evaluator. Never assigns ranks, medals, kills or XP.
// Input counters must already use the engine's medal-specific diary semantics.
const int=n=>Number.isSafeInteger(n)&&n>=0;
export function evaluateCareerMilestones(plan,modern,snapshot={}){
 if(!plan||!modern)throw Error("Missing career plan or source");
 const afterStep=snapshot.afterStep??0;
 if(!int(afterStep))throw Error("Invalid completed action count");
 const rank=int(snapshot.rank)?snapshot.rank:null;
 const medals=snapshot.medals||{},counters=snapshot.counters||{};
 const index=modern.commendationIndex||{};
 const future=new Map();
 const stage=(step,id)=>{
  const key=step+"|"+id;
  if(!future.has(key))future.set(key,{step,id,rank:null,medals:[]});
  return future.get(key);
 };
 for(const r of plan.rankSteps||[])if(r.step>afterStep)stage(r.step,r.id).rank=r.required;
 for(const row of plan.rows||[])for(const m of row.milestones||[])if(m.step>afterStep)
  stage(m.step,m.ruleId).medals.push({id:row.id,name:row.name,level:m.level});
 const stages=[...future.values()].sort((a,b)=>a.step-b.step||a.id.localeCompare(b.id));
 for(const s of stages){
  const intervening=(plan.retentionRisks||[]).filter(x=>x.step>afterStep&&x.step<s.step);
  const rankReset=intervening.some(x=>x.resetRank||x.reset||x.body||x.clone);
  const medalReset=intervening.some(x=>x.reset||x.body||x.clone);
  const rankNow=rankReset?null:rank;
  s.rankGate=s.rank==null?null:{required:s.rank,current:rankNow,
   gap:rankNow===null?null:Math.max(0,s.rank-rankNow),
   status:rankReset?"RECHECK_AFTER_CHANGE":rankNow===null?"UNKNOWN":rankNow>=s.rank?"HELD":"NEEDS_PROMOTION"};
  s.medalGates=s.medals.map(m=>{
   const rule=index[m.id];
   const owned=Object.hasOwn(medals,m.id)&&Number.isSafeInteger(medals[m.id])&&medals[m.id]>=-1?medals[m.id]:null;
   const observed=medalReset?null:owned;
   const knownCounters=counters[m.id]||{};
   const thresholds=Object.entries(rule?.criteria||{}).map(([field,values])=>{
    const required=Array.isArray(values)&&int(values[m.level])?values[m.level]:null;
    const current=!medalReset&&int(knownCounters[field])?knownCounters[field]:null;
    return {field,required,current,gap:required!==null&&current!==null?Math.max(0,required-current):null};
   });
   const valid=int(m.level)&&thresholds.length>0&&thresholds.every(x=>x.required!==null);
   const met=valid&&thresholds.every(x=>x.gap===0);
   const short=valid&&thresholds.some(x=>x.gap!==null&&x.gap>0);
   const status=medalReset?"RECHECK_AFTER_CHANGE":observed!==null&&observed>=m.level?"HELD":
    !valid?"UNKNOWN_RULE":short?"COUNTER_SHORT":met?"AWARD_NOT_CONFIRMED":"UNKNOWN";
   return {...m,owned:observed,thresholds,status};
  });
  const gates=[...(s.rankGate?[s.rankGate]:[]),...s.medalGates];
  s.status=gates.every(x=>x.status==="HELD")?"CAREER_GATES_HELD_IN_SNAPSHOT":
    gates.some(x=>["NEEDS_PROMOTION","COUNTER_SHORT"].includes(x.status))?"CAREER_GAP":
    "CAREER_UNCONFIRMED";
  s.interveningChanges=intervening;
  s.actualGameCertified=false;
 }
 return {afterStep,stages,actualCareerReplayed:false,actualGameCertified:false};
}
