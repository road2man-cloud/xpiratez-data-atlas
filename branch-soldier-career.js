// Career-gated route worksheet. This is a conditional medal bonus overlay,
// never a battle/diary replay or a replacement for the published Pareto vector.
export function buildCareerMedalPlan(w,modern,stats){
 if(w?.source!=="CAREER12"||!Array.isArray(w.careerConditions))return null;
 const rules=new Map((modern.transformations||[]).map(t=>[t.id,t]));
 const bonuses=new Map((modern.bonuses||[]).map(b=>[b.id,b]));
 const profile=modern.profiles?.find(p=>p.id===w.originProfile);
 const wanted=new Map(),unresolved=[],possibleExisting=new Set([...(profile?.traitNames||[]),...Object.keys(profile?.traitCounts||{})]);
 const rankSteps=[],retentionRisks=[];
 let stepNumber=0;
 function requireMedal(id,level,step,ruleId){
  if(!Number.isSafeInteger(level)||level<0){unresolved.push("invalid-level:"+id);return;}
  let x=wanted.get(id);
  if(!x){x={id,level,firstStep:step,milestones:[]};wanted.set(id,x);}
  x.level=Math.max(x.level,level);
  x.milestones.push({step,ruleId,level});
 }
 for(const s of w.steps||[]){
  const t=rules.get(s.id),count=s.count??1;
  if(!Number.isSafeInteger(count)||count<1){unresolved.push("invalid-count:"+s.id);continue;}
  if(!t){unresolved.push("missing-transformation:"+s.id);stepNumber+=count;continue;}
  if(t.soldierBonusType)possibleExisting.add(t.soldierBonusType);
  for(let j=0;j<count;j++){
   stepNumber++;
   for(const [id,level] of Object.entries(t.requiredCommendations||{}))requireMedal(id,level,stepNumber,t.id);
   if(t.minRank>0)rankSteps.push({step:stepNumber,id:t.id,required:t.minRank});
   if(t.reset||t.resetRank||t.createsClone||t.producedSoldierType)retentionRisks.push({step:stepNumber,id:t.id,reset:!!t.reset,resetRank:!!t.resetRank,body:t.producedSoldierType||null,clone:!!t.createsClone});
  }
 }
 // Compare source gates recorded with the witness against the current indexed rules.
 for(const c of w.careerConditions){
  const t=rules.get(c.transformation);
  if(!t)continue;
  for(const m of c.medals||[]){
   if(t.requiredCommendations?.[m.id]!==m.decorationIndex)unresolved.push("medal-gate-mismatch:"+m.id);
  }
 }
 const delta=stats.map(()=>0),used=new Set(),rows=[];
 for(const r of wanted.values()){
  const m=modern.commendationIndex?.[r.id];
  if(!m){unresolved.push("missing-medal:"+r.id);rows.push({...r,name:r.id,thresholds:[],bonus:null});continue;}
  const thresholds=Object.entries(m.criteria||{}).map(([field,values])=>({field,value:Array.isArray(values)?values[r.level]??null:null}));
  if(!thresholds.length||thresholds.some(x=>x.value===null))unresolved.push("missing-threshold:"+r.id);
  const bonusId=m.bonusLevels?.[r.level]||null,record=bonusId?bonuses.get(bonusId):null;
  const valid=record&&stats.every(k=>Number.isSafeInteger(record.stats?.[k]));
  if(!valid)unresolved.push("missing-bonus:"+r.id);
  const vector=valid?stats.map(k=>record.stats[k]):null;
  const duplicate=!!bonusId&&used.has(bonusId);
  const overlap=!!bonusId&&possibleExisting.has(bonusId);
  if(vector&&!duplicate&&!overlap){vector.forEach((n,i)=>delta[i]+=n);used.add(bonusId);}
  if(overlap)unresolved.push("possible-existing-bonus:"+bonusId);
  rows.push({...r,name:m.koName||r.id,thresholds,bonusId,bonus:vector,duplicate,overlap,
    killCriteria:Array.isArray(m.killCriteria)?m.killCriteria:[],
    missionTypeFilter:Array.isArray(m.missionTypeFilter)?m.missionTypeFilter:[]});
 }
 if(!profile)unresolved.push("missing-origin-profile");
 const complete=unresolved.length===0;
 const eligible=w.medalBonusesExcluded===true&&complete&&retentionRisks.length===0&&
  Array.isArray(w.vector)&&w.vector.length===stats.length&&w.vector.every(Number.isSafeInteger);
 return {rows,rankSteps,retentionRisks,unresolved:[...new Set(unresolved)],complete,delta,
  combined:eligible?w.vector.map((n,i)=>n+delta[i]):null,
  actualCareerReplayed:false,actualGameCertified:false};
}
