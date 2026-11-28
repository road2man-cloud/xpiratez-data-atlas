// V166: fork BEFORE mutually exclusive captain selection. Preserve the
// V165 path, and allocate every legacy goal to explicit branch requirements.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {restoreLibrary,checkpoint,checkpointPath,data,rp,receipt,read,sha} from './atlas-overcap-forward-library-checkpoint-v1.mjs';
import {monthly,settle,lab} from './atlas-overcap-forward-ranked-checkpoint-v1.mjs';
const priorPath='tools/data/overcap-trait-forward-wave-v1-45144b3d36633f8bf180.json';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const prior=read(priorPath),bulk=read(bulkPath);
assert.equal(prior.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(bulk.sourceMetadataSha256,data.meta.source.metadataSha256);
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const step=(s,a)=>a.type==='sourceMonthlyBoundary'?monthly.advance(s,a):monthly.scripted(a)?monthly.applyLegacy(s,a,(w,x)=>rp.research(w,x)):rp.research(s,a);
const parent=restoreLibrary().s;
let old=parent;for(const a of prior.newActions)old=step(old,a);
assert.equal(receipt(old).stateHash,prior.continuation.stateHash);
const oldStart=old;
const oldAdded=[];
for(const id of ['STR_BOUNTY_HUNTING','STR_ZONE_STALKER']){
 if(rp.options(old).some(o=>o.action.type==='research'&&o.action.id===id)){
  const prev=old;old=lab(old,id);oldAdded.push(...old.actions.slice(prev.actions.length));
 }
}
// Never copy post-fork research, inventory or recruited soldiers into a new
// campaign. All new research must be reached via the branch's actual options.
const all=checkpoint.continuation.actions;
const forkIndex=all.findIndex(a=>a.type==='research'&&a.id==='STR_CAPTAIN_DUMBASS');
assert(forkIndex>2);
function prefix(){let s=rp.start(all[0].difficulty);assert.deepEqual(s.actions,all.slice(0,2));for(const a of all.slice(2,forkIndex))s=step(s,a);return s;}
const base=prefix();assert.equal(base.world.month,4);
assert(!base.world.disabled.has('STR_CAPTAIN_PUSSY'));
assert(old.world.disabled.has('STR_CAPTAIN_PUSSY'));
let priest=lab(base,'STR_CAPTAIN_PUSSY');
priest=monthly.advance(priest);
const event=rp.options(priest).find(o=>o.action.type==='eventResearch'&&o.action.event==='STR_CAPTAIN_PERSONALITY_TEST2'&&o.action.research==='STR_CAPTAIN_PUSSY_UP');
assert(event,'Personality test event not available');
priest=settle(step(priest,event.action));
priest=lab(priest,'STR_CAPTAIN_PRIEST');
priest=lab(priest,'STR_BREAD_AND_FISHES_TRAINING');
assert(active(priest,'STR_BREAD_AND_FISHES_TRAINING'));
const forkCore=priest.actions.slice(forkIndex);
// Extend common target support without selecting further exclusive research.
const groups=bulk.groups.filter(g=>g.stages.some(s=>s.action.transform==='STR_BREAD_AND_FISHES_TRAINING'));
const goalIds=new Set(groups.flatMap(g=>g.goalIds));
const targets=new Set(groups.flatMap(g=>g.stages.flatMap(s=>s.requirements?.research||[])));
const related=new Map();
function walk(id,target,seen=new Set()){
 if(seen.has(id))return;seen.add(id);
 if(!related.has(id))related.set(id,new Set());related.get(id).add(target);
 if(active(priest,id))return;
 const r=data.researchRules[id];
 for(const k of [...(r?.requires||[]),...(r?.dependencies||[])])walk(k,target,seen);
}
for(const t of targets)walk(t,t);
for(let i=0;i<35;i++){
 const options=rp.options(priest).filter(o=>{
  const id=o.action.id,r=data.researchRules[id];
  return o.action.type==='research'&&related.has(id)&&r&&!active(priest,id)&&!r.needItem&&!(r.disables||[]).length&&!(r.getOneFree||[]).length&&!Object.keys(r.getOneFreeProtected||{}).length;
 }).sort((a,b)=>related.get(b.action.id).size-related.get(a.action.id).size||a.action.id.localeCompare(b.action.id));
 if(!options.length)break;
 priest=lab(priest,options[0].action.id);
}
const priestActions=priest.actions.slice(forkIndex);
let replay=prefix();for(const a of priestActions)replay=step(replay,a);assert.deepEqual(receipt(replay),receipt(priest));
let oldReplay=oldStart;for(const a of oldAdded)oldReplay=step(oldReplay,a);assert.deepEqual(receipt(oldReplay),receipt(old));
const traitId='STR_BREAD_AND_FISHES_TRAINING',training=data.transformations.find(t=>t.id===traitId);
const req={research:training.requires,functions:training.requiresBaseFunc,items:training.requiredItems,cost:training.cost};
// Extract only the relevant source fields, never publish full ruleset.
const root=process.env.XPZ_RULESET_DIR||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset';
const require=createRequire(import.meta.url);
const yaml=require(process.env.XPZ_YAML_MODULE||'D:/xpiratez-data-atlas/node_modules/js-yaml');
function rules(file){const bytes=fs.readFileSync(root+'/'+file),hash=sha(bytes);assert.equal(hash,data.meta.source.rules.find(r=>r.file===file).sha256);return {hash,doc:yaml.load(bytes.toString('utf8'),{json:true})};}
const e=rules('Piratez_Events.rul'),p=rules('Piratez.rul');
const sacrifice=e.doc.events.find(x=>x.name==='STR_SACRIFICES'),script=e.doc.eventScripts.find(x=>x.type==='STR_SACRIFICES');
assert.equal(script.researchTriggers.STR_CROWNING_UC,true);
const recipes=p.doc.manufacture.filter(x=>['STR_LEEK_SACK_XXX','STR_CABBAGE_SACK_XXX'].includes(x.name)).map(x=>({id:x.name,requiredItems:x.requiredItems,producedItems:x.producedItems,time:x.time,cost:x.cost}));
assert.equal(recipes.length,2);
const fish=p.doc.items.find(x=>x.type==='STR_MUTANT_FISH');assert(fish.costBuy>0);
const supply={sourceFiles:{'Piratez_Events.rul':e.hash,'Piratez.rul':p.hash},sacrifice:{id:sacrifice.name,everyItemList:sacrifice.everyItemList,everyMultiItemList:sacrifice.everyMultiItemList,randomMultiItemList:sacrifice.randomMultiItemList,timer:sacrifice.timer,timerRandom:sacrifice.timerRandom,script:{id:script.type,firstMonth:script.firstMonth,executionOdds:script.executionOdds,researchTriggers:script.researchTriggers,eventWeights:script.eventWeights},availableOnPriest:active(priest,'STR_CROWNING_UC'),availableOnV165:active(old,'STR_CROWNING_UC')},recipes,fish:{id:fish.type,buyCost:fish.costBuy,requiresBuy:fish.requiresBuy||[],generalRequires:fish.requires||[]},productionStatus:'SOURCE_INDEXED_NOT_EXECUTED'};
const sources=id=>({events:(data.eventResearchSources[id]||[]).map(x=>x.event),explicitUnlocks:Object.entries(data.researchRules).filter(([k,r])=>r.unlocks?.includes(id)).map(([k])=>k),freeResearch:Object.entries(data.researchRules).filter(([k,r])=>r.getOneFree?.includes(id)||Object.values(r.getOneFreeProtected||{}).some(a=>a.includes(id))).map(([k])=>k),reenables:Object.entries(data.researchRules).filter(([k,r])=>r.reenables?.includes(id)).map(([k])=>k)});
const byGroup=new Map(bulk.groups.map(g=>[g.id,g])),byAcq=new Map(bulk.acquisitions.map(a=>[a.id,a]));
const assignments=bulk.goals.map(g=>{
 const group=byGroup.get(g.group),acq=byAcq.get(g.acquisition);assert(group&&acq);
 const isPriest=goalIds.has(g.id);
 return {goal:g.id,group:g.group,originProfile:acq.profile,targetBody:g.targetBody,legacyBranch:g.legacyBranch,
  branch:isPriest?'PRIEST':'UNASSIGNED_OTHER_GOALS',requiredTraitResearch:isPriest?[traitId]:[],
  status:isPriest?'PRIEST_RESEARCH_REACHED_ACQUISITION_PENDING':'PRESERVED_NOT_YET_BRANCH_VALIDATED',
  finalAdmission:false,actualGameCertified:false};
});
assert.equal(new Set(assignments.map(a=>a.goal)).size,184);
const acqRefs=bulk.acquisitions.filter(a=>a.goalIds.some(id=>goalIds.has(id))).map(a=>({profile:a.profile,goals:a.goalIds.filter(id=>goalIds.has(id)),missing:rp.missing(priest,a.requirements)}));
const stateSummary=s=>({month:s.world.month,root:s.root,stateHash:receipt(s).stateHash,research:[...s.world.researched].filter(id=>active(s,id)).sort(),disabled:[...s.world.disabled].sort(),items:s.world.items,functions:[...s.world.baseFunctions].sort(),balance:s.world.funds});
const report={schema:'ATLAS_OVERCAP_TRAIT_BRANCH_FORK_V1',sourceMetadataSha256:data.meta.source.metadataSha256,checkpointPath,checkpointSha256:sha(fs.readFileSync(checkpointPath)),priorPath,priorSha256:sha(fs.readFileSync(priorPath)),bulkPath,bulkSha256:sha(fs.readFileSync(bulkPath)),fork:{index:forkIndex,commonStateHash:receipt(base).stateHash,commonActions:all.slice(0,forkIndex),oldChoice:'STR_CAPTAIN_DUMBASS',newChoice:'STR_CAPTAIN_PUSSY'},priest:{core:forkCore,actions:priestActions,trace:priest.trace.slice(base.trace.length),state:stateSummary(priest),traitResearch:active(priest,traitId),trainingMissing:rp.missing(priest,req),acquisitions:acqRefs},old:{actions:oldAdded,trace:old.trace.slice(oldStart.trace.length),state:stateSummary(old),traitResearch:active(old,traitId),disabledAncestor:'STR_CAPTAIN_PUSSY'},alternativeResearchSources:Object.fromEntries(['STR_CAPTAIN_PUSSY','STR_CAPTAIN_PUSSY_UP','STR_CAPTAIN_PRIEST',traitId].map(id=>[id,sources(id)])),supply,assignments,summary:{preservedGoals:assignments.length,priestGoals:goalIds.size,priestGroups:groups.length,priestNewActions:priestActions.length,priestNewActiveResearch:[...priest.world.researched].filter(id=>active(priest,id)&&!active(base,id)).length,oldNewActions:oldAdded.length,otherGoals:assignments.length-goalIds.size,trainingApplied:0,finalAdmission:0},actualGameCertified:false,finalAdmission:false,normalizationComplete:false};
const bytes=JSON.stringify(report)+'\n';
const out='tools/data/overcap-trait-branch-fork-v1-'+sha(bytes).slice(0,20)+'.json';
if(fs.existsSync(out))assert.equal(fs.readFileSync(out,'utf8'),bytes);else fs.writeFileSync(out,bytes,{flag:'wx'});
console.log(JSON.stringify({out,bytes:Buffer.byteLength(bytes),summary:report.summary,priestMonth:priest.world.month,priestHash:receipt(priest).stateHash,trainingMissing:report.priest.trainingMissing,acquisitions:acqRefs.map(({profile,missing})=>({profile,missing})),oldNew:oldAdded,priestNew:priestActions.map(a=>a.id||a.research||a.type),sacrificeAvailable:supply.sacrifice.availableOnPriest}));
