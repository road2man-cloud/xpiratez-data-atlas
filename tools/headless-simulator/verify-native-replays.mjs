#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Repeated ORIGINAL OXCE process executions plus strict evidence comparison.
// No combat model, fallback engine, victory estimator, or RNG implementation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs, preflight, runNative} from './run-native.mjs';
import {compare} from './compare-replays.mjs';
import {sha256} from './prepare-native.mjs';

export function parseVerificationArgs(argv) {
  const rest=[]; let repetitions=3, found=false;
  for(let i=0;i<argv.length;i++) {
    if(argv[i]!=='--repetitions') { rest.push(argv[i]); continue; }
    if(found)throw new Error('DUPLICATE_ARGUMENT: --repetitions');
    found=true;
    const value=argv[++i];
    if(!/^[0-9]+$/.test(value||''))throw new Error('INVALID_REPETITIONS');
    repetitions=Number(value);
  }
  if(!Number.isSafeInteger(repetitions)||repetitions<2||repetitions>20)
    throw new Error('REPETITIONS_MUST_BE_2_TO_20: this is exact replay verification, not tactical sampling');
  return {repetitions,args:parseArgs(rest)};
}

async function fileDigest(file) {
  const hash=crypto.createHash('sha256');
  for await(const bytes of fs.createReadStream(file))hash.update(bytes);
  return hash.digest('hex');
}
export async function fingerprintGameInputs(args) {
  // Includes actual bytes of input resources, not just file paths or mtimes.
  // Snapshot checks are local only; never upload this list or private assets.
  const roots=[['data',fs.realpathSync(args['--data'])]];
  const mods=path.join(fs.realpathSync(args['--user']),'mods');
  if(fs.existsSync(mods))roots.push(['user-mods',fs.realpathSync(mods)]);
  const overall=crypto.createHash('sha256'); let files=0,bytes=0;
  async function visit(root,relative,label) {
    for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      const rel=path.posix.join(relative,entry.name), file=path.join(root,rel);
      if(entry.isSymbolicLink())throw new Error('RESOURCE_SYMLINK_NOT_VERIFIED: '+rel);
      if(entry.isDirectory())await visit(root,rel,label);
      else if(entry.isFile()) {
        const digest=await fileDigest(file), size=fs.statSync(file).size;
        overall.update(JSON.stringify([label,rel,size,digest])+'\n'); files++; bytes+=size;
      } else throw new Error('UNSUPPORTED_RESOURCE_FILE: '+rel);
    }
  }
  for(const [label,root] of roots)await visit(root,'',label);
  if(!files)throw new Error('NO_GAME_RESOURCE_FILES');
  return {sha256:overall.digest('hex'),files,bytes};
}

