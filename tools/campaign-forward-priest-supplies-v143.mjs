// V143: priest-specific supplies, validated against hashed event rules.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createPriestSupplyGate(data,snapshot,raw,base,root){
 const {files,events,eventScripts,items,facilities,research}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Geoscape/GeoscapeEventState.cpp'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert(cpp.includes('rule.getRandomItemList().at(pickItem)')&&cpp.includes('rule.getEveryItemList()')&&cpp.includes('rule.getResearchList()'));
 const configs=[
 {event:'STR_CAPTAIN_YESGREEN_NORED_AMONG_US',script:'STR_NORED_YESGREEN_EVENTS_PRIEST',triggers:{STR_CAPTAIN_PRIEST:true,STR_CAPTAIN_YESGREEN_NORED:true},item:'STR_GUILD_SOLDIER',fixed:{STR_CREDIT_CHIP_01:3,STR_GOVT_CORPSE:3},award:['STR_JACKSTOWN_SCOUTING']},
 {event:'STR_KNOCK_KNOCK_ATTACKED_IN_BED',script:'STR_NOGOLD_YESGREEN_EVENTS_PRIEST',triggers:{STR_CAPTAIN_PRIEST:true,STR_CAPTAIN_YESGREEN_NOGOLD:true},item:null,fixed:{STR_DAMSEL_SACRIFICE:1,STR_KNOIF:1,STR_LINGERIE:1},award:[]}
 ];
 const specs=new Map();
 for(const c of configs){
  const e=events[c.event],s=eventScripts[c.script];assert(e&&s);
  assert(Object.keys(e).every(k=>['name','description','background','music','researchList','randomItemList','everyItemList','everyMultiItemList','points','funds','timer','timerRandom'].includes(k)));
  assert(Object.keys(s).every(k=>['type','eventWeights','researchTriggers','executionOdds'].includes(k)));
  assert.deepEqual(s.researchTriggers,c.triggers);assert.equal(s.executionOdds,25);assert(s.eventWeights[0][c.event]>0);assert.equal(Object.keys(s.eventWeights).length,1);
  assert.deepEqual(e.researchList||[],c.award);assert(e.timer+e.timerRandom<31*24*60);
  const fixed={...e.everyMultiItemList};for(const k of e.everyItemList||[])fixed[k]=(fixed[k]||0)+1;assert.deepEqual(fixed,c.fixed);
  if(c.item)assert(e.randomItemList.includes(c.item));else assert(!e.randomItemList?.length);
  for(const k of [...Object.keys(fixed),...(c.item?[c.item]:[])])assert(items[k]);
  specs.set(c.event,{c,e,s,fixed});
 }
 const action=(event,month)=>{const x=specs.get(event);assert(x);return {type:'conditionalPriestSupply',event,script:x.c.script,month,item:x.c.item,assumeContinuity:true,assumeEventSelection:true,assumeRandomItem:x.c.item!==null,assumeDeliveryWithinMonth:true,sourceFileSha256:files['Piratez_Events.rul'],nativeArchiveSha256:lock.archiveSha256};};
 function apply(w,a){
  if(a.type!=='conditionalPriestSupply')return base.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);assert.deepEqual(a,action(a.event,a.month));assert.equal(a.month,w.month+1);assert(!w.generatedEvents[a.event]);
   const {c,e,s,fixed}=specs.get(a.event);
   const check=z=>{assert(Object.entries(c.triggers).every(([id,v])=>active(z,id)===v),'priest-research-gate');for(const id of c.award){assert(active(z,id));const r=research[id];assert(!(r.getOneFree||[]).some(k=>!z.researched.has(k))&&!Object.keys(r.getOneFreeProtected||{}).length,'unresolved duplicate research award');}};
   check(w);const q=base.apply(w,{type:'advanceMonth',month:a.month,assumeContinuity:true});assert(q.ok,q.reason);const z=q.world;check(z);
   const reward={...fixed};if(c.item)reward[c.item]=(reward[c.item]||0)+1;
   for(const p of new Set(Object.keys(reward).filter(k=>items[k].liveAlien).map(k=>items[k].liveAlienPrisonType??0))){
    const cap=[...z.facilities].reduce((n,id)=>n+((facilities[id]?.prisonType??0)===p?Number(facilities[id]?.aliens||0):0),0);
    let used=0;for(const stock of [z.items,z.otherItems])for(const [id,n] of Object.entries(stock||{}))if(items[id]?.liveAlien&&(items[id].liveAlienPrisonType??0)===p)used+=n;
    const need=Object.entries(reward).filter(([k])=>items[k].liveAlien&&(items[k].liveAlienPrisonType??0)===p).reduce((n,[,v])=>n+v,0);assert(cap-used>=need,'insufficient known detention capacity');
   }
   for(const [k,n] of Object.entries(reward))z.items[k]=(z.items[k]||0)+n;
   z.funds+=e.funds||0;assert(Number.isSafeInteger(z.funds)&&z.funds>=0);
   if(Number.isFinite(z.score))z.score+=e.points||0;
   z.generatedEvents[a.event]=(z.generatedEvents[a.event]||0)+1;
   const weights=s.eventWeights[0];
   z.conditionalPriestSupplies=[...(z.conditionalPriestSupplies||[]),{event:a.event,script:a.script,month:a.month,reward,odds:s.executionOdds,weight:weights[a.event],totalWeight:Object.values(weights).reduce((a,b)=>a+b,0),randomItemCount:e.randomItemList?.length||0}];
   return {ok:true,world:z,assumed:true,notes:['raw-priest-event-fixed-and-random-rewards','conditional-monthly-delivery','native-campaign-not-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action};
}
