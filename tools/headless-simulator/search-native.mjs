#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Execute many policies/seeds through ORIGINAL OXCE process, never JS combat math.
// A trial is a native victory ONLY if ORIGINAL finishBattle() emitted "WON".
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNative,parseArgs,preflight} from './run-native.mjs';
import {verifyRunEvidence,fingerprintGameInputs} from './verify-native-replays.mjs';
import {sha256} from './prepare-native.mjs';

const MAX_U64=(1n<<64n)-1n;
export function parseBatchArgs(argv){
  const rest=[];let plans=null,count=1,startSeed=null,continueOnError=false;
  const seen=new Set();
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(['--plans','--count','--start-seed','--continue-on-error'].includes(key)){
      if(seen.has(key))throw new Error('DUPLICATE_ARGUMENT: '+key);
      seen.add(key);
      if(key==='--continue-on-error'){continueOnError=true;continue;}
      const value=argv[++i];
      if(!value||value.startsWith('--'))throw new Error('MISSING_BATCH_ARGUMENT: '+key);
      if(key==='--plans')plans=value;
      if(key==='--count'){if(!/^[1-9]\d*$/.test(value))throw new Error('INVALID_TRIAL_COUNT');count=Number(value);}
      if(key==='--start-seed'){
        if(!/^[1-9]\d*$/.test(value))throw new Error('INVALID_START_SEED');
        startSeed=BigInt(value);
      }
    }else rest.push(key);
  }
  if(!plans)throw new Error('REQUIRED_ARGUMENT: --plans');
  if(!Number.isSafeInteger(count)||count<1||count>10000)throw new Error('TRIAL_COUNT_MUST_BE_1_TO_10000');
  if(count>1&&startSeed==null)throw new Error('MULTIPLE_TRIALS_REQUIRE_DIFFERENT_EXPLICIT_SEEDS');
  if(startSeed!==null&&(startSeed>MAX_U64||startSeed+BigInt(count-1)>MAX_U64))
    throw new Error('UINT64_SEED_RANGE_OVERFLOW');
  const args=parseArgs(rest);
  if(args['--plan']||args['--seed'])throw new Error('PLAN_AND_SEED_ARE_BATCH_OWNED');
  if(!args['--out'])throw new Error('REQUIRED_ARGUMENT: --out');
  return {args,plans,count,startSeed,continueOnError};
}
export function listPlans(directory){
  directory=fs.realpathSync(directory);
  if(!fs.statSync(directory).isDirectory())throw new Error('PLAN_DIRECTORY_REQUIRED');
  const entries=fs.readdirSync(directory,{withFileTypes:true})
    .filter(e=>e.name.endsWith('.actions'))
    .sort((a,b)=>a.name.localeCompare(b.name,'en'));
  if(!entries.length)throw new Error('NO_ACTION_PLANS');
  const names=new Set();
  return entries.map(e=>{
    if(!e.isFile()||e.isSymbolicLink())throw new Error('PLAN_NOT_REGULAR_FILE');
    if(!/^[A-Za-z0-9_.-]+\.actions$/.test(e.name))throw new Error('UNSAFE_PLAN_NAME');
    const file=path.join(directory,e.name);
    const stat=fs.statSync(file);
    if(!stat.size||stat.size>65536)throw new Error('INVALID_PLAN_SIZE: '+e.name);
    if(names.has(e.name))throw new Error('DUPLICATE_PLAN');names.add(e.name);
    return {name:e.name,file,sha256:sha256(fs.readFileSync(file))};
  });
}
export function parseBattleUnits(saveText){
  // A narrow YAML-reader for unit ID/faction/status/HP only, NOT a battle model.
  // Require the actual 2-space "units:" block and canonical saved-unit layout.
  const lines=saveText.split(/\r?\n/);
  const starts=lines.flatMap((line,i)=>/^  units:\s*$/.test(line)?[i]:[]);
  if(starts.length!==1)throw new Error('BATTLE_UNITS_BLOCK_MISSING_OR_AMBIGUOUS');
  const units=[],ids=new Set();
  let u=null;
  for(let i=starts[0]+1;i<lines.length;i++){
    const line=lines[i];
    if(/^  [A-Za-z_][\w-]*:/.test(line))break;
    const begin=/^    - id:\s*(\d+)\s*$/.exec(line);
    if(begin){
      if(u)units.push(u);
      const id=Number(begin[1]);
      if(!Number.isSafeInteger(id)||ids.has(id))throw new Error('INVALID_BATTLE_UNIT_ID');
      ids.add(id);u={id};continue;
    }
    const prop=/^      (faction|originalFaction|status|health|stunlevel):\s*(-?\d+)\s*$/.exec(line);
    if(prop&&u){u[prop[1]]=Number(prop[2]);}
  }
  if(u)units.push(u);
  if(!units.length||units.some(u=>!Number.isInteger(u.faction)||!Number.isInteger(u.status)||
      !Number.isInteger(u.health)||!Number.isInteger(u.stunlevel)||
      (u.originalFaction!==undefined&&!Number.isInteger(u.originalFaction))))
    throw new Error('INCOMPLETE_BATTLE_UNIT_STATE');
  // Original OXCE writes originalFaction ONLY when it differs from faction.
  // A mind-controlled original ally must still count toward survival/losses.
  for(const unit of units)unit.originalFaction ??= unit.faction;
  return units;
}
export function scoreNativeTerminal(initial,final,outcome){
  if(outcome!=='WON'&&outcome!=='LOST'&&outcome!=='ABORTED'&&outcome!=='NEXT_STAGE'&&outcome!=='PREVIEW')
    throw new Error('NATIVE_MISSION_OUTCOME_REQUIRED');
  const allies=initial.filter(x=>(x.originalFaction??x.faction)===0);
  if(!allies.length)throw new Error('NO_ORIGINAL_PLAYER_UNITS');
  const finalById=new Map(final.map(x=>[x.id,x]));
  let dead=0,unconscious=0,netHpLoss=0,netStunIncrease=0,lostControl=0;
  for(const a of allies){
    const after=finalById.get(a.id);
    if(!after)throw new Error('ORIGINAL_PLAYER_UNIT_MISSING: '+a.id);
    if((after.originalFaction??after.faction)!==0)throw new Error('ORIGINAL_PLAYER_IDENTITY_CHANGED: '+a.id);
    // STATUS_IGNORE_ME / STATUS_COLLAPSING are not safe to call alive.
    if(after.status===10||after.status===5)throw new Error('AMBIGUOUS_PLAYER_TERMINAL_STATUS: '+a.id);
    if(after.faction!==0)lostControl++;
    if(after.status===6||after.health<=0)dead++;
    if(after.status===7||after.stunlevel>=after.health&&after.health>0)unconscious++;
    netHpLoss+=Math.max(0,a.health-Math.max(0,after.health));
    netStunIncrease+=Math.max(0,after.stunlevel-a.stunlevel);
  }
  const nativeWin=outcome==='WON';
  return {outcome,initialAllies:allies.length,dead,unconscious,lostControl,alive:allies.length-dead,
    netHpLoss,netStunIncrease,
    zeroDeathNativeWin:nativeWin&&dead===0,
    zeroConsciousNativeWin:nativeWin&&dead===0&&unconscious===0&&lostControl===0,
    zeroHpLossNativeWin:nativeWin&&dead===0&&netHpLoss===0,
    zeroNetHpAndStunLossNativeWin:nativeWin&&dead===0&&unconscious===0&&lostControl===0&&netHpLoss===0&&netStunIncrease===0,
    parityCertified:false,battleVictoryCertified:false};
}
export function betterNativeScore(candidate,best){
  // Lexicographic safety priority: death, unconsciousness, loss of control,
  // net HP loss, new stun. A native "WON" event is required before calling.
  if(best===null)return true;
  for(const field of ['dead','unconscious','lostControl','netHpLoss','netStunIncrease']){
    if(!Number.isInteger(candidate[field])||!Number.isInteger(best[field]))
      throw new Error('INVALID_NATIVE_RANKING_SCORE: '+field);
    if(candidate[field]!==best[field])return candidate[field]<best[field];
  }
  return false;
}
function verifyUnchanged(files){
  for(const p of files)if(sha256(fs.readFileSync(p.file))!==p.sha256)
    throw new Error('BATCH_INPUT_CHANGED: '+p.name);
}
export async function runNativeBatch(batch){
  if(process.platform!=='linux')throw new Error('GPT_LINUX_EXECUTION_REQUIRED');
  const {args,count,startSeed,continueOnError}=batch,plans=listPlans(batch.plans);
  if(plans.length*count>10000)throw new Error('MAXIMUM_10000_NATIVE_PROCESSES');
  const outputRoot=path.resolve(args['--out']);
  if(fs.existsSync(outputRoot))throw new Error('OUTPUT_ALREADY_EXISTS');
  preflight({...args,'--plan':plans[0].file,'--out':path.join(outputRoot,'trial-000001')});
  const inputFiles=[
    {name:'save',file:args['--save'],sha256:sha256(fs.readFileSync(args['--save']))},
    {name:'config',file:args['--config'],sha256:sha256(fs.readFileSync(args['--config']))},
    ...plans
  ];
  const initial=parseBattleUnits(fs.readFileSync(args['--save'],'utf8'));
  // Full-byte pinning before and after the experiment, not mtime-only evidence.
  const inputResources=await fingerprintGameInputs(args);
  fs.mkdirSync(outputRoot,{recursive:true});
  const rows=[],tally=Object.fromEntries(plans.map(p=>[p.name,{
    attempts:0,finishWon:0,finishLost:0,finishedAborted:0,nextStage:0,
    unfinished:0,errors:0,zeroDeathNativeWins:0,zeroConsciousNativeWins:0,zeroHpLossNativeWins:0,
    zeroNetHpAndStunLossNativeWins:0,
    fewestDeadOfNativeWins:null,fewestUnconsciousOfNativeWins:null,fewestLostControlOfNativeWins:null,
    lowestNetHpLossOfNativeWins:null,lowestNetStunIncreaseOfNativeWins:null,bestSeed:null,bestTrial:null
  }]));
  const report={schema:1,backend:'OXCE_NATIVE',mode:'EXPLICIT_ACTION_PLAN_BY_SEED',
    model:'ORIGINAL_OXCE_NO_NUMERICAL_SURROGATE',parityCertified:false,
    battleVictoryCertified:false,status:'running',plannedTrials:plans.length*count,
    completedTrials:0,sourceSaveSha256:inputFiles[0].sha256,
    seedMode:startSeed==null?'PRESERVE_SAVE_RNG':'EXPLICIT_SEED_SERIES',
    inputResources,
    plans:plans.map(p=>({name:p.name,sha256:p.sha256})),byPlan:tally,results:rows};
  const reportPath=path.join(outputRoot,'native-search-report.json');
  const persist=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  persist();
  try{
    for(let p=0;p<plans.length;p++)for(let i=0;i<count;i++){
      verifyUnchanged(inputFiles);
      const plan=plans[p], seed=startSeed==null?null:(startSeed+BigInt(i)).toString();
      const trial=String(p*count+i+1).padStart(6,'0'),dir=path.join(outputRoot,'trial-'+trial);
      const command={...args,'--plan':plan.file,'--out':dir};
      if(seed)command['--seed']=seed;else delete command['--seed'];
      const summary=tally[plan.name];
      summary.attempts++;
      try{
        const result=await runNative(command);
        verifyRunEvidence(dir,args['--master']||'piratez');
        const row={plan:plan.name,trial,seed:seed||'PRESERVE_SAVE_RNG',
          nativeOutcome:result.nativeMissionOutcome||'UNFINISHED',
          nativeBattleFinished:result.nativeBattleFinished,planCompleted:result.planCompleted,
          terminalSnapshotSha256:result.nativeFinishSnapshotSha256||null,score:null};
        if(result.nativeBattleFinished){
          // Read casualties at the ORIGINAL finishBattle() ENTRY, before the
          // engine removes summoned units or replaces the tactical mission.
          // The post-finish snapshot is still kept and byte-checked separately.
          const entryFile=path.join(dir,'user',args['--master']||'piratez','xpz-native-battle-entry.sav');
          const final=parseBattleUnits(fs.readFileSync(entryFile,'utf8'));
          row.score=scoreNativeTerminal(initial,final,result.nativeMissionOutcome);
          if(result.nativeMissionOutcome==='WON'){
            summary.finishWon++;
            if(row.score.zeroDeathNativeWin)summary.zeroDeathNativeWins++;
            if(row.score.zeroConsciousNativeWin)summary.zeroConsciousNativeWins++;
            if(row.score.zeroHpLossNativeWin)summary.zeroHpLossNativeWins++;
            if(row.score.zeroNetHpAndStunLossNativeWin)summary.zeroNetHpAndStunLossNativeWins++;
            const oldBest=summary.fewestDeadOfNativeWins===null?null:{
              dead:summary.fewestDeadOfNativeWins,
              unconscious:summary.fewestUnconsciousOfNativeWins,
              lostControl:summary.fewestLostControlOfNativeWins,
              netHpLoss:summary.lowestNetHpLossOfNativeWins,
              netStunIncrease:summary.lowestNetStunIncreaseOfNativeWins
            };
            if(betterNativeScore(row.score,oldBest)){
              summary.fewestDeadOfNativeWins=row.score.dead;
              summary.fewestUnconsciousOfNativeWins=row.score.unconscious;
              summary.fewestLostControlOfNativeWins=row.score.lostControl;
              summary.lowestNetHpLossOfNativeWins=row.score.netHpLoss;
              summary.lowestNetStunIncreaseOfNativeWins=row.score.netStunIncrease;
              summary.bestSeed=row.seed;summary.bestTrial=trial;
            }
          }else if(result.nativeMissionOutcome==='LOST')summary.finishLost++;
          else if(result.nativeMissionOutcome==='ABORTED')summary.finishedAborted++;
          else summary.nextStage++;
        }else summary.unfinished++;
        rows.push(row);
      }catch(e){
        summary.errors++;
        rows.push({plan:plan.name,trial,seed:seed||'PRESERVE_SAVE_RNG',
          nativeOutcome:'ERROR',error:String(e.message||e)});
        report.completedTrials=rows.length;persist();
        if(!continueOnError)throw e;
        continue;
      }
      report.completedTrials=rows.length;persist();
    }
    report.status=Object.values(tally).some(s=>s.errors)?'partially_failed'
      :Object.values(tally).some(s=>s.finishWon)?'native_wins_observed':'no_native_wins_observed';
  }catch(e){report.status='failed';report.error=String(e.message||e);persist();throw e;}
  verifyUnchanged(inputFiles);
  const finalResourceDigest=await fingerprintGameInputs(args);
  if(inputResources.sha256!==finalResourceDigest.sha256){
    report.status='failed';report.error='GAME_RESOURCES_CHANGED_DURING_BATCH';
    persist();throw new Error(report.error);
  }
  persist();
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const report=await runNativeBatch(parseBatchArgs(process.argv.slice(2)));
    console.log(JSON.stringify({backend:report.backend,status:report.status,completedTrials:report.completedTrials,
      byPlan:report.byPlan,parityCertified:false,battleVictoryCertified:false},null,2));
    if(report.status!=='native_wins_observed')process.exitCode=1;
  }catch(e){console.error('NATIVE_BATCH_FAILED: '+e.message);process.exitCode=1;}
}
