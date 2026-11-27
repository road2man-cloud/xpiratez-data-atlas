// Optional ordinary-career medal preparation for a concrete surgery stat gate.
// All added medals are explicit conditional actions, never asserted earned.
// Only unqualified career-wide score/kill medals are searched here; race,
// weapon, mission-specific and postmortem awards require separate evidence.
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {member} from "./population-growth-replay-core.mjs";
const IDS=["STR_MEDAL_CARREER_KILLS_NAME","STR_MEDAL_CARREER_SCORE_NAME"];
const CRITERIA={STR_MEDAL_CARREER_KILLS_NAME:"killsWithCriteriaCareer",STR_MEDAL_CARREER_SCORE_NAME:"totalScore"};
export function createSurgeryMedalPreparation(data,replay){
 const medals=IDS.flatMap(id=>{
  const m=data.commendationIndex?.[id],criterion=CRITERIA[id],thresholds=m?.criteria?.[criterion];
  const ordinaryKills=id==="STR_MEDAL_CARREER_KILLS_NAME"&&Array.isArray(m?.killCriteria)&&m.killCriteria.length>0&&m.killCriteria.every(a=>Array.isArray(a)&&a.length===1&&a[0][0]===1&&Array.isArray(a[0][1])&&a[0][1].length===2&&a[0][1].includes("STATUS_DEAD")&&a[0][1].some(k=>["FACTION_HOSTILE","FACTION_NEUTRAL","FACTION_PLAYER"].includes(k)))&&m.killCriteria.some(a=>a[0][1].includes("FACTION_HOSTILE"));
  if(!m||Object.keys(m.criteria||{}).length!==1||!Array.isArray(thresholds)||!Array.isArray(m.bonusLevels)||Object.keys(m.killCriteria||{}).length&&!ordinaryKills||m.missionTypeFilter?.length)return [];
  return [{id,criterion,levels:m.bonusLevels.map((bonus,i)=>({level:i,bonus,threshold:thresholds[i]})).filter(x=>Number.isSafeInteger(x.threshold)&&x.threshold>=0)}];
 });
 function gates(world,r,commendations=null){
  const f=replay.finish(world);
  if(commendations){
   const extra=bonusStats(member(world).state,data,{commendations});
   f.vector=f.raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&(extra[STAT_KEYS[i]]||0)>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+(extra[STAT_KEYS[i]]||0)));
  }
  return STAT_KEYS.flatMap((k,i)=>{
   const lo=Number(r.requiredMinStats?.[k]||0),hi=r.requiredMaxStats?.[k]===undefined?9999:Number(r.requiredMaxStats[k]);
   const x=(r.includeBonusesForMinStats?f.vector:f.raw)[i],y=(r.includeBonusesForMaxStats?f.vector:f.raw)[i];
   return [...(lo&&x<lo?[{stat:k,kind:"min",required:lo,actual:x,gap:lo-x}]:[]),...(y>hi?[{stat:k,kind:"max",required:hi,actual:y,gap:y-hi}]:[])];
  });
 }
 function prepare(node,r){
  if(!r.includeBonusesForMinStats&&!r.includeBonusesForMaxStats)return null;
  const base=replay.meet(node,r);if(!base)return null;
  const before=gates(base.world,r);if(!before.length)return null;
  const current=member(base.world).commendations||{};
  // Enumerate all indexed levels of the two general medals, including
  // leaving each unchanged. A one-stat or conflicting max gate is checked
  // against the actual replay vector, not a sum of hypothetical bonuses.
  let states=[{commendations:current,awards:[],cost:0}];
  for(const m of medals){
   const next=[...states];
   for(const s of states)for(const level of m.levels){
    if(level.level<=(current[m.id]??-1))continue;
    next.push({commendations:{...s.commendations,[m.id]:level.level},awards:[...s.awards,{id:m.id,...level,criterion:m.criterion}],cost:s.cost+level.level+1});
   }
   states=next;
  }
  const ready=states.filter(s=>s.awards.length&&!gates(base.world,r,s.commendations).length).sort((a,b)=>a.cost-b.cost||a.awards.length-b.awards.length||JSON.stringify(a.awards).localeCompare(JSON.stringify(b.awards)));
  for(const best of ready){
   let node=base;
   try{
    for(const award of best.awards){
     const action={type:"conditionalMedal",soldier:"origin",medal:award.id,level:award.level,assumption:true};
     node={world:replay.apply(node.world,action),steps:[...node.steps,action]};
    }
    if(gates(node.world,r).length)continue;
    return {status:"CONDITIONAL_STAT_GATE_READY",node,receipt:{policy:"GENERAL_CAREER_MEDAL_STAT_PREPARATION_V1",before,after:gates(node.world,r),awards:best.awards,alternatives:states.length,actualGameCertified:false}};
   }catch{}
  }
  return {status:"UNRESOLVED",before,alternatives:states.length,assumption:true};
 }
 return {prepare,medals:medals.map(m=>m.id)};
}
