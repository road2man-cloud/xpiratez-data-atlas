#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Repeat ACTUAL native OXCE replays. This script has no combat formulas or AI.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNative,preflight} from './run-native.mjs';

export function parseBatchArgs(argv) {
  const boolean=new Set(['--experimental','--xvfb']);
  const valued=new Set(['--binary','--manifest','--data','--user','--config',
    '--save','--plan','--plans','--out','--master','--timeout','--runtime',
    '--checkpoint-mode','--seeds','--repeat']);
  const args={};
  for(let i=0;i<argv.length;i++){
    const name=argv[i];
    if(Object.hasOwn(args,name))throw new Error('DUPLICATE_ARGUMENT: '+name);
    if(boolean.has(name))args[name]=true;
    else if(valued.has(name) && argv[i+1] && !argv[i+1].startsWith('--'))
      args[name]=argv[++i];
    else throw new Error('INVALID_BATCH_ARGUMENT: '+name);
  }
  if (Boolean(args['--plan'])===Boolean(args['--plans']))
    throw new Error('ONE_OF_PLAN_OR_PLANS_REQUIRED');
  const repeat=Number(args['--repeat']||'1');
  if(!Number.isSafeInteger(repeat)||repeat<1||repeat>10000)
    throw new Error('INVALID_REPEAT_COUNT');
  const seeds=(args['--seeds']||'save').split(',').map(s=>s.trim());
  if(!seeds.length||seeds.some(s=>s!== 'save' &&
      (!/^[1-9][0-9]*$/.test(s)||BigInt(s)>18446744073709551615n)))
    throw new Error('INVALID_NATIVE_SEED_LIST');
  if(new Set(seeds).size!==seeds.length)
    throw new Error('DUPLICATE_SEED_IN_LIST');
  return {...args,repeat,seeds};
}
export function collectPlans(args) {
  if(args['--plan'])return [fs.realpathSync(args['--plan'])];
  const dir=fs.realpathSync(args['--plans']);
  const plans=fs.readdirSync(dir).filter(name=>name.endsWith('.actions')).sort()
    .map(name=>path.join(dir,name));
  if(!plans.length)throw new Error('NO_ACTION_PLANS');
  return plans;
}
export async function runBatch(a){
  const plans=collectPlans(a);
  const total=plans.length*a.seeds.length*a.repeat;
  if(total>10000)throw new Error('BATCH_RUN_LIMIT_EXCEEDED');
  const out=path.resolve(a['--out']||'');
  if(!a['--out'] || fs.existsSync(out))throw new Error('FRESH_BATCH_OUT_REQUIRED');
  const first={...a,'--plan':plans[0],'--out':path.join(out,'runs','00001')};
  delete first['--plans'];delete first['--seeds'];delete first['--repeat'];
  preflight(first);
  fs.mkdirSync(path.join(out,'runs'),{recursive:true});
  const summary={schema:1,backend:'OXCE_NATIVE',parityCertified:false,
    battleVictoryCertified:false,independentTrials:false,
    note:'Only explicit, original-engine battle_finished events count as resolved. A plan completing is not victory.',
    requested:total,completed:0,finished:0,withSurvivors:0,withoutSurvivors:0,
    aborted:0,unresolved:0,errors:0,runs:[]};
  const pathSummary=path.join(out,'batch-result.json');
  let seq=0;
  for(const plan of plans){
    for(const seed of a.seeds){
      for(let trial=0;trial<a.repeat;trial++){
        const id=String(++seq).padStart(5,'0');
        const one={...first,'--plan':plan,'--out':path.join(out,'runs',id)};
        if(seed==='save')delete one['--seed'];
        else one['--seed']=seed;
        const entry={id,plan:path.basename(plan),seed:seed==='save'?'PRESERVE_SAVE_RNG':seed,trial:trial+1};
        try {
          const result=await runNative(one);
          Object.assign(entry,{status:'ok',planCompleted:result.planCompleted,
            battleEnded:result.battleEnded,nativeOutcome:result.nativeOutcome,
            resultFile:path.join('runs',id,'replay-result.json')});
          summary.completed++;
          if(result.battleEnded) {
            summary.finished++;
            if(result.nativeOutcome==='FINISHED_WITH_SURVIVORS')summary.withSurvivors++;
            else if(result.nativeOutcome==='FINISHED_WITHOUT_SURVIVORS')summary.withoutSurvivors++;
            else if(result.nativeOutcome==='ABORTED')summary.aborted++;
          } else summary.unresolved++;
        } catch(error) {
          entry.status='error';entry.error=String(error.message||error);
          summary.errors++;
        }
        summary.runs.push(entry);
        // Durable progress after EACH native run, even on failure.
        const next=pathSummary+'.next';
        fs.writeFileSync(next,JSON.stringify(summary,null,2)+'\n');
        fs.renameSync(next,pathSummary);
        console.log(JSON.stringify(entry));
      }
    }
  }
  return summary;
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    const result=await runBatch(parseBatchArgs(process.argv.slice(2)));
    console.log(JSON.stringify({requested:result.requested,completed:result.completed,
      finished:result.finished,unresolved:result.unresolved,errors:result.errors,
      parityCertified:false,battleVictoryCertified:false},null,2));
    if(result.errors)process.exitCode=1;
  } catch(error){console.error('NATIVE_BATCH_ERROR: '+error.message);process.exitCode=1;}
}
