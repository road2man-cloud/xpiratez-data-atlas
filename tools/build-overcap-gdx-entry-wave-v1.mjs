// V161: forward GDX entry and plotting prerequisites from the V160 checkpoint.
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
import {createZombieOutbreakRecovery} from './atlas-overcap-forward-zombie-outbreak-recovery-v1.mjs';
import {createBrainSupport} from './atlas-overcap-forward-brain-support-v1.mjs';
import {createIdleResearchInterruptReward} from './atlas-overcap-forward-idle-interrupt-reward-v1.mjs';
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
const rp=createCareerReplay(data,{maxMonth:60}),monthly=createMonthlyWitness(data,rp);
const tavern=createTavernRecovery(data,source,rp,prior.sourceSha256),cat=data.forwardSupply;
const wanted=new Set(['STR_TROUBLESEEKING_ENEMY','STR_TROUBLESEEKING_FRIENDS','STR_GOLD_AT_SEANS_NEW_FACES','STR_NOGRAY_YESGOLD_READING_FOR_THE_PLOT','STR_MAXIMUM_EXPLOITATION','STR_GDX_EVENT_ORDERS_1','STR_GDX_EVENT_ORDERS_2']),raws=new Map();
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
const interruptAdapters=new Map();
for(const id of ['STR_GDX_EVENT_ORDERS_1','STR_GDX_EVENT_ORDERS_2']){const e=raws.get(id);interruptAdapters.set(id,createIdleResearchInterruptReward(data,rp,monthly,e.raw,e.source));}
const proofPath='tools/data/overcap-repeat-research-source-v1-5605eb3775728d0798d1.json';
const proof=read(proofPath),gold='STR_GOLD_AT_SEANS_NEW_FACES';
const goldRaw=raws.get(gold);
const repeatGold=createRepeatedResearchReward(data,rp,goldRaw.raw,goldRaw.source,proof,sha(fs.readFileSync(proofPath)));
const fixedCash=raws.get('STR_MAXIMUM_EXPLOITATION');
const repeatCash=createMonthlyFixedReward(data,rp,monthly,fixedCash.raw,fixedCash.source);
const outbreakProofPath='tools/data/overcap-zombie-outbreak-source-v1-53fd6391396850066bd2.json';
const outbreakProof=read(outbreakProofPath);
assert.equal(outbreakProof.engineArchiveSha256,lock.archiveSha256);
const outbreak=createZombieOutbreakRecovery(data,rp,outbreakProof,sha(fs.readFileSync(outbreakProofPath)));
const brainProofPath='tools/data/overcap-brain-support-source-v1-35e95bcb059139634a89.json';
const brainProof=read(brainProofPath);assert.equal(brainProof.engineArchiveSha256,lock.archiveSha256);
const support=createBrainSupport(data,rp,brainProof,sha(fs.readFileSync(brainProofPath)),outbreakProof,sha(fs.readFileSync(outbreakProofPath)));
const supportActions=new Set(['sourceRetainStartingSupport','sourceOrderLabWire','sourceDeliverLabWire','sourceStartPersonalLab','sourceCompletePersonalLab','sourceLiveZombieRecovery']);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
function oldStep(s,a){return a.type==='sourceRandomEventItem'?rnd.apply(s,a):a.type==='sourceMapRecovery'?tavern.apply(s,a):rp.research(s,a);}
function legacyReplay(actions){let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));for(const a of actions.slice(2))s=oldStep(s,a);return s;}
function replay(actions){
 let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));
 for(const a of actions.slice(2)){
  if(a.type==='sourceMonthlyBoundary')s=monthly.advance(s,a);
  else if(supportActions.has(a.type))s=support.apply(s,a);
  else if(['sourceStartContainment','sourceCompleteContainment','sourceZombieOutbreakRecovery'].includes(a.type))s=outbreak.apply(s,a);
  else if(a.type==='sourceMonthlyFixedReward')s=repeatCash.apply(s,a);
  else if(a.type==='sourceMonthlyRepeatedResearchReward')s=repeatGold.apply(s,a);
  else if(a.type==='sourceMonthlyInterruptResearchReward')s=interruptAdapters.get(a.event).apply(s,a);
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
const checkpointPath='tools/data/overcap-brain-support-wave-v1-5dc2d979875d943eda38.json.gz';
const checkpoint=read(checkpointPath);
assert.equal(checkpoint.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(checkpoint.engineArchiveSha256,lock.archiveSha256);
const seed=replay(checkpoint.continuation.actions);assert.equal(exactStateHash(seed.world),checkpoint.continuation.stateHash);
const dream='STR_ZOMBIE_DREAMS',library='STR_LIBRARY',gdx='STR_GDX_003',plotting='STR_PLOTTING',target='STR_ANG_102';
const rules=data.researchRules,training=data.transformations.find(t=>t.id===target);
const req={research:training.requires,functions:training.requiresBaseFunc,items:training.requiredItems,cost:training.cost};
const milestones=['STR_SECTOID_MEDIC','STR_SECTOID_SOLDIER','STR_ACADEMY_NURSE','STR_SECTOID_LEADER','STR_GDX_001','STR_GDX_002','STR_GDX_000','STR_MUTANT_ORIGINS','STR_BEASTMEN','STR_ALIEN_TERROR','STR_CONSUMER_GOODS','STR_MONEY_PURSE','STR_CASH_BAG','STR_GAMBLING','STR_PIRATEZ_HIERARCHY','STR_GDX_003','STR_GDX_004','STR_GDX_005','STR_SCHOOL_BOOKS',library,plotting,dream];
const missing=(s,id)=>rules[id].dependencies.filter(k=>!active(s.world,k));
function snapshot(s){return {month:s.world.month,balance:s.world.funds,researchCount:s.world.researched.size,activeMilestones:milestones.filter(k=>active(s.world,k)),libraryMissing:missing(s,library),gdxMissing:missing(s,gdx),plottingMissing:missing(s,plotting),dreamMissing:missing(s,dream),stock:Object.fromEntries(['STR_PORN','STR_VAMPIRE_ESSENCE','STR_ZOMBIE_ESSENCE','STR_GLAMOUR','STR_PILLOW_BOOK','STR_ARCANE_BOOK'].map(k=>[k,qty(s.world,k)])),trainingMissing:rp.missing(s,req)};}
let state=seed;const steps=[],errors=[];
function produce(label,fn){
 const prev=state;try{
  const next=fn(prev);assert.deepEqual(next.actions.slice(0,prev.actions.length),prev.actions);
  for(const k of ['STR_PORN','STR_VAMPIRE_ESSENCE'])assert(qty(next.world,k)>=qty(seed.world,k),'Reserved training stock consumed');
  state=next;
  steps.push({label,added:next.actions.length-prev.actions.length,newResearch:[...next.world.researched].filter(k=>!prev.world.researched.has(k)&&active(next.world,k)),before:snapshot(prev),after:snapshot(next),status:next===prev?'ALREADY_MET':'PRODUCED'});
 }catch(e){errors.push({label,reason:String(e.message)});}
}
function settleSelected(s,bonus=null){
 let found=bonus===null;
 for(let i=0;!rp.settled(s);i++){
  assert(i<60);const opts=rp.options(s);
  const o=s.world.pendingFree&&!found?opts.find(x=>x.action.type==='freeResearch'&&x.action.research===bonus):opts[0];
  assert(o,'Requested bonus unavailable: '+bonus);
  if(o.action.type==='freeResearch'&&o.action.research===bonus)found=true;
  s=rp.research(s,o.action);
 }assert(found,'Bonus not applied: '+bonus);return s;
}
function sample(s,id,bonus=null){
 assert(!active(s.world,id),'Already active specimen research');
 if(bonus){assert(!active(s.world,bonus),'Bonus already known');assert(rules[id].getOneFree.includes(bonus),'Not an actual free-research candidate');}
 const old=s;
 s=reward(s,repeatEnemy,id);assert.equal(qty(s.world,id),qty(old.world,id)+1);
 const o=rp.options(s).find(o=>o.action.type==='research'&&o.action.id===id);assert(o,'No eligible specimen project: '+id);
 const n=settleSelected(rp.research(s,o.action),bonus);
 assert(active(n.world,id)&&(!bonus||active(n.world,bonus)));
 assert.equal(qty(n.world,id),qty(old.world,id)+1-Number(rules[id].destroyItem));
 return n;
}
produce('Academy medic / alien terror',s=>sample(s,'STR_SECTOID_MEDIC','STR_ALIEN_TERROR'));
produce('Academy researcher / consumer goods',s=>sample(s,'STR_SECTOID_SOLDIER','STR_CONSUMER_GOODS'));
produce('Academy nurse / beastmen',s=>sample(s,'STR_ACADEMY_NURSE','STR_BEASTMEN'));
produce('Sectoid leader / alien surgery',s=>sample(s,'STR_SECTOID_LEADER','STR_ALIEN_SURGERY'));
function orders(s,id,topic){
 if(active(s.world,topic))return s;
 const a=interruptAdapters.get(id),prev=s;s=monthly.advance(s);
 const o=a.options(s,topic)[0];assert(o,'Orders not currently eligible');
 const n=settleSelected(a.apply(s,o.action));
 assert(active(n.world,topic));assert.equal(n.world.generatedEvents[id],Number(prev.world.generatedEvents[id]||0)+1);
 assert.equal(n.world.funds,prev.world.funds);return n;
}
produce('Fugitive search orders',s=>orders(s,'STR_GDX_EVENT_ORDERS_1','STR_GDX_001'));
produce('Hideout search orders',s=>orders(s,'STR_GDX_EVENT_ORDERS_2','STR_GDX_002'));
produce('GDX foundation',s=>{const n=lab(s,'STR_GDX_000');assert(active(n.world,'STR_GDX_000'));return n;});
produce('Mutant origins',s=>{const n=lab(s,'STR_MUTANT_ORIGINS');assert(active(n.world,'STR_MUTANT_ORIGINS'));return n;});
produce('Money purse research',s=>{const n=lab(s,'STR_MONEY_PURSE');assert(active(n.world,'STR_MONEY_PURSE'));return n;});
produce('Cash bag free research from a fresh specimen',s=>{
 if(active(s.world,'STR_CASH_BAG'))return s;
 const choices=enemy.raw.raw.randomItemList.filter(id=>!s.world.researched.has(id)&&!s.world.disabled.has(id)&&rules[id]?.getOneFree?.includes('STR_CASH_BAG'));
 const attempted=[];
 for(const id of ['STR_RAIDER_THUG','STR_SMUGGLER_GOON',...choices].filter((id,i,a)=>choices.includes(id)&&a.indexOf(id)===i)){
  try{return sample(s,id,'STR_CASH_BAG');}catch(e){attempted.push({id,error:String(e.message)});}
 }
 throw Error('No viable specimen: '+JSON.stringify(attempted).slice(0,2000));
});
produce('Gambling',s=>{const n=lab(s,'STR_GAMBLING');assert(active(n.world,'STR_GAMBLING'));return n;});
const before=snapshot(seed),after=snapshot(state);
assert.equal(exactStateHash(replay(state.actions).world),exactStateHash(state.world));
const groupRefs=checkpoint.groupRefs.map(g=>({...g,checkpointRef:'continuation',status:'SHARED_CHECKPOINT_ADVANCED'}));
const blockedRank=['STR_CAPTAINS_RANK_01','STR_CAPTAINS_RANK_02','STR_CAPTAINS_RANK_05'].map(id=>({id,active:active(state.world,id),scripts:cat.events[id]?.scripts.map(s=>({script:s.script,otherConditions:s.otherConditions,researchPositive:s.researchPositive,firstMonth:s.firstMonth}))||[],note:'Native monthly score and calendar not fully modeled; no score invented.'}));
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:state.actions.length-seed.actions.length,newResearch:[...state.world.researched].filter(k=>!seed.world.researched.has(k)&&active(state.world,k)).length,successfulMilestones:steps.filter(s=>s.status==='PRODUCED').length,newMilestones:after.activeMilestones.filter(k=>!before.activeMilestones.includes(k)),gdxDirectBefore:rules[gdx].dependencies.length-before.gdxMissing.length,gdxDirectAfter:rules[gdx].dependencies.length-after.gdxMissing.length,plottingDirectBefore:rules[plotting].dependencies.length-before.plottingMissing.length,plottingDirectAfter:rules[plotting].dependencies.length-after.plottingMissing.length,libraryDirectBefore:rules[library].dependencies.length-before.libraryMissing.length,libraryDirectAfter:rules[library].dependencies.length-after.libraryMissing.length,dreamDirectBefore:rules[dream].dependencies.length-before.dreamMissing.length,dreamDirectAfter:rules[dream].dependencies.length-after.dreamMissing.length,firstTrainingApplied:0,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_GDX_ENTRY_WAVE_V1',scope:'Source-backed selected monthly sample rewards and conditional idle research interrupt events. No invented monthly score, no assumed library or dream completion. Full economy, research duration and native combat unmodeled.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),sourceRecords:[...raws].filter(([id])=>id==='STR_TROUBLESEEKING_ENEMY'||id.startsWith('STR_GDX_EVENT_ORDERS_')).map(([id,e])=>({id,...e.source})),summary,before,after,steps,errors,blockedRank,continuation:receipt(state),groupRefs,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-gdx-entry-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,steps:steps.map(x=>({label:x.label,added:x.added,newResearch:x.newResearch})),errors,blockedRank,bytes:fs.statSync(out).size}));
