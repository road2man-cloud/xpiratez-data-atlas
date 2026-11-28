// Late recruitment from a concrete V2 research state, then deterministic training.
// The ledger uses ONLY recorded event income less indexed procurement expenses.
// It is a conditional partial-budget model, not a campaign solvency certificate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createForwardResearch,replayForwardNode} from './atlas-overcap-forward-research-v2.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {createGrowthReplay,member} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';

const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const stem='tools/data/overcap-forward-research-v2-goal-str_personal_labs';
const graphPath=arg('graph',stem+'.json.gz'),summaryPath=arg('summary',stem+'-summary.json');
const graph=read(graphPath),manifest=read(summaryPath),graphSha=sha(fs.readFileSync(graphPath));
assert.equal(graph.schema,'ATLAS_FORWARD_CAMPAIGN_RESEARCH_V2');
assert.equal(graphSha,manifest.artifactSha256);assert.deepEqual(graph.inputs,manifest.inputs);
assert.equal(graph.actualGameCertified,false);
const dataPath='public/data/soldiers-modern-index.json',supplyPath='tools/data/overcap-forward-supply-catalog-v2.json',birthPath='public/data/soldier-acquisition-progression-20261102.json';
assert.equal(sha(fs.readFileSync(dataPath)),graph.inputs.rulesSha256);
assert.equal(sha(fs.readFileSync(supplyPath)),graph.inputs.supplySha256);
for(const [p,h] of Object.entries(graph.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')),h,p);
const data=read(dataPath);data.forwardSupply=read(supplyPath);data.originRows=read(birthPath).rows;
assert.equal(data.meta.source.metadataSha256,graph.sourceMetadataSha256);
const engine=createForwardResearch(data,{maxMonth:graph.budget.maxMonth}),growth=createGrowthReplay(data);
const goal=arg('goal','STR_SCHOOL_OF_HARD_KNOCKS'),rule=growth.rules.get(goal);
const profile=data.profiles.find(p=>p.id==='manufacture:STR_HERO_RECRUITMENT');
assert(rule&&profile&&profile.cost===0);
assert(rule.allowedSoldierTypes.includes(profile.soldierType)&&rule.allowsLiveSoldiers&&!rule.createsClone&&!rule.producedItem&&!rule.reset&&!rule.resetRank&&!rule.removeTransformations.length);
assert(deterministicRule(rule,[growth.bodies.get(rule.producedSoldierType||profile.soldierType)]));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
const cost=x=>{assert(Number.isSafeInteger(x)&&x>=0);return x;};
const settled=w=>!w.pendingFree&&!w.forwardDeliveries?.length;
const catalog=data.forwardSupply;
function cashTrace(actions,w){
 assert.deepEqual(actions[0],graph.initialAction);
 assert(!actions.slice(1).some(a=>a.type==='externalInputs'||a.type==='advanceMonth'));
 assert.equal(w.month,0);assert.equal(w.funds,0);
 let income=0,spend=0,balance=0;
 const lines=[],events=new Set();
 for(const [i,a] of actions.entries()){
  let credit=0,debit=0;
  if(a.type==='eventResearch'||a.type==='sourceEventItems'){
   const e=catalog.events[a.event],s=e?.scripts.find(s=>s.script===a.script);
   assert(e&&s&&!events.has(e.id)&&w.generatedEvents[e.id]===1);
   assert(s.otherConditions?.minFunds==null&&s.otherConditions?.maxFunds==null,'cash-dependent event not modeled');
   events.add(e.id);credit=cost(e.funds);
  }else if(a.type==='missionResearch'){
   const s=(data.missionResearchSources[a.research]||[]).find(m=>m.deployment===a.deployment)?.scripts.find(s=>s.script===a.script);
   assert(s&&s.otherConditions?.minFunds==null&&s.otherConditions?.maxFunds==null,'cash-dependent mission not modeled');
  }else if(a.type==='sourceBuySample'){
   const b=catalog.buys[a.id];assert(b&&Number.isSafeInteger(a.count)&&a.count>0);debit=cost(b.cost*a.count);
  }else if(a.type==='sourceBuildFacility')debit=cost(catalog.facilities[a.id].cost);
  else if(a.type==='sourceManufactureItem')debit=cost(catalog.recipes.find(r=>r.id===a.id).cost);
  if(credit||debit){income+=credit;spend+=debit;balance+=credit-debit;assert(balance>=0,'indexed cash deficit at action '+i);lines.push({index:i,action:a.type,source:a.event||a.id,credit,debit,balance});}
 }
 assert.equal(income,w.forwardEventFunds||0);assert.equal(spend,w.forwardProcurementSpend||0);
 return {income,spend,balance,lines};
}
function pick(w,root,predicate){
 const option=engine.options(w,root).choices.find(o=>predicate(o.action));assert(option,'no eligible source action');
 const r=engine.apply(w,option.action,root);return {world:r.world,action:option.action,evidence:option.evidence};
}
function produce(n){
 const prefix=replayForwardNode(data,graph,n.id);
 let w=prefix.world;const actions=[...prefix.actions],evidence=[...prefix.evidence],suffix=[];
 assert(settled(w)&&w.month===0&&rule.requires.every(k=>active(w,k)));
 assert.deepEqual(actions[0],graph.initialAction);assert.equal(actions[1].id,n.firstRoot);
 function append(r){w=r.world;actions.push(r.action);evidence.push(r.evidence);suffix.push({action:r.action,evidence:r.evidence,stateHash:exactStateHash(w)});}
 if(!profile.requires.every(k=>active(w,k))||Object.entries(profile.acquisitionRequiredItems).some(([k,v])=>qty(w,k)<v)){
  append(pick(w,n.firstRoot,a=>a.type==='eventResearch'&&a.research==='STR_HERO'&&a.event==='STR_KNOCK_KNOCK_PENITENT'));
 }
 let i=0;while(!settled(w)){assert(++i<=20,'delivery/free cascade limit');append(pick(w,n.firstRoot,a=>a.type==='freeResearch'||a.type==='sourceResearchDelivery'));}
 assert(profile.requires.every(k=>active(w,k))&&profile.requiresBaseFunc.every(k=>w.baseFunctions.has(k)));
 const budget=cashTrace(actions,w);
 const birth={type:'recruit',soldier:'origin',profile:profile.id,band:'min'};
 const b=applyOriginWitnessStep(w,birth,data);assert(b.ok,b.reason);
 for(const [k,v] of Object.entries(profile.acquisitionRequiredItems))assert.equal(qty(b.world,k),qty(w,k)-v);
 w=b.world;actions.push(birth);suffix.push({action:birth,evidence:{kind:'SOURCE_BACKED_RECRUIT',profile:profile.id},stateHash:exactStateHash(w)});
 const before=growth.finish(w);
 // The shared forward engine intentionally stores income/spend apart from
 // funds. Reconcile ONCE, only after validating each preceding cash delta.
 assert.equal(w.funds,0);assert(budget.balance>=cost(rule.cost),'insufficient tracked budget');
 assert(!w.forwardCareerBudgetSettlement);
 const settlement={type:'conditionalIndexedBudgetSettlement',income:budget.income,procurementSpend:budget.spend,balance:budget.balance,assumption:true};
 w=structuredClone(w);w.funds=budget.balance;w.forwardCareerBudgetSettlement=key(budget);
 actions.push(settlement);suffix.push({action:settlement,evidence:budget,stateHash:exactStateHash(w)});
 assert(settled(w)&&rule.requires.every(k=>active(w,k))&&rule.requiresBaseFunc.every(k=>w.baseFunctions.has(k)));
 const tr={type:'transform',soldier:'origin',transform:goal};
 const oldItems={...w.items},oldFunds=w.funds;
 w=growth.apply(w,tr);
 assert.equal(w.funds,oldFunds-rule.cost);for(const [k,v] of Object.entries(rule.requiredItems||{}))assert.equal(qty(w,k),(oldItems[k]||0)-v);
 assert.equal(member(w).state.history.get(goal),1);
 const after=growth.finish(w);
 actions.push(tr);suffix.push({action:tr,evidence:{kind:'DIRECT_RULE_AND_STOCK_REPLAY',rule:goal,cost:rule.cost},stateHash:exactStateHash(w)});
 return {id:'FORWARD-TRAIN-V2:'+key([graphSha,n.id,actions]),root:n.firstRoot,nodeId:n.id,prefixStateHash:prefix.stateHash,labDepth:n.researchDepth,profile:profile.id,goal,actions,prefixEvidence:evidence.slice(0,prefix.evidence.length),suffix,budget,trainingCost:rule.cost,remainingTrackedFunds:w.funds,before,after,statDelta:Object.fromEntries(STAT_KEYS.map((k,i)=>[k,after.vector[i]-before.vector[i]])),capDelta:Object.fromEntries(STAT_KEYS.map((k,i)=>[k,after.capVector[i]-before.capVector[i]])),history:[...member(w).state.history],finalWorldHash:exactStateHash(w),status:'CONDITIONAL_SOURCE_BACKED_TRAINING',finalAdmission:false,actualGameCertified:false};
}
const candidates=graph.nodes.filter(n=>n.firstRoot&&n.month===0&&!n.pendingFree&&!n.pendingDeliveries.length&&rule.requires.every(k=>n.researched.includes(k)&&!n.disabled.includes(k))).sort((a,b)=>b.researchDepth-a.researchDepth||a.id-b.id);
const limit=Number(arg('limit','16'));assert(Number.isSafeInteger(limit)&&limit>=1&&limit<=100);
const rows=[],blocked=[];
for(const n of candidates.slice(0,limit)){try{rows.push(produce(n));}catch(e){blocked.push({nodeId:n.id,root:n.firstRoot,reason:e.message});}}
const groups=new Set(rows.map(r=>key([r.after.body,r.after.raw,r.after.bonus,r.after.capVector,r.history])));
const report={schema:'ATLAS_FORWARD_LATE_RECRUIT_TRAINING_V2',graphSha256:graphSha,graphPath,sourceMetadataSha256:graph.sourceMetadataSha256,acquisitionSha256:sha(fs.readFileSync(birthPath)),goal,scope:'Concrete first-root research replay, event delivery, zero-cost recruitment, and deterministic training. Indexed cash only, no arbitrary external funds. Same-month scenario, unmodeled calendar, maintenance, salaries and mission/event outcomes remain conditional.',summary:{candidates:candidates.length,attempted:rows.length+blocked.length,applied:rows.length,blocked:blocked.length,distinctTrainingOutcomes:groups.size,finalAdmission:0},rows,blocked,normalizationComplete:false,actualGameCertified:false};
const file='tools/data/overcap-forward-late-recruit-training-v2-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(file))assert.deepEqual(read(file),report);else fs.writeFileSync(file,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({file,summary:report.summary,first:rows[0]?{id:rows[0].id,root:rows[0].root,node:rows[0].nodeId,labDepth:rows[0].labDepth,budget:rows[0].budget,trainingCost:rows[0].trainingCost,remaining:rows[0].remainingTrackedFunds,statDelta:rows[0].statDelta,capDelta:rows[0].capDelta}:null,blocked:blocked.slice(0,5)}));
