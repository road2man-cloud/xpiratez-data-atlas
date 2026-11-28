// V144: raw rule checked occult event awards, including native interrupt semantics.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {applyCampaignStartStep} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const same=(a,b)=>assert.deepEqual([...a].sort(),[...b].sort());
export function createOccultGate(data,snapshot,raw,base,root){
 const {files,events,eventScripts,items,research}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=p=>execFileSync('tar',['--force-local','-xOf',archive,'./src/'+p],{encoding:'utf8',maxBuffer:8*1024*1024});
 const award=cpp('Geoscape/GeoscapeEventState.cpp'),clock=cpp('Geoscape/GeoscapeState.cpp');
 assert(award.includes('save->hasUndiscoveredGetOneFree(rRule, true)')&&award.includes('RNG::generate(0, possibilities.size() - 1)')&&award.includes('rule.getEveryItemList()'));
 assert(clock.includes('getInterruptResearch()')&&clock.includes('interrupted = true;'));
 const configs=[
  ['STR_BLESSINGS','STR_BLESSINGS','STR_WASTELAND_PRIESTESS'],
  ['STR_WASTELAND_SORCERESS','STR_WASTELAND_SORCERESS_ACCEL','STR_WASTELAND_SORCERESS'],
  ['STR_GREEN_PRAYERS','STR_CAPTAIN_GREEN_EVENTS_1','STR_GODS_E2']
 ];
 const specs=new Map();
 for(const [event,script,id] of configs){
  const e=events[event],s=eventScripts[script],route=data.eventResearchSources[id].find(x=>x.event===event),ix=route.scripts.find(x=>x.script===script);
  assert(e&&s&&ix&&e.researchList.includes(id)&&route.choiceCount===e.researchList.length);
  assert(Object.keys(e).every(k=>['name','description','background','music','researchList','interruptResearch','everyItemList','everyMultiItemList','points','timer','timerRandom'].includes(k)));
  assert(Object.keys(s).every(k=>['type','eventWeights','firstMonth','minDifficulty','researchTriggers','executionOdds'].includes(k)));
  assert.equal(ix.executionOdds,s.executionOdds);assert.equal(ix.firstMonth,s.firstMonth??0);assert.equal(ix.otherConditions.minDifficulty,s.minDifficulty);
  same(ix.researchPositive,Object.entries(s.researchTriggers||{}).filter(([,b])=>b).map(([k])=>k));
  same(ix.researchNegative,Object.entries(s.researchTriggers||{}).filter(([,b])=>!b).map(([k])=>k));
  const weights=s.eventWeights[0];assert.equal(Object.keys(s.eventWeights).length,1);assert(weights[event]>0);
  assert.deepEqual(ix.monthWeights,[{month:0,weight:weights[event],totalWeight:Object.values(weights).reduce((a,b)=>a+b,0)}]);
  if(e.interruptResearch)assert.equal(e.interruptResearch,id);
  const reward={...e.everyMultiItemList};for(const k of e.everyItemList||[])reward[k]=(reward[k]||0)+1;
  for(const [k,n] of Object.entries(reward))assert(items[k]&&!items[k].liveAlien&&Number.isSafeInteger(n)&&n>0);
  specs.set(event,{event,script,id,e,s,ix,reward});
 }
 const action=(event,month)=>{const x=specs.get(event);assert(x);return {type:'conditionalOccultAward',event,script:x.script,research:x.id,month,assumeContinuity:true,assumeEventSelection:true,assumeDeliveryWithinMonth:true,assumeResearchSelection:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256};};
 function apply(w,a){
  if(a.type!=='conditionalOccultAward')return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);assert.deepEqual(a,action(a.event,a.month));assert.equal(a.month,w.month+1);assert(!w.generatedEvents[a.event]);
   const {e,s,id,ix,reward}=specs.get(a.event);
   const check=z=>{assert(!z.researched.has(id)&&!z.disabled.has(id),'already completed or disabled');if(e.interruptResearch)assert(!z.researched.has(e.interruptResearch),'event interrupted');
    const v=eventScriptVerdict({...ix,eventId:a.event},z,{mode:'current'});assert.equal(v.blocked.length,0,JSON.stringify(v.blocked));assert.equal(v.unknown.length,0,JSON.stringify(v.unknown));};
   // Validate the selection month. No fabricated research or award before the trigger.
   const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);check(q.world);
   const z=q.world,choices=e.researchList.filter(k=>!z.researched.has(k)||[...(research[k]?.getOneFree||[]),...Object.entries(research[k]?.getOneFreeProtected||{}).filter(([guard])=>z.researched.has(guard)).flatMap(([,ids])=>ids)].some(v=>!z.researched.has(v)));
   assert(choices.includes(id));
   // The common direct event award applies research effects, free awards and grants.
   // This raw adapter owns only the event bundle and interrupt/selection checks.
   const r=applyCampaignStartStep(z,{type:'eventResearch',event:a.event,script:a.script,research:id,assumeOutcome:true},data);assert(r.ok,r.reason);assert(active(r.world,id));assert.equal(r.world.generatedEvents[a.event],1);
   for(const [k,n] of Object.entries(reward))r.world.items[k]=(r.world.items[k]||0)+n;
   if(Number.isFinite(r.world.score))r.world.score+=e.points||0;
   r.world.conditionalOccultAwards=[...(r.world.conditionalOccultAwards||[]),{event:a.event,script:a.script,month:a.month,research:id,eligibleResearch:choices,reward,executionOdds:s.executionOdds,interruptResearch:e.interruptResearch||null}];
   return {...r,assumed:true,notes:[...(r.notes||[]),'raw-occult-event-single-research-selection','native-interrupt-research-checked','conditional-delivery-and-rng-not-native-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {action,apply};
}
