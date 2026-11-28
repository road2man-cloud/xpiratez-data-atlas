// V141: continue independent career branches from V140, preserving the full ledger.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {continueCareers} from './campaign-forward-career-lanes-v141.mjs';
import {produceGraph} from './campaign-forward-graph-core-v132.mjs';
import {createSourceFunctionGate} from './campaign-forward-source-functions-v140.mjs';
import {createBookGate} from './campaign-forward-book-gate-v139.mjs';
import {createOfficerGate} from './campaign-forward-officer-gate-v138.mjs';
import {createDiskGate} from './campaign-forward-disk-gate-v136.mjs';
import {createBountyGate} from './campaign-forward-bounty-gate-v135.mjs';
import {createFoodEventGate} from './campaign-forward-food-events-v134.mjs';
import {createEncounterGate} from './campaign-forward-encounter-gate-v124.mjs';
import {createEventGate} from './campaign-forward-event-gate-v123.mjs';
import {createSupplyActions} from './campaign-forward-supply-v121.mjs';
import {eligibleTransformation} from '../public/soldiers/modern/eligibility.js';
import {convergeResearch} from './campaign-forward-convergence-v131.mjs';
import {createGoalPlanner} from './campaign-forward-goal-planner-v130.mjs';
import {facilityMaterials} from '../public/soldiers/modern/campaign-start-construction-v1.js';
import {purchaseVerdict} from '../public/soldiers/modern/campaign-start-reachability-v1.js';
import {careerStatVectors} from '../public/soldiers/modern/campaign-start-career-actions-v1.js';
import {START_RESEARCH} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const opts=Object.fromEntries(process.argv.slice(2).map(s=>{const m=/^--([a-z-]+)=(.+)$/.exec(s);assert(m,'invalid option '+s);return [m[1],m[2]]}));
const req=k=>{assert(opts[k],'missing --'+k);return opts[k]};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve(opts.root||'.'),game=req('game'),out=path.resolve(req('out'));
const prefix=read(path.join(root,'public/data/campaign-start-gold-v3.json'));
const data=read(path.join(root,'public/data/soldiers-modern-index.json'));
const source=data.meta.source.metadataSha256;
assert.equal(data.meta.mod.version,'v.o2');
assert.equal(prefix.sourceMetadataSha256,source);
assert.equal(prefix.snapshot.sourceFingerprint,source);
assert.deepEqual([...prefix.initialResearch].sort(),Object.keys(START_RESEARCH).sort());
assert(!prefix.snapshot.researched.length&&!prefix.snapshot.disabled.length);
const yaml=createRequire(path.join(root,'package.json'))('js-yaml');
const files={},research={},items={},facilities={},events={},eventScripts={},manufacture={},alienDeployments={},alienMissions={},missionScripts={},ufos={},alienRaces={},regions={},textures={},units={},armors={};
let saleCoefficients=null;
function load(file,expected){
 const bytes=fs.readFileSync(file),name=path.basename(file),digest=sha(bytes);
 assert.equal(digest,expected||prefix.sourceFiles[name],'source hash mismatch '+name);
 files[name]=digest;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 if(doc.sellPriceCoefficient)saleCoefficients=doc.sellPriceCoefficient;
 for(const t of doc.globe?.textures||[])textures[t.id]={...textures[t.id],...t};
 for(const [k,dst] of Object.entries({research,items,facilities,events,eventScripts,manufacture,alienDeployments,alienMissions,missionScripts,ufos,alienRaces,regions,units,armors}))for(const row of doc[k]||[]){
  if(row.delete){delete dst[row.delete];continue;}
  const id=row.type||row.name||row.id;if(id)dst[id]={...dst[id],...row};
 }
}
for(const n of ['vars','startingBase','facilities','items','research'])load(path.join(game,'standard/xcom1',n+'.rul'));
for(const e of [...data.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,'en')))load(path.join(game,'user/mods/Piratez/Ruleset',e.file),e.sha256);
for(const [n,h] of Object.entries(prefix.sourceFiles))assert.equal(files[n],h,'prefix source mismatch '+n);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
data.campaignAssets={sourceFingerprint:source,facilities,items,researchGrants};
data.originRows=read(path.join(root,'public/data/soldier-acquisition-progression-20261102.json')).rows;
data.sourceItemIds=new Set(read(path.join(root,'public/data/soldier-source-catalog.json')).itemIds);
const gate=createEventGate(data,{events,eventScripts,files});
const snapshot=structuredClone(prefix.snapshot);
const encounter=createEncounterGate(data,snapshot,{files,facilities,items,research,events,eventScripts,alienDeployments,alienMissions,missionScripts,ufos,alienRaces,regions,textures,units,armors},gate,root);
const medical=createFoodEventGate(data,snapshot,{files,events,eventScripts,items},encounter,root);
const bounty=createBountyGate(data,snapshot,{files,events,eventScripts,items,manufacture},medical,root);
const disk=createDiskGate(data,snapshot,{files,events,eventScripts,items,facilities,research},bounty,root);
const officer=createOfficerGate(data,snapshot,{files,items,facilities,events,eventScripts,saleCoefficients},disk,root);
const book=createBookGate(data,snapshot,{files,events,eventScripts,items,research},officer,root);
const sourceFunctions=createSourceFunctionGate(data,snapshot,{facilities},book,root,game);
const maxStates=Number(opts.states||250),maxDepth=Number(opts.depth||12);
const seeds=prefix.records.filter(r=>r.status==='conditional-replay'&&Array.isArray(r.actions)).map(r=>({id:'gold-v3:'+r.goal,actions:r.actions}));
const seed114=read(path.join(root,'docs/career-batches/v114-hero-ordered-training-run1.json'));
const seed119=read(path.join(root,'docs/career-batches/v119-hero-bounty-awards-run1.json'));
assert.equal(seed114.sourceMetadataSha256,source);assert.equal(seed119.sourceMetadataSha256,source);
assert.equal(seed114.snapshotHash,sha(JSON.stringify(snapshot)));assert.equal(seed119.snapshotHash,seed114.snapshotHash);
assert.equal(seed119.seedHash,sha(JSON.stringify(seed114)));
const uniqueSeeds=new Map();
function addSeed(id,actions,row,origin){
 const digest=sha(JSON.stringify(actions));assert.equal(digest,row.actionHash);
 const prior=uniqueSeeds.get(digest);
 const meta={origin,stage:row.stage,actionHash:digest,expectedStats:row.stats,expectedCommitments:row.confirmedCommitments||[],expectedResearch:row.activeResearch||[]};
 if(prior){assert.deepEqual(prior.expectedStats,meta.expectedStats);prior.aliases.push(id);return;}
 const seed={id,actions,...meta,aliases:[]};uniqueSeeds.set(digest,seed);
}
for(const row of seed114.routes){
 assert(row.branchCommitmentsComplete&&Array.isArray(row.actions)&&row.stats);
 addSeed('hero-v114:'+row.actionHash,row.actions,row,'v114');
}
const bases=new Map(seed114.routes.map(r=>[r.actionHash,r]));
for(const row of seed119.routes){
 const base=bases.get(row.seedActionHash);assert(base&&row.branchCommitmentsComplete&&row.stats);
 const combined=[...base.actions,...row.suffix];assert.equal(combined.length,row.actionCount);
 addSeed('hero-v119:'+row.actionHash,combined,row,'v119');
}
// Longest routes first to retain the V124 reference witness if budget is tight.
seeds.push(...[...uniqueSeeds.values()].sort((a,b)=>b.actions.length-a.actions.length||a.id.localeCompare(b.id)));
function verifySeed(w,seed){
 if(!seed.expectedStats)return {kind:'research-prefix'};
 const member=w.soldiers.find(s=>s.id==='origin');assert(member,'missing hero');
 const stats=careerStatVectors(member,data);assert.deepEqual(stats,seed.expectedStats);
 for(const id of seed.expectedCommitments)assert(w.researched.has(id)&&!w.disabled.has(id),'commitment missing '+id);
 for(const id of seed.expectedResearch)assert(w.researched.has(id)&&!w.disabled.has(id),'expected active research missing '+id);
 return {origin:seed.origin,stage:seed.stage,actionHash:seed.actionHash,aliases:seed.aliases,stats,rank:member.state.rank??null,history:[...(member.state.history||[])].sort(),activeResearch:[...w.researched].filter(id=>!w.disabled.has(id)).sort(),conditional:true,registered:false};
}
const supply=createSupplyActions(data);
const deferredEvents=[];
const extraActions=w=>supply(w).filter(a=>{
 if(a.type!=='eventResearch')return true;
 try{const v=gate.inspect(w,a);if(v.positive>0)return true;}catch{return false;}
 deferredEvents.push({event:a.event,script:a.script,research:a.research,reason:'no-positive-research-trigger; explicit seed required'});return false;
});
const maxExpanded=Number(opts.expanded??12),maxMillis=Number(opts.millis??15000),deepExpanded=Number(opts.deep??4);
const maxActionsPerState=Number(opts.actions??12);
assert(Number.isSafeInteger(maxActionsPerState)&&maxActionsPerState>0);
const priorPath=path.resolve(req('prior')),priorBytes=fs.readFileSync(priorPath);
const priorIndex=read(path.resolve(req('prior-index')));
assert.equal(priorIndex.sourceFingerprint,source);
assert.equal(sha(priorBytes),priorIndex.graphSha256);
const priorGraph=JSON.parse(gunzipSync(priorBytes));
assert.equal(priorGraph.version,140);
const archiveBytes=fs.readFileSync(path.resolve(req('archive')));
const ledgerIndex=read(path.resolve(req('archive-index')));
assert.equal(sha(archiveBytes),ledgerIndex.ledgerSha256);assert.equal(ledgerIndex.graphSha256,sha(priorBytes));
const archive=JSON.parse(gunzipSync(archiveBytes));assert.equal(archive.version,140);assert.equal(archive.sourceFingerprint,source);assert.equal(archive.graphSha256,sha(priorBytes));
const combinedGraph=priorGraph,combinedIndex=priorIndex;
const parentCounts={primaryStates:priorGraph.nodes.length,primaryEdges:priorGraph.edges.length,unionResearch:Object.keys(priorIndex.byResearch).length};
const routes=[{lane:'priest',file:opts['priest-route']||'docs/career-batches/v138-run3/v138-best-route.json'},{lane:'officer',file:opts['officer-route']||'docs/career-batches/v140-run3/v140-direct-route.json'}].map(r=>({...r,...read(path.resolve(r.file))}));
const parentEdges=new Map(priorGraph.edges.map(e=>[e.from+'|'+JSON.stringify(e.action),e.to]));
for(const r of routes){assert.equal(r.sourceFingerprint,source);assert(r.witness.ok);assert.equal(sha(JSON.stringify(r.witness.actions)),r.actionHash);let id=priorGraph.initial;for(const a of r.witness.actions){id=parentEdges.get(id+'|'+JSON.stringify(a));assert(id,'prior route edge missing');}assert.equal(id,r.witness.finalState);}
const targets=(opts.focus||'STR_MEDICINE,STR_SOLDIER_TYPE_SS,STR_SOLDIER_TYPE_PEA,STR_SOLDIER_TYPE_BASIC,STR_GYM_ADVANCE,STR_BOOT_CAMP_TRAINING,STR_GYMNASTICS,STR_CUISINE').split(',').filter(Boolean);
assert(targets.every(id=>data.researchRules[id]));
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const heroRules=data.transformations.filter(t=>t.allowedSoldierTypes.includes('STR_SOLDIER_HERO')&&t.allowsLiveSoldiers&&!t.createsClone&&!t.producedItem&&(!t.producedSoldierType||t.producedSoldierType==='STR_SOLDIER_HERO')&&!t.requires.includes('STR_UNAVAILABLE'));
const focusWeights=new Map(),unlocks=new Map();
for(const [id,r] of Object.entries(data.researchRules))for(const k of r.unlocks||[]){if(!unlocks.has(k))unlocks.set(k,[]);unlocks.get(k).push(id);}
function mark(id,weight,depth=0){
 if(depth>5||weight<3||!data.researchRules[id]||(focusWeights.get(id)||0)>=weight)return;
 focusWeights.set(id,weight);const r=data.researchRules[id];
 for(const k of [...(r.dependencies||[]),...(r.requires||[])])mark(k,Math.floor(weight*0.65),depth+1);
 for(const k of unlocks.get(id)||[])mark(k,Math.floor(weight*0.75),depth+1);
}
for(const id of targets)mark(id,100);
const focus=[...focusWeights.keys()];
function member(w){return w.soldiers.find(s=>s.id==='origin'&&s.state.soldierType==='STR_SOLDIER_HERO'&&s.state.exactStats&&!s.state.retired);}
const statCache=new WeakMap();
function stats(w){if(!statCache.has(w)){const m=member(w);statCache.set(w,m?careerStatVectors(m,data):null);}return statCache.get(w);}
function careerCandidates(w){
 const m=member(w);if(!m||w.pendingFree)return [];
 return heroRules.filter(t=>!m.state.history.has(t.id)&&t.requires.every(id=>active(w,id))&&eligibleTransformation(t,m.state,data,{mode:'current',researched:[...w.researched],disabled:[...w.disabled],baseFunctions:[...w.baseFunctions],items:w.items,funds:w.funds,commendations:m.commendations||{}}).kind==='eligible').map(t=>({type:'transform',soldier:'origin',transform:t.id}));
}
function careerEvidence(w,z,action){
 const before=member(w),after=member(z);assert(before&&after&&after.state.history.has(action.transform)&&!before.state.history.has(action.transform));
 const a=careerStatVectors(before,data),b=careerStatVectors(after,data);
 const delta=Object.fromEntries(Object.keys(a.permanentStats).map(k=>[k,b.permanentStats[k]-a.permanentStats[k]]));
 return {originProfile:'manufacture:STR_HERO_RECRUITMENT',body:after.state.soldierType,transformation:action.transform,before:a,after:b,delta,history:[...after.state.history].sort(),rank:after.state.rank,activeResearch:[...z.researched].filter(k=>!z.disabled.has(k)).sort(),evidenceTier:'conditional-model-replay',registered:false};
}
function targetedSupply(w){
 const m=member(w);if(!m||w.pendingFree)return [];
 const needs=new Map();
 for(const t of heroRules){if(m.state.history.has(t.id)||!t.requires.every(id=>active(w,id)))continue;
  for(const [id,count] of Object.entries(t.requiredItems||{})){const missing=count-(w.items[id]||0);if(missing>0)needs.set(id,Math.max(missing,needs.get(id)||0));}
 }
 const actions=[];
 for(const [item,count] of needs){
  try{purchaseVerdict(w,item,count,data);actions.push({type:'acquirePurchase',item,count});}catch{}
  for(const r of data.itemSupply?.[item]?.manufacture||[]){
   if(!r.id||r.weight!==undefined||!(r.requires||[]).every(k=>active(w,k))||!(r.requiresBaseFunc||[]).every(k=>w.baseFunctions.has(k)))continue;
   if(Object.entries(r.requiredItems||{}).every(([k,n])=>(w.items[k]||0)>=n))actions.push({type:'manufacture',item,recipe:r.id,count:1});
  }
 }
 return actions;
}
function statePriority(w,n){
 const v=stats(w);const total=v?Object.values(v.permanentStats).reduce((a,b)=>a+b,0):0;
 return (v?2000+total+25*v.permanentStats.tu:0)+targets.filter(id=>active(w,id)).length*400+n.available.reduce((a,id)=>a+(focusWeights.get(id)||0),0);
}
const actionRank=a=>a.type==='transform'?200+(focusWeights.get(a.transform)||0):focusWeights.get(a.id||a.research)||0;
// Rotate distinct goal lanes instead of maximizing the total completed focus set.
const lanes=(opts.lanes||'STR_OFFICER_TRAINING,STR_CHAPLAIN_TRAINING,STR_SCHOOLING_2,STR_BREAD_AND_FISHES_TRAINING').split(',').filter(Boolean);
assert(lanes.every(id=>data.researchRules[id]));
const planner=createGoalPlanner(data,lanes,{purchaseVerdict,facilityMaterials});
const laneWeights=new Map();
for(const goal of lanes){
 const weights=new Map();
 function visit(id,depth){if(depth>5||!data.researchRules[id]||(weights.get(id)??99)<=depth)return;weights.set(id,depth);const r=data.researchRules[id];
 for(const k of [...(r.dependencies||[]),...(r.requires||[]),...(unlocks.get(id)||[])])visit(k,depth+1);}
 visit(goal,0);laneWeights.set(goal,weights);
}
const laneScore=new Map();
function expansionPolicy(pool,step){
 if(!pool.length)return null;
 const goal=lanes[step%lanes.length],weights=laneWeights.get(goal),r=data.researchRules[goal];
 const rankState=e=>{
  const key=goal+'|'+e.n.id;if(laneScore.has(key))return laneScore.get(key);
  const w=e.w,n=e.n;let s=0;
  for(const [id,depth] of weights){const v=40/(1+depth*depth);if(active(w,id))s+=v;else if(n.available.includes(id))s+=v*0.4;}
  if(active(w,goal))s-=10000;
  if(n.available.includes(goal))s+=1000;
  if(member(w))s+=20;
  if(w.pendingFree?.choices?.some(id=>weights.has(id)))s+=180;
  if(n.depth>=maxDepth)s-=10000;
  laneScore.set(key,s);return s;
 };
 const top=pool.slice().sort((a,b)=>rankState(b)-rankState(a)||b.n.depth-a.n.depth||a.n.id.localeCompare(b.n.id)).slice(0,4);
 const choices=top.map(entry=>({entry,plan:planner.analyze(entry.w,entry.n,goal)})).sort((a,b)=>a.plan.cost-b.plan.cost||rankState(b.entry)-rankState(a.entry));
 const {entry,plan}=choices[0],w=entry.w;
 return {entry,goal,cost:plan.cost,actions:planner.supply(w,plan),rank:a=>{
  if(a.type==='freeResearch')return 10000+(a.research===goal?1000:plan.research.has(a.research)?500:0);
  if(a.type==='transform')return 9000;
  const id=a.id||a.research;
  if(id===goal)return 8000;
  if(plan.research.has(id))return 5000-(weights.get(id)||0)*30;
  if(plan.items.has(a.item))return 4800;
  if(a.type==='acquireFacility'&&(data.campaignAssets.facilities[a.id]?.provideBaseFunc||[]).some(k=>plan.functions.has(k)))return 4700;
  return weights.has(id)?1000-(weights.get(id)||0)*100:0;
 }};
}
const variantSeeds=routes.map(r=>({id:'hero-v141:'+r.lane,actions:r.witness.actions,expectedStats:r.witness.evidence.stats,expectedCommitments:r.witness.evidence.goals,expectedResearch:r.witness.evidence.goals,origin:'v141-parent',stage:r.lane}));
seeds.push(...variantSeeds);
const careerPlans=[];
const verifyV141=verifySeed;
const planEvidence=()=>{throw Error('no explicit plan');};
const convergencePass=context=>continueCareers({...context,routes,planner,book,careerCandidates,stats,maxSteps:Number(opts['lane-steps']||50)});
const graph=produceGraph(data,snapshot,{maxStates,maxDepth,maxExpanded,maxMillis,extraActions:w=>[...extraActions(w),...targetedSupply(w)],seeds,applyStep:sourceFunctions.apply,verifySeed:verifyV141,deepExpanded,priorGraph:combinedGraph,focus,maxActionsPerState,careerCandidates,careerEvidence,statePriority,actionRank,maxCareerActions:Number(opts.careers||24),expansionPolicy,convergencePass,careerPlans,planEvidence});
// Preserve previous receipts independently of the latest graph's transient careerResults.
const edgeIndex=new Map();for(const e of graph.edges){const k=e.from+'|'+JSON.stringify(e.action);edgeIndex.set(k,e.to);}
const ledger=new Map();
function retain(receipt,version,kind){
 if(kind==='plan'&&!receipt.ok)return;
 assert(Array.isArray(receipt.actions)&&sha(JSON.stringify(receipt.actions))===receipt.actionHash,'invalid witness hash');
 let state=graph.initial;for(const action of receipt.actions){state=edgeIndex.get(state+'|'+JSON.stringify(action));assert(state,'witness action absent from graph');}
 assert.equal(state,kind==='plan'?receipt.finalState:receipt.to,'witness terminal mismatch');
 const vector=kind==='plan'?receipt.evidence.stats.permanentStats:receipt.evidence.after.permanentStats;
 const previous=ledger.get(receipt.actionHash);
 if(previous){assert.deepEqual(previous.permanentStats,vector);if(!previous.sources.some(s=>s.version===version&&s.kind===kind))previous.sources.push({version,kind});return;}
 ledger.set(receipt.actionHash,{actionHash:receipt.actionHash,terminal:state,permanentStats:vector,sources:[{version,kind}],receipt,gameCertified:false,registered:false});
}
for(const row of archive.witnesses){for(const s of row.sources)retain(row.receipt,s.version,s.kind);}
const oldVectors=new Set([...ledger.values()].map(r=>JSON.stringify(r.permanentStats)));
for(const r of graph.careerResults)retain(r,141,'transform');
for(const r of graph.planResults)retain(r,141,'plan');
const allWitnesses=[...ledger.values()];
const uniqueVectors=[...new Set(allWitnesses.map(r=>JSON.stringify(r.permanentStats)))].map(JSON.parse);
const vectorSum=v=>Object.values(v).reduce((a,b)=>a+b,0);
const ledgerSummary={witnesses:allWitnesses.length,previousWitnesses:allWitnesses.filter(r=>r.sources.some(s=>s.version<141)).length,newWitnesses:allWitnesses.filter(r=>r.sources.every(s=>s.version===141)).length,uniqueVectors:uniqueVectors.length,newVectors:uniqueVectors.filter(v=>!oldVectors.has(JSON.stringify(v))),bestPermanentSum:Math.max(0,...uniqueVectors.map(vectorSum)),bestTU:Math.max(0,...uniqueVectors.map(v=>v.tu)),registered:0,gameCertified:0};
graph.version=141;graph.deferredEvents=deferredEvents;graph.sourceFiles=files;graph.snapshot=snapshot;graph.scope='conditional lab, free awards, source-gated supplies and events; conditional encounter and rank witnesses; no native economy, calendar or combat certification';
graph.budget={maxStates,maxDepth,maxExpanded,maxMillis,deepExpanded,maxActionsPerState};graph.priorGraphSha256=sha(priorBytes);graph.parentCounts=parentCounts;
const byResearch={},byId=new Map(graph.nodes.map(n=>[n.id,n]));
for(const edge of graph.edges)for(const id of edge.added){
 const row=byResearch[id]??={firstDepth:Infinity,firstState:null,transitionCount:0};
 row.transitionCount++;
 const depth=byId.get(edge.to).depth;
 if(depth<row.firstDepth){row.firstDepth=depth;row.firstState=edge.to;}
}
const rootEdges=graph.edges.filter(e=>e.from===graph.initial);
const actionsByType={};for(const e of graph.edges)actionsByType[e.action.type]=(actionsByType[e.action.type]||0)+1;
const researchByAction={};for(const e of graph.edges)for(const id of e.added)(researchByAction[e.action.type]??=new Set()).add(id);
assert.deepEqual(rootEdges.map(e=>e.action.id).sort(),Object.keys(START_RESEARCH).sort());
const newResearch=Object.keys(byResearch).filter(id=>!combinedIndex.byResearch[id]).sort();
const variantResults=graph.seedResults.filter(r=>r.id.startsWith('hero-v141:')).map(r=>({...r,actions:variantSeeds.find(s=>s.id===r.id).actions}));
const summary={parentCounts,plans:graph.planResults.map(({actions,stateIds,evidence,...r})=>({...r,stats:evidence?.stats?.permanentStats??null,delta:evidence?.delta??null,funds:evidence?.funds??null})),variantResults:variantResults.map(({actions,evidence,stateIds,...r})=>({...r,stats:evidence?.stats?.permanentStats??null,bootCampMissing:evidence?.bootCampMissing??null,advancedGymMissing:evidence?.advancedGymMissing??null,month:evidence?.month??null,stock:evidence?.stock??null,officerMissing:evidence?.officerMissing??null,chaplainMissing:evidence?.chaplainMissing??null,funds:evidence?.funds??null,sales:evidence?.sales??null,costedFacilities:evidence?.costedFacilities??null,bookEvents:evidence?.bookEvents??null,study:evidence?.study??null,schoolMissing:evidence?.schoolMissing??null})),convergence:graph.convergence&&(({traces,rejected,...rest})=>rest)(graph.convergence),ledger:ledgerSummary,lanes,expansionRecords:graph.expansionRecords,targets,targetsReached:targets.filter(id=>byResearch[id]),careerProduced:graph.careerResults.length,careerRejected:graph.careerRejected.length,careerUniqueVectors:new Set(graph.careerResults.map(r=>JSON.stringify(r.evidence.after.permanentStats))).size,careerDeltas:[...new Set(graph.careerResults.map(r=>JSON.stringify(r.evidence.delta)))].map(JSON.parse),priorStates:graph.priorStates,priorTransitions:graph.priorTransitions,newStates:graph.newStates,newTransitions:graph.newTransitions,newResearch,focusReached:focus.filter(id=>byResearch[id]),seedInputs:seeds.length,seedTips:graph.seedTipCount,cacheHits:graph.cacheHits,successfulSeeds:graph.seedResults.filter(r=>r.ok).length,heroSuccessful:graph.seedResults.filter(r=>r.ok&&r.id.startsWith('hero-')).length,deferredEvents:deferredEvents.length,expanded:graph.expanded,unexpanded:graph.unexpanded.length,stopReason:graph.stopReason,actionsByType,researchByAction:Object.fromEntries(Object.entries(researchByAction).map(([k,v])=>[k,v.size])),seeds:graph.seedResults?.map(({id,ok,applied,total,reason})=>({id,ok,applied,total,reason})),states:graph.nodes.length,transitions:graph.edges.length,frontier:graph.frontier.length,rejected:graph.rejected.length,distinctCompleted:Object.keys(byResearch).length,maxDepth:Math.max(...graph.nodes.map(n=>n.depth)),rootActions:rootEdges.map(e=>({action:e.action,added:e.added,availableAfter:e.availableAfter,pendingFree:byId.get(e.to).pendingFree})),gameCertified:0,complete:false,scope:graph.scope};
fs.mkdirSync(out,{recursive:true});
assert(!fs.existsSync(path.join(out,'campaign-forward-research-graph-v141.json.gz')),'refuse overwrite of prior production');
const write=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n','utf8');
const gz=gzipSync(Buffer.from(JSON.stringify(graph)));
fs.writeFileSync(path.join(out,'campaign-forward-research-graph-v141.json.gz'),gz);
write('campaign-forward-research-index-v141.json',{version:141,sourceFingerprint:source,graphSha256:sha(gz),initial:graph.initial,summary,byResearch});
write('v141-research-frontier.json',{sourceFingerprint:source,graphSha256:sha(gz),frontier:graph.frontier,unexpanded:graph.unexpanded,deferredEvents,expansionRecords:graph.expansionRecords});
write('v141-production-report.json',{version:141,sourceFingerprint:source,sourceFiles:files,graphSha256:sha(gz),budget:graph.budget,summary});
write('v141-career-witnesses.json',{version:141,sourceFingerprint:source,graphSha256:sha(gz),witnesses:graph.seedResults.filter(r=>r.id.startsWith('hero-')),registered:false,gameCertified:false});
write('v141-new-training-witnesses.json',{version:141,sourceFingerprint:source,graphSha256:sha(gz),witnesses:graph.careerResults,rejected:graph.careerRejected,gameCertified:false,registered:false});
const ledgerBytes=gzipSync(Buffer.from(JSON.stringify({version:141,sourceFingerprint:source,graphSha256:sha(gz),archiveSha256:sha(archiveBytes),priorGraphSha256:sha(priorBytes),summary:ledgerSummary,witnesses:allWitnesses,gameCertified:false,registered:false})));fs.writeFileSync(path.join(out,'v141-training-ledger.json.gz'),ledgerBytes);write('v141-training-ledger-index.json',{version:141,sourceFingerprint:source,ledgerSha256:sha(ledgerBytes),graphSha256:sha(gz),summary:ledgerSummary});
write('v141-convergence-witnesses.json',{version:141,sourceFingerprint:source,graphSha256:sha(gz),convergence:graph.convergence,gameCertified:false,registered:false});
write('v141-branch-witnesses.json',{version:141,sourceFingerprint:source,graphSha256:sha(gz),parentCounts,witnesses:variantResults,registered:false,gameCertified:false});
write('v141-training-plans.json',{version:141,sourceFingerprint:source,graphSha256:sha(gz),witnesses:graph.planResults,registered:false,gameCertified:false});
for(const plan of graph.planResults.filter(p=>p.ok)){
 const name=plan.id.startsWith('v141-officer-growth:')?'growth':'direct';
 const i=graph.planResults.filter(p=>p.ok&&p.id.startsWith(plan.id.split(':')[0]+':')).indexOf(plan);
 const compact={version:141,sourceFingerprint:source,graphSha256:sha(gz),actionHash:plan.actionHash,witness:plan,registered:false,gameCertified:false};
 if(i===0)fs.writeFileSync(path.join(out,'v141-'+name+'-route.json'),JSON.stringify(compact),'utf8');
}
console.log(JSON.stringify(summary));
