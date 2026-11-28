// V157: advance the shared scout career checkpoint toward the first legacy training.
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
const wanted=new Set(['STR_TROUBLESEEKING_ENEMY','STR_TROUBLESEEKING_FRIENDS','STR_GOLD_AT_SEANS_NEW_FACES','STR_NOGRAY_YESGOLD_READING_FOR_THE_PLOT']),raws=new Map();
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
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
function oldStep(s,a){return a.type==='sourceRandomEventItem'?rnd.apply(s,a):a.type==='sourceMapRecovery'?tavern.apply(s,a):rp.research(s,a);}
function legacyReplay(actions){let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));for(const a of actions.slice(2))s=oldStep(s,a);return s;}
function replay(actions){
 let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));
 for(const a of actions.slice(2)){
  if(a.type==='sourceMonthlyBoundary')s=monthly.advance(s,a);
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
const checkpointPath='tools/data/overcap-monthly-scout-career-v2-e156768f857dabfb6b3e.json.gz';
const checkpoint=read(checkpointPath);
assert.equal(checkpoint.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(checkpoint.bulkSha256,sha(fs.readFileSync(bulkPath)));
const base=checkpoint.careerCheckpoints[0];
const seed=replay(base.receipt.actions);
assert.equal(exactStateHash(seed.world),base.receipt.stateHash);
assert.deepEqual(rp.finish(seed),base.result);
const target='STR_ANG_102',rule=data.transformations.find(t=>t.id===target);
assert(rule);
const direct=data.researchRules[target].dependencies;
const milestones=['STR_VIP_016','STR_HUMAN_MASTER','STR_PSI_LAB_PREQ','STR_PSI_LAB','STR_DOOM_HUMAN_AUTOPSY','STR_TACTICS','STR_PEASANT_MILITIA','STR_WASTELAND_SORCERESS','STR_ANG_002','STR_ANG_003_PREQ','STR_ANG_003','STR_ANG_004','STR_ADVICE_ON_ANG_004','STR_ANG_007',...direct,target];
const req={research:rule.requires,functions:rule.requiresBaseFunc,items:rule.requiredItems,cost:rule.cost};
const snapshot=s=>({month:s.world.month,balance:s.world.funds,activeMilestones:milestones.filter(k=>active(s.world,k)),direct:direct.filter(k=>active(s.world,k)),missing:rp.missing(s,req),stock:Object.fromEntries(Object.keys(req.items).map(k=>[k,qty(s.world,k)])),targetActive:active(s.world,target),researchCount:s.world.researched.size});
let state=seed;const outcomes=[],errors=[];
function commit(label,fn){
 const before=state;try{
  const next=fn(before);
  assert.equal(next.actions.length>=before.actions.length,true);
  assert.deepEqual(next.actions.slice(0,before.actions.length),before.actions);
  state=next;
  outcomes.push({label,added:next.actions.length-before.actions.length,month:next.world.month,newResearch:[...next.world.researched].filter(k=>!before.world.researched.has(k)&&active(next.world,k)),before:snapshot(before),after:snapshot(next),status:next===before?'ALREADY_MET':'PRODUCED'});
 }catch(e){errors.push({label,reason:String(e.message)});}
}
function settleNew(s,preferred=null){
 for(let i=0;!rp.settled(s);i++){
  assert(i<60);const opts=rp.options(s);
  const o=(preferred&&opts.find(x=>x.action.type==='freeResearch'&&x.action.research===preferred))||opts[0];
  assert(o,'No available reward or delivery');s=rp.research(s,o.action);
 }return s;
}
function eventReward(s,id,topic,preferred=null){
 const adapter=researchAdapters.get(id);assert(adapter);
 const before=s;
 s=monthly.advance(s);
 const o=adapter.options(s,topic)[0];assert(o,'No eligible raw event reward: '+id+'/'+topic);
 s=settleNew(adapter.apply(s,o.action),preferred);
 assert.equal(s.world.generatedEvents[id],Number(before.world.generatedEvents[id]||0)+1);
 if(topic!==null)assert(active(s.world,topic),'Research grant inactive');
 for(const [k,n] of Object.entries(o.evidence.fixed))assert.equal(qty(s.world,k),qty(before.world,k)+n);
 assert.equal(s.world.funds,before.world.funds+o.evidence.delta);
 return s;
}
function standardEvent(s,id){
 if(active(s.world,id))return s;
 s=monthly.advance(s);
 const o=rp.options(s).find(o=>o.action.type==='eventResearch'&&o.action.research===id);
 assert(o,'No eligible event: '+id);return settleNew(monthly.applyLegacy(s,o.action,oldStep));
}
function tryLab(s,id,free=null){
 if(active(s.world,id))return s;
 const o=rp.options(s).find(o=>o.action.type==='research'&&o.action.id===id);
 assert(o,'Not currently enabled: '+id);
 const n=settleNew(rp.research(s,o.action),free);assert(active(n.world,id),'Research inactive after completion');return n;
}
const gold='STR_GOLD_AT_SEANS_NEW_FACES',books='STR_NOGRAY_YESGOLD_READING_FOR_THE_PLOT';
// Produce actual late-research prerequisite gains and material stock. Every
// repeated event uses a new monthly boundary; no imported final stat values.
commit('VIP_016 monthly research',s=>eventReward(s,gold,'STR_VIP_016'));
commit('Human Master monthly research',s=>eventReward(s,gold,'STR_HUMAN_MASTER','STR_DOOM_HUMAN_AUTOPSY'));
commit('PSI lab',s=>tryLab(s,'STR_PSI_LAB'));
commit('Tactics',s=>tryLab(s,'STR_TACTICS'));
commit('Peasant militia',s=>tryLab(s,'STR_PEASANT_MILITIA'));
commit('Wasteland sorceress',s=>standardEvent(s,'STR_WASTELAND_SORCERESS'));
for(let i=0;i<3&&qty(state.world,'STR_PORN')<req.items.STR_PORN;i++){
 const n=qty(state.world,'STR_PORN');
 commit('Training material lot '+(i+1),s=>{
  const a=researchAdapters.get(books);
  const topic=a.pool.find(k=>!s.world.researched.has(k)&&!s.world.disabled.has(k))??null;
  return eventReward(s,books,topic);
 });
 if(qty(state.world,'STR_PORN')<=n)break;
}
for(const id of ['STR_ANG_002','STR_ANG_003_PREQ','STR_ANG_003','STR_ANG_004','STR_ADVICE_ON_ANG_004','STR_ANG_007','STR_ZOMBIE_DREAMS','STR_ANG_010','STR_ANG_011','STR_ANG_012',target]){
 if(active(state.world,id))continue;
 if(data.researchRules[id]?.cost>0)commit('Target laboratory '+id,s=>tryLab(s,id));
}
assert.equal(exactStateHash(replay(state.actions).world),exactStateHash(state.world));
const groups=checkpoint.careers.filter(c=>c.checkpointId===base.id);
assert.equal(groups.length,15);
const groupRefs=groups.map(c=>({group:c.group,goals:c.goals,priorApplied:c.applied,total:c.total,checkpointRef:'continuation',nextAction:c.failure?.action,status:'READY_FOR_NEXT_GATE_CHECK'}));
let applied=null,applyError=null;
try{
 const action=groups[0].failure.action;
 assert(groups.every(g=>JSON.stringify(g.failure.action)===JSON.stringify(action)));
 const result=rp.career(state,action);
 assert.equal(exactStateHash(replay(result.actions).world),exactStateHash(result.world));
 applied={action,receipt:receipt(result),result:rp.finish(result)};
 for(const g of groupRefs){g.applied=g.priorApplied+1;g.status='FIRST_TRAINING_CONDITIONALLY_APPLIED';}
}catch(e){applyError=String(e.message);for(const g of groupRefs){g.applied=g.priorApplied;g.status='FIRST_TRAINING_GATE_OPEN';}}
const before=snapshot(seed),after=snapshot(state);
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:state.actions.length-seed.actions.length,successfulMilestoneActions:outcomes.filter(o=>o.status==='PRODUCED').length,newResearch:[...state.world.researched].filter(k=>!seed.world.researched.has(k)&&active(state.world,k)).length,newTargetMilestones:after.activeMilestones.filter(k=>!before.activeMilestones.includes(k)),directBefore:before.direct.length,directAfter:after.direct.length,materialBefore:before.stock,materialAfter:after.stock,firstTrainingApplied:Number(!!applied),legacyGoalsConditionallyCompleted:0,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_SCOUT_TRAINING_WAVE_V1',scope:'Chronological selected monthly reward model, source-backed research and exact stock/cash transitions. No native runtime, combat, full economy or mandatory monthly event certification.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),priorCheckpointId:base.id,bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),summary,before,after,outcomes,errors,continuation:receipt(state),firstTraining:applied,firstTrainingError:applyError,groupRefs,sourceRecords:[...researchAdapters.keys()].map(id=>({id,...raws.get(id).source})),actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-scout-training-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,outcomes:outcomes.map(x=>({label:x.label,added:x.added,newResearch:x.newResearch})),errors,applyError,bytes:fs.statSync(out).size}));
