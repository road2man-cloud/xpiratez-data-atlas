// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic evidence-validator tests ONLY. No game, AI or combat is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {sha256} from './prepare-native.mjs';
import {compare} from './compare-replays.mjs';
import {parseVerificationArgs,fingerprintGameInputs,verifyRunEvidence,summarizeComparisons,verifyRepeatedNative} from './verify-native-replays.mjs';

function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-validator-fixture-'));
  fs.mkdirSync(path.join(dir,'user/piratez'),{recursive:true});
  const bytes=Buffer.from('SYNTHETIC VALIDATOR FIXTURE; NOT AN OXCE SAVE\n');
  const event={event:'checkpoint',phase:'final',file:'xpz-native-0.sav',turn:2,side:0,rng:'18446744073709551615',command_index:2,units:[]};
  const result={backend:'OXCE_NATIVE',planCompleted:true,seed:'PRESERVE_SAVE_RNG',runtimeManifestSha256:null,display:'dummy',sourceVariant:'RC18_SOURCE_BASELINE',sourceVariantArchiveSha256:null,audioPolicy:'ORIGINAL_OXCE_SDL_INIT_FAILURE_MUTE',
    checkpoints:[{...event,snapshotSha256:sha256(bytes)}]};
  for(const k of ['sourceTreeSha256','driverSha256','archiveSha256','driverOverrideSha256','driverOverrideReceiptSha256','sourceVariantReceiptSha256','clockPatchSha256','outcomePatchSha256','binarySha256','planSha256','configSha256','inputSaveSha256'])result[k]='a'.repeat(64);
  fs.writeFileSync(path.join(dir,'user/piratez/xpz-native-0.sav'),bytes);
  fs.writeFileSync(path.join(dir,'replay-result.json'),JSON.stringify(result));
  const events=[{event:'native_ready',backend:'OXCE_NATIVE',protocol:1},event,{event:'plan_completed',battleVictoryCertified:false}];
  fs.writeFileSync(path.join(dir,'native-events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  return {dir,result,event,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('verification accepts bounded repetition counts and never interprets --runs as tactical trials',()=>{
  const p=parseVerificationArgs(['--repetitions','3','--experimental','--out','result']);
  assert.equal(p.repetitions,3);assert.equal(p.args['--out'],'result');
  for(const n of ['0','1','21','5000','2.5','abc'])assert.throws(()=>parseVerificationArgs(['--repetitions',n]));
  assert.throws(()=>parseVerificationArgs(['--repetitions','3','--repetitions','4']),/DUPLICATE/);
  assert.throws(()=>parseVerificationArgs(['--runs','5000']),/UNSUPPORTED/);
});
test('synthetic checkpoint evidence is read from actual bytes, not just asserted JSON hashes',()=>{
  const f=fixture();try{assert.deepEqual(verifyRunEvidence(f.dir),f.result);
    fs.appendFileSync(path.join(f.dir,'user/piratez/xpz-native-0.sav'),'tamper');
    assert.throws(()=>verifyRunEvidence(f.dir),/CHECKPOINT_BYTES_CHANGED/);
  }finally{f.clean();}
});
test('validator rejects a claimed result without its native event trail',()=>{
  const f=fixture();try{fs.writeFileSync(path.join(f.dir,'native-events.jsonl'),JSON.stringify({event:'native_ready'})+'\n');
    assert.throws(()=>verifyRunEvidence(f.dir),/NATIVE_EVENT_LOG_INCOMPLETE/);
  }finally{f.clean();}
});
test('validator rejects mismatched command metadata and escaping checkpoint paths',()=>{
  const f=fixture();try{
    const changed=structuredClone(f.result);changed.checkpoints[0].rng='1';
    fs.writeFileSync(path.join(f.dir,'replay-result.json'),JSON.stringify(changed));
    assert.throws(()=>verifyRunEvidence(f.dir),/NATIVE_EVENT_CONTENT_MISMATCH/);
    changed.checkpoints[0].file='../../outside.sav';
    fs.writeFileSync(path.join(f.dir,'replay-result.json'),JSON.stringify(changed));
    assert.throws(()=>verifyRunEvidence(f.dir));
  }finally{f.clean();}
});
test('strict full-save mismatch remains a failure even when unit summaries and RNG match',()=>{
  const f=fixture();try{const b=structuredClone(f.result);b.checkpoints[0].snapshotSha256='b'.repeat(64);
    const report=summarizeComparisons([f.result,b],2);
    assert.equal(report.nativeReplayIdentical,false);
    assert.equal(report.interactiveParityCertified,false);
    assert.equal(report.battleVictoryCertified,false);
    assert.equal(report.comparisons[0].differences[0].field,'snapshotSha256');
  }finally{f.clean();}
});
test('complete exact equality is limited to evidence, never certified GUI parity or victory',()=>{
  const f=fixture();try{const r=summarizeComparisons([f.result,structuredClone(f.result)],2);
    assert.equal(r.nativeReplayIdentical,true);assert.equal(r.battleVictoryCertified,false);
    assert.equal(r.interactiveParityCertified,false);
    assert.throws(()=>summarizeComparisons([f.result],2),/ALL_REQUESTED/);
  }finally{f.clean();}
});
test('synthetic original-engine finish evidence is checked against terminal save bytes',()=>{
  const f=fixture();
  try {
    const saved=Buffer.from('SYNTHETIC NATIVE END SNAPSHOT - NOT A REAL BATTLE\n');
    const entry=Buffer.from('SYNTHETIC NATIVE ENTRY SNAPSHOT - NOT A REAL BATTLE\n');
    const terminal={event:'battle_finished',outcome:'WON',aborted:false,nextStage:false,
      preview:false,survivorsOrExit:11,rng:'18446744073709551615',
      entryFile:'xpz-native-battle-entry.sav',file:'xpz-native-battle-finish.sav'};
    fs.writeFileSync(path.join(f.dir,'user/piratez',terminal.entryFile),entry);
    fs.writeFileSync(path.join(f.dir,'user/piratez',terminal.file),saved);
    const result={...f.result,planCompleted:false,nativeBattleFinished:true,
      nativeMissionOutcome:'WON',nativeBattleWonObserved:true,
      nativeEntrySnapshotSha256:sha256(entry),nativeFinishSnapshotSha256:sha256(saved)};
    fs.writeFileSync(path.join(f.dir,'replay-result.json'),JSON.stringify(result));
    fs.writeFileSync(path.join(f.dir,'native-events.jsonl'),[
      {event:'native_ready',backend:'OXCE_NATIVE',protocol:1},f.event,terminal
    ].map(JSON.stringify).join('\n')+'\n');
    assert.deepEqual(verifyRunEvidence(f.dir),result);
    assert.equal(compare(result,structuredClone(result)).nativeReplayIdentical,true);
    const altered=structuredClone(result);altered.nativeMissionOutcome='LOST';
    assert.equal(compare(result,altered).nativeReplayIdentical,false);
    altered.nativeMissionOutcome='WON';
    altered.nativeEntrySnapshotSha256='0'.repeat(64);
    assert.equal(compare(result,altered).nativeReplayIdentical,false);
    const missing=structuredClone(result);delete missing.nativeEntrySnapshotSha256;
    assert.throws(()=>compare(result,missing),/VALID_NATIVE_FINISH_SNAPSHOT_REQUIRED/);
    fs.appendFileSync(path.join(f.dir,'user/piratez',terminal.entryFile),'tamper');
    assert.throws(()=>verifyRunEvidence(f.dir),/NATIVE_ENTRY_SNAPSHOT_CHANGED/);
    fs.writeFileSync(path.join(f.dir,'user/piratez',terminal.entryFile),entry);
    const missingEntryEvent={...terminal};delete missingEntryEvent.entryFile;
    fs.writeFileSync(path.join(f.dir,'native-events.jsonl'),[
      {event:'native_ready',backend:'OXCE_NATIVE',protocol:1},f.event,missingEntryEvent
    ].map(JSON.stringify).join('\n')+'\n');
    assert.throws(()=>verifyRunEvidence(f.dir),/NATIVE_FINISH_EVENT_RESULT_MISMATCH/);
    fs.writeFileSync(path.join(f.dir,'native-events.jsonl'),[
      {event:'native_ready',backend:'OXCE_NATIVE',protocol:1},f.event,terminal
    ].map(JSON.stringify).join('\n')+'\n');
    fs.appendFileSync(path.join(f.dir,'user/piratez',terminal.file),'tamper');
    assert.throws(()=>verifyRunEvidence(f.dir),/NATIVE_FINISH_SNAPSHOT_CHANGED/);
  }finally{f.clean();}
});
test('terminal event cannot forge native victory in the ordinary plan-completed path',()=>{
  const f=fixture();
  try {
    f.result.nativeBattleWonObserved=true;
    fs.writeFileSync(path.join(f.dir,'replay-result.json'),JSON.stringify(f.result));
    assert.throws(()=>verifyRunEvidence(f.dir),/NATIVE_FINISH_EVENT_RESULT_MISMATCH|NATIVE_EVENT_LOG_INCOMPLETE/);
  }finally{f.clean();}
});
test('runtime identity and display mode must be equal for a strict comparison',()=>{
  const f=fixture();try{for(const [key,value] of [['runtimeManifestSha256','d'.repeat(64)],['display','xvfb']]){
    const b=structuredClone(f.result);b[key]=value;assert.throws(()=>compare(f.result,b),/INCOMPARABLE_INPUT/);
    delete b[key];assert.throws(()=>compare(f.result,b),/IDENTITY_MISSING/);
  }}finally{f.clean();}
});
test('input-resource fingerprint changes when actual mod bytes change',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-resource-fixture-'));
  try{fs.mkdirSync(path.join(dir,'data'));fs.mkdirSync(path.join(dir,'user/mods'),{recursive:true});
    fs.writeFileSync(path.join(dir,'data/terrain.mcd'),'synthetic bytes A');
    fs.writeFileSync(path.join(dir,'user/mods/rules.rul'),'synthetic rules A');
    const args={'--data':path.join(dir,'data'),'--user':path.join(dir,'user')};
    const a=await fingerprintGameInputs(args),b=await fingerprintGameInputs(args);
    assert.deepEqual(a,b);assert.equal(a.files,2);
    fs.writeFileSync(path.join(dir,'user/mods/rules.rul'),'synthetic rules B');
    assert.notEqual((await fingerprintGameInputs(args)).sha256,a.sha256);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('repeat verifier cannot replay a battle on the Windows source PC',async()=>{
  if(process.platform==='win32')await assert.rejects(()=>verifyRepeatedNative({},3),/GPT_LINUX_EXECUTION_REQUIRED/);
  else await assert.rejects(()=>verifyRepeatedNative({},1),/INVALID_REPETITIONS/);
});
