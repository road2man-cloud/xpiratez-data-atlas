// Produce chronological replacement witnesses for unbacked GREEN_GAL samples.
// No old route or final pair is overwritten. The additional research chronology
// changes the canonical path identity. Source-limited inputs stay conditional.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy-v2-vo2.mjs";
import {createBodyCareerScope} from "./atlas-body-career-scope-v5-vo2-irreversible.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const stage="tools/data/overcap-intake-stage-CHORT/";
const prior=read(stage+"vo2-focused-admission.json"),ledger=decode(stage+"soldier-population-missing-origin-career.json.gz");
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
const data=read("public/data/soldiers-modern-index.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(data.meta.mod.version,"v.o2");assert.equal(catalog.sourceVersion,"v.o2");
assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
assert.equal(ledger.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(prior.sourceGraphSha256,key(ledger.graphs));
const replay=createSharedCareerReplay(data,ledger.summary),policy=createResearchMaterialPolicy(data),scope=createBodyCareerScope(data,db.branches,replay,catalog);
assert.equal(prior.materialBudgetHash,policy.describe().sha256);
const POD="STR_STASIS_POD_GREEN_GAL",VENT="STR_VENTURA_ANOMALY",INV="STR_TINY_DRILL_INVESTIGATION",DEP="STR_TINY_DRILL_INVESTIGATION_DEP",GREEN="STR_CHOOSE_GREEN_QUERY",HULL="STR_MENACING_HULL",TENSION="STR_ANOMALY_DEP",AWARD="STR_ANOMALY_DEP2";
const E1="STR_VENTURA_ANOMALY_TENSION_EVENT",E2="STR_VENTURA_ANOMALY_EVENT";
const recipe=data.itemSupply[VENT].manufacture.find(r=>r.id==="STR_USE_DRILL_GREEN");
assert(recipe&&recipe.quantity===1);assert.deepEqual(recipe.requires,[DEP,GREEN]);
assert.deepEqual(recipe.requiredItems,{STR_TINY_DRILL:1,STR_MENACING_HULL:1});
const event=(id,e)=>{const r=data.eventResearchSources[id].find(x=>x.event===e);assert(r?.choiceCount===1);const s=r.scripts.find(x=>x.script===e);assert(s);return {r,s};};
const e1=event(TENSION,E1),e2=event(AWARD,E2);
assert.equal(policy.finite.get(POD)?.cap,3);
const sort=x=>[...x].sort(),active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const branches=new Map(db.branches.map(b=>[b.id,b])),targets=new Map(db.careerCompletion.terminalRule.targets.map(t=>[t.id,t]));
const choices=b=>[...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean),allChoices=new Set(db.branches.flatMap(choices));
const branchOkay=(w,b)=>choices(b).every(k=>active(w,k))&&(b.blockedResearch||[]).every(k=>!active(w,k))&&[...allChoices].every(k=>!active(w,k)||choices(b).includes(k));
const goalOkay=(w,t)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
function sequence(r){const g=ledger.graphs[r.sourceGraph],tail=[];let i=r.sourceNode;while(i){const n=g.nodes[i];tail.push(n.steps);i=n.parent;}return [...g.birthActions,...tail.reverse().flat()];}
const records=[],errors=[];
const rows=db.careerCompletion.rows.filter(r=>prior.priorMaterialIssues.some(x=>x.id===r.id));
const offset=Number(process.argv.find(x=>x.startsWith("--offset="))?.slice(9)||0),limit=Number(process.argv.find(x=>x.startsWith("--limit="))?.slice(8)||1);
assert(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
const jobs=rows.flatMap(row=>[row,...(row.alternatives||[])].map(ref=>({row,ref})));
const file="tools/data/overcap-vo2-pod-source-repair-"+offset+"-"+limit+".json";
for(const {row,ref} of jobs.slice(offset,offset+limit)){
 const id=ref.routeId,r=ledger.routes[id],b=branches.get(r.branch),old=sequence(r),receipt={priorPair:row.id,priorRoute:id,origin:r.origin,body:r.body,branch:r.branch};
 try{
  assert.equal(key(old),r.fullActionHash);const original=replay.replay(old);
  assert.equal(exactWorld(original),r.canonicalStateHash);
  const originalGoals=db.careerCompletion.researchTraitSets.records[id].goals;
  const at=old.findIndex(a=>a.type==="externalInputs"&&a.items?.[POD]>0);
  assert(at>=0);assert(!old.slice(0,at).some(a=>a.event===E2));
  let w=replay.replay(old.slice(0,at)),actions=old.slice(0,at),inserted=[],skipped=[],sourceAssumptions=[],manufacture=null;
  function append(a,extra=false){w=replay.apply(w,a);actions.push(a);if(extra)inserted.push(a);}
  function supply(id,qty,reason){const lack=Math.max(0,qty-(w.items[id]||0));if(lack)append({type:"externalInputs",items:{[id]:lack},functions:[],funds:0,reason,assumption:true},true);}
  function finish(){
   if(!w.pendingFree)return;
   const p=w.pendingFree,options=p.choices.filter(k=>data.researchRules[k]&&!active(w,k)&&!w.disabled.has(k));
   assert(options.length===1,"Unexpected free choice: "+options.join(","));
   append({type:"freeResearch",source:p.source,research:options[0],assumeOutcome:!p.sequential&&p.choices.length>1},true);
  }
  function research(id,seen=new Set()){
   if(active(w,id))return;
   assert(!seen.has(id)&&!w.disabled.has(id),"Blocked source topic "+id);
   const rule=data.researchRules[id];assert(rule&&rule.cost>0&&!rule.requires.length,"No direct lab method "+id);
   const next=new Set([...seen,id]);for(const d of rule.dependencies||[])research(d,next);
   assert((rule.requiresBaseFunc||[]).every(k=>w.baseFunctions.has(k)),"Missing source facility "+id);
   if(rule.needItem){
    const sample=rule.neededItem||id;assert(!policy.finite.has(sample),"Cannot assume another finite sample");
    if(!(w.items[sample]>0)){supply(sample,1,"Conditional source sample for "+id);sourceAssumptions.push({item:sample,quantity:1,kind:policy.catalog[sample]?.kind||"UNINDEXED_ACQUISITION"});}
   }
   append({type:"research",id},true);finish();assert(active(w,id));
  }
  research(INV);assert(active(w,DEP),"Investigation did not enable drill manufacture");
  research(GREEN);assert(recipe.requires.every(k=>active(w,k))&&recipe.requiresBaseFunc.every(k=>w.baseFunctions.has(k)));
  // The current replay has no manufacture transaction. Represent one output
  // as a conditional external acquisition only AFTER its recipe is enabled;
  // reserve independent recipe inputs in the receipt (do not grant/return
  // them to the simulated stock or claim exact physical production).
  if(!(w.items[VENT]>0)){
   assert(Object.keys(recipe.requiredItems).every(k=>!policy.finite.has(k)&&data.sourceItemIds.has(k)));
   manufacture={id:recipe.id,output:VENT,quantity:recipe.quantity,activePrerequisites:recipe.requires.slice(),requiredItems:recipe.requiredItems,cost:recipe.cost,ruleHash:key(recipe),sourceInputs:Object.entries(recipe.requiredItems).map(([item,quantity])=>({item,quantity,kind:policy.catalog[item]?.kind||"UNINDEXED_ACQUISITION"})),conditionalManufacture:true,actualManufactureReplayed:false};
   supply(VENT,1,"Conditional manufacture "+recipe.id+"; independent recipe inputs reserved in receipt");
  }
  research(VENT);
  function grant(id,eventId,script){
   assert(!active(w,id)&&!w.disabled.has(id),"Event research already active or disabled "+id);
   assert(script.researchPositive.every(k=>active(w,k))&&script.researchNegative.every(k=>!active(w,k))&&script.itemPositive.every(k=>w.items[k]>0));
   assert(w.month>=script.firstMonth&&(script.lastMonth==null||w.month<=script.lastMonth));
   append({type:"eventResearch",event:eventId,script:script.script,research:id,assumeOutcome:true},true);finish();
   assert(active(w,id)&&w.generatedEvents[eventId]>0);
  }
  if(!active(w,TENSION))grant(TENSION,E1,e1.s);
  grant(AWARD,E2,e2.s);
  // Keep the original sample grant, now backed by the exact prior event.
  for(let i=at;i<old.length;i++){
   const a=old[i];
   if(a.type==="research"&&active(w,a.id)&&!w.pendingFree){skipped.push({index:i,action:a,reason:"ALREADY_COMPLETED_IN_REPAIRED_PREFIX"});continue;}
   if(a.type==="freeResearch"&&!w.pendingFree&&active(w,a.research)){skipped.push({index:i,action:a,reason:"AWARD_ALREADY_ACTIVE_IN_REPAIRED_PREFIX"});continue;}
   append(a);
  }
  assert(!w.pendingFree&&branchOkay(w,b)&&originalGoals.every(k=>goalOkay(w,targets.get(k))));
  const ctx=auditOriginCampaignContext(actions,data);
  assert.equal(ctx.kind,"compatible");assert.deepEqual(ctx.allowedDifficulties,r.allowedDifficulties);
  const oldFinish=replay.finish(original),f=replay.finish(w),s=member(w).state,o=member(original).state;
  for(const k of ["body","raw","capRaw","permanentVector","permanentCapVector","rank","medals"])assert.deepEqual(f[k],oldFinish[k],"Changed endpoint "+k);
  assert.deepEqual([...s.bonusCounts].sort(),[...o.bonusCounts].sort());
  assert.deepEqual([...s.history].sort(),[...o.history].sort());
  assert([...original.researched].every(k=>w.researched.has(k)),"Old research removed");
  const m=policy.extend(policy.empty(),actions),issues=policy.issues(m);assert.deepEqual(issues,{hard:[],uncertain:[]});
  assert.equal(exactWorld(replay.replay(actions)),exactWorld(w));
  const q=scope.assess({body:f.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:new Set([...w.researched].filter(k=>active(w,k))),raw:f.raw,capRaw:f.capRaw,finite:policy.describe().finite,consumed:m.consumed},b,w);
  const path=actions.filter(a=>["research","repeatResearch","freeResearch","eventResearch","missionResearch"].includes(a.type));
  const pathId=key([path,sort(w.researched),sort(w.disabled)]),traitId=key(Object.fromEntries([...s.bonusCounts].sort(([a],[b])=>a.localeCompare(b))));
  const pairId=key([r.origin,r.branch,r.body,r.allowedDifficulties,pathId,traitId]);
  records.push({...receipt,id:"VO2-POD-REPAIR:"+key(actions),actions,actionHash:key(actions),stateHash:exactWorld(w),pairId,pathId,traitId,oldPairId:row.id,addedResearch:sort([...w.researched].filter(k=>!original.researched.has(k))),addedDisabled:sort([...w.disabled].filter(k=>!original.disabled.has(k))),inserted,skipped,manufacture,sourceAssumptions,material:{...m,issues},endpoint:{raw:f.raw,cap:f.permanentCapVector,permanent:f.permanentVector,traits:[...s.bonusCounts].sort(),rank:f.rank,medals:f.medals},scope:{closed:q.closed,open:q.open,missingResearch:q.missingResearch,unknownRules:q.unknownRules,openGrowth:q.openGrowth},targetGoals:originalGoals,status:"REPLAYED_REPLACEMENT_CANDIDATE",finalAdmission:false,actualGameCertified:false});
 }catch(e){errors.push({...receipt,reason:String(e.message)});}
}
const summary={priorPairs:rows.length,attempted:records.length+errors.length,replayed:records.length,recoveredPriorPairs:new Set(records.map(r=>r.priorPair)).size,newChronologicalPairs:new Set(records.map(r=>r.pairId)).size,closureCandidates:records.filter(r=>r.scope.closed).length,errors:errors.length,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_POD_SOURCE_REPAIR_V1",sourceMetadataSha256:ledger.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,materialBudgetHash:policy.describe().sha256,sourceRuleHashes:{recipe:key(recipe),tension:key(e1),reward:key(e2),sample:key(data.researchRules[POD])},scope:"Conditional replacement paths; explicit event replay and conditional manufacture inputs. No actual-game acquisition, full economy, official final admission, or identical old research path claimed.",summary,records,errors};
out.batch={offset,limit,total:jobs.length};fs.writeFileSync(file,JSON.stringify(out)+"\n");
console.log(JSON.stringify({file,summary,errors,records:records.map(r=>({prior:r.priorPair,body:r.body,pair:r.pairId,closed:r.scope.closed,added:r.addedResearch,open:r.scope.open.map(x=>x.id)}))},null,2));
