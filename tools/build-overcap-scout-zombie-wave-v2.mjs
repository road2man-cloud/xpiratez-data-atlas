// V158: shared scout checkpoint, repeat event free rewards and medical gates.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createCareerReplay} from './atlas-overcap-forward-career-replay-v1.mjs';
import {createRandomItemEventAdapter} from './atlas-overcap-forward-random-event-v1.mjs';
import {createTavernRecovery} from './atlas-overcap-forward-tavern-recovery-v1.mjs';
import {createMonthlyWitness} from './atlas-overcap-forward-monthly-witness-v1.mjs';
import {createMonthlyResearchReward} from './atlas-overcap-forward-monthly-research-reward-v1.mjs';
import {createRepeatedResearchReward} from './atlas-overcap-forward-repeated-research-reward-v1.mjs';
import {createMonthlyFixedReward} from './atlas-overcap-forward-monthly-fixed-reward-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const priorPath='tools/data/overcap-tavern-persuasion-wave-v1-4fc1761e1f60184e3b2d.json.gz';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const eventPath='tools/data/overcap-forward-random-event-wave-v1-18cce509c74a8e4734d5.json.gz';
const lockPath='tools/headless-simulator/native/source.lock.json';
const lock=read(lockPath),archive='tools/headless-simulator/native/'+lock.archive;
assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
const prior=read(priorPath),bulk=read(bulkPath),eventPrior=read(eventPath),source=read(prior.sourcePath);
assert.equal(sha(fs.readFileSync(prior.sourcePath)),prior.sourceSha256);
const data=read('public/data/soldiers-modern-index.json');
data.forwardSupply=read('tools/data/overcap-forward-supply-catalog-v2.json');data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
assert.equal(data.meta.source.metadataSha256,prior.sourceMetadataSha256);
assert.equal(data.meta.source.metadataSha256,bulk.sourceMetadataSha256);
const rp=createCareerReplay(data,{maxMonth:36}),monthly=createMonthlyWitness(data,rp);
const tavern=createTavernRecovery(data,source,rp,prior.sourceSha256),cat=data.forwardSupply;
const wanted=new Set(['STR_TROUBLESEEKING_ENEMY','STR_TROUBLESEEKING_FRIENDS','STR_GOLD_AT_SEANS_NEW_FACES','STR_NOGRAY_YESGOLD_READING_FOR_THE_PLOT','STR_MAXIMUM_EXPLOITATION']),raws=new Map();
for(const p of [eventPrior.source.path,...Object.keys(cat.sourceFiles).filter(p=>p.startsWith('public/data/event-chunks/')&&p!==eventPrior.source.path)]){
 if(!wanted.size)break;
 const bytes=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',cat.sourceCommit+':'+p],{maxBuffer:64*1024*1024});
 assert.equal(sha(bytes),cat.sourceFiles[p],p);
 for(const e of Object.values(JSON.parse(gunzipSync(bytes)).details))if(wanted.has(e.id)){
  raws.set(e.id,{raw:e,source:{commit:cat.sourceCommit,path:p,sha256:sha(bytes)}});wanted.delete(e.id);
 }
}
assert.equal(wanted.size,0);
const enemy=raws.get('STR_TROUBLESEEKING_ENEMY'),friends=raws.get('STR_TROUBLESEEKING_FRIENDS');
assert.deepEqual(enemy.source,eventPrior.source);
const rnd=createRandomItemEventAdapter(data,enemy.raw,enemy.source);
const repeatEnemy=monthly.adapter(enemy.raw,enemy.source),repeatFriends=monthly.adapter(friends.raw,friends.source);
const adapters=new Map([[repeatEnemy.id,repeatEnemy],[repeatFriends.id,repeatFriends]]);
const researchAdapters=new Map();
for(const id of ['STR_GOLD_AT_SEANS_NEW_FACES','STR_NOGRAY_YESGOLD_READING_FOR_THE_PLOT']){
 const e=raws.get(id);researchAdapters.set(id,createMonthlyResearchReward(data,rp,monthly,e.raw,e.source));
}
const proofPath='tools/data/overcap-repeat-research-source-v1-5605eb3775728d0798d1.json';
const proof=read(proofPath),gold='STR_GOLD_AT_SEANS_NEW_FACES';
const goldRaw=raws.get(gold);
const repeatGold=createRepeatedResearchReward(data,rp,goldRaw.raw,goldRaw.source,proof,sha(fs.readFileSync(proofPath)));
const fixedCash=raws.get('STR_MAXIMUM_EXPLOITATION');
const repeatCash=createMonthlyFixedReward(data,rp,monthly,fixedCash.raw,fixedCash.source);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
function oldStep(s,a){return a.type==='sourceRandomEventItem'?rnd.apply(s,a):a.type==='sourceMapRecovery'?tavern.apply(s,a):rp.research(s,a);}
function legacyReplay(actions){let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));for(const a of actions.slice(2))s=oldStep(s,a);return s;}
function replay(actions){
 let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));
 for(const a of actions.slice(2)){
  if(a.type==='sourceMonthlyBoundary')s=monthly.advance(s,a);
  else if(a.type==='sourceMonthlyFixedReward')s=repeatCash.apply(s,a);
  else if(a.type==='sourceMonthlyRepeatedResearchReward')s=repeatGold.apply(s,a);
  else if(a.type==='sourceMonthlyResearchReward')s=researchAdapters.get(a.event).apply(s,a);
  else if(a.type==='sourceMonthlyItemEvent')s=adapters.get(a.event).apply(s,a);
  else if(monthly.scripted(a))s=monthly.applyLegacy(s,a,oldStep);
  else if(['recruit','transform','conditionalCapGrowth','conditionalPromotion','conditionalMedal'].includes(a.type))s=rp.career(s,a);
  else s=oldStep(s,a);
 }
 return s;
}
function settle(s,free=null){
 for(let i=0;!rp.settled(s);i++){
  assert(i<60);const opts=rp.options(s);
  const o=s.world.pendingFree&&free?opts.find(x=>x.action.type==='freeResearch'&&x.action.research===free):opts[0];
  assert(o,'Required reward not available: '+free);
  s=rp.research(s,o.action);
 }return s;
}
function lab(s,id,free=null){
 if(active(s.world,id))return s;
 const o=rp.options(s).find(x=>x.action.type==='research'&&x.action.id===id);
 assert(o,'Laboratory project not currently enabled: '+id);
 return settle(rp.research(s,o.action),free);
}
function reward(s,adapter,item=null){
 s=monthly.advance(s);
 const o=adapter.options(s,item)[0];assert(o,'No eligible repeatable monthly reward: '+adapter.id);
 const old=Object.fromEntries(Object.keys(o.evidence.rewards).map(k=>[k,qty(s.world,k)]));
 const expectedCount=Number(s.world.generatedEvents[adapter.id]||0)+1;
 s=settle(adapter.apply(s,o.action));
 assert.equal(s.world.generatedEvents[adapter.id],expectedCount);
 for(const [k,n] of Object.entries(o.evidence.rewards))assert.equal(qty(s.world,k),old[k]+n);
 return s;
}
function receipt(s){return {month:s.world.month,root:s.root,difficulty:s.world.difficulty,actions:s.actions,trace:s.trace,stateHash:exactStateHash(s.world),balance:s.world.funds,income:s.income,procurement:s.procurement,careerSpend:s.careerSpend};}
const checkpointPath='tools/data/overcap-scout-training-wave-v1-4be39b12d8aa09449893.json.gz';
const checkpoint=read(checkpointPath);
assert.equal(checkpoint.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(checkpoint.bulkSha256,sha(fs.readFileSync(bulkPath)));
const seed=replay(checkpoint.continuation.actions);
assert.equal(exactStateHash(seed.world),checkpoint.continuation.stateHash);
const zombie='STR_ZOMBIE',direct=data.researchRules[zombie].dependencies;
const training='STR_ANG_102',trainingRule=data.transformations.find(t=>t.id===training);
const req={research:trainingRule.requires,functions:trainingRule.requiresBaseFunc,items:trainingRule.requiredItems,cost:trainingRule.cost};
const milestones=['STR_GUILD_MEDIC','STR_MEDICAL_SUPPLIES','STR_CRACK','STR_MEDICINE','STR_MED_BAY',...direct,zombie,'STR_ARCANE_BOOK','STR_VAMPIRE_BLOOD','STR_VAMPIRE_ESSENCE','STR_ZOMBIE_ESSENCE','STR_ANG_010','STR_ANG_011','STR_ANG_012',training];
function snapshot(s){return {month:s.world.month,balance:s.world.funds,researchCount:s.world.researched.size,activeMilestones:milestones.filter(k=>active(s.world,k)),zombieDirect:direct.filter(k=>active(s.world,k)),zombieMissing:direct.filter(k=>!active(s.world,k)),zombieActive:active(s.world,zombie),medicalFunction:s.world.baseFunctions.has('MED'),trainingMissing:rp.missing(s,req),stock:Object.fromEntries(Object.keys(req.items).map(k=>[k,qty(s.world,k)])),eventOccurrences:Number(s.world.generatedEvents[gold]||0)};}
let state=seed;const outcomes=[],errors=[];
function produce(label,fn){
 const before=state;try{
  const next=fn(before);assert.deepEqual(next.actions.slice(0,before.actions.length),before.actions);
  state=next;outcomes.push({label,added:next.actions.length-before.actions.length,month:next.world.month,newResearch:[...next.world.researched].filter(k=>!before.world.researched.has(k)&&active(next.world,k)),status:next===before?'ALREADY_MET':'PRODUCED'});
 }catch(e){errors.push({label,reason:String(e.message)});}
}
function settleChosen(s,bonus=null){
 let chosen=bonus===null;
 for(let i=0;!rp.settled(s);i++){
  assert(i<60);const opts=rp.options(s);
  const o=s.world.pendingFree&&!chosen?opts.find(x=>x.action.type==='freeResearch'&&x.action.research===bonus):opts[0];
  assert(o,'Missing selected free research: '+bonus);
  if(o.action.type==='freeResearch'&&o.action.research===bonus)chosen=true;
  s=rp.research(s,o.action);
 }
 assert(chosen,'No selected free research');return s;
}
function goldReward(s,topic,bonus=null){
 if(bonus&&active(s.world,bonus))return s;
 if(!bonus&&active(s.world,topic))return s;
 const before=s;const repeated=active(s.world,topic);
 s=monthly.advance(s);
 const adapter=repeated?repeatGold:researchAdapters.get(gold);
 const options=repeated?adapter.options(s,topic,bonus):adapter.options(s,topic);
 const o=options[0];assert(o,'No source-backed event reward: '+topic+'/'+bonus);
 s=settleChosen(adapter.apply(s,o.action),bonus);
 assert(active(s.world,topic)&&(!bonus||active(s.world,bonus)));
 assert.equal(s.world.generatedEvents[gold],Number(before.world.generatedEvents[gold]||0)+1);
 assert.equal(qty(s.world,'STR_GLAMOUR'),qty(before.world,'STR_GLAMOUR')+5);
 assert.equal(s.world.funds,before.world.funds);
 return s;
}
function labResearch(s,id){
 if(active(s.world,id))return s;
 const o=rp.options(s).find(o=>o.action.type==='research'&&o.action.id===id);assert(o,'Lab unavailable: '+id);
 const r=settleChosen(rp.research(s,o.action));assert(active(r.world,id));return r;
}
produce('Guild medic first discovery / sterile specimen research',s=>goldReward(s,'STR_GUILD_MEDIC','STR_ZOMBIE_STERILE_TERRORIST'));
produce('Guild medic repeat / sterile corpse research',s=>goldReward(s,'STR_GUILD_MEDIC','STR_ZOMBIE_STERILE_CORPSE'));
produce('Guild medic repeat / grubas corpse research',s=>goldReward(s,'STR_GUILD_MEDIC','STR_ZOMBIE_GRUBAS_CORPSE'));
produce('Guild medic repeat / medical supplies research',s=>goldReward(s,'STR_GUILD_MEDIC','STR_MEDICAL_SUPPLIES'));
produce('Crack research',s=>goldReward(s,'STR_CRACK'));
produce('Medicine',s=>labResearch(s,'STR_MEDICINE'));
produce('Medical bay research',s=>labResearch(s,'STR_MED_BAY'));
produce('Human noblewoman / arcane book research',s=>goldReward(s,'STR_HUMAN_NOBLEWOMAN','STR_ARCANE_BOOK'));
produce('Guild medic repeat / vampire blood research',s=>goldReward(s,'STR_GUILD_MEDIC','STR_VAMPIRE_BLOOD'));
produce('Medical facility funding',s=>{
 if(s.world.funds>=725000)return s;
 const before=s; s=monthly.advance(s);
 const o=repeatCash.options(s)[0];assert(o,'Funding event not available');
 const next=settleChosen(repeatCash.apply(s,o.action));
 assert.equal(next.world.funds,before.world.funds+500000);
 return next;
});
produce('Medical bay construction',s=>{
 if(s.world.baseFunctions.has('MED'))return s;
 const o=rp.options(s).find(o=>o.action.type==='sourceBuildFacility'&&o.action.id==='STR_MED_BAY');
 assert(o,'Medical bay construction not currently available: '+JSON.stringify(rp.options(s).filter(o=>o.action.type==='sourceBuildFacility').map(o=>o.action)));
 const before=s.world.funds;
 const next=settleChosen(rp.research(s,o.action));
 assert(next.world.baseFunctions.has('MED'));
 assert.equal(next.world.funds,before-725000);return next;
});
produce('Zombie research',s=>labResearch(s,zombie));
const before=snapshot(seed),after=snapshot(state);
assert.equal(exactStateHash(replay(state.actions).world),exactStateHash(state.world));
const groupRefs=checkpoint.groupRefs.map(g=>({...g,checkpointRef:'continuation',status:'SHARED_CHECKPOINT_ADVANCED'}));
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:state.actions.length-seed.actions.length,newResearch:[...state.world.researched].filter(k=>!seed.world.researched.has(k)&&active(state.world,k)).length,successfulMilestones:outcomes.filter(x=>x.status==='PRODUCED').length,newTargetMilestones:after.activeMilestones.filter(k=>!before.activeMilestones.includes(k)),zombieDirectBefore:before.zombieDirect.length,zombieDirectAfter:after.zombieDirect.length,zombieReached:after.zombieActive,repeatResearchRewardCount:state.actions.slice(seed.actions.length).filter(a=>a.type==='sourceMonthlyRepeatedResearchReward').length,medicalResearchReached:active(state.world,'STR_MED_BAY'),medicalFacilityBuilt:after.medicalFunction,firstTrainingApplied:0,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_SCOUT_ZOMBIE_WAVE_V2',scope:'Chronological selected monthly event and free research outcomes. Research discovery is not physical specimen recovery. Native combat, full monthly economy and mandatory events remain unmodeled.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),proofPath,proofSha256:sha(fs.readFileSync(proofPath)),summary,before,after,outcomes,errors,continuation:receipt(state),groupRefs,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-scout-zombie-wave-v2-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,outcomes,errors,bytes:fs.statSync(out).size}));
