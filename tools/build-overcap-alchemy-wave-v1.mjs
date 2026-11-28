// V169: replay source-bound monthly rewards and research samples to close alchemy.
// Each selected event consumes a distinct modeled month. The V168 common
// checkpoint and its alternate branch are not modified.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {restoreV168} from './build-overcap-zombie-embodiment-wave-v1.mjs';
import {data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,repeatEnemy,settle,lab,lock} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const PRIOR='tools/data/overcap-zombie-embodiment-wave-v1-e3c4cb95e9b59a39acb8.json';
const BULK='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const WILD='STR_KNOCK_KNOCK_WILD_GNOME',JACK='STR_JACKDUMB_PIRATEZ',WAND='STR_KNOCK_KNOCK_WANDERER';
const DEPS=data.researchRules.STR_ALCHEMY.dependencies;
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const qty=(s,id)=>Number(s.world.items[id]||0);
const arr=x=>Array.isArray(x)?x:[];
const plans=[{event:WILD,script:'STR_KNOCK_KNOCK_DUMBLAZY_1'},{event:JACK,script:'STR_CAPTAIN_JACKDUMB_EVENTS_1'},{event:WAND,script:'STR_KNOCK_KNOCK_0'}];
function extractProof(){
 const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
 const yaml=createRequire(import.meta.url)(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
 const sourceFiles={};
 function parse(file){const b=fs.readFileSync(root+'/'+file),h=sha(b);assert.equal(h,data.meta.source.rules.find(x=>x.file===file).sha256);sourceFiles[file]=h;return yaml.load(b.toString('utf8'),{json:true});}
 const e=parse('Piratez_Events.rul'),p=parse('Piratez.rul');
 const archive='tools/headless-simulator/native/'+lock.archive;
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const file='./src/Geoscape/GeoscapeEventState.cpp',t=execFileSync('tar',['-xOf',archive,file],{encoding:'utf8'}),lines=t.split(/\r?\n/);
 const engineEvidence={file,sha256:sha(t),matches:['save->setFunds(save->getFunds() + rule.getFunds())','rule.getEveryMultiItemList()','rule.getEveryItemList()','RNG::generate(0, rule.getRandomItemList().size() - 1)','itemsToTransfer[randomItem->getType()] += 1'].map(n=>{const i=lines.findIndex(l=>l.includes(n));assert(i>=0,n);return {line:i+1,text:lines[i].trim()};})};
 const topics=[...new Set([...DEPS,'STR_JOURNEY_NOTES','STR_WANDERER_VICTIM','STR_GUILD_SOLDIER','STR_MEGASCORPION_POISON','STR_ZOMBIE_ESSENCE','STR_ZOMBIE_SUSTENANCE','STR_ALCHEMY'])];
 return {schema:'ATLAS_OVERCAP_ALCHEMY_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles,engineArchiveSha256:lock.archiveSha256,engineEvidence,
 events:plans.map(q=>({raw:e.events.find(x=>x.name===q.event),script:e.eventScripts.find(x=>x.type===q.script)})),
 research:p.research.filter(r=>topics.includes(r.name))};
}
export function createAlchemyEvents(proof){
 assert.equal(proof.schema,'ATLAS_OVERCAP_ALCHEMY_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.equal(proof.engineArchiveSha256,lock.archiveSha256);
 for(const [f,h] of Object.entries(proof.sourceFiles))assert.equal(h,data.meta.source.rules.find(r=>r.file===f).sha256);
 for(const r of proof.research){const d=data.researchRules[r.name];assert(d);assert.deepEqual(arr(r.dependencies),d.dependencies);assert.deepEqual(arr(r.requires),d.requires);assert.deepEqual(arr(r.getOneFree),d.getOneFree);assert.deepEqual(r.getOneFreeProtected||{},d.getOneFreeProtected||{});assert.equal(!!r.needItem,d.needItem);assert.equal(!!r.destroyItem,d.destroyItem);assert.deepEqual(arr(r.requiresBaseFunc),d.requiresBaseFunc);}
 const byEvent=new Map();
 for(const q of plans){
  const p=proof.events.find(x=>x.raw.name===q.event);assert(p);const {raw,script}=p;
  assert.equal(script.type,q.script);
  assert(Object.keys(raw).every(k=>['name','description','background','music','everyItemList','everyMultiItemList','randomItemList','funds','points','timer','timerRandom'].includes(k)),'Unknown event side effect');
  assert(Object.keys(script).every(k=>['type','eventWeights','researchTriggers','firstMonth','lastMonth','executionOdds','minDifficulty','maxDifficulty'].includes(k)),'Unknown event gate');
  const fixed={};for(const k of arr(raw.everyItemList))fixed[k]=(fixed[k]||0)+1;
  for(const [k,n] of Object.entries(raw.everyMultiItemList||{})){assert(Number.isSafeInteger(n)&&n>0);fixed[k]=(fixed[k]||0)+n;}
  const pool=arr(raw.randomItemList);
  if(q.event===JACK){assert.deepEqual(fixed,{STR_JOURNEY_NOTES:1});assert(pool.includes('STR_SILVER_BAR'));assert.equal(raw.funds,-10000);}
  else{const c=data.forwardSupply.events[q.event];assert(c);assert.deepEqual(fixed,c.fixed);assert(!pool.length);assert.equal(raw.funds||0,0);assert.equal(raw.points||0,0);}
  assert(Object.keys(fixed).length&&Number.isSafeInteger(raw.funds??0)&&Number.isSafeInteger(raw.points??0));
  byEvent.set(q.event,{raw,script,fixed,pool});
 }
 function option(s,id,item=null){
  const p=byEvent.get(id);if(!p)return null;
  const {raw,script,fixed,pool}=p,w=s.world,prev=s.actions.at(-1);
  if(!rp.settled(s)||prev?.type!=='sourceMonthlyBoundary'||prev.month!==w.month||w.month<(script.firstMonth??0)||(script.lastMonth!=null&&script.lastMonth>=0&&w.month>script.lastMonth)||w.difficulty<(script.minDifficulty??0)||w.difficulty>(script.maxDifficulty??4)||w.funds+(raw.funds||0)<0)return null;
  if(Object.entries(script.researchTriggers||{}).some(([k,v])=>active(s,k)!==v))return null;
  if(pool.length?!pool.includes(item):item!==null)return null;
  const buckets=Object.keys(script.eventWeights).map(Number).filter(n=>n<=w.month).sort((a,b)=>b-a);if(!buckets.length)return null;
  const weights=script.eventWeights[String(buckets[0])],weight=weights[id]||0,total=Object.values(weights).reduce((a,b)=>a+b,0);
  if(!weight||!(script.executionOdds??100))return null;
  const rewards={...fixed};if(item)rewards[item]=(rewards[item]||0)+1;
  const action={type:'sourceAlchemyMonthlyItemEvent',event:id,script:script.type,month:w.month,occurrence:Number(w.generatedEvents[id]||0)+1,selectedRandomItem:item,assumeOutcome:true};
  const evidence={kind:'SOURCE_BOUND_MIXED_OR_FIXED_MONTHLY_REWARD',proofSha256:sha(JSON.stringify(proof)),executionOdds:script.executionOdds??100,weight,totalWeight:total,poolSize:pool.length,matchingSlots:pool.filter(x=>x===item).length,rewards,delta:raw.funds??0,points:raw.points??0,timer:raw.timer,timerRandom:raw.timerRandom,deliveryWithinMonthConditional:true,otherEventsUnmodeled:true};
  return {action,evidence};
 }
 function apply(s,a){
  const o=option(s,a.event,a.selectedRandomItem);assert(o);assert.deepEqual(o.action,a);
  const w=structuredClone(s.world),e=o.evidence;
  w.generatedEvents[a.event]=a.occurrence;w.funds+=e.delta;
  w.forwardEventFunds=Number(w.forwardEventFunds||0)+e.delta;w.forwardEventPoints=Number(w.forwardEventPoints||0)+e.points;
  for(const [item,count] of Object.entries(e.rewards))w.forwardDeliveries=[...arr(w.forwardDeliveries),{kind:'event',source:a.event,item,count}];
  const income=s.income+Math.max(e.delta,0),procurement=s.procurement+Math.max(-e.delta,0);
  assert.equal(w.funds,income-procurement-s.careerSpend);
  return {...s,world:w,income,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:e}]};
 }
 return {option,apply};
}
function step(s,a,adapter){
 if(a.type==='sourceMonthlyBoundary')return monthly.advance(s,a);
 if(a.type==='sourceAlchemyMonthlyItemEvent')return adapter.apply(s,a);
 if(a.type==='sourceMonthlyItemEvent'){assert.equal(a.event,'STR_TROUBLESEEKING_ENEMY');return repeatEnemy.apply(s,a);}
 return monthly.scripted(a)?monthly.applyLegacy(s,a,(w,x)=>rp.research(w,x)):rp.research(s,a);
}
export function restoreV169(path){
 const r=read(path);assert.equal(r.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(r.priorSha256,sha(fs.readFileSync(PRIOR)));assert.equal(r.proofSha256,sha(JSON.stringify(r.proof)));
 const ad=createAlchemyEvents(r.proof);let s=restoreV168(PRIOR,'poltergeist');assert.equal(receipt(s).stateHash,r.seed.stateHash);
 for(const a of r.actions)s=step(s,a,ad);
 assert.equal(receipt(s).stateHash,r.continuation.stateHash);return s;
}
function build(){
 const proof=extractProof(),ad=createAlchemyEvents(proof),seed=restoreV168(PRIOR,'poltergeist'),bulk=read(BULK);
 const prior=read(PRIOR);assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
 const reserve={STR_POLTERGEIST:1,STR_ZOMBIE_STERILE_TERRORIST:1,STR_GLAMOUR:10,STR_ZOMBIE_ESSENCE:5,STR_ZOMBIE_BRAIN:1};
 let s=seed;const milestones=[],errors=[];
 function advance(label,fn){
  const before=s;try{const next=fn(before);assert.deepEqual(next.actions.slice(0,before.actions.length),before.actions);
   for(const [k,n] of Object.entries(reserve))assert(qty(next,k)>=n,'Reserved material '+k);
   if(next.actions.length>before.actions.length){s=next;milestones.push({label,month:s.world.month,actions:s.actions.slice(before.actions.length),newResearch:[...s.world.researched].filter(id=>active(s,id)&&!active(before,id)),stateHash:receipt(s).stateHash});}
  }catch(e){errors.push({label,reason:String(e.message)});}
 }
 function event(st,id,item=null){let n=monthly.advance(st);const o=ad.option(n,id,item);assert(o,'Event unavailable '+id);return settle(ad.apply(n,o.action));}
 function sample(st,id,target){
  if(active(st,target))return st;
  const type=active(st,id)?'repeatResearch':'research';
  const o=rp.options(st).find(x=>x.action.type===type&&x.action.id===id);assert(o,'Sample research unavailable '+id);
  const n=settle(rp.research(st,o.action),target);assert(active(n,target),'Selected free reward not reached '+target);return n;
 }
 advance('Elerium sample',st=>lab(st,'STR_ELERIUM_115'));
 advance('Wild gnome supplies and poison research',st=>{if(active(st,'STR_MEGASCORPION_POISON'))return st;const n=event(st,WILD);return lab(n,'STR_MEGASCORPION_POISON');});
 advance('Poisoned weapons',st=>lab(st,'STR_POISONED_WEAPONS'));
 advance('Piratez expedition: silver and journey notes',st=>{let n=event(st,JACK,'STR_SILVER_BAR');n=lab(n,'STR_SILVER_BAR');return n;});
 advance('Journey notes: apple',st=>sample(st,'STR_JOURNEY_NOTES','STR_APPLE'));
 advance('Wanderer: big bone',st=>sample(event(st,WAND),'STR_WANDERER_VICTIM','STR_BIG_BONE'));
 advance('Wanderer: monster eye',st=>sample(event(st,WAND),'STR_WANDERER_VICTIM','STR_MONSTER_EYE'));
 advance('Guild soldier: ore',st=>{if(active(st,'STR_ORE'))return st;let n=monthly.advance(st);const o=repeatEnemy.options(n,'STR_GUILD_SOLDIER')[0];assert(o,'Guild soldier event unavailable');n=settle(repeatEnemy.apply(n,o.action));return sample(n,'STR_GUILD_SOLDIER','STR_ORE');});
 advance('Piratez expedition: second notes',st=>active(st,'STR_SHROOM_RED')?st:event(st,JACK,'STR_GOLD_BAR'));
 advance('Journey notes: red mushroom',st=>sample(st,'STR_JOURNEY_NOTES','STR_SHROOM_RED'));
 advance('Alchemy',st=>lab(st,'STR_ALCHEMY'));
 advance('Zombie essence',st=>lab(st,'STR_ZOMBIE_ESSENCE'));
 advance('Zombie sustenance',st=>lab(st,'STR_ZOMBIE_SUSTENANCE'));
 // Additional common prerequisites only if already enabled.
 for(const id of ['STR_ZOMBIE_MEDICINE','STR_MAGITECH_SUMMARY','STR_MUTANT_PHYSIOLOGY','STR_PSI_COMMUNION','STR_POLTERGEIST_EMBODIMENT'])if(!active(s,id)&&rp.options(s).some(o=>o.action.type==='research'&&o.action.id===id))advance(id,st=>lab(st,id));
 const actions=s.actions.slice(seed.actions.length);
 let replay=restoreV168(PRIOR,'poltergeist');for(const a of actions)replay=step(replay,a,ad);
 assert.deepEqual(receipt(replay),receipt(s));
 const snap=st=>({month:st.world.month,difficulty:st.world.difficulty,stateHash:receipt(st).stateHash,balance:st.world.funds,stock:Object.fromEntries([...Object.keys(reserve),'STR_ELERIUM_115','STR_JOURNEY_NOTES','STR_SILVER_BAR','STR_GOLD_BAR'].map(id=>[id,qty(st,id)])),alchemyDependencies:DEPS.map(id=>({id,active:active(st,id)})),activeResearch:[...st.world.researched].filter(id=>active(st,id)),functions:[...st.world.baseFunctions]});
 const acquisitionRows=prior.acquisitions.map(a=>({profile:a.profile,goalIds:a.goalIds,groupIds:a.links.map(x=>x.group),legacyDifficulty:a.legacyDifficulty,modeledDifficulty:s.world.difficulty,requirements:a.requirements,missing:rp.missing(s,a.requirements),originNotYetRecruited:true,finalAdmission:false}));
 const unresolved=Object.fromEntries(['STR_ALCHEMY','STR_ZOMBIE_ESSENCE','STR_ZOMBIE_SUSTENANCE','STR_PSI_COMMUNION','STR_POLTERGEIST_EMBODIMENT','STR_ZOMBIE_EMBODIMENT'].map(id=>{const r=data.researchRules[id];return [id,{active:active(s,id),dependencies:arr(r.dependencies).filter(k=>!active(s,k)),functions:arr(r.requiresBaseFunc).filter(k=>!s.world.baseFunctions.has(k))}];}));
 const report={schema:'ATLAS_OVERCAP_ALCHEMY_WAVE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,priorPath:PRIOR,priorSha256:sha(fs.readFileSync(PRIOR)),bulkPath:BULK,bulkSha256:sha(fs.readFileSync(BULK)),proof,proofSha256:sha(JSON.stringify(proof)),scope:'Conditional selected monthly events, modeled laboratory samples and research rewards. Explicit monthly boundaries may exceed the earlier 60-month search horizon; no native campaign, complete calendar/economy or score certification.',branch:'poltergeist',seed:snap(seed),continuation:snap(s),reserve,milestones,errors,actions,trace:s.trace.slice(seed.trace.length),acquisitions:acquisitionRows,unresolved,summary:{preservedGoals:bulk.goals.length,linkedGoals:new Set(acquisitionRows.flatMap(r=>r.goalIds)).size,newActions:actions.length,newResearch:[...s.world.researched].filter(id=>active(s,id)&&!active(seed,id)),alchemyBefore:DEPS.filter(k=>active(seed,k)).length,alchemyAfter:DEPS.filter(k=>active(s,k)).length,alchemyTotal:DEPS.length,alchemy:active(s,'STR_ALCHEMY'),essence:active(s,'STR_ZOMBIE_ESSENCE'),sustenance:active(s,'STR_ZOMBIE_SUSTENANCE'),newBirths:0,newTraitApplications:0,finalAdmission:0,actualGameCertified:0},actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
 const bytes=JSON.stringify(report)+'\n',out='tools/data/overcap-alchemy-wave-v1-'+sha(bytes).slice(0,20)+'.json';
 if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
 console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),summary:report.summary,errors,month:s.world.month,stock:report.continuation.stock,unresolved,hash:report.continuation.stateHash}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)build();
