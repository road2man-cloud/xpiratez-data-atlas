// V150b: normalize legacy careers by shared, chronological forward prefixes.
// Legacy research, externalInputs, and expected stats are NEVER applied.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {readTrainingLedger,hashLedger} from './overcap-training-ledger-store.mjs';
import {createForwardResearch,replayForwardNode} from './atlas-overcap-forward-research-v2.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {createGrowthReplay,member} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const stem='tools/data/overcap-forward-research-v2-chain-foundation-d';
const graphPath=arg('graph',stem+'.json.gz'), summaryPath=arg('summary',stem+'-summary.json');
// Large remote artifacts can be read from their verified Git object without
// extracting a second multi-megabyte working-tree copy. Never parse an empty file.
const graphBlob=arg('graph-blob',null);
assert(!graphBlob||/^[a-f0-9]{40}$/.test(graphBlob));
const graphBytes=graphBlob?execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'cat-file','blob',graphBlob],{maxBuffer:64*1024*1024}):fs.readFileSync(graphPath);
const graph=JSON.parse(gunzipSync(graphBytes)),manifest=read(summaryPath),graphSha=sha(graphBytes);
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
const unlockBy=new Map(),freeBy=new Map();
for(const [src,r] of pairs(data.researchRules)){
 for(const k of [...arr(r.getOneFree),...pairs(r.getOneFreeProtected).flatMap(([,v])=>arr(v))]){
  if(!freeBy.has(k))freeBy.set(k,[]);freeBy.get(k).push(src);
 }
}
const supply=data.forwardSupply;
const recipes=new Map(supply.recipes.map(r=>[r.id,r]));
const eventScripts=new Map(),missionScripts=new Map();
for(const [id,sources] of pairs(data.eventResearchSources))for(const e of arr(sources))for(const s of arr(e.scripts))eventScripts.set(JSON.stringify([id,e.event,s.script]),s);
for(const [id,sources] of pairs(data.missionResearchSources))for(const e of arr(sources))for(const s of arr(e.scripts))missionScripts.set(JSON.stringify([id,e.deployment,s.script]),s);
const initBudget=()=>({balance:0,min:0,allowed:[0,1,2,3,4],unknown:[],monthChanged:false});
function budgetStep(b,a){
 let delta=0,script=null,unknown=[...b.unknown],allowed=[...b.allowed];
 if(a.type==='eventResearch'||a.type==='sourceEventItems'){
  const e=supply.events[a.event];assert(e&&Number.isSafeInteger(e.funds));
  delta=e.funds;script=a.type==='eventResearch'?eventScripts.get(JSON.stringify([a.research,a.event,a.script])):e.scripts.find(s=>s.script===a.script);
 }else if(a.type==='missionResearch')script=missionScripts.get(JSON.stringify([a.research,a.deployment,a.script]));
 else if(a.type==='sourceBuySample'){assert(supply.buys[a.id]);delta=-supply.buys[a.id].cost*a.count;}
 else if(a.type==='sourceBuildFacility'){assert(supply.facilities[a.id]);delta=-supply.facilities[a.id].cost;}
 else if(a.type==='sourceManufactureItem'){assert(recipes.has(a.id));delta=-recipes.get(a.id).cost;}
 if(['eventResearch','sourceEventItems','missionResearch'].includes(a.type)){
  if(!script)unknown.push('MISSING_SCRIPT:'+JSON.stringify(a));
  else{
   const c=script.otherConditions||{};
   allowed=allowed.filter(d=>d>=(c.minDifficulty??0)&&d<=(c.maxDifficulty??4));
   if(c.minFunds!=null||c.maxFunds!=null)unknown.push('CASH_DEPENDENT_SCRIPT:'+a.script);
  }
 }
 assert(Number.isSafeInteger(delta));const balance=b.balance+delta;
 return {balance,min:Math.min(b.min,balance),allowed,unknown,monthChanged:b.monthChanged||a.type==='advanceMonth'};
}
const graphBudget=[initBudget()];
for(const n of graph.nodes.slice(1)){const e=graph.edges[n.parent];assert(e.from<n.id);graphBudget[n.id]=budgetStep(graphBudget[e.from],e.action);}
const budgetOK=(b,context)=>b.min>=0&&!b.unknown.length&&(context?b.allowed.includes(context.difficulty):b.allowed.length>0);
const budgetEligibleNodes=nodes.filter(n=>budgetOK(graphBudget[n.id],null)).length;
function sourceRoutes(id){
 const item=data.itemSupply?.[id],fixed=[],random=[],manufacture=[],other=[];
 if(item){
  for(const g of arr(item.researchGrants))fixed.push({type:'LAB_TRANSFER',research:g.research,count:g.count});
  for(const e of arr(item.eventGrants)){
   const row={event:e.event,grants:e.grants,scripts:arr(e.scriptRoutes).map(s=>({script:s.script,positive:s.researchPositive,negative:s.researchNegative,firstMonth:s.firstMonth})),catalogFixed:supply.events[e.event]?.fixed?.[id]||0};
   (arr(e.grants).every(g=>['every','everyMulti'].includes(g.mode))?fixed:random).push({type:'EVENT',...row});
  }
  for(const m of arr(item.manufacture))manufacture.push({type:'DETERMINISTIC',...m,inCatalog:recipes.has(m.id)});
  for(const m of arr(item.randomManufacture))random.push({type:'MANUFACTURE',...m});
  if(item.buyCost>0)fixed.push({type:'BUY',cost:item.buyCost,requires:item.buyRequires,functions:item.buyRequiresBaseFunc,inCatalog:!!supply.buys[id]});
  if(item.mapLoot?.sourceCount)other.push({type:'MAP_LOOT',...item.mapLoot});
 }
 return {id,indexed:!!item,fixed,random,manufacture,other,status:fixed.length||manufacture.length?'INDEXED_SOURCE_NEEDS_REPLAY':random.length||other.length?'CONDITIONAL_SOURCE_ADAPTER_REQUIRED':'NO_SOURCE_IN_CURRENT_ITEM_INDEX'};
}
for(const [src,r] of pairs(data.researchRules))for(const dest of arr(r.unlocks)){if(!unlockBy.has(dest))unlockBy.set(dest,[]);unlockBy.get(dest).push(src);}
function weightsFor(ids,req){
 const weights=new Map(),queue=ids.map(k=>[k,0]);
 for(const item of Object.keys(req.items)){
  const source=data.itemSupply?.[item];
  for(const x of arr(source?.researchGrants))if(x.research)queue.push([x.research,1]);
  for(const x of arr(source?.eventGrants))for(const script of arr(supply.events?.[x.event]?.scripts))for(const k of arr(script.researchPositive))queue.push([k,1]);
 }
 for(let i=0;i<queue.length;i++){
  const [k,d]=queue[i],v=1000/Math.pow(3,d);
  if((weights.get(k)||0)>=v)continue;weights.set(k,v);
  if(d>=6)continue;
  const r=data.researchRules[k]||{};
  const deps=[...arr(r.requires),...arr(r.dependencies),...arr(unlockBy.get(k)),...arr(freeBy.get(k))];
  // Sample sources may themselves require research. A source is a heuristic
  // alternative, never a mandatory dependency or a synthetic item grant.
  if(r.needItem){const item=r.neededItem||k,source=data.itemSupply?.[item];
   for(const x of arr(source?.researchGrants))if(x.research)deps.push(x.research);
   for(const x of arr(source?.eventGrants))for(const script of arr(supply.events?.[x.event]?.scripts))deps.push(...arr(script.researchPositive));
   const buy=supply.buys[item];if(buy)deps.push(...arr(buy.requires));
   for(const recipe of supply.recipes)if(recipe.outputs?.[item])deps.push(...arr(recipe.requires));
  }
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
function directBlockers(w,req){
 const seen=new Set(),leaves=new Map();
 function visit(k,depth=0){
  if(active(w,k)||seen.has(k)||depth>10)return;seen.add(k);
  const r=data.researchRules[k];if(!r){leaves.set(k,{kind:'UNKNOWN_RESEARCH'});return;}
  if(w.disabled.has(k)){leaves.set(k,{kind:'DISABLED_RESEARCH'});return;}
  const dep=arr(r.dependencies).filter(x=>!active(w,x)),required=arr(r.requires).filter(x=>!active(w,x));
  if(r.needItem&&qty(w,r.neededItem||k)<1)leaves.set(k,{kind:'SAMPLE_REQUIRED',item:r.neededItem||k});
  for(const x of [...dep,...required])visit(x,depth+1);
  if(!dep.length&&!required.length&&!leaves.has(k))leaves.set(k,{kind:'SOURCE_OR_LAB_GATE'});
 }
 for(const k of req.research)visit(k);
 return [...leaves].map(([id,v])=>({id,...v}));
}
function optionScore(o,w,weights,req){
 const a=o.action,e=o.evidence||{},id=a.research||a.id;
 if(a.type==='freeResearch'||a.type==='sourceResearchDelivery')return 10000+(weights.get(id)||0);
 let v=0;
 if(['research','eventResearch','missionResearch'].includes(a.type)&&!active(w,id))v=weights.get(id)||0;
 if(a.type==='repeatResearch'||a.type==='research'){
  const r=data.researchRules[a.id]||{};
  const targets=[...arr(r.getOneFree),...pairs(r.getOneFreeProtected).filter(([k])=>active(w,k)).flatMap(([,v])=>arr(v))];
  v+=Math.max(0,...targets.filter(k=>!active(w,k)).map(k=>weights.get(k)||0))*0.8;
 }
 const need=new Map(Object.keys(missing(w,req).items).map(k=>[k,1000]));
 for(const [k,weight] of weights){const r=data.researchRules[k];if(r?.needItem&&!active(w,k)&&qty(w,r.neededItem||k)<1)need.set(r.neededItem||k,Math.max(need.get(r.neededItem||k)||0,weight));}
 const itemValue=items=>Math.max(0,...pairs(items).map(([k])=>need.get(k)||0));
 if(a.type==='sourceBuySample')v+=need.get(a.id)||0;
 if(a.type==='sourceManufactureItem')v+=itemValue(e.outputs);
 if(a.type==='sourceEventItems')v+=itemValue(e.items);
 if(a.type==='sourceBuildFacility')v+=Math.max(0,...arr(e.provides).map(k=>req.functions.includes(k)?1000:Math.max(0,...[...weights].filter(([id])=>!active(w,id)&&arr(data.researchRules[id]?.requiresBaseFunc).includes(k)).map(([,value])=>value))));
 // Timing is explored only when there is no more relevant supported action.
 if(a.type==='advanceMonth')v=0.01;
 return v;
}
const limit=Number(arg('steps','18'));assert(Number.isSafeInteger(limit)&&limit>=0&&limit<=50);
const frontiers=[],prefixes=new Map();
for(const a of acquisitions.values()){
 const req=a.requirements,weights=weightsFor(req.research,req);
 for(const root of roots){
  const candidates=nodes.filter(n=>n.firstRoot===root&&budgetOK(graphBudget[n.id],a.context)).map(n=>({n,score:nodeScore(n,weights,req)})).filter(x=>Number.isFinite(x.score)).sort((x,y)=>y.score-x.score||x.n.id-y.n.id);
  if(!candidates.length){frontiers.push({acquisition:a.id,root,status:'OPEN_NO_COMPATIBLE_GRAPH_STATE'});continue;}
  const n=candidates[0].n,p=prefix(n);let world=p.world,budget=structuredClone(graphBudget[n.id]);
  prefixes.set(n.id,{nodeId:n.id,root,stateHash:p.stateHash,actions:p.actions,evidence:p.evidence});
  const before=missing(world,req),beforeLeaves=directBlockers(world,req),suffix=[],seen=new Set([exactStateHash(world)]),failures=[];
  const direct=sorted(req.research.flatMap(k=>arr(data.researchRules[k]?.dependencies)));
  const beforeDirect=direct.filter(k=>active(world,k));
  // Only concrete enabled forward edges. A bounded heuristic, not an impossibility proof.
  for(let i=0;i<limit;i++){
   const m=missing(world,req);
   if(settled(world)&&!m.research.length&&!m.functions.length&&!Object.keys(m.items).length)break;
   const options=engine.options(world,root).choices.map(o=>({o,score:optionScore(o,world,weights,req)})).filter(x=>x.score>0).sort((x,y)=>y.score-x.score||JSON.stringify(x.o.action).localeCompare(JSON.stringify(y.o.action)));
   let selected=false;
   for(const {o} of options){
    try{
     const nextBudget=budgetStep(budget,o.action);
     if(!budgetOK(nextBudget,a.context))continue;
     const r=engine.apply(world,o.action,root),h=exactStateHash(r.world);
     if(seen.has(h))continue;
     if(req.research.some(k=>r.world.disabled.has(k)))continue;
     seen.add(h);world=r.world;budget=nextBudget;suffix.push({action:o.action,evidence:o.evidence,stateHash:h,conditional:!!r.conditional,indexedBalance:budget.balance});selected=true;break;
    }catch(err){failures.push({action:o.action,reason:String(err.message)});}
   }
   if(!selected)break;
  }
  const after=missing(world,req),afterDirect=direct.filter(k=>active(world,k)),afterLeaves=directBlockers(world,req),reasons=[];
  if(after.research.length)reasons.push('RESEARCH_NOT_REACHED');
  if(after.disabled.length)reasons.push('RESEARCH_EXCLUSION');
  if(after.functions.length)reasons.push('FACILITY_NOT_REACHED');
  if(Object.keys(after.items).length)reasons.push('ITEM_SOURCE_OR_QUANTITY_NOT_REACHED');
  if(!settled(world))reasons.push('PENDING_REWARD_OR_DELIVERY');
  // No fake initial cash, no detached context injection, and no legacy branch hash
  // interpreted as a real campaign choice. Future budget/context adapters must
  // replay these exact prefixes, then apply each career step on that same world.
  if(a.context&&world.difficulty!==a.context.difficulty)reasons.push('CAMPAIGN_CONTEXT_NOT_BOUND_TO_ENGINE');
  if(req.cost===null)reasons.push('ACQUISITION_COST_UNKNOWN');
  else if(budget.balance<req.cost)reasons.push('INSUFFICIENT_INDEXED_BALANCE');
  else if(world.funds<req.cost)reasons.push('CASH_NOT_SETTLED');
  let recruited=null;
  if(!reasons.length){
   try{const w=growth.apply(structuredClone(world),a.birth);recruited={stateHash:exactStateHash(w),body:member(w).state.soldierType,action:a.birth};}
   catch(err){reasons.push('RECRUIT_REPLAY_REJECTED');failures.push({action:a.birth,reason:String(err.message)});}
  }
  // Never admit any path just because a research set or a legacy stat vector matches.
  frontiers.push({acquisition:a.id,root,nodeId:n.id,prefixStateHash:p.stateHash,before,after,beforeDirect,afterDirect,beforeLeaves,afterLeaves,suffix,finalStateHash:exactStateHash(world),funds:world.funds,indexedBudget:budget,trackedEventIncome:world.forwardEventFunds||0,trackedProcurement:world.forwardProcurementSpend||0,failures,reasons,recruited,status:recruited?'CONDITIONAL_RECRUITMENT_ONLY':'OPEN_ACQUISITION',finalAdmission:false,actualGameCertified:false});
 }
}
const reasonCounts={};for(const g of acquisitions.values()){const f=frontiers.filter(x=>x.acquisition===g.id);for(const reason of sorted(f.flatMap(x=>x.reasons||[])))reasonCounts[reason]=(reasonCounts[reason]||0)+g.goalIds.length;}
const sourceIds=sorted([...acquisitions.values()].flatMap(a=>[...Object.keys(a.requirements.items),...a.requirements.research.flatMap(id=>{const r=data.researchRules[id];return r?.needItem?[r.neededItem||id]:[];})]));
const sourcePlan=sourceIds.map(sourceRoutes);
const summary={budgetEligibleNodes,sourcePlanItems:sourcePlan.length,sourcePlanUnindexed:sourcePlan.filter(s=>s.status==='NO_SOURCE_IN_CURRENT_ITEM_INDEX').length,legacyGoals:goals.length,careerGroups:groups.size,acquisitionGroups:acquisitions.size,graphNodes:graph.nodes.length,sharedPrefixes:prefixes.size,frontiers:frontiers.length,generatedForwardEdges:frontiers.reduce((n,f)=>n+(f.suffix?.length||0),0),distinctGeneratedStates:new Set(frontiers.flatMap(f=>arr(f.suffix).map(s=>s.stateHash))).size,directDependenciesGained:frontiers.reduce((n,f)=>n+arr(f.afterDirect).filter(k=>!arr(f.beforeDirect).includes(k)).length,0),researchActions:frontiers.flatMap(f=>arr(f.suffix)).filter(s=>['research','repeatResearch','freeResearch','eventResearch','missionResearch'].includes(s.action.type)).length,conditionalRecruitments:frontiers.filter(f=>f.recruited).length,careerReapplied:0,distinctRecoveredOutcomes:0,actualGameCertified:0,finalAdmission:0,reasonCounts};
const result={schema:'ATLAS_OVERCAP_FORWARD_BULK_NORMALIZATION_V3',scope:'Shared forward prefixes, bounded acquisition continuation, and nonnegative indexed event/ procurement ledger with compatible script difficulty. Not a complete economy or actual campaign.',graphPath,graphBlob,graphSha256:graphSha,trainingHash:hashLedger(ledger),sourceMetadataSha256:ledger.sourceMetadataSha256,acquisitionSha256:sha(fs.readFileSync(birthPath)),summary,sourcePlan,goals,groups:[...groups.values()],acquisitions:[...acquisitions.values()].map(a=>({...a,groupIds:[...a.groupIds]})),prefixes:[...prefixes.values()],frontiers,normalizationComplete:false,actualGameCertified:false};
const out=arg('out','tools/data/overcap-forward-bulk-normalization-v3-'+key(result).slice(0,20)+'.json.gz');
if(fs.existsSync(out))assert.deepEqual(read(out),result);else fs.writeFileSync(out,gzipSync(JSON.stringify(result)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,profiles:[...acquisitions.values()].map(a=>({profile:a.profile,goals:a.goalIds.length,groups:a.groupIds.size})),frontiers:frontiers.map(f=>({root:f.root,node:f.nodeId,edges:f.suffix?.length,missing:f.after?.research,reasons:f.reasons}))}));
