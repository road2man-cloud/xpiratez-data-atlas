#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Original OXCE multi-turn tactical beam exploration.
// The ONLY battle executor is runNative() -> the ORIGINAL OXCE C++ binary.
// This file generates action text and ranks ACTUAL saved unit/checkpoint states.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNative,parseArgs} from './run-native.mjs';
import {verifyRunEvidence} from './verify-native-replays.mjs';
import {parseBattleUnits,scoreNativeCheckpoint,scoreNativeTerminal} from './search-native.mjs';
import {writeNativeTurnPlans} from './generate-native-turn-plans.mjs';
import {sha256} from './prepare-native.mjs';

export const NATIVE_BEAM_MODE='ORIGINAL_OXCE_ACTUAL_SAVE_ONLY';
export function compareNativeSafety(a,b) {
  for(const k of ['dead','unconscious','lostControl','netHpLoss','netStunIncrease']){
    if(!Number.isInteger(a?.[k])||!Number.isInteger(b?.[k]))
      throw new Error('INVALID_NATIVE_SCORE_FOR_RANKING: '+k);
    if(a[k]!==b[k])return a[k]-b[k];
  }
  return 0;
}
export function parseNativeBeamArgs(argv){
  const rest=[];
  const cfg={depth:4,width:3,candidates:48,maxTrials:600,focusId:1,
    supportIds:null,baselineSave:null};
  const seen=new Set();
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(['--depth','--width','--candidates','--max-trials','--focus','--supports','--baseline-save'].includes(key)){
      if(seen.has(key))throw new Error('DUPLICATE_BEAM_OPTION: '+key);
      seen.add(key);
      const value=argv[++i];
      if(!value||value.startsWith('--'))throw new Error('MISSING_BEAM_OPTION_VALUE: '+key);
      if(key==='--baseline-save'){
        cfg.baselineSave=value;
      }else if(key==='--supports'){
        if(!/^\d+(?:,\d+)*$/.test(value))throw new Error('INVALID_SUPPORT_IDS');
        cfg.supportIds=value.split(',').map(Number);
        if(new Set(cfg.supportIds).size!==cfg.supportIds.length)throw new Error('DUPLICATE_SUPPORT_IDS');
      }else{
        if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))
          throw new Error('INVALID_BEAM_OPTION_VALUE: '+key);
        cfg[key==='--max-trials'?'maxTrials':
            key==='--focus'?'focusId':key.slice(2)]=Number(value);
      }
    }else rest.push(key);
  }
  if(cfg.depth<1||cfg.depth>25||cfg.width<1||cfg.width>20||
     cfg.candidates<1||cfg.candidates>1000||cfg.maxTrials<1||cfg.maxTrials>10000)
    throw new Error('BEAM_SEARCH_BOUNDS_EXCEEDED');
  if(cfg.supportIds?.some(n=>!Number.isSafeInteger(n)||n<0))
    throw new Error('INVALID_SUPPORT_ID');
  const args=parseArgs(rest);
  if(args['--plan']||args['--seed'])
    throw new Error('BEAM_PRESERVES_SAVED_RNG; --plan and --seed are unsupported');
  for(const f of ['--binary','--manifest','--data','--user','--config','--save','--out'])
    if(!args[f])throw new Error('BEAM_MISSING_REQUIRED_ARGUMENT: '+f);
  if(!args['--experimental'])throw new Error('BEAM_EXPERIMENTAL_NATIVE_REQUIRED');
  return {cfg,args};
}
export function dedupeAndRankNativeNodes(nodes,maxNodes) {
  if(!Number.isInteger(maxNodes)||maxNodes<1)throw new Error('INVALID_BEAM_WIDTH');
  const sorted=[...nodes].sort((a,b)=>{
    const d=compareNativeSafety(a.score,b.score);
    return d||a.trail.length-b.trail.length||a.id.localeCompare(b.id);
  });
  const ids=new Set(),list=[];
  for(const n of sorted){
    if(!/^[a-f0-9]{64}$/.test(n.snapshotSha256||''))
      throw new Error('INVALID_NATIVE_CHECKPOINT_HASH');
    if(ids.has(n.snapshotSha256))continue;
    ids.add(n.snapshotSha256);list.push(n);
    if(list.length>=maxNodes)break;
  }
  return list;
}
export async function runNativeBeam({cfg,args}){
  // Deliberate refusal to replay the game on the Windows source computer.
  if(process.platform!=='linux')throw new Error('GPT_LINUX_NATIVE_EXECUTION_REQUIRED');
  const root=path.resolve(args['--out']);
  if(fs.existsSync(root))throw new Error('BEAM_OUTPUT_ALREADY_EXISTS');
  const sourceSave=fs.realpathSync(args['--save']);
  const initialBytes=fs.readFileSync(sourceSave);
  const rootSaveSha256=sha256(initialBytes);
  const baseline=cfg.baselineSave?fs.realpathSync(cfg.baselineSave):sourceSave;
  const baselineBytes=fs.readFileSync(baseline);
  const baselineSha256=sha256(baselineBytes);
  const initial=parseBattleUnits(baselineBytes.toString('utf8'));
  const current=parseBattleUnits(initialBytes.toString('utf8'));
  const originalIds=x=>x.filter(u=>u.originalFaction===0).map(u=>u.id).sort((a,b)=>a-b);
  if(JSON.stringify(originalIds(initial))!==JSON.stringify(originalIds(current)))
    throw new Error('CAMPAIGN_BASELINE_ORIGINAL_ALLY_IDS_MISMATCH');
  const startTurnMatch=/^  turn:\s*(\d+)\s*$/m.exec(initialBytes.toString('utf8'));
  if(!startTurnMatch)throw new Error('TACTICAL_START_TURN_MISSING');
  const startTurn=Number(startTurnMatch[1]);
  if(!Number.isInteger(startTurn)||startTurn<1)throw new Error('INVALID_NATIVE_START_TURN');
  fs.mkdirSync(root,{recursive:true});
  const report={schema:1,backend:'OXCE_NATIVE',mode:NATIVE_BEAM_MODE,
    sourceSaveSha256:rootSaveSha256,baselineSaveSha256:baselineSha256,
    lossReference:cfg.baselineSave?'CAMPAIGN_ORIGINAL_SAVE':'INPUT_TURN_SAVE',startTurn,
    sourceRng:'PRESERVE_SAVE_RNG',parityCertified:false,battleVictoryCertified:false,
    cfg,status:'running',depthCompleted:0,trials:0,errors:0,
    winners:[],bestNativeWin:null,bestSafety:null,frontier:[],history:[]};
  const persist=()=>{
    const file=path.join(root,'native-beam-report.json');
    const tmp=file+'.pending';
    fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');
    fs.renameSync(tmp,file); // crash-safe replacement on the same filesystem
  };
  let frontier=[{id:'root',save:sourceSave,trail:[],score:null,
    snapshotSha256:rootSaveSha256,turn:startTurn}];
  const master=args['--master']||'piratez';
  persist();
  try{
    for(let depth=1;depth<=cfg.depth && frontier.length;depth++){
      const next=[];
      for(let n=0;n<frontier.length;n++){
        const parent=frontier[n];
        const nodeId='d'+String(depth).padStart(2,'0')+'n'+String(n).padStart(2,'0');
        const plansDir=path.join(root,'plans-'+nodeId);
        const manifest=writeNativeTurnPlans(parent.save,plansDir,{
          focusId:cfg.focusId,supportIds:cfg.supportIds,
          moveRadius:2,maxPlans:cfg.candidates,includeShots:true
        });
        for(let i=0;i<manifest.plans.length;i++){
          if(report.trials>=cfg.maxTrials)break;
          const p=manifest.plans[i],id=nodeId+'a'+String(i).padStart(4,'0');
          const dir=path.join(root,'trial-'+id);
          const command={...args,'--save':parent.save,
            '--plan':path.join(plansDir,p.name),'--out':dir};
          const record={id,depth,parentId:parent.id,plan:p.name,kind:p.kind,
            planSha256:p.sha256,inputSaveSha256:sha256(fs.readFileSync(parent.save)),
            observedOutcome:'ERROR'};
          report.trials++;
          try{
            const result=await runNative(command);
            verifyRunEvidence(dir,master);
            record.nativeFinished=result.nativeBattleFinished;
            record.observedOutcome=result.nativeMissionOutcome||'UNFINISHED';
            if(result.nativeBattleFinished){
              const entry=path.join(dir,'user',master,'xpz-native-battle-entry.sav');
              record.score=scoreNativeTerminal(initial,
                parseBattleUnits(fs.readFileSync(entry,'utf8')),result.nativeMissionOutcome);
              record.entrySaveSha256=sha256(fs.readFileSync(entry));
              if(result.nativeMissionOutcome==='WON'){
                record.nativeWinObserved=true;
                report.winners.push({id,depth,trail:[...parent.trail,p.name],
                  score:record.score,trial:dir});
                if(!report.bestNativeWin||compareNativeSafety(record.score,report.bestNativeWin.score)<0)
                  report.bestNativeWin=report.winners.at(-1);
              }
            }else{
              const cp=result.checkpoints.at(-1);
              const safety=scoreNativeCheckpoint(initial,cp,startTurn);
              if(!safety)throw new Error('NATIVE_NEXT_PLAYER_TURN_CHECKPOINT_REQUIRED');
              const snapshot=path.join(dir,'user',master,cp.file);
              record.snapshotSha256=sha256(fs.readFileSync(snapshot));
              if(record.snapshotSha256!==cp.snapshotSha256)
                throw new Error('NATIVE_CHECKPOINT_CHANGED_AFTER_VERIFICATION');
              record.score=safety;
              next.push({id,save:snapshot,trail:[...parent.trail,p.name],
                score:safety,snapshotSha256:record.snapshotSha256,turn:cp.turn});
              if(!report.bestSafety||compareNativeSafety(safety,report.bestSafety.score)<0)
                report.bestSafety={id,depth,score:safety,trial:dir,trail:[...parent.trail,p.name]};
            }
          }catch(e){
            report.errors++;
            record.error=String(e.message||e);
          }
          report.history.push(record);
          persist();
          if(report.bestNativeWin?.score.zeroNetHpAndStunLossNativeWin)break;
        }
        if(report.trials>=cfg.maxTrials||report.bestNativeWin?.score.zeroNetHpAndStunLossNativeWin)break;
      }
      frontier=dedupeAndRankNativeNodes(next,cfg.width);
      report.frontier=frontier.map(n=>({id:n.id,turn:n.turn,score:n.score,
        snapshotSha256:n.snapshotSha256,trail:n.trail,trialSave:n.save}));
      report.depthCompleted=depth;
      persist();
      if(report.trials>=cfg.maxTrials||report.bestNativeWin?.score.zeroNetHpAndStunLossNativeWin)
        break;
    }
    if(sha256(fs.readFileSync(sourceSave))!==rootSaveSha256 ||
       sha256(fs.readFileSync(baseline))!==baselineSha256)
      throw new Error('ORIGINAL_SOURCE_OR_CAMPAIGN_BASELINE_SAVE_CHANGED');
    report.status=report.bestNativeWin?'ORIGINAL_NATIVE_WIN_OBSERVED':
      report.trials===report.errors?'ALL_NATIVE_TRIALS_FAILED':
      report.trials>=cfg.maxTrials?'BOUNDED_NATIVE_EXPLORATION_INCOMPLETE':
      report.errors?'PARTIAL_NATIVE_TRIAL_FAILURES_NO_WIN':'NO_NATIVE_WIN_OBSERVED';
  }catch(e){
    report.status='FAILED';report.failure=String(e.message||e);
    persist();throw e;
  }
  persist();
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const r=await runNativeBeam(parseNativeBeamArgs(process.argv.slice(2)));
    console.log(JSON.stringify({backend:r.backend,mode:r.mode,status:r.status,
      trials:r.trials,errors:r.errors,depthCompleted:r.depthCompleted,
      winners:r.winners.length,bestNativeWin:r.bestNativeWin?.score||null,
      bestSafety:r.bestSafety?.score||null,parityCertified:false},null,2));
  }catch(e){console.error('NATIVE_BEAM_SEARCH_FAILED: '+String(e.message||e));process.exitCode=1;}
}
