// X-Piratez v.o2 education-choice audit, separate from signed research witnesses.
// A cap-reference comparison is a conditional snapshot, NOT a new executable route.
// It must never be mixed with another candidate's proven transformations.
import {DISPLAY_STATS} from './score-12.js';

export const EDUCATION_IDS=Object.freeze([
  'STR_PERSON_OF_CULTURE_TRAINING',
  'STR_MILITARY_DRILL_TRAINING',
  'STR_SIMPLETON_TRAINING'
]);

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const compatible=(rule,body)=>!!rule&&!!body&&
  (rule.allowedSoldierTypes||[]).includes(body.id)&&
  !(rule.forbiddenSoldierTypes||[]).includes(body.id);
const mapRules=data=>new Map((data.transformations||[]).map(rule=>[rule.id,rule]));
const statEntries=obj=>Object.fromEntries(DISPLAY_STATS.map(key=>[key,number(obj?.[key])]));

function prerequisiteOrder(rule,byId,seen=new Set(),path=new Set()){
  const result=[];
  for(const id of rule.requiredPreviousTransformations||[]){
    if(path.has(id))throw Error('Cyclic education prerequisite: '+id);
    if(seen.has(id))continue;
    const parent=byId.get(id);
    if(!parent)throw Error('Missing prerequisite: '+id);
    path.add(id);
    result.push(...prerequisiteOrder(parent,byId,seen,path));
    path.delete(id);
    seen.add(id);
    result.push(parent);
  }
  return result;
}

// Eligibility and research are deliberately NOT inferred from these choices.
// Only recorded history restrictions and same-body type support are inspected.
function structuralLoss(data,body,history){
  const rules=(data.transformations||[]).filter(rule=>compatible(rule,body));
  const completed=new Set(history);
  const direct=[],indirect=[];
  const blocked=new Set();
  for(const rule of rules){
    if(completed.has(rule.id))continue;
    const causes=(rule.forbiddenPreviousTransformations||[])
      .filter(id=>completed.has(id));
    if(causes.length){
      direct.push({id:rule.id,causes});
      blocked.add(rule.id);
    }
  }
  let changed=true;
  while(changed){
    changed=false;
    for(const rule of rules){
      if(completed.has(rule.id)||blocked.has(rule.id))continue;
      const causes=(rule.requiredPreviousTransformations||[])
        .filter(id=>!completed.has(id)&&blocked.has(id));
      if(!causes.length)continue;
      indirect.push({id:rule.id,causes});
      blocked.add(rule.id);
      changed=true;
    }
  }
  return {direct,indirect,total:direct.length+indirect.length};
}

export function trainingHistory(data,transforms=[],startingHistory={}){
  // Acquired soldiers can arrive with completed transformations already in
  // their profile; the signed candidate contains only subsequent actions.
  const byId=mapRules(data),history=new Set(Object.entries(startingHistory)
    .filter(([,count])=>number(count)>0).map(([id])=>id));
  for(const id of transforms){
    const rule=byId.get(id);
    if(!rule)throw Error('Unknown transformation history: '+id);
    if(rule.reset)history.clear();
    else for(const removed of rule.removeTransformations||[])history.delete(removed);
    history.add(id);
  }
  return history;
}

export function auditCandidateFutureChoices(data,candidate){
  const body=(data.soldiers||[]).find(row=>row.id===candidate?.finalSoldierType);
  if(!body)return {kind:'unverified',reason:'Missing final body'};
  const profile=(data.profiles||[]).find(row=>row.id===candidate.profileId);
  if(candidate.profileId&&!profile)return {kind:'unverified',reason:'Missing acquisition history'};
  const history=trainingHistory(data,candidate.transforms||[],profile?.previousTransformations);
  const losses=structuralLoss(data,body,history);
  return {kind:'structural-only',body:body.id,
    completed:[...history],...losses,
    caveat:'동일 최종 병종의 허용 이력만 비교. 연구·능력치·시설·자원 조건과 다른 병종으로의 변신 가능성은 별도'};
}

function capBoundChange(rule,body,key,raw){
  let change=number(rule.flatOverallStatChange?.[key]);
  for(const name of ['flatMin','flatMax','percentOverallStatChange','percentMin',
    'percentMax','percentGainedStatChange','percentGainedMin','percentGainedMax']){
    if(number(rule[name]?.[key]))throw Error('Variable education effect: '+rule.id+'/'+key);
  }
  if(rule.lowerBoundAtMinStats)
    change=Math.max(change,number(body.minStats?.[key])-raw);
  if(rule.upperBoundAtMaxStats||rule.upperBoundAtStatCaps){
    const upper=number(rule.upperBoundAtMaxStats?
      body.maxStats?.[key]:body.statCaps?.[key]);
    const soft=number(rule.upperBoundType)!==2;
    if(soft){
      if(change>0)change=raw<=upper?Math.min(change,upper-raw):0;
    }else change=Math.min(change,upper-raw);
  }
  return change;
}

