#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Package and fingerprint Windows DLL dependencies for the original OXCE engine.
// No gameplay formulas are patched or reimplemented.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';

export function parseNtldd(text) {
  const paths = new Set();
  for (const line of text.split(/\r?\n/)) {
    // Recursive ntldd reports "SDL.dll => C:\...\mingw64\bin\SDL.dll (0x...)"
    // or MSYS paths. Windows/system32 imports must never be copied.
    const match = line.match(/=>\s+((?:[a-z]:[\\/]|\/)[^\r\n]*?\.dll)\s*(?:\(|$)/i);
    if (!match) continue;
    const src = match[1].trim();
    if (!/[\\/]mingw64[\\/]bin[\\/]/i.test(src)) continue;
    paths.add(src);
  }
  return [...paths].sort((a,b)=>a.localeCompare(b,'en'));
}
export function verifyWinDllBundle(bundle,manifest) {
  if (manifest.platform!=='win32'||manifest.experimentalWindowsBuild!==true)
    throw new Error('ORIGINAL_WINDOWS_NATIVE_BUILD_REQUIRED');
  const lockFile = path.join(bundle,'runtime-dll-lock.json');
  const bytes=fs.readFileSync(lockFile);
  if (sha256(bytes)!==manifest.windowsRuntimeLockSha256)
    throw new Error('WINDOWS_DLL_LOCK_MISMATCH');
  const lock=JSON.parse(bytes.toString('utf8'));
  if(lock.schema!==1||lock.kind!=='ORIGINAL_OXCE_MINGW_RUNTIME'||
     !lock.dlls||Array.isArray(lock.dlls))throw new Error('WINDOWS_DLL_LOCK_INVALID');
  for(const [name,digest] of Object.entries(lock.dlls)){
    if(name!==path.basename(name)||!/^[-+a-zA-Z0-9_.]+\.dll$/i.test(name)||
       !/^[a-f0-9]{64}$/.test(digest))throw new Error('WINDOWS_DLL_ENTRY_INVALID');
    const p=path.join(bundle,name);
    if(!fs.statSync(p).isFile()||sha256(fs.readFileSync(p))!==digest)
      throw new Error('WINDOWS_DLL_HASH_MISMATCH: '+name);
  }
  if(Object.keys(lock.dlls).length<3)throw new Error('WINDOWS_DLLS_MISSING');
  return lock;
}
export function packWindowsNativeRuntime(binary) {
  if(process.platform!=='win32')throw new Error('WINDOWS_NATIVE_PACKAGING_REQUIRED');
  binary=fs.realpathSync(binary);
  const bundle=path.dirname(binary);
  const manifestFile=path.join(bundle,'native-build.json');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest.platform!=='win32'||manifest.experimentalWindowsBuild!==true||
     sha256(fs.readFileSync(binary))!==manifest.binarySha256)
    throw new Error('ORIGINAL_NATIVE_BINARY_MANIFEST_MISMATCH');
  const r=spawnSync('ntldd',['-R',binary],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(r.error||r.status!==0)
    throw new Error('WINDOWS_RECURSIVE_NTLDD_FAILED: '+(r.error?.message??r.stderr));
  const deps=parseNtldd(r.stdout);
  if(!deps.length)throw new Error('WINDOWS_NATIVE_DLL_DEPENDENCIES_NOT_DETECTED');
  const dlls={};
  for(const src of deps){
    if(!fs.statSync(src).isFile())throw new Error('WINDOWS_DLL_SOURCE_MISSING: '+src);
    const name=path.basename(src);
    if(Object.hasOwn(dlls,name))throw new Error('DUPLICATE_WINDOWS_DLL_NAME: '+name);
    const dst=path.join(bundle,name);
    fs.copyFileSync(src,dst);
    dlls[name]=sha256(fs.readFileSync(dst));
  }
  const lock={schema:1,kind:'ORIGINAL_OXCE_MINGW_RUNTIME',dlls};
  const lockBytes=Buffer.from(JSON.stringify(lock,null,2)+'\n');
  fs.writeFileSync(path.join(bundle,'runtime-dll-lock.json'),lockBytes,{flag:'wx'});
  manifest.windowsRuntimeLockSha256=sha256(lockBytes);
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  verifyWinDllBundle(bundle,manifest);
  return {count:Object.keys(dlls).length,bundle,windowsRuntimeLockSha256:manifest.windowsRuntimeLockSha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw new Error('Usage: node windows-runtime.mjs PATH_TO_OXCE_NATIVE_EXE');
    console.log(JSON.stringify(packWindowsNativeRuntime(process.argv[2]),null,2));
  }catch(e){console.error('WINDOWS_NATIVE_RUNTIME_ERROR: '+e.message);process.exitCode=1;}
}
