import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,loadCareerRows,completionScope,readResearchWitness} from '../public/branch-soldier-atlas-career-core.js';
import {admitVerified,normalizedCombination} from './atlas-career-completion-core.mjs';
import {key} from './population-research-career-core.mjs';
import {digest} from './final-combination-production.mjs';
import {loadFinancedDetail} from './atlas-financed-career-detail-store.mjs';
import {createCareerReplay} from './population-chronological-career-core.mjs';
import {financedSoldierSignature} from './atlas-financed-career-calendar.mjs';
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
assert.equal(ready,Object.values(a.terminalResearch.records).filter(r=>r.suffixHash&&r.status==="CONDITIONAL_TARGET_RESEARCH_READY").length);
assert.equal(a.terminalResearch.ready,Object.values(a.terminalResearch.anchors).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY").length);
if(a.endStage){
 const e=a.endStage,known=Object.values(e.records).filter(r=>r.status==="TERMINAL_RESEARCH_READY_NOT_CLOSED");
 assert.deepEqual(c.endStage,e);assert.equal(e.ready,known.length);
 assert.equal(e.distinctStates,new Set(known.map(r=>r.graph+"|"+r.node)).size);
 assert.equal(e.completeCombinations,0);
 for(const r of known){
  const row=rows.get("MISSCAR:"+r.graph+":"+r.node),node=a.graphs[r.graph].nodes[r.node];
  assert(row&&node);assert.equal(node.stateHash,r.stateHash);
  assert.deepEqual(Object.keys(r.traitCounts).sort(),node.traits.slice().sort());
  assert(Object.values(r.traitCounts).every(n=>Number.isSafeInteger(n)&&n>0));
 }
 for(const r of Object.values(e.research).filter(r=>r.suffixHash)){
  assert(a.graphs[r.graph].nodes[r.to]);assert.equal(key(a.graphs[r.graph].nodes[r.to].steps),r.suffixHash);
  for(const x of r.outcomes||[])if(Number.isInteger(x.to))assert(a.graphs[r.graph].nodes[x.to]);
 }
}
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
const financed=c.financedCareerCalendar;
let independentlyReplayed=0;
if(financed){
 assert.equal(key(financed.sourceHashes),key(c.sourceHashes));
 assert.equal(financed.codexFingerprint,codex.producerFingerprint);
 assert.equal(financed.sourceEvidence.fingerprint,codex.sourceEvidence.fingerprint);
 const list=Object.values(financed.records),s=financed.summary;
 assert.equal(list.length,s.scenarios);assert.equal(s.completeCampaigns,0);
 assert.equal(list.filter(r=>r.status.startsWith("FULL_")).length,s.fullLogicalReplays);
 assert.equal(list.filter(r=>r.sameSoldierState&&!r.missingOriginalActiveResearchCount).length,s.sameSoldierFullReplays);
 assert.equal(list.reduce((n,r)=>n+r.financeGates.filter(g=>g.event==="STR_THE_GREAT_CAUSE"&&g.met).length,0),s.greatCauseFundsMet);
 assert.equal(list.reduce((n,r)=>n+r.counts.deadlineResolved,0),s.deadlineEventsReordered);
 assert.equal(new Set(list.map(r=>r.detailHash)).size,s.detailShards);
 modern.originRows=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json")).rows;
 modern.sourceItemIds=new Set(JSON.parse(fs.readFileSync("public/data/soldier-source-catalog.json")).itemIds);
 const replay=createCareerReplay(modern),tested=new Set();
 for(const r of list){
  const x=loadFinancedDetail(r),p=codex.prefixes[r.prefixHash];
  assert.equal(codex.records[r.codexId].prefixId,r.prefixHash);assert.equal(rows.get(r.routeId).hash,r.actionHash);
  const {routeId,origin,branch,graph,node,linkedPlanIds,codexId,options,originalSoldierSignature,sameSoldierState,missingOriginalActiveResearch,calendarHash,...content}=x;
  assert.equal(key(content),calendarHash);assert.equal(calendarHash,r.calendarHash);
  assert.equal(missingOriginalActiveResearch.length,r.missingOriginalActiveResearchCount);
  assert.equal(x.unresolved.length,r.counts.unresolved);assert.equal(x.logicalSteps.length,r.counts.logicalSteps);assert.equal(x.transactions.length,r.counts.transactions);
  assert.equal(x.scenario.openingCash,p.finance.closingCash);
  let cash=x.scenario.openingCash,min=cash,last=x.prefixHours;
  for(const e of x.transactions){assert(e.hour>=last);last=e.hour;assert(Number.isSafeInteger(e.amount));cash+=e.amount;min=Math.min(min,cash);assert.equal(cash,e.cash);assert(cash>=0);}
  assert.equal(cash,x.closingCash);assert.equal(min,x.minimumCash);assert.equal(Math.min(min,p.finance.minimumCash),x.wholePrefixMinimumCash);
  for(const g of x.financeGates){assert.equal(g.met,g.dispatchCash>=g.minimum&&(g.maximum===null||g.dispatchCash<=g.maximum));assert(x.monthly.some(m=>m.month===g.dispatchMonth&&m.cash===g.dispatchCash));}
  for(const a of x.logicalSteps)if(a.action.type==="externalInputs")assert.equal(a.action.funds,0);
  for(const g of x.sourceRewards)assert(x.eventGates.some(e=>e.at===g.at&&e.kind!=="blocked"));
  if(x.status.startsWith("FULL_")&&!tested.has(x.origin)){
   tested.add(x.origin);let w=replay.replay(p.steps);
   for(const a of x.logicalSteps){w=replay.apply({...w,month:a.month,funds:a.funds},a.action);w={...w,month:a.afterMonth,funds:a.afterFunds};}
   assert(!w.pendingFree);assert.equal(financedSoldierSignature(w,replay),x.finalSoldierSignature);independentlyReplayed++;
  }
  assert.equal(x.completeCampaigns,0);
 }
}
const auxiliary=c.auxiliaryCareerCalendar;let auxiliaryReplayed=0;
if(auxiliary){
 const {fingerprint,...src}=auxiliary.auxiliarySource;assert.equal(key(src),fingerprint);
 assert.equal(key(auxiliary.sourceHashes),key(c.sourceHashes));assert.equal(auxiliary.financedFingerprint,financed.producerFingerprint);
 assert.equal(auxiliary.codexFingerprint,codex.producerFingerprint);
 const list=Object.values(auxiliary.records),s=auxiliary.summary;
 assert.equal(list.length,s.scenarios);assert.equal(s.completeCampaigns,0);
 assert.equal(list.filter(r=>r.status.startsWith("FULL_")).length,s.fullLogicalReplays);
 assert.equal(list.filter(r=>r.sameSoldierState).length,s.sameSoldierFullReplays);
 assert.equal(list.reduce((n,r)=>n+r.eventGates.filter(g=>g.event==="STR_THE_GREAT_CAUSE"&&g.fundsMet&&g.auxiliaryFacilityMet).length,0),s.greatCauseBothMet);
 assert.equal(new Set(list.map(r=>r.detailHash)).size,s.detailShards);
 const replay=createCareerReplay(modern),tested=new Set();
 for(const r of list){
  const x=loadFinancedDetail(r),p=codex.prefixes[r.prefixHash],f=financed.records[r.financedId];
  assert(f&&f.routeId===r.routeId&&f.prefixHash===r.prefixHash&&f.actionHash===r.actionHash);
  const {routeId,origin,branch,graph,node,linkedPlanIds,codexId,financedId,options,originalSoldierSignature,sameSoldierState,missingOriginalActiveResearch,calendarHash,...content}=x;
  assert.equal(key(content),calendarHash);assert.equal(calendarHash,r.calendarHash);
  assert.equal(x.auxiliarySourceFingerprint,fingerprint);assert.equal(x.scenario.openingCash,p.finance.closingCash);
  let cash=x.scenario.openingCash,min=cash,last=x.prefixHours;
  for(const e of x.transactions){assert(e.hour>=last);last=e.hour;assert(Number.isSafeInteger(e.amount));cash+=e.amount;min=Math.min(min,cash);assert.equal(cash,e.cash);assert(cash>=0);}
  assert.equal(cash,x.closingCash);assert.equal(min,x.minimumCash);
  for(const b of x.auxiliaryBridges.filter(b=>b.status==="CONDITIONAL_AUXILIARY_FACILITY_BUILT")){
   const base=x.auxiliaryBases.find(a=>a.id===b.base),g=x.eventGates.find(e=>e.event===b.event);assert(base&&g);
   const plan=b.plan,grid=Array.from({length:6},()=>Array(6).fill(null));
   assert.equal(plan.sourceFingerprint,fingerprint);assert.equal(plan.site.polygon.index,src.site.polygon.index);
   assert(plan.storageBeforeTarget>=plan.materialVolume);
   assert.equal(b.operations.reduce((n,o)=>n+(o.cost||0),0),plan.directCost);
   assert.equal(x.transactions.filter(t=>t.reason.startsWith("auxiliary")).reduce((n,t)=>n-t.amount,0),plan.directCost);
   for(const f of base.facilities){
    assert(f.ready>=f.placed);
    for(let y=f.y;y<f.y+f.sy;y++)for(let z=f.x;z<f.x+f.sx;z++){assert(grid[y]&&z>=0&&z<6&&!grid[y][z]);grid[y][z]=f.id;}
   }
   const target=base.facilities.find(f=>f.id===b.id),purchase=b.operations.find(o=>o.type==="AUX_PURCHASE");
   assert(target.ready<=g.gateState?.hour||target.ready<=x.financeGates.find(f=>f.event===b.event).end);
   assert(purchase.end<=target.placed&&purchase.storage>=purchase.volume);
   assert.equal(purchase.qty,plan.materials[purchase.id]);assert.equal(base.stock[purchase.id],0);
   assert.equal(g.auxiliaryFacilityMet,true);assert.equal(g.fundsMet,true);assert(g.unknown.includes("평가 점수 미확인"));
   for(const m of x.monthly)assert.equal(m.auxiliaryFacility,base.facilities.filter(f=>f.ready<=m.hour&&f.placed<m.hour).reduce((n,f)=>n+f.monthlyCost,0));
  }
  for(const a of x.logicalSteps)if(a.action.type==="externalInputs")assert.equal(a.action.funds,0);
  if(x.status.startsWith("FULL_")&&!tested.has(x.origin)){
   tested.add(x.origin);let w=replay.replay(p.steps);
   for(const a of x.logicalSteps){w=replay.apply({...w,month:a.month,funds:a.funds},a.action);w={...w,month:a.afterMonth,funds:a.afterFunds};}
   assert(!w.pendingFree);assert.equal(financedSoldierSignature(w,replay),x.finalSoldierSignature);auxiliaryReplayed++;
  }
  assert.equal(x.completeCampaigns,0);
 }
}
console.log(JSON.stringify({complete:final.rows.length,conditional:all.length,unique:c.summary.uniqueEvidence,terminalTargets:t.targets.length,terminalAdvanced:advanced,terminalReady:ready,terminalPlans,surgeryPlans,open,resourceResearch,earlyScenarios:early?.summary.scenarios??0,researchCalendars:researchCalendar?.summary.scenarios??0,codexScenarios:codex?.summary.scenarios??0,codexSameSoldier:codex?.summary.sameSoldierFullReplays??0,financedScenarios:financed?.summary.scenarios??0,independentlyReplayed,auxiliaryScenarios:auxiliary?.summary.scenarios??0,auxiliaryReplayed}));
