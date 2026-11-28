// V172: independently extend the hybrid campaign toward alchemy and psi communion.
// A research/event is accepted only through the live branch's available actions.
// The existing branch is used only for a separate comparison.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {restoreV171} from './build-overcap-reticulan-fork-wave-v1.mjs';
import {createAlchemyEvents} from './build-overcap-alchemy-wave-v1.mjs';
import {createPsiSupport} from './build-overcap-psi-support-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,repeatCash,settle,lab} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
const PRIOR='tools/data/overcap-reticulan-fork-wave-v1-21bbbb7e22ee83e598f3.json';
const ALC='tools/data/overcap-alchemy-wave-v1-b75c0b93c3e72c197bcf.json';
const PSI='tools/data/overcap-psi-support-wave-v1-dfd6237af3dd2b53dc72.json';
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const arr=x=>Array.isArray(x)?x:[];
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const qty=(s,id)=>Number(s.world.items[id]||0);
const hash=s=>receipt(s).stateHash;
const alchemy=read(ALC),psi=read(PSI);
assert.equal(alchemy.proofSha256,sha(JSON.stringify(alchemy.proof)));
assert.equal(psi.proofSha256,sha(JSON.stringify(psi.proof)));
const ae=createAlchemyEvents(alchemy.proof),ps=createPsiSupport(psi.proof);
function step(s,a){
 if(a.type==='sourceAlchemyMonthlyItemEvent')return ae.apply(s,a);
 return ps.step(s,a);
}
const target=['STR_ALCHEMY','STR_MAGITECH_SUMMARY','STR_MUSHROOM_BEER','STR_PSI_COMMUNION','STR_WITCH_CAVE','STR_ZOMBIE_SUSTENANCE','STR_ZOMBIE_EMBODIMENT','STR_POLTERGEIST_EMBODIMENT'];
function snapshot(s){return {month:s.world.month,difficulty:s.world.difficulty,stateHash:hash(s),funds:s.world.funds,actions:s.actions.length,activeResearch:[...s.world.researched].filter(k=>active(s,k)).sort(),disabled:[...s.world.disabled].sort(),stock:{...s.world.items},facilities:[...s.world.facilities].sort(),functions:[...s.world.baseFunctions].sort()};}
export function restoreV172(path){
 const r=read(path);assert.equal(r.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(r.priorSha256,sha(fs.readFileSync(PRIOR)));
 assert.equal(r.alchemySha256,sha(fs.readFileSync(ALC)));assert.equal(r.psiSha256,sha(fs.readFileSync(PSI)));
 let s=restoreV171(PRIOR,'hybrid');assert.equal(hash(s),r.seed.stateHash);
 for(const a of r.actions)s=step(s,a);assert.equal(hash(s),r.continuation.stateHash);return s;
}
function build(){
 const seed=restoreV171(PRIOR,'hybrid'),old=restoreV171(PRIOR,'existing'),bulk=read(BULK);
 assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 let s=seed;const milestones=[],errors=[];
 function advance(label,fn){
  const before=s;try{
   const n=fn(before);assert.deepEqual(n.actions.slice(0,before.actions.length),before.actions);
   assert(n.world.funds>=0);
   if(n.actions.length>before.actions.length){s=n;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(before,k)),stateHash:hash(s)});}
  }catch(e){errors.push({label,reason:String(e.message)});}
 }
 function research(id,bonus=null){advance(id,st=>lab(st,id,bonus));}
 function fixed(st,event){const n=monthly.advance(st),o=rp.options(n).find(x=>x.action.type==='sourceEventItems'&&x.action.event===event);assert(o,'No fixed event '+event);return settle(step(n,o.action));}
 function researchEvent(st,id,event=null){
  if(active(st,id))return st;
  const n=monthly.advance(st),o=rp.options(n).find(x=>x.action.type==='eventResearch'&&x.action.research===id&&(!event||x.action.event===event));assert(o,'No event research '+id);return settle(step(n,o.action));
 }
 function sample(st,id,bonus){
  if(active(st,bonus))return st;
  const type=active(st,id)?'repeatResearch':'research';
  const o=rp.options(st).find(x=>x.action.type===type&&x.action.id===id);assert(o,'No sample project '+id);
  const n=settle(rp.research(st,o.action),bonus);assert(active(n,bonus),'Selected reward missing '+bonus);return n;
 }
 function acquire(st,adapter,id){
  const n=monthly.advance(st),o=adapter.options(n,id)[0];assert(o,'No event item '+id);return settle(adapter.apply(n,o.action));
 }
 function learn(st,bonus,sources){
  if(active(st,bonus))return st;
  const failures=[];
  for(const src of sources){try{
   const [id,kind,event]=src;
   assert(data.researchRules[id].getOneFree.includes(bonus),'Free reward not declared');
   if(rp.options(st).some(x=>['research','repeatResearch'].includes(x.action.type)&&x.action.id===id))return sample(st,id,bonus);
   const n=kind==='fixed'?fixed(st,event):acquire(st,kind==='ally'?ps.ally:repeatEnemy,id);
   return sample(n,id,bonus);
  }catch(e){failures.push(src[0]+': '+e.message);}}
  throw Error(failures.join('; '));
 }
 function fund(st,amount){let n=st;for(let i=0;n.world.funds<amount;i++){assert(i<10);n=monthly.advance(n);const o=repeatCash.options(n)[0];assert(o,'No cash event');n=settle(repeatCash.apply(n,o.action));}return n;}
 // Independent branch setup. No actions after the fork are copied verbatim.
 for(const id of ['STR_ALIEN_ORIGINS','STR_PSI_LAB','STR_SMALL_RADAR_SYSTEM','STR_COMMUNICATIONS','STR_SCI_REP','STR_THE_PHARMACIST','STR_HARDWARE_SHOPPING','STR_GUN_SHOPPING','STR_CONTACT_GENERAL_SUPPLIES','STR_CONTACT_BUILDERS','STR_SCHOOLING_1','STR_SKINNING','STR_BOWS_SUMMARY','STR_PRIMITIVE_WEAPONS','STR_UBER_WHEAT','STR_FARMING','STR_RAIDER_CORPSE','STR_MUTANT_ABILITIES','STR_HELLERIUM_CHARM','STR_MESS_HALL'])research(id);
 advance('Captain personality',st=>researchEvent(st,'STR_CAPTAIN_PERSONALITY_TEST','STR_CAPTAIN_PERSONALITY_TEST'));
 research('STR_CAPTAIN_DUMBASS');
 advance('Initial cash',st=>fund(st,1500000));
 // Select fixed event supplies and actual research rewards from the current branch.
 advance('Beer',st=>learn(st,'STR_BEER',[['STR_HUMAN_SHARP_GUY','fixed','STR_KNOCK_KNOCK_BRAD_AND_JANET'],['STR_GUILD_SOLDIER'],['STR_GOVT_AGENT']]));
 advance('Vodka',st=>learn(st,'STR_VODKA',[['STR_GUILD_SOLDIER'],['STR_GUILD_MEDIC'],['STR_RET_HYBRID']]));
 advance('Mutant egg',st=>researchEvent(st,'STR_MUTANT_EGG','STR_COOKING_EVENT_RECIPES'));
 research('STR_CUISINE');
 advance('Elerium from dealer',st=>{
  if(active(st,'STR_ELERIUM_115'))return st;
  const o=rp.options(st).find(o=>o.action.type==='repeatResearch'&&o.action.id==='STR_TAKE_ME_TO_YOUR_DEALER');assert(o);
  const n=settle(rp.research(st,o.action),'STR_ELERIUM_115');assert(active(n,'STR_ELERIUM_115'));return n;
 });
 advance('Poison sample',st=>{if(active(st,'STR_MEGASCORPION_POISON'))return st;let n=monthly.advance(st);const o=ae.option(n,'STR_KNOCK_KNOCK_WILD_GNOME');assert(o);return lab(settle(ae.apply(n,o.action)),'STR_MEGASCORPION_POISON');});
 research('STR_POISONED_WEAPONS');
 const plans=[
 ['STR_APPLE',[['STR_HUMAN_SHARP_GIRL','fixed','STR_KNOCK_KNOCK_BRAD_AND_JANET'],['STR_ACADEMY_THRALL']]],
 ['STR_BIG_BONE',[['STR_WANDERER_VICTIM','fixed','STR_KNOCK_KNOCK_WANDERER']]],
 ['STR_MONSTER_EYE',[['STR_WANDERER_VICTIM','fixed','STR_KNOCK_KNOCK_WANDERER'],['STR_HUMAN_NOMAD'],['STR_GUILD_MEDIC']]],
 ['STR_ORE',[['STR_GUILD_SOLDIER']]],
 ['STR_SILVER_BAR',[['STR_GUILD_MEDIC'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_SHROOM_RED',[['STR_RET_HYBRID'],['STR_GUILD_MEDIC'],['STR_NINJA_WARRIOR']]],
 ['STR_YELLOW_GEM',[['STR_GUILD_SOLDIER'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_RED_GEM',[['STR_HUMAN_NOBLEWOMAN'],['STR_SMUGGLER_CAPTAIN']]],
 ['STR_BLUE_GEM',[['STR_HUMAN_SHARP_GUY'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_GREEN_GEM',[['STR_CHURCH_HANDMAID'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_DIAMOND',[['STR_GUILD_ATTENDANT'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_CHURCH_CORPSE',[['STR_CHURCH_PRIEST'],['STR_CHURCH_LEADER']]],
 ['STR_ACADEMY_CORPSE',[['STR_SECTOID_MEDIC'],['STR_SECTOID_ENGINEER']]],
 ['STR_ANKH',[['STR_BANDIT_TOMB_RUNNER'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_BLACK_CAT',[['STR_HUMAN_NOBLEWOMAN'],['STR_ACADEMY_COUNSELLOR']]],
 ['STR_ALIEN_ENTERTAINMENT',[['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_GOLDEN_CUP',[['STR_BANDIT_TOMB_RUNNER'],['STR_HUMAN_NOBLEWOMAN']]],
 ['STR_MEDALLION',[['STR_HUMAN_NOBLEWOMAN'],['STR_BANDIT_TOMB_RUNNER']]],
 ['STR_SHROOM_BROWN',[['STR_SECTOID_MEDIC'],['STR_RAIDER_SCOUT']]],
 ['STR_SKULL',[['STR_TURANIAN_UBER','ally']]],
 ['STR_NINJA_LEARNING_ARRAY',[['STR_NINJA_WARRIOR']]],
 ['STR_NINJA_CLONING_POD',[['STR_NINJA_WARRIOR']]],
 ];
 for(const [id,sources] of plans)advance(id,st=>learn(st,id,sources));
 advance('Old books',st=>learn(st,'STR_OLD_BOOKS',[['STR_RET_HYBRID'],['STR_GUILD_MEDIC']]));
 // Alternate source for the silver sample and notes, as in V169, but in
 // this branch's own month and funds.
 advance('Silver expedition',st=>{
  if(active(st,'STR_SILVER_BAR'))return st;
  let n=monthly.advance(st);const o=ae.option(n,'STR_JACKDUMB_PIRATEZ','STR_SILVER_BAR');assert(o);
  n=settle(ae.apply(n,o.action));return lab(n,'STR_SILVER_BAR');
 });
 // Close any enabled dependency of the explicit targets, including facility
 // research, with no branch disabling or implicit free-research choice.
 const wanted=new Set();
 function visit(id){if(wanted.has(id)||active(s,id))return;wanted.add(id);const r=data.researchRules[id];for(const k of [...arr(r?.dependencies),...arr(r?.requires)])visit(k);}
 for(const id of target)visit(id);
 for(let i=0;i<80;i++){
  const o=rp.options(s).find(o=>{const r=data.researchRules[o.action.id];return o.action.type==='research'&&wanted.has(o.action.id)&&r&&!arr(r.disables).length&&!arr(r.getOneFree).length&&!Object.keys(r.getOneFreeProtected||{}).length;});
  if(!o)break;const prev=s;research(o.action.id);if(s===prev)break;
 }
 // Persist success independently of any remaining research or material blockers.
 for(const id of ['STR_WELL','STR_STILL','STR_WITCH_CAVE'])advance('Construct '+id,st=>{
  if(st.world.facilities.has(id))return st;const m=ps.requirements(st,id);assert(!m.research.length&&!m.functions.length&&!Object.keys(m.items).length,JSON.stringify(m));
  let n=fund(st,st.world.funds+m.funds);const a=ps.startOption(n,id);assert(a);n=ps.applyFacility(n,a);
  for(let i=0;i<Math.ceil(a.days/28);i++)n=monthly.advance(n);const done=ps.completeOption(n);assert(done);return ps.applyFacility(n,done);
 });
 const actions=s.actions.slice(seed.actions.length);let replay=restoreV171(PRIOR,'hybrid');for(const a of actions)replay=step(replay,a);assert.deepEqual(receipt(replay),receipt(s));
 const deps=id=>arr(data.researchRules[id]?.dependencies);
 const summary={preservedGoals:bulk.goals.length,newActions:actions.length,newResearch:[...s.world.researched].filter(k=>active(s,k)&&!active(seed,k)),alchemyBefore:deps('STR_ALCHEMY').filter(k=>active(seed,k)).length,alchemyAfter:deps('STR_ALCHEMY').filter(k=>active(s,k)).length,alchemyTotal:deps('STR_ALCHEMY').length,gemologyBefore:deps('STR_GEMOLOGY').filter(k=>active(seed,k)).length,gemologyAfter:deps('STR_GEMOLOGY').filter(k=>active(s,k)).length,gemologyTotal:deps('STR_GEMOLOGY').length,psiBefore:deps('STR_PSI_COMMUNION').filter(k=>active(seed,k)).length,psiAfter:deps('STR_PSI_COMMUNION').filter(k=>active(s,k)).length,psiTotal:deps('STR_PSI_COMMUNION').length,alchemy:active(s,'STR_ALCHEMY'),magitech:active(s,'STR_MAGITECH_SUMMARY'),mushroomBeer:active(s,'STR_MUSHROOM_BEER'),newFacilities:[...s.world.facilities].filter(k=>!seed.world.facilities.has(k)),newBirths:0,newTraitApplications:0,finalAdmission:0};
 const blockers=Object.fromEntries(target.map(id=>[id,{active:active(s,id),missing:deps(id).filter(k=>!active(s,k)),functions:arr(data.researchRules[id]?.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k))}]));
 const report={schema:'ATLAS_OVERCAP_HYBRID_SUPPORT_WAVE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:sha(fs.readFileSync(PRIOR)),alchemyPath:ALC,alchemySha256:sha(fs.readFileSync(ALC)),psiPath:PSI,psiSha256:sha(fs.readFileSync(PSI)),bulkPath:BULK,bulkSha256:sha(fs.readFileSync(BULK)),scope:'Independent hybrid conditional campaign; no native time, full economy, score or combat certification. Failed attempts are not actions. No state union or final admission.',seed:snapshot(seed),continuation:snapshot(s),actions,trace:s.trace.slice(seed.trace.length),milestones,errors,blockers,summary,normalizationComplete:false,actualGameCertified:false,finalAdmission:false};
 const plain=JSON.stringify(report)+'\n',bytes=gzipSync(plain,{level:9}),out='tools/data/overcap-hybrid-support-wave-v1-'+sha(bytes).slice(0,20)+'.json.gz';
 if(fs.existsSync(out))assert(fs.readFileSync(out).equals(bytes));else fs.writeFileSync(out,bytes,{flag:'wx'});
 // Site-ready exact goal index, with separate branch rows and no maxima.
 const groupMap=new Map(bulk.groups.map(g=>[g.id,g])),acqMap=new Map(bulk.acquisitions.map(a=>[a.id,a]));
 const priestPath='tools/data/overcap-trait-branch-fork-v1-c3b6ec68cf12ba118a1c.json',priest=read(priestPath);
 let pr=rp.start(priest.fork.commonActions[0].difficulty);
 for(const a of priest.fork.commonActions.slice(2))pr=step(pr,a);
 assert.equal(hash(pr),priest.fork.commonStateHash);
 for(const a of priest.priest.actions)pr=step(pr,a);
 assert.equal(hash(pr),priest.priest.state.stateHash);
 const states=[['existing',old],['hybrid',s],['priest',pr]];
 const acqs=bulk.acquisitions.map(a=>({id:a.id,origin:a.profile,branches:states.map(([id,st])=>({id,missing:rp.missing(st,a.requirements),originAlreadyRecruited:st.actions.some(x=>x.type==='recruit'&&x.profile===a.profile)}))}));
 const groups=bulk.groups.map(g=>{
  const acq=acqMap.get(g.acquisition);assert(acq);
  const research=[...new Set([...arr(acq.requirements.research),...g.stages.flatMap(t=>arr(t.requirements?.research))])];
  return {id:g.id,acquisition:acq.id,origin:acq.profile,required:research,transformations:g.stages.filter(t=>t.action.type==='transform').map(t=>t.action.transform),branches:states.map(([id,st])=>({id,missing:research.filter(k=>!active(st,k)),disabled:research.filter(k=>st.world.disabled.has(k))}))};
 });
 const v167Path='tools/data/overcap-trait-guild-wave-v1-d654bdb07ed5b1c84918.json',v167=read(v167Path);
 assert.equal(v167.sourceMetadataSha256,data.meta.source.metadataSha256);
 const partial=new Map(v167.links.filter(x=>x.status==='CONDITIONAL_REORDERED_TRAIT_PREFIX').map(x=>[x.goal,x.partialRoute]));
 const partialRoutes=v167.routes.filter(r=>r.applied.length).map(r=>({id:r.id,body:r.actual.body,traits:r.actual.traits,statKeys:r.actual.statKeys,effective:r.actual.effective,applied:r.applied.map(a=>a.transform),finalAdmission:false}));
 const goals=bulk.goals.map(g=>{assert(groupMap.has(g.group));return {id:g.id,group:g.group,legacyBranch:g.legacyBranch,difficulty:g.difficulty,body:g.targetBody,traits:g.legacyExpected.traits.map(([id,count])=>({id,count})),partialRoute:partial.get(g.id)||null,finalAdmission:false};});
 assert.equal(new Set(goals.map(g=>g.id)).size,184);
 const names={};
 const known=[...data.profiles.map(x=>[x.id,x.sourceKoName||x.soldierKoName]),...data.soldiers.map(x=>[x.id,x.koName]),...data.transformations.map(x=>[x.id,x.koName]),...data.bonuses.map(x=>[x.id,x.koName])];
 const ids=new Set([...goals.flatMap(x=>[x.body,...x.traits.map(t=>t.id)]),...groups.flatMap(x=>[x.origin,...x.required,...x.transformations]),...partialRoutes.flatMap(x=>[x.body,...x.traits.map(t=>t[0]),...x.applied])]);
 for(const [id,label] of known)if(ids.has(id)&&label)names[id]=label;
 const site={schema:'ATLAS_FORWARD_TRAIT_GOAL_PROGRESS_V1',names,statLabels:data.statLabels,sourceMetadataSha256:data.meta.source.metadataSha256,producer:out,producerSha256:sha(bytes),preservedGoals:goals.length,scope:'Research support only. Every goal is a quarantined legacy target, not an attainable trait combination or a maximum. Branches are independent; no combined score.',branches:states.map(([id,st])=>({id,month:st.world.month,difficulty:st.world.difficulty,stateHash:hash(st),actionCount:st.actions.length})),goals,groups,acquisitions:acqs,partialRoutes,partialSource:v167Path,partialSourceSha256:sha(fs.readFileSync(v167Path)),priestSource:priestPath,priestSourceSha256:sha(fs.readFileSync(priestPath)),finalAdmission:0,actualGameCertified:0};
 const sitePath='public/data/soldier-forward-trait-progress-v172.json',siteBytes=JSON.stringify(site)+'\n';fs.writeFileSync(sitePath,siteBytes);
 console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),sitePath,siteBytes:Buffer.byteLength(siteBytes),summary,errors,blockers,month:s.world.month,funds:s.world.funds,hash:hash(s)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
