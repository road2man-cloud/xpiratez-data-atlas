// Consume the existing prefix receipts, not a new prefix search. Never promote
// a failed suffix, an external grant, or a prefix-only receipt to a final career.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {campaignStartWorld,labVerdict} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {createCampaignStartResearchPlanner} from '../public/soldiers/modern/campaign-start-research-planner-v1.js';
import {STAT_KEYS,bonusStats} from '../public/soldiers/modern/eligibility.js';
import {WITNESS_STATS,originEventScript} from '../public/soldiers/modern/origin-witness.js';
import {decodeOriginReport} from './origin-report-codec.mjs';
const args=Object.fromEntries(process.argv.slice(2).filter(s=>s.includes('=')).map(s=>s.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const repo=args.repo||process.cwd(),game=args.game||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez';
const require=createRequire(path.join(repo,'package.json')),yaml=require('js-yaml');
const prefix=JSON.parse(fs.readFileSync(args.prefix||'public/data/campaign-start-prefix-repair-v2.json'));
const worklist=JSON.parse(gunzipSync(fs.readFileSync(args.queue||'public/data/campaign-start-repair-worklist-v2.json.gz')));
const ref=execFileSync('git',['-C',repo,'rev-parse',args.ref||worklist.sourceCommit],{encoding:'utf8'}).trim();
if(ref!==worklist.sourceCommit||ref!==prefix.sourceCommit)throw Error('pinned-ledger-commit-mismatch');
const bytes=p=>execFileSync('git',['-C',repo,'show',ref+':'+p],{maxBuffer:256*1024*1024});
const read=p=>JSON.parse(bytes(p));const gz=f=>JSON.parse(gunzipSync(bytes('public/data/'+f+'.json.gz')));
const d=read('public/data/soldiers-modern-index.json'),catalog=read('public/data/soldier-source-catalog.json');
if(d.meta.mod.version!=='v.o2')throw Error('wrong-game-version');
d.sourceItemIds=new Set(catalog.itemIds);
const rules=path.join(game,'user/mods/Piratez/Ruleset'),files={},facilities={},items={},research={},terrains={},mapScripts={},alienDeployments={},missionScripts={},startingConditions={},crafts={},events={},eventScripts={},regions={};
let base,date;
function load(p,expected){
 const bytes=fs.readFileSync(p),h=createHash('sha256').update(bytes).digest('hex');
 if(expected&&expected!==h)throw Error('source-hash-mismatch:'+p);
 files[path.basename(p)]=h;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 if(doc.startingBase)base=doc.startingBase;
 if(doc.startingTime)date=doc.startingTime;
 for(const [key,target] of Object.entries({facilities,items,research,terrains,mapScripts,alienDeployments,missionScripts,startingConditions,crafts,events,eventScripts,regions}))for(const row of doc[key]||[]){
  if(row.delete){delete target[row.delete];continue;}
  const id=row.type||row.name;if(id)target[id]={...target[id],...row};
 }
}
for(const name of ['vars','startingBase','facilities','items','research'])load(path.join(game,'standard/xcom1',name+'.rul'));
for(const e of [...d.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,'en')))load(path.join(rules,e.file),e.sha256);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};
 if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
