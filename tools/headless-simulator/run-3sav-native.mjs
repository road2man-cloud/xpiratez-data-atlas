#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Reproducible first-turn OXCE native evaluation of the exact 3.sav campaign.
// NEVER run on Windows; NEVER use a surrogate battle engine.
// Requires the private, locally produced 99.1-MiB resource TAR, not present in
// the public repository. Real victory and first-turn safety come only from OXCE.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runNative} from './run-native.mjs';
import {writeNativePlans} from './generate-native-plans.mjs';
import {runNativeBatch,scoreNativeCheckpoint,scoreNativeTerminal,parseBattleUnits} from './search-native.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
export const SAVE_HASH='28faf3920b016b81ad041b12f63de94548634375b33b2c07fa1fddb184c38a61';
export const ARCHIVE_HASH='0d01f3d29e53726803e42575206a8182e8a96490c2c643d257e8ac0b9b8c2f0e';
const MODS=['user/mods/Piratez/metadata.yml',
  'user/mods/Ratling Village Visibility/metadata.yml'];
const ACTORS=[19,35,33,10,12,48,46,6,23,3];
const ITEMS=[113,114,115,116,117,118,119,120,137,168];
const TARGETS=[1000017,1000025];
export function parse3SavArgs(argv){
  const values=new Set(['--archive','--binary','--manifest','--runtime',
    '--out','--count','--start-seed','--timeout']);
  const flags=new Set(['--xvfb','--smoke-only']);
  const args={};
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(Object.hasOwn(args,k))throw new Error('DUPLICATE_ARGUMENT: '+k);
    if(flags.has(k)){args[k]=true;continue;}
    if(!values.has(k)||!argv[i+1]||argv[i+1].startsWith('--'))
      throw new Error('INVALID_ARGUMENT: '+k);
    args[k]=argv[++i];
  }
  for(const key of ['--archive','--binary','--manifest','--out'])
    if(!args[key])throw new Error('REQUIRED_ARGUMENT: '+key);
  const count=Number(args['--count']||1);
  if(!Number.isSafeInteger(count)||count<1||count>100)
    throw new Error('TRIALS_PER_PLAN_MUST_BE_1_TO_100');
  if(count>1&&!args['--start-seed'])
    throw new Error('MULTIPLE_TRIALS_REQUIRE_EXPLICIT_START_SEED');
  if(args['--start-seed']&&(!/^[1-9][0-9]*$/.test(args['--start-seed'])||
     BigInt(args['--start-seed'])+BigInt(count-1)>18446744073709551615n))
    throw new Error('INVALID_UINT64_START_SEED');
  const timeout=Number(args['--timeout']||180);
  if(!Number.isInteger(timeout)||timeout<1||timeout>86400)
    throw new Error('INVALID_NATIVE_TIMEOUT');
  return {args,count,timeout};
}
function hashFile(file){
  const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r');
  try{
    const data=Buffer.allocUnsafe(256*1024);let n;
    while((n=fs.readSync(fd,data))>0)h.update(data.subarray(0,n));
    return h.digest('hex');
  }finally{fs.closeSync(fd);}
}
function requireFile(file){if(!fs.statSync(file).isFile())throw new Error('EXPECTED_FILE: '+file);}
export function inspectArchiveListing(text){
  if(typeof text!=='string')throw new Error('INVALID_ARCHIVE_LIST');
  const names=text.split(/\r?\n/).filter(Boolean);
  const found=new Set();
  for(const original of names){
    const n=original.replace(/^\.\//,'').replace(/\/$/,'');
    if(!n||n.startsWith('/')||n.includes('\\')||n.split('/').includes('..')||
       /^[A-Za-z]:/.test(n))throw new Error('UNSAFE_PRIVATE_TAR_ENTRY: '+n);
    if(/\.(sav)$/i.test(n)&&n!=='inputs/3.sav')
      throw new Error('OTHER_CAMPAIGN_SAVE_DETECTED');
    if(/\/SOUNDS?\//i.test(n)||/\.(ogg|wav|mp3|flac|aiff?)$/i.test(n))
      throw new Error('AUDIO_RESOURCE_DETECTED');
    found.add(n);
  }
  for(const req of ['inputs/3.sav','config/options.cfg','UFO','standard',
                      'common','TFTD',...MODS])
    if(!found.has(req))throw new Error('REQUIRED_ORIGINAL_RESOURCE_MISSING: '+req);
  return {memberCount:names.length,verifiedModNames:['piratez','ratlingVillageVisibility']};
}
function tar(args){
  const t=spawnSync('tar',args,{encoding:'utf8',maxBuffer:12*1024*1024});
  if(t.error||t.status!==0)
    throw new Error('TAR_FAILED: '+String(t.stderr||t.error).slice(-1700));
  return t.stdout;
}
export async function run3Sav(options){
  if(process.platform!=='linux')
    throw new Error('GPT_LINUX_ONLY: NEVER_RUN_ORIGINAL_COMBAT_ON_WINDOWS_PC');
  const {args,count,timeout}=options;
  const archive=fs.realpathSync(args['--archive']);
  requireFile(archive);
  if(hashFile(archive)!==ARCHIVE_HASH)
    throw new Error('ORIGINAL_3SAV_RESOURCE_ARCHIVE_HASH_MISMATCH');
  const listing=inspectArchiveListing(tar(['-tzf',archive]));
  const binary=fs.realpathSync(args['--binary']);
  const manifest=fs.realpathSync(args['--manifest']);
  requireFile(binary);requireFile(manifest);
  const identity=JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(identity.sourceVariant!=='R43_RC17_ORIGINAL_SOURCE')
    throw new Error('RC17_ORIGINAL_ENGINE_REQUIRED_FOR_3SAV');
  const out=path.resolve(args['--out']);
  if(fs.existsSync(out))throw new Error('OUTPUT_ALREADY_EXISTS');
  fs.mkdirSync(out,{recursive:true});
  const data=path.join(out,'original-game-input');
  fs.mkdirSync(data,{recursive:true});
  tar(['-xzf',archive,'-C',data]);
  const save=path.join(data,'inputs/3.sav');
  const user=path.join(data,'user'),config=path.join(data,'config/options.cfg');
  const expected={sourceSaveSha256:SAVE_HASH,archiveSha256:ARCHIVE_HASH,
    sourceVariant:identity.sourceVariant,engineEvaluated:false,
    originalSourceOnly:true,hasRatlingVisibility:true,archiveListing:listing};
  fs.writeFileSync(path.join(out,'input-provenance.json'),JSON.stringify(expected,null,2)+'\n');
  if(hashFile(save)!==SAVE_HASH||!fs.statSync(config).isFile()||
     MODS.some(p=>!fs.statSync(path.join(data,p)).isFile()))
    throw new Error('EXTRACTED_ORIGINAL_CAMPAIGN_RESOURCES_CHANGED');
  // From here ONLY run-native executes gameplay and logs exact OXCE effects.
  const baseline=path.join(out,'baseline-native');
  const common={'--experimental':true,'--binary':binary,'--manifest':manifest,
    '--data':data,'--user':user,'--config':config,'--save':save,
    '--timeout':String(timeout),...(args['--xvfb']?{'--xvfb':true}:{}),
    ...(args['--runtime']?{'--runtime':args['--runtime']}:{}),
    ...(args['--start-seed']?{'--seed':args['--start-seed']}:{}),
    '--plan':path.join(HERE,'examples/end-turn.actions'),'--out':baseline};
  const native=await runNative(common);
  let firstTurn=null,terminal=null;
  const initial=parseBattleUnits(fs.readFileSync(save,'utf8'));
  if(native.nativeBattleFinished){
    const finalFile=path.join(baseline,'user','piratez','xpz-native-battle-entry.sav');
    terminal=scoreNativeTerminal(initial,parseBattleUnits(fs.readFileSync(finalFile,'utf8')),
      native.nativeMissionOutcome);
  }else if(native.checkpoints.length){
    firstTurn=scoreNativeCheckpoint(initial,native.checkpoints.at(-1),native.checkpoints[0].turn);
  }
  const proof={schema:1,kind:'ACTUAL_OXCE_NATIVE_BASELINE',
    sourceSaveSha256:SAVE_HASH,sourceVariant:identity.sourceVariant,
    nativeBattleFinished:native.nativeBattleFinished,
    planCompleted:native.planCompleted,
    nativeOutcome:native.nativeMissionOutcome,
    firstTurnSafety:firstTurn,terminal,
    noSurrogate:true,parityCertified:false,battleVictoryCertified:false,
    sourceArchiveSha256:ARCHIVE_HASH,
    binarySha256:native.binarySha256};
  fs.writeFileSync(path.join(out,'3sav-native-baseline.json'),JSON.stringify(proof,null,2)+'\n');
  if(args['--smoke-only'])return {baseline:proof,batch:null};
  if(!firstTurn&&!native.nativeBattleFinished)
    throw new Error('FIRST_TURN_NOT_COMPLETED: do not claim trial results');
  const plans=path.join(out,'first-shot-candidates');
  const generated=writeNativePlans(save,plans,{
    modes:['snap','aimed','auto'],
    endTurn:true,maxPlans:60,actorIds:ACTORS,itemIds:ITEMS,targetIds:TARGETS
  });
  if(generated.planCount!==60)
    throw new Error('UNEXPECTED_3SAV_CANDIDATE_COUNT');
  delete common['--seed'];delete common['--plan'];
  common['--out']=path.join(out,'native-search');
  const batch=await runNativeBatch({
    args:common,plans,count,continueOnError:true,
    startSeed:args['--start-seed']?BigInt(args['--start-seed']):null
  });
  return {baseline:proof,batchStatus:batch.status,
    completedNativeTrials:batch.completedTrials,
    actualNativeWins:Object.values(batch.byPlan).reduce((s,p)=>s+p.finishWon,0),
    actualPlayerTurnCheckpoints:Object.values(batch.byPlan).reduce((s,p)=>s+p.playerTurnCheckpoints,0),
    candidateCount:generated.planCount,
    reportPath:path.join(common['--out'],'native-search-report.json')};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await run3Sav(parse3SavArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error('NATIVE_3SAV_REPLAY_FAILED: '+String(e.message||e));process.exitCode=1;}
}
