// V135: repeatable monthly harvest and raw fixed-output bounty exchange.
// All month changes use the previous gate. No native scheduler/economy claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createBountyGate(data,snapshot,raw,base,root){
 const {files,events,eventScripts,items,manufacture}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert(cpp('Geoscape/GeoscapeState.cpp').includes('randomly generated repeatable events'));
 assert(cpp('Savegame/SavedGame.cpp').includes('_geoscapeEvents.push_back(newEvent)'));
 const mc=cpp('Mod/RuleManufacture.cpp');assert(mc.includes('_producedItemsNames[name] = 1')&&mc.includes('loadUnorderedNamesToInt(_name, _producedItemsNames, reader["producedItems"])'));
 const e=events.STR_SACRIFICES,s=eventScripts.STR_SACRIFICES;
 assert.deepEqual(s.eventWeights,{'0':{STR_SACRIFICES:100}});
 assert.deepEqual(s.researchTriggers,{STR_CROWNING_UC:true});assert.equal(s.firstMonth,0);assert.equal(s.executionOdds,75);
 assert(Object.keys(s).every(k=>['type','eventWeights','firstMonth','executionOdds','researchTriggers'].includes(k)));
 assert(Object.keys(e).every(k=>['name','type','description','background','music','timer','timerRandom','everyItemList','everyMultiItemList','randomMultiItemList'].includes(k)));
 assert.deepEqual(e.randomMultiItemList[0],{STR_CREDIT_CHIP_D:20,STR_MUTANT_BLESSINGS:5});
 const rewards={};for(const k of e.everyItemList||[])rewards[k]=(rewards[k]||0)+1;
 for(const obj of [e.everyMultiItemList,e.randomMultiItemList[0]])for(const [k,v] of Object.entries(obj||{}))rewards[k]=(rewards[k]||0)+v;
 for(const [k,n] of Object.entries(rewards))assert(items[k]&&Number.isSafeInteger(n)&&n>0);
 assert(e.timer+e.timerRandom+60<28*24*60);
 const recipes=new Map();
 for(const [id,required,produced,func,req,time] of [
 ['STR_OFFERING_TO_PURPLE_BLOOM',{STR_MUTANT_BLESSINGS:69},{STR_OFFERING_TO_PURPLE_BLOOM:1,STR_TROPHY_CREDIT_MUTANT_ALLIANCE:300},['CULT'],['STR_MUTANT_BLESSINGS'],200],
 ['STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS',{STR_TROPHY_CREDIT_MUTANT_ALLIANCE:300},{STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS:1},[],['STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS_PREQ'],5]
 ]){
  const r=manufacture[id];assert(r&&r.name===id&&r.category==='STR_TROPHIES');
  assert(Object.keys(r).every(k=>['name','category','requires','requiresBaseFunc','space','time','cost','requiredItems','producedItems','refund'].includes(k)));
  assert.deepEqual(r.requiredItems,required);assert.deepEqual(r.producedItems||{[id]:1},produced);assert.deepEqual(r.requiresBaseFunc||[],func);assert.deepEqual(r.requires,req);assert.equal(r.cost,0);assert.equal(r.time,time);
  for(const k of [...Object.keys(required),...Object.keys(produced)])assert(items[k]);
  recipes.set(id,{required,produced,func,req,time});
 }
 const harvestAction=month=>({type:'conditionalMonthlyHarvest',month,event:'STR_SACRIFICES',script:'STR_SACRIFICES',bundleIndex:0,assumeContinuity:true,assumeEventSelection:true,assumeBundleSelection:true,assumeDelivery:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256});
 const exchangeAction=id=>({type:'conditionalBountyExchange',recipe:id,count:1,assumeProductionTime:true,sourceFileSha256:files['Piratez.rul'],nativeArchiveSha256:lock.archiveSha256});
 function apply(w,a){
  if(!['conditionalMonthlyHarvest','conditionalBountyExchange'].includes(a.type))return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree,'resolve pending free award');
   if(a.type==='conditionalMonthlyHarvest'){
    assert.deepEqual(a,harvestAction(a.month));assert.equal(a.month,w.month+1);assert(active(w,'STR_CROWNING_UC'));
    assert(!(w.conditionalMedicalEvents||[]).some(x=>x.event===a.event&&x.month>=a.month));
    assert(!(w.conditionalMonthlyHarvests||[]).some(x=>x.month>=a.month));
    const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;
    assert.equal(z.month,a.month);assert(active(z,'STR_CROWNING_UC'));
    for(const [k,n] of Object.entries(rewards))z.items[k]=(z.items[k]||0)+n;
    z.generatedEvents[a.event]=(z.generatedEvents[a.event]||0)+1;
    z.conditionalMonthlyHarvests=[...(z.conditionalMonthlyHarvests||[]),{month:a.month,event:a.event,script:a.script,bundleIndex:0,rewards}];
    return {ok:true,world:z,assumed:true,notes:['monthly-repeatable-event-one-use-per-month','pre-month-research-gate','conditional-rng-delivery-and-continuity','native-calendar-economy-not-certified']};
   }
   assert.deepEqual(a,exchangeAction(a.recipe));const r=recipes.get(a.recipe);assert(r);
   assert(r.req.every(id=>active(w,id))&&r.func.every(f=>w.baseFunctions.has(f)),'bounty-exchange-gate');
   const z=structuredClone(w);
   for(const [k,n] of Object.entries(r.required)){assert((z.items[k]||0)>=n,'missing:'+k);z.items[k]-=n;}
   for(const [k,n] of Object.entries(r.produced))z.items[k]=(z.items[k]||0)+n;
   z.conditionalBountyExchanges=[...(z.conditionalBountyExchanges||[]),{recipe:a.recipe,month:w.month,required:r.required,produced:r.produced,hours:r.time}];
   return {ok:true,world:z,assumed:true,notes:['raw-fixed-multi-output-recipe','production-capacity-clock-not-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,harvestAction,exchangeAction};
}
