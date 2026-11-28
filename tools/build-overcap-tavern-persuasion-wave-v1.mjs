// V155: resume the actual V154 checkpoint, then produce independent
// mission recovery/research outcomes. All are conditional, never game-certified.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createCareerReplay} from './atlas-overcap-forward-career-replay-v1.mjs';
import {createRandomItemEventAdapter} from './atlas-overcap-forward-random-event-v1.mjs';
import {createTavernRecovery} from './atlas-overcap-forward-tavern-recovery-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const priorPath='tools/data/overcap-forward-persuasion-wave-v2-2674836969e592b098f2.json.gz';
const eventPath='tools/data/overcap-forward-random-event-wave-v1-18cce509c74a8e4734d5.json.gz';
const sourcePath='tools/data/overcap-tavern-source-v1-b801f976dd2165b698b1.json';
const prior=read(priorPath),eventPrior=read(eventPath),source=read(sourcePath);
const d=read('public/data/soldiers-modern-index.json');
d.forwardSupply=read('tools/data/overcap-forward-supply-catalog-v2.json');d.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
assert.equal(d.meta.source.metadataSha256,prior.sourceMetadataSha256);
const bytes=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',eventPrior.source.commit+':'+eventPrior.source.path],{maxBuffer:64*1024*1024});
assert.equal(sha(bytes),eventPrior.source.sha256);
const raw=Object.values(JSON.parse(gunzipSync(bytes)).details).find(e=>e.id==='STR_TROUBLESEEKING_ENEMY');
const rp=createCareerReplay(d),rnd=createRandomItemEventAdapter(d,raw,eventPrior.source),tavern=createTavernRecovery(d,source,rp,sha(fs.readFileSync(sourcePath)));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
const target='STR_PERSUASION',direct=d.researchRules[target].dependencies,common='STR_MOST_COMMON_POWER';
const profile=d.profiles.find(p=>p.id==='manufacture:STR_RAIDER_SCOUT_RECRUITMENT');
const snapshot=s=>({direct:direct.filter(k=>active(s.world,k)),missingDirect:direct.filter(k=>!active(s.world,k)),commonMissing:d.researchRules[common].dependencies.filter(k=>!active(s.world,k)),persuasion:active(s.world,target),recruitmentMissing:d.researchRules.STR_RAIDER_SCOUT_RECRUITMENT.dependencies.filter(k=>!active(s.world,k)),recruitmentResearch:active(s.world,'STR_RAIDER_SCOUT_RECRUITMENT'),items:Object.fromEntries(Object.keys(profile.acquisitionRequiredItems).map(k=>[k,qty(s.world,k)])),cash:s.world.funds,settled:rp.settled(s)});
function restore(actions){let s=rp.start(actions[0].difficulty);assert.deepEqual(s.actions,actions.slice(0,2));for(const a of actions.slice(2))s=a.type==='sourceRandomEventItem'?rnd.apply(s,a):a.type==='sourceMapRecovery'?tavern.apply(s,a):rp.research(s,a);return s;}
function settle(s){
 for(let i=0;!rp.settled(s);i++){
  assert(i<40);const opts=rp.options(s);
  // A conditional free selection is saved as its own exact action.
  const choice=opts.find(o=>o.action.type==='freeResearch'&&o.action.research==='STR_COINS')||opts[0];
  assert(choice,'Unresolved delivery/reward');s=rp.research(s,choice.action);
 }return s;
}
function lab(s,id){if(active(s.world,id))return s;const choice=rp.options(s).find(o=>o.action.type==='research'&&o.action.id===id);return choice?settle(rp.research(s,choice.action)):s;}
const rows=[],errors=[];
for(const row of prior.rows){
 const seed=restore(row.fullActions);assert.equal(exactStateHash(seed.world),row.finalStateHash);
 assert.equal(qty(seed.world,'STR_RAIDER_SCOUT'),1);
 const victory=tavern.begin(seed);
 const options=tavern.options(victory);assert.equal(options.length,3);
 for(const o of options){
  try{
   let s=tavern.apply(victory,o.action);
   for(const [k,n] of Object.entries(o.action.recovered))assert.equal(qty(s.world,k),qty(victory.world,k)+n);
   assert.equal(tavern.options(s).length,0,'Recovery must not repeat');
   s=lab(s,'STR_BOOK_OF_SERMONS');
   s=lab(s,'STR_OLD_BOOKS');
   s=lab(s,'STR_OLD_EARTH_VOODOO');
   s=lab(s,common);
   s=lab(s,target);
   s=lab(s,'STR_RAIDER_SCOUT_RECRUITMENT');
   assert.equal(qty(s.world,'STR_RAIDER_SCOUT'),1,'Reserved scout consumed');
   const after=snapshot(s),newActions=s.actions.slice(seed.actions.length);
   const receipt={id:key([row.id,exactStateHash(s.world)]),parent:row.id,root:row.root,policy:row.policy,block:o.action.block,randomOldBook:!!o.action.randomPick,recovered:o.action.recovered,before:snapshot(seed),after,newActions,newTrace:s.trace.slice(seed.trace.length),fullActions:s.actions,stateHash:exactStateHash(s.world),actualGameCertified:false,finalAdmission:false};
   // Reconstruct from the initial four-choice campaign path.
   assert.equal(exactStateHash(restore(receipt.fullActions).world),receipt.stateHash);
   rows.push(receipt);
  }catch(e){errors.push({block:o.action.block,randomPick:o.action.randomPick,error:String(e.message)});}
 }
}
const summary={produced:rows.length,blocked:errors.length,uniqueStates:new Set(rows.map(r=>r.stateHash)).size,conditionalVictories:rows.length,conditionalRecovery:rows.length,sermonResearch:rows.filter(r=>r.after.direct.includes('STR_BOOK_OF_SERMONS')).length,oldEarthVoodoo:rows.filter(r=>!r.after.commonMissing.includes('STR_OLD_EARTH_VOODOO')).length,commonPower:rows.filter(r=>r.after.direct.includes(common)).length,persuasion:rows.filter(r=>r.after.persuasion).length,scoutReserved:rows.filter(r=>r.after.items.STR_RAIDER_SCOUT===1).length,recruitmentResearch:rows.filter(r=>r.after.recruitmentResearch).length,actualGameCertified:0,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_TAVERN_PERSUASION_WAVE_V1',scope:'Conditional source-backed mission outcome and recovery, not a native battle simulation. Independent map alternatives, no combined RNG outcomes. Campaign certification remains false.',sourceMetadataSha256:d.meta.source.metadataSha256,priorPath,priorSha256:sha(fs.readFileSync(priorPath)),sourcePath,sourceSha256:sha(fs.readFileSync(sourcePath)),summary,rows,errors,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-tavern-persuasion-wave-v1-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,rows:rows.map(r=>({block:r.block,randomOldBook:r.randomOldBook,recovered:r.recovered,after:r.after,newActions:r.newActions})),errors}));
