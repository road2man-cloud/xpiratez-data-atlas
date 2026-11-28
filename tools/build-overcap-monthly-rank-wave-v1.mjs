// V162: score-bearing research production and conditional captain-rank progression.
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
import {createMonthlyScoreLedger} from './atlas-overcap-forward-monthly-score-ledger-v1.mjs';
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
const checkpointPath='tools/data/overcap-gdx-entry-wave-v1-24ebaacab32dbaa18802.json.gz';
const scorePath='tools/data/overcap-score-source-v1-f1681bd9d7a1fe3f013c.json.gz';
const cp=read(checkpointPath),scoreProof=read(scorePath);
assert.equal(cp.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(scoreProof.engineArchiveSha256,lock.archiveSha256);
const seed=replay(cp.continuation.actions);assert.equal(exactStateHash(seed.world),cp.continuation.stateHash);
const engine=createMonthlyScoreLedger(data,rp,scoreProof,sha(fs.readFileSync(scorePath)));
const rules=data.researchRules;
const ranks=['STR_CAPTAINS_RANK_01','STR_CAPTAINS_RANK_02','STR_CAPTAINS_RANK_03','STR_CAPTAINS_RANK_04','STR_CAPTAINS_RANK_05'];
const goals=['STR_PIRATEZ_HIERARCHY','STR_GDX_003','STR_GDX_004','STR_GDX_005','STR_SCHOOL_BOOKS','STR_LIBRARY','STR_PLOTTING','STR_ZOMBIE_DREAMS'];
const missing=(s,id)=>rules[id].dependencies.filter(k=>!active(s.world,k));
function snapshot(s,l){return {month:s.world.month,balance:s.world.funds,researchCount:s.world.researched.size,ranks:ranks.filter(k=>active(s.world,k)),goalResearch:goals.filter(k=>active(s.world,k)),gdxMissing:missing(s,'STR_GDX_003'),libraryMissing:missing(s,'STR_LIBRARY'),plottingMissing:missing(s,'STR_PLOTTING'),dreamMissing:missing(s,'STR_ZOMBIE_DREAMS'),stock:Object.fromEntries(['STR_PORN','STR_VAMPIRE_ESSENCE','STR_ZOMBIE_ESSENCE','STR_GLAMOUR'].map(k=>[k,qty(s.world,k)])),monthlySubtotal:l.current};}
function step(x,a){
 let n;
 if(a.type==='sourceMonthlyBoundary')n=monthly.advance(x.s,a);
 else if(a.type==='sourceMonthlyRankReward')n=engine.applyRank(x.s,x.l,a);
 else n=rp.research(x.s,a);
 const l=engine.observe(x.l,x.s,n);
 for(const k of ['STR_PORN','STR_VAMPIRE_ESSENCE'])assert(qty(n.world,k)>=qty(seed.world,k),'Reserved training stock consumed');
 return {s:n,l};
}
function boundary(x){return step(x,{type:'sourceMonthlyBoundary',month:x.s.world.month+1,assumeElapsed:true});}
function settleScore(x){
 for(let i=0;!rp.settled(x.s);i++){
  assert(i<60);const opts=rp.options(x.s);
  // Choose highest known raw positive free reward; no repeat score for source.
  const o=opts.filter(o=>o.action.type==='freeResearch').sort((a,b)=>engine.points(b.action.research)-engine.points(a.action.research)||a.action.research.localeCompare(b.action.research))[0]||opts[0];
  assert(o,'Unsettled action');x=step(x,o.action);
 }return x;
}
function labScore(x,id){
 const o=rp.options(x.s).find(o=>['research','repeatResearch'].includes(o.action.type)&&o.action.id===id);assert(o,'Unavailable lab: '+id);
 return settleScore(step(x,o.action));
}
let x={s:seed,l:engine.begin(seed)};
const before=snapshot(x.s,x.l),steps=[],errors=[],scoreProjects=[];
x=boundary(x); // fresh, fully tracked selected month; old 44-month partial is not used
function growScore(target){
 const rejected=new Set();
 for(let i=0;x.l.current+400<target&&i<35;i++){
  const opts=rp.options(x.s).filter(o=>['research','repeatResearch'].includes(o.action.type)&&!rejected.has(o.action.id));
  // Avoid consuming the training stock; only score a new explicit completion.
  const choices=opts.map(o=>{
   const id=o.action.id,r=rules[id],free=[...r.getOneFree,...Object.entries(r.getOneFreeProtected||{}).filter(([k])=>active(x.s.world,k)).flatMap(([,v])=>v)].filter(k=>!x.s.world.researched.has(k)&&!x.s.world.disabled.has(k));
   const best=Math.max(0,...free.map(k=>engine.points(k)));
   const estimated=(o.action.type==='research'?engine.points(id):0)+best;
   return {id,estimated,cost:r.cost,repeat:o.action.type==='repeatResearch'};
  }).filter(o=>o.estimated>0).sort((a,b)=>b.estimated/Math.max(1,b.cost)-a.estimated/Math.max(1,a.cost)||b.estimated-a.estimated||a.id.localeCompare(b.id));
  let next=null;
  for(const c of choices){
   try{
    const n=labScore(x,c.id),gain=n.l.current-x.l.current;
    if(gain<=0){rejected.add(c.id);continue;}
    next=n;
    scoreProjects.push({month:x.s.world.month,id:c.id,repeat:c.repeat,nominalResearchCost:c.cost,actualModeledGain:gain,grants:n.l.entries.slice(x.l.entries.length).flatMap(e=>e.grants)});
    break;
   }catch(e){rejected.add(c.id);}
  }
  if(!next)break;
  x=next;
 }return x.l.current+400>=target;
}
for(const [id,threshold] of [[ranks[0],2000],[ranks[1],3000]]){
 try{
  assert(growScore(threshold),'Insufficient modeled monthly research score: '+(x.l.current+400));
  const prev=x;const b=boundary(x);
  const o=engine.rankOption(b.s,b.l,id);assert(o,'Rank gate rejected after month close');
  x=settleScore(step(b,o.action));
  steps.push({label:'Conditional rank '+id,scoreProof:o.action.scoreProof,newActions:x.s.actions.length-prev.s.actions.length,rankPoints:engine.points(id)});
 }catch(e){errors.push({id,reason:String(e.message)});break;}
}
for(const id of ['STR_PIRATEZ_HIERARCHY','STR_GDX_003','STR_GDX_004']){
 if(active(x.s.world,id))continue;
 try{
  const prev=x;x=labScore(x,id);assert(active(x.s.world,id));
  steps.push({label:id,newActions:x.s.actions.length-prev.s.actions.length,scoreGain:x.l.current-prev.l.current});
 }catch(e){errors.push({id,reason:String(e.message)});}
}
const after=snapshot(x.s,x.l),newActions=x.s.actions.slice(seed.actions.length);
// Re-run every newly produced action from the hash-matched V161 prefix.
let restored={s:replay(cp.continuation.actions),l:null};restored.l=engine.begin(restored.s);
for(const a of newActions)restored=step(restored,a);
assert.equal(exactStateHash(restored.s.world),exactStateHash(x.s.world));
assert.deepEqual(restored.l,x.l);
const groupRefs=cp.groupRefs.map(g=>({...g,checkpointRef:'continuation',status:'SHARED_CHECKPOINT_ADVANCED'}));
const summary={legacyGoals:new Set(groupRefs.flatMap(g=>g.goals)).size,careerGroups:groupRefs.length,newActions:newActions.length,newResearch:[...x.s.world.researched].filter(k=>!seed.world.researched.has(k)&&active(x.s.world,k)).length,rankProduced:after.ranks.length,scoreProjects:scoreProjects.length,rankProofs:steps.filter(s=>s.scoreProof).map(s=>s.scoreProof),gdxDirectBefore:rules.STR_GDX_003.dependencies.length-before.gdxMissing.length,gdxDirectAfter:rules.STR_GDX_003.dependencies.length-after.gdxMissing.length,gdx003:active(x.s.world,'STR_GDX_003'),gdx004:active(x.s.world,'STR_GDX_004'),actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_MONTHLY_RANK_WAVE_V1',scope:'Conditional selected research score chronology. Regional activity, other events, actual calendar research capacity and native economy are not simulated. Rank rewards depend on explicitly recorded residual net score bounds.',sourceMetadataSha256:data.meta.source.metadataSha256,engineArchiveSha256:lock.archiveSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),scorePath,scoreSha256:sha(fs.readFileSync(scorePath)),summary,before,after,scoreProjects,steps,errors,scoreLedger:x.l,continuation:receipt(x.s),groupRefs,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-monthly-rank-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,before,after,steps,errors,projects:scoreProjects.map(p=>({month:p.month,id:p.id,repeat:p.repeat,gain:p.actualModeledGain,cost:p.nominalResearchCost})),bytes:fs.statSync(out).size}));
