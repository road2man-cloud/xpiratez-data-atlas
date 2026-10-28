#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Package the original RC17 source delta from an authorized local source tree.
// This is SOURCE PACKAGING ONLY: never runs the game, AI or combat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE=path.join(HERE,'native/oxce-source.tar.gz');
const OUT=path.join(HERE,'native/rc17-source-overlay.tar.gz');
const LOCK=path.join(HERE,'native/rc17-source-overlay.json');
function files(root,rel=''){
  return fs.readdirSync(path.join(root,rel),{withFileTypes:true})
    .sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).flatMap(e=>{
      if(e.isSymbolicLink())throw new Error('SOURCE_SYMLINK_REJECTED: '+e.name);
      const name=path.posix.join(rel,e.name);
      return e.isDirectory()?files(root,name):e.isFile()?[name]:[];
    });
}
function checked(cmd,args,opts={}){
  const r=spawnSync(cmd,args,{encoding:'utf8',...opts});
  if(r.error||r.status!==0)throw new Error('PACKAGE_COMMAND_FAILED: '+cmd+' '+String(r.stderr||r.error).slice(-2000));
}
export function packageRc17(originalRc17){
  if(fs.existsSync(OUT)||fs.existsSync(LOCK))throw new Error('RC17_PACKAGE_ALREADY_EXISTS');
  originalRc17=fs.realpathSync(originalRc17);
  const sourceLock=JSON.parse(fs.readFileSync(path.join(HERE,'native/source.lock.json'),'utf8'));
  if(sha256(fs.readFileSync(ARCHIVE))!==sourceLock.archiveSha256)
    throw new Error('BASE_SOURCE_ARCHIVE_CHANGED');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-rc17-package-'));
  try{
    checked('tar',['-xzf','native/oxce-source.tar.gz','-C',temp],{cwd:HERE});
    const base=path.join(temp,'src');
    const actual=files(originalRc17);
    const target=files(base);
    const expected=new Set(actual);
    const changed={},removed={};
    let count=0;
    const staging=path.join(temp,'staging');
    // The base archive already has the original headless insertion in the
    // two gameplay controllers. Their RC17 vs RC18 upstream bodies matched;
    // don't overwrite the adapter hook or mistake it for an RC18 difference.
    const headlessPatched=new Set(['Battlescape/BattlescapeGame.cpp','Engine/Game.cpp']);
    for(const p of actual){
      if(headlessPatched.has(p))continue;
      const original=path.join(originalRc17,p),prior=path.join(base,p);
      const contents=fs.readFileSync(original);
      if(!fs.existsSync(prior)||sha256(fs.readFileSync(prior))!==sha256(contents)){
        const dst=path.join(staging,'src',p);
        fs.mkdirSync(path.dirname(dst),{recursive:true});
        fs.writeFileSync(dst,contents);
        changed['src/'+p]={sha256:sha256(contents),size:contents.length,
          beforeSha256:fs.existsSync(prior)?sha256(fs.readFileSync(prior)):null};
        count++;
      }
    }
    for(const p of target)if(!expected.has(p) && p!=='Headless/ReplayDriver.h'){
      const original=fs.readFileSync(path.join(base,p));
      removed['src/'+p]=sha256(original);
    }
    const originalDigest=sha256(JSON.stringify(actual.map(p=>[p,sha256(fs.readFileSync(path.join(originalRc17,p)))])));
    if(count!==16||Object.keys(removed).length!==9)
      throw new Error('UNEXPECTED_RC17_VS_RC18_CHANGE_SET: '+count+' '+Object.keys(removed).length+' CHANGED='+Object.keys(changed).join(',')+' REMOVED='+Object.keys(removed).join(','));
    checked('tar',['-czf','native/rc17-source-overlay.tar.gz','-C',staging,'src'],{cwd:HERE});
    const manifest={schema:1,variant:'R43_RC17_ORIGINAL_SOURCE',
      baseArchiveSha256:sourceLock.archiveSha256,baseSourceTreeSha256:sourceLock.sourceTreeSha256,
      originalRc17FileCount:actual.length,originalRc17TreeDigest:originalDigest,
      archiveSha256:sha256(fs.readFileSync(OUT)),changed,removed};
    fs.writeFileSync(LOCK,JSON.stringify(manifest,null,2)+'\n');
    return {changed:count,removed:Object.keys(removed).length,bytes:fs.statSync(OUT).size,
      sha256:manifest.archiveSha256,rc17SourceFiles:actual.length};
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==3)throw new Error('Usage: node package-rc17.mjs RC17_ORIGINAL_SRC_DIR');
    console.log(JSON.stringify(packageRc17(process.argv[2]),null,2));
  }catch(e){console.error('RC17_PACKAGE_FAILED: '+e.message);process.exitCode=1;}
}
