#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Stage09: experimental Windows MinGW pair for original OXCE native engine.
// Writes ONLY a separate throwaway build tree; original game and save untouched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifySource, prepareBuildAssetDirectories } from '../../../tools/headless-simulator/build-native.mjs';
import { applyClockAdapter } from '../../../tools/headless-simulator/clock-patch.mjs';
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const DEFAULT_TOOLS='D:/daphne_auto/tools';
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,obj)=>fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n');
function check(ok,msg){if(!ok)throw new Error(msg);}
function toolEnv(){
  const mingw=process.env.XPZ3D_MINGW_DIR||DEFAULT_TOOLS+'/winlibs64/mingw64/bin';
  const cmake=process.env.XPZ3D_CMAKE||DEFAULT_TOOLS+'/cmake/cmake-3.31.6-windows-x86_64/bin/cmake.exe';
  for(const x of [mingw+'/g++.exe',mingw+'/gcc.exe',mingw+'/mingw32-make.exe',cmake])
    check(fs.existsSync(x),'MISSING_WINDOWS_TOOL: '+x);
  const env={...process.env,PATH:mingw+';'+path.dirname(cmake)+';'+process.env.PATH};
  return {mingw,cmake,env};
}
function sources(root){return {c:path.join(root,'control/source'),o:path.join(root,'observer/source')};}
export function prepare(root,overlay){
  check(process.platform==='win32','WINDOWS_COMPILER_REQUIRED');
  root=path.resolve(root);overlay=path.resolve(overlay);
  const {c,o}=sources(root);
  const manifestPath=path.join(c,'native-source-manifest.json');
  check(fs.existsSync(manifestPath),'MISSING_CONTROL_EXTRACTED_SOURCE');
  const archive=path.join(REPO,'tools/headless-simulator/native/oxce-source.tar.gz');
  const lock=read(path.join(REPO,'tools/headless-simulator/native/source.lock.json'));
  check(sha(archive)===lock.archiveSha256,'ORIGINAL_SOURCE_ARCHIVE_CHANGED');
  let m=read(manifestPath);
  check(m.sourceTreeSha256===lock.sourceTreeSha256,'SOURCE_TREE_VERSION_MISMATCH');
  if(m.clockAdapterSha256) {
    check(m.fixedClockPolicy==='fixed-1ms-v1','CONTROL_CLOCK_POLICY_UNKNOWN');
  } else {
    verifySource(c,m);m=applyClockAdapter(c,m);
  }
  verifySource(c,m);
  if(!fs.existsSync(o))fs.cpSync(c,o,{recursive:true});
  const inObserver=read(path.join(o,'native-source-manifest.json'));
  check(inObserver.driverSha256===m.driverSha256,'OBSERVER_BASE_DRIVER_MISMATCH');
  check(!inObserver.impactInstrumentation,'OBSERVER_ALREADY_INSTRUMENTED');
  verifySource(o,inObserver);
  const receipt=read(path.join(overlay,'patch-manifest.json'));
  check(receipt.schema==='xp3d-actual-oxce-hit-overlays.v1','UNTRUSTED_STAGE07_PATCH');
  const map=[
    ['src/Battlescape/TileEngine.cpp','src/Battlescape/TileEngine.cpp','TileEngine_sha256'],
    ['src/Headless/ReplayDriver.h','native/ReplayDriver.h','ReplayDriver_sha256'],
    ['src/Battlescape/NativeImpactTrace.h','src/Battlescape/NativeImpactTrace.h','NativeImpactTrace_sha256']];
  const inputTile=path.join(o,map[0][0]);
  const inputDriver=path.join(o,map[1][0]);
  check(sha(inputTile)===receipt.inputs.TileEngine_sha256,'TILE_ENGINE_BASE_HASH_MISMATCH');
  check(sha(inputDriver)===receipt.inputs.ReplayDriver_sha256,'REPLAY_DRIVER_BASE_HASH_MISMATCH');
  const adjusted=structuredClone(inObserver),changes={};
  adjusted.patchedFiles={...adjusted.patchedFiles};
  for(const [target,source,key] of map){
    const f=path.join(overlay,source);
    check(sha(f)===receipt.outputs[key],'UNEXPECTED_STAGE07_PATCHED_HASH: '+key);
    fs.mkdirSync(path.dirname(path.join(o,target)),{recursive:true});
    fs.copyFileSync(f,path.join(o,target));
    changes[target]=sha(path.join(o,target));
    adjusted.patchedFiles[target]=changes[target];
  }
  adjusted.driverSha256=changes['src/Headless/ReplayDriver.h'];
  adjusted.impactInstrumentationSha256=crypto.createHash('sha256')
    .update(JSON.stringify({baseTreeSha256:m.sourceTreeSha256,
      baseDriverSha256:m.driverSha256,patches:changes,
      observerFlag:'XPZ_NATIVE_IMPACT_TRACE=1'})).digest('hex');
  adjusted.impactInstrumentation={
    schema:'xpz3d-original-tileengine-hit-v1',defaultEnabled:false,
    observerFlag:'XPZ_NATIVE_IMPACT_TRACE=1',baseDriverSha256:m.driverSha256,
    changes,originalDamageRngAndStateMachineReplaced:false
  };
  verifySource(o,adjusted);
  save(path.join(o,'native-source-manifest.json'),adjusted);
  for(const src of [c,o])prepareBuildAssetDirectories(src);
  save(path.join(root,'stage09-prepared.json'),{
    schema:1,root,sourceTreeSha256:m.sourceTreeSha256,archiveSha256:lock.archiveSha256,
    clockAdapterSha256:m.clockAdapterSha256,
    controlDriverSha256:m.driverSha256,observerDriverSha256:adjusted.driverSha256,
    observerPatchSha256:adjusted.impactInstrumentationSha256,
    observerChanges:changes,stage07SourceReceiptSha256:sha(path.join(overlay,'patch-manifest.json')),
    originalGameFilesModified:false,originalSaveFilesModified:false,
    built:false,executedOriginalCombat:false});
  return {controlReady:true,observedReady:true,sourceTree:m.sourceTreeSha256,
    patchSha256:adjusted.impactInstrumentationSha256};
}
function run(cmd,args,env){
  process.stdout.write('COMMAND '+cmd+' '+args.join(' ')+'\n');
  const r=spawnSync(cmd,args,{env,stdio:'inherit',shell:false});
  if(r.error||r.status!==0)throw new Error('WINDOWS_BUILD_COMMAND_FAILED '+cmd+': '+(r.error||r.status));
}
export function configure(root,kind){
  check(['control','observer'].includes(kind),'KIND_REQUIRED');
  const {cmake,mingw,env}=toolEnv();
  const src=path.join(root,kind,'source'),build=path.join(root,kind,'build');
  verifySource(src,read(path.join(src,'native-source-manifest.json')));
  run(cmake,['-S',src,'-B',build,'-G','MinGW Makefiles',
    '-DCMAKE_C_COMPILER='+mingw+'/gcc.exe','-DCMAKE_CXX_COMPILER='+mingw+'/g++.exe',
    '-DCMAKE_MAKE_PROGRAM='+mingw+'/mingw32-make.exe',
    '-DBUILD_PACKAGE=OFF','-DEMBED_ASSETS=OFF',
    '-DCMAKE_BUILD_TYPE=Release','-DCMAKE_DISABLE_FIND_PACKAGE_OpenGL=TRUE'],env);
  return {configured:true,role:kind};
}
export function build(root,kind,jobs=4){
  check(['control','observer'].includes(kind),'KIND_REQUIRED');
  const {cmake,env}=toolEnv();
  check(Number.isInteger(jobs)&&jobs>=1&&jobs<=8,'INVALID_JOBS');
  const buildDir=path.join(root,kind,'build');
  check(fs.existsSync(path.join(buildDir,'CMakeCache.txt')),'NOT_CONFIGURED');
  run(cmake,['--build',buildDir,'--target','openxcom','--parallel',String(jobs)],env);
  return {built:true,role:kind};
}
export function bundle(root,kind){
  check(['control','observer'].includes(kind),'KIND_REQUIRED');
  const src=path.join(root,kind,'source'),buildDir=path.join(root,kind,'build');
  const exe=[path.join(buildDir,'bin/openxcom.exe'),path.join(buildDir,'bin/OpenXcom.exe'),
    path.join(buildDir,'src/openxcom.exe')].find(x=>fs.existsSync(x));
  check(!!exe,'COMPILED_WINDOWS_EXE_NOT_FOUND');
  const sm=read(path.join(src,'native-source-manifest.json'));
  verifySource(src,sm);
  const bundleDir=path.join(root,kind,'bundle');fs.mkdirSync(bundleDir,{recursive:true});
  const dest=path.join(bundleDir,'oxce-native.exe');fs.copyFileSync(exe,dest);
  const out={
    schema:1,backend:'OXCE_NATIVE',parityCertified:false,
    sourceTreeSha256:sm.sourceTreeSha256,driverSha256:sm.driverSha256,
    clockAdapterSha256:sm.clockAdapterSha256,fixedClockPolicy:sm.fixedClockPolicy,
    archiveSha256:read(path.join(REPO,'tools/headless-simulator/native/source.lock.json')).archiveSha256,
    binarySha256:sha(dest),platform:'win32',arch:'x64',
    gameResourcesBundled:false,originalExe:false,
    impactInstrumentation:sm.impactInstrumentation||null,
    impactInstrumentationSha256:sm.impactInstrumentationSha256||null
  };
  save(path.join(bundleDir,'native-build.json'),out);
  return {role:kind,file:dest,sha256:out.binarySha256};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [action,root,arg,maybeJobs]=process.argv.slice(2);
    check(root,'Usage: node windows-pair.mjs prepare|configure|build|bundle ROOT [OVERLAY|ROLE] [JOBS]');
    const fn=({prepare:()=>prepare(root,arg),configure:()=>configure(root,arg),
      build:()=>build(root,arg,Number(maybeJobs||4)),bundle:()=>bundle(root,arg)})[action];
    check(fn,'UNKNOWN_ACTION');
    console.log(JSON.stringify(fn(),null,2));
  }catch(e){console.error('STAGE09_WINDOWS_PAIR_FAILED:',e.message);process.exitCode=1;}
}
