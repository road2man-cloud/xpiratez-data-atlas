// V154: exact trophy recipes with explicit material debits and bounded mask source.
// Research-only: cash, duration, tactical success and refill quantity remain conditional.
import assert from 'node:assert/strict';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const arr=x=>Array.isArray(x)?x:[];
const at=(t,m)=>t?.[Object.keys(t||{}).map(Number).filter(k=>k<=m).sort((a,b)=>b-a)[0]]||{};
const fields=new Set(['name','type','category','requires','requiresBaseFunc','space','time','cost','requiredItems','producedItems','refund','listOrder']);
export function createTrophySupply(data,snapshot,raw,base){
 const {items,manufacture,missionScripts,alienMissions,alienDeployments,alienRaces,units,startingConditions,files}=raw;
 const recipes=new Map(),donations=new Map();
 for(const [id,r] of Object.entries(manufacture)){
  if(r.category!=='STR_TROPHIES'||!Object.keys(r).every(k=>fields.has(k)))continue;
  if(!/^STR_BOUNTY_HUNTING_(PRIZE_|[BC]_PASS$|DONATION_)/.test(id))continue;
  const output=Object.hasOwn(r,'producedItems')?r.producedItems:{[id]:1};
  if(!Object.keys(output).length||!Object.entries(output).every(([k,n])=>items[k]&&Number.isSafeInteger(n)&&n>0))continue;
  if(!Object.entries(r.requiredItems||{}).every(([k,n])=>items[k]&&Number.isSafeInteger(n)&&n>0))continue;
  recipes.set(id,{id,output,inputs:r.requiredItems||{},requires:r.requires||[],functions:r.requiresBaseFunc||[],cost:r.cost||0,hours:r.time||0});
  if(/^STR_BOUNTY_HUNTING_DONATION_(JACK|GOBLIN_ZAXX|MUTANT_ALLIANCE)$/.test(id)&&Object.keys(output).length===1&&r.requiredItems?.STR_GLAMOUR===1)donations.set(Object.keys(output)[0],id);
 }
 function trade(w,id,count=1){
  const r=recipes.get(id);
  if(!r||!Number.isSafeInteger(count)||count<1||count>10000||w.pendingFree||!r.requires.every(k=>active(w,k))||!r.functions.every(k=>w.baseFunctions.has(k)))return null;
  if(!Object.entries(r.inputs).every(([k,n])=>(w.items[k]||0)>=n*count))return null;
  return {type:'researchTrophyTradeV154',recipe:id,count,inputs:Object.fromEntries(Object.entries(r.inputs).map(([k,n])=>[k,n*count])),outputs:Object.fromEntries(Object.entries(r.output).map(([k,n])=>[k,n*count])),nominalCost:r.cost*count,nominalHours:r.hours*count,sourceFingerprint:snapshot.sourceFingerprint,sourceFileSha256:files['Piratez.rul'],researchOnly:true,assumeProductionCapacity:true,assumeEconomy:true};
 }
 function maskProof(w){
  const script='redMageQuestVilla',dep='STR_LOC_MAGE_VILLA',s=missionScripts[script],d=alienDeployments[dep],m=alienMissions[dep],item='STR_BLACK_MASK';
  if(!s||!d||!m||s.useTable!==false||s.executionOdds<=0||s.maxRuns!==3||s.varName!=='VAR_MAGE_VILLA')return null;
  if(!Object.keys(s).every(k=>['type','missionWeights','regionWeights','useTable','researchTriggers','executionOdds','maxRuns','varName','startDelay','randomDelay','firstMonth','lastMonth'].includes(k)))return null;
  if(!Object.entries(s.researchTriggers||{}).every(([k,v])=>typeof v==='boolean'&&active(w,k)===v)||w.month<(s.firstMonth??0)||(s.lastMonth>=0&&w.month>s.lastMonth))return null;
  if(!(at(s.missionWeights,w.month)[dep]>0)||!arr(m.waves).some(x=>x.objective===true))return null;
  if(w.completedMissions?.has(dep)||w.v154MageMaskRecovery)return null;
  const c=startingConditions[d.startingCondition];
  if(!c||c.forbiddenSoldierTypes?.includes('STR_SOLDIER_HERO')||c.allowedCraft?.length||c.allowedSoldierTypes?.length&&!c.allowedSoldierTypes.includes('STR_SOLDIER_HERO'))return null;
  const row=arr(d.data).findIndex(x=>x.lowQty>=1&&arr(x.itemSets).length>0&&x.itemSets.every(a=>a.includes(item)));
  if(row<0||!items[item]||items[item].recover===false)return null;
  const race=Object.keys(at(m.raceWeights,w.month)).find(k=>at(m.raceWeights,w.month)[k]>0);
  const members=alienRaces[race]?.members;
  if(!members||![].concat(members[d.data[row].alienRank]||[]).some(k=>units[k]))return null;
  return {script,mission:dep,deployment:dep,race,row,alienRank:d.data[row].alienRank,startingCondition:d.startingCondition,month:w.month,maxRuns:s.maxRuns,missionVariable:s.varName,assumeUnusedRun:true,assumeEncounterAndRecovery:true};
 }
 function action(w,item,minimum=1){
  if(item==='STR_BLACK_MASK'&&minimum===1&&(w.items[item]||0)<1){
   const proof=maskProof(w);
   if(proof)return {type:'researchMageMaskV154',item,minimum,proof,sourceFingerprint:snapshot.sourceFingerprint,sourceFileSha256:files['Piratez_Factions.rul'],researchOnly:true};
  }
  return base.action(w,item,minimum);
 }
 function apply(w,a){
  if(!['researchTrophyTradeV154','researchMageMaskV154'].includes(a.type))return base.apply(w,a);
  try{
   assert(w.researchOnly===true&&w.sourceFingerprint===snapshot.sourceFingerprint&&!w.pendingFree);
   const z=structuredClone(w);
   if(a.type==='researchMageMaskV154'){
    assert.deepEqual(a,action(w,a.item,a.minimum));assert.equal(a.type,'researchMageMaskV154');
    z.items[a.item]=(z.items[a.item]||0)+1;z.v154MageMaskRecovery=a.proof;
    return {ok:true,world:z,assumed:true,notes:['raw-mage-villa-equipment-recovery','one-recovery-only','unused-mission-run-and-tactical-recovery-conditional']};
   }
   assert.deepEqual(a,trade(w,a.recipe,a.count));
   for(const [k,n] of Object.entries(a.inputs))z.items[k]-=n;
   for(const [k,n] of Object.entries(a.outputs))z.items[k]=(z.items[k]||0)+n;
   z.v154TrophyTrades=[...(z.v154TrophyTrades||[]),{recipe:a.recipe,count:a.count,inputs:a.inputs,outputs:a.outputs,nominalCost:a.nominalCost,nominalHours:a.nominalHours}];
   return {ok:true,world:z,assumed:true,notes:['raw-trophy-recipe-material-debit-and-fixed-output','manufacturing-time-and-money-abstracted']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action,trade,recipes,donations,award:base.award,victory:base.victory,counts:{trophyRecipes:recipes.size,donationRoutes:donations.size}};
}
