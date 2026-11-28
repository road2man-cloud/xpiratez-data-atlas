// V139: source-backed captain book rewards and existing-hangar sports reward.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createBookGate(data,snapshot,raw,base,root){
 const {files,events,eventScripts,items,research}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Geoscape/GeoscapeEventState.cpp'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert(cpp.includes('rule.getRandomItemList().at(pickItem)')&&cpp.includes('rule.getEveryItemList()')&&cpp.includes('rule.getResearchList()'));
 const configs=[
 {event:'STR_JACKLAZY_PUSSY_BOOK_THIEF',script:'STR_CAPTAIN_JACKLAZY_EVENTS_PUSSY',triggers:{STR_CAPTAIN_PUSSY_UP:true,STR_CAPTAIN_JACKLAZY:true},odds:35,choices:['STR_BOOK_OF_SERMONS'],expectedResearch:['STR_JACKSTOWN_SCOUTING']},
 {event:'STR_BOOKWORM_BUY_BOOKS',script:'STR_CAPTAIN_LAZYSORE_EVENTS_1',triggers:{STR_CAPTAIN_LAZYSORE:true},odds:20,choices:['STR_BOOK_OF_SERMONS','STR_SCHOOL_BOOKS_ITEM'],funds:-75000},
 {event:'STR_VOLLEYBALL_MATCH',script:'STR_VOLLEYBALL_MATCH',triggers:{STR_GYMNASTICS:true},facilities:{STR_HANGAR:true},odds:23,choices:[null],fixed:{STR_PORN:3,STR_GLAMOUR:3},points:125}
 ];
 const specs=new Map();
 for(const c of configs){
  const e=events[c.event],s=eventScripts[c.script];assert(e&&s);
  assert(Object.keys(e).every(k=>['name','description','background','music','randomItemList','everyItemList','researchList','timer','timerRandom','funds','points'].includes(k)));
  assert(Object.keys(s).every(k=>['type','eventWeights','researchTriggers','facilityTriggers','executionOdds','firstMonth'].includes(k)));
  assert.deepEqual(s.researchTriggers,c.triggers);assert.deepEqual(s.facilityTriggers||{},c.facilities||{});assert.equal(s.executionOdds,c.odds);assert.equal(e.funds||0,c.funds||0);assert.equal(e.points||0,c.points||0);assert.deepEqual(e.researchList||[],c.expectedResearch||[]);
  assert.equal(Object.keys(s.eventWeights).length,1);assert(s.eventWeights[0][c.event]>0);
  const fixed={};for(const id of e.everyItemList||[])fixed[id]=(fixed[id]||0)+1;assert.deepEqual(fixed,c.fixed||{});
  for(const id of c.choices)if(id!==null){assert(e.randomItemList.includes(id)&&items[id]);}else assert(!e.randomItemList?.length);
  for(const id of Object.keys(fixed))assert(items[id]);
  assert(e.timer>=0&&e.timer<28*24*60);
  specs.set(c.event,{c,e,s,fixed});
 }
 const action=(event,month,item=null)=>{const r=specs.get(event);assert(r&&r.c.choices.includes(item));return {type:'conditionalBookEvent',event,script:r.c.script,month,item,assumeContinuity:true,assumeEventSelection:true,assumeRandomItem:item!==null,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256};};
 function apply(w,a){
  if(a.type!=='conditionalBookEvent')return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   const r=specs.get(a.event);assert(r);assert.deepEqual(a,action(a.event,a.month,a.item));assert.equal(a.month,w.month+1);
   assert(a.month>=(r.s.firstMonth||0));assert(!(w.conditionalBookEvents||[]).some(x=>x.month>=a.month));
   const check=z=>{assert(Object.entries(r.c.triggers).every(([id,v])=>active(z,id)===v),'event-research-gate');assert(Object.entries(r.c.facilities||{}).every(([id,v])=>z.facilities.has(id)===v),'event-facility-gate');for(const id of r.c.expectedResearch||[]){assert(active(z,id),'unsupported additional event research');const rule=research[id];assert(!(rule.getOneFree||[]).some(k=>!z.researched.has(k))&&!Object.keys(rule.getOneFreeProtected||{}).length,'unresolved event free award');}};
   check(w);const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;check(z);
   const reward={...r.fixed};if(a.item)reward[a.item]=(reward[a.item]||0)+1;
   for(const [id,count] of Object.entries(reward))z.items[id]=(z.items[id]||0)+count;
   z.funds+=r.e.funds||0;assert(Number.isSafeInteger(z.funds)&&z.funds>=0,'insufficient-event-funds');
   if(Number.isFinite(z.score))z.score+=r.e.points||0;
   z.generatedEvents[a.event]=(z.generatedEvents[a.event]||0)+1;
   const weights=r.s.eventWeights[0],matches=a.item?r.e.randomItemList.filter(id=>id===a.item).length:0;
   z.conditionalBookEvents=[...(z.conditionalBookEvents||[]),{event:a.event,script:a.script,month:a.month,reward,funds:r.e.funds||0,executionOdds:r.s.executionOdds,selectionWeight:weights[a.event],totalWeight:Object.values(weights).reduce((x,y)=>x+y,0),randomItemMatches:matches,randomItemCount:r.e.randomItemList?.length||0}];
   return {ok:true,world:z,assumed:true,notes:['raw-event-and-native-random-item-list','conditional-monthly-selection-and-delivery','no-native-campaign-certification']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action};
}
