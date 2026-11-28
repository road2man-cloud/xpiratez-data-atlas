// V128 runner: source-hash-checked campaign research graph. No injected research.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {produceGraph} from './campaign-forward-graph-core-v128.mjs';
import {createEncounterGate} from './campaign-forward-encounter-gate-v124.mjs';
import {createEventGate} from './campaign-forward-event-gate-v123.mjs';
import {createSupplyActions} from './campaign-forward-supply-v121.mjs';
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
const files={},research={},items={},facilities={},events={},eventScripts={},alienDeployments={},alienMissions={},missionScripts={},ufos={},alienRaces={},regions={},textures={},units={},armors={};
function load(file,expected){
 const bytes=fs.readFileSync(file),name=path.basename(file),digest=sha(bytes);
 assert.equal(digest,expected||prefix.sourceFiles[name],'source hash mismatch '+name);
 files[name]=digest;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 for(const t of doc.globe?.textures||[])textures[t.id]={...textures[t.id],...t};
 for(const [k,dst] of Object.entries({research,items,facilities,events,eventScripts,alienDeployments,alienMissions,missionScripts,ufos,alienRaces,regions,units,armors}))for(const row of doc[k]||[]){
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
const focus=(opts.focus||'STR_BASIC_FIREARMS_TRAINING,STR_HUMANS,STR_MESS_HALL,STR_MUTANT_ABILITIES,STR_GOVT_CORRUPTION,STR_SCHOOL_BOOKS,STR_LIBRARY,STR_PSI_LAB_PREQ,STR_PSI_LAB,STR_DARK_STAR,STR_GLAMOUR_USE,STR_HERO_GOLD_TRAINING').split(',').filter(Boolean);
assert(focus.every(id=>data.researchRules[id]));
const target='STR_BASIC_FIREARMS_TRAINING';
assert.equal(priorGraph.version,127);
const receipt=priorGraph.careerResults.filter(r=>r.action.type==='transform'&&r.action.transform===target).sort((a,b)=>a.actionCount-b.actionCount||a.actionHash.localeCompare(b.actionHash))[0];
assert(receipt&&sha(JSON.stringify(receipt.actions))===receipt.actionHash);
const base=seed114.routes.filter(row=>JSON.stringify(receipt.actions.slice(0,row.actions.length))===JSON.stringify(row.actions)).sort((a,b)=>b.actions.length-a.actions.length)[0];
assert(base&&base.history.some(([id])=>id==='STR_NEPOTISM')&&base.history.some(([id])=>id==='STR_SCHOOL_OF_HARD_KNOCKS'));
const suffix=receipt.actions.slice(base.actions.length);
assert.equal(suffix.at(-1).transform,target);
const eligible=seed114.routes.filter(row=>row.history.some(([id])=>id==='STR_NEPOTISM')&&row.history.some(([id])=>id==='STR_SCHOOL_OF_HARD_KNOCKS')&&row.actionHash!==base.actionHash);
const careerPlans=eligible.map(row=>{
 const seed=uniqueSeeds.get(row.actionHash);assert(seed);
 return {id:'v128:'+row.actionHash,seedId:seed.id,actions:suffix,baseOrder:row.stage,baseHash:row.actionHash,sourceReceipt:receipt.actionHash};
});
function planEvidence(w,plan){
 const member=w.soldiers.find(s=>s.id==='origin');assert(member&&member.state.history.has(target));
 const stats=careerStatVectors(member,data);
 const baseRow=seed114.routes.find(r=>r.actionHash===plan.baseHash);assert(baseRow);
 const delta=Object.fromEntries(Object.keys(stats.permanentStats).map(k=>[k,stats.permanentStats[k]-receipt.evidence.after.permanentStats[k]]));
 for(const id of baseRow.confirmedCommitments||[])assert(w.researched.has(id)&&!w.disabled.has(id),'commitment missing '+id);
 return {originProfile:'manufacture:STR_HERO_RECRUITMENT',body:member.state.soldierType,baseOrder:plan.baseOrder,baseHash:plan.baseHash,sourceReceipt:plan.sourceReceipt,stats,deltaVsV127:delta,history:[...member.state.history].sort(),rank:member.state.rank,activeResearch:[...w.researched].filter(k=>!w.disabled.has(k)).sort(),registered:false,gameCertified:false};
}
const graph=produceGraph(data,snapshot,{maxStates,maxDepth,maxExpanded,maxMillis,extraActions,seeds,applyStep:encounter.apply,verifySeed,deepExpanded,priorGraph,focus,maxActionsPerState,careerPlans,planEvidence});
graph.version=128;graph.deferredEvents=deferredEvents;graph.sourceFiles=files;graph.snapshot=snapshot;graph.scope='conditional lab, free awards, source-gated supplies and events; conditional encounter and rank witnesses; no native economy, calendar or combat certification';
graph.budget={maxStates,maxDepth,maxExpanded,maxMillis,deepExpanded,maxActionsPerState};graph.priorGraphSha256=sha(priorBytes);
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
const newResearch=Object.keys(byResearch).filter(id=>!priorIndex.byResearch[id]).sort();
const successfulPlans=graph.planResults.filter(r=>r.ok); const priorVectors=new Set(priorGraph.careerResults.map(r=>JSON.stringify(r.evidence.after.permanentStats))); const newVectors=[...new Set(successfulPlans.map(r=>JSON.stringify(r.evidence.stats.permanentStats)))].filter(v=>!priorVectors.has(v));
const summary={planned:careerPlans.length,planSuccess:successfulPlans.length,planFailures:graph.planResults.filter(r=>!r.ok).map(r=>({id:r.id,applied:r.applied,reason:r.reason})),newPermanentVectors:newVectors.map(JSON.parse),newPermanentVectorCount:newVectors.length,orderResults:successfulPlans.map(r=>({order:r.evidence.baseOrder,delta:r.evidence.deltaVsV127,actionCount:r.actionCount})),priorStates:graph.priorStates,priorTransitions:graph.priorTransitions,newStates:graph.newStates,newTransitions:graph.newTransitions,newResearch,focusReached:focus.filter(id=>byResearch[id]),seedInputs:seeds.length,seedTips:graph.seedTipCount,cacheHits:graph.cacheHits,successfulSeeds:graph.seedResults.filter(r=>r.ok).length,heroSuccessful:graph.seedResults.filter(r=>r.ok&&r.id.startsWith('hero-')).length,deferredEvents:deferredEvents.length,expanded:graph.expanded,unexpanded:graph.unexpanded.length,stopReason:graph.stopReason,actionsByType,researchByAction:Object.fromEntries(Object.entries(researchByAction).map(([k,v])=>[k,v.size])),seeds:graph.seedResults?.map(({id,ok,applied,total,reason})=>({id,ok,applied,total,reason})),states:graph.nodes.length,transitions:graph.edges.length,frontier:graph.frontier.length,rejected:graph.rejected.length,distinctCompleted:Object.keys(byResearch).length,maxDepth:Math.max(...graph.nodes.map(n=>n.depth)),rootActions:rootEdges.map(e=>({action:e.action,added:e.added,availableAfter:e.availableAfter,pendingFree:byId.get(e.to).pendingFree})),gameCertified:0,complete:false,scope:graph.scope};
fs.mkdirSync(out,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n','utf8');
const gz=gzipSync(Buffer.from(JSON.stringify(graph)));
fs.writeFileSync(path.join(out,'campaign-forward-research-graph-v128.json.gz'),gz);
write('campaign-forward-research-index-v128.json',{version:128,sourceFingerprint:source,graphSha256:sha(gz),initial:graph.initial,summary,byResearch});
write('v128-research-frontier.json',{sourceFingerprint:source,graphSha256:sha(gz),frontier:graph.frontier,unexpanded:graph.unexpanded,deferredEvents,expansionRecords:graph.expansionRecords});
write('v128-production-report.json',{version:128,sourceFingerprint:source,sourceFiles:files,graphSha256:sha(gz),budget:graph.budget,summary});
write('v128-career-witnesses.json',{version:128,sourceFingerprint:source,graphSha256:sha(gz),witnesses:graph.seedResults.filter(r=>r.id.startsWith('hero-')),registered:false,gameCertified:false});
write('v128-training-order-witnesses.json',{version:128,sourceFingerprint:source,graphSha256:sha(gz),sourceReceipt:receipt.actionHash,witnesses:graph.planResults,gameCertified:false,registered:false});
console.log(JSON.stringify(summary));
