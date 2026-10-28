#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Build the bundled ORIGINAL OXCE source snapshot, not a replacement battle model.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from './prepare-native.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export function checked(command,args,options={}){
  const r=spawnSync(command,args,{stdio:'inherit',shell:false,...options});
  if(r.error)throw r.error;
  if(r.status!==0)throw new Error('NATIVE_BUILD_COMMAND_FAILED: '+command+' status='+r.status);
  return r;
}
export function verifySource(root,manifest){
  if(manifest.schema!==1||manifest.backend!=='OXCE_NATIVE')throw new Error('INVALID_SOURCE_MANIFEST');
  if(sha256(JSON.stringify(manifest.sourceFiles))!==manifest.sourceTreeSha256)throw new Error('SOURCE_MANIFEST_HASH_MISMATCH');
  const expected={...manifest.sourceFiles,...manifest.patchedFiles};
  for(const [name,digest] of Object.entries(expected)){
    if(name.startsWith('/')||name.split(/[\\/]/).includes('..'))throw new Error('UNSAFE_SOURCE_PATH');
    const f=path.join(root,name);
    if(!fs.statSync(f).isFile()||sha256(fs.readFileSync(f))!==digest)throw new Error('SOURCE_FILE_HASH_MISMATCH: '+name);
  }
  if(sha256(fs.readFileSync(path.join(root,'src/Headless/ReplayDriver.h')))!==manifest.driverSha256)throw new Error('DRIVER_HASH_MISMATCH');
}
export function buildNative(out,jobs=2){
  if(process.platform!=='linux')throw new Error('LINUX_BUILD_REQUIRED: Windows builds may check compilation only');
  out=path.resolve(out);
  if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS');
  if(!Number.isSafeInteger(jobs)||jobs<1||jobs>32)throw new Error('INVALID_BUILD_PARALLELISM');
  const lock=JSON.parse(fs.readFileSync(path.join(HERE,'native/source.lock.json'),'utf8'));
  const archive=path.join(HERE,'native/oxce-source.tar.gz');
  if(sha256(fs.readFileSync(archive))!==lock.archiveSha256)throw new Error('SOURCE_ARCHIVE_HASH_MISMATCH');
  const listing=spawnSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(listing.status!==0||listing.error)throw new Error('SOURCE_ARCHIVE_LIST_FAILED');
  for(const name of listing.stdout.split('\n').filter(Boolean))
    if(name.startsWith('/')||name.split('/').includes('..'))throw new Error('UNSAFE_ARCHIVE_PATH');
  const source=path.join(out,'source'),build=path.join(out,'build'),bundle=path.join(out,'bundle');
  fs.mkdirSync(source,{recursive:true});
  checked('tar',['-xzf',archive,'-C',source]);
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'native-source-manifest.json'),'utf8'));
  if(manifest.sourceTreeSha256!==lock.sourceTreeSha256||manifest.driverSha256!==lock.driverSha256)throw new Error('SOURCE_LOCK_MISMATCH');
  verifySource(source,manifest);
  const configure=['-S',source,'-B',build,'-DBUILD_PACKAGE=OFF','-DEMBED_ASSETS=OFF','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_DISABLE_FIND_PACKAGE_OpenGL=TRUE'];
  checked('cmake',configure);
  checked('cmake',['--build',build,'--target','openxcom','--parallel',String(jobs)]);
  const binary=[path.join(build,'bin/openxcom'),path.join(build,'bin/OpenXcom'),path.join(build,'src/openxcom')].find(p=>fs.existsSync(p));
  if(!binary)throw new Error('COMPILED_NATIVE_EXECUTABLE_NOT_FOUND');
  fs.mkdirSync(bundle,{recursive:true});
  fs.copyFileSync(binary,path.join(bundle,'oxce-native'));
  fs.chmodSync(path.join(bundle,'oxce-native'),0o755);
  fs.copyFileSync(path.join(source,'LICENSE.txt'),path.join(bundle,'LICENSE.txt'));
  fs.copyFileSync(path.join(source,'native-source-manifest.json'),path.join(bundle,'native-source-manifest.json'));
  fs.copyFileSync(path.join(HERE,'native/source.lock.json'),path.join(bundle,'source.lock.json'));
  const record={schema:1,backend:'OXCE_NATIVE',parityCertified:false,binarySha256:sha256(fs.readFileSync(binary)),
    sourceTreeSha256:manifest.sourceTreeSha256,driverSha256:manifest.driverSha256,archiveSha256:lock.archiveSha256,
    platform:process.platform,arch:process.arch,buildTime:new Date().toISOString(),configuration:configure.slice(4)};
  fs.writeFileSync(path.join(bundle,'native-build.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({bundle,...record},null,2));
  return record;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [out,jobs]=process.argv.slice(2);if(!out)throw new Error('Usage: node build-native.mjs NEW_OUTPUT_DIR [JOBS=2]');buildNative(out,Number(jobs||2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