// Only the specific verified fixed block is supported. No random block/item
// recovery, inferred encounter, or arbitrary loot quantity enters the model.
const missionLoot={};
const deployment=alienDeployments.STR_LOC_COMMS_DISRUPTION,terrain=terrains.ORBIT_COMMS_DISRUPTION;
const block=terrain?.mapBlocks?.find(b=>b.name==='STATION_06');
const script=missionScripts.technocracySat, map=mapScripts[terrain?.script];
const craft=crafts.STR_CHARIOT,cond=startingConditions[deployment?.startingCondition];
const source=d.missionResearchSources?.STR_TEC_040?.find(r=>r.deployment===deployment?.type&&r.reward==='mission-success');
const indexed=source?.scripts?.find(s=>s.script===script?.type);
if(deployment?.unlockedResearch==='STR_TEC_040'&&deployment.terrains?.length===1&&deployment.terrains[0]===terrain?.name&&
 terrain?.mapBlocks?.filter(b=>b.groups?.includes(9)).length===1&&block?.groups?.includes(9)&&
 map?.commands?.some(c=>c.type==='addBlock'&&c.groups===9&&c.executions===1&&c.size===2)&&
 block?.items?.STR_TEC_001?.length===1&&
 script?.missionWeights?.[0]?.STR_LOC_COMMS_DISRUPTION===100&&script?.regionWeights?.[0]?.REGION_ORBITAL_1===100&&
 indexed?.executionOdds===script.executionOdds&&
 JSON.stringify([...indexed.researchPositive].sort())===JSON.stringify(Object.keys(script.researchTriggers).filter(k=>script.researchTriggers[k]).sort())&&
 JSON.stringify([...indexed.researchNegative].sort())===JSON.stringify(Object.keys(script.researchTriggers).filter(k=>!script.researchTriggers[k]).sort())&&
 cond?.allowedCraft?.includes(craft?.type)&&craft?.costBuy>0&&craft?.soldiers>0&&craft?.requires?.length){
 missionLoot.STR_TEC_001=[{deployment:deployment.type,research:deployment.unlockedResearch,script:indexed,
  terrain:terrain.name,block:block.name,count:block.items.STR_TEC_001.length,
  craft:craft.type,craftResearch:craft.requires,startingCondition:deployment.startingCondition,
  sourceFiles:Object.fromEntries(['Piratez_Factions.rul','Piratez_Planet.rul','Piratez_Mapscripts.rul','Piratez_Globals.rul','Piratez.rul'].map(k=>[k,files[k]]))}];
}
if(!missionLoot.STR_TEC_001)throw Error('comms-disruption-map-loot-source-mismatch');
// Fixed item-only event: refuse additional unsupported rewards/conditions.
// Retain the original month limits, region and negative inventory/research gates.
const fixedItemEvents={};
const event=events.STR_SIBERIA_DAMSEL_EVENT;
const allowedEventKeys=new Set(['name','type','description','background','music','everyItemList','timer','timerRandom']);
const allowedScriptKeys=new Set(['type','eventWeights','firstMonth','lastMonth','xcomBaseInRegionTriggers','researchTriggers','itemTriggers','executionOdds']);
if(event&&Object.keys(event).every(k=>allowedEventKeys.has(k))&&JSON.stringify(event.everyItemList)===JSON.stringify(['STR_SPY_DAMSEL'])){
 for(const id of ['STR_SIBERIA_DAMSEL_EVENT1','STR_SIBERIA_DAMSEL_EVENT2']){
  const s=eventScripts[id];
  if(!s||Object.keys(s).some(k=>!allowedScriptKeys.has(k))||s.eventWeights?.[0]?.[event.name]!==100||Object.keys(s.eventWeights).length!==1||Object.keys(s.eventWeights[0]).length!==1)continue;
  const triggers=(x,v)=>Object.keys(x||{}).filter(k=>x[k]===v);
  fixedItemEvents.STR_SPY_DAMSEL??=[];
  fixedItemEvents.STR_SPY_DAMSEL.push({event:event.name,items:{STR_SPY_DAMSEL:1},script:{
   script:id,mode:'weighted',monthWeights:[{month:0,weight:100,totalWeight:100}],firstMonth:s.firstMonth??0,lastMonth:s.lastMonth??null,
   executionOdds:s.executionOdds,researchPositive:triggers(s.researchTriggers,true),researchNegative:triggers(s.researchTriggers,false),
   itemPositive:triggers(s.itemTriggers,true),itemNegative:triggers(s.itemTriggers,false),
   regionPositive:triggers(s.xcomBaseInRegionTriggers,true),regionNegative:triggers(s.xcomBaseInRegionTriggers,false)},sourceSha256:files['Piratez_Events.rul']});
 }
}
if(fixedItemEvents.STR_SPY_DAMSEL?.length!==2)throw Error('siberia-fixed-item-event-source-mismatch');
const scenarioRegion=args.region||null;
if(scenarioRegion&&(scenarioRegion!=='STR_SIBERIA'||!regions[scenarioRegion]?.areas?.length||base.lon!=null||base.lat!=null))throw Error('unsupported-start-region-scenario');
d.campaignAssets={sourceFingerprint:d.meta.source.metadataSha256,facilities,items,researchGrants,missionLoot,fixedItemEvents};
const layout=base.facilities.map(f=>({id:f.type,x:f.x,y:f.y,complete:!(f.buildTime>0),readyDay:f.buildTime||0}));
const complete=layout.filter(f=>f.complete),functions=[...new Set(complete.flatMap(f=>facilities[f.id]?.provideBaseFunc||[]))].sort();
const snapshot={sourceFingerprint:d.meta.source.metadataSha256,items:base.items,facilities:complete.map(f=>f.id),functions,baseLayout:layout,
 funds:0,difficulty:Number(args.difficulty??1),researched:[],disabled:[],soldiers:[],startDate:date,
 ...(scenarioRegion?{regions:[scenarioRegion]}:{}),
 otherItems:Object.fromEntries(Object.entries((base.crafts||[]).reduce((a,c)=>{for(const [k,n] of Object.entries(c.items||{}))a[k]=(a[k]||0)+n;return a;},{})))};

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const meta=d.meta.source.metadataSha256;
if(prefix.sourceMetadataSha256!==meta||worklist.sourceMetadataSha256!==meta)throw Error('queue/source mismatch');
const report=decodeOriginReport(bytes('public/data/soldier-origin-candidates.json'));
if(report.sourceVersion!=='v.o2'||d.meta.source.rules.some(r=>!report.sourceHashes?.some(s=>s.file===r.file&&s.sha256===r.sha256)))throw Error('birth/source mismatch');
d.originRows=report.records.map(r=>r.sourceProof).filter(Boolean);
const profiles=new Map(d.profiles.map(p=>[p.id,p])),transforms=new Map(d.transformations.map(t=>[t.id,t]));
const specs=[['missingbirth','soldier-population-missing-origin-career','soldier-population-missing-origin-career-index'],['alternating','soldier-final-career-alternating-candidates','soldier-final-career-alternating-candidate-index'],['frontier','soldier-population-frontier-chronology'],['newpair','soldier-population-new-pair-career'],['research','soldier-population-research-career'],['chronological','soldier-population-chronological-career'],['growth','soldier-population-growth-replay']];
function unpack(idx,id,r){
 const w=idx.routes[id];if(!w||w.fullActionHash!==r.fullActionHash)throw Error('witness mismatch');
 const a=[],seen=new Set();let p=w.fullPrefix;
 while(p!==null){if(!Number.isInteger(p)||seen.has(p)||!idx.actionNodes[p])throw Error('invalid prefix');seen.add(p);const n=idx.actionNodes[p];if(n.action)a.push(n.action);p=n.parent;}
 if(a.length!==w.actionCount)throw Error('action count mismatch');return a.reverse();
}
const ledgers=new Map(),groups=new Map(prefix.receipts.map(r=>[r.id,r])),planners=new Map(),prefixCache=new Map();
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const canon=x=>x instanceof Set?[...x].sort().map(canon):x instanceof Map?Object.fromEntries([...x.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,v])=>[k,canon(v)])):Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
function ledger(source){
 if(!ledgers.has(source)){
  const spec=specs.find(s=>s[0]===source);if(!spec)throw Error('unknown-ledger:'+source);
  const l=gz(spec[1]),idx=spec[2]?gz(spec[2]):null;
  if(l.sourceMetadataSha256!==meta||idx&&idx.sourceMetadataSha256!==meta)throw Error('ledger/source mismatch:'+source);
  ledgers.set(source,{l,idx});
 }
 return ledgers.get(source);
}
function actionsFor(q){
 const {l,idx}=ledger(q.source),r=l.routes[q.id];
 if(!r||r.fullActionHash!==q.actionHash)throw Error('legacy route mismatch');
 const a=idx?unpack(idx,q.id,r):r.actions;
 if(!Array.isArray(a)||a.length!==q.actionCount)throw Error('legacy action count mismatch');
 return a;
}
function planner(diff){
 if(!planners.has(diff))planners.set(diff,createCampaignStartResearchPlanner(d,{...snapshot,difficulty:diff},{
  maxAttempts:Number(args.attempts||100),maxDepth:40,maxSteps:Number(args.maxSteps||5000),methodLimit:24}));
 return planners.get(diff);
}
function prefixNode(g){
 if(!g||g.status!=='prefix-replayed-conditional')throw Error('unrepaired-prefix');
 if(!prefixCache.has(g.id)){
  if(hash(g.replacement)!==g.replacementHash)throw Error('prefix-action-hash-mismatch');
  const p=planner(g.difficulty),n=p.newNode();
  for(const step of g.replacement)p.append(n,step);
  const w=n.world,actual=hash({researched:[...w.researched].sort(),disabled:[...w.disabled].sort(),items:w.items,functions:[...w.baseFunctions].sort(),month:w.month});
  if(actual!==g.endStateHash)throw Error('prefix-end-state-mismatch');
  prefixCache.set(g.id,n);
 }
 return planner(g.difficulty).clone(prefixCache.get(g.id));
}
function requirements(step,w){
 let r=null,items={},functions=[],research=[];
 if(['research','repeatResearch'].includes(step.type)){
  r=d.researchRules[step.id];if(!r)throw Error('missing-research-rule:'+step.id);
  if(r.needItem)items[r.neededItem||step.id]=1;
  functions=arr(r.requiresBaseFunc);
 }else if(step.type==='recruit'){
  r=profiles.get(step.profile);if(!r)throw Error('missing-recruit-profile:'+step.profile);
  research=arr(r.requires);functions=arr(r.requiresBaseFunc);items={...r.acquisitionRequiredItems};
  if(r.sourceType==='event'){
   const row=d.originRows.find(x=>x.id===r.id&&x.kind==='SOURCE_SPAWN');
   const alt=row?.prerequisites?.event?.alternatives?.find(x=>x.script===step.script);
   if(!alt)throw Error('birth-event-source-missing:'+step.profile);
   const s=originEventScript(alt,r.sourceId);
   research=[...research,...arr(s.researchPositive)];
   for(const k of arr(s.itemPositive))items[k]=Math.max(items[k]||0,1);
  }
 }else if(step.type==='transform'){
  r=transforms.get(step.transform);if(!r)throw Error('missing-transform:'+step.transform);
  research=arr(r.requires);functions=arr(r.requiresBaseFunc);items={...r.requiredItems};
 }else if(step.type==='manufacture'){
  const supply=d.itemSupply?.[step.item];
  r=[...arr(supply?.manufacture),...arr(supply?.randomManufacture)].find(x=>x.id===step.recipe);
  if(!r)throw Error('missing-recipe:'+step.recipe);
  const count=step.count??1;if(!Number.isSafeInteger(count)||count<1)throw Error('invalid-manufacture-count');
  research=arr(r.requires);functions=arr(r.requiresBaseFunc);
  items=Object.fromEntries(Object.entries(r.requiredItems||{}).map(([k,v])=>[k,v*count]));
 }else if(step.type==='equip'){
  r=d.armorCatalog?.find(x=>x.id===step.armor);
  if(!r)throw Error('missing-armor:'+step.armor);
  if(r.storeItem&&r.storeItem!=='STR_NONE'&&w.soldiers.find(x=>x.id===step.soldier)?.state.armorId!==step.armor)items[r.storeItem]=1;
 }else if(step.type==='eventResearch'){
  const s=arr(d.eventResearchSources?.[step.research]).filter(x=>x.event===step.event).flatMap(x=>arr(x.scripts)).find(x=>x.script===step.script);
  if(s){research=arr(s.researchPositive);for(const k of arr(s.itemPositive))items[k]=1;}
 }else if(step.type==='missionResearch'){
  const s=arr(d.missionResearchSources?.[step.research]).filter(x=>x.deployment===step.deployment).flatMap(x=>arr(x.scripts)).find(x=>x.script===step.script);
  if(s){research=arr(s.researchPositive);for(const k of arr(s.itemPositive))items[k]=1;}
 }
 return {research:[...new Set(research)],items,functions};
}
function protectedInsertion(before,after,future){
 const lost=[...before.researched].filter(k=>active(before,k)&&future.has(k)&&!active(after,k));
 if(lost.length)throw Error('inserted-action-closed-future-research:'+lost.join(','));
}
function ensure(p,n,goals,future){
 const missing=goals.filter(k=>!active(n.world,k));if(!missing.length)return n;
 if(n.world.pendingFree)throw Error('pending-free-before-inserted-research');
 const r=p.ensure(missing,n);if(!r.ok)throw Error('research-unresolved:'+r.unresolved+':'+r.reason);
 protectedInsertion(n.world,r.node.world,future);return r.node;
}
function supplied(p,n,step,future){
 const req=requirements(step,n.world);
 let trial=ensure(p,n,req.research,future);
 const before=trial.world;trial=p.clone(trial);
 p.supply(trial,{items:req.items,functions:req.functions},'suffix '+step.type,null,future);
 protectedInsertion(before,trial.world,future);
 return trial;
}
function resultState(w){
 const m=w.soldiers.find(s=>s.id==='origin');if(!m)throw Error('missing-origin-soldier');
 const s=m.state,raw=Object.fromEntries(STAT_KEYS.map(k=>[k,s.currentStats[k]]));
 if(STAT_KEYS.some(k=>!Number.isFinite(raw[k])))throw Error('unresolved-stat-vector');
 const bonus=bonusStats(s,d,{commendations:m.commendations});
 const stats=Object.fromEntries(STAT_KEYS.map(k=>[k,Math.max(k==='health'?1:0,raw[k]+(bonus[k]||0))]));
 const body=d.soldiers.find(x=>x.id===s.soldierType);
 return {originProfile:s.sourceId,body:s.soldierType,retired:s.retired,rank:s.rank,exactStats:s.exactStats===true,
  raw,bonus,stats,total:WITNESS_STATS.reduce((n,k)=>n+stats[k],0),totalStatKeys:WITNESS_STATS,
  initialStats:s.initialStats,traitCounts:canon(s.bonusCounts),traitIds:canon(s.bonusIds),history:canon(s.history),
  caps:body?Object.fromEntries(Object.entries(body).filter(([k])=>/cap|maxStats/i.test(k))):null,
  researched:canon(w.researched),disabled:canon(w.disabled),items:canon(w.items),functions:canon(w.baseFunctions),month:w.month};
}
function produce(q){
 const rec={legacyId:q.id,source:q.source,legacyActionHash:q.actionHash,legacyPairId:q.pairId,legacyPathId:q.pathId,legacyTraitId:q.traitId,
  legacyBody:q.body,legacyBranch:q.branch,priority:q.priority,prefixGroup:q.prefixGroup,gameCertified:false,terminalCertified:false,status:'suffix-repair-pending',skipped:[]};
 let n,a,index=q.suffixAt;
 try{
  a=actionsFor(q);const g=groups.get(q.prefixGroup);
  if(!g||hash({difficulty:g.difficulty,old:a.slice(0,index)})!==g.id)throw Error('legacy-prefix-group-mismatch');
  const p=planner(g.difficulty);n=prefixNode(g);rec.difficulty=g.difficulty;rec.startRegion=scenarioRegion;
  const future=new Set(a.slice(index).flatMap(s=>[s.type==='research'||s.type==='repeatResearch'?s.id:null,s.type==='freeResearch'?s.research:null,...requirementsSafe(s)]).filter(Boolean));
  for(;index<a.length;index++){
   const s=a[index],before=n.world;
   if(s.type==='externalInputs'){
    // Legacy amounts are grants, not target holdings. Never turn them into
    // target quantities. Each actual downstream action supplies its own full
    // requirement; unspent/unneeded old grants are simply not obtained.
    if(before.pendingFree)throw Error('legacy-external-input-before-free-award');
    rec.skipped.push({index,type:s.type,items:s.items||{},functions:s.functions||[],funds:s.funds||0,reason:'deferred-to-actual-action-requirements'});continue;
   }
   if(s.type==='campaignContext'){
    if(s.difficulty!==g.difficulty)throw Error('difficulty-mismatch');
    rec.skipped.push({index,type:s.type,reason:'already-fixed'});continue;
   }
   if(s.type==='freeResearch'){
    if(!before.pendingFree){
     if(active(before,s.research)&&n.steps.some(x=>x.type==='freeResearch'&&x.source===s.source&&x.research===s.research)){
      rec.skipped.push({index,type:s.type,reason:'identical-prior-award'});continue;
     }
     throw Error('legacy-free-award-not-reproduced:'+s.source+'->'+s.research);
    }
    const trial=p.clone(n);p.append(trial,s);n=trial;continue;
   }
   if(before.pendingFree)throw Error('unhandled-free-award:'+before.pendingFree.source);
   if(s.type==='research'&&active(before,s.id)){
    rec.skipped.push({index,type:s.type,id:s.id,reason:'already-active'});continue;
   }
   if(s.type==='advanceMonth'&&s.month<=before.month){
    rec.skipped.push({index,type:s.type,reason:'already-at-or-after-month'});continue;
   }
   let trial=supplied(p,n,s,future);
   if(s.type==='research'&&active(trial.world,s.id)){
    rec.skipped.push({index,type:s.type,id:s.id,reason:'supplied-via-real-research'});n=trial;continue;
   }
   if(s.type==='research'&&!labVerdict(trial.world,s.id,d).ok){
    trial=ensure(p,trial,[s.id],future);
   }else{
    p.append(trial,s);
   }
   n=trial;
  }
  if(n.world.pendingFree)throw Error('pending-free-at-end');
  const ctx=auditOriginCampaignContext(n.steps,d);
  if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(rec.difficulty))throw Error('final-campaign-context-unresolved');
  rec.state=resultState(n.world);
  rec.stateHash=hash(canon(n.world));rec.traitId=hash(rec.state.traitCounts);
  rec.researchPathId=hash({startRegion:scenarioRegion,actions:n.steps.filter(s=>['research','repeatResearch','freeResearch','eventResearch','missionResearch','acquireEventItems'].includes(s.type))});
  rec.pairId=hash([rec.researchPathId,rec.traitId]);
  rec.routeId='CAMPAIGN-V15:'+hash({difficulty:rec.difficulty,actions:n.steps,stateHash:rec.stateHash});
  rec.status='conditional-career-replayed';
 }catch(e){rec.failedAt=index;rec.reason=e.message;rec.remainingActions=a?.slice(index)||null;}
 rec.producedActions=n?.steps||[];rec.producedActionHash=hash(rec.producedActions);
 return rec;
}
function requirementsSafe(s){
 if(s.type==='transform')return arr(transforms.get(s.transform)?.requires);
 if(s.type==='recruit')return arr(profiles.get(s.profile)?.requires);
 return [];
}
const limit=Number(args.limit||8),offset=Number(args.offset||0);
if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(offset)||offset<0)throw Error('invalid-batch');
const eligible=worklist.queue.filter(q=>q.status==='suffix-repair-pending'&&(args.priority==null||q.priority===Number(args.priority))&&(!args.source||q.source===args.source));
eligible.sort((a,b)=>a.priority-b.priority||a.actionCount-b.actionCount||a.id.localeCompare(b.id));
const selected=eligible.slice(offset,offset+limit),records=[];
const output=args.out||'campaign-suffix-repair-v1.json';
const head={schema:'ATLAS_CAMPAIGN_SUFFIX_REPAIR_V1',sourceCommit:ref,sourceMetadataSha256:meta,sourceFiles:files,
 prefixInputHash:hash(prefix),queueInputHash:hash(worklist),scope:'CONDITIONAL_FULL_CAREER_REPLAY_ONLY; NO_TERMINAL_OR_NATIVE_CERTIFICATION',
 selection:{offset,limit,priority:args.priority??null,source:args.source??null,eligible:eligible.length},originRows:d.originRows.length,startRegion:scenarioRegion,regionAssumption:scenarioRegion?'conditional start base placement; country and native land placement not certified':null};
function save(){
 const summary={selected:selected.length,processed:records.length,completed:records.filter(r=>r.status==='conditional-career-replayed').length,
 failed:records.filter(r=>r.status!=='conditional-career-replayed').length,normalizedTerminal:0,gameCertified:0};
 const content=JSON.stringify({...head,summary,records});
 fs.writeFileSync(output+'.tmp',content);fs.renameSync(output+'.tmp',output);
}
for(const q of selected){
 const r=produce(q);records.push(r);save();
 console.log(JSON.stringify({id:q.id,priority:q.priority,status:r.status,failedAt:r.failedAt,reason:r.reason,produced:r.producedActions.length,body:r.state?.body}));
}
save();
