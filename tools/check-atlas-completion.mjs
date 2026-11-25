import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {ledgers,project,loadCareerRows,completionScope,readResearchWitness} from '../public/branch-soldier-atlas-career-core.js';
import {admitVerified,normalizedCombination} from './atlas-career-completion-core.mjs';
import {key} from './population-research-career-core.mjs';
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
}
console.log(JSON.stringify({complete:final.rows.length,conditional:all.length,unique:c.summary.uniqueEvidence,terminalTargets:t.targets.length,terminalAdvanced:advanced,terminalReady:ready,terminalPlans,surgeryPlans,open,resourceResearch}));
