#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Two ORIGINAL OXCE runs. No combat math outside OXCE. No Windows battle run.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNative} from '../../../tools/headless-simulator/run-native.mjs';
import {verifyBuildPair} from './build-paired.mjs';
import {compareControlAndObserver} from './compare-paired.mjs';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const args=process.argv.slice(2);
function input(){
  const flags=new Set(['--xvfb']),names=new Set(['--build','--data','--user','--config','--save',
    '--plan','--out','--seed','--timeout','--runtime']);
  const result={};
  for(let i=0;i<args.length;i++){
    const item=args[i];
    if(Object.hasOwn(result,item))throw new Error('DUPLICATE_ARG: '+item);
    if(flags.has(item)){result[item]=true;continue;}
    if(!names.has(item)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('MISSING_OR_UNKNOWN_ARG: '+item);
    result[item]=args[++i];
  }
  for(const name of ['--build','--data','--user','--config','--save','--plan','--out'])
    if(!result[name])throw new Error('REQUIRED_ARG: '+name);
  return result;
}
export async function launchPair(a){
  if(process.platform!=='linux')throw new Error('GPT_LINUX_ORIGINAL_BATTLE_REQUIRED');
  const base=path.resolve(a['--build']),out=path.resolve(a['--out']);
  if(fs.existsSync(out))throw new Error('NEW_OUTPUT_REQUIRED');
  const left=json(path.join(base,'control/bundle/native-build.json'));
  const right=json(path.join(base,'observer/bundle/native-build.json'));
  const pair=verifyBuildPair(left,right);
  const common={
    '--experimental':true,'--fixed-clock':true,
    '--data':a['--data'],'--user':a['--user'],'--config':a['--config'],
    '--save':a['--save'],'--plan':a['--plan']
  };
  for(const optional of ['--xvfb','--runtime','--seed','--timeout'])
    if(a[optional]!=null)common[optional]=a[optional];
  fs.mkdirSync(out,{recursive:true});
  const controlArgs={...common,'--binary':path.join(base,'control/bundle/oxce-native'),
    '--manifest':path.join(base,'control/bundle/native-build.json'),
    '--out':path.join(out,'control')};
  const observedArgs={...common,'--binary':path.join(base,'observer/bundle/oxce-native'),
    '--manifest':path.join(base,'observer/bundle/native-build.json'),
    '--out':path.join(out,'observer')};
  // Explicitly prevent the original engine from inheriting an observer flag.
  // No simultaneous runs because parent process env is set only for each launch.
  const previous=process.env.XPZ_NATIVE_IMPACT_TRACE;
  let control,observed;
  try{
    delete process.env.XPZ_NATIVE_IMPACT_TRACE;
    control=await runNative(controlArgs);
    process.env.XPZ_NATIVE_IMPACT_TRACE='1';
    observed=await runNative(observedArgs);
  } finally {
    if(previous===undefined)delete process.env.XPZ_NATIVE_IMPACT_TRACE;
    else process.env.XPZ_NATIVE_IMPACT_TRACE=previous;
  }
  const tracePath=path.join(out,'observer/native-events.jsonl');
  const actualEvents=fs.readFileSync(tracePath,'utf8').trim().split(/\r?\n/).map(x=>JSON.parse(x));
  if(actualEvents.some(x=>x.event==='error'))throw new Error('NATIVE_OBSERVER_REPORTED_ERROR');
  const hits=actualEvents.filter(x=>x.event==='xp3d_hit_voxel');
  const report=compareControlAndObserver(left,right,control,observed,{
    requireImpact:true,impacts:hits.length
  });
  const manifest={...report,
    controlOriginalTrace:fs.existsSync(path.join(out,'control/native-events.jsonl')),
    observerOriginalTrace:true,
    pairedBuildControlBinarySha256:pair.controlBinarySha256,
    pairedBuildObservedBinarySha256:pair.observerBinarySha256,
    gameAssetDataStoredInBundle:false,interactiveParityCertified:false,battleVictoryCertified:false};
  fs.writeFileSync(path.join(out,'pair-battle-result.json'),JSON.stringify(manifest,null,2)+'\n');
  if(!report.nativeBattleStateBitwiseIdentical)throw new Error('NATIVE_BATTLE_FULL_CHECKPOINT_MISMATCH');
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const result=await launchPair(input());
    console.log(JSON.stringify(result,null,2));
  } catch(e){console.error('STAGE08_ORIGINAL_BATTLE_NOT_CERTIFIED:',e.message);process.exitCode=1;}
}
