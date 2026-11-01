#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Actual Linux process launch of both compiled ORIGINAL OXCE binaries.
// Version/help startup only: strictly NOT a combat replay or parity evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyBuildPair} from './build-paired.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function requireOK(ok,message){if(!ok)throw new Error(message);}
export function smoke(root,extraLibraryPath='') {
  requireOK(process.platform==='linux'&&process.arch==='x64','LINUX_X64_REQUIRED');
  root=path.resolve(root);
  const manifests={};
  for(const k of ['control','observer']){
    const bundle=path.join(root,k,'bundle');
    const binary=path.join(bundle,'oxce-native');
    const m=read(path.join(bundle,'native-build.json'));
    requireOK(fs.statSync(binary).isFile(),'NATIVE_BINARY_MISSING: '+k);
    requireOK(sha(fs.readFileSync(binary))===m.binarySha256,'BINARY_HASH_MISMATCH: '+k);
    manifests[k]=m;
  }
  const pair=verifyBuildPair(manifests.control,manifests.observer);
  const results={};
  const env={...process.env,SDL_VIDEODRIVER:'dummy',SDL_AUDIODRIVER:'dummy'};
  delete env.XPZ_NATIVE_PLAN;
  delete env.XPZ_NATIVE_TRACE;
  delete env.XPZ_NATIVE_IMPACT_TRACE;
  delete env.XPZ_NATIVE_SEED;
  if(extraLibraryPath)env.LD_LIBRARY_PATH=extraLibraryPath;
  for(const k of ['control','observer']){
    const binary=path.join(root,k,'bundle','oxce-native');
    const commands={};
    for(const [flag,expected] of [['-version','Extended 8.7.1'],['-help','OpenXcom Extended 8.7.1']]){
      const p=spawnSync(binary,[flag],{
        env,encoding:'utf8',shell:false,timeout:12000,maxBuffer:1024*1024
      });
      requireOK(!p.error && p.status===0,'NATIVE_PROCESS_STARTUP_FAILED '+k+' '+flag+': '+(p.error||p.stderr||p.status));
      const output=(p.stdout||'')+(p.stderr||'');
      requireOK(output.includes(expected),'UNEXPECTED_NATIVE_ENGINE_VERSION '+k+' '+flag);
      commands[flag]={exitCode:p.status,output:output.slice(0,180).trim()};
    }
    results[k]={binarySha256:manifests[k].binarySha256,commands};
  }
  return {schema:1,kind:'original-oxce-linux-two-binary-process-smoke',
    originalSourceSha256:pair.sourceTreeSha256,
    binariesActuallyLaunched:true,originalCombatBattleExecuted:false,
    sourceLicenseComplianceNotProvenBySmoke:true,
    actualSilentStormProcessExecuted:false,actualGameDataLoaded:false,
    combatParityCertified:false,results};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [dir,lib='']=process.argv.slice(2);
    requireOK(!!dir,'Usage: node smoke-native.mjs PAIRED_BUILD_DIR [SDL_LIB_DIR]');
    console.log(JSON.stringify(smoke(dir,lib),null,2));
  }catch(e){console.error('STAGE08_NATIVE_STARTUP_FAILED:',e.message);process.exitCode=1;}
}
