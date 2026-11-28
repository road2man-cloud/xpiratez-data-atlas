// Conditional stat-gate production based on the archived OXCE 8.7.1 diary code.
// Stat gain is current minus initial stats, with bravery divided by ten.
// A subsequent debrief and ordinary score acquisition are conditional.
import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {member} from "./population-growth-replay-core.mjs";
import {verifyLifecycleEngineSource} from "./population-shared-lifecycle-replay.mjs";
import {createSurgeryMedalPreparation} from "./population-surgery-medal-preparation-v2-intrinsic.mjs";
export const POLICY="OXCE_871_STAT_GAIN_DEBRIEF_GATE_V1";
export function statGain(s){
 let total=0;for(const k of STAT_KEYS){
  const a=s.currentStats?.[k],b=s.initialStats?.[k];assert(Number.isSafeInteger(a)&&Number.isSafeInteger(b),"Exact stat gain required");
  total+=k==="bravery"?Math.trunc((a-b)/10):a-b;
 }return total;
}
export function createStatGainGatePreparation(data,replay){
 verifyLifecycleEngineSource();
 const id="STR_MEDAL_STATGAIN_NAME",def=data.commendationIndex?.[id];
 assert(def&&Object.keys(def.criteria||{}).length===1&&Array.isArray(def.criteria.totalStatGain)&&!Object.keys(def.killCriteria||{}).length&&!def.missionTypeFilter?.length);
 const levels=def.bonusLevels.map((bonus,level)=>({bonus,level,threshold:def.criteria.totalStatGain[level]})).filter(x=>Number.isSafeInteger(x.threshold));
 const generic=createSurgeryMedalPreparation(data,replay);
 function candidates(base,r){
  const out=[];
  if(!r.includeBonusesForMinStats&&!r.includeBonusesForMaxStats)return out;
  if(!r.requires.every(k=>replay.active(base.world,k)))return out;
  const s=member(base.world).state;if(s.status!=="healthy"||!s.exactStats)return out;
  const gain=statGain(s),old=member(base.world).commendations?.[id]??-1;
  const options=[null,...levels.filter(x=>x.level>old&&x.threshold<=gain)];
  for(const level of options){
   let q=base;
   try{
    if(level){const a={type:"conditionalMedal",soldier:"origin",medal:id,level:level.level,assumption:true};q={world:replay.apply(q.world,a),steps:[...q.steps,a]};}
    if(level)out.push(q);
    const next=generic.prepare(q,r);
    if(next?.status==="CONDITIONAL_STAT_GATE_READY")out.push(next.node);
   }catch{}
  }
  return out;
 }
 return {candidates,policy:{id:POLICY,statGainCriterion:"totalStatGain",source:"tools/headless-simulator/native/oxce-source.tar.gz",anchors:["src/Battlescape/DebriefingState.cpp: statistics delta = currentStats - initStats","src/Savegame/SoldierDiary.cpp: _statGainTotal, manageCommendations"],debriefAssumed:true,ordinaryCareerScoreAssumed:true,actualGameCertified:false}};
}
