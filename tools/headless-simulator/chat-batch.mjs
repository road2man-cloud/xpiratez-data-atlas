#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Conversational JSON -> ORIGINAL OXCE action plans -> native replays.
// No combat physics, AI, hit probability, damage, or game RNG are implemented here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preflight,runNative} from './run-native.mjs';
import {sha256} from './prepare-native.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const MAX_UINT64=(1n<<64n)-1n;
const ACTIONS=new Set(['observe','stop','end_turn','move','turn','kneel','fire']);
const NATIVE_FIELDS=new Set(['binary','manifest','runtime','data','user','config','save','master','fixedClock','xvfb','timeoutSeconds','experimentalAcknowledged','experimentalWindows']);
const REQUEST_FIELDS=new Set(['schema','backend','native','output','plans','sampling','continueOnError']);
const SAMPLE_FIELDS=new Set(['runsPerPlan','firstSeed']);
const ACTION_FIELDS=new Map([
  ['observe',['op']],['stop',['op']],['end_turn',['op']],
  ['kneel',['op','unitId']],['move',['op','unitId','target']],
  ['turn',['op','unitId','target']],
  ['fire',['op','unitId','itemId','mode','target']]
]);
const shaFile=p=>sha256(fs.readFileSync(p));
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function exactKeys(obj,fields,kind){
  if(!plain(obj))throw new Error('EXPECTED_OBJECT: '+kind);
  for(const k of Object.keys(obj))if(!fields.has(k))throw new Error('UNKNOWN_FIELD: '+kind+'.'+k);
}
function positiveInteger(x,max,label){
  if(!Number.isSafeInteger(x)||x<1||x>max)throw new Error('INVALID_'+label);
  return x;
}
function uint32(x,label){
  if(!Number.isSafeInteger(x)||x<0||x>2147483647)throw new Error('INVALID_'+label);
  return x;
}
function position(x){
  exactKeys(x,new Set(['x','y','z']),'target');
  return ['x','y','z'].map(k=>{
    const n=x[k];
    if(!Number.isSafeInteger(n)||n<0||n>32767)throw new Error('INVALID_COORDINATE: '+k);
    return n;
  });
}
export function actionLine(a){
  if(!plain(a)||!ACTIONS.has(a.op))throw new Error('UNSUPPORTED_ACTION');
  exactKeys(a,new Set(ACTION_FIELDS.get(a.op)),'action.'+a.op);
  const op=a.op;
  if(['observe','stop','end_turn'].includes(op))return op;
  const id=uint32(a.unitId,'UNIT_ID');
  if(op==='kneel')return 'kneel '+id;
  const xyz=position(a.target);
  if(op==='move'||op==='turn')return [op,id,...xyz].join(' ');
  const item=uint32(a.itemId,'ITEM_ID');
  if(!['snap','aimed','auto'].includes(a.mode))throw new Error('UNSUPPORTED_FIRE_MODE');
  return ['fire',id,item,a.mode,...xyz].join(' ');
}
export function normalizeRequest(request){
  exactKeys(request,REQUEST_FIELDS,'request');
  if(request.schema!==1||request.backend!=='OXCE_NATIVE')throw new Error('ORIGINAL_OXCE_BACKEND_REQUIRED');
  exactKeys(request.native,NATIVE_FIELDS,'native');
  const n=request.native;
  const engine={};
  for(const k of ['binary','manifest','data','user','config','save']){
    if(typeof n[k]!=='string'||!path.isAbsolute(n[k]))throw new Error('ABSOLUTE_NATIVE_PATH_REQUIRED: '+k);
    engine['--'+k]=n[k];
  }
  for(const k of ['runtime']){
    if(n[k]!==undefined){
      if(typeof n[k]!=='string'||!path.isAbsolute(n[k]))throw new Error('ABSOLUTE_NATIVE_PATH_REQUIRED: '+k);
      engine['--'+k]=n[k];
    }
  }
  if(n.master!==undefined){
    if(typeof n.master!=='string'||!/^[a-zA-Z0-9_-]+$/.test(n.master))throw new Error('INVALID_MASTER');
    engine['--master']=n.master;
  }
  if(n.timeoutSeconds!==undefined)engine['--timeout']=String(positiveInteger(n.timeoutSeconds,86400,'TIMEOUT'));
  for(const flag of ['fixedClock','xvfb']){
    if(n[flag]!==undefined&&typeof n[flag]!=='boolean')throw new Error('INVALID_NATIVE_FLAG: '+flag);
    if(n[flag])engine[flag==='fixedClock'?'--fixed-clock':'--xvfb']=true;
  }
  if(n.experimentalAcknowledged!==true)throw new Error('EXPLICIT_NATIVE_EXPERIMENTAL_ACKNOWLEDGMENT_REQUIRED');
  if(n.experimentalWindows!==undefined&&typeof n.experimentalWindows!=='boolean')
    throw new Error('EXPERIMENTAL_WINDOWS_MUST_BE_BOOLEAN');
  if(n.experimentalWindows)engine['--experimental-windows']=true;
  engine['--experimental']=true; // Still unverified vs. the user's GUI; no surrogate fallback.
  if(typeof request.output!=='string'||!path.isAbsolute(request.output))throw new Error('ABSOLUTE_OUTPUT_PATH_REQUIRED');
  if(!Array.isArray(request.plans)||!request.plans.length||request.plans.length>100)
    throw new Error('PLANS_REQUIRED_MAX_100');
  const seen=new Set();
  const plans=request.plans.map(p=>{
    exactKeys(p,new Set(['id','actions']),'plan');
    if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(p.id)||seen.has(p.id))
      throw new Error('INVALID_OR_DUPLICATE_PLAN_ID');
    seen.add(p.id);
    if(!Array.isArray(p.actions)||!p.actions.length||p.actions.length>1024)
      throw new Error('INVALID_ACTION_COUNT');
    const lines=p.actions.map(actionLine);
    const stops=lines.filter(a=>a==='stop').length;
    if(stops>1||(stops===1&&lines.at(-1)!=='stop'))throw new Error('STOP_MUST_BE_LAST');
    const text=lines.join('\n')+'\n';
    return {id:p.id,text,sha256:sha256(Buffer.from(text,'utf8'))};
  });
  const s=request.sampling??{runsPerPlan:1};
  exactKeys(s,SAMPLE_FIELDS,'sampling');
  const count=positiveInteger(s.runsPerPlan,10000,'SAMPLE_COUNT');
  if(count*plans.length>10000)throw new Error('MAXIMUM_10000_NATIVE_PROCESSES');
  const firstSeed=s.firstSeed;
  if(firstSeed!==undefined){
    if(typeof firstSeed!=='string'||!/^[1-9][0-9]*$/.test(firstSeed)||BigInt(firstSeed)>MAX_UINT64)
      throw new Error('INVALID_UINT64_START_SEED');
    if(BigInt(firstSeed)+BigInt(count-1)>MAX_UINT64)throw new Error('SEED_OVERFLOW');
  }else if(count>1)throw new Error('MULTIPLE_RUNS_REQUIRE_SEED');
  if(request.continueOnError!==undefined&&typeof request.continueOnError!=='boolean')
    throw new Error('INVALID_CONTINUE_ON_ERROR');
  return {engine,output:request.output,plans,count,firstSeed:firstSeed??null,continueOnError:request.continueOnError===true};
}
export function scoreNativeCheckpoints(checkpoints){
  if(!Array.isArray(checkpoints)||checkpoints.length<2)throw new Error('NATIVE_CHECKPOINTS_REQUIRED');
  const before=checkpoints[0],after=checkpoints.at(-1);
  if(!Array.isArray(before.units)||!Array.isArray(after.units))throw new Error('NATIVE_UNITS_REQUIRED');
  const last=new Map();
  for(const u of after.units){
    if(!Number.isSafeInteger(u.id)||last.has(u.id))throw new Error('INVALID_FINAL_UNIT_ID');
    last.set(u.id,u);
  }
  const ids=new Set(),changes=[],sums={
    playerUnits:0,hostileUnits:0,playerHpLost:0,hostileHpLost:0,
    playerHpAtOrBelowZero:0,hostileHpAtOrBelowZero:0,changedFactions:0
  };
  for(const u of before.units){
    if(!Number.isSafeInteger(u.id)||ids.has(u.id))throw new Error('INVALID_INITIAL_UNIT_ID');
    ids.add(u.id);
    const v=last.get(u.id);
    if(!v)throw new Error('MISSING_NATIVE_UNIT: '+u.id);
    for(const x of [u.health,v.health,u.status,v.status,u.faction,v.faction])
      if(!Number.isSafeInteger(x))throw new Error('INVALID_NATIVE_UNIT_FIELD');
    const dh=Math.max(0,u.health-v.health);
    const kind=u.faction===0?'player':u.faction===1?'hostile':'neutral';
    if(kind==='player'){
      sums.playerUnits++;sums.playerHpLost+=dh;
      if(v.health<=0)sums.playerHpAtOrBelowZero++;
    } else if(kind==='hostile'){
      sums.hostileUnits++;sums.hostileHpLost+=dh;
      if(v.health<=0)sums.hostileHpAtOrBelowZero++;
    }
    if(u.faction!==v.faction)sums.changedFactions++;
    if(dh||u.health!==v.health||u.status!==v.status||u.faction!==v.faction||
      JSON.stringify(u.position)!==JSON.stringify(v.position))
      changes.push({id:u.id,side:kind,health:[u.health,v.health],status:[u.status,v.status],
        faction:[u.faction,v.faction],position:[u.position,v.position]});
  }
  return {
    kind:'NATIVE_CHECKPOINT_STATE_DELTA_NOT_VICTORY',
    start:{turn:before.turn,side:before.side,rng:before.rng},
    end:{turn:after.turn,side:after.side,rng:after.rng},
    ...sums,unitChanges:changes
  };
}
async function digestFile(file) {
  const h=crypto.createHash('sha256');
  for await(const block of fs.createReadStream(file))h.update(block);
  return h.digest('hex');
}
export async function fingerprintGameResources(engine){
  const roots=[['game-data',fs.realpathSync(engine['--data'])]];
  const mods=path.join(fs.realpathSync(engine['--user']),'mods');
  if(fs.existsSync(mods))roots.push(['user-mods',fs.realpathSync(mods)]);
  const h=crypto.createHash('sha256');
  let files=0,bytes=0;
  async function visit(base,rel,label){
    const dir=path.join(base,rel);
    for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const next=path.join(rel,entry.name),file=path.join(base,next);
      if(entry.isSymbolicLink())throw new Error('UNVERIFIABLE_RESOURCE_SYMLINK: '+next);
      if(entry.isDirectory()){await visit(base,next,label);continue;}
      if(!entry.isFile())throw new Error('UNSUPPORTED_GAME_RESOURCE: '+next);
      const size=fs.statSync(file).size,digest=await digestFile(file);
      h.update(JSON.stringify([label,next.split(path.sep).join('/'),size,digest])+'\n');
      files++;bytes+=size;
    }
  }
  for(const [label,base] of roots)await visit(base,'',label);
  if(!files)throw new Error('NO_GAME_RESOURCES');
  return {sha256:h.digest('hex'),files,bytes};
}
function verifyInputLock(paths){
  for(const [label,{path:file,digest}] of Object.entries(paths))
    if(shaFile(file)!==digest)throw new Error('INPUT_CHANGED: '+label);
}
function validatedEvidence(root,result,master){
  if(result.backend!=='OXCE_NATIVE'||result.planCompleted!==true||
      result.parityCertified!==false||!Array.isArray(result.checkpoints)||result.checkpoints.length<2)
    throw new Error('NATIVE_REPLAY_NOT_COMPLETE');
  const trace=fs.readFileSync(path.join(root,'native-events.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
  if(trace[0]?.event!=='native_ready'||trace.at(-1)?.event!=='plan_completed'||
      trace.some(e=>e.event==='error'))throw new Error('NATIVE_TRACE_NOT_COMPLETE');
  const snapshots=trace.filter(e=>e.event==='checkpoint');
  if(snapshots.length!==result.checkpoints.length)throw new Error('NATIVE_CHECKPOINT_COUNT_MISMATCH');
  const units=[];
  for(let i=0;i<snapshots.length;i++){
    const c=result.checkpoints[i],e=snapshots[i];
    const {snapshotSha256,...rest}=c;
    if(JSON.stringify(rest)!==JSON.stringify(e))throw new Error('CHECKPOINT_TRACE_MISMATCH');
    if(!/^xpz-native-[0-9]+\.sav$/.test(c.file||''))throw new Error('INVALID_NATIVE_CHECKPOINT_FILENAME');
    const file=path.join(root,'user',master,c.file);
    if(!fs.lstatSync(file).isFile()||shaFile(file)!==snapshotSha256)
      throw new Error('NATIVE_SAVE_BYTES_MISMATCH');
    units.push(c);
  }
  return scoreNativeCheckpoints(units);
}
// Incremental aggregation is O(1) per trial. Never rewrite a growing
// array of thousands of detailed trial records after each replay.
export function newPlanTotals(plans,count){
  return new Map(plans.map(p=>[p.id,{id:p.id,planned:count,attempted:0,completed:0,failed:0,
    sumPlayerHpLost:0,sumHostileHpLost:0,playerHpNonpositiveObserved:0}]));
}
export function recordNativeTrial(totals,row){
  const x=totals.get(row.plan);
  if(!x)throw new Error('UNKNOWN_TRIAL_PLAN');
  if(x.attempted>=x.planned)throw new Error('TOO_MANY_TRIALS_FOR_PLAN');
  x.attempted++;
  if(row.status==='completed'){
    if(!row.observation||!Number.isFinite(row.observation.playerHpLost)||
       !Number.isFinite(row.observation.hostileHpLost))throw new Error('MISSING_NATIVE_OBSERVATION');
    x.completed++;x.sumPlayerHpLost+=row.observation.playerHpLost;
    x.sumHostileHpLost+=row.observation.hostileHpLost;
    if(row.observation.playerHpAtOrBelowZero>0)x.playerHpNonpositiveObserved++;
  }else if(row.status==='error')x.failed++;
  else throw new Error('UNKNOWN_TRIAL_STATUS');
}
export function summarizeTotals(totals){
  return [...totals.values()].map(x=>({
    id:x.id,planned:x.planned,attempted:x.attempted,completed:x.completed,failed:x.failed,
    meanPlayerHpLost:x.completed?x.sumPlayerHpLost/x.completed:null,
    meanHostileHpLost:x.completed?x.sumHostileHpLost/x.completed:null,
    playerHpNonpositiveObserved:x.playerHpNonpositiveObserved,
    nativeWins:'UNOBSERVABLE_IN_THIS_ADAPTER'
  }));
}
export async function runDialogueBatch(request){
  const job=normalizeRequest(request);
  if(process.platform!=='linux' && !(process.platform==='win32' && job.engine['--experimental-windows']===true))
    throw new Error('NATIVE_PLATFORM_NOT_AUTHORIZED');
  const root=path.resolve(job.output);
  if(fs.existsSync(root))throw new Error('OUTPUT_ALREADY_EXISTS');
  const lock=JSON.parse(fs.readFileSync(path.join(HERE,'native/source.lock.json'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(job.engine['--manifest'],'utf8'));
  for(const k of ['sourceTreeSha256','driverSha256','archiveSha256'])
    if(lock[k]!==manifest[k])throw new Error('CURRENT_SOURCE_LOCK_MISMATCH: '+k);
  const staging=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-dialogue-preflight-'));
  try{
    const probe=path.join(staging,'probe.actions');
    fs.writeFileSync(probe,job.plans[0].text);
    preflight({...job.engine,'--plan':probe,'--out':path.join(root,'trial-000001')});
  }finally{fs.rmSync(staging,{recursive:true,force:true});}
  const inputs=Object.fromEntries(['binary','manifest','save','config'].map(k=>[k,{
    path:job.engine['--'+k],digest:shaFile(job.engine['--'+k])
  }]));
  const resources=await fingerprintGameResources(job.engine);
  fs.mkdirSync(path.join(root,'plans'),{recursive:true});
  for(const p of job.plans)fs.writeFileSync(path.join(root,'plans',p.id+'.actions'),p.text,{flag:'wx'});
  const totals=newPlanTotals(job.plans,job.count);
  const report={schema:1,backend:'OXCE_NATIVE',source:'ORIGINAL_OXCE_REPLAY',
    model:'NO_APPROXIMATE_COMBAT_FORMULAS',nativeParityCertified:false,battleVictoryCertified:false,
    nativeMissionVictoryObservable:false,sampling:{runsPerPlan:job.count,firstSeed:job.firstSeed??'PRESERVE_SAVED_RNG'},
    requestedTrials:job.count*job.plans.length,attemptedTrials:0,completedTrials:0,failedTrials:0,
    trialsFile:'trials.jsonl',status:'running',
    evidence:{engineSourceSha256:lock.sourceTreeSha256,sourceArchiveSha256:lock.archiveSha256,
      nativeBinarySha256:inputs.binary.digest,saveSha256:inputs.save.digest,
      gameResources:resources,plans:job.plans.map(p=>({id:p.id,sha256:p.sha256}))},
    byPlan:summarizeTotals(totals)};
  const output=path.join(root,'chat-batch-report.json');
  const trialsFile=path.join(root,'trials.jsonl');
  fs.writeFileSync(trialsFile,'',{flag:'wx'});
  const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  const record=row=>{
    // The individual native trial evidence is append-only; summary stays small.
    fs.appendFileSync(trialsFile,JSON.stringify(row)+'\n');
    recordNativeTrial(totals,row);
    report.attemptedTrials++;
    if(row.status==='completed')report.completedTrials++;else report.failedTrials++;
    report.byPlan=summarizeTotals(totals);
    persist();
  };
  persist();
  try{
    let trial=0;
    for(const p of job.plans)for(let i=0;i<job.count;i++){
      verifyInputLock(inputs);
      const planPath=path.join(root,'plans',p.id+'.actions');
      if(shaFile(planPath)!==p.sha256)throw new Error('PLAN_CHANGED_DURING_BATCH');
      const seed=job.firstSeed?(BigInt(job.firstSeed)+BigInt(i)).toString():null;
      const trialName='trial-'+String(++trial).padStart(6,'0'),dir=path.join(root,trialName);
      const args={...job.engine,'--plan':planPath,'--out':dir};
      if(seed)args['--seed']=seed;
      let row;
      try{
        const native=await runNative(args);
        const observation=validatedEvidence(dir,native,job.engine['--master']||'piratez');
        row={plan:p.id,trial:trialName,seed:seed??'PRESERVE_SAVED_RNG',status:'completed',
          checkpointCount:native.checkpointCount,observation,
          nativeVictory:'NOT_OBSERVABLE'};
      }catch(e){
        row={plan:p.id,trial:trialName,seed:seed??'PRESERVE_SAVED_RNG',status:'error',
          error:String(e.message||e)};
      }
      record(row);
      if(row.status==='error'&&!job.continueOnError)throw new Error(row.error);
    }
    verifyInputLock(inputs);
    const after=await fingerprintGameResources(job.engine);
    if(after.sha256!==resources.sha256)throw new Error('GAME_RESOURCES_CHANGED_DURING_BATCH');
    report.status=report.failedTrials?'partially_failed':'completed';
  }catch(e){report.status='failed';report.error=String(e.message||e);persist();throw e;}
  persist();return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw new Error('USAGE: node chat-batch.mjs /absolute/path/request.json');
    const request=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const report=await runDialogueBatch(request);
    console.log(JSON.stringify({status:report.status,requestedTrials:report.requestedTrials,
      attemptedTrials:report.attemptedTrials,completedTrials:report.completedTrials,
      failedTrials:report.failedTrials,byPlan:report.byPlan,
      nativeMissionVictoryObservable:false,battleVictoryCertified:false},null,2));
    if(report.status!=='completed')process.exitCode=1;
  }catch(e){console.error('CHAT_NATIVE_BATCH_FAILED: '+e.message);process.exitCode=1;}
}
