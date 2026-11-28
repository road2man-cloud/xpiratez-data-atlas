// V173: hybrid campaign GDX orders, rank score witnesses, and reserve procurement.
// All actions are branch-local. No transplant of a late campaign's state.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {restoreV172} from './build-overcap-hybrid-support-wave-v1.mjs';
import {createPsiSupport} from './build-overcap-psi-support-wave-v1.mjs';
import {createIdleResearchInterruptReward} from './atlas-overcap-forward-idle-interrupt-reward-v1.mjs';
import {createMonthlyScoreLedger} from './atlas-overcap-forward-monthly-score-ledger-v1.mjs';
import {createTavernRecovery} from './atlas-overcap-forward-tavern-recovery-v1.mjs';
import {createGdxPrisonLibrary} from './atlas-overcap-forward-gdx-prison-library-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,repeatCash,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const PRIOR='tools/data/overcap-hybrid-support-wave-v1-8e41cb8d7f30a9c0d1c0.json.gz';
const PSI='tools/data/overcap-psi-support-wave-v1-dfd6237af3dd2b53dc72.json';
const SCORE='tools/data/overcap-score-source-v1-f1681bd9d7a1fe3f013c.json.gz';
const GDX='tools/data/overcap-gdx-prison-library-source-v1-4565d6263b83cb9c995f.json';
const TAVERN='tools/data/overcap-tavern-source-v1-b801f976dd2165b698b1.json';
const tavern=createTavernRecovery(data,read(TAVERN),rp,sha(fs.readFileSync(TAVERN)));
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const UI_PRIOR='public/data/soldier-forward-trait-progress-v172.json';
const WEED='STR_SECTOWEED',MED='STR_MED_BAY',MESS='STR_MESS_HALL';
const arr=x=>Array.isArray(x)?x:[];
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const qty=(s,id)=>Number(s.world.items[id]||0);
const hash=s=>receipt(s).stateHash;
const fileSha=p=>sha(fs.readFileSync(p));
const baseProof=read(PSI),scoreProof=read(SCORE),gdxProof=read(GDX);
assert.equal(baseProof.proofSha256,sha(JSON.stringify(baseProof.proof)));
for(const p of [scoreProof,gdxProof])assert.equal(p.engineArchiveSha256,lock.archiveSha256);
const ps=createPsiSupport(baseProof.proof),score=createMonthlyScoreLedger(data,rp,scoreProof,fileSha(SCORE)),gdx=createGdxPrisonLibrary(data,rp,gdxProof,fileSha(GDX));
const topics=['STR_GDX_001','STR_GDX_002','STR_GDX_000','STR_GDX_003','STR_GDX_004','STR_GDX_005','STR_SCHOOL_BOOKS','STR_LIBRARY','STR_GEMOLOGY','STR_MAGITECH_SUMMARY','STR_PERSUASION','STR_PIRATEZ_HIERARCHY','STR_SOCIALIZING','STR_MEDICINE','STR_MED_BAY','STR_PSI_COMMUNION','STR_PSI_INITIATION','STR_MUTANT_PHYSIOLOGY','STR_POLTERGEIST_EMBODIMENT'];
function extractProof(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const yaml=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const bytes=fs.readFileSync(root+'/Piratez.rul'),h=sha(bytes);
 assert.equal(h,data.meta.source.rules.find(x=>x.file==='Piratez.rul').sha256);
 const d=yaml.load(bytes.toString('utf8'),{json:true});
 const item=d.items.find(x=>x.type===WEED);assert(item);
 const facilities=[MED,MESS].map(id=>{const f=d.facilities.find(x=>x.type===id);assert(f);return {id,requires:arr(f.requires),functions:arr(f.requiresBaseFunc),provides:arr(f.provideBaseFunc),materials:f.buildCostItems||{},cost:f.buildCost,days:f.buildTime,maintenance:f.monthlyCost,maxAllowedPerBase:f.maxAllowedPerBase??null};});
 const cat=data.forwardSupply,wanted=new Set(['STR_GDX_EVENT_ORDERS_1','STR_GDX_EVENT_ORDERS_2','STR_TROUBLESEEKING_FRIENDS']),events=[];
 for(const [path,digest] of Object.entries(cat.sourceFiles)){
  if(!wanted.size)break;if(!path.startsWith('public/data/event-chunks/'))continue;
  const b=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',cat.sourceCommit+':'+path],{maxBuffer:64*1024*1024});assert.equal(sha(b),digest);
  for(const e of Object.values(JSON.parse(gunzipSync(b)).details))if(wanted.has(e.id)){events.push({raw:e,source:{commit:cat.sourceCommit,path,sha256:digest}});wanted.delete(e.id);}
 }
 assert.equal(wanted.size,0);
 return {schema:'ATLAS_OVERCAP_HYBRID_GDX_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:{'Piratez.rul':h},engineArchiveSha256:lock.archiveSha256,purchase:{id:item.type,cost:item.costBuy,requires:arr(item.requiresBuy),functions:arr(item.requiresBuyBaseFunc),generalRequires:arr(item.requires),requiresCountry:item.requiresBuyCountry??null,transferTime:item.transferTime??null,monthlyLimit:item.monthlyBuyLimit??null,size:item.size},facilities,events};
}
export function createHybridGdx(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_HYBRID_GDX_SOURCE_V1');assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [k,h] of Object.entries(proof.sourceFiles))assert.equal(h,data.meta.source.rules.find(x=>x.file===k).sha256);
 const p=proof.purchase,c=data.forwardSupply.buys[WEED];
 assert.equal(p.id,WEED);assert.equal(p.cost,c.cost);assert.deepEqual(p.requires,c.requires);assert.deepEqual(p.functions,c.functions);assert(!p.generalRequires.length&&!p.requiresCountry&&!p.monthlyLimit);
 const fsMap=new Map(proof.facilities.map(x=>[x.id,x]));
 for(const f of proof.facilities){const x=data.forwardSupply.facilities[f.id];assert.equal(f.cost,x.cost);assert.equal(f.days,x.days);assert.deepEqual(f.requires,x.research);assert.deepEqual(f.functions,x.requires);assert.deepEqual(f.provides,x.provides);}
 assert.equal(fsMap.get(MED).materials.STR_MEDICAL_SUPPLIES.build,10);assert.deepEqual(fsMap.get(MESS).materials,{});
 const events=new Map();
 for(const e of proof.events){assert.equal(e.source.commit,data.forwardSupply.sourceCommit);assert.equal(e.source.sha256,data.forwardSupply.sourceFiles[e.source.path]);events.set(e.raw.id,e.raw.id==='STR_TROUBLESEEKING_FRIENDS'?monthly.adapter(e.raw,e.source):createIdleResearchInterruptReward(data,rp,monthly,e.raw,e.source));}
 function reserveOrder(s){
  const w=s.world,n=40-qty(s,WEED);
  if(!rp.settled(s)||w.forwardHybridWeedOrder||n<=0||w.funds<n*p.cost||!p.requires.every(k=>active(s,k))||!p.functions.every(k=>w.baseFunctions.has(k)))return null;
  return {type:'sourceHybridReserveOrder',id:WEED,count:n,cost:n*p.cost,month:w.month,goal:'STR_WITCH_CAVE',assumeStorageAvailable:true,assumePurchaseAllowed:true};
 }
 function reserveDelivery(s){
  const w=s.world,o=w.forwardHybridWeedOrder;
  if(!rp.settled(s)||!o||s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||w.month!==o.month+1)return null;
  return {type:'sourceHybridReserveDelivery',id:WEED,count:o.count,month:w.month,assumeElapsedTransferTime:true};
 }
 function facMissing(s,id){
  const f=fsMap.get(id);assert(f);
  const materials=Object.fromEntries(Object.entries(f.materials).map(([k,v])=>{assert(Number.isSafeInteger(v.build)&&v.build>0);return [k,v.build];}));
  return {research:f.requires.filter(k=>!active(s,k)),functions:f.functions.filter(k=>!s.world.baseFunctions.has(k)),items:Object.fromEntries(Object.entries(materials).filter(([k,n])=>qty(s,k)<n).map(([k,n])=>[k,n-qty(s,k)])),funds:Math.max(0,f.cost-s.world.funds),materials};
 }
 function facStart(s,id){
  const w=s.world,f=fsMap.get(id);if(!f||!rp.settled(s)||w.facilities.has(id)||w.forwardHybridFacilityBuild)return null;
  const m=facMissing(s,id);if(m.research.length||m.functions.length||Object.keys(m.items).length||m.funds)return null;
  return {type:'sourceHybridFacilityStart',id,month:w.month,days:f.days,cost:f.cost,materials:m.materials,assumeFreeBuildableTile:true};
 }
 function facComplete(s){
  const w=s.world,f=w.forwardHybridFacilityBuild;
  if(!rp.settled(s)||!f||s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||w.month!==f.month+Math.ceil(f.days/28))return null;
  return {type:'sourceHybridFacilityComplete',id:f.id,days:f.days,month:w.month,assumeElapsedConstructionDays:true};
 }
 function transition(s,a){
  const w=structuredClone(s.world);let cost=0,evidence={proofSha256:sha(JSON.stringify(proof))};
  if(a.type==='sourceHybridReserveOrder'){
   assert.deepEqual(a,reserveOrder(s));cost=a.cost;w.forwardHybridWeedOrder={month:a.month,count:a.count};evidence={...evidence,kind:'SOURCE_BOUND_RESERVE_PURCHASE',rule:p,storageAndPurchaseConditional:true};
  }else if(a.type==='sourceHybridReserveDelivery'){
   assert.deepEqual(a,reserveDelivery(s));delete w.forwardHybridWeedOrder;w.items[WEED]=qty(s,WEED)+a.count;evidence={...evidence,kind:'CONDITIONAL_RESERVE_DELIVERY',rule:p,transferCalendarConditional:true};
  }else if(a.type==='sourceHybridFacilityStart'){
   assert.deepEqual(a,facStart(s,a.id));cost=a.cost;for(const [k,n] of Object.entries(a.materials))w.items[k]=qty(s,k)-n;
   w.forwardHybridFacilityBuild={id:a.id,month:a.month,days:a.days};evidence={...evidence,kind:'SOURCE_BOUND_MATERIAL_AWARE_FACILITY_START',rule:fsMap.get(a.id)};
  }else{
   assert.equal(a.type,'sourceHybridFacilityComplete');assert.deepEqual(a,facComplete(s));delete w.forwardHybridFacilityBuild;w.facilities.add(a.id);for(const k of fsMap.get(a.id).provides)w.baseFunctions.add(k);evidence={...evidence,kind:'CONDITIONAL_FACILITY_COMPLETION',rule:fsMap.get(a.id),maintenanceAndBaseSpaceUnmodeled:true};
  }
  w.funds-=cost;w.forwardProcurementSpend=Number(w.forwardProcurementSpend||0)+cost;
  const procurement=s.procurement+cost;assert.equal(w.funds,s.income-procurement-s.careerSpend);
  return {...s,world:w,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 function step(s,a){
  if(a.type.startsWith('sourceHybrid'))return transition(s,a);
  if(a.type==='sourceMapRecovery'){assert.equal(a.deployment,'STR_LOC_TAVERN_CELLAR');return tavern.apply(s,a);}
  if(a.type==='sourceMonthlyInterruptResearchReward'||a.type==='sourceMonthlyItemEvent'&&a.event==='STR_TROUBLESEEKING_FRIENDS'){const e=events.get(a.event);assert(e);return e.apply(s,a);}
  if(['sourceGdxPrisonDocumentRecovery','sourceStartLibrary','sourceCompleteLibrary','sourceManufactureImplicitBook'].includes(a.type))return gdx.apply(s,a);
  if(['recruit','transform','conditionalCapGrowth'].includes(a.type))return rp.career(s,a);
  return ps.step(s,a);
 }
 return {events,reserveOrder,reserveDelivery,facMissing,facStart,facComplete,transition,step};
}
function replay(seed,report,ad){
 let s=seed,l=null;
 for(let i=0;i<report.actions.length;i++){
  if(i===report.rankPhase.start)l=score.begin(s);
  const a=report.actions[i],inRank=i>=report.rankPhase.start&&i<report.rankPhase.end;
  const next=a.type==='sourceMonthlyRankReward'?(assert(inRank&&l),score.applyRank(s,l,a)):ad.step(s,a);
  if(inRank){assert(l);l=score.observe(l,s,next);}
  s=next;
 }
 if(report.rankPhase.start===report.actions.length)l=score.begin(s);
 assert.deepEqual(l,report.rankPhase.ledger);return s;
}
export function restoreV173(path){
 const r=read(path);assert.equal(r.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(r.priorSha256,fileSha(PRIOR));assert.equal(r.proofSha256,sha(JSON.stringify(r.proof)));
 for(const [path,h] of Object.entries(r.sources))assert.equal(fileSha(path),h);
 const s=restoreV172(PRIOR);assert.equal(hash(s),r.seed.stateHash);
 const n=replay(s,r,createHybridGdx(r.proof));assert.equal(hash(n),r.continuation.stateHash);return n;
}
function snapshot(s){return {month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),funds:s.world.funds,actions:s.actions.length,activeResearch:[...s.world.researched].filter(k=>active(s,k)).sort(),disabled:[...s.world.disabled].sort(),stock:{...s.world.items},facilities:[...s.world.facilities].sort(),functions:[...s.world.baseFunctions].sort()};}
function build(){
 const proof=extractProof(),ad=createHybridGdx(proof),seed=restoreV172(PRIOR),bulk=read(BULK);assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 let s=seed;const milestones=[],errors=[];
 function advance(label,fn){const before=s;try{const n=fn(before);assert.deepEqual(n.actions.slice(0,before.actions.length),before.actions);assert(n.world.funds>=0);if(n.actions.length>before.actions.length){s=n;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(before,k)),stateHash:hash(s)});}}catch(e){errors.push({label,reason:String(e.message)});}}
 function research(id,free=null){advance(id,st=>lab(st,id,free));}
 function event(st,adapter,id=null){let n=monthly.advance(st);const o=adapter.options(n,id)[0];assert(o,'No source event '+adapter.id+' '+id);return settle(adapter.apply(n,o.action));}
 function learn(st,id,sources){
  if(active(st,id))return st;const failed=[];
  for(const source of sources){try{
   assert(data.researchRules[source].getOneFree.includes(id));let n=st;
   if(!rp.options(n).some(o=>['research','repeatResearch'].includes(o.action.type)&&o.action.id===source))n=event(n,repeatEnemy,source);
   const o=rp.options(n).find(o=>o.action.type===(active(n,source)?'repeatResearch':'research')&&o.action.id===source);assert(o);
   n=settle(rp.research(n,o.action),id);assert(active(n,id));return n;
  }catch(e){failed.push(source+': '+e.message);}}
  throw Error(failed.join('; '));
 }
 function fund(st,amount){let n=st;for(let i=0;n.world.funds<amount;i++){assert(i<12);n=event(n,repeatCash);}return n;}
 function buildFac(st,id){if(st.world.facilities.has(id))return st;const m=ad.facMissing(st,id);assert(!m.research.length&&!m.functions.length&&!Object.keys(m.items).length,JSON.stringify(m));let n=fund(st,st.world.funds+m.funds);const a=ad.facStart(n,id);assert(a);n=ad.transition(n,a);for(let i=0;i<Math.ceil(a.days/28);i++)n=monthly.advance(n);const done=ad.facComplete(n);assert(done);return ad.transition(n,done);}
 // Actual reserve purchase is independent of research already completed.
 advance('Witch cave sectoweed reserve',st=>{if(qty(st,WEED)>=40)return st;let n=fund(st,(40-qty(st,WEED))*proof.purchase.cost);const a=ad.reserveOrder(n);assert(a);n=ad.transition(n,a);n=monthly.advance(n);const d=ad.reserveDelivery(n);assert(d);return ad.transition(n,d);});
 advance('Mess hall construction',st=>buildFac(st,MESS));
 advance('Government sample and glamour delivery',st=>event(st,ad.events.get('STR_TROUBLESEEKING_FRIENDS')));
 research('STR_GOVT_CORPSE');research('STR_GLAMOUR');
 for(const [id,sources] of [
 ['STR_MEDICAL_SUPPLIES',['STR_SECTOID_SOLDIER','STR_SECTOID_MEDIC','STR_GUILD_MEDIC']],
 ['STR_BEASTMEN',['STR_ACADEMY_NURSE','STR_HUMAN_SHARP_GUY']],
 ['STR_CRACK',['STR_ACADEMY_NURSE','STR_SECTOID_SOLDIER','STR_GUILD_MEDIC']],
 ['STR_PADD',['STR_ACADEMY_NURSE','STR_SECTOID_SOLDIER']],
 ['STR_ALIEN_TERROR',['STR_SECTOID_SOLDIER','STR_SECTOID_MEDIC']],
 ['STR_PORN',['STR_BANDIT_RUFFIAN','STR_BANDIT_BOY','STR_RAIDER_MISTRESS']],
 ])advance(id,st=>learn(st,id,sources));
 // If a chosen source differed, explicitly finish both GDX gate samples.
 for(const [id,bonus] of [['STR_SECTOID_SOLDIER','STR_ALIEN_RESEARCH'],['STR_ACADEMY_NURSE','STR_ACADEMY_RECRUITMENT']])advance(id,st=>active(st,id)?st:lab(event(st,repeatEnemy,id),id,bonus));
 for(const id of ['STR_LINGERIE','STR_VIP_014','STR_POSTRAPTURE','STR_BIKINI','STR_MEIDO_OUTFIT'])advance('Gold event '+id,st=>active(st,id)?st:event(st,ps.gold,id));
 for(const id of ['STR_MEDICINE','STR_MED_BAY','STR_MAGOS_CEREMONY','STR_LINGERIE_DEP','STR_SOCIALIZING','STR_SALVAGE','STR_CEREMONY_DEP'])research(id);
 for(const id of ['STR_GDX_001','STR_GDX_002'])advance('GDX order '+id,st=>active(st,id)?st:event(st,ad.events.get(id==='STR_GDX_001'?'STR_GDX_EVENT_ORDERS_1':'STR_GDX_EVENT_ORDERS_2'),id));
 research('STR_GDX_000');
 advance('Medical facility',st=>buildFac(st,MED));
 // Rank witness: score only transitions accepted by the existing source
 // ledger. Complete each selected modeled month; no prior lifetime points.
 const rankStart=s.actions.length-seed.actions.length;
 let ledger=score.begin(s);
 function scored(st,l,a){const n=a.type==='sourceMonthlyRankReward'?score.applyRank(st,l,a):ad.step(st,a);return {s:n,l:score.observe(l,st,n)};}
 function scoreProject(st,l,action,bonus=null){
  let r=scored(st,l,action);
  for(let i=0;!rp.settled(r.s);i++){assert(i<50);const opts=rp.options(r.s);const o=r.s.world.pendingFree&&bonus?opts.find(o=>o.action.type==='freeResearch'&&o.action.research===bonus):opts[0];assert(o);r=scored(r.s,r.l,o.action);}
  return r;
 }
 function proposals(st){
  const plans=[];
  for(const o of rp.options(st)){
   const a=o.action,r=data.researchRules[a.id];
   if(!['research','repeatResearch'].includes(a.type)||!r||r.disables.length||r.reenables.length)continue;
   const ids=[...r.getOneFree,...Object.entries(r.getOneFreeProtected||{}).filter(([k])=>active(st,k)).flatMap(([,v])=>v)].filter(k=>!active(st,k)&&!st.world.disabled.has(k)&&Number.isSafeInteger(scoreProof.points[k])&&!scoreProof.conflicts['research:'+k]);
   // Use only deterministic available projects or a specific declared free reward.
   if(ids.length){for(const k of new Set(ids))plans.push({action:a,bonus:k});}
   else if(a.type==='research')plans.push({action:a,bonus:null});
  }
  const val=x=>(scoreProof.points[x.bonus]||0)+(x.action.type==='research'?(scoreProof.points[x.action.id]||0):0);
  return plans.sort((a,b)=>val(b)-val(a)||a.action.id.localeCompare(b.action.id)||String(a.bonus).localeCompare(String(b.bonus)));
 }
 const ranks=[];
 for(const [id,threshold] of [['STR_CAPTAINS_RANK_01',2000],['STR_CAPTAINS_RANK_02',3000]]){
  if(active(s,id))continue;
  const before=s,rule=scoreProof.rankRows.find(x=>x.section==='eventScripts'&&x.id===id).raw;
  try{
   assert(Object.entries(rule.researchTriggers).every(([k,v])=>active(s,k)===v),'Rank gate prerequisite not met');
   let r=scored(s,ledger,{type:'sourceMonthlyBoundary',month:s.world.month+1,assumeElapsed:true});
   for(let i=0;r.l.current+400<threshold&&i<65;i++){
    let best=null;
    for(const p of proposals(r.s).slice(0,100)){try{const n=scoreProject(r.s,r.l,p.action,p.bonus);if(n.l.current>r.l.current){best=n;break;}}catch{}}
    if(!best)break;r=best;
   }
   // Preserve only complete replayable score production if a rank gate closes.
   assert(r.l.current+400>=threshold,'Modeled score shortfall '+(threshold-r.l.current-400));
   r=scored(r.s,r.l,{type:'sourceMonthlyBoundary',month:r.s.world.month+1,assumeElapsed:true});
   const o=score.rankOption(r.s,r.l,id);assert(o,'Source rank event unavailable');
   r=scored(r.s,r.l,o.action);assert(rp.settled(r.s));s=r.s;ledger=r.l;ranks.push({id,month:s.world.month,proof:o.action.scoreProof});
   milestones.push({label:id,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(before,k)),stateHash:hash(s)});
  }catch(e){errors.push({label:id,reason:String(e.message)});}
 }
 const rankPhase={start:rankStart,end:s.actions.length-seed.actions.length,ledger,ranks};
 research('STR_PIRATEZ_HIERARCHY');research('STR_GDX_003');
 // Restore the persuasion chain in this branch, not via imported research.
 advance('Socializing: young uber',st=>{
  if(active(st,'CIVILIAN_YOUNG_UBER'))return st;
  const a=rp.options(st).find(o=>o.action.type==='repeatResearch'&&o.action.id==='STR_SOCIALIZING');assert(a);
  const n=settle(rp.research(st,a.action),'CIVILIAN_YOUNG_UBER');assert(active(n,'CIVILIAN_YOUNG_UBER'));return n;
 });
 research('STR_YOUNG_UBER_RECRUITMENT');
 advance('Mutant blessings',st=>{
  if(active(st,'STR_MUTANT_BLESSINGS'))return st;
  let n=monthly.advance(st);
  const a=rp.options(n).find(o=>o.action.type==='eventResearch'&&o.action.research==='STR_MUTANT_BLESSINGS'&&o.action.event==='STR_GREEN_PRAYERS');
  if(a)return settle(ad.step(n,a.action));
  const b=rp.options(n).find(o=>o.action.type==='sourceEventItems'&&data.forwardSupply.events[o.action.event]?.fixed.STR_MUTANT_BLESSINGS);
  assert(b,'No modeled blessings reward');n=settle(ad.step(n,b.action));return lab(n,'STR_MUTANT_BLESSINGS');
 });
 research('STR_RIBBON');
 advance('Tavern cellar: sermons',st=>{
  if(active(st,'STR_BOOK_OF_SERMONS'))return st;
  let n=monthly.advance(st);const a=rp.options(n).find(o=>JSON.stringify(o.action)===JSON.stringify(tavern.missionAction));assert(a);
  n=ad.step(n,a.action);const b=tavern.options(n).find(o=>o.action.randomPick===null);assert(b);
  n=tavern.apply(n,b.action);return lab(n,'STR_BOOK_OF_SERMONS');
 });
 for(const id of ['STR_WENCH_OUTFIT','STR_OLD_EARTH_VOODOO','STR_MOST_COMMON_POWER','STR_PERSUASION'])research(id);
 advance('Sectoid leader',st=>active(st,'STR_SECTOID_LEADER')?st:lab(event(st,repeatEnemy,'STR_SECTOID_LEADER'),'STR_SECTOID_LEADER',active(st,'STR_MIND_PROBE')?null:'STR_MIND_PROBE'));
 research('STR_GDX_004');
 advance('GDX prison and library',st=>{
  if(active(st,'STR_GDX_005'))return st;
  let n=monthly.advance(st);const a=rp.options(n).find(o=>JSON.stringify(o.action)===JSON.stringify(gdx.missionAction));assert(a,'GDX prison mission not available');n=ad.step(n,a.action);const r=gdx.recoveryOption(n);assert(r);n=gdx.apply(n,r);n=lab(n,'STR_GDX_005');return lab(n,'STR_SCHOOL_BOOKS');
 });
 research('STR_LIBRARY');
 advance('Library construction',st=>{if(st.world.facilities.has('STR_LIBRARY'))return st;let n=fund(st,gdx.buildCost);const a=gdx.startOption(n);assert(a);n=gdx.apply(n,a);n=monthly.advance(n);const d=gdx.completeOption(n);assert(d);return gdx.apply(n,d);});
 for(const id of ['STR_SCHOOLING_2','STR_GEMOLOGY','STR_MAGITECH_SUMMARY','STR_PSI_INITIATION','STR_MUTANT_PHYSIOLOGY','STR_PSI_COMMUNION'])if(rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))research(id);
 const actions=s.actions.slice(seed.actions.length);
 const blockers=Object.fromEntries(topics.map(id=>{const r=data.researchRules[id];return [id,{active:active(s,id),dependencies:arr(r.dependencies).filter(k=>!active(s,k)),functions:arr(r.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k)),disabled:s.world.disabled.has(id)}];}));
 const summary={preservedGoals:bulk.goals.length,newActions:actions.length,newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(seed,k)),newFacilities:[...s.world.facilities].filter(k=>!seed.world.facilities.has(k)),gdxOrders:['STR_GDX_001','STR_GDX_002'].filter(k=>active(s,k)).length,gdx000:active(s,'STR_GDX_000'),gdx003:active(s,'STR_GDX_003'),ranks:ranks.map(x=>x.id),weedBefore:qty(seed,WEED),weedAfter:qty(s,WEED),psiBefore:data.researchRules.STR_PSI_COMMUNION.dependencies.filter(k=>active(seed,k)).length,psiAfter:data.researchRules.STR_PSI_COMMUNION.dependencies.filter(k=>active(s,k)).length,newBirths:0,newTraitApplications:0,finalAdmission:0};
 const report={schema:'ATLAS_OVERCAP_HYBRID_GDX_WAVE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:fileSha(PRIOR),sources:Object.fromEntries([PSI,SCORE,GDX,TAVERN,BULK,UI_PRIOR].map(p=>[p,fileSha(p)])),proof,proofSha256:sha(JSON.stringify(proof)),scope:'Independent conditional hybrid campaign with selected events, research and score gates. No native tactical replay, actual score, complete economy or final admission. Rank scores include explicit residual unmodeled activity assumptions.',seed:snapshot(seed),continuation:snapshot(s),actions,trace:s.trace.slice(seed.trace.length),rankPhase,milestones,errors,blockers,facilityBlockers:{[MED]:ad.facMissing(s,MED),STR_WITCH_CAVE:ps.requirements(s,'STR_WITCH_CAVE')},summary,actualGameCertified:false,normalizationComplete:false,finalAdmission:false};
 assert.deepEqual(receipt(replay(restoreV172(PRIOR),report,ad)),receipt(s));
 const bytes=gzipSync(JSON.stringify(report)+'\n',{level:9}),out='tools/data/overcap-hybrid-gdx-wave-v1-'+sha(bytes).slice(0,20)+'.json.gz';
 if(fs.existsSync(out))assert(fs.readFileSync(out).equals(bytes));else fs.writeFileSync(out,bytes,{flag:'wx'});
 // Refresh only the independent hybrid column in the integrated site dataset.
 const ui=read(UI_PRIOR);assert.equal(ui.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(ui.branches.find(b=>b.id==='hybrid').stateHash,hash(seed));assert.equal(ui.preservedGoals,bulk.goals.length);
 const originalIds=ui.goals.map(g=>g.id);
 const branch=ui.branches.find(b=>b.id==='hybrid');Object.assign(branch,{month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),actionCount:s.actions.length,checkpoint:{version:173,newActions:summary.newActions,newResearch:summary.newResearch.length,gdx:['STR_GDX_001','STR_GDX_002','STR_GDX_000','STR_GDX_003','STR_GDX_004','STR_GDX_005'].filter(k=>active(s,k)),library:s.world.facilities.has('STR_LIBRARY'),magitech:active(s,'STR_MAGITECH_SUMMARY'),psiDone:summary.psiAfter,psiTotal:data.researchRules.STR_PSI_COMMUNION.dependencies.length,psiMissing:blockers.STR_PSI_COMMUNION.dependencies,facilities:summary.newFacilities,weed:qty(s,WEED),caveMissing:report.facilityBlockers.STR_WITCH_CAVE.items,medMissing:report.facilityBlockers[MED].items,conditional:true}});
 const acqById=new Map(bulk.acquisitions.map(a=>[a.id,a]));
 for(const g of ui.groups){const b=g.branches.find(b=>b.id==='hybrid');b.missing=g.required.filter(k=>!active(s,k));b.disabled=g.required.filter(k=>s.world.disabled.has(k));}
 for(const a of ui.acquisitions){const b=a.branches.find(b=>b.id==='hybrid'),q=acqById.get(a.id);assert(q);b.missing=rp.missing(s,q.requirements);b.originAlreadyRecruited=s.actions.some(x=>x.type==='recruit'&&x.profile===q.profile);}
 assert.deepEqual(ui.goals.map(g=>g.id),originalIds);assert.equal(ui.finalAdmission,0);ui.producer=out;ui.producerSha256=sha(bytes);ui.previousProducer=read(UI_PRIOR).producer;
 const uiPath='public/data/soldier-forward-trait-progress-v173.json',uiBytes=JSON.stringify(ui)+'\n';fs.writeFileSync(uiPath,uiBytes);
 console.log(JSON.stringify({out,bytes:bytes.length,uiPath,uiBytes:Buffer.byteLength(uiBytes),summary:{...summary,newResearchCount:summary.newResearch.length,newResearch:undefined},month:s.world.month,balance:s.world.funds,errors,blockers,facilityBlockers:report.facilityBlockers,ranks,hash:hash(s)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
