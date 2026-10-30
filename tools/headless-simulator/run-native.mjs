#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Launches a fingerprinted native OXCE build. Contains NO battle simulation.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
import {verifyWinDllBundle} from './windows-runtime.mjs';

export function parseArgs(argv) {
  const flags = new Set(['--experimental','--experimental-windows','--xvfb','--fixed-clock']);
  const values = new Set(['--binary','--manifest','--data','--user','--config','--save','--plan','--out','--master','--seed','--timeout','--runtime']);
  const a = {};
  for (let i=0;i<argv.length;i++) {
    const k=argv[i];
    if (Object.hasOwn(a,k)) throw new Error('DUPLICATE_ARGUMENT: '+k);
    if (flags.has(k)) a[k]=true;
    else if (values.has(k) && argv[i+1] && !argv[i+1].startsWith('--')) a[k]=argv[++i];
    else throw new Error('UNSUPPORTED_OR_MISSING_ARGUMENT: '+k);
  }
  return a;
}
export function nativeClockEnvironment(a, base=process.env) {
  const env={...base};
  // A previous experiment must not silently select a different timing policy.
  delete env.XPZ_NATIVE_LOGICAL_CLOCK;
  if(a['--fixed-clock'])env.XPZ_NATIVE_LOGICAL_CLOCK='fixed-1ms-v1';
  return env;
}
export function verifyRuntime(dir) {
  dir=fs.realpathSync(dir);
  const bytes=fs.readFileSync(path.join(dir,'runtime-manifest.json'));
  const m=JSON.parse(bytes.toString('utf8'));
  if(m.schema!==1 || m.purpose!=='ORIGINAL_SDL_RUNTIME_ONLY' || m.arch!=='x86_64' || !m.libraries || Array.isArray(m.libraries)) throw new Error('INVALID_NATIVE_RUNTIME_MANIFEST');
  for(const name of ['libSDL-1.2.so.0','libSDL_image-1.2.so.0','libSDL_gfx.so.15','libSDL_mixer-1.2.so.0'])
    if(!Object.hasOwn(m.libraries,name))throw new Error('MISSING_SDL_RUNTIME_LIBRARY: '+name);
  for(const [name,entry] of Object.entries(m.libraries)) {
    if(name!==path.basename(name) || name==='.' || name==='..' || !/^[a-f0-9]{64}$/.test(entry.sha256||''))throw new Error('INVALID_RUNTIME_LIBRARY_ENTRY');
    const file=path.join(dir,'lib',name);
    if(!fs.lstatSync(file).isFile() || sha256(fs.readFileSync(file))!==entry.sha256)throw new Error('RUNTIME_LIBRARY_HASH_MISMATCH: '+name);
  }
  return {lib:fs.realpathSync(path.join(dir,'lib')),manifestSha256:sha256(bytes)};
}
export function preflight(a, platform=process.platform) {
  if (!a['--experimental']) throw new Error('NATIVE_PARITY_NOT_CERTIFIED: explicit --experimental is required; no surrogate fallback exists');
  const windows=platform==='win32' && a['--experimental-windows']===true;
  if(platform!=='linux' && !windows)
    throw new Error('NATIVE_PLATFORM_NOT_AUTHORIZED: Windows requires --experimental-windows');
  if(windows && (a['--xvfb']||a['--runtime']))
    throw new Error('WINDOWS_NATIVE_INVALID_LINUX_RUNTIME_OPTION');
  for (const k of ['--binary','--manifest','--data','--user','--config','--save','--plan','--out'])
    if (!a[k]) throw new Error('REQUIRED_ARGUMENT: '+k);
  for (const k of ['--binary','--manifest','--config','--save','--plan'])
    if (!fs.statSync(a[k]).isFile()) throw new Error('EXPECTED_FILE: '+k);
  for (const k of ['--data','--user']) if (!fs.statSync(a[k]).isDirectory()) throw new Error('EXPECTED_DIRECTORY: '+k);
  const manifest=JSON.parse(fs.readFileSync(a['--manifest'],'utf8'));
  if (manifest.schema!==1 || manifest.backend!=='OXCE_NATIVE' || !/^[a-f0-9]{64}$/.test(manifest.sourceTreeSha256||'') || !/^[a-f0-9]{64}$/.test(manifest.driverSha256||''))
    throw new Error('INVALID_NATIVE_BUILD_MANIFEST');
  if(manifest.platform!==platform)throw new Error('NATIVE_PLATFORM_BUILD_MISMATCH');
  if(windows)verifyWinDllBundle(path.dirname(fs.realpathSync(a['--binary'])),manifest);
  if (sha256(fs.readFileSync(a['--binary']))!==manifest.binarySha256) throw new Error('NATIVE_BINARY_HASH_MISMATCH');
  const clockPolicy=a['--fixed-clock']?'fixed-1ms-v1':'wall-clock';
  if(a['--fixed-clock']&&(manifest.fixedClockPolicy!==clockPolicy||!/^[a-f0-9]{64}$/.test(manifest.clockAdapterSha256||'')))
    throw new Error('NATIVE_FIXED_CLOCK_UNSUPPORTED: rebuild the original engine with the locked clock adapter');
  const out=path.resolve(a['--out']);
  if (fs.existsSync(out)) throw new Error('OUTPUT_ALREADY_EXISTS: use a fresh output directory');
  for (const k of ['--data','--user']) {
    const p=fs.realpathSync(a[k]);
    if (out===p || out.startsWith(p+path.sep)) throw new Error('OUTPUT_MUST_NOT_BE_INSIDE_GAME_INSTALL');
  }
  const master=a['--master']||'piratez';
  if (!/^[a-zA-Z0-9_-]+$/.test(master)) throw new Error('INVALID_MASTER_ID');
  const timeout=Number(a['--timeout']||'180');
  if (!Number.isFinite(timeout)||timeout<1||timeout>86400) throw new Error('INVALID_TIMEOUT');
  if (a['--seed'] && (!/^[1-9][0-9]*$/.test(a['--seed']) || BigInt(a['--seed'])>18446744073709551615n)) throw new Error('INVALID_UINT64_SEED');
  const runtime=a['--runtime']?verifyRuntime(a['--runtime']):null;
  return {manifest,out,master,timeout,runtime,clockPolicy};
}
export async function runNative(a) {
  const {manifest,out,master,timeout,runtime,clockPolicy}=preflight(a);
  const sourceSave=fs.realpathSync(a['--save']);
  const inputHash=sha256(fs.readFileSync(sourceSave));
  const user=path.join(out,'user'),cfg=path.join(out,'config');
  fs.mkdirSync(path.join(user,master),{recursive:true}); fs.mkdirSync(cfg,{recursive:true});
  fs.copyFileSync(sourceSave,path.join(user,master,'input.sav'));
  fs.copyFileSync(a['--config'],path.join(cfg,'options.cfg'));
  const mods=path.join(fs.realpathSync(a['--user']),'mods');
  if (fs.existsSync(mods)) fs.symlinkSync(mods,path.join(user,'mods'),process.platform==='win32'?'junction':'dir');
  const tracePath=path.join(out,'native-events.jsonl');
  const env={...nativeClockEnvironment(a),XPZ_NATIVE_PLAN:fs.realpathSync(a['--plan']),XPZ_NATIVE_TRACE:tracePath,SDL_AUDIODRIVER:'dummy',SDL_VIDEODRIVER:a['--xvfb']?'x11':'dummy'};
  if(runtime)env.LD_LIBRARY_PATH=runtime.lib;
  delete env.XPZ_NATIVE_SEED;
  if(a['--seed'])env.XPZ_NATIVE_SEED=a['--seed'];
  const binary=fs.realpathSync(a['--binary']);
  let cmd=binary;
  let args=['-data',fs.realpathSync(a['--data']),'-user',user+path.sep,'-config',cfg+path.sep,'-master',master,'-load','input.sav',
    '-newSeedOnLoad','false','-playIntro','false','-useOpenGL','false','-skipNextTurnScreen','true','-soundVolume','0','-musicVolume','0','-uiVolume','0'];
  if(a['--xvfb']) {cmd='xvfb-run';args=['-a',binary,...args];}
  const provenance={schema:1,backend:'OXCE_NATIVE',parityCertified:false,clockPolicy,clockAdapterSha256:manifest.clockAdapterSha256||null,sourceTreeSha256:manifest.sourceTreeSha256,driverSha256:manifest.driverSha256,
    binarySha256:manifest.binarySha256,archiveSha256:manifest.archiveSha256,runtimeManifestSha256:runtime?.manifestSha256||null,saveSha256:inputHash,planSha256:sha256(fs.readFileSync(a['--plan'])),configSha256:sha256(fs.readFileSync(a['--config'])),
    seed:a['--seed']||'PRESERVE_SAVE_RNG',display:a['--xvfb']?'xvfb':'dummy',startedAt:new Date().toISOString(),command:[cmd,...args]};
  fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  const log=fs.openSync(path.join(out,'stdout.log'),'wx'),err=fs.openSync(path.join(out,'stderr.log'),'wx');
  let outcome;
  try {
    outcome=await new Promise((resolve,reject)=>{
      const p=spawn(cmd,args,{env,cwd:out,stdio:['ignore',log,err],detached:process.platform==='linux',windowsHide:true});
      let timedOut=false;
      const killGroup=s=>{
        if(process.platform==='win32'){
          try{spawn('taskkill.exe',['/T','/F','/PID',String(p.pid)],{stdio:'ignore',windowsHide:true});}catch{}
          try{p.kill();}catch{}
          return;
        }
        try{process.kill(-p.pid,s);}catch{try{p.kill(s);}catch{}}
      };
      const timer=setTimeout(()=>{timedOut=true;killGroup('SIGKILL');},timeout*1000);
      p.on('error',e=>{clearTimeout(timer);reject(e);});
      p.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut});});
    });
  } finally {fs.closeSync(log);fs.closeSync(err);}
  if(sha256(fs.readFileSync(sourceSave))!==inputHash)throw new Error('ORIGINAL_SAVE_CHANGED');
  if(outcome.timedOut)throw new Error('NATIVE_PROCESS_TIMEOUT: no simulation result is certified; inspect '+out);
  if(outcome.code!==0)throw new Error('NATIVE_PROCESS_FAILED: '+JSON.stringify(outcome)+'; inspect '+out);
  if(!fs.existsSync(tracePath))throw new Error('NATIVE_PROTOCOL_MISSING: executable did not produce replay events');
  const events=fs.readFileSync(tracePath,'utf8').trim().split(/\r?\n/).map(s=>JSON.parse(s));
  if(events[0]?.event!=='native_ready'||events[0]?.backend!=='OXCE_NATIVE'||events[0]?.protocol!==1)throw new Error('NATIVE_PROTOCOL_INVALID');
  if(events.some(e=>e.event==='error')||events.at(-1)?.event!=='plan_completed')throw new Error('NATIVE_PLAN_INCOMPLETE');
  const checkpoints=events.filter(e=>e.event==='checkpoint');
  if(!checkpoints.length)throw new Error('NATIVE_CHECKPOINTS_MISSING');
  for(const c of checkpoints){
    if(!/^xpz-native-[0-9]+\.sav$/.test(c.file||''))throw new Error('INVALID_CHECKPOINT_FILENAME');
    const file=path.join(user,master,c.file);
    if(!fs.existsSync(file))throw new Error('NATIVE_SNAPSHOT_MISSING: '+c.file);
    c.snapshotSha256=sha256(fs.readFileSync(file));
  }
  const result={backend:'OXCE_NATIVE',planCompleted:true,parityCertified:false,battleVictoryCertified:false,checkpointCount:checkpoints.length,
    clockPolicy,clockAdapterSha256:manifest.clockAdapterSha256||null,
    sourceTreeSha256:manifest.sourceTreeSha256,driverSha256:manifest.driverSha256,archiveSha256:manifest.archiveSha256,
    binarySha256:manifest.binarySha256,planSha256:provenance.planSha256,configSha256:provenance.configSha256,
    seed:provenance.seed,inputSaveSha256:inputHash,checkpoints};
  fs.writeFileSync(path.join(out,'replay-result.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const r=await runNative(parseArgs(process.argv.slice(2)));console.log(JSON.stringify({backend:r.backend,planCompleted:r.planCompleted,checkpointCount:r.checkpointCount,parityCertified:false,battleVictoryCertified:false},null,2));}
  catch(e){console.error('NATIVE_REPLAY_ERROR: '+e.message);process.exitCode=1;}
}
