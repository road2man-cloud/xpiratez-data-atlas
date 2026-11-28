// V143: finish personal attention on the already combined priest/officer hero.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v||{}).reduce((a,b)=>a+b,0);
export function continuePersonalAttention({entries,step,priorGraph,supply,stats,data}){
 assert(priorGraph.convergence.policy==='branch-local-alternative-book-v142');
 const p=priorGraph.convergence.lanes.find(x=>x.lane==='priest');
 let entry=entries.find(e=>e.n.id===p.end);assert(entry);
 const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
 const traces=[],rejected=[];
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let i=0;i<8&&entry.w.pendingFree;i++){const p=entry.w.pendingFree,choices=p.sequential?p.choices.slice(0,1):p.choices,id=choices.includes(preferred)?preferred:choices[0];if(!id||!attempt({type:'freeResearch',source:p.source,research:id,assumeOutcome:!p.sequential&&p.choices.length>1}))return false;}
  return !entry.w.pendingFree;
 }
 function research(id,preferred){if(active(entry.w,id))return true;return resolve(preferred)&&attempt({type:'research',id})&&resolve(preferred);}
 if(!active(entry.w,'STR_GOVT_CORPSE')){
  if(!(entry.w.items.STR_GOVT_CORPSE||0))attempt(supply.action('STR_CAPTAIN_YESGREEN_NORED_AMONG_US',entry.w.month+1));
  research('STR_GOVT_CORPSE');
 }
 if(!active(entry.w,'STR_LINGERIE')){
  if(!(entry.w.items.STR_LINGERIE||0))attempt(supply.action('STR_KNOCK_KNOCK_ATTACKED_IN_BED',entry.w.month+1));
  research('STR_LINGERIE');
 }
 research('STR_VODKA');
 research('STR_SOCIALIZING','STR_SWIMSUIT');
 for(const id of ['STR_CONTACT_BUILDERS','STR_EXCAVATION','STR_PRIMITIVE_WEAPONS_2','STR_BASIC_INCENDIARIES','STR_FLINTLOCKS_PRODUCTION','STR_CLOCKWORK_GUN_PRODUCTION'])research(id);
 if(!active(entry.w,'STR_CAPTAINS_LOG_01')){
  const e='STR_CAP_LOG_1_AWFUL';
  attempt({type:'eventResearch',event:e,script:e,research:'STR_CAPTAINS_LOG_01',assumeOutcome:true});resolve();
 }
 if(research('STR_PERSONAL_ATTENTION')){
  const m=entry.w.soldiers.find(x=>x.id==='origin');
  if(!m.state.history.has('STR_PERSONAL_ATTENTION'))attempt({type:'transform',soldier:'origin',transform:'STR_PERSONAL_ATTENTION'});
 }
 const finalVector=stats(entry.w).permanentStats,goals=['STR_GOVT_CORPSE','STR_LINGERIE','STR_LINGERIE_DEP','STR_VODKA','STR_SOCIALIZING','STR_CONTACT_BUILDERS','STR_EXCAVATION','STR_PRIMITIVE_WEAPONS_2','STR_CLOCKWORK_GUN_PRODUCTION','STR_CAPTAINS_LOG_01','STR_PERSONAL_ATTENTION'];
 const m=entry.w.soldiers.find(x=>x.id==='origin'),h=m.state.history;
 const future=data.transformations.filter(t=>t.allowedSoldierTypes.includes('STR_SOLDIER_HERO')&&t.allowsLiveSoldiers&&!t.createsClone&&t.fixedEffectiveDelta?.tu>0&&!h.has(t.id)).map(t=>({id:t.id,nominalTU:t.fixedEffectiveDelta.tu,statCap:t.upperBoundAtStatCaps,missingResearch:t.requires.filter(id=>!active(entry.w,id)),missingItems:Object.fromEntries(Object.entries(t.requiredItems||{}).map(([k,n])=>[k,Math.max(0,n-(entry.w.items[k]||0))]).filter(([,n])=>n>0)),forbiddenHistory:t.forbiddenPreviousTransformations.filter(id=>h.has(id)),missingFunctions:t.requiresBaseFunc.filter(k=>!entry.w.baseFunctions.has(k)),minTU:t.requiredMinStats.tu})).filter(t=>!t.missingResearch.includes('STR_UNAVAILABLE'));
 return {policy:'branch-local-personal-attention-v143',lanes:[{lane:'priest-officer',start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),accepted:traces.length,completed:goals.filter(id=>active(entry.w,id)),missing:goals.filter(id=>!active(entry.w,id)),stock:Object.fromEntries(['STR_GLAMOUR','STR_GOVT_CORPSE','STR_LINGERIE','STR_PORN'].map(id=>[id,entry.w.items[id]||0])),supplies:entry.w.conditionalPriestSupplies||[],history:[...h],future,gameCertified:false,registered:false}],traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
