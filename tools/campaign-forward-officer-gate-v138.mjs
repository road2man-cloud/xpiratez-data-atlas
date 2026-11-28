// V138: source-gated gold sale, costed gym acquisition, and captain event reward.
// Existing V137 actions are delegated unchanged so the old graph is replayable.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createOfficerGate(data,snapshot,raw,base,root){
 const {files,items,facilities,events,eventScripts,saleCoefficients}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 const sell=cpp('Basescape/SellState.cpp'),itemCpp=cpp('Mod/RuleItem.cpp'),save=cpp('Savegame/SavedGame.cpp');
 assert(sell.includes('getSellCostAdjusted')&&sell.includes('getFunds() + _total')&&sell.includes('container->removeItem(rule, toRemove)'));
 assert(itemCpp.includes('sellPriceCoefficient / 100')&&itemCpp.includes('ModScript::SellCostItem'));
 assert(save.includes('Mod::SELL_PRICE_COEFFICIENT[std::min((int)_difficulty, 4)]'));
 assert.deepEqual(saleCoefficients,[115,100,90,75,60]);
 const gold=items.STR_GOLD_BAR;assert(gold&&gold.costSell===40000&&!gold.liveAlien&&!gold.fixed&&!gold.script&&!gold.scripts);
 const gym=facilities.STR_GYM_ROOM;assert(gym&&gym.buildCost===475000&&gym.buildTime===20&&gym.provideBaseFunc.includes('DOJO'));
 const event='STR_TRAIN_YOUR_BODY_EVENT',script='STR_CAPTAIN_SOREDUMB_EVENTS_1',e=events[event],s=eventScripts[script];
 assert(e&&s&&s.executionOdds===20&&e.points===80);
 assert.deepEqual(s.researchTriggers,{STR_CAPTAIN_SOREDUMB:true});
 assert.deepEqual(e.everyItemList,['STR_GLAMOUR','STR_GLAMOUR','STR_GLAMOUR']);
 assert.equal(s.eventWeights[0][event],100);
 assert(Object.keys(s).every(k=>['type','eventWeights','researchTriggers','executionOdds'].includes(k)));
 assert(Object.keys(e).every(k=>['name','description','background','everyItemList','points','timer','timerRandom'].includes(k)));
 const difficulty=snapshot.difficulty;assert(Number.isSafeInteger(difficulty)&&difficulty>=0&&difficulty<=4,'known campaign difficulty required');
 const sellAction=count=>({type:'conditionalGoldSale',item:'STR_GOLD_BAR',count,difficulty,coefficient:saleCoefficients[difficulty],assumeUnmodifiedSale:true,sourceFileSha256:files['Piratez.rul'],globalSha256:files['Piratez_Globals.rul'],nativeArchiveSha256:lock.archiveSha256});
 const gymAction={type:'conditionalCostedGym',id:'STR_GYM_ROOM',assumeBuildCompletion:true,sourceFileSha256:files['Piratez.rul']};
 const glamourAction=month=>({type:'conditionalTrainingEventReward',event,script,month,assumeContinuity:true,assumeEventSelection:true,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul']});
 function apply(w,a){
  if(!['conditionalGoldSale','conditionalCostedGym','conditionalTrainingEventReward'].includes(a.type))return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   if(a.type==='conditionalGoldSale'){
    assert.deepEqual(a,sellAction(a.count));
    assert(Number.isSafeInteger(a.count)&&a.count>0&&(w.items.STR_GOLD_BAR||0)>=a.count,'insufficient-gold-stock');
    if(Number.isInteger(w.difficulty))assert.equal(w.difficulty,a.difficulty,'difficulty-mismatch');
    if(w.conditionalSaleDifficulty!==undefined)assert.equal(w.conditionalSaleDifficulty,a.difficulty);
    const z=structuredClone(w),proceeds=Math.trunc(gold.costSell*a.coefficient/100)*a.count;
    z.items.STR_GOLD_BAR-=a.count;z.funds+=proceeds;assert(Number.isSafeInteger(z.funds)&&z.funds>=0);
    z.conditionalSaleDifficulty=a.difficulty;
    z.conditionalGoldSales=[...(z.conditionalGoldSales||[]),{month:w.month,count:a.count,unitPrice:proceeds/a.count,proceeds}];
    return {ok:true,world:z,assumed:true,notes:['native-sale-formula','snapshot-difficulty-coefficient-no-price-script-adjustment','stock-consumed-not-fund-grant']};
   }
   if(a.type==='conditionalCostedGym'){
    assert.deepEqual(a,gymAction);assert(w.funds>=gym.buildCost,'insufficient-gym-funds');
    const result=base.apply(w,{type:'acquireFacility',id:a.id});assert(result.ok,result.reason);
    const z=result.world;z.funds-=gym.buildCost;
    z.conditionalCostedFacilities=[...(z.conditionalCostedFacilities||[]),{id:a.id,month:w.month,paid:gym.buildCost,buildDays:gym.buildTime}];
    return {ok:true,world:z,assumed:true,notes:[...(result.notes||[]),'construction-cost-debited','native-build-calendar-layout-and-upkeep-not-certified']};
   }
   assert.deepEqual(a,glamourAction(a.month));assert.equal(a.month,w.month+1);
   assert(active(w,'STR_CAPTAIN_SOREDUMB'));assert(!(w.conditionalTrainingEventRewards||[]).some(x=>x.month>=a.month));
   const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);
   const z=q.world;assert.equal(z.month,a.month);assert(active(z,'STR_CAPTAIN_SOREDUMB'));
   z.items.STR_GLAMOUR=(z.items.STR_GLAMOUR||0)+3;
   z.generatedEvents[event]=(z.generatedEvents[event]||0)+1;
   if(Number.isFinite(z.score))z.score+=e.points;
   z.conditionalTrainingEventRewards=[...(z.conditionalTrainingEventRewards||[]),{event,script,month:a.month,rewards:{STR_GLAMOUR:3},scoreDelta:e.points}];
   return {ok:true,world:z,assumed:true,notes:['source-checked-monthly-event-selection','event-delivery-and-continuity-assumed']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,sellAction,gymAction,glamourAction};
}
