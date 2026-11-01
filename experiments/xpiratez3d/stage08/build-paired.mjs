#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Build two ACTUAL original OXCE C++ engines, differing ONLY by an opt-in
// telemetry hook. Not a surrogate simulator. No game data or battles run here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildNative, verifySource, checked, prepareBuildAssetDirectories} from '../../../tools/headless-simulator/build-native.mjs';
import {sha256} from '../../../tools/headless-simulator/prepare-native.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const STAGE7=path.resolve(HERE,'../stage07');
const NATIVE=path.resolve(HERE,'../../../tools/headless-simulator/native');
export const CONTROL='unmodified-native-headless-adapter';
export const OBSERVER='original-engine-opt-in-damage-voxel-observer';
function requireOK(condition,message){if(!condition)throw new Error(message);}
function bytes(file){return fs.readFileSync(file);}
function json(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function writeJSON(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function safeCopy(source,target){requireOK(fs.statSync(source).isFile(),'MISSING_INPUT: '+source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
export function applyImpactToCopy(source,overlayFolder){
  requireOK(fs.statSync(source).isDirectory(),'SOURCE_DIRECTORY_REQUIRED');
  const original=json(path.join(source,'native-source-manifest.json'));
  verifySource(source,original);
  requireOK(!original.impactInstrumentationSha256,'ALREADY_INSTRUMENTED');
  const inputTile=path.join(source,'src/Battlescape/TileEngine.cpp');
  const inputDriver=path.join(source,'src/Headless/ReplayDriver.h');
  requireOK(sha256(bytes(inputDriver))===original.driverSha256,'DRIVER_BASE_HASH_INVALID');
  requireOK(!fs.existsSync(overlayFolder),'OVERLAY_OUTPUT_ALREADY_EXISTS');
  // Do not introduce a second copy of original game code into this repository;
  // modify ONLY the disposable tree using Stage07's source-anchored script.
  const patch=path.join(STAGE7,'tools/apply_impact_overlay.py');
  const py=spawnSync('python3',[patch,'--tile-engine',inputTile,'--replay-driver',inputDriver,'--output',overlayFolder],
                     {encoding:'utf8',maxBuffer:1024*1024});
  requireOK(py.status===0 && !py.error,'IMPACT_OVERLAY_REJECTED: '+(py.stderr||py.error||py.status));
  const receipt=json(path.join(overlayFolder,'patch-manifest.json'));
  requireOK(receipt.schema==='xp3d-actual-oxce-hit-overlays.v1','IMPACT_MANIFEST_INVALID');
  requireOK(receipt.inputs.TileEngine_sha256===sha256(bytes(inputTile)),'TILE_INPUT_CHANGED');
  requireOK(receipt.inputs.ReplayDriver_sha256===sha256(bytes(inputDriver)),'DRIVER_INPUT_CHANGED');
  const files=[
    ['src/Battlescape/TileEngine.cpp','src/Battlescape/TileEngine.cpp','TileEngine_sha256'],
    ['src/Headless/ReplayDriver.h','native/ReplayDriver.h','ReplayDriver_sha256'],
    ['src/Battlescape/NativeImpactTrace.h','src/Battlescape/NativeImpactTrace.h','NativeImpactTrace_sha256']
  ];
  const patched=structuredClone(original);
  patched.patchedFiles={...patched.patchedFiles};
  const updateHashes={};
  for(const [to,from,field] of files) {
    const input=path.join(overlayFolder,from);
    requireOK(sha256(bytes(input))===receipt.outputs[field],'IMPACT_OUTPUT_HASH_INVALID: '+field);
    safeCopy(input,path.join(source,to));
    const value=sha256(bytes(path.join(source,to)));
    patched.patchedFiles[to]=value;
    updateHashes[to]=value;
  }
  patched.driverSha256=updateHashes['src/Headless/ReplayDriver.h'];
  patched.impactInstrumentationSha256=sha256(JSON.stringify({baseTreeSha256:original.sourceTreeSha256,
    baseDriverSha256:original.driverSha256,patches:updateHashes,observerFlag:'XPZ_NATIVE_IMPACT_TRACE=1'}));
  patched.impactInstrumentation={
    schema:'xpz3d-original-tileengine-hit-v1',observerFlag:'XPZ_NATIVE_IMPACT_TRACE=1',
    defaultEnabled:false,source:'original-OXCE',
    baseDriverSha256:original.driverSha256,changes:updateHashes,
    originalDamageRngAndStateMachineReplaced:false
  };
  verifySource(source,patched);
  writeJSON(path.join(source,'native-source-manifest.json'),patched);
  return {base:original,instrumented:patched,sourcePatchReceipt:receipt};
}
export function verifyBuildPair(control,observed) {
  requireOK(control.backend==='OXCE_NATIVE'&&observed.backend==='OXCE_NATIVE','NOT_NATIVE_BUILD');
  requireOK(control.parityCertified===false&&observed.parityCertified===false,'UNSUPPORTED_CERTIFICATION');
  for(const key of ['sourceTreeSha256','archiveSha256','clockAdapterSha256','fixedClockPolicy','arch','platform']) {
    requireOK(control[key]===observed[key] && control[key]!=null,'DIFFERENT_NATIVE_INPUT: '+key);
  }
  requireOK(control.driverSha256!==observed.driverSha256,'INSTRUMENTED_DRIVER_NOT_DISTINCT');
  requireOK(control.binarySha256!==observed.binarySha256,'INSTRUMENTED_BINARY_NOT_DISTINCT');
  requireOK(observed.impactInstrumentation?.baseDriverSha256===control.driverSha256,'UNTRACKED_DRIVER_CHANGE');
  requireOK(observed.impactInstrumentation?.defaultEnabled===false,'OBSERVER_MUST_DEFAULT_OFF');
  requireOK(observed.impactInstrumentation?.observerFlag==='XPZ_NATIVE_IMPACT_TRACE=1','UNRECOGNIZED_OBSERVER');
  requireOK(/^[a-f0-9]{64}$/.test(observed.impactInstrumentationSha256||''),'MISSING_OBSERVER_SOURCE_FINGERPRINT');
  return {schema:1,kind:'native-OXCE-observer-binary-pair',sourceTreeSha256:control.sourceTreeSha256,
    archiveSha256:control.archiveSha256,clockAdapterSha256:control.clockAdapterSha256,
    clockPolicy:control.fixedClockPolicy,baseDriverSha256:control.driverSha256,
    observerDriverSha256:observed.driverSha256,controlBinarySha256:control.binarySha256,
    observerBinarySha256:observed.binarySha256,observerPatchSha256:observed.impactInstrumentationSha256,
    actualGameBattleExecuted:false,nativeCampaignParityCertified:false};
}
export function buildPair(out,jobs=2) {
  requireOK(process.platform==='linux','LINUX_ORIGINAL_ENGINE_BUILD_REQUIRED');
  requireOK(Number.isSafeInteger(jobs)&&jobs>=1&&jobs<=16,'INVALID_JOBS');
  out=path.resolve(out);requireOK(!fs.existsSync(out),'NEW_OUTPUT_DIRECTORY_REQUIRED');
  // Build the unmodified canonical source. This validates all existing source,
  // clock and ReplayDriver locks. Do not change global source locks.
  const controlDir=path.join(out,'control');
  const control=buildNative(controlDir,jobs);
  const observerDir=path.join(out,'observer');
  const source=path.join(observerDir,'source');
  fs.mkdirSync(observerDir,{recursive:true});
  fs.cpSync(path.join(controlDir,'source'),source,{recursive:true});
  const result=applyImpactToCopy(source,path.join(observerDir,'overlay'));
  prepareBuildAssetDirectories(source);
  const build=path.join(observerDir,'build');
  checked('cmake',['-S',source,'-B',build,'-DBUILD_PACKAGE=OFF','-DEMBED_ASSETS=OFF',
        '-DCMAKE_BUILD_TYPE=Release','-DCMAKE_DISABLE_FIND_PACKAGE_OpenGL=TRUE']);
  checked('cmake',['--build',build,'--target','openxcom','--parallel',String(jobs)]);
  const binary=[path.join(build,'bin/openxcom'),path.join(build,'bin/OpenXcom'),
                path.join(build,'src/openxcom')].find(p=>fs.existsSync(p));
  requireOK(!!binary,'OBSERVED_NATIVE_BINARY_NOT_BUILT');
  const bundle=path.join(observerDir,'bundle');
  fs.mkdirSync(bundle,{recursive:true});
  safeCopy(binary,path.join(bundle,'oxce-native'));fs.chmodSync(path.join(bundle,'oxce-native'),0o755);
  for(const f of ['LICENSE.txt','native-source-manifest.json'])
    safeCopy(path.join(source,f),path.join(bundle,f));
  for(const f of ['source.lock.json','clock.lock.json'])
    safeCopy(path.join(NATIVE,f),path.join(bundle,f));
  const observed={
    ...control,driverSha256:result.instrumented.driverSha256,
    binarySha256:sha256(bytes(binary)),buildTime:new Date().toISOString(),
    impactInstrumentationSha256:result.instrumented.impactInstrumentationSha256,
    impactInstrumentation:result.instrumented.impactInstrumentation,
    baselineControlBinarySha256:control.binarySha256
  };
  writeJSON(path.join(bundle,'native-build.json'),observed);
  const report=verifyBuildPair(control,observed);
  report.controlManifestSha256=sha256(bytes(path.join(controlDir,'bundle/native-build.json')));
  report.observerManifestSha256=sha256(bytes(path.join(bundle,'native-build.json')));
  report.sourcePatchManifestSha256=sha256(bytes(path.join(observerDir,'overlay/patch-manifest.json')));
  writeJSON(path.join(out,'binary-pair.json'),report);
  console.log(JSON.stringify({out,report},null,2));
  return report;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [out,jobs='2']=process.argv.slice(2);
    if(!out||!/^([1-9]|1[0-6])$/.test(jobs))throw new Error('Usage: node build-paired.mjs NEW_DIR JOBS<=16');
    buildPair(out,Number(jobs));
  } catch(e){console.error('STAGE08_BUILD_FAILURE:',e.message);process.exitCode=1;}
}
