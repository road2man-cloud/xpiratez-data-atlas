// V152: consume V151 checkpoints and produce actual source-bound random
// event item delivery + laboratory transitions. Preserve the item-reserve
// alternative because interrogation consumes the recruitment material.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createCareerReplay} from './atlas-overcap-forward-career-replay-v1.mjs';
import {createRandomItemEventAdapter} from './atlas-overcap-forward-random-event-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const priorPath='tools/data/overcap-forward-career-resume-v1-06b9552d24cdbab11877.json.gz';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const prior=read(priorPath),bulk=read(bulkPath);
assert.equal(prior.priorSha256,sha(fs.readFileSync(bulkPath)));
const data=read('public/data/soldiers-modern-index.json');
data.forwardSupply=read('tools/data/overcap-forward-supply-catalog-v2.json');
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
assert.equal(data.meta.source.metadataSha256,prior.sourceMetadataSha256);
const rawPath='public/data/event-chunks/2.json.gz',cat=data.forwardSupply;
const expected=cat.sourceFiles[rawPath];assert(/^[a-f0-9]{64}$/.test(expected));
let rawBytes=fs.existsSync(rawPath)?fs.readFileSync(rawPath):null;
if(!rawBytes||sha(rawBytes)!==expected)rawBytes=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',cat.sourceCommit+':'+rawPath],{maxBuffer:64*1024*1024});
assert.equal(sha(rawBytes),expected,'Event source must match pinned catalog');
const raw=Object.values(JSON.parse(gunzipSync(rawBytes)).details).find(e=>e.id==='STR_TROUBLESEEKING_ENEMY');assert(raw);
const random=createRandomItemEventAdapter(data,raw,{commit:cat.sourceCommit,path:rawPath,sha256:expected});
const replay=createCareerReplay(data,{maxMonth:3});
const acqs=new Map(bulk.acquisitions.map(a=>[a.id,a]));
const targetProfiles=new Set(['manufacture:STR_RAIDER_SCOUT_RECRUITMENT','manufacture:STR_RAIDER_FLAME_GUARD_RECRUITMENT']);
const policies=[
 {id:'reserve-scout',item:'STR_RAIDER_SCOUT',research:false},
 {id:'scout-to-clans',item:'STR_RAIDER_SCOUT',research:true,free:'STR_RAIDER_CLANS'},
 {id:'mistress-to-scout',item:'STR_RAIDER_MISTRESS',research:true,free:'STR_RAIDER_SCOUT'},
 {id:'mistress-to-clans',item:'STR_RAIDER_MISTRESS',research:true,free:'STR_RAIDER_CLANS'},
 {id:'boss-to-clans',item:'STR_RAIDER_BOSS',research:true,free:'STR_RAIDER_CLANS'}
];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const qty=(w,k)=>Number(w.items[k]||0);
const rows=[],errors=[],distinct=new Map();
function choose(s,pred){const o=replay.options(s).find(pred);assert(o,'Requested action not available');return replay.research(s,o.action);}
function settle(s,free=null){
 for(let i=0;!replay.settled(s);i++){
  assert(i<25,'Cascade limit');
  if(s.world.pendingFree){
   const choices=replay.options(s);
   const o=choices.find(x=>x.action.type==='freeResearch'&&x.action.research===free);
   // The requested outcome must be available; never pick a substitute.
   assert(o,'Requested free outcome unavailable: '+free);
   s=replay.research(s,o.action);
  }else s=choose(s,o=>o.action.type==='sourceResearchDelivery');
 }
 return s;
}
for(const f of prior.resumes){
 const a=acqs.get(f.acquisition);if(!a||!targetProfiles.has(a.profile)||!f.receipt)continue;
 const receipt=f.receipt;
 const base=replay.replay(receipt.actions.slice(1),receipt.difficulty);
 assert.equal(exactStateHash(base.world),receipt.stateHash,'Prior receipt mismatch');
 assert.equal(base.world.funds,receipt.balance);
 for(const policy of policies){
  let s=base;const start=s.actions.length,initial=qty(s.world,policy.item),before=replay.missing(s,a.requirements);
  const beforeResearch=new Set(s.world.researched);
  try{
   assert(replay.settled(s),'Unsettled prior state');
   const o=random.options(s,policy.item)[0];assert(o,'No eligible source script');
   s=random.apply(s,o.action);
   assert.equal(qty(s.world,policy.item),initial,'Event must queue rather than instantly deliver');
   s=settle(s);
   assert.equal(qty(s.world,policy.item),initial+1,'Exactly one delivered item');
   const afterDelivery=qty(s.world,policy.item);
   if(policy.research){
    s=choose(s,o=>o.action.type==='research'&&o.action.id===policy.item);
    s=settle(s,policy.free);
    assert(active(s.world,policy.item)&&active(s.world,policy.free),'Requested research not completed');
    const r=data.researchRules[policy.item];
    assert.equal(qty(s.world,policy.item),afterDelivery-(r.destroyItem?1:0),'Sample accounting');
   }
   const id=key([policy.id,exactStateHash(s.world)]);
   const row={id,acquisition:a.id,profile:a.profile,root:f.root,policy:policy.id,goalIds:a.goalIds,priorStateHash:receipt.stateHash,priorActions:receipt.actions.length,newActions:s.actions.slice(start),trace:s.trace.slice(s.trace.length-(s.actions.length-start)),finalStateHash:exactStateHash(s.world),fullActions:s.actions,balance:s.world.funds,stockBefore:initial,stockAfter:qty(s.world,policy.item),before,after:replay.missing(s,a.requirements),newResearch:[...s.world.researched].filter(k=>!beforeResearch.has(k)&&active(s.world,k)).sort(),status:'CONDITIONAL_SOURCE_BACKED_OUTCOME',actualGameCertified:false,finalAdmission:false};
   rows.push(row);distinct.set(id,row);
  }catch(e){errors.push({acquisition:a.id,root:f.root,policy:policy.id,reason:String(e.message),applied:s.actions.slice(start),stateHash:exactStateHash(s.world)});}
 }
}
const summary={legacyGoals:bulk.goals.length,targetedLegacyGoals:new Set(bulk.acquisitions.filter(a=>targetProfiles.has(a.profile)).flatMap(a=>a.goalIds)).size,attempted:rows.length+errors.length,produced:rows.length,blocked:errors.length,distinctPolicyStates:distinct.size,distinctWorldStates:new Set(rows.map(r=>r.finalStateHash)).size,delivered:rows.length,reserved:rows.filter(r=>r.policy==='reserve-scout').length,researchCompleted:rows.filter(r=>r.policy!=='reserve-scout').length,directRequiredResearchImproved:rows.filter(r=>r.before.research.length>r.after.research.length).length,uniqueNewResearch:[...new Set(rows.flatMap(r=>r.newResearch))].sort(),recruited:0,legacyGoalsConditionallyReplayed:0,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_FORWARD_RANDOM_EVENT_WAVE_V1',scope:'One raw random-list item per eligible event, conditional event occurrence and outcome, explicit delivery and specimen consumption. No repeated event, no mission capture, no admission.',source:random.source,poolSize:random.pool.length,priorPath,priorSha256:sha(fs.readFileSync(priorPath)),bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),summary,rows,errors,actualGameCertified:false};
const out='tools/data/overcap-forward-random-event-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,errors:errors.slice(0,10),sample:rows.slice(0,5).map(r=>({root:r.root,policy:r.policy,newResearch:r.newResearch,stockAfter:r.stockAfter,actions:r.newActions}))}).slice(0,20000));
