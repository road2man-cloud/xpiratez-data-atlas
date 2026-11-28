import {initialState,STAT_KEYS} from './eligibility.js';
// Consume a previously produced and still unclaimed personnel transfer.
// Its recipe already consumed resources and paid the production fee.
export function claimManufacturedOrigin(input,step,data){
 try{
  const evidence=data.campaignAssets?.manufacturedCareerOrigins?.[step.profile];
  const profile=data.profiles.find(p=>p.id===step.profile);
  const row=data.originRows?.find(r=>r.id===step.profile&&r.kind==='SOURCE_SPAWN');
  if(step.assumption!==true||step.soldier!=='origin'||step.band!=='min'||!evidence||!profile||!row||input.pendingFree||
     data.campaignAssets.sourceFingerprint!==input.sourceFingerprint||
     step.transferHours!==evidence.transferHours||input.soldiers.some(s=>s.id===step.soldier))throw Error('manufactured-arrival-context-invalid');
  const world=structuredClone(input);
  const order=world.forwardRecruitments?.find(r=>r.profile===step.profile&&r.recipe===evidence.recipe&&r.soldierType===profile.soldierType&&r.status==='conditional-transfer-not-simulated');
  if(!order||world.forwardManufactureCounts?.[evidence.recipe]!==1)throw Error('manufactured-arrival-order-missing');
  if(profile.requires.some(k=>!world.researched.has(k)||world.disabled.has(k))||profile.requiresBaseFunc.some(k=>!world.baseFunctions.has(k)))throw Error('manufactured-arrival-prerequisite');
  const limit=data.campaignAssets.forwardRecruitmentLimit;
  const pending=world.forwardRecruitments.filter(r=>r.status==='conditional-transfer-not-simulated').length;
  if(!limit||limit.initialPersonnel+world.soldiers.length+pending>limit.initialCapacity)throw Error('manufactured-arrival-quarters');
  const state=initialState(data,profile,{band:'min'});
  if(!STAT_KEYS.every(k=>Number.isSafeInteger(state.currentStats[k])&&Number.isSafeInteger(state.initialStats[k]))||state.bonusCounts.get(evidence.trait)!==1)throw Error('manufactured-arrival-birth-invalid');
  state.exactStats=true;state.historyKnown=true;
  order.status='conditionally-arrived';order.soldier=step.soldier;
  world.soldiers.push({id:step.soldier,state,commendations:{}});
  return {ok:true,world,assumed:true,notes:['manufactured-personnel-arrival:'+evidence.recipe,'recipe-fee-and-materials-already-consumed','conditional-transfer-hours:'+step.transferHours,'birth-rng-and-transfer-calendar-not-native-certified']};
 }catch(e){return {ok:false,world:input,reason:e.message};}
}
