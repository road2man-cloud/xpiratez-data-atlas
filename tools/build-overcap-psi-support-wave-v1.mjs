// V170: source-backed magitech/psi research and material-aware facility support.
// Extend the existing V169 campaign, never inject research or inventory.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {restoreV169} from './build-overcap-alchemy-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,repeatCash,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {createMonthlyResearchReward} from './atlas-overcap-forward-monthly-research-reward-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const PRIOR='tools/data/overcap-alchemy-wave-v1-b75c0b93c3e72c197bcf.json';
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const ALLY='STR_TROUBLESEEKING_ALLY',GOLD='STR_GOLD_AT_SEANS_NEW_FACES';
const TARGET='STR_PSI_COMMUNION',GEM='STR_GEMOLOGY',MAG='STR_MAGITECH_SUMMARY';
const FAC=['STR_WELL','STR_STILL','STR_WITCH_CAVE'];
const arr=x=>Array.isArray(x)?x:[];
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const qty=(s,id)=>Number(s.world.items[id]||0);
const hash=s=>receipt(s).stateHash;
function extractProof(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const yaml=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const b=fs.readFileSync(root+'/Piratez.rul'),h=sha(b);
 assert.equal(h,data.meta.source.rules.find(x=>x.file==='Piratez.rul').sha256);
 const d=yaml.load(b.toString('utf8'),{json:true});
 const sourceFiles={'Piratez.rul':h};
 const wanted=new Set([ALLY,GOLD]),events=[],cat=data.forwardSupply;
 for(const [path,digest] of Object.entries(cat.sourceFiles)){
  if(!wanted.size)break;if(!path.startsWith('public/data/event-chunks/'))continue;
  const bytes=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',cat.sourceCommit+':'+path],{maxBuffer:64*1024*1024});
  assert.equal(sha(bytes),digest,path);
  for(const e of Object.values(JSON.parse(gunzipSync(bytes)).details))if(wanted.has(e.id)){
   events.push({raw:e,source:{commit:cat.sourceCommit,path,sha256:digest}});wanted.delete(e.id);
  }
 }
 assert.equal(wanted.size,0);
 return {schema:'ATLAS_OVERCAP_PSI_SUPPORT_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles,engineArchiveSha256:lock.archiveSha256,events,facilities:FAC.map(id=>{const f=d.facilities.find(x=>x.type===id);assert(f);return {id,requires:arr(f.requires),requiresBaseFunc:arr(f.requiresBaseFunc),provideBaseFunc:arr(f.provideBaseFunc),buildCost:f.buildCost,buildTime:f.buildTime,buildCostItems:f.buildCostItems||{},maxAllowedPerBase:f.maxAllowedPerBase??null,monthlyCost:f.monthlyCost};})};
}
export function createPsiSupport(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_PSI_SUPPORT_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [f,h] of Object.entries(proof.sourceFiles))assert.equal(h,data.meta.source.rules.find(x=>x.file===f).sha256);
 for(const e of proof.events){assert.equal(e.source.commit,data.forwardSupply.sourceCommit);assert.equal(e.source.sha256,data.forwardSupply.sourceFiles[e.source.path]);}
 const a=proof.events.find(e=>e.raw.id===ALLY),g=proof.events.find(e=>e.raw.id===GOLD);
 const ally=monthly.adapter(a.raw,a.source),gold=createMonthlyResearchReward(data,rp,monthly,g.raw,g.source);
 const byFac=new Map(proof.facilities.map(f=>[f.id,f]));
 for(const f of proof.facilities){const c=data.forwardSupply.facilities[f.id];assert(c);assert.deepEqual(c.research,f.requires);assert.deepEqual(c.requires,f.requiresBaseFunc);assert.deepEqual(c.provides,f.provideBaseFunc);assert.equal(c.cost,f.buildCost);assert.equal(c.days,f.buildTime);}
 function requirements(s,id){
  const f=byFac.get(id);assert(f);
  const inputs=Object.fromEntries(Object.entries(f.buildCostItems).map(([k,v])=>{assert(Number.isSafeInteger(v.build)&&v.build>0);return [k,v.build];}));
  return {research:f.requires.filter(k=>!active(s,k)),functions:f.requiresBaseFunc.filter(k=>!s.world.baseFunctions.has(k)),items:Object.fromEntries(Object.entries(inputs).filter(([k,n])=>qty(s,k)<n).map(([k,n])=>[k,n-qty(s,k)])),funds:Math.max(0,f.buildCost-s.world.funds),inputs};
 }
 function startOption(s,id){
  const f=byFac.get(id),w=s.world;if(!f||!rp.settled(s)||w.forwardPsiFacilityBuild||w.facilities.has(id))return null;
  const m=requirements(s,id);if(m.research.length||m.functions.length||Object.keys(m.items).length||m.funds)return null;
  return {type:'sourcePsiFacilityStart',id,month:w.month,cost:f.buildCost,materials:m.inputs,days:f.buildTime,assumeFreeBuildableTile:true};
 }
 function completeOption(s){
  const w=s.world,p=w.forwardPsiFacilityBuild;
  if(!p||!rp.settled(s)||s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||w.month!==p.month+Math.ceil(p.days/28))return null;
  return {type:'sourcePsiFacilityComplete',id:p.id,month:w.month,days:p.days,assumeElapsedConstructionDays:true};
 }
 function applyFacility(s,a){
  const w=structuredClone(s.world),f=byFac.get(a.id);assert(f);let cost=0;
  if(a.type==='sourcePsiFacilityStart'){
   assert.deepEqual(a,startOption(s,a.id));cost=a.cost;w.funds-=cost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+cost;
   for(const [id,n] of Object.entries(a.materials))w.items[id]=qty(s,id)-n;
   w.forwardPsiFacilityBuild={id:a.id,month:a.month,days:a.days};
  }else{
   assert.equal(a.type,'sourcePsiFacilityComplete');assert.deepEqual(a,completeOption(s));
   delete w.forwardPsiFacilityBuild;w.facilities.add(f.id);for(const k of f.provideBaseFunc)w.baseFunctions.add(k);
  }
  const procurement=s.procurement+cost;assert.equal(w.funds,s.income-procurement-s.careerSpend);
  return {...s,world:w,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:{kind:'SOURCE_BOUND_MATERIAL_AWARE_FACILITY_CONSTRUCTION',proofSha256:sha(JSON.stringify(proof)),rawRule:f,constructionCalendarConditional:true,maintenanceAndSpaceUnmodeled:true}}]};
 }
 function step(s,a){
  if(a.type==='sourceMonthlyBoundary')return monthly.advance(s,a);
  if(a.type==='sourceMonthlyFixedReward'){assert.equal(a.event,'STR_MAXIMUM_EXPLOITATION');return repeatCash.apply(s,a);}
  if(a.type==='sourceMonthlyItemEvent')return a.event===ALLY?ally.apply(s,a):repeatEnemy.apply(s,a);
  if(a.type==='sourceMonthlyResearchReward'){assert.equal(a.event,GOLD);return gold.apply(s,a);}
  if(a.type==='sourcePsiFacilityStart'||a.type==='sourcePsiFacilityComplete')return applyFacility(s,a);
  return monthly.scripted(a)?monthly.applyLegacy(s,a,(w,x)=>rp.research(w,x)):rp.research(s,a);
 }
 return {ally,gold,requirements,startOption,completeOption,applyFacility,step};
}
export function restoreV170(path){
 const r=read(path);assert.equal(r.priorSha256,sha(fs.readFileSync(PRIOR)));assert.equal(r.proofSha256,sha(JSON.stringify(r.proof)));
 const ad=createPsiSupport(r.proof);let s=restoreV169(PRIOR);assert.equal(hash(s),r.seed.stateHash);
 for(const a of r.actions)s=ad.step(s,a);assert.equal(hash(s),r.continuation.stateHash);return s;
}
function build(){
 const proof=extractProof(),ad=createPsiSupport(proof),seed=restoreV169(PRIOR),prior=read(PRIOR),bulk=read(BULK);
 assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 const reserve={...prior.reserve,STR_PORN:16,STR_VAMPIRE_ESSENCE:1};
 let s=seed;const milestones=[],errors=[];
 function advance(label,fn){
  const before=s;try{
   const n=fn(before);assert.deepEqual(n.actions.slice(0,before.actions.length),before.actions);
   for(const [id,count] of Object.entries(reserve))assert(qty(n,id)>=count,'Reserved material: '+id);
   if(n.actions.length>before.actions.length){s=n;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(id=>active(s,id)&&!active(before,id)),stateHash:hash(s)});}
  }catch(e){errors.push({label,reason:String(e.message)});}
 }
 function sample(st,id,bonus){
  assert(data.researchRules[id].getOneFree.includes(bonus));assert(!st.world.disabled.has(id));
  const type=active(st,id)?'repeatResearch':'research';
  const o=rp.options(st).find(o=>o.action.type===type&&o.action.id===id);
  assert(o,'Sample research not enabled: '+id);
  const n=settle(rp.research(st,o.action),bonus);
  assert(active(n,bonus),'Selected reward not active: '+bonus);return n;
 }
 function capture(st,adapter,id){
  const n=monthly.advance(st),o=adapter.options(n,id)[0];assert(o,'No source reward for '+id);
  return settle(adapter.apply(n,o.action));
 }
 // Choose a supported source in preference order; do not count a failed
 // attempted capture or research. Each successful reward is re-derived.
 function learn(st,bonus,sources){
  if(active(st,bonus))return st;
  const failures=[];
  for(const [id,kind] of sources){
   try{return sample(capture(st,kind==='ally'?ad.ally:repeatEnemy,id),id,bonus);}
   catch(e){failures.push(id+': '+e.message);}
  }
  throw Error(failures.join('; '));
 }
 const noble='STR_HUMAN_NOBLEWOMAN',guild='STR_GUILD_SOLDIER',smuggler='STR_SMUGGLER_CAPTAIN',priest='STR_CHURCH_PRIEST',medic='STR_SECTOID_MEDIC',engineer='STR_SECTOID_ENGINEER';
 const plans=[
  ['STR_YELLOW_GEM',[[guild],[noble],[smuggler]]],
  ['STR_RED_GEM',[[noble],[smuggler],[priest]]],
  ['STR_BLUE_GEM',[['STR_HUMAN_SHARP_GUY'],[noble],[smuggler]]],
  ['STR_GREEN_GEM',[['STR_CHURCH_HANDMAID'],[noble],[smuggler]]],
  ['STR_DIAMOND',[['STR_GUILD_ATTENDANT'],[noble],[smuggler]]],
  ['STR_CHURCH_CORPSE',[[priest],['STR_CHURCH_LEADER']]],
  ['STR_ACADEMY_CORPSE',[[medic],['STR_SECTOID_SOLDIER'],[engineer]]],
  ['STR_ANKH',[['STR_BANDIT_TOMB_RUNNER'],[noble]]],
  ['STR_BLACK_CAT',[[noble],['STR_ACADEMY_COUNSELLOR'],['STR_CHURCH_LEADER']]],
  ['STR_ALIEN_ENTERTAINMENT',[[noble]]],
  ['STR_GOLDEN_CUP',[['STR_BANDIT_TOMB_RUNNER'],[noble],['STR_RAIDER_MISTRESS']]],
  ['STR_SHROOM_BROWN',[[medic],['STR_RAIDER_SCOUT'],['STR_HUMAN_NOMAD']]],
  ['STR_SKULL',[['STR_TURANIAN_UBER','ally']]],
 ];
 for(const [bonus,sources] of plans)advance(bonus,st=>learn(st,bonus,sources));
 for(const id of ['STR_MEDALLION',GEM,MAG,'STR_WITCH_CAVE'])advance(id,st=>lab(st,id));
 for(const id of ['STR_VIP_014','STR_POSTRAPTURE','STR_SWIMSUIT','STR_MEIDO_OUTFIT','STR_SMUGGLER']){
  advance('Gold event '+id,st=>{
   if(active(st,id))return st;const n=monthly.advance(st),o=ad.gold.options(n,id)[0];assert(o,'No source event for '+id);
   return settle(ad.gold.apply(n,o.action));
  });
 }
 // Complete only eligible ordinary target dependencies. Branch choices
 // and random free research must be handled explicitly above.
 const wanted=new Set();
 function walk(id){if(wanted.has(id)||active(s,id))return;wanted.add(id);const r=data.researchRules[id];for(const k of [...arr(r?.dependencies),...arr(r?.requires)])walk(k);}
 for(const id of [TARGET,'STR_ZOMBIE_EMBODIMENT','STR_POLTERGEIST_EMBODIMENT','STR_CAPTAINS_LOG_02','STR_BIKINI_PRODUCTION','STR_PERSON_OF_CULTURE_TRAINING'])walk(id);
 for(let i=0;i<30;i++){
  const o=rp.options(s).find(o=>{const r=data.researchRules[o.action.id];return o.action.type==='research'&&wanted.has(o.action.id)&&r&&!arr(r.disables).length&&!arr(r.getOneFree).length&&!Object.keys(r.getOneFreeProtected||{}).length;});
  if(!o)break;const prev=s;advance('Target support '+o.action.id,st=>lab(st,o.action.id));if(s===prev)break;
 }
 // Fund and construct the first two facilities; never bypass a material
 // shortfall at Witch Cave. Explicit construction completion follows a new month.
 function fund(st,n){let x=st;for(let i=0;x.world.funds<n;i++){assert(i<8);x=monthly.advance(x);const o=repeatCash.options(x)[0];assert(o);x=settle(repeatCash.apply(x,o.action));}return x;}
 function buildFac(st,id){
  if(st.world.facilities.has(id))return st;
  let m=ad.requirements(st,id);
  assert(!m.research.length&&!m.functions.length&&!Object.keys(m.items).length,'Facility material/research prerequisite: '+JSON.stringify(m));
  let n=fund(st,st.world.funds+m.funds);const o=ad.startOption(n,id);assert(o);
  n=ad.applyFacility(n,o);
  for(let i=0;i<Math.ceil(o.days/28);i++)n=monthly.advance(n);
  const done=ad.completeOption(n);assert(done);return ad.applyFacility(n,done);
 }
 for(const id of FAC)advance('Construct '+id,st=>buildFac(st,id));
 for(const id of [TARGET,'STR_POLTERGEIST_EMBODIMENT','STR_ZOMBIE_MEDICINE'])if(!active(s,id)&&rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))advance(id,st=>lab(st,id));
 const actions=s.actions.slice(seed.actions.length);let replay=restoreV169(PRIOR);
 for(const a of actions)replay=ad.step(replay,a);
 assert.deepEqual(receipt(replay),receipt(s));
 const deps=id=>arr(data.researchRules[id]?.dependencies);
 const snap=st=>({month:st.world.month,difficulty:st.world.difficulty,stateHash:hash(st),balance:st.world.funds,stock:Object.fromEntries([...new Set([...Object.keys(reserve),'STR_SKULL','STR_SECTOWEED'])].map(id=>[id,qty(st,id)])),activeResearch:[...st.world.researched].filter(id=>active(st,id)),facilities:[...st.world.facilities],functions:[...st.world.baseFunctions],psiDependencies:deps(TARGET).map(id=>({id,active:active(st,id)})),gemDependencies:deps(GEM).map(id=>({id,active:active(st,id)}))});
 const blockers=Object.fromEntries([TARGET,...deps(TARGET),'STR_ZOMBIE_EMBODIMENT','STR_POLTERGEIST_EMBODIMENT'].map(id=>{const r=data.researchRules[id];return [id,{active:active(s,id),research:arr(r.dependencies).filter(k=>!active(s,k)),functions:arr(r.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k))}];}));
 const acquisitions=prior.acquisitions.map(a=>({...a,missing:rp.missing(s,a.requirements),originNotYetRecruited:true,finalAdmission:false}));
 const report={schema:'ATLAS_OVERCAP_PSI_SUPPORT_WAVE_V1',scope:'Conditional selected events and research, modeled facility construction with explicit materials and cost. Full calendar, economy, score, and native game unverified; no new birth or completed trait set.',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:sha(fs.readFileSync(PRIOR)),bulkPath:BULK,bulkSha256:sha(fs.readFileSync(BULK)),proof,proofSha256:sha(JSON.stringify(proof)),seed:snap(seed),continuation:snap(s),actions,trace:s.trace.slice(seed.trace.length),reserve,milestones,errors,blockers,facilityBlockers:Object.fromEntries(FAC.map(id=>[id,s.world.facilities.has(id)?{built:true,status:'BUILT',research:[],functions:[],items:{},funds:0}:{built:false,status:'NOT_BUILT',...ad.requirements(s,id)}])),acquisitions,summary:{preservedGoals:bulk.goals.length,linkedGoals:new Set(acquisitions.flatMap(a=>a.goalIds)).size,newActions:actions.length,newResearch:[...s.world.researched].filter(id=>active(s,id)&&!active(seed,id)),gemologyBefore:deps(GEM).filter(id=>active(seed,id)).length,gemologyAfter:deps(GEM).filter(id=>active(s,id)).length,gemologyTotal:deps(GEM).length,magitech:active(s,MAG),psiBefore:deps(TARGET).filter(id=>active(seed,id)).length,psiAfter:deps(TARGET).filter(id=>active(s,id)).length,psiTotal:deps(TARGET).length,newFacilities:[...s.world.facilities].filter(id=>!seed.world.facilities.has(id)),newBirths:0,newTraitApplications:0,finalAdmission:0},actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
 const bytes=JSON.stringify(report)+'\n',out='tools/data/overcap-psi-support-wave-v1-'+sha(bytes).slice(0,20)+'.json';
 if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
 console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),summary:report.summary,errors,month:s.world.month,stock:report.continuation.stock,balance:s.world.funds,facilityBlockers:report.facilityBlockers,blockers,hash:hash(s)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