export function educationCapReference(rule,body){
  if(!compatible(rule,body))return null;
  const raw=statEntries(body.statCaps);
  const cappedDirect=Object.fromEntries(DISPLAY_STATS.map(key=>
    [key,capBoundChange(rule,body,key,raw[key])]));
  const permanent=statEntries(rule.traitStats);
  const combined=Object.fromEntries(DISPLAY_STATS.map(key=>
    [key,cappedDirect[key]+permanent[key]]));
  return {reference:'raw-at-statCaps',raw,cappedDirect,permanent,combined,
    // Positive Psi Skill bonuses do not by themselves prove Psi activation.
    psiSkillActivationUnverified:permanent.psiSkill>0,
    requirementMayFail:DISPLAY_STATS.filter(key=>
      raw[key]<number(rule.requiredMinStats?.[key])),
    caveat:'원시 능력치가 해당 병종 statCaps와 정확히 같고 그 시점에 교육 자격을 갖춘 가상 비교. '+
      '이미 초과 성장한 수치, 훈련 전후 성장 순서, 보유 특성, Psi 활성 여부는 미확정'};
}

export function educationBranchReport(data,profile,candidates=[]){
  if(data?.meta?.mod?.version!=='v.o2')throw Error('Education audit requires v.o2');
  const body=(data.soldiers||[]).find(row=>row.id===profile?.soldierType);
  if(!body)throw Error('Source soldier type not found');
  const byId=mapRules(data);
  const initialHistory=trainingHistory(data,[],profile.previousTransformations);
  const alreadyBlocked=structuralLoss(data,body,initialHistory);
  const baselineBlocked=new Set([...alreadyBlocked.direct,...alreadyBlocked.indirect].map(row=>row.id));
  return EDUCATION_IDS.map(id=>{
    const rule=byId.get(id);
    if(!rule)throw Error('Missing education rule: '+id);
    const available=compatible(rule,body);
    if(!available)return {id,name:rule.koName,available:false,body:body.id};
    const prerequisites=prerequisiteOrder(rule,byId);
    const plannedHistory=new Set(initialHistory),historyConflicts=[];
    for(const step of [...prerequisites,rule]){
      if(plannedHistory.has(step.id))continue;
      if(!compatible(step,body)){
        historyConflicts.push({id:step.id,causes:['병종 불일치']});
        break;
      }
      const causes=(step.forbiddenPreviousTransformations||[])
        .filter(previous=>plannedHistory.has(previous));
      if(causes.length){historyConflicts.push({id:step.id,causes});break;}
      plannedHistory.add(step.id);
    }
    const mandatoryHistory=new Set([...initialHistory,...prerequisites.map(t=>t.id),id]);
    const direct=structuralLoss(data,body,new Set([...initialHistory,id]));
    const full=structuralLoss(data,body,mandatoryHistory);
    const directBlocks=direct.direct.filter(x=>!baselineBlocked.has(x.id));
    const standaloneBlocks=new Set([...baselineBlocked,...direct.direct.map(x=>x.id)]);
    const prerequisiteBlocks=full.direct.filter(x=>!standaloneBlocks.has(x.id));
    const directPlusPrerequisites=new Set([...standaloneBlocks,...prerequisiteBlocks.map(x=>x.id)]);
    const chainBlocks=full.indirect.filter(x=>!directPlusPrerequisites.has(x.id));
    const included=candidates.filter(c=>c.finalSoldierType===body.id&&
      (c.transforms||[]).includes(id));
    const sorted=[...included].filter(c=>c.growth?.kind==='conditional-upper-envelope')
      .sort((a,b)=>b.growth.total-a.growth.total);
    return {id,name:rule.koName,available:true,body:body.id,
      researchIds:rule.requires||[],
      baseFunctions:rule.requiresBaseFunc||[],
      requiredItems:Object.entries(rule.requiredItems||{}),
      cost:number(rule.cost),
      minRank:rule.minRank,
      requiredStats:Object.entries(rule.requiredMinStats||{})
        .filter(([,value])=>number(value)>0),
      prerequisites:prerequisites.map(t=>({id:t.id,name:t.koName})),
      inheritedHistory:[...initialHistory],
      alreadyCompleted:initialHistory.has(id),
      historyConflicts,
      directBlocks,
      prerequisiteBlocks,chainBlocks,
      totalStructuralLocks:directBlocks.length+prerequisiteBlocks.length+chainBlocks.length,
      capReference:educationCapReference(rule,body),
      candidateCount:included.length,
      bestCandidate:sorted[0]||null,
      directUnlocks:(data.transformations||[]).filter(t=>
        (t.requiredPreviousTransformations||[]).includes(id)).map(t=>t.id)
    };
  });
}
