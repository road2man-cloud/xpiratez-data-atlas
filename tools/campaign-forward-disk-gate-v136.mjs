// V136: monthly source-checked expedition supply. No injected research or stock.
// Each monthly scheduler selection is conditional; only one selected script per action.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const at=(table,month)=>table[Object.keys(table).map(Number).filter(k=>k<=month).sort((a,b)=>b-a)[0]];
export function createDiskGate(data,snapshot,raw,base,root){
 const {files,events,eventScripts,items,facilities,research}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 const geo=cpp('Geoscape/GeoscapeState.cpp'),delivery=cpp('Geoscape/GeoscapeEventState.cpp');
 assert(geo.includes('randomly generated repeatable events')&&geo.includes('getResearchTriggers()')&&delivery.includes('rule.getEveryItemList()'));
 const configs=[
 ['STR_KNOCK_KNOCK_CASTAWAYS','STR_KNOCK_KNOCK_0',{STR_SISTER_VICTIM:2},{STR_CAPTAIN_SOREASS:false}],
 ['STR_INTREPID_BRAINERS','STR_INTREPID_BRAINERS',{STR_DATA_DISK_B:1,STR_OLD_BOOKS:1,STR_AMPHORE:3,STR_COINS:3},{STR_SISTER_VICTIM_RECRUITMENT_BRAINER:true}]
 ];
 const rules=new Map();
 for(const [id,script,expected,triggers] of configs){
  const e=events[id],s=eventScripts[script];assert(e&&s);
  assert(Object.keys(e).every(k=>['name','type','description','background','music','timer','timerRandom','everyItemList'].includes(k)));
  assert(Object.keys(s).every(k=>['type','eventWeights','researchTriggers','firstMonth','lastMonth','executionOdds'].includes(k)));
  assert.deepEqual(s.researchTriggers,triggers);assert.equal(s.firstMonth,0);assert.equal(s.executionOdds,23);
  const reward={};for(const k of e.everyItemList)reward[k]=(reward[k]||0)+1;
  assert.deepEqual(reward,expected);assert(e.timer>=0&&e.timer+60<28*24*60);
  for(const [k,n] of Object.entries(reward))assert(items[k]&&Number.isSafeInteger(n)&&n>0);
  rules.set(id,{script,reward,triggers,s});
 }
 assert(research.STR_DATA_DISK_B.needItem&&research.STR_DATA_DISK_B.destroyItem&&research.STR_DATA_DISK_B.getOneFree.includes('STR_ROCKET_LAUNCHER'));
 function action(id,month){
  const r=rules.get(id);assert(r);
  return {type:'conditionalMonthlyDiskSupply',event:id,script:r.script,month,assumeContinuity:true,assumeEventSelection:true,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256};
 }
 function apply(w,a){
  if(a.type!=='conditionalMonthlyDiskSupply')return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   const r=rules.get(a.event);assert(r);assert.deepEqual(a,action(a.event,a.month));assert.equal(a.month,w.month+1);
   assert(a.month>=r.s.firstMonth&&(r.s.lastMonth==null||r.s.lastMonth===-1||a.month<=r.s.lastMonth));
   const weights=at(r.s.eventWeights,a.month);assert(weights?.[a.event]>0&&r.s.executionOdds>0);
   assert(Object.entries(r.triggers).every(([k,v])=>active(w,k)===v),'pre-month-event-research-trigger');
   // Conservative live-item check. The known starting prison must accommodate
   // all received live items without relying on unproved additional capacity.
   for(const p of new Set(Object.keys(r.reward).filter(id=>items[id].liveAlien).map(id=>items[id].liveAlienPrisonType??0))){
    const capacity=snapshot.facilities.filter(id=>w.facilities.has(id)).reduce((n,id)=>n+((facilities[id]?.prisonType??0)===p?Number(facilities[id]?.aliens||0):0),0);
    let used=0;for(const stock of [w.items,w.otherItems])for(const [id,n] of Object.entries(stock||{}))if(items[id]?.liveAlien&&(items[id].liveAlienPrisonType??0)===p)used+=n;
    const need=Object.entries(r.reward).filter(([id])=>items[id]?.liveAlien&&(items[id].liveAlienPrisonType??0)===p).reduce((n,[,count])=>n+count,0);
    assert(capacity-used>=need,'known-prison-capacity');
   }
   assert(!(w.conditionalMonthlyDiskSupplies||[]).some(x=>x.month>=a.month));
   const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;
   assert.equal(z.month,a.month);assert(Object.entries(r.triggers).every(([k,v])=>active(z,k)===v),'post-month-event-research-trigger');
   for(const [k,n] of Object.entries(r.reward))z.items[k]=(z.items[k]||0)+n;
   z.generatedEvents[a.event]=(z.generatedEvents[a.event]||0)+1;
   z.conditionalMonthlyDiskSupplies=[...(z.conditionalMonthlyDiskSupplies||[]),{month:a.month,event:a.event,script:a.script,rewards:r.reward,executionOdds:r.s.executionOdds,selectionWeight:weights[a.event],totalWeight:Object.values(weights).reduce((x,y)=>x+y,0)}];
   return {ok:true,world:z,assumed:true,notes:['source-checked-monthly-item-list','conservative-known-prison-capacity','conditional-event-selection-delivery-and-continuity','no-native-calendar-economy-certification']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {action,apply};
}
