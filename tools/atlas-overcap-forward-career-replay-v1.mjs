// Chronological career replay adapter. One explicit difficulty at game start,
// one tracked cash ledger, no target-derived external stock. Conditional model.
import assert from 'node:assert/strict';
import {foundationWorld,applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {createForwardResearch} from './atlas-overcap-forward-research-v2.mjs';
import {createGrowthReplay,member} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[];
const qty=(w,k)=>Number(w.items[k]||0);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const settled=w=>!w.pendingFree&&!w.forwardDeliveries?.length;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createCareerReplay(data,{maxMonth=3}={}){
 const engine=createForwardResearch(data,{maxMonth}),growth=createGrowthReplay(data);
 const c=data.forwardSupply,recipes=new Map(c.recipes.map(r=>[r.id,r]));
 const profiles=new Map(data.profiles.map(p=>[p.id,p]));
 const allowedResearch=new Set(['research','repeatResearch','freeResearch','eventResearch','missionResearch','sourceEventItems','sourceResearchDelivery','sourceBuySample','sourceBuildFacility','sourceManufactureItem','advanceMonth']);
 function eventScript(a){
  if(a.type==='sourceEventItems')return c.events[a.event]?.scripts.find(s=>s.script===a.script);
  if(a.type==='eventResearch')return arr(data.eventResearchSources?.[a.research]).find(e=>e.event===a.event)?.scripts.find(s=>s.script===a.script);
  if(a.type==='missionResearch')return arr(data.missionResearchSources?.[a.research]).find(e=>e.deployment===a.deployment)?.scripts.find(s=>s.script===a.script);
  return null;
 }
 function money(a,w){
  let delta=0;
  if(['eventResearch','sourceEventItems','missionResearch'].includes(a.type)){
   const s=eventScript(a);assert(s,'Unknown event/mission script');
   const x=s.otherConditions||{};
   assert(w.difficulty>=(x.minDifficulty??0)&&w.difficulty<=(x.maxDifficulty??4),'Difficulty mismatch');
   // Indexed partial cash is not actual global funds. Never use it to
   // declare a cash-gated event eligible.
   assert(x.minFunds==null&&x.maxFunds==null,'Cash-dependent script not modeled');
   if(a.type!=='missionResearch')delta=c.events[a.event].funds;
  }else if(a.type==='sourceBuySample')delta=-c.buys[a.id].cost*a.count;
  else if(a.type==='sourceBuildFacility')delta=-c.facilities[a.id].cost;
  else if(a.type==='sourceManufactureItem')delta=-recipes.get(a.id).cost;
  assert(Number.isSafeInteger(delta),'Unknown cost');return delta;
 }
 function start(difficulty){
  const context={type:'campaignContext',difficulty,assumption:true};
  const x=applyOriginWitnessStep(foundationWorld(),context,data);assert(x.ok,x.reason);
  const y=applyOriginWitnessStep(x.world,engine.init,data);assert(y.ok,y.reason);
  return {world:y.world,root:null,actions:[context,engine.init],trace:[],income:0,procurement:0,careerSpend:0};
 }
 function research(s,a){
  assert(allowedResearch.has(a.type),'Unsupported forward action');
  const option=engine.options(s.world,s.root).choices.find(x=>equal(x.action,a));assert(option,'Not enabled in this exact campaign state: '+JSON.stringify(a));
  const delta=money(a,s.world);assert(s.world.funds+delta>=0,'Indexed balance deficit');
  const r=engine.apply(s.world,a,s.root);
  assert.equal(r.world.funds,s.world.funds,'Unexpected engine cash change');
  const w=r.world;w.funds+=delta;
  const income=s.income+Math.max(delta,0),procurement=s.procurement+Math.max(-delta,0);
  assert.equal(w.funds,income-procurement-s.careerSpend);
  return {...s,world:w,root:s.root||a.id,income,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:option.evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 function career(s,a){
  const w=s.world;assert(s.root&&settled(w),'Pending research reward or delivery');
  let rule=null,cost=0,required={};
  if(a.type==='recruit'){
   rule=profiles.get(a.profile);assert(rule,'Unknown profile');assert(rule.sourceType!=='event','Event birth requires separate source adapter');
   assert(Number.isSafeInteger(rule.cost)&&rule.cost>=0,'Unknown acquisition cost');cost=rule.cost;required=rule.acquisitionRequiredItems||{};
  }else if(a.type==='transform'){
   rule=growth.rules.get(a.transform);assert(rule,'Unknown transformation');
   const m=member(w),b=growth.bodies.get(rule.producedSoldierType||m?.state.soldierType);
   assert(b&&rule.allowsLiveSoldiers&&!rule.createsClone&&!rule.producedItem&&deterministicRule(rule,[b]),'Non-deterministic/dead/clone/item transition unsupported');
   assert(Number.isSafeInteger(rule.cost)&&rule.cost>=0,'Unknown transformation cost');cost=rule.cost;required=rule.requiredItems||{};
  }else if(a.type==='conditionalCapGrowth'){
   assert(a.assumption===true,'Growth assumption must be explicit');
  }else if(a.type==='conditionalPromotion'||a.type==='conditionalMedal'){
   throw Error('Promotion/commendation requires source-backed combat chronology');
  }else throw Error('Unsupported career action: '+a.type);
  if(rule){
   assert(arr(rule.requires).every(k=>active(w,k)),'Required research inactive');
   assert(arr(rule.requiresBaseFunc).every(k=>w.baseFunctions.has(k)),'Missing facility function');
   assert(Object.entries(required).every(([k,n])=>qty(w,k)>=n),'Missing physical item');
   assert(w.funds>=cost,'Insufficient indexed cash');
  }
  const next=growth.apply(w,a);
  assert.equal(next.funds,w.funds-cost,'Career cash mismatch');
  for(const [k,n] of Object.entries(required))assert.equal(qty(next,k),qty(w,k)-n,'Career stock mismatch '+k);
  const careerSpend=s.careerSpend+cost;assert.equal(next.funds,s.income-s.procurement-careerSpend);
  return {...s,world:next,careerSpend,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(next),balance:next.funds,conditional:true,body:member(next)?.state.soldierType||null}]};
 }
 function replay(actions,difficulty){
  let s=start(difficulty);assert(equal(actions[0],engine.init),'Unknown campaign start');
  for(const a of actions.slice(1)){
   if(a.type==='conditionalIndexedBudgetSettlement'){
    assert.equal(a.income,s.income);assert.equal(a.procurementSpend,s.procurement);assert.equal(a.balance,s.world.funds);continue;
   }
   s=allowedResearch.has(a.type)?research(s,a):career(s,a);
  }
  return s;
 }
 function missing(s,req){
  if(!req)return {};
  const w=s.world;return {research:arr(req.research).filter(k=>!active(w,k)),functions:arr(req.functions).filter(k=>!w.baseFunctions.has(k)),items:Object.fromEntries(Object.entries(req.items||{}).map(([k,n])=>[k,Math.max(0,n-qty(w,k))]).filter(([,n])=>n)),funds:req.cost==null?null:Math.max(0,req.cost-w.funds)};
 }
 return {start,research,career,replay,missing,options:s=>engine.options(s.world,s.root).choices,settled:s=>settled(s.world),finish:s=>growth.finish(s.world)};
}
