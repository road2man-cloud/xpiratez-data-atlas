#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Streaming, local-only OXCE asset package. No battle execution and NO upload.
// "tar" reads all preserved files directly from the original installation,
// eliminating the ~20k per-file Windows copy bottleneck.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sanitizeOptions,shouldCopy} from './prepare-runtime-assets.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const TOP=['UFO','TFTD','common','standard','user/mods'];
const EXCLUDES=[
  '--exclude=*.ogg','--exclude=*.wav','--exclude=*.mp3','--exclude=*.flac',
  '--exclude=*.aiff','--exclude=*.aif','--exclude=*.mid','--exclude=*.midi',
  '--exclude=*.OGG','--exclude=*.WAV','--exclude=*.MP3','--exclude=*.FLAC',
  '--exclude=*.AIFF','--exclude=*.AIF','--exclude=*.MID','--exclude=*.MIDI',
  '--exclude=*.xm','--exclude=*.s3m','--exclude=*.it','--exclude=*.XM','--exclude=*.S3M','--exclude=*.IT',
  '--exclude=*/SOUND','--exclude=*/sound',
  '--exclude=*/Sounds','--exclude=*/SOUNDS','--exclude=*/sounds',
  '--exclude=*/SOUND/*','--exclude=*/sound/*',
  '--exclude=*/Sounds/*','--exclude=*/SOUNDS/*','--exclude=*/sounds/*',
  '--exclude=*.sav','--exclude=*.bak','--exclude=*.log','--exclude=*.tmp',
  '--exclude=*.backup_before_*','--exclude=*.old',
];
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function shaFile(p){const h=crypto.createHash('sha256');const fd=fs.openSync(p,'r');try{
  const buffer=Buffer.allocUnsafe(128*1024);let n;
  while((n=fs.readSync(fd,buffer))>0)h.update(buffer.subarray(0,n));
  return h.digest('hex');
}finally{fs.closeSync(fd);}}
function runTar(args,cwd){
  const x=spawnSync('tar',args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});
  if(x.error||x.status!==0)
    throw new Error('NATIVE_TAR_FAILED: '+(x.stderr||String(x.error)).slice(-2800));
  return x.stdout;
}
function safePath(pathName){
  const p=pathName.replace(/^\.\//,'').replace(/\/$/,'');
  return p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&
    !p.split('/').includes('..')&&!p.split('/').includes('.')&&
    !/^[a-z]:/i.test(p);
}
export function makeRuntimeArchive(gameRoot,save,out,{dryRun=false}={}){
  gameRoot=fs.realpathSync(gameRoot);save=fs.realpathSync(save);out=path.resolve(out);
  const userDir=path.join(gameRoot,'user');
  if(!save.startsWith(userDir+path.sep)||!save.toLowerCase().endsWith('.sav'))
    throw new Error('SAVE_NOT_IN_GAME_USER_DIRECTORY');
  if(out===gameRoot||out.startsWith(gameRoot+path.sep))
    throw new Error('OUTPUT_INSIDE_ORIGINAL_GAME_REJECTED');
  if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS');
  for(const name of TOP){
    if(!fs.statSync(path.join(gameRoot,name)).isDirectory())
      throw new Error('GAME_DATA_DIR_MISSING: '+name);
  }
  const options=path.join(gameRoot,'user','options.cfg');
  if(!fs.statSync(options).isFile())throw new Error('ORIGINAL_OPTIONS_MISSING');
  const originalSaveHash=shaFile(save);
  const originalOptionsHash=shaFile(options);
  const sanitized=Buffer.from(sanitizeOptions(fs.readFileSync(options)));
  const optionHash=sha256(sanitized);
  const manifest={schema:1,kind:'OXCE3_LOCAL_SOUNDLESS_TAR',
    sourceSaveSha256:originalSaveHash,sourceOptionsSha256:originalOptionsHash,
    stagedOptionsSha256:optionHash,sourceSaveBytes:fs.statSync(save).size,
    includedTopLevelDirs:TOP,allInstalledModsPreserved:true,
    originalGameplayRulesRetained:true,audioOnlyFilesExcluded:true,
    audioPolicy:'OXCE_NATIVE_MUTE_AUDIO_REQUIRED',
    otherCampaignSavesExcluded:true,externalUploadPerformed:false,
    outputContainsOriginalUserData:true,
    nativeParityCertified:false,battleSimulated:false};
  if(dryRun)return {archiveBytes:0,manifest,created:false};
  fs.mkdirSync(out,{recursive:true});
  const meta=path.join(out,'staging');
  for(const d of ['inputs','config'])fs.mkdirSync(path.join(meta,d),{recursive:true});
  fs.copyFileSync(save,path.join(meta,'inputs','3.sav'));
  fs.writeFileSync(path.join(meta,'config','options.cfg'),sanitized);
  fs.writeFileSync(path.join(meta,'resource-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const archive='oxce-3sav-resources.tar.gz';
  const args=['-czf',archive,...EXCLUDES,'-C',gameRoot,...TOP,'-C',meta,
    'inputs','config','resource-manifest.json'];
  // The input 3.sav is under staging/inputs; the wildcard exclusions apply to
  // source asset folders. It is unconditionally allowed exactly here.
  // Note tar --exclude=*.sav would also filter inputs/3.sav. Override by
  // explicitly excluding only other saves through our restricted TOP roots:
  const actualArgs=args.filter(x=>x!=='--exclude=*.sav');
  runTar(actualArgs,out);
  const archivePath=path.join(out,archive);
  const members=runTar(['-tzf',archive],out).split(/\r?\n/).filter(Boolean);
  let observedSelectedSave=false,observedConfig=false;
  for(const member of members){
    if(!safePath(member))throw new Error('TAR_UNSAFE_MEMBER_NAME: '+member);
    const m=member.replace(/^\.\//,'').replace(/\/$/,'');
    if(m==='inputs/3.sav')observedSelectedSave=true;
    else if(m==='config/options.cfg')observedConfig=true;
    else if(m==='inputs'||m==='config'||m.startsWith('inputs/')||m.startsWith('config/')){
      if(m!=='inputs'&&m!=='config')
        throw new Error('TAR_UNEXPECTED_USER_INPUT: '+m);
    }else if(m!=='resource-manifest.json'&&!TOP.some(t=>m===t||m.startsWith(t+'/')))
      throw new Error('TAR_UNEXPECTED_SOURCE: '+m);
    if(m.startsWith('user/mods/')&&!shouldCopy(m))
      throw new Error('TAR_AUDIO_OR_BACKUP_LEAKED: '+m);
    if(/\/SOUNDS?\//i.test(m)||/\.(ogg|wav|mp3|flac|aiff?|mid|midi|xm|s3m|it)$/i.test(m))
      throw new Error('TAR_SOUND_LEAKED: '+m);
    if(/\.sav$/i.test(m)&&m!=='inputs/3.sav')
      throw new Error('TAR_OTHER_SAVE_LEAKED: '+m);
  }
  if(!observedSelectedSave||!observedConfig)
    throw new Error('TAR_REQUIRED_INPUTS_MISSING');
  if(shaFile(save)!==originalSaveHash||shaFile(options)!==originalOptionsHash)
    throw new Error('ORIGINAL_SAVE_OR_OPTIONS_CHANGED_DURING_PACKAGE');
  const report={...manifest,created:true,archiveSha256:shaFile(archivePath),
    archiveBytes:fs.statSync(archivePath).size,
    memberCount:members.length,archivePath};
  fs.writeFileSync(path.join(out,'local-package-report.json'),JSON.stringify(report,null,2)+'\n');
  return {created:true,archivePath:report.archivePath,archiveBytes:report.archiveBytes,
    memberCount:report.memberCount,sourceSaveSha256:originalSaveHash,
    archiveSha256:report.archiveSha256,externalUploadPerformed:false};
}
export function verifyRuntimeArchive(out){
  const p=path.join(out,'oxce-3sav-resources.tar.gz');
  const report=JSON.parse(fs.readFileSync(path.join(out,'local-package-report.json'),'utf8'));
  if(report.schema!==1||report.kind!=='OXCE3_LOCAL_SOUNDLESS_TAR'||
     report.archiveSha256!==shaFile(p))throw new Error('TAR_ARCHIVE_HASH_MISMATCH');
  const members=runTar(['-tzf',path.basename(p)],out).split(/\r?\n/).filter(Boolean);
  if(members.length!==report.memberCount)throw new Error('TAR_MEMBER_COUNT_MISMATCH');
  return {validated:true,archiveBytes:fs.statSync(p).size,memberCount:members.length,
    sourceSaveSha256:report.sourceSaveSha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const argv=process.argv.slice(2);
    if(argv[0]==='--verify'&&argv.length===2)
      console.log(JSON.stringify(verifyRuntimeArchive(argv[1]),null,2));
    else if(argv.length===3)
      console.log(JSON.stringify(makeRuntimeArchive(...argv),null,2));
    else throw new Error('Usage: node prepare-runtime-archive.mjs ORIGINAL_GAME_ROOT ORIGINAL_3.SAV NEW_OUTPUT_DIR | --verify PACKAGE_DIR');
  }catch(e){console.error('NATIVE_RESOURCE_ARCHIVE_ERROR: '+e.message);process.exitCode=1;}
}
