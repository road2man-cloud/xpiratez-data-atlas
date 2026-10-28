#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Repackages a LOCKED native OXCE snapshot after explicitly updating ONLY
// the replay adapter and its finish-event instrumentation. Does not build
// substitute game logic or alter the original gameplay sourceFiles hash.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,patchBattleFinish} from './prepare-native.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const tarPath=p=>process.platform==='win32' ? p.replace(/^([A-Za-z]):[\\/]/,(_,drive)=>'/'+drive.toLowerCase()+'/').replace(/\\/g,'/') : p;
export function refreshSnapshot() {
  const archive=path.join(HERE,'native/oxce-source.tar.gz');
  const lockPath=path.join(HERE,'native/source.lock.json');
  const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
  if (sha256(fs.readFileSync(archive))!==lock.archiveSha256)
    throw new Error('SOURCE_ARCHIVE_HASH_MISMATCH');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-native-refresh-'));
  const next=archive+'.next';
  try {
    const extract=spawnSync('tar',['-xzf',tarPath(archive),'-C',tarPath(temp)],{encoding:'utf8'});
    if(extract.status!==0)throw new Error('EXTRACT_FAILED: '+extract.stderr);
    const manifestPath=path.join(temp,'native-source-manifest.json');
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if(manifest.sourceTreeSha256!==lock.sourceTreeSha256 ||
       sha256(JSON.stringify(manifest.sourceFiles))!==lock.sourceTreeSha256)
      throw new Error('ORIGINAL_SOURCE_TREE_MISMATCH');
    const state='src/Battlescape/BattlescapeState.cpp';
    const statePath=path.join(temp,state);
    let code=fs.readFileSync(statePath,'utf8').replace(/\r\n/g,'\n');
    if(!code.includes('NativeReplay::onBattleFinished'))code=patchBattleFinish(code);
    fs.writeFileSync(statePath,code);
    const driverPath=path.join(temp,'src/Headless/ReplayDriver.h');
    const localDriver=fs.readFileSync(path.join(HERE,'native/ReplayDriver.h'),'utf8').replace(/\r\n/g,'\n');
    fs.writeFileSync(driverPath,localDriver);
    manifest.driverSha256=sha256(localDriver);
    manifest.patchedFiles[state]=sha256(code);
    manifest.patchedFiles['src/Headless/ReplayDriver.h']=manifest.driverSha256;
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    if(fs.existsSync(next))throw new Error('STALE_STAGING_ARCHIVE');
    const packed=spawnSync('tar',['-czf',tarPath(next),'-C',tarPath(temp),'.'],{encoding:'utf8'});
    if(packed.status!==0)throw new Error('ARCHIVE_CREATE_FAILED: '+packed.stderr);
    const bytes=fs.readFileSync(next);
    const nextLock={...lock,archiveSha256:sha256(bytes),archiveBytes:bytes.length,
      driverSha256:manifest.driverSha256};
    fs.renameSync(next,archive);
    fs.writeFileSync(lockPath,JSON.stringify(nextLock,null,2)+'\n');
    return {archiveSha256:nextLock.archiveSha256,archiveBytes:nextLock.archiveBytes,
      sourceTreeSha256:nextLock.sourceTreeSha256,driverSha256:nextLock.driverSha256};
  } finally {
    if(fs.existsSync(next))fs.rmSync(next,{force:true});
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(refreshSnapshot(),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
