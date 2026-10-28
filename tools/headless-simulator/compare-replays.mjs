#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Compares native checkpoint artifacts; does not simulate or infer victory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function compare(a,b){
  for(const r of [a,b]){
    if(r.backend!=='OXCE_NATIVE'||(r.planCompleted!==true&&r.nativeBattleFinished!==true)||!Array.isArray(r.checkpoints)||!r.checkpoints.length)throw new Error('COMPLETE_NATIVE_REPLAY_REQUIRED');
    if(r.nativeBattleFinished===true&&(!/^[a-f0-9]{64}$/.test(r.nativeEntrySnapshotSha256||'')||
      !/^[a-f0-9]{64}$/.test(r.nativeFinishSnapshotSha256||'')||!['WON','LOST','ABORTED','NEXT_STAGE','PREVIEW'].includes(r.nativeMissionOutcome)))
      throw new Error('VALID_NATIVE_FINISH_SNAPSHOT_REQUIRED');
  }
  for(const k of ['sourceTreeSha256','driverSha256','archiveSha256','clockPatchSha256','outcomePatchSha256','binarySha256','planSha256','configSha256','inputSaveSha256']) {
    if(!/^[a-f0-9]{64}$/.test(a[k]||'') || !/^[a-f0-9]{64}$/.test(b[k]||''))throw new Error('REPLAY_FINGERPRINT_MISSING: '+k);
    if(a[k]!==b[k])throw new Error('INCOMPARABLE_INPUT: '+k);
  }
  for(const r of [a,b]) {
    if(!Object.hasOwn(r,'runtimeManifestSha256')||(r.runtimeManifestSha256!==null&&!/^[a-f0-9]{64}$/.test(r.runtimeManifestSha256)))
      throw new Error('REPLAY_RUNTIME_IDENTITY_MISSING');
    if(!['dummy','xvfb'].includes(r.display))throw new Error('REPLAY_DISPLAY_IDENTITY_MISSING');
  }
  for(const k of ['runtimeManifestSha256','display'])if(a[k]!==b[k])throw new Error('INCOMPARABLE_INPUT: '+k);
  if(a.seed!==b.seed || a.seed==null)throw new Error('INCOMPARABLE_INPUT: seed');
  const differences=[];
  for(const k of ['planCompleted','nativeBattleFinished','nativeMissionOutcome','nativeBattleWonObserved','nativeEntrySnapshotSha256','nativeFinishSnapshotSha256'])
    if(a[k]!==b[k])differences.push({field:k,left:a[k],right:b[k]});
  if(a.checkpoints.length!==b.checkpoints.length)differences.push({field:'checkpointCount',left:a.checkpoints.length,right:b.checkpoints.length});
  for(let i=0;i<Math.min(a.checkpoints.length,b.checkpoints.length);i++){
    const x=a.checkpoints[i],y=b.checkpoints[i];
    for(const k of ['phase','turn','side','rng','command_index','snapshotSha256'])
      if(!Object.hasOwn(x,k)||!Object.hasOwn(y,k)||x[k]!==y[k])differences.push({checkpoint:i,field:k,left:x[k],right:y[k]});
  }
  return {nativeReplayIdentical:differences.length===0,comparedCheckpoints:Math.min(a.checkpoints.length,b.checkpoints.length),interactiveParityCertified:false,differences};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [a,b]=process.argv.slice(2);if(!a||!b)throw new Error('Usage: node compare-replays.mjs RUN_A/replay-result.json RUN_B/replay-result.json');const r=compare(JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8')));console.log(JSON.stringify(r,null,2));if(!r.nativeReplayIdentical)process.exitCode=1;}
  catch(e){console.error(e.message);process.exitCode=1;}
}
