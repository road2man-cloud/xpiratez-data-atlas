#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Rebase a verified original OXCE native build on ORIGINAL RC17 source bytes.
// This is a source overlay, NOT a battle model. Only a user-requested RC17
// build chooses this path; RC18 remains independently available.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const MANIFEST=path.join(HERE,'native/rc17-source-overlay.json');
const ARCHIVE=path.join(HERE,'native/rc17-source-overlay.tar.gz');
function validFile(name){
  return name.startsWith('src/')&&!name.startsWith('/')&&!name.split('/').includes('..')&&
    /^[a-zA-Z0-9_.\/-]+$/.test(name);
}
export function applyOriginalSourceVariant(root,variant='rc18'){
  if(variant==='rc18')
    return {schema:1,sourceVariant:'RC18_SOURCE_BASELINE',mode:'PINNED_ORIGINAL_SOURCE',
      rc17OverlayManifestSha256:null,rc17OverlayArchiveSha256:null,changedFiles:0,removedFiles:0};
  if(variant!=='rc17')throw new Error('UNSUPPORTED_NATIVE_SOURCE_VARIANT: '+variant);
  const meta=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));
  const lock=JSON.parse(fs.readFileSync(path.join(HERE,'native/source.lock.json'),'utf8'));
  if(meta.schema!==1||meta.variant!=='R43_RC17_ORIGINAL_SOURCE'||
     meta.baseArchiveSha256!==lock.archiveSha256||
     meta.baseSourceTreeSha256!==lock.sourceTreeSha256||
     meta.originalRc17FileCount!==823)
    throw new Error('RC17_OVERLAY_BASE_IDENTITY_MISMATCH');
  if(sha256(fs.readFileSync(ARCHIVE))!==meta.archiveSha256)
    throw new Error('RC17_OVERLAY_ARCHIVE_HASH_MISMATCH');
  if(Object.keys(meta.changed).length!==16||Object.keys(meta.removed).length!==9)
    throw new Error('RC17_OVERLAY_CHANGE_SET_MISMATCH');
  const changed=Object.entries(meta.changed),removed=Object.entries(meta.removed);
  const allowed=changed.map(([f])=>f);
  const expectedChanged=new Set(allowed);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xpz-rc17-apply-'));
  try{
    const listed=spawnSync('tar',['-tzf','native/rc17-source-overlay.tar.gz'],{encoding:'utf8',cwd:HERE});
    if(listed.status!==0||listed.error)throw new Error('RC17_ARCHIVE_LIST_FAILED');
    const names=listed.stdout.split(/\r?\n/).filter(Boolean);
    const included=names.filter(x=>!x.endsWith('/')).map(s=>s.replace(/^\.\//,''));
    if(included.length!==changed.length||included.some(n=>!validFile(n)||!expectedChanged.has(n)))
      throw new Error('UNSAFE_OR_UNEXPECTED_RC17_ARCHIVE_ENTRIES');
    const extracted=spawnSync('tar',['-xzf','native/rc17-source-overlay.tar.gz','-C',tmp],{encoding:'utf8',cwd:HERE});
    if(extracted.status!==0||extracted.error)throw new Error('RC17_ARCHIVE_EXTRACTION_FAILED');
    // Validate EVERY original file before changing the staging source tree.
    for(const [rel,m] of changed){
      if(!validFile(rel)||!m.sha256||!m.beforeSha256)
        throw new Error('INVALID_RC17_SOURCE_ENTRY: '+rel);
      const replacement=path.join(tmp,rel),current=path.join(root,rel);
      if(!fs.statSync(replacement).isFile()||
         sha256(fs.readFileSync(replacement))!==m.sha256||
         sha256(fs.readFileSync(current))!==m.beforeSha256)
        throw new Error('RC17_REPLACEMENT_BYTES_MISMATCH: '+rel);
    }
    for(const [rel,digest] of removed)
      if(!validFile(rel)||sha256(fs.readFileSync(path.join(root,rel)))!==digest)
        throw new Error('RC17_REMOVED_FILE_HASH_MISMATCH: '+rel);
    for(const [rel] of changed)fs.copyFileSync(path.join(tmp,rel),path.join(root,rel));
    for(const [rel] of removed)fs.rmSync(path.join(root,rel));
    return {schema:1,sourceVariant:'R43_RC17_ORIGINAL_SOURCE',mode:'PINNED_ORIGINAL_SOURCE_OVERLAY',
      rc17OverlayManifestSha256:sha256(fs.readFileSync(MANIFEST)),
      rc17OverlayArchiveSha256:meta.archiveSha256,
      originalRc17TreeDigest:meta.originalRc17TreeDigest,
      changedFiles:changed.length,removedFiles:removed.length};
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
