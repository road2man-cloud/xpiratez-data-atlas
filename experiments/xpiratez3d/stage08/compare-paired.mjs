#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Side-by-side full native OXCE state verifier: known observability patch only.
// Never report victory or GUI-equivalence from synthetic or incomplete data.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyBuildPair} from './build-paired.mjs';
const fullHash=x=>typeof x==='string' && /^[a-f0-9]{64}$/.test(x);
function requireOK(value,reason){if(!value)throw new Error(reason);}
function json(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function validResult(a,label){
  requireOK(a && a.backend==='OXCE_NATIVE' && a.planCompleted===true,label+': INCOMPLETE_NATIVE_RUN');
  requireOK(a.parityCertified===false && a.battleVictoryCertified===false,label+': PREMATURE_CERTIFICATION');
  requireOK(Array.isArray(a.checkpoints)&&a.checkpoints.length>0,label+': NO_NATIVE_CHECKPOINTS');
  for(const name of ['sourceTreeSha256','driverSha256','archiveSha256','binarySha256',
    'planSha256','configSha256','inputSaveSha256']){
    requireOK(fullHash(a[name]),label+': MISSING_HASH_'+name);
  }
  requireOK(a.clockPolicy==='fixed-1ms-v1',label+': REQUIRES_FIXED_CLOCK');
  requireOK(fullHash(a.clockAdapterSha256),label+': CLOCK_HASH_MISSING');
  requireOK(a.seed==='PRESERVE_SAVE_RNG'||/^[1-9][0-9]*$/.test(a.seed||''),label+': SEED_MISSING');
  a.checkpoints.forEach((c,i)=>{
    for(const k of ['phase','turn','side','rng','command_index','snapshotSha256'])
      requireOK(Object.hasOwn(c,k),label+': CHECKPOINT_'+i+'_MISSING_'+k);
    requireOK(fullHash(c.snapshotSha256),label+': CHECKPOINT_'+i+'_HASH_MISSING');
  });
}
export function compareControlAndObserver(controlBuild,observedBuild,control,observed,options={}) {
  // An observed engine has a DIFFERENT binary hash. Do NOT use native
  // compare-replays.mjs and bypass its same-binary requirement.
  const pair=verifyBuildPair(controlBuild,observedBuild);
  validResult(control,'control');
  validResult(observed,'observer');
  requireOK(!options.requireImpact || Number.isInteger(options.impacts) && options.impacts>0,
            'REQUIRED_ACTUAL_HIT_EVENT_MISSING');
  const inputs=['sourceTreeSha256','archiveSha256','clockAdapterSha256','clockPolicy',
    'planSha256','configSha256','inputSaveSha256','seed'];
  for(const key of inputs) requireOK(control[key]===observed[key],'INPUT_DIFFERENCE_'+key);
  requireOK(control.driverSha256===pair.baseDriverSha256,'BASE_DRIVER_NOT_MATCHED');
  requireOK(observed.driverSha256===pair.observerDriverSha256,'OBSERVED_DRIVER_NOT_MATCHED');
  requireOK(control.binarySha256===pair.controlBinarySha256,'BASE_BINARY_NOT_MATCHED');
  requireOK(observed.binarySha256===pair.observerBinarySha256,'OBSERVED_BINARY_NOT_MATCHED');
  requireOK(control.checkpoints.length===observed.checkpoints.length,'CHECKPOINT_COUNT_DIFFERENCE');
  const differences=[];
  for(let i=0;i<control.checkpoints.length;i++){
    const c=control.checkpoints[i],o=observed.checkpoints[i];
    for(const key of ['phase','turn','side','rng','command_index','snapshotSha256'])
      if(c[key]!==o[key])differences.push({index:i,key,control:c[key],observer:o[key]});
  }
  const complete=differences.length===0;
  return {
    schema:1,comparison:'original-oxce-control-versus-instrumented-original',
    inputsComparable:true,actualNativeRunRequired:true,
    nativeBattleStateBitwiseIdentical:complete,checkpointsCompared:control.checkpoints.length,
    observedHitEvents:options.impacts??null,hitRequirementSatisfied:!options.requireImpact||options.impacts>0,
    interactiveParityCertified:false,battleVictoryCertified:false,
    differences,baseBinarySha256:pair.controlBinarySha256,
    observedBinarySha256:pair.observerBinarySha256,observerPatchSha256:pair.observerPatchSha256
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [buildDir,controlDir,observedDir,reportPath]=process.argv.slice(2);
    if(!buildDir||!controlDir||!observedDir)throw new Error('Usage: node compare-paired.mjs BUILD_PAIR_DIR CONTROL_RUN_DIR OBSERVER_RUN_DIR [report.json]');
    const control=json(path.join(controlDir,'replay-result.json'));
    const observed=json(path.join(observedDir,'replay-result.json'));
    const controlBuild=json(path.join(buildDir,'control/bundle/native-build.json'));
    const observedBuild=json(path.join(buildDir,'observer/bundle/native-build.json'));
    const originalTrace=fs.readFileSync(path.join(observedDir,'native-events.jsonl'),'utf8');
    const actualEvents=originalTrace.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    const impactEvents=actualEvents.filter(e=>e.event==='xp3d_hit_voxel');
    if(actualEvents.some(e=>e.event==='error'))throw new Error('NATIVE_TRACE_ERROR_EVENT');
    const summary=compareControlAndObserver(controlBuild,observedBuild,control,observed,{
      requireImpact:true,impacts:impactEvents.length
    });
    if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(summary,null,2)+'\n');
    console.log(JSON.stringify(summary,null,2));
    if(!summary.nativeBattleStateBitwiseIdentical)process.exitCode=2;
  }catch(e){console.error('STAGE08_COMPARE_REJECTED:',e.message);process.exitCode=1;}
}
