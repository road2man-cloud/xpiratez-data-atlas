// SPDX-License-Identifier: GPL-3.0-or-later
// Windows OXCE dependency package proof; NOT a battle or GUI parity test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseNtldd,verifyWinDllBundle} from './windows-runtime.mjs';
import {sha256} from './prepare-native.mjs';

test('recursive ntldd parser packages only mingw DLL dependencies, not Windows system DLLs',()=>{
  const sample=[
    '  SDL.dll => C:\\msys64\\mingw64\\bin\\SDL.dll (0x00700000)',
    '  libSDL_mixer-1-2-0.dll => C:\\msys64\\mingw64\\bin\\libSDL_mixer-1-2-0.dll (0x0070)',
    '  libstdc++-6.dll => C:\\msys64\\mingw64\\bin\\libstdc++-6.dll (0x0)',
    '  KERNEL32.dll => C:\\Windows\\system32\\KERNEL32.dll (0x0)',
    '  libSDL_mixer-1-2-0.dll => C:\\msys64\\mingw64\\bin\\libSDL_mixer-1-2-0.dll (0x0070)',
    '  ADVAPI32.dll => C:\\Windows\\system32\\ADVAPI32.dll (0x0)',
  ].join('\n');
  assert.deepEqual(parseNtldd(sample),[
    'C:\\msys64\\mingw64\\bin\\libSDL_mixer-1-2-0.dll',
    'C:\\msys64\\mingw64\\bin\\libstdc++-6.dll',
    'C:\\msys64\\mingw64\\bin\\SDL.dll'
  ]);
});
test('Windows runtime detects every DLL alteration and locked manifest changes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-windows-dll-'));
  try{
    const dlls={};
    for(const name of ['SDL.dll','libSDL_mixer.dll','libstdc++-6.dll']){
      const data=Buffer.from('fixture-'+name);
      fs.writeFileSync(path.join(dir,name),data);
      dlls[name]=sha256(data);
    }
    const lock=Buffer.from(JSON.stringify({schema:1,kind:'ORIGINAL_OXCE_MINGW_RUNTIME',dlls},null,2)+'\n');
    fs.writeFileSync(path.join(dir,'runtime-dll-lock.json'),lock);
    const manifest={platform:'win32',experimentalWindowsBuild:true,windowsRuntimeLockSha256:sha256(lock)};
    assert.equal(Object.keys(verifyWinDllBundle(dir,manifest).dlls).length,3);
    fs.appendFileSync(path.join(dir,'SDL.dll'),'malicious-change');
    assert.throws(()=>verifyWinDllBundle(dir,manifest),/WINDOWS_DLL_HASH_MISMATCH/);
    assert.throws(()=>verifyWinDllBundle(dir,{...manifest,windowsRuntimeLockSha256:'0'.repeat(64)}),
      /WINDOWS_DLL_LOCK_MISMATCH/);
    assert.throws(()=>verifyWinDllBundle(dir,{...manifest,platform:'linux'}),
      /ORIGINAL_WINDOWS_NATIVE_BUILD_REQUIRED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
