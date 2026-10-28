#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Local-only archive packer. This does NOT run the game or publish assets.
// Preserve all non-audio files from vanilla and installed mods, including
// the active ratlingVillageVisibility mod. Native OXCE must be muted at runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOTS=['UFO','TFTD','common','standard','user/mods'];
const AUDIO_EXT=new Set(['.ogg','.wav','.mp3','.flac','.aiff','.aif','.mid','.midi','.xm','.s3m','.it']);
const EXCLUDED_EXT=new Set(['.sav','.bak','.log','.tmp']);
const SECRET=/^\s*(?:password|token|access_token|refresh_token|api_?key|secret|secret_?key|email)\s*:/i;
export function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}

function normalize(p){return p.split(path.sep).join('/');}
export function shouldCopy(rel){
  const segments=normalize(rel).split('/');
  const base=segments.at(-1);
  const ext=path.extname(base).toLowerCase();
  if(segments.some(s=>['sound','sounds'].includes(s.toLowerCase())))return false;
  if(AUDIO_EXT.has(ext)||EXCLUDED_EXT.has(ext))return false;
  if(base.startsWith('.')||base.includes('.backup_before_')||base.endsWith('.old'))return false;
  return true;
}
export function sanitizeOptions(bytes){
  const text=Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes);
  const lines=text.split(/\r?\n/).filter(s=>!SECRET.test(s));
  return lines.join('\n').replace(/\n*$/,'')+'\n';
}
function safeWithin(root,file){
  const rel=path.relative(root,file);
  return rel && rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);
}
function enumerate(source,rel,results){
  const full=path.join(source,rel);
  for(const e of fs.readdirSync(full,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    const next=path.join(rel,e.name);
    if(e.isSymbolicLink())throw new Error('RESOURCE_SYMLINK_REJECTED: '+normalize(next));
    if(e.isDirectory()){
      if(['sound','sounds'].includes(e.name.toLowerCase()))continue;
      enumerate(source,next,results);
    }else if(e.isFile()&&shouldCopy(next))results.push(next);
  }
}
export function packageHeadlessAssets(gameRoot,savePath,out,{archive=true}={}){
  gameRoot=fs.realpathSync(gameRoot);savePath=fs.realpathSync(savePath);out=path.resolve(out);
  const mods=path.join(gameRoot,'user','mods'),options=path.join(gameRoot,'user','options.cfg');
  if(!safeWithin(path.join(gameRoot,'user'),savePath)||!savePath.endsWith('.sav'))
    throw new Error('SAVE_MUST_BE_USER_LOCAL_SAV');
  if(!fs.statSync(options).isFile())throw new Error('OPTIONS_CFG_REQUIRED');
  if(!fs.statSync(mods).isDirectory())throw new Error('MODS_DIRECTORY_REQUIRED');
  if(out===gameRoot||out.startsWith(gameRoot+path.sep))throw new Error('OUTPUT_MUST_NOT_BE_GAME_INSTALL');
  if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS');
  const rel=[];
  for(const top of DATA_ROOTS){
    const root=path.join(gameRoot,top);
    if(!fs.statSync(root).isDirectory())throw new Error('DATA_ROOT_MISSING: '+top);
    enumerate(gameRoot,top,rel);
  }
  if(!rel.length)throw new Error('NO_GAME_DATA_FILES');
  fs.mkdirSync(out,{recursive:true});
  const stage=path.join(out,'bundle');
  const data=path.join(stage,'data'),inputs=path.join(stage,'inputs'),config=path.join(stage,'config');
  fs.mkdirSync(data,{recursive:true});fs.mkdirSync(inputs,{recursive:true});fs.mkdirSync(config,{recursive:true});
  const files={};
  let total=0;
  // Keep game data and user mods layout distinct: --data points to data,
  // --user points to data/user (the launcher makes its own writable sandbox).
  for(const part of rel){
    const bytes=fs.readFileSync(path.join(gameRoot,part));
    const target=path.join(data,part);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,bytes);
    const hash=sha256(bytes);
    if(sha256(fs.readFileSync(target))!==hash)throw new Error('COPY_HASH_MISMATCH: '+part);
    files[normalize(part)]={sha256:hash,bytes:bytes.length};total+=bytes.length;
  }
  const saveBytes=fs.readFileSync(savePath);
  const saveFile=path.join(inputs,'3.sav');
  fs.writeFileSync(saveFile,saveBytes);
  const clean=Buffer.from(sanitizeOptions(fs.readFileSync(options)));
  const cfg=path.join(config,'options.cfg');
  fs.writeFileSync(cfg,clean);
  const originalSaveHash=sha256(saveBytes);
  const manifest={schema:1,kind:'LOCAL_ONLY_OXCE_HEADLESS_RESOURCE_PACK',
    sourceSaveSha256:originalSaveHash,
    sourceSaveSize:saveBytes.length,
    sanitizedConfigSha256:sha256(clean),
    gameAssetFiles:rel.length,
    gameAssetBytes:total,
    skippedAudioByPolicy:true,
    preservedAllInstalledMods:true,
    runnerAudioDisabledRequired:true,
    externalUploadPerformed:false,
    files};
  fs.writeFileSync(path.join(stage,'resource-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  if(sha256(fs.readFileSync(savePath))!==originalSaveHash)
    throw new Error('ORIGINAL_SAVE_CHANGED_DURING_PACKAGING');
  if(archive){
    const tar=spawnSync('tar',['-czf','oxce-3sav-resources.tar.gz','-C','bundle','.'],{
      cwd:out,encoding:'utf8',maxBuffer:8*1024*1024});
    if(tar.status!==0||tar.error)throw new Error('RESOURCE_ARCHIVE_FAILED: '+String(tar.stderr||tar.error));
  }
  return {schema:1,files:rel.length,totalBytes:total,
    sourceSaveSha256:originalSaveHash,archive:archive?path.join(out,'oxce-3sav-resources.tar.gz'):null,
    archiveBytes:archive?fs.statSync(path.join(out,'oxce-3sav-resources.tar.gz')).size:0,
    output:out,installedModsPreserved:true,externalUploadPerformed:false};
}
export function verifyHeadlessAssets(bundle){
  bundle=fs.realpathSync(bundle);
  const manifest=JSON.parse(fs.readFileSync(path.join(bundle,'resource-manifest.json'),'utf8'));
  if(manifest.schema!==1||manifest.kind!=='LOCAL_ONLY_OXCE_HEADLESS_RESOURCE_PACK'||
     !manifest.skippedAudioByPolicy||!manifest.preservedAllInstalledMods||
     !manifest.runnerAudioDisabledRequired)
    throw new Error('INVALID_HEADLESS_ASSET_MANIFEST');
  let sum=0,count=0;
  for(const [part,meta] of Object.entries(manifest.files)){
    if(part.startsWith('/')||part.includes('\\')||part.split('/').includes('..')||!shouldCopy(part)||
       !/^[a-f0-9]{64}$/.test(meta.sha256)||!Number.isSafeInteger(meta.bytes))
      throw new Error('INVALID_ASSET_PATH_OR_METADATA: '+part);
    const data=fs.readFileSync(path.join(bundle,'data',part));
    if(data.length!==meta.bytes||sha256(data)!==meta.sha256)
      throw new Error('HEADLESS_ASSET_HASH_MISMATCH: '+part);
    sum+=data.length;count++;
  }
  if(count!==manifest.gameAssetFiles||sum!==manifest.gameAssetBytes)
    throw new Error('HEADLESS_ASSET_COUNTS_MISMATCH');
  if(sha256(fs.readFileSync(path.join(bundle,'inputs','3.sav')))!==manifest.sourceSaveSha256||
     sha256(fs.readFileSync(path.join(bundle,'config','options.cfg')))!==manifest.sanitizedConfigSha256)
    throw new Error('HEADLESS_ASSET_INPUT_HASH_MISMATCH');
  if(fs.readFileSync(path.join(bundle,'config','options.cfg'),'utf8').split(/\r?\n/).some(s=>SECRET.test(s)))
    throw new Error('SENSITIVE_OPTION_COPIED');
  return {validated:true,files:count,bytes:sum,sourceSaveSha256:manifest.sourceSaveSha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [first,...rest]=process.argv.slice(2);
    if(first==='--verify'&&rest.length===1)
      console.log(JSON.stringify(verifyHeadlessAssets(rest[0]),null,2));
    else if(first&&rest.length===2)
      console.log(JSON.stringify(packageHeadlessAssets(first,rest[0],rest[1]),null,2));
    else throw new Error('Usage: node prepare-runtime-assets.mjs GAME_ROOT SOURCE_3.SAV NEW_OUTPUT_DIR | --verify EXISTING_BUNDLE_DIR');
  }catch(e){console.error('HEADLESS_RESOURCES_ERROR: '+e.message);process.exitCode=1;}
}
