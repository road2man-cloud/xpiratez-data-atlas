// V171: independent hybrid-path campaign and continued male-touch campaign.
// Both replay from their actual ancestors. No research/inventory merge.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {restoreV170,createPsiSupport} from './build-overcap-psi-support-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
const PRIOR='tools/data/overcap-psi-support-wave-v1-dfd6237af3dd2b53dc72.json';
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const OLD='STR_WE_NEED_MALE_TOUCH_PREQ',HYB='STR_HYBRID_PATH_PREQ',DEAL='STR_TAKE_ME_TO_YOUR_DEALER';
const CONTACT='STR_CONTACT_RETICULANS',TARGET='STR_PSI_COMMUNION';
const RET=['STR_RETICULAN_CORPSE','STR_RET_SIREN','STR_RET_SECTOGRE','STR_RET_HYBRID','STR_RET_COMMANDO','STR_RET_PEON','STR_RET_MECHTOID','STR_SECFLOWER','STR_RET_ELDER','STR_RETICULAN_HIVE','STR_ALIEN_SURGERY'];
const arr=x=>Array.isArray(x)?x:[];
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const qty=(s,id)=>Number(s.world.items[id]||0);
const hash=s=>receipt(s).stateHash;
const step=(s,a)=>a.type==='sourceMonthlyBoundary'?monthly.advance(s,a):monthly.scripted(a)?monthly.applyLegacy(s,a,(w,x)=>rp.research(w,x)):rp.research(s,a);
function extractProof(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const yaml=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const b=fs.readFileSync(root+'/Piratez.rul'),h=sha(b);assert.equal(h,data.meta.source.rules.find(x=>x.file==='Piratez.rul').sha256);
 const d=yaml.load(b.toString('utf8'),{json:true});
 const ids=[OLD,HYB,DEAL,'STR_HYBRID_PATH','STR_CONTACT_RETICULANS_PREQ2',CONTACT,'STR_CODE_GOVT_RET_ENABLE','STR_ACADEMY_STUDENT','STR_RETICULAN_GENETICS','STR_HEALING_GEL','STR_MUSHROOM_BEER','STR_RETICULAN_HIVE'];
 const rows=d.research.filter(x=>ids.includes(x.name)).map(r=>({id:r.name,dependencies:arr(r.dependencies),requires:arr(r.requires),disables:arr(r.disables),reenables:arr(r.reenables),unlocks:arr(r.unlocks),lookup:r.lookup??null,getOneFree:arr(r.getOneFree),getOneFreeProtected:r.getOneFreeProtected||{},needItem:!!r.needItem,destroyItem:!!r.destroyItem,cost:r.cost??0}));
 assert.equal(rows.length,ids.length);
 const weed=d.items.find(x=>x.type==='STR_SECTOWEED'),cave=d.facilities.find(x=>x.type==='STR_WITCH_CAVE');
 const recipe=d.manufacture.find(x=>x.name==='STR_CODE_GOVT_RET');
 return {schema:'ATLAS_OVERCAP_HYBRID_RETICULAN_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:{'Piratez.rul':h},engineArchiveSha256:lock.archiveSha256,research:rows,weed:{id:weed.type,buyCost:weed.costBuy,requiresBuy:weed.requiresBuy},cave:{id:cave.type,buildCost:cave.buildCost,materials:cave.buildCostItems},codeRecipe:{id:recipe.name,requires:recipe.requires,functions:recipe.requiresBaseFunc,inputs:recipe.requiredItems,output:recipe.name,time:recipe.time,cost:recipe.cost}};
}
function checkProof(p){
 assert.equal(p.schema,'ATLAS_OVERCAP_HYBRID_RETICULAN_SOURCE_V1');assert.equal(p.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(p.engineArchiveSha256,lock.archiveSha256);
 for(const [file,h] of Object.entries(p.sourceFiles))assert.equal(h,data.meta.source.rules.find(x=>x.file===file).sha256);
 for(const row of p.research){const r=data.researchRules[row.id];assert(r);for(const key of ['dependencies','requires','disables','reenables','unlocks','lookup','getOneFree','getOneFreeProtected','needItem','destroyItem','cost'])assert.deepEqual(row[key],r[key],row.id+':'+key);}
 const d=p.research.find(r=>r.id===DEAL);assert(!d.needItem&&d.cost>0);
 assert(d.getOneFreeProtected.STR_HYBRID_PATH.includes('STR_RET_SIREN'));
 assert(d.getOneFreeProtected.STR_CONTACT_RETICULANS.includes('STR_RET_COMMANDO'));
 assert.deepEqual(p.weed.requiresBuy,[CONTACT]);assert.equal(p.weed.buyCost,data.forwardSupply.buys.STR_SECTOWEED.cost);
 assert.equal(p.cave.materials.STR_SKULL.build,5);assert.equal(p.cave.materials.STR_SECTOWEED.build,40);
}
function forkPrefix(seed,index){
 assert.equal(seed.actions[index].id,OLD);let s=rp.start(seed.actions[0].difficulty);
 assert.deepEqual(s.actions,seed.actions.slice(0,2));
 for(const a of seed.actions.slice(2,index))s=step(s,a);
 assert(!s.world.disabled.has(HYB));assert(active(s,'STR_DIVERGING_PATHS'));return s;
}
function repeatDeal(s,bonus){
 const r=data.researchRules[DEAL];
 assert(Object.entries(r.getOneFreeProtected).some(([gate,ids])=>active(s,gate)&&ids.includes(bonus))||r.getOneFree.includes(bonus));
 const o=rp.options(s).find(o=>o.action.type==='repeatResearch'&&o.action.id===DEAL);assert(o,'Dealer repeat unavailable');
 const n=settle(rp.research(s,o.action),bonus);assert(active(n,bonus),'Dealer bonus not active: '+bonus);return n;
}
function snap(s){
 return {month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),balance:s.world.funds,activeResearch:[...s.world.researched].filter(k=>active(s,k)).sort(),disabled:[...s.world.disabled].sort(),stock:Object.fromEntries(['STR_POLTERGEIST','STR_ZOMBIE_STERILE_TERRORIST','STR_GLAMOUR','STR_ZOMBIE_ESSENCE','STR_ZOMBIE_BRAIN','STR_PORN','STR_VAMPIRE_ESSENCE','STR_SKULL','STR_SECTOWEED'].map(k=>[k,qty(s,k)])),facilities:[...s.world.facilities].sort(),functions:[...s.world.baseFunctions].sort(),soldierCount:s.world.soldiers.length,psiDependencies:data.researchRules[TARGET].dependencies.map(id=>({id,active:active(s,id)}))};
}
export function restoreV171(path,branch='existing'){
 const r=read(path);checkProof(r.proof);assert.equal(r.proofSha256,sha(JSON.stringify(r.proof)));assert.equal(r.priorSha256,sha(fs.readFileSync(PRIOR)));
 const old=restoreV170(PRIOR),prior=read(PRIOR),ad=createPsiSupport(prior.proof);
 assert.equal(hash(old),r.existing.seed.stateHash);
 if(branch==='existing'){
  let s=old;for(const a of r.existing.actions)s=ad.step(s,a);assert.equal(hash(s),r.existing.state.stateHash);return s;
 }
 assert.equal(branch,'hybrid');
 let s=forkPrefix(old,r.hybrid.forkIndex);assert.equal(hash(s),r.hybrid.seed.stateHash);
 for(const a of r.hybrid.actions)s=step(s,a);assert.equal(hash(s),r.hybrid.state.stateHash);return s;
}
function build(){
 const proof=extractProof();checkProof(proof);
 const prior=read(PRIOR),bulk=read(BULK),old=restoreV170(PRIOR),ad=createPsiSupport(prior.proof);
 assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 const reserve=prior.reserve;
 let s=old;const milestones=[],errors=[];
 function advance(label,fn){
  const before=s;try{const n=fn(before);assert.deepEqual(n.actions.slice(0,before.actions.length),before.actions);
   for(const [k,count] of Object.entries(reserve))assert(qty(n,k)>=count,'Reserved item '+k);
   if(n.actions.length>before.actions.length){s=n;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(before,k)),stateHash:hash(s)});}
  }catch(e){errors.push({label,reason:String(e.message)});}
 }
 function learn(st,bonus,sources){
  if(active(st,bonus))return st;
  const failures=[];
  for(const id of sources){try{
   assert(data.researchRules[id].getOneFree.includes(bonus));
   let n=monthly.advance(st);const o=repeatEnemy.options(n,id)[0];assert(o,'No event sample '+id);
   n=settle(repeatEnemy.apply(n,o.action));
   const type=active(n,id)?'repeatResearch':'research',a=rp.options(n).find(o=>o.action.type===type&&o.action.id===id);assert(a,'No sample project '+id);
   n=settle(rp.research(n,a.action),bonus);assert(active(n,bonus));return n;
  }catch(e){failures.push(id+': '+e.message);}}
  throw Error(failures.join('; '));
 }
 advance(DEAL,st=>lab(st,DEAL));
 const plans=[
 ['STR_RETICULAN_CORPSE',['STR_RET_HYBRID','STR_RET_SECTOGRE']],
 ['STR_RET_SIREN_BANDIT',['STR_RET_SECTOGRE']],
 ['STR_SECFLOWER',['STR_RET_SECTOGRE','STR_GUILD_MEDIC','STR_SECTOID_MEDIC']],
 ['STR_NINJA_LEARNING_ARRAY',['STR_NINJA_WARRIOR']],
 ['STR_NINJA_CLONING_POD',['STR_NINJA_WARRIOR']],
 ['STR_NINJA_ENDURANCE_TRAINING',['STR_NINJA_WARRIOR']],
 ['STR_FAN',['STR_NINJA_WARRIOR','STR_HUMAN_NOBLEWOMAN']],
 ['STR_SECURITY_CORPSE',['STR_SECTOID_ENGINEER','STR_GUILD_ENGINEER']],
 ['STR_REAPER_TERRORIST',['STR_HUMAN_NOMAD','STR_GUILD_MEDIC']],
 ['STR_ALIEN_SURGERY',['STR_GUILD_MEDIC']],
 ['STR_UFO_NAVIGATION',['STR_SECTOID_ENGINEER']],
 ['STR_UFO_POWER_SOURCE_SMALL',['STR_SECTOID_ENGINEER']],
 ['STR_ALIEN_HABITAT',['STR_GUILD_MEDIC']],
 ['STR_LAPUTA',['STR_RET_HYBRID','STR_ACADEMY_STUDENT']],
 ];
 for(const [bonus,sources] of plans)advance(bonus,st=>learn(st,bonus,sources));
 for(const id of ['STR_TAMED_REAPER','STR_NO_CIVILIAN_TRAFFIC','STR_AIR_FILTRATION','STR_RETICULAN_GENETICS','STR_HEALING_GEL','STR_MUSHROOM_BEER','STR_RETICULAN_HIVE'])if(!active(s,id)&&rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))advance(id,st=>lab(st,id));
 const existing=s,existingActions=s.actions.slice(old.actions.length);
 let er=restoreV170(PRIOR);for(const a of existingActions)er=ad.step(er,a);assert.deepEqual(receipt(er),receipt(existing));
 // The original male-touch choice disables the dealer/hybrid shortcut.
 // Fork at its actual earliest divergence; never copy late acquired items.
 const index=old.actions.findIndex(a=>a.type==='research'&&a.id===OLD);
 assert(index>2);assert(existing.world.disabled.has(HYB));assert(existing.world.disabled.has('STR_HYBRID_PATH'));
 const base=forkPrefix(old,index);let h=base;
 h=monthly.advance(h);const o=rp.options(h).find(x=>x.action.type==='sourceEventItems'&&x.action.event==='STR_KNOCK_KNOCK_STUDENT');
 assert(o,'Early academy student event unavailable');
 h=settle(step(h,o.action));h=lab(h,'STR_ACADEMY_STUDENT','STR_SECTOWEED');
 const core=[DEAL,HYB,'STR_HYBRID_PATH','STR_CONTACT_RETICULANS_PREQ2',CONTACT,'STR_CODE_GOVT_RET_ENABLE'];
 for(const id of core)h=lab(h,id);
 assert(h.world.disabled.has(OLD));assert(active(h,CONTACT));
 const rewards=[];
 for(const id of [...RET,'STR_RETICULAN_LASER_GUN','STR_RET_FUSION_REACTOR','STR_ALIEN_FOOD','STR_UFO_NAVIGATION']){
  if(active(h,id))continue;
  const before=h;h=repeatDeal(h,id);rewards.push({id,actions:h.actions.slice(before.actions.length)});
 }
 for(const id of ['STR_RETICULAN_GENETICS','STR_HEALING_GEL','STR_RETICULAN_HIVE'])h=lab(h,id);
 assert(active(h,'STR_RETICULAN_HIVE')&&active(h,'STR_HEALING_GEL'));
 const hybridActions=h.actions.slice(base.actions.length);let hr=forkPrefix(old,index);
 for(const a of hybridActions)hr=step(hr,a);assert.deepEqual(receipt(hr),receipt(h));
 const targetAcqs=bulk.acquisitions.filter(a=>['manufacture:STR_ZOMBIE_EMBODIMENT','manufacture:STR_POLTERGEIST_EMBODIMENT'].includes(a.profile));
 const goalRows=targetAcqs.flatMap(a=>bulk.groups.filter(g=>g.acquisition===a.id).flatMap(g=>g.goalIds.map(goal=>{
  const required=[...new Set([...(a.requirements.research||[]),...g.stages.flatMap(st=>arr(st.requirements?.research))])];
  const branchRow=st=>({missing:required.filter(k=>!active(st,k)),disabled:required.filter(k=>st.world.disabled.has(k)),acquisitionMissing:rp.missing(st,a.requirements),status:'RESEARCH_SUPPORT_ONLY'});
  return {goal,group:g.id,profile:a.profile,existing:branchRow(existing),hybrid:branchRow(h),finalAdmission:false,actualGameCertified:false};
 })));
 assert.equal(new Set(goalRows.map(x=>x.goal)).size,124);
 const deps=data.researchRules[TARGET].dependencies;
 const blocked=(st,id)=>{const r=data.researchRules[id];return {active:active(st,id),disabled:st.world.disabled.has(id),missing:arr(r.dependencies).filter(k=>!active(st,k)),functions:arr(r.requiresBaseFunc).filter(k=>!st.world.baseFunctions.has(k))};};
 const topics=[TARGET,'STR_RETICULAN_HIVE','STR_RETICULAN_GENETICS','STR_HEALING_GEL','STR_MUSHROOM_BEER','STR_ZOMBIE_EMBODIMENT','STR_POLTERGEIST_EMBODIMENT',CONTACT,HYB,'STR_NINJA_LEARNING_ARRAY','STR_NINJA_CLONING_POD'];
 const report={schema:'ATLAS_OVERCAP_RETICULAN_FORK_WAVE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:sha(fs.readFileSync(PRIOR)),bulkPath:BULK,bulkSha256:sha(fs.readFileSync(BULK)),proof,proofSha256:sha(JSON.stringify(proof)),scope:'Two independent conditional chronological campaign witnesses. No union of their research, items, finances, soldiers or final trait vectors. Calendar/lab durations and complete economy/score remain conditional. No new birth or final admission.',existing:{seed:snap(old),state:snap(existing),actions:existingActions,trace:existing.trace.slice(old.trace.length),milestones,errors,blockers:Object.fromEntries(topics.map(id=>[id,blocked(existing,id)]))},hybrid:{forkIndex:index,oldChoice:OLD,newChoice:HYB,seed:snap(base),commonActions:base.actions,actions:hybridActions,trace:h.trace.slice(base.trace.length),state:snap(h),rewards,blockers:Object.fromEntries(topics.map(id=>[id,blocked(h,id)])),facilityMaterialSource:{sectoweedBuyUnlocked:active(h,CONTACT),purchaseCount:40,unitCost:proof.weed.buyCost,totalCost:40*proof.weed.buyCost,notPurchased:true}},goalRows,summary:{preservedGoals:bulk.goals.length,linkedGoals:goalRows.length,existingActions:existingActions.length,hybridActions:hybridActions.length,existingNewResearch:[...existing.world.researched].filter(k=>active(existing,k)&&!active(old,k)),hybridNewResearch:[...h.world.researched].filter(k=>active(h,k)&&!active(base,k)),existingPsi:deps.filter(k=>active(existing,k)).length,hybridPsi:deps.filter(k=>active(h,k)).length,psiTotal:deps.length,existingNewBirths:0,hybridNewBirths:0,newTraitApplications:0,finalAdmission:0},normalizationComplete:false,actualGameCertified:false,finalAdmission:false};
 const bytes=JSON.stringify(report)+'\n',out='tools/data/overcap-reticulan-fork-wave-v1-'+sha(bytes).slice(0,20)+'.json';
 if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
 console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),summary:report.summary,existing:{month:existing.world.month,hash:hash(existing),errors,blockers:report.existing.blockers},hybrid:{month:h.world.month,hash:hash(h),blockers:report.hybrid.blockers,weed:report.hybrid.facilityMaterialSource}}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
