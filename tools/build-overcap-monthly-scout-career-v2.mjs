// V156: rebuild the selected V155 monthly sequence, obtain a second scout,
// complete recruitment, and replay existing career stages from that same world.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createCareerReplay} from './atlas-overcap-forward-career-replay-v1.mjs';
import {createRandomItemEventAdapter} from './atlas-overcap-forward-random-event-v1.mjs';
import {createTavernRecovery} from './atlas-overcap-forward-tavern-recovery-v1.mjs';
import {createMonthlyWitness} from './atlas-overcap-forward-monthly-witness-v1.mjs';
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
const wanted=new Set(['STR_TROUBLESEEKING_ENEMY','STR_TROUBLESEEKING_FRIENDS']),raws=new Map();
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
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
function oldStep(s,a){return a.type==='sourceRandomEventItem'?rnd.apply(s,a):a.type==='sourceMapRecovery'?tavern.apply(s,a):rp.research(s,a);}
function legacyReplay(actions){let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));for(const a of actions.slice(2))s=oldStep(s,a);return s;}
function replay(actions){
 let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));
 for(const a of actions.slice(2)){
  if(a.type==='sourceMonthlyBoundary')s=monthly.advance(s,a);
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
const row=prior.rows.find(r=>r.after.persuasion&&r.after.items.STR_RAIDER_SCOUT===1);
assert(row);
const original=legacyReplay(row.fullActions);
assert.equal(exactStateHash(original.world),row.stateHash);
let s=rp.start(row.fullActions[0].difficulty);
const schedule=[];
let prefixError=null;
for(const [i,a] of row.fullActions.slice(2).entries()){
 try{
  if(monthly.scripted(a)){
   s=monthly.advance(s);
   s=monthly.applyLegacy(s,a,oldStep);
   schedule.push({originalIndex:i+2,month:s.world.month,type:a.type,event:a.event||a.deployment,script:a.script});
  }else s=oldStep(s,a);
 }catch(e){prefixError={index:i+2,action:a,error:String(e.message)};break;}
}
const prefix=s;
let birth=null,birthError=null;
const acq=bulk.acquisitions.find(a=>a.profile==='manufacture:STR_RAIDER_SCOUT_RECRUITMENT');
assert(acq&&acq.context.difficulty===s.world.difficulty);
if(!prefixError)try{
 assert.deepEqual([...s.world.researched],[...original.world.researched]);
 assert.deepEqual([...s.world.disabled],[...original.world.disabled]);
 assert.deepEqual(s.world.items,original.world.items);
 assert.equal(s.world.funds,original.world.funds);
 assert.equal(exactStateHash(replay(s.actions).world),exactStateHash(s.world));
 // An actual new weighted occurrence, with previous event history retained.
 const scout=qty(s.world,'STR_RAIDER_SCOUT'),glamour=qty(s.world,'STR_GLAMOUR');
 s=reward(s,repeatEnemy,'STR_RAIDER_SCOUT');
 assert.equal(qty(s.world,'STR_RAIDER_SCOUT'),scout+1);
 s=lab(s,'STR_RAIDER_SCOUT','STR_RAIDER_CLANS');
 assert.equal(qty(s.world,'STR_RAIDER_SCOUT'),scout);
 assert(active(s.world,'STR_RAIDER_CLANS'));
 s=lab(s,'STR_RAIDER_SCOUT_RECRUITMENT');
 s=reward(s,repeatFriends);
 assert.equal(qty(s.world,'STR_GLAMOUR'),glamour+10);
 birth=rp.career(s,acq.birth);
 assert.equal(qty(birth.world,'STR_RAIDER_SCOUT'),0);
 assert.equal(qty(birth.world,'STR_GLAMOUR'),glamour+10-25);
 assert.equal(birth.world.funds,s.world.funds-20000);
 assert.equal(exactStateHash(replay(birth.actions).world),exactStateHash(birth.world));
}catch(e){birthError=String(e.message);birth=null;}
const groups=bulk.groups.filter(g=>g.acquisition===acq.id),careers=[],cache=new Map(),careerCheckpoints=new Map();
if(birth){
 for(const g of groups){
  assert.deepEqual(g.stages[0].action,acq.birth);
  let state=birth,applied=1,failure=null;
  for(const stage of g.stages.slice(1)){
   try{
    const k=key([exactStateHash(state.world),stage.action]);
    if(!cache.has(k))cache.set(k,rp.career(state,stage.action));
    const next=cache.get(k);
    // Cache only exact same action history, not just identical final states.
    state=JSON.stringify(next.actions.slice(0,-1))===JSON.stringify(state.actions)?next:rp.career(state,stage.action);
    applied++;
   }catch(e){failure={action:stage.action,reason:String(e.message),requirements:stage.requirements,missing:rp.missing(state,stage.requirements)};break;}
  }
  const checkpointId=key([state.actions,exactStateHash(state.world)]);
  if(!careerCheckpoints.has(checkpointId)){
   assert.equal(exactStateHash(replay(state.actions).world),exactStateHash(state.world));
   careerCheckpoints.set(checkpointId,{id:checkpointId,result:rp.finish(state),receipt:receipt(state)});
  }
  careers.push({group:g.id,goals:g.goalIds,applied,total:g.stages.length,failure,checkpointId,status:failure?'PARTIAL_CONDITIONAL_CAREER':'CONDITIONAL_CAREER_REPLAYED',finalAdmission:false});
 }
}
const completed=careers.filter(x=>!x.failure);
const summary={originalPrefixActions:row.fullActions.length,selectedScheduledActions:schedule.length,originalMonth:original.world.month,normalizedSelectedPrefixMonth:prefix.world.month,prefixReplayed:!prefixError,persuasion:active(s.world,'STR_PERSUASION'),scoutResearch:active(s.world,'STR_RAIDER_SCOUT'),clansResearch:active(s.world,'STR_RAIDER_CLANS'),recruitmentResearch:active(s.world,'STR_RAIDER_SCOUT_RECRUITMENT'),newRepeatOccurrences:Math.max(0,Number(s.world.generatedEvents[enemy.raw.id]||0)-Number(original.world.generatedEvents[enemy.raw.id]||0))+Math.max(0,Number(s.world.generatedEvents[friends.raw.id]||0)-Number(original.world.generatedEvents[friends.raw.id]||0)),birthProduced:Number(!!birth),birthMonth:birth?.world.month??null,sharedCareerCheckpoints:careerCheckpoints.size,careerGroups:groups.length,legacyGoals:acq.goalIds.length,careerGroupsPartiallyReplayed:careers.length-completed.length,careerGroupsCompleted:completed.length,legacyGoalsWithCareerPrefix:new Set(careers.flatMap(c=>c.goals)).size,legacyGoalsConditionallyReplayed:new Set(completed.flatMap(c=>c.goals)).size,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_MONTHLY_SCOUT_CAREER_V2',scope:'Selected-event chronology corrected by conservative one-boundary-per-event scheduling. Other scheduled events, mandatory outputs, exact elapsed days, full economy, combat and native runtime are not simulated; not actual campaign certification.',sourceMetadataSha256:data.meta.source.metadataSha256,engineSource:{lockPath,archiveSha256:lock.archiveSha256,engineVersion:lock.engineVersion,exactInstalledExecutableMatchVerified:lock.exactInstalledExecutableMatchVerified,logic:'GeoscapeState.cpp:4028-4205; SavedGame.cpp:3214-3239; RuleEventScript.cpp weighted generation'},priorPath,priorSha256:sha(fs.readFileSync(priorPath)),bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),summary,schedule,prefixError,prefixReceipt:receipt(prefix),recruitmentReceipt:receipt(s),birthError,birth:birth?{receipt:receipt(birth),result:rp.finish(birth),remainingItems:{STR_RAIDER_SCOUT:qty(birth.world,'STR_RAIDER_SCOUT'),STR_GLAMOUR:qty(birth.world,'STR_GLAMOUR')}}:null,careers,careerCheckpoints:[...careerCheckpoints.values()],actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-monthly-scout-career-v2-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,prefixError,birthError,birth:report.birth&&{result:report.birth.result,remainingItems:report.birth.remainingItems,balance:report.birth.receipt.balance},career:careers.slice(0,2).map(c=>({applied:c.applied,total:c.total,failure:c.failure,checkpointId:c.checkpointId})),bytes:fs.statSync(out).size}));
