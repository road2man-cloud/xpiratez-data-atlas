// Consume the existing prefix receipts, not a new prefix search. Never promote
// a failed suffix, an external grant, or a prefix-only receipt to a final career.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {campaignStartWorld,labVerdict,START_RESEARCH} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {createCampaignStartResearchPlanner} from '../public/soldiers/modern/campaign-start-research-planner-v1.js';
import {careerStatVectors} from '../public/soldiers/modern/campaign-start-career-actions-v1.js';
import {WITNESS_STATS,originEventScript} from '../public/soldiers/modern/origin-witness.js';
import {decodeOriginReport} from './origin-report-codec.mjs';
const args=Object.fromEntries(process.argv.slice(2).filter(s=>s.includes('=')).map(s=>s.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const repo=args.repo||process.cwd(),game=args.game||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez';
const require=createRequire(path.join(repo,'package.json')),yaml=require('js-yaml');
const forwardMode=Boolean(args.forwardOut);
if(forwardMode&&!args.ref)throw Error('forward-mode-requires-explicit-source-ref');
const prefix=forwardMode?null:JSON.parse(fs.readFileSync(args.prefix||'public/data/campaign-start-prefix-repair-v2.json'));
const worklist=forwardMode?null:JSON.parse(gunzipSync(fs.readFileSync(args.queue||'public/data/campaign-start-repair-worklist-v2.json.gz')));
const ref=execFileSync('git',['-C',repo,'rev-parse',args.ref||worklist.sourceCommit],{encoding:'utf8'}).trim();
if(!forwardMode&&(ref!==worklist.sourceCommit||ref!==prefix.sourceCommit))throw Error('pinned-ledger-commit-mismatch');
const bytes=p=>execFileSync('git',['-C',repo,'show',ref+':'+p],{maxBuffer:256*1024*1024});
const read=p=>JSON.parse(bytes(p));const gz=f=>JSON.parse(gunzipSync(bytes('public/data/'+f+'.json.gz')));
const d=read('public/data/soldiers-modern-index.json'),catalog=read('public/data/soldier-source-catalog.json');
if(d.meta.mod.version!=='v.o2')throw Error('wrong-game-version');
d.sourceItemIds=new Set(catalog.itemIds);
const rules=path.join(game,'user/mods/Piratez/Ruleset'),files={},facilities={},items={},research={},terrains={},mapScripts={},alienDeployments={},missionScripts={},startingConditions={},crafts={},events={},eventScripts={},regions={},countries={},manufacture={};
let base,date,initialFundingRule=null;
function load(p,expected){
 const bytes=fs.readFileSync(p),h=createHash('sha256').update(bytes).digest('hex');
 if(expected&&expected!==h)throw Error('source-hash-mismatch:'+p);
 files[path.basename(p)]=h;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 if(doc.startingBase)base=doc.startingBase;
 if(doc.startingTime)date=doc.startingTime;
 if(doc.initialFunding!==undefined)initialFundingRule=doc.initialFunding;
 for(const [key,target] of Object.entries({facilities,items,research,terrains,mapScripts,alienDeployments,missionScripts,startingConditions,crafts,events,eventScripts,regions,countries,manufacture}))for(const row of doc[key]||[]){
  if(row.delete){delete target[row.delete];continue;}
  const id=row.type||row.name;if(id)target[id]={...target[id],...row};
 }
}
for(const name of ['vars','startingBase','facilities','items','research'])load(path.join(game,'standard/xcom1',name+'.rul'));
if(args.forwardManufacture==='1')load(path.join(game,'standard/xcom1/manufacture.rul'));
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
// Fixed event bundles, derived from hashed v.o2 rules. A selected event pays
// its whole bundle exactly once; a requested item is not an isolated grant.
// Unsupported reward or trigger fields cause a route to be excluded.
const fixedItemEvents={};
const selectedEvents={
 STR_SIBERIA_DAMSEL_EVENT:['STR_SIBERIA_DAMSEL_EVENT1','STR_SIBERIA_DAMSEL_EVENT2'],
 STR_SLAVE_CAUGHT_EVENT:['STR_SLAVE_CAUGHT_EVENT'],
 STR_KNOCK_KNOCK_CASTAWAYS:['STR_KNOCK_KNOCK_0','STR_KNOCK_KNOCK_1','STR_KNOCK_KNOCK_2','STR_KNOCK_KNOCK_GOLD'],
 STR_POLYMAKH_SHAPKA_EVENT_RECRUIT:['STR_POLYMAKH_SHAPKA_EVENT'],
 STR_HYBRID_OF_TWILIGHT_EVENT:['STR_HYBRID_OF_TWILIGHT_EVENT','STR_CAPTAIN_JACKDUMB_EVENTS_1','STR_CAPTAIN_JACKSORE_EVENTS_PUSSY','STR_CAPTAIN_GOLD_EVENTS_1','STR_CAPTAIN_RED_EVENTS_1'],
 STR_KNOCK_KNOCK_HYBRID_OF_TWILIGHT:['STR_KNOCK_KNOCK_0','STR_KNOCK_KNOCK_GOLD'],
 STR_KNOCK_KNOCK_WILLING_SLAVE:['STR_KNOCK_KNOCK_0','STR_KNOCK_KNOCK_GOLD','STR_KNOCK_KNOCK_DUMBLAZY_1','STR_CBT_CHAMP_CHAMP']
};
const allowedEventKeys=new Set(['name','type','description','background','music','everyItemList','timer','timerRandom','points','funds']);
const allowedScriptKeys=new Set(['type','eventWeights','firstMonth','lastMonth','xcomBaseInRegionTriggers','researchTriggers','itemTriggers','executionOdds']);
const triggers=(x,v)=>Object.keys(x||{}).filter(k=>x[k]===v);
for(const [eventId,scriptIds] of Object.entries(selectedEvents)){
 const e=events[eventId];
 if(!e||Object.keys(e).some(k=>!allowedEventKeys.has(k))||!Array.isArray(e.everyItemList)||!e.everyItemList.length)throw Error('fixed-event-source-mismatch:'+eventId);
 const grants={};
 for(const id of e.everyItemList){
  if(!items[id])throw Error('fixed-event-item-unindexed:'+id);
  grants[id]=(grants[id]||0)+1;
 }
 const funds=e.funds??0,points=e.points??0;
 if(!Number.isSafeInteger(funds)||!Number.isSafeInteger(points))throw Error('fixed-event-economic-rule-invalid:'+eventId);
 for(const id of scriptIds){
  const s=eventScripts[id];
  if(!s||Object.keys(s).some(k=>!allowedScriptKeys.has(k))||!s.eventWeights)throw Error('fixed-event-script-unsupported:'+id);
  for(const k of ['researchTriggers','itemTriggers','xcomBaseInRegionTriggers'])
   if(Object.values(s[k]||{}).some(v=>typeof v!=='boolean'))throw Error('fixed-event-trigger-invalid:'+id);
  const monthWeights=Object.entries(s.eventWeights).map(([month,weights])=>{
   const ns=Object.values(weights);
   if(!Number.isSafeInteger(Number(month))||Number(month)<0||ns.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('event-weight-invalid:'+id);
   return {month:Number(month),weight:weights[eventId]??0,totalWeight:ns.reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>a.month-b.month);
  if(!monthWeights.some(x=>x.weight>0)||!Number.isFinite(s.executionOdds)||s.executionOdds<=0||s.executionOdds>100)throw Error('fixed-event-no-positive-route:'+id);
  const route={event:eventId,items:grants,funds,points,script:{
   script:id,mode:'weighted',monthWeights,firstMonth:s.firstMonth??0,lastMonth:s.lastMonth??null,
   executionOdds:s.executionOdds,researchPositive:triggers(s.researchTriggers,true),researchNegative:triggers(s.researchTriggers,false),
   itemPositive:triggers(s.itemTriggers,true),itemNegative:triggers(s.itemTriggers,false),
   regionPositive:triggers(s.xcomBaseInRegionTriggers,true),regionNegative:triggers(s.xcomBaseInRegionTriggers,false)},sourceSha256:files['Piratez_Events.rul']};
  for(const item of Object.keys(grants))(fixedItemEvents[item]??=[]).push(route);
 }
}
const scenarioRegion=args.region||null,scenarioCountry=args.country||null;
// Country-only and region-only are disjoint scenarios until an actual
// geographically consistent base placement is modeled. Never combine rewards.
if(scenarioRegion&&scenarioCountry)throw Error('mixed-start-geography-not-modeled');
if(scenarioRegion&&(scenarioRegion!=='STR_SIBERIA'||!regions[scenarioRegion]?.areas?.length||base.lon!=null||base.lat!=null))throw Error('unsupported-start-region-scenario');
if(scenarioCountry&&(!['STR_EGYPT','STR_JAPAN'].includes(scenarioCountry)||!countries[scenarioCountry]?.areas?.length||base.lon!=null||base.lat!=null))throw Error('unsupported-start-country-scenario');
if(scenarioCountry){
 const eventId='STR_START_COUNTRY_'+scenarioCountry.slice(4)+'_EVENT',e=events[eventId],s=eventScripts[eventId];
 const expected=scenarioCountry==='STR_EGYPT'?{STR_THEBAN_ASSAULT_CLONE_LICENSE:12}:{STR_KATANA:3,STR_WAKIZASHI:3,STR_FAN:6,STR_FUSO_KNIVES:30,STR_BUSHIDO_HANDBOOK:1,STR_GLAMOUR:20};
 const equal=(a,b)=>JSON.stringify(Object.entries(a||{}).sort())===JSON.stringify(Object.entries(b||{}).sort());
 const eventKeys=new Set(['name','type','description','background','music','points','funds','everyMultiItemList','researchList','timer','timerRandom']);
 const scriptKeys=new Set(['type','eventWeights','firstMonth','lastMonth','xcomBaseInCountryTriggers','executionOdds']);
 if(!e||!s||Object.keys(e).some(k=>!eventKeys.has(k))||Object.keys(s).some(k=>!scriptKeys.has(k))||
 !equal(e.everyMultiItemList,expected)||JSON.stringify(e.researchList)!==JSON.stringify([scenarioCountry])||
 (e.points??0)!==(scenarioCountry==='STR_EGYPT'?-600:150)||(e.funds??0)!==0||e.timer!==3200||e.timerRandom!==1200||
 s.firstMonth!==0||s.lastMonth!==0||s.executionOdds!==100||!equal(s.xcomBaseInCountryTriggers,{[scenarioCountry]:true})||
 Object.keys(s.eventWeights||{}).length!==1||!equal(s.eventWeights[0],{[eventId]:100}))throw Error('start-country-reward-source-mismatch:'+scenarioCountry);
}
const deterministicManufacture={};
const recruitmentManufactureIds=new Set(['STR_SPY_DAMSEL_RECRUITMENT','STR_HYBRID_OF_TWILIGHT_RECRUITMENT']);
if(args.forwardManufacture==='1'){
 const allowed=new Set(['name','type','category','requires','requiresBaseFunc','space','time','cost','requiredItems','producedItems','listOrder']);
 for(const [id,r] of Object.entries(manufacture)){
  const isRecruitment=args.forwardRecruitment==='1'&&recruitmentManufactureIds.has(id);
  const recruitKeys=new Set(['spawnedPersonType','spawnedSoldier','refund']);
  if(Object.keys(r).some(k=>!allowed.has(k)&&!(isRecruitment&&recruitKeys.has(k))))continue;
  if(isRecruitment&&(!r.spawnedPersonType||!r.spawnedSoldier||r.refund!==true))throw Error('recruitment-manufacture-source-mismatch:'+id);
  const outputs=r.producedItems??{[id]:1},materials=r.requiredItems??{};
  const cost=r.cost??0,time=r.time??0,space=r.space??0;
  if(![cost,time,space].every(v=>Number.isSafeInteger(v)&&v>=0)||!Object.keys(outputs).length)continue;
  if(![...Object.entries(outputs),...Object.entries(materials)].every(([k,v])=>items[k]&&Number.isSafeInteger(v)&&v>0))continue;
  const requires=r.requires??[],functions=r.requiresBaseFunc??[];
  if(!Array.isArray(requires)||!Array.isArray(functions)||requires.some(k=>!d.researchRules[k]))continue;
  let recruitment=null;
  if(isRecruitment){
   const profile=d.profiles.find(p=>p.sourceType==='manufacture'&&p.sourceId===id&&p.soldierType===r.spawnedPersonType);
   const ordered=o=>JSON.stringify(Object.entries(o||{}).sort(([a],[b])=>a.localeCompare(b)));
   if(!profile||ordered(profile.acquisitionRequiredItems)!==ordered(materials)||Number(profile.cost||0)!==cost||
      JSON.stringify([...(profile.requires||[])].sort())!==JSON.stringify([...requires].sort()))throw Error('recruitment-manufacture-profile-mismatch:'+id);
   recruitment={profile:profile.id,soldierType:r.spawnedPersonType,refundOnCancellation:r.refund};
  }
  deterministicManufacture[id]={requires,functions,cost,time,space,materials,outputs,...(recruitment?{recruitment}:{})};
 }
}
d.campaignAssets={sourceFingerprint:d.meta.source.metadataSha256,facilities,items,researchGrants,missionLoot,fixedItemEvents,deterministicManufacture};
const layout=base.facilities.map(f=>({id:f.type,x:f.x,y:f.y,complete:!(f.buildTime>0),readyDay:f.buildTime||0}));
const complete=layout.filter(f=>f.complete),functions=[...new Set(complete.flatMap(f=>facilities[f.id]?.provideBaseFunc||[]))].sort();
if(args.forwardRecruitment==='1'){
 const personnel=[base.randomSoldiers,base.scientists,base.engineers];
 if(!personnel.every(n=>Number.isSafeInteger(n)&&n>=0)||base.soldiers?.length||base.transfers?.length)throw Error('recruitment-opening-personnel-unmodeled');
 const capacities=complete.map(f=>facilities[f.id]?.personnel??0);
 if(!capacities.every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('recruitment-quarters-invalid');
 d.campaignAssets.forwardRecruitmentLimit={initialPersonnel:personnel.reduce((a,b)=>a+b,0),initialCapacity:capacities.reduce((a,b)=>a+b,0)};
}
const snapshot={sourceFingerprint:d.meta.source.metadataSha256,items:base.items,facilities:complete.map(f=>f.id),functions,baseLayout:layout,
 funds:0,difficulty:Number(args.difficulty??1),researched:[],disabled:[],soldiers:[],startDate:date,
 ...(scenarioRegion?{regions:[scenarioRegion]}:{}),...(scenarioCountry?{countries:[scenarioCountry]}:{}),
 otherItems:Object.fromEntries(Object.entries((base.crafts||[]).reduce((a,c)=>{for(const [k,n] of Object.entries(c.items||{}))a[k]=(a[k]||0)+n;return a;},{})))};

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const meta=d.meta.source.metadataSha256;
if(!forwardMode&&(prefix.sourceMetadataSha256!==meta||worklist.sourceMetadataSha256!==meta))throw Error('queue/source mismatch');
// Shared source bootstrap only: no legacy action is read in forward mode.
if(args.forwardOut){
 const {buildCampaignForwardTree}=await import('./build-atlas-campaign-forward-tree-v1.mjs');
 const resume=args.forwardResume?JSON.parse(fs.readFileSync(args.forwardResume)):null;
 if(resume&&(resume.sourceCommit!==ref||JSON.stringify(resume.sourceFiles)!==JSON.stringify(files)))throw Error('forward-resume-source-file-mismatch');
 const eventRoutes=[];
 if(args.forwardEvents==='1'){
  const chosen=[['STR_CAPTAIN_PERSONALITY_TEST2','STR_CAPTAIN_PUSSY_UP'],['STR_CAPTAIN_PERSONALITY_TEST3','STR_CAPTAIN_UNCLASSED'],['STR_CAPTAIN_PERSONALITY_TEST4','STR_CAPTAIN_PURE']];
  if(scenarioCountry)chosen.push(['STR_START_COUNTRY_'+scenarioCountry.slice(4)+'_EVENT',scenarioCountry]);
  for(const [event,id] of chosen){
   const e=events[event],s=eventScripts[event];
   const entry=d.eventResearchSources?.[id]?.find(x=>x.event===event&&x.choiceCount===1);
   const indexed=entry?.scripts?.find(x=>x.script===event);
   if(!e||!s||!indexed||JSON.stringify(e.researchList)!==JSON.stringify([id]))throw Error('forward-event-source-mismatch:'+event);
   const isCountry=event.startsWith('STR_START_COUNTRY_');
   const keys=new Set(['type','firstMonth','lastMonth','executionOdds','researchTriggers',isCountry?'eventWeights':'oneTimeRandomEvents',...(isCountry?['xcomBaseInCountryTriggers']:[])]);
   if(Object.keys(s).some(k=>!keys.has(k))||
    JSON.stringify([...indexed.researchPositive].sort())!==JSON.stringify(triggers(s.researchTriggers,true).sort())||
    JSON.stringify([...indexed.researchNegative].sort())!==JSON.stringify(triggers(s.researchTriggers,false).sort())||
    (s.firstMonth??0)!==indexed.firstMonth||(s.lastMonth??null)!==indexed.lastMonth||(s.executionOdds??100)!==indexed.executionOdds||
    (!isCountry&&(indexed.mode!=='oneTimeRandom'||s.oneTimeRandomEvents?.[event]!==indexed.oneTimeWeight||Object.values(s.oneTimeRandomEvents).reduce((a,b)=>a+b,0)!==indexed.oneTimeTotal)))throw Error('forward-event-trigger-mismatch:'+event);
   if(!isCountry&&Object.keys(e).some(k=>!['name','type','description','background','music','researchList','timer','timerRandom','points'].includes(k)))throw Error('forward-event-rewards-unsupported:'+event);
   eventRoutes.push({event,research:id,script:indexed,sourceSha256:files['Piratez_Events.rul'],timer:e.timer??null,timerRandom:e.timerRandom??null,points:e.points??0});
  }
 }
 const result=buildCampaignForwardTree(d,snapshot,{resume,eventRoutes,samplePurchases:args.forwardPurchases==='1',fixedItems:args.forwardFixedItems==='1',construction:args.forwardConstruction==='1',manufacturing:args.forwardManufacture==='1',missions:args.forwardMissions==='1',manufactureFocus:args.forwardManufactureFocus||'all',fixedEventFilter:args.forwardFixedEventFilter?args.forwardFixedEventFilter.split(','):null,maxDepth:Number(args.forwardDepth??5),maxNodes:Number(args.forwardNodes??600),captainEvent:args.forwardCaptain==='1'?{event:'STR_CAPTAIN_PERSONALITY_TEST',script:'STR_CAPTAIN_PERSONALITY_TEST',research:'STR_CAPTAIN_PERSONALITY_TEST'}:null});
 const content=JSON.stringify({...result,sourceCommit:ref,sourceFiles:files,initialFundingEvidence:{raw:initialFundingRule,modeledOpeningFunds:snapshot.funds,reason:'engine-8.7.1-country-funding-initialization-unconfirmed'}});
 fs.writeFileSync(args.forwardOut+'.tmp',content);fs.renameSync(args.forwardOut+'.tmp',args.forwardOut);
 console.log(JSON.stringify(result.summary));process.exit(0);
}
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
  // The old receipt is evidence, not permission to start with a later
  // captain branch. Move the first actual start-menu research and its
  // immediate free award to the beginning, then replay every action.
  // Reject changes in the full resulting state; never splice state.
  const at=g.replacement.findIndex(s=>s.type==='research'&&Object.hasOwn(START_RESEARCH,s.id));
  if(at<0)throw Error('prefix-no-start-menu-research');
  let end=at+1;
  while(g.replacement[end]?.type==='freeResearch')end++;
  const ordered=[...g.replacement.slice(at,end),...g.replacement.slice(0,at),...g.replacement.slice(end)];
  const normalized=p.newNode();
  for(const step of ordered)p.append(normalized,step);
  if(hash(canon(normalized.world))!==hash(canon(n.world)))throw Error('root-first-prefix-full-state-mismatch');
  prefixCache.set(g.id,normalized);
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
function ensure(p,n,goals,future,preferredAwards={}){
 const missing=goals.filter(k=>!active(n.world,k));if(!missing.length)return n;
 if(n.world.pendingFree)throw Error('pending-free-before-inserted-research');
 const r=p.ensure(missing,n,preferredAwards);if(!r.ok)throw Error('research-unresolved:'+r.unresolved+':'+r.reason);
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
 const s=m.state,{raw,bonus,stats,permanentBonus,permanentStats}=careerStatVectors(m,d);
 const body=d.soldiers.find(x=>x.id===s.soldierType);
 return {originProfile:s.sourceId,body:s.soldierType,retired:s.retired,rank:s.rank,exactStats:s.exactStats===true,
  raw,bonus,stats,permanentBonus,permanentStats,commendations:canon(m.commendations||{}),total:WITNESS_STATS.reduce((n,k)=>n+stats[k],0),totalStatKeys:WITNESS_STATS,
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
  const p=planner(g.difficulty);n=prefixNode(g);rec.difficulty=g.difficulty;rec.startRegion=scenarioRegion;rec.startCountry=scenarioCountry;
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
   // Resolve research through the planner BEFORE requiring a laboratory sample.
   // A legitimate free/event award can complete a topic without its physical
   // sample; forcing supply first creates circular purchase dependencies.
   if(s.type==='research'&&!labVerdict(n.world,s.id,d).ok){
    const next=a[index+1];
    const preferred=next?.type==='freeResearch'&&next.source===s.id?{[s.id]:next.research}:{};
    n=ensure(p,n,[s.id],future,preferred);
    continue;
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
  rec.researchPathId=hash({startRegion:scenarioRegion,...(scenarioCountry?{startCountry:scenarioCountry}:{}),actions:n.steps.filter(s=>['research','repeatResearch','freeResearch','eventResearch','missionResearch','acquireEventItems'].includes(s.type))});
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
// Produce root-first witnesses for all previously repaired prefix groups.
// Retain the pinned old receipt identity so suffix worklists remain usable.
if(args.rootPrefixOut){
 const receipts=[];
 for(const g of prefix.receipts){
  if(g.status!=='prefix-replayed-conditional')continue;
  try{
   const n=prefixNode(g);
   receipts.push({id:g.id,difficulty:g.difficulty,status:'root-first-prefix-replayed-conditional',originalReplacementHash:g.replacementHash,replacement:n.steps,replacementHash:hash(n.steps),fullStateHash:hash(canon(n.world)),firstResearch:n.steps[0].id,gameCertified:false});
  }catch(e){receipts.push({id:g.id,difficulty:g.difficulty,status:'root-first-prefix-pending',reason:e.message,gameCertified:false});}
 }
 const summary={groups:receipts.length,completed:receipts.filter(x=>x.status==='root-first-prefix-replayed-conditional').length,gameCertified:0};
 const content=JSON.stringify({schema:'ATLAS_CAMPAIGN_ROOT_FIRST_PREFIX_V1',sourceCommit:ref,sourceMetadataSha256:meta,prefixInputHash:hash(prefix),queueInputHash:hash(worklist),startRegion:scenarioRegion,startCountry:scenarioCountry,summary,receipts});
 fs.writeFileSync(args.rootPrefixOut+'.tmp',content);fs.renameSync(args.rootPrefixOut+'.tmp',args.rootPrefixOut);
 console.log(JSON.stringify(summary));
 if(args.prefixOnly==='1')process.exit(0);
}
const limit=Number(args.limit||8),offset=Number(args.offset||0);
if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(offset)||offset<0)throw Error('invalid-batch');
const eligible=worklist.queue.filter(q=>q.status==='suffix-repair-pending'&&(args.priority==null||q.priority===Number(args.priority))&&(!args.source||q.source===args.source));
eligible.sort((a,b)=>a.priority-b.priority||a.actionCount-b.actionCount||a.id.localeCompare(b.id));
// Target the immutable sorted queue by absolute offset or legacy ID.
const offsets=args.offsets==null?null:args.offsets.split(',').map(x=>{
 if(!/^\d+$/.test(x)||!Number.isSafeInteger(Number(x)))throw Error('invalid-target-offset:'+x);
 return Number(x);
});
const ids=args.ids==null?null:new Set(args.ids.split(',').filter(Boolean));
if(offsets&&ids)throw Error('choose-offsets-or-ids');
if(offsets&&(new Set(offsets).size!==offsets.length||offsets.some(i=>i>=eligible.length)))throw Error('duplicate-or-out-of-range-target-offset');
if(ids&&(!ids.size||[...ids].some(id=>!eligible.some(q=>q.id===id))))throw Error('unknown-target-legacy-id');
if((offsets||ids)&&args.offset!=null)throw Error('target-selection-conflicts-with-offset');
const candidates=offsets?offsets.map(i=>eligible[i]):ids?eligible.filter(q=>ids.has(q.id)):eligible.slice(offset,offset+limit);
// Exclude only successful jobs in the same pinned input and geographic scenario.
const prior=args.resumeLedger?JSON.parse(fs.readFileSync(args.resumeLedger)):null;
if(prior&&(prior.schema!=='ATLAS_CAMPAIGN_REPAIR_LEDGER_V1'||prior.sourceCommit!==ref||prior.sourceMetadataSha256!==meta||prior.prefixInputHash!==hash(prefix)||prior.queueInputHash!==hash(worklist)))throw Error('resume-ledger-source-mismatch');
const completed=new Set((prior?.jobs||[]).filter(j=>j.status==='conditional-career-replayed'&&j.routeIds?.length&&j.scenario?.startRegion===scenarioRegion&&j.scenario?.startCountry===scenarioCountry).map(j=>JSON.stringify([j.source,j.legacyId,j.legacyActionHash,j.scenario.difficulty])));
const selected=candidates.filter(q=>!completed.has(JSON.stringify([q.source,q.id,q.actionHash,groups.get(q.prefixGroup)?.difficulty]))),records=[];
const output=args.out||'campaign-suffix-repair-v1.json';
const head={schema:'ATLAS_CAMPAIGN_SUFFIX_REPAIR_V1',sourceCommit:ref,sourceMetadataSha256:meta,sourceFiles:files,
 prefixInputHash:hash(prefix),queueInputHash:hash(worklist),scope:'CONDITIONAL_FULL_CAREER_REPLAY_ONLY; NO_TERMINAL_OR_NATIVE_CERTIFICATION',
 selection:{offset,limit,offsets,ids:ids?[...ids]:null,resumeLedger:args.resumeLedger??null,skippedPreviouslyCompleted:candidates.length-selected.length,priority:args.priority??null,source:args.source??null,eligible:eligible.length},originRows:d.originRows.length,startRegion:scenarioRegion,startCountry:scenarioCountry,regionAssumption:scenarioRegion?'conditional start base placement; country and native land placement not certified':null,countryAssumption:scenarioCountry?'conditional start country; no concurrent region assumption; native base placement not certified':null};
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
