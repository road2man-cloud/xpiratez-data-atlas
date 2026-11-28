// V160: produce zombie brain and communication research with material-aware facilities.
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
const checkpointPath='tools/data/overcap-zombie-outbreak-extraction-wave-v1-cfb4e4c4ff6db860ca50.json.gz';
const checkpoint=read(checkpointPath);
assert.equal(checkpoint.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(checkpoint.engineArchiveSha256,lock.archiveSha256);
const seed=replay(checkpoint.continuation.actions);assert.equal(exactStateHash(seed.world),checkpoint.continuation.stateHash);
const brain='STR_ZOMBIE_BRAIN',buster='STR_ZOMBIE_BUSTER_TERRORIST',carrie='STR_ZOMBIE_CARRIE_TERRORIST',device='STR_ZOMBIE_COMMUNICATION_DEVICE',dream='STR_ZOMBIE_DREAMS',target='STR_ANG_102';
const direct=data.researchRules[dream].dependencies,training=data.transformations.find(t=>t.id===target);
const req={research:training.requires,functions:training.requiresBaseFunc,items:training.requiredItems,cost:training.cost};
const recipe=support.recipe;
const tracked=[buster,carrie,brain,'STR_SC_WIRE','STR_ELERIUM_115','STR_ZOMBIE_ESSENCE','STR_VAMPIRE_ESSENCE',...Object.keys(req.items)];
function snapshot(s){return {month:s.world.month,balance:s.world.funds,researchCount:s.world.researched.size,dreamDirect:direct.filter(k=>active(s.world,k)),dreamMissing:direct.filter(k=>!active(s.world,k)),brainResearch:active(s.world,brain),communicationResearch:active(s.world,device),startingSupport:!!s.world.forwardRetainedStartingSupport,personalLab:s.world.facilities.has('STR_PERSONAL_LABS'),study:s.world.baseFunctions.has('STUDY'),stock:Object.fromEntries([...new Set(tracked)].map(k=>[k,qty(s.world,k)])),trainingMissing:rp.missing(s,req)};}
let state=seed;const steps=[],errors=[];
function produce(label,fn){
 const prev=state;
 try{const next=fn(prev);assert.deepEqual(next.actions.slice(0,prev.actions.length),prev.actions);
 assert(qty(next.world,'STR_VAMPIRE_ESSENCE')>=1,'Reserved training essence consumed');
 state=next;steps.push({label,added:next.actions.length-prev.actions.length,newResearch:[...next.world.researched].filter(k=>!prev.world.researched.has(k)&&active(next.world,k)),before:snapshot(prev),after:snapshot(next),status:next===prev?'ALREADY_MET':'PRODUCED'});}
 catch(e){errors.push({label,reason:String(e.message)});}
}
produce('Retain default starting laboratory and jail',s=>{
 const a=support.retainOption(s);assert(a,'No eligible starting facility correction');
 const n=support.apply(s,a);assert(n.world.baseFunctions.has('CPU')&&n.world.facilities.has('STR_JAIL'));
 assert.equal(n.world.funds,s.world.funds);assert.deepEqual(n.world.items,s.world.items);return n;
});
const requiredBudget=support.buildCost+support.requiredWire*support.wireUnitCost+recipe.cost;
for(let i=0;i<3&&state.world.funds<requiredBudget;i++){
 const old=state.world.funds;
 produce('Funding installment '+(i+1),s=>{
  const prev=s;s=monthly.advance(s);const o=repeatCash.options(s)[0];assert(o,'Funding event unavailable');
  s=settle(repeatCash.apply(s,o.action));assert.equal(s.world.funds,prev.world.funds+500000);return s;
 });
 if(state.world.funds<=old)break;
}
produce('Purchase and receive exact laboratory materials',s=>{
 if(qty(s.world,'STR_SC_WIRE')>=support.requiredWire)return s;
 const prev=s,a=support.orderOption(s);assert(a,'Material purchase unavailable');s=support.apply(s,a);
 const d=support.deliveryOption(s);assert(d);s=support.apply(s,d);
 assert.equal(qty(s.world,'STR_SC_WIRE'),support.requiredWire);assert.equal(s.world.funds,prev.world.funds-a.count*a.unitCost);return s;
});
produce('Personal laboratory construction with material consumption',s=>{
 if(s.world.baseFunctions.has('STUDY'))return s;
 const prev=s,a=support.constructionOption(s);assert(a,'Personal laboratory unavailable');s=support.apply(s,a);
 assert.equal(qty(s.world,'STR_SC_WIRE'),qty(prev.world,'STR_SC_WIRE')-support.requiredWire);
 assert(!s.world.baseFunctions.has('STUDY'));s=monthly.advance(s);
 const d=support.completionOption(s);assert(d);s=support.apply(s,d);
 assert(s.world.baseFunctions.has('STUDY'));assert.equal(s.world.funds,prev.world.funds-support.buildCost);return s;
});
produce('Two live buster samples in late outbreak',s=>{
 const prev=s;s=monthly.advance(s);const o=support.missionOption(s,buster);assert(o,'Buster source unavailable');
 s=support.apply(s,o.action);assert.equal(qty(s.world,buster),qty(prev.world,buster)+2);assert.equal(support.missionOption(s,buster),null);return s;
});
produce('Buster live research',s=>{
 if(active(s.world,buster))return s;
 const prev=s,n=lab(s,buster);assert(active(n.world,buster));assert.equal(qty(n.world,buster),qty(prev.world,buster)-1);return n;
});
produce('Zombie brain extraction and all coproducts',s=>{
 const prev=s,o=rp.options(s).find(o=>o.action.type==='sourceManufactureItem'&&o.action.id===recipe.id);assert(o,'Extraction unavailable');
 s=settle(rp.research(s,o.action));
 for(const [k,n] of Object.entries(recipe.requiredItems))assert.equal(qty(s.world,k),qty(prev.world,k)-n);
 for(const [k,n] of Object.entries(recipe.outputs))assert.equal(qty(s.world,k),qty(prev.world,k)+n);
 assert.equal(s.world.funds,prev.world.funds-recipe.cost);return s;
});
produce('Zombie brain research',s=>{
 const prev=s,n=lab(s,brain);assert(active(n.world,brain));assert.equal(qty(n.world,brain),qty(prev.world,brain)-1);return n;
});
produce('Carrie sample from late ratling village',s=>{
 const prev=s;s=monthly.advance(s);const o=support.missionOption(s,carrie);assert(o,'Carrie source unavailable');
 s=support.apply(s,o.action);assert.equal(qty(s.world,carrie),qty(prev.world,carrie)+1);return s;
});
produce('Carrie research and communication unlock',s=>{
 const prev=s,n=lab(s,carrie);assert(active(n.world,carrie));assert.equal(qty(n.world,carrie),qty(prev.world,carrie)-1);return n;
});
produce('Zombie communication device research',s=>{const n=lab(s,device);assert(active(n.world,device));return n;});
const before=snapshot(seed),after=snapshot(state);
assert.equal(exactStateHash(replay(state.actions).world),exactStateHash(state.world));
const groupRefs=checkpoint.groupRefs.map(g=>({...g,checkpointRef:'continuation',status:'SHARED_CHECKPOINT_ADVANCED'}));
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:state.actions.length-seed.actions.length,newResearch:[...state.world.researched].filter(k=>!seed.world.researched.has(k)&&active(state.world,k)).length,dreamDirectBefore:before.dreamDirect.length,dreamDirectAfter:after.dreamDirect.length,brainProduced:steps.some(x=>x.label==='Zombie brain extraction and all coproducts'&&x.status==='PRODUCED'),brainResearch:after.brainResearch,communicationResearch:after.communicationResearch,personalLab:after.personalLab,startingSupport:after.startingSupport,successfulMilestones:steps.filter(x=>x.status==='PRODUCED').length,firstTrainingApplied:0,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_BRAIN_SUPPORT_WAVE_V1',scope:'Retained default starting facilities explicitly restore two omitted facility IDs in this late checkpoint. No retroactive stock or cash grants; full start history remains incomplete. Conditional selected monthly chronology, specimen capture, building, exact modeled resource transitions.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),brainProofPath,brainProofSha256:sha(fs.readFileSync(brainProofPath)),outbreakProofPath,outbreakProofSha256:sha(fs.readFileSync(outbreakProofPath)),summary,before,after,steps,errors,continuation:receipt(state),groupRefs,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-brain-support-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,steps:steps.map(x=>({label:x.label,added:x.added,newResearch:x.newResearch})),errors,bytes:fs.statSync(out).size}));
