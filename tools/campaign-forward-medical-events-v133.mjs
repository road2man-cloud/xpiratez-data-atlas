// V133 source-gated fixed and random event bundles; conditional scheduler and delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sha=b=>createHash('sha256').update(b).digest('hex');
export function createMedicalEventGate(data,snapshot,raw,baseGate,root){
 const {files,events,eventScripts,items}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Geoscape/GeoscapeEventState.cpp'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert(cpp.includes('rule.getEveryItemList()')&&cpp.includes('rule.getRandomMultiItemList().at(pickItem)')&&cpp.includes('new Transfer(1)')&&cpp.includes('oxceGeoscapeEventsInstantDelivery'));
 const configs=[
  {event:'STR_SECRET_DOOR_MEDICAL_SUPPLIES',script:'STR_SECRET_DOOR_VERY_EARLY',bundleIndex:null,scoreRange:null,expected:{STR_MEDICAL_SUPPLIES:10}},
  {event:'STR_DELINQUENT_SPORTS_BAD',script:'STR_DELINQUENT_SCORE',bundleIndex:3,scoreRange:{min:-300,max:999},expected:{STR_BEER:3,STR_VODKA:1,STR_SECTOWEED:3,STR_CRACK:1}}
 ];
 const rules=new Map();
 const eventFields=new Set(['name','type','description','background','music','timer','timerRandom','points','funds','everyItemList','everyMultiItemList','randomMultiItemList']);
 const scriptFields=new Set(['type','eventWeights','firstMonth','lastMonth','executionOdds','researchTriggers','minScore','maxScore']);
 for(const c of configs){
  const e=events[c.event],s=eventScripts[c.script];assert(e&&s);
  assert(Object.keys(e).every(k=>eventFields.has(k))&&Object.keys(s).every(k=>scriptFields.has(k)),'unsupported event field');
  assert(Number.isSafeInteger(e.funds??0)&&Number.isSafeInteger(e.points??0));
  const rewards={};for(const k of arr(e.everyItemList))rewards[k]=(rewards[k]||0)+1;
  for(const [k,v] of Object.entries(e.everyMultiItemList||{}))rewards[k]=(rewards[k]||0)+v;
  if(c.bundleIndex!==null){
   assert(Array.isArray(e.randomMultiItemList)&&c.bundleIndex>=0&&c.bundleIndex<e.randomMultiItemList.length);
   for(const [k,v] of Object.entries(e.randomMultiItemList[c.bundleIndex]))rewards[k]=(rewards[k]||0)+v;
  }else assert(!arr(e.randomMultiItemList).length);
  assert.deepEqual(rewards,c.expected);
  for(const [k,v] of Object.entries(rewards))assert(items[k]&&Number.isSafeInteger(v)&&v>0);
  assert.deepEqual(c.scoreRange,c.scoreRange?{min:s.minScore,max:s.maxScore}:null);
  if(!c.scoreRange)assert(s.minScore===undefined&&s.maxScore===undefined);
  const monthWeights=Object.entries(s.eventWeights||{}).map(([m,x])=>({month:Number(m),weight:x[c.event]||0,totalWeight:Object.values(x).reduce((a,b)=>a+b,0)})).sort((a,b)=>a.month-b.month);
  assert(monthWeights.length&&monthWeights.some(x=>x.weight>0));
  const positive=Object.entries(s.researchTriggers||{}).filter(([,v])=>v===true).map(([k])=>k),negative=Object.entries(s.researchTriggers||{}).filter(([,v])=>v===false).map(([k])=>k);
  assert(Object.values(s.researchTriggers||{}).every(v=>typeof v==='boolean'));
  const spec={mode:'weighted',monthWeights,firstMonth:s.firstMonth??0,lastMonth:s.lastMonth??null,executionOdds:s.executionOdds??100,researchPositive:positive,researchNegative:negative,otherConditions:c.scoreRange?{minScore:c.scoreRange.min,maxScore:c.scoreRange.max}:{}};
  const action={type:'conditionalMedicalEventBundle',event:c.event,script:c.script,bundleIndex:c.bundleIndex,scoreRange:c.scoreRange,assumeEventSelection:true,assumeBundleSelection:c.bundleIndex!==null,assumeDelivery:true,assumeMonthlyScore:c.scoreRange!==null,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256};
  rules.set(c.event,{action,rewards,e,spec});
 }
 function apply(w,a){
  if(a.type!=='conditionalMedicalEventBundle')return baseGate.apply(w,a);
  try{
   const r=rules.get(a.event);assert(r);assert.deepEqual(a,r.action);
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree&&!w.generatedEvents?.[a.event]);
   assert(Number.isInteger(w.month));
   // Score predicate is conditional, not a persistent score grant. Do not
   // contradict a known score or a previously assumed rank threshold this month.
   let evaluation=w;
   if(a.scoreRange){
    for(const check of w.conditionalRankScoreChecks||[])if(check.month===w.month)assert(check.minScore<=a.scoreRange.max,'score-range-conflicts-with-rank-threshold');
    if(!Number.isFinite(w.score))evaluation={...w,score:a.scoreRange.min};
   }
   const v=eventScriptVerdict({...r.spec,eventId:a.event},evaluation,{mode:'current'});
   assert(!v.blocked.length&&!v.unknown.length,[...v.blocked,...v.unknown].join('; '));
   const z=structuredClone(w);
   for(const [k,n] of Object.entries(r.rewards))z.items[k]=(z.items[k]||0)+n;
   z.generatedEvents[a.event]=(z.generatedEvents[a.event]||0)+1;
   z.funds+=r.e.funds??0;assert(Number.isSafeInteger(z.funds)&&z.funds>=0);
   if(Number.isFinite(z.score))z.score+=r.e.points??0;
   z.conditionalMedicalEvents=[...(z.conditionalMedicalEvents||[]),{event:a.event,script:a.script,month:w.month,bundleIndex:a.bundleIndex,scoreRange:a.scoreRange,rewards:r.rewards}];
   return {ok:true,world:z,assumed:true,notes:[...v.pending,'source-checked-event-bundle','conditional-scheduler-and-item-delivery','native-score-and-event-rng-not-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,actions:[...rules.values()].map(r=>r.action)};
}
