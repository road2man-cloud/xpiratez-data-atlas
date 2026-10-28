#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Compares native checkpoint artifacts; does not simulate or infer victory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function compare(a,b){
  for(const r of [a,b])if(r.backend!=='OXCE_NATIVE'||r.planCompleted!==true||!Array.isArray(r.checkpoints)||!r.checkpoints.length)throw new Error('COMPLETE_NATIVE_REPLAY_REQUIRED');
  for(const k of ['sourceTreeSha256','driverSha256','archiveSha256','binarySha256','planSha256','configSha256','inputSaveSha256']) {
    if(!/^[a-f0-9]{64}$/.test(a[k]||'') || !/^[a-f0-9]{64}$/.test(b[k]||''))throw new Error('REPLAY_FINGERPRINT_MISSING: '+k);
    if(a[k]!==b[k])throw new Error('INCOMPARABLE_INPUT: '+k);
  }
  if(a.seed!==b.seed || a.seed==null)throw new Error('INCOMPARABLE_INPUT: seed');
  // Missing policy is allowed only for legacy wall-clock results. A fixed-clock
  // run cannot be compared with them or with a differently patched binary.
  const clockPolicy=a.clockPolicy??'wall-clock';
  const otherPolicy=b.clockPolicy??'wall-clock';
  if(!['wall-clock','fixed-1ms-v1'].includes(clockPolicy)||!['wall-clock','fixed-1ms-v1'].includes(otherPolicy))
    throw new Error('UNKNOWN_REPLAY_CLOCK_POLICY');
  if(clockPolicy!==otherPolicy)throw new Error('INCOMPARABLE_INPUT: clockPolicy');
  if(clockPolicy==='fixed-1ms-v1'||a.clockAdapterSha256||b.clockAdapterSha256){
    if(!/^[a-f0-9]{64}$/.test(a.clockAdapterSha256||'')||!/^[a-f0-9]{64}$/.test(b.clockAdapterSha256||''))
      throw new Error('REPLAY_FINGERPRINT_MISSING: clockAdapterSha256');
    if(a.clockAdapterSha256!==b.clockAdapterSha256)throw new Error('INCOMPARABLE_INPUT: clockAdapterSha256');
  }
  const differences=[];
  if(a.checkpoints.length!==b.checkpoints.length)differences.push({field:'checkpointCount',left:a.checkpoints.length,right:b.checkpoints.length});
  for(let i=0;i<Math.min(a.checkpoints.length,b.checkpoints.length);i++){
    const x=a.checkpoints[i],y=b.checkpoints[i];
    for(const k of ['phase','turn','side','rng','command_index','snapshotSha256'])
      if(!Object.hasOwn(x,k)||!Object.hasOwn(y,k)||x[k]!==y[k])differences.push({checkpoint:i,field:k,left:x[k],right:y[k]});
  }
  return {nativeReplayIdentical:differences.length===0,clockPolicy,comparedCheckpoints:Math.min(a.checkpoints.length,b.checkpoints.length),interactiveParityCertified:false,differences};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [a,b]=process.argv.slice(2);if(!a||!b)throw new Error('Usage: node compare-replays.mjs RUN_A/replay-result.json RUN_B/replay-result.json');const r=compare(JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8')));console.log(JSON.stringify(r,null,2));if(!r.nativeReplayIdentical)process.exitCode=1;}
  catch(e){console.error(e.message);process.exitCode=1;}
}