export function verifyRunEvidence(directory,master='piratez') {
  if(!/^[A-Za-z0-9_-]+$/.test(master))throw new Error('INVALID_MASTER_ID');
  const result=JSON.parse(fs.readFileSync(path.join(directory,'replay-result.json'),'utf8'));
  if(result.backend!=='OXCE_NATIVE'||result.planCompleted!==true||!Array.isArray(result.checkpoints)||!result.checkpoints.length)
    throw new Error('COMPLETE_NATIVE_REPLAY_REQUIRED');
  const events=fs.readFileSync(path.join(directory,'native-events.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
  if(events[0]?.event!=='native_ready'||events[0]?.backend!=='OXCE_NATIVE'||events.at(-1)?.event!=='plan_completed'||events.some(e=>e.event==='error'))
    throw new Error('NATIVE_EVENT_LOG_INCOMPLETE');
  const actual=events.filter(e=>e.event==='checkpoint');
  if(actual.length!==result.checkpoints.length)throw new Error('NATIVE_EVENT_COUNT_MISMATCH');
  for(let i=0;i<actual.length;i++) {
    const c=result.checkpoints[i],e=actual[i];
    const {snapshotSha256,...logged}=c;
    if(JSON.stringify(logged)!==JSON.stringify(e))throw new Error('NATIVE_EVENT_CONTENT_MISMATCH: '+i);
    if(!/^xpz-native-[0-9]+\.sav$/.test(c.file||'')||!/^[a-f0-9]{64}$/.test(snapshotSha256||''))
      throw new Error('INVALID_CHECKPOINT_REFERENCE');
    const file=path.join(directory,'user',master,c.file);
    if(!fs.lstatSync(file).isFile()||sha256(fs.readFileSync(file))!==snapshotSha256)
      throw new Error('CHECKPOINT_BYTES_CHANGED: '+c.file);
  }
  return result;
}

export function summarizeComparisons(results,requested) {
  if(results.length<2||results.length!==requested)throw new Error('ALL_REQUESTED_REPLAYS_REQUIRED');
  const comparisons=results.slice(1).map((r,i)=>({leftRun:1,rightRun:i+2,...compare(results[0],r)}));
  return {nativeReplayIdentical:comparisons.every(r=>r.nativeReplayIdentical),comparisons,
    coverage:results.map((r,i)=>({run:i+1,checkpoints:r.checkpoints.length,
      startTurn:r.checkpoints[0].turn,endTurn:r.checkpoints.at(-1).turn,
      startSide:r.checkpoints[0].side,endSide:r.checkpoints.at(-1).side,
      startRng:r.checkpoints[0].rng,endRng:r.checkpoints.at(-1).rng})),
    interactiveParityCertified:false,battleVictoryCertified:false};
}

export async function verifyRepeatedNative(args,repetitions=3) {
  if(process.platform!=='linux')throw new Error('GPT_LINUX_EXECUTION_REQUIRED');
  if(!Number.isSafeInteger(repetitions)||repetitions<2||repetitions>20)throw new Error('INVALID_REPETITIONS');
  if(!args['--out'])throw new Error('REQUIRED_ARGUMENT: --out');
  const root=path.resolve(args['--out']);
  if(fs.existsSync(root))throw new Error('OUTPUT_ALREADY_EXISTS');
  // All ordinary runner checks happen BEFORE creating any output.
  preflight({...args,'--out':path.join(root,'run-0001')});
  const pinned={save:sha256(fs.readFileSync(args['--save'])),plan:sha256(fs.readFileSync(args['--plan'])),config:sha256(fs.readFileSync(args['--config']))};
  fs.mkdirSync(root,{recursive:true});
  const report={schema:1,backend:'OXCE_NATIVE',kind:'REPEATED_FULL_CHECKPOINT_BYTES',status:'running',
    requestedReplays:repetitions,completedReplays:0,nativeReplayIdentical:null,
    interactiveParityCertified:false,battleVictoryCertified:false,runs:[]};
  const output=path.join(root,'verification.json');
  const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  persist();
  try {
    report.inputResources=await fingerprintGameInputs(args); persist();
    const results=[];
    for(let i=0;i<repetitions;i++) {
      const runDir=path.join(root,'run-'+String(i+1).padStart(4,'0'));
      // Only runNative can produce the engine evidence. No injectable substitute.
      await runNative({...args,'--out':runDir});
      const result=verifyRunEvidence(runDir,args['--master']||'piratez');
      for(const [name,key] of [['save','inputSaveSha256'],['plan','planSha256'],['config','configSha256']]) {
        if(result[key]!==pinned[name]||sha256(fs.readFileSync(args['--'+name]))!==pinned[name])
          throw new Error('REPLAY_INPUT_CHANGED: '+name);
      }
      const current=await fingerprintGameInputs(args);
      if(current.sha256!==report.inputResources.sha256)throw new Error('GAME_RESOURCES_CHANGED');
      results.push(result);
      report.runs.push({run:i+1,directory:path.basename(runDir),checkpointCount:result.checkpoints.length,
        resultSha256:sha256(fs.readFileSync(path.join(runDir,'replay-result.json')))});
      report.completedReplays=results.length; persist();
    }
    Object.assign(report,summarizeComparisons(results,repetitions));
    report.status=report.nativeReplayIdentical?'passed':'mismatch';
  } catch(error) {
    report.status='failed';report.error=String(error.message||error);report.nativeReplayIdentical=null;
    persist(); throw error;
  }
  persist();return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {args,repetitions}=parseVerificationArgs(process.argv.slice(2));
    const report=await verifyRepeatedNative(args,repetitions);
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='passed')process.exitCode=1;
  } catch(error) {console.error('NATIVE_VERIFICATION_FAILED: '+error.message);process.exitCode=1;}
}
