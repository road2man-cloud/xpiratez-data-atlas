#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Compares native checkpoint artifacts; does not simulate or infer victory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function compare(a,b){
  for(const r of [a,b])if(r.backend!=='OXCE_NATIVE'||r.planCompleted!==true||!Array.isArray(r.checkpoints)||!r.checkpoints.length)throw new Error('COMPLETE_NATIVE_REPLAY_REQUIRED');
  for(const k of ['sourceTreeSha256','inputSaveSha256'])if(a[k]!==b[k])throw new Error('INCOMPARABLE_INPUT: '+k);
  const differences=[];
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
