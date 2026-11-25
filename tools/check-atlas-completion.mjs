import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,loadCareerRows,completionScope,readResearchWitness} from '../public/branch-soldier-atlas-career-core.js';
import {admitVerified,normalizedCombination} from './atlas-career-completion-core.mjs';
import {key} from './population-research-career-core.mjs';
import {digest} from './final-combination-production.mjs';
const gz=f=>JSON.parse(gunzipSync(fs.readFileSync('public/data/'+f+'.json.gz')));
const modern=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json')),db=gz('branch-soldier-results'),c=completionScope(modern,db);
const all=ledgers.flatMap(l=>project(l,gz(l.file),db.sourceMetadataSha256).rows);
assert.equal(all.length,c.summary.candidateRows);
assert.equal(new Set(all.map(r=>key([r.origin,r.branch,r.hash]))).size,c.summary.uniqueEvidence);
assert.equal(all.filter(r=>c.classifications[r.source][r.id].traceHashVerified).length,c.summary.traceVerified);
assert.equal(c.rows.length,c.summary.completeCombinations);
const final=await loadCareerRows(modern,db);
assert.deepEqual(final.errors,[]);assert.equal(final.rows.length,c.rows.length);
assert(final.rows.every(r=>r.complete));
assert.equal(admitVerified({row:all[0],raw:{completionProof:{kind:'GAMEPLAY_REPLAY'}},db,classification:{traceHashVerified:true}}),null);
const t=c.terminalRule;
assert.equal(t.status,'RULES_AND_PRESERVED_ENGINE_EXTRACTED');
const {fingerprint,...source}=t;assert.equal(key(source),fingerprint);
assert(t.targets.length>=5);
for(const target of t.targets){assert.equal(target.stages.at(-1).winCutscene,target.terminalCutscene);assert(!target.stages.at(-1).nextStage);assert(target.researchGoals.every(id=>modern.researchRules[id]));}
const standard=t.targets.filter(r=>r.kind==='FINAL_DESTINATION');assert(standard.every(r=>r.stages.at(-1).id==='STR_CHECKMATE'));
const a=gz('soldier-population-missing-origin-career'),idx=gz('soldier-population-missing-origin-career-index'),l=ledgers.find(x=>x.key==='missingbirth');
const rows=new Map(project(l,a,db.sourceMetadataSha256).rows.map(r=>[r.id,r]));
let ready=0,advanced=0;
for(const r of Object.values(a.terminalResearch.records)){
 if(!r.suffixHash)continue;
 const id='MISSCAR:'+r.graph+':'+r.to,row=rows.get(id);
 assert(row);const witness=readResearchWitness(idx,row,db.sourceMetadataSha256);
 assert.equal(key(witness.fullActions),row.hash);
 const n=a.graphs[r.graph].nodes[r.to];assert.equal(n.stateHash,r.stateHash);
 advanced++;if(r.status==='CONDITIONAL_TARGET_RESEARCH_READY'){const goal=t.targets.find(x=>x.id===r.target);assert.deepEqual(r.remaining,[]);assert(goal.researchGoals.every(k=>r.achieved.includes(k)));ready++;}
}
assert.equal(advanced,a.terminalResearch.advanced);
assert.equal(ready,a.terminalResearch.ready);
const supply=a.terminalSupply,plans=Object.values(supply.plans).filter(r=>r.plan);
const {fingerprint:sourceFingerprint,...supplySource}=supply.sourceEvidence;
assert.equal(key(supplySource),sourceFingerprint);
let terminalPlans=0,surgeryPlans=0,open=0,resourceResearch=0;
for(const r of plans){
 const p=r.plan,{planHash,...rest}=p;
 assert.equal(key(rest),planHash);assert.equal(p.sourceFingerprint,sourceFingerprint);
 assert(a.graphs[r.graph]?.nodes[r.node]);
 const stock={...p.openingStock},functions=new Set(),obligationIds=new Set(p.obligations.map(o=>o.id));
 let dollars=0,hours=0,days=0;
 const add=(k,n)=>{assert(Number.isSafeInteger(n)&&n>=0);stock[k]=(stock[k]||0)+n;};
 const use=(k,n)=>{assert(Number.isSafeInteger(n)&&n>=0&&(stock[k]||0)>=n,'Resource underflow: '+k+' in '+p.target);stock[k]-=n;};
 for(const s of p.steps){
  if(s.type==='procurementObligation'){assert(obligationIds.has(s.id));add(s.asset,s.quantity);}
  else if(s.type==='facilityObligation'){assert(obligationIds.has(s.id));functions.add(s.function);}
  else if(s.type==='capacityObligation'){assert(obligationIds.has(s.id));}
  else if(s.type==='purchase'){assert((s.functions||[]).every(f=>functions.has(f)));add(s.asset,s.quantity);dollars+=s.cost;}
  else if(s.type==='manufacture'){assert((s.functions||[]).every(f=>functions.has(f)));for(const [k,n] of Object.entries(s.inputs))use(k,n);for(const [k,n] of Object.entries(s.outputs))add(k,n);dollars+=s.cost;hours+=s.hours;}
  else if(s.type==='buildFacility'){assert((s.requiresFunctions||[]).every(f=>functions.has(f)));for(const [k,n] of Object.entries(s.materials))use(k,n);for(const f of s.provides)functions.add(f);dollars+=s.cost;days+=s.days;}
  else if(s.type==='reserveForTarget')use(s.asset,s.quantity);
  else if(s.type==='reserveSurgery')dollars+=s.cost;
  else assert.fail('Unknown procurement step: '+s.type);
 }
 assert.equal(dollars,p.budget.dollars);assert.equal(hours,p.budget.manufacturingEngineerHours);assert.equal(days,p.budget.sequentialFacilityBuildDays);
 assert(p.openConditions.length>0);open+=p.obligations.length;
 if(r.kind==='terminal'){terminalPlans++;assert(rows.has('MISSCAR:'+r.graph+':'+r.node));}else surgeryPlans++;
}
for(const r of Object.values(supply.resourceResearch||{})){
 if(!r.suffixHash)continue;resourceResearch++;
 const row=rows.get('MISSCAR:'+r.graph+':'+r.to);assert(row);
 assert.equal(a.graphs[r.graph].nodes[r.to].stateHash,r.stateHash);
 assert.equal(key(readResearchWitness(idx,row,db.sourceMetadataSha256).fullActions),row.hash);
}
assert.equal(terminalPlans,c.terminalSupply.terminalPlans);assert.equal(surgeryPlans,c.terminalSupply.surgeryPlans);
assert.equal(open,c.terminalSupply.procurementObligations);assert.equal(resourceResearch,c.terminalSupply.resourceResearchAdvanced);
assert.equal(c.terminalSupply.completeCampaigns,0);
const economy=c.terminalEconomy;
if(economy){
 const {fingerprint,...src}=economy.sourceEvidence;assert.equal(key(src),fingerprint);
 assert.equal(economy.summary.produced,Object.keys(economy.records).length);
 assert.equal(economy.summary.completeCampaigns,0);
 for(const r of Object.values(economy.records)){
  const {planId,graph,node,origin,branch,routeId,actionHash,options,scheduleHash,...schedule}=r;
  assert.equal(key(schedule),scheduleHash);
  assert.equal(c.terminalSupply.plans[planId].plan.planHash,r.planHash);
  assert.equal(rows.get(routeId).hash,actionHash);
  assert.equal(r.sourceFingerprint,fingerprint);
  assert(r.openConditions.length>0);
  const b=r.budget;
  assert.equal(b.requiredCapital+b.income-b.expenses,b.closingCash);
  assert(r.monthly.every(m=>b.requiredCapital+m.balance>=0));
  assert(r.events.every(e=>b.requiredCapital+e.balance>=0));
  if(r.scenario.capitalMode==="FINITE_CONDITIONAL_SEED"){
   const seed=r.scenario.funding.seed,ledger=r.cashLedger;
   assert.equal(seed,b.requiredCapital);assert(ledger.length>0);
   let actual=seed,min=seed,last=-1,cost=0,rev=0;
   for(const e of ledger){
    assert(Number.isSafeInteger(e.delta)&&e.hour>=last);last=e.hour;
    assert(/^(monthlyFunding|facility:|purchase:|engineerHire|manufacture:|sale:)/.test(e.reason),"unrecognized cash source");
    actual+=e.delta;min=Math.min(min,actual);
    assert(actual>=0);assert.equal(actual,e.balance);
    if(e.delta<0)cost-=e.delta;else rev+=e.delta;
   }
   assert.equal(actual,b.closingCash);assert.equal(min,r.minimumActualBalance);
   assert.equal(cost,b.expenses);assert.equal(rev,b.income);
   assert.equal(ledger.filter(e=>e.reason==="monthlyFunding").length,r.monthly.length);
   assert.equal(ledger.filter(e=>e.reason.startsWith("sale:")).reduce((n,e)=>n+e.delta,0),b.sales);
   assert(Object.values(economy.records).some(x=>x.scheduleHash===r.scenario.funding.baselineScheduleHash&&!x.options.funding));
   assert(r.financing.reserveReached>=r.scenario.funding.reserve);
   assert(r.openConditions.includes("FINITE_SEED_AT_TERMINAL_RESEARCH_STATE_NOT_OBTAINED_FROM_GAME_START"));
  }
  assert.equal(r.monthly.reduce((n,m)=>n+m.engineers,0),b.payroll);
  assert.equal(r.monthly.reduce((n,m)=>n-m.facilities,0),b.netFacilities);
  assert.equal(r.events.at(-1).type,'targetReserved');
  assert(r.inventory[r.events.at(-1).asset]>=r.events.at(-1).quantity);
  const tiles=new Set();
  for(const f of r.layout)for(let y=f.y;y<f.y+f.sizeY;y++)for(let x=f.x;x<f.x+f.sizeX;x++){
   assert(x>=0&&x<6&&y>=0&&y<6);const k=x+':'+y;assert(!tiles.has(k));tiles.add(k);
  }
 }
 assert.equal(Math.min(...Object.values(economy.records).map(r=>r.budget.requiredCapital)),economy.summary.minimumCapital);
 if(economy.summary.finiteSeedSchedules!==undefined)assert.equal(economy.summary.finiteSeedSchedules,Object.values(economy.records).filter(r=>r.scenario.capitalMode==="FINITE_CONDITIONAL_SEED").length);
}
const early=c.earlyEconomy;
if(early){
 const {fingerprint,...src}=early.sourceEvidence;assert.equal(key(src),fingerprint);
 assert.equal(key(early.sourceHashes),key(c.sourceHashes));
 const records=Object.values(early.records);
 assert.equal(records.length,early.summary.scenarios);
 assert.equal(records.filter(r=>!r.blocked).length,early.summary.cashScheduled);
 assert.equal(early.summary.completeCampaigns,0);
 for(const r of records){
  const {planId,routeId,linkedPlanIds,origin,branch,graph,node,options,companionHash,...companion}=r;
  assert.equal(key(companion),companionHash);assert.equal(rows.get(routeId).hash,r.actionHash);
  assert.equal(r.sourceFingerprint,fingerprint);
  assert(linkedPlanIds.includes(planId));
  for(const id of linkedPlanIds){assert.equal(c.terminalSupply.plans[id].graph,graph);assert.equal(c.terminalSupply.plans[id].node,node);}
  let cash=r.scenario.openingCash,min=cash,last=-1;
  for(const e of r.cashLedger){assert(e.hour>=last);last=e.hour;assert(Number.isSafeInteger(e.amount));cash+=e.amount;min=Math.min(min,cash);assert(cash>=0);assert.equal(cash,e.cash);}
  assert.equal(cash,r.closingCash);assert.equal(min,r.minimumCash);assert.equal(r.completeCampaigns,0);
  assert(r.openConditions.includes("NO_CAMPAIGN_SURVIVAL_OR_TERMINAL_BASE_TRANSFER_PROOF"));
  assert.equal(r.researchCapacity.trailingWork.calendarAssigned,false);
  if(!r.blocked)assert.equal(r.processedActions,r.totalActions);
 }
}
const researchCalendar=c.researchCalendar;
if(researchCalendar){
 const {fingerprint,...src}=researchCalendar.sourceEvidence;assert.equal(key(src),fingerprint);
 const {fingerprint:eventFingerprint,...eventSrc}=researchCalendar.eventSourceEvidence;assert.equal(digest(eventSrc),eventFingerprint);
 assert.equal(key(researchCalendar.sourceHashes),key(c.sourceHashes));
 const list=Object.values(researchCalendar.records),s=researchCalendar.summary;
 assert.equal(list.length,s.scenarios);assert.equal(list.filter(r=>!r.blocked).length,s.fullLogicalCalendars);
 assert.equal(s.completeCampaigns,0);
 let count=0;
 for(const r of list){
  const {routeId,linkedPlanIds,origin,branch,graph,node,options,calendarHash,...content}=r;
  assert.equal(key(content),calendarHash);assert.equal(rows.get(routeId).hash,r.actionHash);
  assert.equal(r.sourceFingerprint,fingerprint);assert.equal(r.eventSourceFingerprint,eventFingerprint);
  for(const id of linkedPlanIds){assert.equal(c.terminalSupply.plans[id].graph,graph);assert.equal(c.terminalSupply.plans[id].node,node);}
  let cash=r.scenario.openingCash,min=cash,last=-1;
  for(const x of r.transactions){assert(x.hour>=last);last=x.hour;assert(Number.isSafeInteger(x.amount));cash+=x.amount;min=Math.min(min,cash);assert.equal(cash,x.cash);if(options.cashMode==="STRICT_CASH")assert(cash>=0);}
  assert.equal(cash,r.closingCash);assert.equal(min,r.minimumCash);assert.equal(Math.max(0,-min),r.additionalCapitalGap);
  const research=r.calendar.filter(x=>x.type==="LAB_RESEARCH"),fixed=new Map();
  count+=research.length;
  for(const x of research){
   assert.equal(x.nominal,modern.researchRules[x.id].cost||0);
   assert.equal(x.cost,x.nominal?Math.max(1,Math.trunc(x.nominal*options.costPercent/100)):0);
   assert.equal(x.days,x.cost?Math.ceil(x.cost/x.assigned):0);
   assert(x.end>=x.start);if(fixed.has(x.id))assert.equal(fixed.get(x.id),x.cost);fixed.set(x.id,x.cost);
  }
  assert.equal(research.reduce((n,x)=>n+x.days,0),r.researchDays);
  assert.equal(research.reduce((n,x)=>n+x.cost,0),r.actualWork);
  assert.equal(r.completeCampaigns,0);assert(r.openConditions.length);
  if(!r.blocked)assert.equal(r.finishedActions,r.totalActions);
 }
 assert.equal(count,s.calendarResearchActions);
}
const codex=c.codexSourcePrefixes;
if(codex){
 const {fingerprint,...src}=codex.sourceEvidence;assert.equal(key(src),fingerprint);
 const {fingerprint:eventFingerprint,...eventSrc}=codex.eventSourceEvidence;assert.equal(digest(eventSrc),eventFingerprint);
 assert.equal(key(codex.sourceHashes),key(c.sourceHashes));
 const list=Object.values(codex.records),s=codex.summary;
 assert.equal(list.length,s.scenarios);assert.equal(s.completeCampaigns,0);
 assert.equal(list.filter(r=>r.status==="CONDITIONAL_FULL_SUFFIX_REPLAY_SAME_SOLDIER").length,s.sameSoldierFullReplays);
 for(const [id,p] of Object.entries(codex.prefixes)){
  if(p.status==="SOURCE_BOUND_CODEX_PREFIX"){
   const {prefixHash,...content}=p;assert.equal(key(content),prefixHash);assert.equal(prefixHash,id);
   assert.equal(key(p.steps),p.stepHash);assert(p.stock[p.target]>=1);
   assert.equal(p.sourceFingerprint,eventFingerprint);
   assert(p.workshop>p.schedule.find(x=>x.type==="MANUFACTURE_ANOMALY").space);
   assert(p.schedule.some(x=>x.type==="EVENT_DELIVERY"&&x.rewards[p.target]>=1));
  }else assert.equal(key(p),id);
  assert.equal(p.completeCampaigns,0);
  if(p.finance){
   let cash=p.finance.openingCash,min=cash,h=-1;
   for(const x of p.finance.cashLedger){assert(x.hour>=h);h=x.hour;assert(Number.isSafeInteger(x.amount));cash+=x.amount;min=Math.min(min,cash);assert.equal(cash,x.cash);assert(cash>=0);}
   assert.equal(cash,p.finance.closingCash);assert.equal(min,p.finance.minimumCash);
  }
 }
 for(const r of list){
  assert.equal(rows.get(r.routeId).hash,r.originalActionHash);
  const p=codex.prefixes[r.prefixId];assert(p);
  if(r.suffix)assert.equal(key([...p.steps,...r.suffix]),r.stepHash);
  for(const id of r.linkedPlanIds){assert.equal(c.terminalSupply.plans[id].graph,r.graph);assert.equal(c.terminalSupply.plans[id].node,r.node);}
 }
}
console.log(JSON.stringify({complete:final.rows.length,conditional:all.length,unique:c.summary.uniqueEvidence,terminalTargets:t.targets.length,terminalAdvanced:advanced,terminalReady:ready,terminalPlans,surgeryPlans,open,resourceResearch,earlyScenarios:early?.summary.scenarios??0,researchCalendars:researchCalendar?.summary.scenarios??0,codexScenarios:codex?.summary.scenarios??0,codexSameSoldier:codex?.summary.sameSoldierFullReplays??0}));
