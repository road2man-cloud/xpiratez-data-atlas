// V151: conditional research awards from raw multi-topic events, and live capture.
// Earlier action namespaces remain unchanged. Research-only, not a save-game simulation.
import assert from 'node:assert/strict';
import {applyCampaignStartStep} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const arr=x=>Array.isArray(x)?x:[];
const weighted=(t,month)=>t?.[Object.keys(t||{}).map(Number).filter(k=>k<=month).sort((a,b)=>b-a)[0]]||{};
const possible=(t,k)=>Object.values(t||{}).some(v=>Number(v?.[k])>0);
export function createAdvancedSupply(data,snapshot,raw,base){
 const {events,eventScripts,items,research,missionScripts,alienMissions,alienDeployments,ufos,alienRaces,units,armors}=raw;
 const eventFields=new Set(['name','type','description','background','music','researchList','timer','timerRandom','points','funds','everyItemList','everyMultiItemList']);
 const scriptFields=new Set(['type','name','eventWeights','firstMonth','lastMonth','executionOdds','researchTriggers','itemTriggers','facilityTriggers','minDifficulty','maxDifficulty']);
 const missionFields=new Set(['type','name','missionWeights','regionWeights','useTable','executionOdds','researchTriggers','firstMonth','lastMonth','startDelay','randomDelay','facilityTriggers','itemTriggers','minDifficulty','maxDifficulty','targetBaseOdds']);
 const gates=(w,s,allowed,month)=>{
  if(!s||!Object.keys(s).every(k=>allowed.has(k))||(s.executionOdds??100)<=0||month<(s.firstMonth??0)||(s.lastMonth>=0&&month>s.lastMonth))return false;
  if(!Object.entries(s.researchTriggers||{}).every(([k,v])=>typeof v==='boolean'&&active(w,k)===v))return false;
  if(!Object.entries(s.facilityTriggers||{}).every(([k,v])=>typeof v==='boolean'&&w.globalFacilities.has(k)===v))return false;
  if(!Object.entries(s.itemTriggers||{}).every(([k,v])=>typeof v==='boolean'&&((w.items[k]||0)+(w.otherItems?.[k]||0)>0)===v))return false;
  return w.difficulty>=(s.minDifficulty??0)&&w.difficulty<=(s.maxDifficulty??4);
 };
 function award(w,id){
  if(active(w,id)||w.disabled.has(id)||w.pendingFree)return null;
  for(const route of arr(data.eventResearchSources[id])){
   const e=events[route.event];
   if(!e||!arr(e.researchList).includes(id)||!Object.keys(e).every(k=>eventFields.has(k))||w.generatedEvents?.[route.event])continue;
   for(const ix of arr(route.scripts)){
    const s=eventScripts[ix.script],month=w.month;
    if(!Number.isInteger(month)||!gates(w,s,scriptFields,month)||!(weighted(s.eventWeights,month)[route.event]>0))continue;
    return {type:'researchEventV151',research:id,event:route.event,script:ix.script,month,assumeOutcome:true,assumeEventSelection:true,sourceFingerprint:snapshot.sourceFingerprint,researchOnly:true};
   }
  }
  return null;
 }
 const catalog=new Map();
 function add(k,v){if(!catalog.has(k))catalog.set(k,[]);catalog.get(k).push(v);}
 const keys=t=>[...new Set(Object.values(t||{}).flatMap(v=>Object.entries(v||{}).filter(([,n])=>n>0).map(([k])=>k)))];
 for(const [script,s] of Object.entries(missionScripts)){
  if(s.useTable!==false||!Object.keys(s).every(k=>missionFields.has(k)))continue;
  for(const mission of keys(s.missionWeights)){
   const m=alienMissions[mission];if(!m)continue;
   for(const race of keys(m.raceWeights)){
    const mem=alienRaces[race]?.members;if(!Array.isArray(mem))continue;
    const deployments=[];
    if(alienDeployments[mission]&&arr(m.waves).some(v=>v.objective))deployments.push({deployment:mission,route:'direct'});
    for(const wave of arr(m.waves)){
     const dep=ufos[wave.ufo]?.raceBonus?.[race]?.missionCustomDeploy;
     if(dep&&alienDeployments[dep])deployments.push({deployment:dep,ufo:wave.ufo,route:'ufo'});
    }
    for(const d of deployments)for(const [rowIndex,row] of arr(alienDeployments[d.deployment].data).entries()){
     if(!(row.lowQty>0||row.highQty>0))continue;
     for(const unit of [].concat(mem[row.alienRank]||[])){
      const u=units[unit],i=items[unit],armor=armors[u?.armor];
      if(!u||!i||i.liveAlien!==true||i.recover!==true||u.spawnUnit||i.recoveryTransformations||!arr(armor?.corpseBattle).length||items[armor.corpseBattle[0]]?.recover===false)continue;
      // Surrender is source-backed; other captures explicitly assume nonlethal success.
      // Exclude units with explicit immunity to stun/capture if known.
      if(u.capturable===false||u.immuneToStun===true||armor?.immuneToStun===true)continue;
      add(unit,{kind:'capture',script,mission,race,...d,rowIndex,alienRank:row.alienRank,unit,armor:u.armor,prisonType:i.prisonType??i.liveAlienPrisonType??0,canSurrender:u.canSurrender===true});
     }
    }
   }
  }
 }
 function captureProof(w,item){
  for(const p of catalog.get(item)||[]){
   const s=missionScripts[p.script],m=alienMissions[p.mission],month=Math.max(w.month,s.firstMonth??0);
   if(!gates(w,s,missionFields,month)||!(weighted(s.missionWeights,month)[p.mission]>0)||!(weighted(m.raceWeights,month)[p.race]>0))continue;
   // A positive deployment row plus exact live item identity is a conditional
   // source; no claim that a ship can be defeated or the target stunned.
   return {...p,month,assumeNonlethalCapture:true,assumeDetention:true,assumeRecovery:true};
  }
  return null;
 }
 function action(w,item,minimum=1){
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000||(w.items[item]||0)>=minimum)return null;
  const old=base.action(w,item,minimum);if(old)return old;
  const proof=captureProof(w,item);if(!proof)return null;
  return {type:'researchCaptureV151',item,minimum,proof,sourceFingerprint:snapshot.sourceFingerprint,researchOnly:true,assumeSourceAccess:true,assumeRequiredQuantity:true};
 }
 function apply(w,a){
  if(!['researchEventV151','researchCaptureV151'].includes(a.type))return base.apply(w,a);
  try{
   assert(w.researchOnly===true&&w.sourceFingerprint===snapshot.sourceFingerprint&&!w.pendingFree);
   if(a.type==='researchCaptureV151'){
    assert.deepEqual(a,action(w,a.item,a.minimum));const z=structuredClone(w);z.items[a.item]=a.minimum;
    return {ok:true,world:z,assumed:true,notes:['raw-mission-live-unit-item-binding','nonlethal-capture-detention-and-quantity-conditional','not-native-certified']};
   }
   assert.deepEqual(a,award(w,a.research));const e=events[a.event];
   const r=applyCampaignStartStep(w,{type:'eventResearch',event:a.event,script:a.script,research:a.research,assumeOutcome:true},data);
   assert(r.ok,r.reason);assert(active(r.world,a.research));assert(r.world.generatedEvents[a.event]);
   for(const id of arr(e.everyItemList))r.world.items[id]=(r.world.items[id]||0)+1;
   for(const [id,n] of Object.entries(e.everyMultiItemList||{}))r.world.items[id]=(r.world.items[id]||0)+n;
   if(Number.isFinite(r.world.score))r.world.score+=e.points??0;
   if(Number.isFinite(r.world.funds))r.world.funds+=e.funds??0;
   return {...r,assumed:true,notes:[...(r.notes||[]),'raw-event-selected-research-pool-outcome','not-native-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {action,apply,award,counts:{captureItems:catalog.size,captureSources:[...catalog.values()].reduce((n,x)=>n+x.length,0)}};
}
