// V145: complete raw fixed-item event bundles and junk extraction.
// Monthly arrival, work hours, and selected RNG outcomes are explicit model assumptions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createRejectPowerGate(data,snapshot,raw,base,root){
 const {files,items,events,eventScripts,facilities,manufacture}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 const eventCpp=cpp('Geoscape/GeoscapeEventState.cpp'),productionCpp=cpp('Savegame/Production.cpp');
 assert(eventCpp.includes('rule.getEveryItemList()')&&eventCpp.includes('itemsToTransfer[itemRule->getType()] += 1'));
 assert(productionCpp.includes('_rules->getProducedItems()')&&productionCpp.includes('_rules->getRandomProducedItems()')&&productionCpp.includes('RNG::generate(1, totalWeight)'));
 const configs=[
  ['STR_SCHOOLBUS_EVENT','STR_REJECT_THE_POWER',75,{STR_SCHOOLBUS_ITEM:1,STR_GNOME:7,STR_HUMAN_NOBLEWOMAN:1,STR_OLD_BOOKS:1,STR_SCHOOL_BOOKS_ITEM:1,STR_LONGEVITY_SERUM:3}],
  ['STR_SAKURA_SIVALINGA_EVENT','STR_OFFERING_TO_PURPLE_BLOOM',100,{STR_SIVALINGA:1}]
 ];
 const specs=new Map();
 for(const [id,trigger,odds,expected] of configs){
  const e=events[id],s=eventScripts[id];assert(e&&s);
  assert(Object.keys(e).every(k=>['name','description','background','music','everyItemList','timer','timerRandom'].includes(k)));
  assert(Object.keys(s).every(k=>['type','oneTimeRandomEvents','firstMonth','researchTriggers','executionOdds'].includes(k)));
  assert.deepEqual(s.oneTimeRandomEvents,{[id]:100});assert.deepEqual(s.researchTriggers,{[trigger]:true});assert.equal(s.executionOdds,odds);
  assert(e.timer+e.timerRandom<28*24*60);
  const reward={};for(const k of e.everyItemList)reward[k]=(reward[k]||0)+1;assert.deepEqual(reward,expected);
  for(const k of Object.keys(reward))assert(items[k],'unknown item '+k);
  specs.set(id,{e,s,trigger,reward});
 }
 const blessingId='STR_DUMBLAZY_BLESSINGS',be=events[blessingId],bs=eventScripts[blessingId];
 assert.deepEqual(bs.eventWeights,{0:{[blessingId]:100}});assert.deepEqual(bs.researchTriggers,{STR_CAPTAIN_DUMBLAZY:true,STR_WASTELAND_PRIESTESS:true});assert.equal(bs.firstMonth,1);assert.equal(bs.executionOdds,23);
 assert(Object.keys(bs).every(k=>['type','eventWeights','researchTriggers','firstMonth','executionOdds'].includes(k)));
 assert(Object.keys(be).every(k=>['name','description','background','music','points','everyMultiItemList','timer','timerRandom'].includes(k)));
 assert.deepEqual(be.everyMultiItemList,{STR_MUTANT_BLESSINGS:9});assert.equal(be.points,50);assert(be.timer+be.timerRandom<31*24*60);
 assert(cpp('Geoscape/GeoscapeState.cpp').includes('randomly generated repeatable events'));
 const blessingAction=month=>({type:'conditionalPreCrownBlessings',event:blessingId,script:blessingId,month,assumeContinuity:true,assumeEventSelection:true,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256});
 const id='STR_JUNK_PILE_EX',r=manufacture[id];
 assert(r&&r.name===id&&r.time===360&&r.cost===0);
 assert.deepEqual(r.requiredItems,{STR_JUNK_PILE:1});assert.deepEqual(r.producedItems,{STR_SCRAP_METAL:15,STR_CHEMICALS:10,STR_SC_WIRE:2});assert.deepEqual(r.requires,['STR_SCHOOLING_1']);
 assert(Object.keys(r).every(k=>['name','category','requires','space','time','cost','requiredItems','producedItems','randomProducedItems','refund','listOrder'].includes(k)));
 const total=r.randomProducedItems.reduce((a,b)=>a+b[0],0);assert.equal(total,609);
 for(const [weight,rewards] of r.randomProducedItems){assert(Number.isSafeInteger(weight)&&weight>0);for(const [k,n] of Object.entries(rewards))assert(items[k]&&Number.isSafeInteger(n)&&n>0);}
 const eventAction=(event,month)=>{assert(specs.has(event));return {type:'conditionalOneTimeFixedItems',event,script:event,month,assumeContinuity:true,assumeEventSelection:true,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256};};
 const junkAction=item=>{const i=r.randomProducedItems.findIndex(([w,v])=>(v[item]||0)>0);assert(i>=0);return {type:'conditionalJunkExtraction',recipe:id,bundleIndex:i,count:1,assumeProductionTime:true,assumeWeightedOutcome:true,sourceFileSha256:files['Piratez.rul'],nativeArchiveSha256:lock.archiveSha256};};
 function apply(w,a){
  if(!['conditionalOneTimeFixedItems','conditionalJunkExtraction','conditionalPreCrownBlessings'].includes(a.type))return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   if(a.type==='conditionalPreCrownBlessings'){
    assert.deepEqual(a,blessingAction(a.month));assert.equal(a.month,w.month+1);assert(a.month>=bs.firstMonth);
    assert(Object.keys(bs.researchTriggers).every(k=>active(w,k)));
    assert(!(w.conditionalPreCrownBlessings||[]).some(x=>x.month>=a.month));
    const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;
    assert(Object.keys(bs.researchTriggers).every(k=>active(z,k)));
    z.items.STR_MUTANT_BLESSINGS=(z.items.STR_MUTANT_BLESSINGS||0)+9;
    z.generatedEvents[blessingId]=(z.generatedEvents[blessingId]||0)+1;
    if(Number.isFinite(z.score))z.score+=be.points;
    z.conditionalPreCrownBlessings=[...(z.conditionalPreCrownBlessings||[]),{month:a.month,event:blessingId,count:9,executionOdds:23}];
    return {ok:true,world:z,assumed:true,notes:['raw-repeatable-event-before-coronation','one-event-per-selected-month','conditional-continuity-delivery-rng']};
   }
   if(a.type==='conditionalOneTimeFixedItems'){
    assert.deepEqual(a,eventAction(a.event,a.month));assert.equal(a.month,w.month+1);assert(!w.generatedEvents[a.event]);
    const {s,trigger,reward}=specs.get(a.event);assert(active(w,trigger));
    const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;assert(active(z,trigger)&&z.month>=(s.firstMonth||0));
    const capacity=[];
    for(const p of new Set(Object.keys(reward).filter(k=>items[k].liveAlien).map(k=>items[k].liveAlienPrisonType??0))){
     const cap=[...z.facilities].reduce((n,k)=>n+((facilities[k]?.prisonType??0)===p?Number(facilities[k]?.aliens||0):0),0);
     let used=0;for(const stock of [z.items,z.otherItems])for(const [k,n] of Object.entries(stock||{}))if(items[k]?.liveAlien&&(items[k].liveAlienPrisonType??0)===p)used+=n;
     const need=Object.entries(reward).filter(([k])=>items[k].liveAlien&&(items[k].liveAlienPrisonType??0)===p).reduce((a,[,n])=>a+n,0);
     assert(cap-used>=need,'insufficient known detention capacity');capacity.push({prisonType:p,capacity:cap,used,need});
    }
    for(const [k,n] of Object.entries(reward))z.items[k]=(z.items[k]||0)+n;
    z.generatedEvents[a.event]=(z.generatedEvents[a.event]||0)+1;
    z.conditionalOneTimeFixedItems=[...(z.conditionalOneTimeFixedItems||[]),{event:a.event,month:a.month,trigger,reward,executionOdds:s.executionOdds,capacity}];
    return {ok:true,world:z,assumed:true,notes:['raw-one-time-complete-event-bundle','detention-capacity-checked','conditional-delivery-not-native-certified']};
   }
   const bundle=r.randomProducedItems[a.bundleIndex];assert(bundle&&Object.keys(bundle[1]).length===1);
   assert.deepEqual(a,junkAction(Object.keys(bundle[1])[0]));assert(r.requires.every(k=>active(w,k)));
   const z=structuredClone(w);assert((z.items.STR_JUNK_PILE||0)>=1,'missing junk pile');z.items.STR_JUNK_PILE--;
   const [weight,random]=bundle,reward={...r.producedItems};for(const [k,n] of Object.entries(random))reward[k]=(reward[k]||0)+n;
   for(const [k,n] of Object.entries(reward))z.items[k]=(z.items[k]||0)+n;
   z.conditionalJunkExtractions=[...(z.conditionalJunkExtractions||[]),{recipe:id,bundleIndex:a.bundleIndex,month:w.month,required:r.requiredItems,reward,weight,totalWeight:total,hours:r.time}];
   return {ok:true,world:z,assumed:true,notes:['raw-fixed-plus-random-output','material-debit','conditional-production-duration-and-rng-not-native-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,eventAction,junkAction,blessingAction};
}
