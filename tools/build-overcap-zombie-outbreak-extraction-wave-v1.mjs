// V159: complete zombie research and source-backed specimen extraction.
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
const outbreakProofPath='tools/data/overcap-zombie-outbreak-source-v1-53fd6391396850066bd2.json';
const outbreakProof=read(outbreakProofPath);
assert.equal(outbreakProof.engineArchiveSha256,lock.archiveSha256);
const outbreak=createZombieOutbreakRecovery(data,rp,outbreakProof,sha(fs.readFileSync(outbreakProofPath)));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
function oldStep(s,a){return a.type==='sourceRandomEventItem'?rnd.apply(s,a):a.type==='sourceMapRecovery'?tavern.apply(s,a):rp.research(s,a);}
function legacyReplay(actions){let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));for(const a of actions.slice(2))s=oldStep(s,a);return s;}
function replay(actions){
 let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));
 for(const a of actions.slice(2)){
  if(a.type==='sourceMonthlyBoundary')s=monthly.advance(s,a);
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
const checkpointPath='tools/data/overcap-scout-zombie-wave-v2-a6237a6a9b670351d27a.json.gz';
const checkpoint=read(checkpointPath);
assert.equal(checkpoint.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(checkpoint.engineArchiveSha256,lock.archiveSha256);
const seed=replay(checkpoint.continuation.actions);
assert.equal(exactStateHash(seed.world),checkpoint.continuation.stateHash);
const zombie='STR_ZOMBIE',grubas='STR_ZOMBIE_GRUBAS_TERRORIST',corpse='STR_ZOMBIE_BUSTER_CORPSE';
const target='STR_ANG_102',training=data.transformations.find(t=>t.id===target);
const req={research:training.requires,functions:training.requiresBaseFunc,items:training.requiredItems,cost:training.cost};
const direct=data.researchRules[zombie].dependencies,recipe=outbreak.recipe;
const tracked=[grubas,corpse,'STR_ELERIUM_115','STR_ZOMBIE_ESSENCE','STR_VAMPIRE_ESSENCE','STR_ZOMBIE_BRAIN',...Object.keys(req.items)];
function snapshot(s){return {month:s.world.month,balance:s.world.funds,researchCount:s.world.researched.size,zombieDirect:direct.filter(k=>active(s.world,k)),zombieActive:active(s.world,zombie),busterResearch:active(s.world,corpse),containment:s.world.facilities.has('STR_BURROW'),medical:s.world.baseFunctions.has('MED'),stock:Object.fromEntries([...new Set(tracked)].map(k=>[k,qty(s.world,k)])),trainingMissing:rp.missing(s,req)};}
let state=seed;const steps=[],errors=[];
function produce(label,fn){
 const prev=state;
 try{
  const next=fn(prev);assert.deepEqual(next.actions.slice(0,prev.actions.length),prev.actions);state=next;
  steps.push({label,added:next.actions.length-prev.actions.length,newResearch:[...next.world.researched].filter(k=>!prev.world.researched.has(k)&&active(next.world,k)),before:snapshot(prev),after:snapshot(next),status:next===prev?'ALREADY_MET':'PRODUCED'});
 }catch(e){errors.push({label,reason:String(e.message)});}
}
produce('Funding for containment and extraction',s=>{
 if(s.world.funds>=75000+recipe.cost)return s;
 const prev=s;
 s=monthly.advance(s);const o=repeatCash.options(s)[0];assert(o);
 s=settle(repeatCash.apply(s,o.action));
 assert.equal(s.world.funds,prev.world.funds+500000);return s;
});
produce('Construct type-2 containment',s=>{
 if(s.world.facilities.has('STR_BURROW'))return s;
 const before=s.world.funds;
 const start=outbreak.constructionOption(s);assert(start,'Containment construction unavailable');
 s=outbreak.apply(s,start);
 const finish=outbreak.completeOption(s);assert(finish);
 s=outbreak.apply(s,finish);
 assert.equal(s.world.funds,before-75000);assert(s.world.facilities.has('STR_BURROW'));return s;
});
produce('Late outbreak specimen recovery',s=>{
 const before=s;s=monthly.advance(s);
 const o=outbreak.recoveryOptions(s)[0];assert(o,'Mission source not currently eligible');
 s=outbreak.apply(s,o.action);
 assert.equal(qty(s.world,grubas),qty(before.world,grubas)+1);
 assert.equal(qty(s.world,corpse),qty(before.world,corpse)+2);
 assert.equal(outbreak.recoveryOptions(s).length,0,'Same boundary must not be reusable');
 return s;
});
produce('Grubas living specimen research',s=>{
 if(active(s.world,grubas))return s;
 const before=qty(s.world,grubas);const next=lab(s,grubas);
 assert.equal(qty(next.world,grubas),before-1);assert(active(next.world,grubas));return next;
});
produce('Zombie research',s=>{
 const next=lab(s,zombie);assert(active(next.world,zombie)&&direct.every(k=>active(next.world,k)));return next;
});
produce('Buster corpse research',s=>{
 if(active(s.world,corpse))return s;
 const before=qty(s.world,corpse),next=lab(s,corpse);
 assert.equal(qty(next.world,corpse),before-1);assert(active(next.world,corpse));return next;
});
produce('Deterministic corpse extraction',s=>{
 const old=s;const o=rp.options(s).find(o=>o.action.type==='sourceManufactureItem'&&o.action.id===recipe.id);
 assert(o,'Extraction currently unavailable');
 s=settle(rp.research(s,o.action));
 for(const [k,n] of Object.entries(recipe.requiredItems))assert.equal(qty(s.world,k),qty(old.world,k)-n);
 for(const [k,n] of Object.entries(recipe.outputs))assert.equal(qty(s.world,k),qty(old.world,k)+n);
 assert.equal(s.world.funds,old.world.funds-recipe.cost);return s;
});
const before=snapshot(seed),after=snapshot(state);
assert.equal(exactStateHash(replay(state.actions).world),exactStateHash(state.world));
const groupRefs=checkpoint.groupRefs.map(g=>({...g,checkpointRef:'continuation',status:'SHARED_CHECKPOINT_ADVANCED'}));
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:state.actions.length-seed.actions.length,newResearch:[...state.world.researched].filter(k=>!seed.world.researched.has(k)&&active(state.world,k)).length,zombieDirectBefore:before.zombieDirect.length,zombieDirectAfter:after.zombieDirect.length,zombieReached:after.zombieActive,containment:after.containment,conditionalMissionRecovery:steps.some(x=>x.label==='Late outbreak specimen recovery'&&x.status==='PRODUCED'),extractionProduced:steps.some(x=>x.label==='Deterministic corpse extraction'&&x.status==='PRODUCED'),essenceStock:{zombie:after.stock.STR_ZOMBIE_ESSENCE,vampire:after.stock.STR_VAMPIRE_ESSENCE},successfulMilestones:steps.filter(x=>x.status==='PRODUCED').length,firstTrainingApplied:0,finalAdmission:0,actualGameCertified:0};
const report={schema:'ATLAS_OVERCAP_ZOMBIE_OUTBREAK_EXTRACTION_WAVE_V1',scope:'Selected monthly chronology and raw-rule conditional mission recovery, exact modeled inventory and procurement. Native combat, mission arrival, full economy, base capacity, craft and squad feasibility remain conditional.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),outbreakProofPath,outbreakProofSha256:sha(fs.readFileSync(outbreakProofPath)),summary,before,after,steps,errors,continuation:receipt(state),groupRefs,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-zombie-outbreak-extraction-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,steps:steps.map(x=>({label:x.label,added:x.added,newResearch:x.newResearch})),errors,bytes:fs.statSync(out).size}));
