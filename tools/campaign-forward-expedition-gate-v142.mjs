// V142: source-bound conditional random manufacture. Only explicit raw recipes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createExpeditionGate(data,snapshot,raw,base,root){
 const {files,items,manufacture,events,eventScripts,facilities}=raw;
 const dir=path.join(root,'tools/headless-simulator/native');
 const lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Savegame/Production.cpp'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert(cpp.includes('_rules->getProducedItems()')&&cpp.includes('_rules->getRandomProducedItems()')&&cpp.includes('RNG::generate(1, totalWeight)')&&cpp.includes('runningTotal >= roll'));
 const survey='STR_EXPEDITION_RESEARCH',box='STR_LOOTBOX_EXPEDITION',debrief='STR_EXPEDITION_DEBRIEF',open='STR_LOOTBOX_EXPEDITION_EX';
 assert.equal(items[survey].costBuy,50000);assert.deepEqual(items[survey].requiresBuy,['STR_EXPEDITION_RESEARCH_INCOMPLETE']);
 const recipes=new Map();
 for(const [id,input,output,time] of [[debrief,{[survey]:1},{STR_EXPEDITION_REPORTS:1,[box]:1},20],[open,{[box]:1},{STR_SCRAP_METAL:1},5]]){
  const r=manufacture[id];assert(r&&r.name===id);
  assert.deepEqual(r.requiredItems,input);assert.deepEqual(r.producedItems,output);assert.deepEqual(r.requires,['STR_EXPEDITIONS']);assert.equal(r.cost,0);assert.equal(r.time,time);
  assert(Object.keys(r).every(k=>['name','category','requires','space','time','cost','requiredItems','producedItems','randomProducedItems','refund','listOrder'].includes(k)));
  const bundles=r.randomProducedItems;assert(Array.isArray(bundles)&&bundles.length);
  for(const [weight,reward] of bundles){assert(Number.isSafeInteger(weight)&&weight>0);for(const [k,n] of Object.entries(reward))assert(items[k]&&Number.isSafeInteger(n)&&n>0);}
  recipes.set(id,{r,bundles,total:bundles.reduce((a,b)=>a+b[0],0)});
 }
 const action=(recipe,bundleIndex)=>{const p=recipes.get(recipe);assert(p&&p.bundles[bundleIndex]);return {type:'conditionalExpeditionManufacture',recipe,bundleIndex,count:1,assumeProductionTime:true,assumeWeightedOutcome:true,sourceFileSha256:files['Piratez.rul'],nativeArchiveSha256:lock.archiveSha256};};
 function bundleFor(recipe,item){const p=recipes.get(recipe);assert(p);const i=p.bundles.findIndex(([_,v])=>(v[item]||0)>0);assert(i>=0,'no requested output '+item);return action(recipe,i);}
 const fanEvent='STR_DUMBLAZY_AT_SEANS_RABID_FANS',fanScript='STR_CAPTAIN_DUMBLAZY_EVENTS_1',gnome='STR_GNOME';
 const e=events[fanEvent],s=eventScripts[fanScript];
 assert(Object.keys(e).every(k=>['name','description','background','music','randomItemList','timer','timerRandom'].includes(k)));
 assert(Object.keys(s).every(k=>['type','eventWeights','researchTriggers','executionOdds'].includes(k)));
 assert.deepEqual(s.researchTriggers,{STR_CAPTAIN_DUMBLAZY:true});assert.equal(s.executionOdds,20);assert.equal(s.eventWeights[0][fanEvent],150);assert.equal(e.randomItemList.filter(k=>k===gnome).length,1);
 const eventCpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Geoscape/GeoscapeEventState.cpp'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert(eventCpp.includes('rule.getRandomItemList().at(pickItem)'));
 const gnomeAction=month=>({type:'conditionalGnomeEvent',event:fanEvent,script:fanScript,month,item:gnome,assumeContinuity:true,assumeEventSelection:true,assumeRandomItem:true,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256});
 function apply(w,a){
  if(!['conditionalExpeditionManufacture','conditionalGnomeEvent'].includes(a.type))return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   if(a.type==='conditionalGnomeEvent'){
    assert.deepEqual(a,gnomeAction(a.month));assert.equal(a.month,w.month+1);assert(active(w,'STR_CAPTAIN_DUMBLAZY')&&!w.generatedEvents[fanEvent]);
    const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;assert(active(z,'STR_CAPTAIN_DUMBLAZY'));
    const prison=items[gnome].liveAlienPrisonType??0;
    const capacity=[...z.facilities].reduce((n,id)=>n+((facilities[id]?.prisonType??0)===prison?Number(facilities[id]?.aliens||0):0),0);
    let used=0;for(const stock of [z.items,z.otherItems])for(const [id,count] of Object.entries(stock||{}))if(items[id]?.liveAlien&&(items[id].liveAlienPrisonType??0)===prison)used+=count;
    assert(capacity>used,'insufficient known detention capacity');
    z.items[gnome]=(z.items[gnome]||0)+1;z.generatedEvents[fanEvent]=(z.generatedEvents[fanEvent]||0)+1;
    z.conditionalGnomeEvents=[{month:a.month,event:fanEvent,script:fanScript,executionOdds:s.executionOdds,eventWeight:s.eventWeights[0][fanEvent],totalWeight:Object.values(s.eventWeights[0]).reduce((a,b)=>a+b,0),randomItemCount:e.randomItemList.length,capacity,used}];
    return {ok:true,world:z,assumed:true,notes:['source-backed-captain-event-rng','conditional-delivery-within-month','detention-capacity-checked']};
   }
   assert.deepEqual(a,action(a.recipe,a.bundleIndex));
   const p=recipes.get(a.recipe),r=p.r;assert(r.requires.every(id=>active(w,id)),'expedition prerequisite missing');
   const z=structuredClone(w),[weight,bundle]=p.bundles[a.bundleIndex];
   for(const [id,n] of Object.entries(r.requiredItems)){assert((z.items[id]||0)>=n,'missing material '+id);z.items[id]-=n;}
   const produced={...r.producedItems};for(const [id,n] of Object.entries(bundle))produced[id]=(produced[id]||0)+n;
   for(const [id,n] of Object.entries(produced))z.items[id]=(z.items[id]||0)+n;
   z.conditionalExpeditionManufactures=[...(z.conditionalExpeditionManufactures||[]),{recipe:a.recipe,bundleIndex:a.bundleIndex,weight,totalWeight:p.total,required:r.requiredItems,produced,hours:r.time,month:w.month}];
   return {ok:true,world:z,assumed:true,notes:['native-fixed-plus-weighted-random-output','explicit-material-debit','conditional-production-clock-and-rng','native-gameplay-not-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action,bundleFor,survey,box,debrief,open,gnomeAction};
}
