// V148: research-only sample reachability. The source is proven; the actual
// quantity, travel, battle, calendar and economics are deliberately abstracted.
// Do not use this adapter to certify an inventory, a tactical win, or a game save.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const arr=x=>Array.isArray(x)?x:[];
const positive=(v)=>Number.isFinite(v)&&v>0;
const sort=(a,b)=>a.localeCompare(b,'en');
export function createResearchSupply(data,snapshot,raw,base){
 const {files,items,manufacture,events,eventScripts,alienRaces,alienMissions,alienDeployments,missionScripts,units,armors,ufos}=raw;
 const catalog=new Map();
 function add(item,source){if(items[item]){if(!catalog.has(item))catalog.set(item,[]);catalog.get(item).push(source);}}
 const tableKeys=t=>[...new Set(Object.values(t||{}).flatMap(x=>Object.entries(x||{}).filter(([,v])=>positive(v)).map(([k])=>k)))].sort(sort);
 const scriptAllowed=new Set(['type','name','missionWeights','regionWeights','useTable','executionOdds','researchTriggers','firstMonth','lastMonth','startDelay','randomDelay','eventWeights','oneTimeRandomEvents','oneTimeSequentialEvents','facilityTriggers','itemTriggers','minDifficulty','maxDifficulty']);
 function supported(s){return Object.keys(s).every(k=>scriptAllowed.has(k))&&(s.executionOdds??100)>0;}
 function gate(w,s){
  if(!supported(s))return false;
  if(!Object.entries(s.researchTriggers||{}).every(([k,v])=>typeof v==='boolean'&&active(w,k)===v))return false;
  if(!Object.entries(s.facilityTriggers||{}).every(([k,v])=>typeof v==='boolean'&&w.facilities.has(k)===v))return false;
  if(!Object.entries(s.itemTriggers||{}).every(([k,v])=>typeof v==='boolean'&&((w.items[k]||0)+(w.otherItems?.[k]||0)>0)===v))return false;
  if(s.minDifficulty!=null&&w.difficulty<s.minDifficulty)return false;
  if(s.maxDifficulty!=null&&w.difficulty>s.maxDifficulty)return false;
  // First/last month and random generation are existence assumptions, not a calendar proof.
  return true;
 }
 for(const [id,s] of Object.entries(missionScripts)){
  if(!supported(s)||s.useTable!==false)continue;
  for(const mission of tableKeys(s.missionWeights)){
   const m=alienMissions[mission];if(!m)continue;
   for(const race of tableKeys(m.raceWeights)){
    const members=alienRaces[race]?.members;if(!Array.isArray(members))continue;
    const deployments=new Set();
    if(alienDeployments[mission])deployments.add(mission);
    for(const wave of arr(m.waves).filter(x=>x.objective)){
     const dep=ufos[wave.ufo]?.raceBonus?.[race]?.missionCustomDeploy;
     if(dep&&alienDeployments[dep])deployments.add(dep);
    }
    for(const deployment of deployments){
     const d=alienDeployments[deployment],common={kind:'mission',script:id,mission,deployment,race};
     if(d.missionBountyItem)add(d.missionBountyItem,{...common,route:'bounty'});
     for(const row of arr(d.data)){
      if(!positive(row.lowQty)&&!positive(row.highQty))continue;
      for(const u of [].concat(members[row.alienRank]||[])){
       if(typeof u!=='string')continue;
       const armor=armors[units[u]?.armor],body=items[armor?.corpseBattle?.[0]];
       if(armor?.corpseGeo&&body?.battleType===11&&body.recover!==false&&body.recoverCorpse!==false)add(armor.corpseGeo,{...common,route:'corpse',unit:u});
      }
      for(const item of new Set(arr(row.itemSets).flat().filter(x=>typeof x==='string')))if(items[item]?.recover!==false)add(item,{...common,route:'recoverable-equipment'});
     }
    }
   }
  }
 }
 for(const [id,s] of Object.entries(eventScripts)){
  if(!supported(s))continue;
  const weighted=tableKeys(s.eventWeights),one=Object.entries(s.oneTimeRandomEvents||{}).filter(([,v])=>positive(v)).map(([k])=>k);
  // Sequential one-time chains are left to the existing chronological simulator.
  for(const event of new Set([...weighted,...one])){
   const e=events[event];if(!e)continue;
   const rewards=new Set([...arr(e.everyItemList),...Object.keys(e.everyMultiItemList||{}),...arr(e.randomItemList),...arr(e.randomMultiItemList).flatMap(x=>Object.keys(x||{}))]);
   for(const item of rewards)add(item,{kind:'event',script:id,event,oneTime:one.includes(event)&&!weighted.includes(event)});
  }
 }
 for(const [id,r] of Object.entries(manufacture)){
  if(!Object.keys(r).every(k=>['name','type','category','requires','requiresBaseFunc','space','time','cost','requiredItems','producedItems','randomProducedItems','refund','listOrder'].includes(k)))continue;
  for(const [item,count] of Object.entries(r.producedItems||{}))if(positive(count))add(item,{kind:'manufacture',recipe:id,output:'fixed'});
  for(const [i,b] of arr(r.randomProducedItems).entries())if(Array.isArray(b)&&positive(b[0]))for(const [item,count] of Object.entries(b[1]||{}))if(positive(count))add(item,{kind:'manufacture',recipe:id,output:'weighted',bundleIndex:i});
 }
 // Purchase gates are already normalized by the source data generator.
 for(const [item,r] of Object.entries(data.itemSupply))if(positive(r.buyCost))add(item,{kind:'purchase'});
 function prove(w,item,seen=new Set(),depth=0,allowStock=true){
  if(!items[item]||seen.has(item)||depth>5)return null;
  if(allowStock&&(w.items[item]||0)>0)return {kind:'stock',item};
  const next=new Set(seen);next.add(item);
  const sources=catalog.get(item)||[];
  // Prefer an already established mission, then an actual accessible source.
  const order=[...sources].sort((a,b)=>((b.kind==='mission'&&w.completedMissions?.has(b.deployment))?1:0)-((a.kind==='mission'&&w.completedMissions?.has(a.deployment))?1:0));
  for(const s of order){
   if(s.kind==='mission'){
    const historical=w.completedMissions?.has(s.deployment)===true;
    if(historical||gate(w,missionScripts[s.script]))return {item,...s,access:historical?'historical-mission':'unlocked-mission'};
   }else if(s.kind==='event'){
    if(gate(w,eventScripts[s.script])&&(!s.oneTime||!w.generatedEvents?.[s.event]))return {item,...s,access:'eligible-event'};
   }else if(s.kind==='purchase'){
    const r=data.itemSupply[item];
    if(!r.buyRequiresCountry&&arr(r.buyRequires).every(k=>active(w,k))&&arr(r.buyRequirements).every(k=>typeof k==='string'&&active(w,k))&&arr(r.buyRequiresBaseFunc).every(k=>w.baseFunctions.has(k)))return {item,...s,access:'unlocked-purchase'};
   }else if(s.kind==='manufacture'){
    const r=manufacture[s.recipe];
    if(!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
    const inputs=[];let ok=true;
    for(const k of Object.keys(r.requiredItems||{})){
     const p=prove(w,k,next,depth+1);if(!p){ok=false;break;}inputs.push(p);
    }
    if(ok)return {item,...s,inputs,access:'unlocked-manufacture'};
   }
  }
  return null;
 }
 function action(w,item,minimum=1){
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000||(w.items[item]||0)>=minimum)return null;
  const proof=prove(w,item,new Set(),0,false);if(!proof)return null;
  return {type:'researchSupply',item,minimum,proof,sourceFingerprint:snapshot.sourceFingerprint,assumeSourceAccess:true,assumeRequiredQuantity:true,researchOnly:true};
 }
 function apply(w,a){
  if(a.type!=='researchSupply')return base.apply(w,a);
  try{
   assert(w.researchOnly===true&&w.sourceFingerprint===snapshot.sourceFingerprint&&!w.pendingFree);
   assert.deepEqual(a,action(w,a.item,a.minimum),'source not reachable in this research state');
   const z=structuredClone(w);z.items[a.item]=a.minimum;
   // Only item stock changes; no implicit research, rank, victory or event marker.
   return {ok:true,world:z,assumed:true,notes:['research-only-accessible-item-source','quantity-cost-calendar-and-combat-abstracted','no-native-inventory-certification']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 const counts={items:catalog.size,sources:[...catalog.values()].reduce((n,a)=>n+a.length,0),byKind:{}};
 for(const a of catalog.values())for(const s of a)counts.byKind[s.kind]=(counts.byKind[s.kind]||0)+1;
 return {apply,action,prove,catalog,counts};
}
