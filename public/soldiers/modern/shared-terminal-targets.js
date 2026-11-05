// X-Piratez 2.1 — Shared terminal transformations are their own targets,
// not interchangeable endgame growth scores for unrelated birth profiles.
// Keep source witnesses intact. Only the main birth-comparison view excludes
// these terminal bodies; their source paths remain inspectable separately.
export const SHARED_TERMINALS=Object.freeze([
  Object.freeze({transformId:'STR_CHORT_SUMMONING',bodyId:'STR_SOLDIER_CHORT'})
]);
const endBodies=new Set(SHARED_TERMINALS.map(x=>x.bodyId));
export const isSharedTerminalCandidate=c=>endBodies.has(c?.finalSoldierType);
export const originRankingCandidates=(record,isCompatible)=>
  (record?.candidates||[]).filter(c=>isCompatible(c)&&!isSharedTerminalCandidate(c));
export const sharedTerminalCandidates=(record,isCompatible)=>
  (record?.candidates||[]).filter(c=>isCompatible(c)&&isSharedTerminalCandidate(c));

export function sharedTerminalSourceAudit(data,transformId='STR_CHORT_SUMMONING'){
  const rule=data.transformations.find(t=>t.id===transformId);
  if(!rule?.producedSoldierType)throw Error('Shared terminal source rule missing: '+transformId);
  const permitted=new Set(rule.allowedSoldierTypes||[]);
  if(!permitted.size)throw Error('Shared terminal has no original allowed starting bodies');
  const soldierTypes=Array.from(permitted).map(id=>{
    const body=data.soldiers.find(s=>s.id===id);
    if(!body)throw Error('Allowed source type is absent from Soldier DB: '+id);
    return {id,name:body.koName||id};
  }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const threshold=Number(rule.requiredMinStats?.psiStrength||0);
  const origins=data.profiles.filter(p=>permitted.has(p.soldierType)).map(p=>{
    const low=Number(p.effectiveStats?.min?.psiStrength);
    const high=Number(p.effectiveStats?.max?.psiStrength);
    if(!Number.isFinite(low)||!Number.isFinite(high)||low>high)
      throw Error('Psi source range missing: '+p.id);
    return {id:p.id,soldierType:p.soldierType,
      name:p.sourceKoName||p.sourceId||p.id,psiMin:low,psiMax:high,
      initialPsiStatus:low>=threshold?'meets':high>=threshold?'depends':'below'};
  }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return {transformId,bodyId:rule.producedSoldierType,rule,
    threshold,types:soldierTypes,origins,
    fixedPsi:origins.filter(x=>x.initialPsiStatus==='meets').length,
    variablePsi:origins.filter(x=>x.initialPsiStatus==='depends').length,
    belowPsi:origins.filter(x=>x.initialPsiStatus==='below').length
  };
}
