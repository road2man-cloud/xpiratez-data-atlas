// V149: normalize legacy careers by shared, chronological forward prefixes.
// Legacy research, externalInputs, and expected stats are NEVER applied.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {readTrainingLedger,hashLedger} from './overcap-training-ledger-store.mjs';
import {createForwardResearch,replayForwardNode} from './atlas-overcap-forward-research-v2.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {createGrowthReplay,member} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const stem='tools/data/overcap-forward-research-v2-goal-str_personal_labs';
const graphPath=arg('graph',stem+'.json.gz'), summaryPath=arg('summary',stem+'-summary.json');
const graph=read(graphPath),manifest=read(summaryPath),graphSha=sha(fs.readFileSync(graphPath));
assert.equal(graph.schema,'ATLAS_FORWARD_CAMPAIGN_RESEARCH_V2');
assert.equal(graphSha,manifest.artifactSha256);
assert.deepEqual(graph.inputs,manifest.inputs);
const dataPath='public/data/soldiers-modern-index.json',supplyPath='tools/data/overcap-forward-supply-catalog-v2.json';
const birthPath='public/data/soldier-acquisition-progression-20261102.json';
assert.equal(sha(fs.readFileSync(dataPath)),graph.inputs.rulesSha256);
assert.equal(sha(fs.readFileSync(supplyPath)),graph.inputs.supplySha256);
for(const [p,h] of Object.entries(graph.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')),h,p);
const data=read(dataPath);data.forwardSupply=read(supplyPath);data.originRows=read(birthPath).rows;
const ledger=readTrainingLedger(arg('training-hash','8ea2e3ed986fbc7496b57a7477a77bd1c2e1843ef4f9354f480e4248b20e949c'));
assert.equal(ledger.sourceMetadataSha256,graph.sourceMetadataSha256);
assert.equal(data.meta.source.metadataSha256,graph.sourceMetadataSha256);
const engine=createForwardResearch(data,{maxMonth:graph.budget.maxMonth}),growth=createGrowthReplay(data);
const roots=Object.values(graph.roots);
assert.deepEqual(roots,['STR_JACKSTOWN_SCOUTING','STR_WAT_DO','STR_RECRUIT_PEASANTS','STR_INSPECT_MACHINERY']);
const index=(rows)=>new Map(rows.map(r=>[r.id,r]));
const life=index(read('public/data/soldier-overcap-expanded-lifecycle.json').results);
const children=index(read('public/data/soldier-overcap-direct-successors.json').rows);
const terminals=index(read('public/data/soldier-overcap-terminal-continuations.json').rows);
const profiles=index(data.profiles),rules=growth.rules;
const arr=x=>Array.isArray(x)?x:[];
const pairs=x=>Object.entries(x||{});
const sorted=x=>[...new Set(x)].sort();
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const qty=(w,k)=>Number(w.items[k]||0);
const settled=w=>!w.pendingFree&&!w.forwardDeliveries?.length;
const actionsAllowed=new Set(['recruit','transform','conditionalCapGrowth','conditionalPromotion','conditionalMedal']);
const researchActions=new Set(['campaignContext','externalInputs','research','freeResearch','repeatResearch','advanceMonth','eventResearch','missionResearch']);
const requirements=(r,kind)=>({research:sorted(r.requires||[]),functions:sorted(r.requiresBaseFunc||[]),items:kind==='recruit'?r.acquisitionRequiredItems||{}:r.requiredItems||{},cost:r.cost??null,minStats:r.requiredMinStats??null,maxStats:r.requiredMaxStats??null,medals:r.requiredCommendations??{},rank:r.minRank??null,previous:r.requiredPreviousTransformations??[],forbidden:r.forbiddenPreviousTransformations??[]});
const groups=new Map(),acquisitions=new Map(),goals=[];
for(const row of ledger.rows){
 const t=terminals.get(row.sourceTerminalId),c=children.get(row.sourceRecordId),p=life.get(row.parentRecordId);
 assert(t&&c&&p&&t.sourceRecordId===c.id&&t.parentRecordId===p.id);
 const full=[...p.actions,...c.suffix,...t.suffix,...row.suffix];
 assert.equal(hashLedger(full),row.fullActionHash);
 assert(full.every(a=>actionsAllowed.has(a.type)||researchActions.has(a.type)),'Unknown legacy action; explicit adapter required');
 const steps=full.filter(a=>actionsAllowed.has(a.type));
 assert.equal(steps.filter(a=>a.type==='recruit').length,1);
 assert.equal(steps[0].profile,row.origin);
 assert(steps.every(s=>s.soldier==='origin'));
 const context=full.find(a=>a.type==='campaignContext')||null;
 const profile=profiles.get(row.origin);assert(profile);
 const stages=steps.map(a=>({action:a,requirements:a.type==='recruit'?requirements(profile,'recruit'):a.type==='transform'?requirements(rules.get(a.transform),'transform'):null}));
 const acqKey=key([steps[0],context]);
 const groupKey=key([acqKey,stages]);
 const goal={id:row.id,group:groupKey,acquisition:acqKey,legacyActionHash:row.fullActionHash,legacyBranch:row.branch,difficulty:row.difficulty,target:row.target,targetBody:row.body,legacyExpected:{raw:row.raw,effective:row.effective,cap:row.cap,traits:row.traits,history:row.history},status:'QUARANTINED_LEGACY_GOAL',finalAdmission:false};
 goals.push(goal);
 if(!groups.has(groupKey))groups.set(groupKey,{id:groupKey,acquisition:acqKey,stages,goalIds:[]});
 groups.get(groupKey).goalIds.push(row.id);
 if(!acquisitions.has(acqKey))acquisitions.set(acqKey,{id:acqKey,profile:row.origin,birth:steps[0],context,requirements:stages[0].requirements,groupIds:new Set(),goalIds:[]});
 const a=acquisitions.get(acqKey);a.groupIds.add(groupKey);a.goalIds.push(row.id);
}
const nodes=graph.nodes.filter(n=>n.firstRoot&&!n.pendingFree&&!n.pendingDeliveries.length);
const cache=new Map();
function prefix(n){
 if(!cache.has(n.id)){
  const p=replayForwardNode(data,graph,n.id);
  assert.equal(p.actions[1].id,n.firstRoot);
  assert(!p.actions.slice(1).some(a=>a.type==='externalInputs'));
  cache.set(n.id,p);
 }
 const p=cache.get(n.id);
 return {...p,world:structuredClone(p.world),actions:[...p.actions],evidence:[...p.evidence]};
}
const unlockBy=new Map();
for(const [src,r] of pairs(data.researchRules))for(const dest of arr(r.unlocks)){if(!unlockBy.has(dest))unlockBy.set(dest,[]);unlockBy.get(dest).push(src);}
function weightsFor(ids){
 const weights=new Map(),queue=ids.map(k=>[k,0]);
 for(let i=0;i<queue.length;i++){
  const [k,d]=queue[i],v=1000/Math.pow(3,d);
  if((weights.get(k)||0)>=v)continue;weights.set(k,v);
  if(d>=6)continue;
  const r=data.researchRules[k]||{};
  const deps=[...arr(r.requires),...arr(r.dependencies),...arr(unlockBy.get(k))];
  for(const e of arr(data.eventResearchSources?.[k]))for(const s of arr(e.scripts))deps.push(...arr(s.researchPositive));
  for(const e of arr(data.missionResearchSources?.[k]))for(const s of arr(e.scripts))deps.push(...arr(s.researchPositive));
  for(const x of sorted(deps))queue.push([x,d+1]);
 }
 return weights;
}
function missing(w,req){
 return {research:req.research.filter(k=>!active(w,k)),disabled:req.research.filter(k=>w.disabled.has(k)),functions:req.functions.filter(k=>!w.baseFunctions.has(k)),items:Object.fromEntries(pairs(req.items).map(([k,n])=>[k,Math.max(0,n-qty(w,k))]).filter(([,n])=>n>0)),cost:req.cost};
}
function nodeScore(n,weights,req){
 const have=new Set(n.researched),disabled=new Set(n.disabled);
 if(req.research.some(k=>disabled.has(k)))return -Infinity;
 return [...weights].reduce((s,[k,v])=>s+(have.has(k)&&!disabled.has(k)?v:0),0)+req.functions.filter(k=>n.baseFunctions.includes(k)).length*100+Object.entries(req.items).reduce((s,[k,v])=>s+Math.min(1,(n.items[k]||0)/v)*100,0)-n.depth/10000;
}
function optionScore(o,w,weights,req){
 const a=o.action,e=o.evidence||{},id=a.research||a.id;
 if(a.type==='freeResearch'||a.type==='sourceResearchDelivery')return 10000+(weights.get(id)||0);
 let v=weights.get(id)||0;
 const need=new Set(Object.keys(missing(w,req).items));
 for(const k of weights.keys()){const r=data.researchRules[k];if(r?.needItem)need.add(r.neededItem||k);}
 if(a.type==='sourceBuySample'&&need.has(a.id))v+=80;
 if(a.type==='sourceManufactureItem'&&pairs(e.outputs).some(([k])=>need.has(k)))v+=80;
 if(a.type==='sourceEventItems'&&pairs(e.items).some(([k])=>need.has(k)))v+=80;
 if(a.type==='sourceBuildFacility'&&arr(e.provides).some(k=>req.functions.includes(k)||[...weights.keys()].some(id=>arr(data.researchRules[id]?.requiresBaseFunc).includes(k))))v+=80;
 return v;
}
const limit=Number(arg('steps','6'));assert(Number.isSafeInteger(limit)&&limit>=0&&limit<=50);
const frontiers=[],prefixes=new Map();
for(const a of acquisitions.values()){
 const req=a.requirements,weights=weightsFor(req.research);
 for(const root of roots){
  const candidates=nodes.filter(n=>n.firstRoot===root).map(n=>({n,score:nodeScore(n,weights,req)})).filter(x=>Number.isFinite(x.score)).sort((x,y)=>y.score-x.score||x.n.id-y.n.id);
  if(!candidates.length){frontiers.push({acquisition:a.id,root,status:'OPEN_NO_COMPATIBLE_GRAPH_STATE'});continue;}
  const n=candidates[0].n,p=prefix(n);let world=p.world;
  prefixes.set(n.id,{nodeId:n.id,root,stateHash:p.stateHash,actions:p.actions,evidence:p.evidence});
  const before=missing(world,req),suffix=[],seen=new Set([exactStateHash(world)]),failures=[];
  // Only concrete enabled forward edges. A bounded heuristic, not an impossibility proof.
  for(let i=0;i<limit;i++){
   const m=missing(world,req);
   if(settled(world)&&!m.research.length&&!m.functions.length&&!Object.keys(m.items).length)break;
   const options=engine.options(world,root).choices.map(o=>({o,score:optionScore(o,world,weights,req)})).filter(x=>x.score>0).sort((x,y)=>y.score-x.score||JSON.stringify(x.o.action).localeCompare(JSON.stringify(y.o.action)));
   let selected=false;
   for(const {o} of options){
    try{
     const r=engine.apply(world,o.action,root),h=exactStateHash(r.world);
     if(seen.has(h))continue;
     if(req.research.some(k=>r.world.disabled.has(k)))continue;
     seen.add(h);world=r.world;suffix.push({action:o.action,evidence:o.evidence,stateHash:h,conditional:!!r.conditional});selected=true;break;
    }catch(err){failures.push({action:o.action,reason:String(err.message)});}
   }
   if(!selected)break;
  }
  const after=missing(world,req),reasons=[];
  if(after.research.length)reasons.push('RESEARCH_NOT_REACHED');
  if(after.disabled.length)reasons.push('RESEARCH_EXCLUSION');
  if(after.functions.length)reasons.push('FACILITY_NOT_REACHED');
  if(Object.keys(after.items).length)reasons.push('ITEM_SOURCE_OR_QUANTITY_NOT_REACHED');
  if(!settled(world))reasons.push('PENDING_REWARD_OR_DELIVERY');
  // No fake initial cash, no detached context injection, and no legacy branch hash
  // interpreted as a real campaign choice. Future budget/context adapters must
  // replay these exact prefixes, then apply each career step on that same world.
  if(a.context&&world.difficulty!==a.context.difficulty)reasons.push('CAMPAIGN_CONTEXT_NOT_ESTABLISHED');
  if(req.cost===null)reasons.push('ACQUISITION_COST_UNKNOWN');
  else if(world.funds<req.cost)reasons.push('CASH_NOT_SETTLED');
  let recruited=null;
  if(!reasons.length){
   try{const w=growth.apply(structuredClone(world),a.birth);recruited={stateHash:exactStateHash(w),body:member(w).state.soldierType,action:a.birth};}
   catch(err){reasons.push('RECRUIT_REPLAY_REJECTED');failures.push({action:a.birth,reason:String(err.message)});}
  }
  // Never admit any path just because a research set or a legacy stat vector matches.
  frontiers.push({acquisition:a.id,root,nodeId:n.id,prefixStateHash:p.stateHash,before,after,suffix,finalStateHash:exactStateHash(world),funds:world.funds,trackedEventIncome:world.forwardEventFunds||0,trackedProcurement:world.forwardProcurementSpend||0,failures,reasons,recruited,status:recruited?'CONDITIONAL_RECRUITMENT_ONLY':'OPEN_ACQUISITION',finalAdmission:false,actualGameCertified:false});
 }
}
const reasonCounts={};for(const g of acquisitions.values()){const f=frontiers.filter(x=>x.acquisition===g.id);for(const reason of sorted(f.flatMap(x=>x.reasons||[])))reasonCounts[reason]=(reasonCounts[reason]||0)+g.goalIds.length;}
const summary={legacyGoals:goals.length,careerGroups:groups.size,acquisitionGroups:acquisitions.size,graphNodes:graph.nodes.length,sharedPrefixes:prefixes.size,frontiers:frontiers.length,generatedForwardEdges:frontiers.reduce((n,f)=>n+(f.suffix?.length||0),0),conditionalRecruitments:frontiers.filter(f=>f.recruited).length,careerReapplied:0,distinctRecoveredOutcomes:0,actualGameCertified:0,finalAdmission:0,reasonCounts};
const result={schema:'ATLAS_OVERCAP_FORWARD_BULK_NORMALIZATION_V1',scope:'One immutable legacy training ledger. Shared exact forward prefixes and bounded acquisition continuation; no full campaign or public DB admission.',graphPath,graphSha256:graphSha,trainingHash:hashLedger(ledger),sourceMetadataSha256:ledger.sourceMetadataSha256,acquisitionSha256:sha(fs.readFileSync(birthPath)),summary,goals,groups:[...groups.values()],acquisitions:[...acquisitions.values()].map(a=>({...a,groupIds:[...a.groupIds]})),prefixes:[...prefixes.values()],frontiers,normalizationComplete:false,actualGameCertified:false};
const out=arg('out','tools/data/overcap-forward-bulk-normalization-'+key(result).slice(0,20)+'.json.gz');
if(fs.existsSync(out))assert.deepEqual(read(out),result);else fs.writeFileSync(out,gzipSync(JSON.stringify(result)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,profiles:[...acquisitions.values()].map(a=>({profile:a.profile,goals:a.goalIds.length,groups:a.groupIds.size})),frontiers:frontiers.map(f=>({root:f.root,node:f.nodeId,edges:f.suffix?.length,missing:f.after?.research,reasons:f.reasons}))}));
