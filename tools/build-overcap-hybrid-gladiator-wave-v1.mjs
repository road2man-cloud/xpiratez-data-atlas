// V175: continue the V174 hybrid campaign; produce gladiatorial trait
// combinations from the same recruited origin. Each route is independent.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {restoreV174,createConstructionRecovery} from './build-overcap-hybrid-construction-trait-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,repeatCash,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {member} from './population-growth-replay-core.mjs';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';
const PRIOR='tools/data/overcap-hybrid-construction-trait-wave-v1-35bd0451f1978e338510.json.gz';
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const UI='public/data/soldier-forward-trait-progress-v174.json';
const DEN='STR_BEAST_DEN',GLAD='STR_GLADIATOR_TRAINING',PROFILE='manufacture:STR_RAIDER_SCOUT_RECRUITMENT';
const prior=read(PRIOR),base=createConstructionRecovery(prior.proof);
const active=(s,k)=>s.world.researched.has(k)&&!s.world.disabled.has(k);
const qty=(s,k)=>Number(s.world.items[k]||0);
const hash=s=>receipt(s).stateHash,fileSha=p=>sha(fs.readFileSync(p));
const arr=x=>Array.isArray(x)?x:[];
function source(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const y=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const file='Piratez.rul',bytes=fs.readFileSync(root+'/'+file),h=sha(bytes);
 assert.equal(h,data.meta.source.rules.find(x=>x.file===file).sha256);
 const d=y.load(bytes.toString('utf8'),{json:true}),f=d.facilities.find(x=>x.type===DEN);assert(f);
 const ids=['STR_SLAVE','STR_SLAVE_GLADIATRIX','STR_GUILD_CORPSE','STR_SUPER_STAPLER','STR_WRENCH','STR_SLAVE_SOLDIERS','STR_DURATHREAD_WORKING','STR_PIROMAN_ARMOR',GLAD,'STR_CHRONICLES_001','STR_STEAM_POWER','STR_WORKSHOP','STR_AMMO_MANUFACTURING_1','STR_GAMBLING','STR_PLOTTING','STR_TAMED_REAPER','STR_SWIMSUIT_PRODUCTION','STR_BIKINI_PRODUCTION'];
 return {schema:'ATLAS_OVERCAP_GLADIATOR_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:{[file]:h},engineArchiveSha256:lock.archiveSha256,facility:{id:f.type,research:arr(f.requires),functions:arr(f.requiresBaseFunc),provides:arr(f.provideBaseFunc),cost:f.buildCost,days:f.buildTime,materials:f.buildCostItems||{},maintenance:f.monthlyCost,maxAllowedPerBase:f.maxAllowedPerBase??null},research:d.research.filter(r=>ids.includes(r.name)).map(r=>({id:r.name,dependencies:arr(r.dependencies),requires:arr(r.requires),functions:arr(r.requiresBaseFunc),getOneFree:arr(r.getOneFree)}))};
}
export function createGladiatorSupport(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_GLADIATOR_SOURCE_V1');assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [k,h] of Object.entries(proof.sourceFiles))assert.equal(h,data.meta.source.rules.find(x=>x.file===k).sha256);
 for(const row of proof.research){const r=data.researchRules[row.id];assert(r);assert.deepEqual(row.dependencies,r.dependencies);assert.deepEqual(row.requires,r.requires);assert.deepEqual(row.functions,r.requiresBaseFunc);assert.deepEqual(row.getOneFree,r.getOneFree);}
 const f=proof.facility,c=data.forwardSupply.facilities[DEN];assert.equal(f.id,DEN);assert.equal(f.cost,c.cost);assert.equal(f.days,c.days);assert.deepEqual(f.research,c.research);assert.deepEqual(f.functions,c.requires);assert.deepEqual(f.provides,c.provides);assert.deepEqual(f.materials,{});
 function start(s){
  const w=s.world;if(!rp.settled(s)||w.facilities.has(DEN)||w.forwardGladiatorDenBuild||w.funds<f.cost||!f.research.every(k=>active(s,k))||!f.functions.every(k=>w.baseFunctions.has(k)))return null;
  return {type:'sourceGladiatorDenStart',id:DEN,month:w.month,cost:f.cost,days:f.days,assumeFreeBuildableTile:true};
 }
 function complete(s){
  const w=s.world,b=w.forwardGladiatorDenBuild;
  if(!rp.settled(s)||!b||s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||w.month!==b.month+Math.ceil(f.days/28))return null;
  return {type:'sourceGladiatorDenComplete',id:DEN,month:w.month,days:f.days,assumeElapsedConstructionDays:true};
 }
 function apply(s,a){
  const w=structuredClone(s.world);let cost=0;
  if(a.type==='sourceGladiatorDenStart'){assert.deepEqual(a,start(s));cost=a.cost;w.forwardGladiatorDenBuild={month:a.month,days:a.days};}
  else{assert.equal(a.type,'sourceGladiatorDenComplete');assert.deepEqual(a,complete(s));delete w.forwardGladiatorDenBuild;w.facilities.add(DEN);for(const k of f.provides)w.baseFunctions.add(k);}
  w.funds-=cost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+cost;const procurement=s.procurement+cost;
  assert.equal(w.funds,s.income-procurement-s.careerSpend);
  return {...s,world:w,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:{kind:'SOURCE_BOUND_DEN_CONSTRUCTION',proofSha256:sha(JSON.stringify(proof)),rule:f,maintenanceAndBaseSpaceUnmodeled:true}}]};
 }
 function step(s,a){return a.type.startsWith('sourceGladiatorDen')?apply(s,a):base.step(s,a);}
 return {start,complete,apply,step};
}
function snap(s){return {month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),funds:s.world.funds,actions:s.actions.length,activeResearch:[...s.world.researched].filter(k=>active(s,k)).sort(),disabled:[...s.world.disabled].sort(),stock:{...s.world.items},facilities:[...s.world.facilities].sort(),functions:[...s.world.baseFunctions].sort()};}
function careerSnap(s){const m=member(s.world),f=rp.finish(s);return {body:f.body,statKeys:STAT_KEYS,raw:f.raw,bonus:f.bonus,effective:f.vector,traits:[...m.state.bonusCounts],history:[...m.state.history],stateHash:hash(s),month:s.world.month,balance:s.world.funds};}
export function restoreV175(path,route=null){
 const r=read(path);assert.equal(r.priorSha256,fileSha(PRIOR));assert.equal(r.proofSha256,sha(JSON.stringify(r.proof)));
 for(const [p,h] of Object.entries(r.sources))assert.equal(fileSha(p),h);
 const ad=createGladiatorSupport(r.proof);let s=restoreV174(PRIOR);assert.equal(hash(s),r.seed.stateHash);
 for(const a of r.actions)s=ad.step(s,a);assert.equal(hash(s),r.continuation.stateHash);
 if(route){const row=r.routes.find(x=>x.id===route);assert(row);for(const a of row.applied)s=rp.career(s,a);assert.equal(hash(s),row.actual.stateHash);}
 return s;
}
function build(){
 const proof=source(),ad=createGladiatorSupport(proof),seed=restoreV174(PRIOR),bulk=read(BULK);
 assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 let s=seed;const milestones=[],errors=[];
 function advance(label,fn){
  const before=s;try{const n=fn(before);assert.deepEqual(n.actions.slice(0,before.actions.length),before.actions);assert(n.world.funds>=0);
   if(n.actions.length>before.actions.length){s=n;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(before,k)),stateHash:hash(s)});}
  }catch(e){errors.push({label,reason:String(e.message)});}
 }
 function research(id,bonus=null){advance(id,st=>active(st,id)?st:lab(st,id,bonus));}
 function event(st,adapter,id=null){let n=monthly.advance(st);const o=adapter.options(n,id)[0];assert(o,'Event unavailable '+id);return settle(adapter.apply(n,o.action));}
 function sample(st,id,sources){
  if(active(st,id))return st;const failures=[];
  for(const src of sources){try{
   assert(data.researchRules[src].getOneFree.includes(id));
   let n=st;const type=active(n,src)?'repeatResearch':'research';
   if(!rp.options(n).some(o=>o.action.type===type&&o.action.id===src))n=event(n,repeatEnemy,src);
   const a=rp.options(n).find(o=>o.action.type===type&&o.action.id===src);assert(a,'No sample research '+src);
   n=settle(rp.research(n,a.action),id);assert(active(n,id),'Expected reward missing '+id);return n;
  }catch(e){failures.push(src+': '+e.message);}}
  throw Error(failures.join('; '));
 }
 function fund(st,amount){let n=st;for(let i=0;n.world.funds<amount;i++){assert(i<12);n=event(n,repeatCash);}return n;}
 // Close the exact research chain for the existing gladiator trait.
 for(const [id,sources] of [
 ['STR_SLAVE',['STR_HUMAN_NOBLEWOMAN','STR_SMUGGLER_CAPTAIN']],
 ['STR_SLAVE_GLADIATRIX',['STR_SMUGGLER_CAPTAIN','STR_RAIDER_BOSS']],
 ['STR_GUILD_CORPSE',['STR_GUILD_SOLDIER']],
 ['STR_SUPER_STAPLER',['STR_SECTOID_ENGINEER','STR_GUILD_ENGINEER']],
 ['STR_WRENCH',['STR_RET_HYBRID','STR_GUILD_SOLDIER']],
 ['STR_CONSUMER_GOODS',['STR_SECTOID_SOLDIER']],
 ['STR_MONEY_PURSE',['STR_SECTOID_MEDIC']],
 ['STR_CASH_BAG',['STR_HUMAN_NOBLEWOMAN']],
 ['STR_REAPER_TERRORIST',['STR_GUILD_MEDIC']]
 ])advance(id,st=>sample(st,id,sources));
 for(const id of ['STR_CHRONICLES_001','STR_SLAVE_SOLDIERS','STR_DURATHREAD_WORKING','STR_PIROMAN_ARMOR',GLAD,'STR_STEAM_POWER','STR_WORKSHOP','STR_AMMO_MANUFACTURING_1','STR_GAMBLING','STR_PLOTTING','STR_TAMED_REAPER','STR_SWIMSUIT_PRODUCTION','STR_LEATHER_ARMOR'])research(id);
 advance('Swimsuit research from socializing',st=>{
  if(active(st,'STR_SWIMSUIT'))return st;const o=rp.options(st).find(o=>o.action.type==='repeatResearch'&&o.action.id==='STR_SOCIALIZING');assert(o);
  const n=settle(rp.research(st,o.action),'STR_SWIMSUIT');assert(active(n,'STR_SWIMSUIT'));return n;
 });
 research('STR_BIKINI_PRODUCTION');
 // Research-only gains for the shared zombie origin; no conflicting choice
 // between EMBRACE and REJECT is made in the common branch.
 for(const [id,sources] of [
 ['STR_ZOMBIE_STERILE_TERRORIST',['STR_GUILD_MEDIC','STR_BANDIT_TOMB_RUNNER']],
 ['STR_ZOMBIE_STERILE_CORPSE',['STR_GUILD_MEDIC']],
 ['STR_ZOMBIE_GRUBAS_CORPSE',['STR_GUILD_MEDIC']],
 ['STR_ZOMBIE_SADAKO_TERRORIST',['STR_RET_SECTOGRE']],
 ['STR_ZOMBIE_CARRIE_TERRORIST',['STR_RET_SECTOGRE']],
 ['STR_ARCANE_BOOK',['STR_BANDIT_TOMB_RUNNER','STR_HUMAN_NOBLEWOMAN']]
 ])advance(id,st=>sample(st,id,sources));
 for(const id of ['STR_ZOMBIE','STR_ZOMBIE_ESSENCE','STR_ZOMBIE_SUSTENANCE','STR_MUTANT_PHYSIOLOGY','STR_PSI_INITIATION','STR_PSIONIC_LABORATORY','STR_XENO_TAMING'])if(rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))research(id);
 // Build the source-defined beast den and reserve enough for every route.
 advance('Construct beast den',st=>{if(st.world.facilities.has(DEN))return st;let n=fund(st,proof.facility.cost+35000);const a=ad.start(n);assert(a);n=ad.apply(n,a);for(let i=0;i<Math.ceil(a.days/28);i++)n=monthly.advance(n);const d=ad.complete(n);assert(d);return ad.apply(n,d);});
 advance('Route funds',st=>fund(st,35000));
 const actions=s.actions.slice(seed.actions.length),selected=['STR_BASIC_FIREARMS_TRAINING','STR_PERSONAL_ATTENTION',GLAD],acq=bulk.acquisitions.find(x=>x.profile===PROFILE),routeMap=new Map(),links=[];
 assert(s.actions.some(a=>a.type==='recruit'&&a.profile===PROFILE));
 for(const g of bulk.groups.filter(g=>g.acquisition===acq.id)){
  const requested=g.stages.filter(st=>selected.includes(st.action.transform)).map(st=>st.action),key=JSON.stringify(requested);
  if(!routeMap.has(key)){
   let n=s;const applied=[],blocked=[];
   for(const a of requested){try{n=rp.career(n,a);applied.push(a);}catch(e){blocked.push({action:a,reason:String(e.message)});}}
   let rr=s;for(const a of applied)rr=rp.career(rr,a);assert.deepEqual(receipt(rr),receipt(n));
   const id=sha(JSON.stringify(['hybrid-v175',hash(s),requested,applied])).slice(0,24);
   routeMap.set(key,{id,requested,applied,blocked,actual:careerSnap(n),finalAdmission:false});
  }
  const route=routeMap.get(key);if(route.applied.length)for(const goal of g.goalIds)links.push({goal,group:g.id,partialRoute:route.id,status:'CONDITIONAL_REORDERED_TRAIT_PREFIX',finalAdmission:false});
 }
 const routes=[...routeMap.values()].filter(r=>r.applied.length),deps=data.researchRules.STR_PSI_COMMUNION.dependencies,gladIds=new Set(routes.filter(r=>r.applied.some(a=>a.transform===GLAD)).map(r=>r.id));
 const topics=['STR_PSI_COMMUNION',...deps,'STR_PERSON_OF_CULTURE_TRAINING','STR_FUSION_TRAINING','STR_ZOMBIE','STR_ZOMBIE_ESSENCE','STR_ZOMBIE_SUSTENANCE','STR_ANG_102','STR_RAIDER_FLAME_GUARD','STR_SOLDIER_V_RECRUITMENT'];
 const summary={preservedGoals:bulk.goals.length,newActions:actions.length,newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(seed,k)),newFacilities:[...s.world.facilities].filter(k=>!seed.world.facilities.has(k)),newBirths:0,newTraitApplications:routes.reduce((n,r)=>n+r.applied.length,0),partialRoutes:routes.length,uniqueAppliedStates:new Set(routes.map(r=>r.actual.stateHash)).size,linkedGoals:new Set(links.map(x=>x.goal)).size,gladiatorRoutes:gladIds.size,gladiatorGoals:new Set(links.filter(x=>gladIds.has(x.partialRoute)).map(x=>x.goal)).size,psiBefore:deps.filter(k=>active(seed,k)).length,psiAfter:deps.filter(k=>active(s,k)).length,finalAdmission:0};
 const report={schema:'ATLAS_OVERCAP_HYBRID_GLADIATOR_WAVE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:fileSha(PRIOR),sources:Object.fromEntries([BULK,UI].map(p=>[p,fileSha(p)])),proof,proofSha256:sha(JSON.stringify(proof)),scope:'Branch-local selected event/research and construction; exact modeled transformation transitions on the existing recruited origin. Reordered independent partial routes, not cumulative across routes and not final maxima. Native combat, full calendar, score and economy unverified.',seed:snap(seed),continuation:snap(s),actions,trace:s.trace.slice(seed.trace.length),milestones,errors,routes,links,summary,blockers:Object.fromEntries(topics.map(id=>[id,{active:active(s,id),dependencies:arr(data.researchRules[id]?.dependencies).filter(k=>!active(s,k)),functions:arr(data.researchRules[id]?.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k)),disabled:s.world.disabled.has(id)}])),actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
 let replay=restoreV174(PRIOR);for(const a of actions)replay=ad.step(replay,a);assert.deepEqual(receipt(replay),receipt(s));
 const bytes=gzipSync(JSON.stringify(report)+'\n',{level:9}),out='tools/data/overcap-hybrid-gladiator-wave-v1-'+sha(bytes).slice(0,20)+'.json.gz';
 if(fs.existsSync(out))assert(fs.readFileSync(out).equals(bytes));else fs.writeFileSync(out,bytes,{flag:'wx'});
 const ui=read(UI),b=ui.branches.find(x=>x.id==='hybrid');assert.equal(ui.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(b.stateHash,hash(seed));const ids=ui.goals.map(g=>g.id);
 Object.assign(b,{month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),actionCount:s.actions.length,checkpoint:{...b.checkpoint,version:175,newActions:summary.newActions,newResearch:summary.newResearch.length,psiDone:summary.psiAfter,psiMissing:report.blockers.STR_PSI_COMMUNION.dependencies,facilities:summary.newFacilities,weed:qty(s,'STR_SECTOWEED'),partialRoutes:routes.length,linkedGoals:summary.linkedGoals,gladiatorRoutes:summary.gladiatorRoutes,gladiatorGoals:summary.gladiatorGoals,conditional:true}});
 for(const g of ui.groups){const r=g.branches.find(x=>x.id==='hybrid');r.missing=g.required.filter(k=>!active(s,k));r.disabled=g.required.filter(k=>s.world.disabled.has(k));}
 for(const a of ui.acquisitions){const row=a.branches.find(x=>x.id==='hybrid'),q=bulk.acquisitions.find(x=>x.id===a.id);assert(q);row.missing=rp.missing(s,q.requirements);row.originAlreadyRecruited=s.actions.some(x=>x.type==='recruit'&&x.profile===q.profile);}
 const partialMap=new Map(links.map(x=>[x.goal,x.partialRoute]));
 for(const g of ui.goals){delete g.hybridPartialRoute;if(partialMap.has(g.id))g.hybridPartialRoute=partialMap.get(g.id);}
 ui.hybridPartialRoutes=routes.map(r=>({id:r.id,body:r.actual.body,traits:r.actual.traits,statKeys:r.actual.statKeys,effective:r.actual.effective,applied:r.applied.map(a=>a.transform),finalAdmission:false}));
 ui.hybridPartialSource=out;ui.hybridPartialSourceSha256=sha(bytes);ui.previousProducer=ui.producer;ui.producer=out;ui.producerSha256=sha(bytes);
 assert.deepEqual(ui.goals.map(g=>g.id),ids);assert.equal(ui.finalAdmission,0);
 const uiPath='public/data/soldier-forward-trait-progress-v175.json',uiBytes=JSON.stringify(ui)+'\n';fs.writeFileSync(uiPath,uiBytes);
 console.log(JSON.stringify({out,bytes:bytes.length,uiPath,uiBytes:Buffer.byteLength(uiBytes),summary:{...summary,newResearchCount:summary.newResearch.length,newResearch:undefined},month:s.world.month,balance:s.world.funds,errors,blockers:report.blockers,routes:routes.map(r=>({id:r.id,applied:r.applied.map(a=>a.transform),effective:r.actual.effective,balance:r.actual.balance})),hash:hash(s)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
