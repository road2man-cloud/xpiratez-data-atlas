// Exhaustively replay all published origin candidates in independent
// parallel shards. A shard failure, missing shard, or count mismatch fails
// the build. No stored steps, signatures, or verifier rules are changed.
import fs from 'node:fs';
import os from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {decodeOriginReport} from './origin-report-codec.mjs';

const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
assert.equal(report.records.length,72);
assert.equal(new Set(report.records.map(r=>r.profileId)).size,72);
assert.equal(report.summary.certifiedMaxima,0);
// Keep the expensive 4,494 chronological replays distributed across
// balanced, deterministic work shards. Cap concurrent Node processes to
// prevent Windows/CI memory contention from making a few shards time out.
const shardCount=Math.min(12,report.records.length);
const concurrency=Math.min(shardCount,Math.max(1,os.availableParallelism()),6);
async function verifyShard(index){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,
      ['tools/build-soldier-origin-candidates.mjs','--check',`--check-shard=${index}/${shardCount}`],
      {cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',text=>stdout+=text);
    child.stderr.on('data',text=>stderr+=text);
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0)return reject(Error(`shard ${index}/${shardCount} exited ${code}: ${stderr.slice(-2000)}`));
      const matched=stdout.match(/PASS origin provisional registry: 72 original profiles, (\d+) conditional witnesses in shard (\d+)\/(\d+); no fake research flags or certified maxima/);
      if(!matched||Number(matched[2])!==index||Number(matched[3])!==shardCount)
        return reject(Error(`Malformed shard ${index} proof: ${stdout.slice(-1000)}`));
      console.log('PASS independent shard '+index+'/'+shardCount+': '+matched[1]+' replayed witnesses');
      resolve(Number(matched[1]));
    });
  });
}
const counts=Array(shardCount).fill(null);
let next=0;
await Promise.all(Array.from({length:concurrency},async()=>{
  while(next<shardCount){
    const index=next++;
    counts[index]=await verifyShard(index);
  }
}));
assert(counts.every(Number.isSafeInteger),'A witness replay shard did not finish');
const checked=counts.reduce((n,c)=>n+c,0);
assert.equal(checked,report.summary.totalWitnessEvidence||report.summary.witnesses,
  'Sharded replay did not cover all comparison candidates and historical counterexamples');
console.log('PASS origin provisional registry: '+report.records.length+' separate birth profiles, '+
  report.summary.witnesses+' comparison candidates and '+(report.summary.archivedWitnesses||0)+
  ' archived counterexamples ('+checked+' numerical replays) in '+shardCount+
  ' balanced shards with '+concurrency+' parallel workers, 0 certified maxima; all counts match published records');
