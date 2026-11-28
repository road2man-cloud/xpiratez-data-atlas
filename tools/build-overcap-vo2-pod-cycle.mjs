// Consume the repaired same-body frontier; a bounded search never proves closure.
// Replays an actual suffix with the shared lifecycle model and independently
// replays the full witness before recording a conditional candidate.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {member,exactWorld} from "./population-growth-replay-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy-v2-vo2.mjs";
import {createBodyCareerScope} from "./atlas-body-career-scope-v5-vo2-irreversible.mjs";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const intakeVersion=Number(process.argv.find(a=>a.startsWith("--intake="))?.slice(9)||2);
assert(Number.isSafeInteger(intakeVersion)&&intakeVersion>=1);
const queue=read("tools/data/overcap-vo2-pod-repair-intake"+(intakeVersion===1?"":"-v"+intakeVersion)+".json");
const ledger=decode("tools/data/overcap-intake-stage-CHORT/soldier-population-missing-origin-career.json.gz");
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
const data=read("public/data/soldiers-modern-index.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(queue.sourceGraphSha256,ledger.sourceGraphSha256);assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);
assert.equal(queue.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(catalog.sourceVersion,"v.o2");assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
const replay=createSharedCareerReplay(data,ledger.summary),material=createResearchMaterialPolicy(data),scope=createBodyCareerScope(data,db.branches,replay,catalog);
const budget=material.describe();assert.equal(budget.sha256,queue.materialBudgetHash);
const branches=new Map(db.branches.map(b=>[b.id,b])),targets=new Map(db.careerCompletion.terminalRule.targets.map(t=>[t.id,t]));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),sort=x=>[...x].sort(),kinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const choices=b=>[...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean),allChoices=new Set(db.branches.flatMap(choices));
function valid(w,b,goals){return !w.pendingFree&&choices(b).every(k=>active(w,k))&&!(b.blockedResearch||[]).some(k=>active(w,k))&&[...allChoices].every(k=>!active(w,k)||choices(b).includes(k))&&goals.every(k=>{const t=targets.get(k);return t&&t.researchGoals.every(x=>active(w,x))&&!(t.inactiveResearch||[]).some(x=>active(w,x));});}
function inputs(w,m){const s=member(w).state,f=replay.finish(w);return {body:f.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:new Set([...w.researched].filter(k=>active(w,k))),raw:f.raw,capRaw:f.capRaw,finite:budget.finite,consumed:m.consumed};}
function assess(w,b,m){return scope.assess(inputs(w,m),b,w);}
// Generate exact fixed-body cycle certificates using the SAME v10 scope.
// If the gate cannot close a cycle, emit actual one-step successors instead.
// A bounded search or a repeated permanent vector alone is never closure.
const offset=Number(process.argv.find(a=>a.startsWith("--offset="))?.slice(9)||0),limit=Number(process.argv.find(a=>a.startsWith("--limit="))?.slice(8)||1);
assert(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
const jobs=queue.openSuccessorQueue;
const records=[],errors=[];
const scopeView=q=>({closed:q.closed,open:q.open,missingResearch:q.missingResearch,unknownRules:q.unknownRules,openGrowth:q.openGrowth,possibleExact:q.possibleExact,blocked:q.blocked,repeats:q.repeats});
const ruleHashes=Object.fromEntries(["tools/atlas-body-career-scope-v5-vo2-irreversible.mjs","tools/atlas-final-career-admission-v10-vo2-irreversible.mjs","tools/final-career-repeat-quotient.mjs","tools/population-shared-lifecycle-replay.mjs","tools/atlas-research-material-policy-v2-vo2.mjs"].map(p=>[p,key(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
for(const [i,r] of jobs.slice(offset,offset+limit).entries()){
 const receipt={offset:offset+i,parentId:r.id,priorPair:r.priorPair,priorRoute:r.priorRoute,body:r.body,branch:r.branch,origin:r.origin,actionHash:r.actionHash,stateHash:r.stateHash,pairId:r.pairId};
 try{
  assert.equal(key(r.actions),r.actionHash);
  const w=replay.replay(r.actions),b=branches.get(r.branch),m=material.extend(material.empty(),r.actions);
  assert(b&&valid(w,b,r.targetGoals));assert.equal(exactWorld(w),r.stateHash);assert.deepEqual(material.issues(m),{hard:[],uncertain:[]});
  const ctx=auditOriginCampaignContext(r.actions,data);assert.equal(ctx.kind,"compatible");
  const original=replay.finish(w),q=assess(w,b,m);
  const prevReject={...scope.stats.cycleRejected};
  const cycle=!q.closed&&q.possibleExact&&!q.openGrowth?scope.proveCapCycle(inputs(w,m),b,w):null;
  const cycleRejected=Object.fromEntries(Object.entries(scope.stats.cycleRejected).map(([k,v])=>[k,v-(prevReject[k]||0)]).filter(([,v])=>v>0));
  const edges=[],successors=[],failures=[];
  if(cycle){
   assert(cycle.allSuccessorsCovered&&cycle.actualGameCertified===false&&cycle.globalOptimal===false);
   // Replay each unique projected state's concrete representative from its
   // exact chronological prefix, and recheck finite resources on all edges.
   const worlds=new Map([[cycle.source,w]]),paths=new Map([[cycle.source,[]]]);
   for(const e of cycle.edges){
    const before=worlds.get(e.from),prefix=paths.get(e.from);assert(before&&prefix);
    assert.equal(exactWorld(before),e.before);assert.equal(key(replay.rules.get(e.action)),e.ruleHash);
    const after=replay.replay(e.steps,before);assert.equal(exactWorld(after),e.after);
    const suffix=[...prefix,...e.steps],mm=material.extend(m,suffix);
    assert.deepEqual(material.issues(mm),{hard:[],uncertain:[]});assert(valid(after,b,r.targetGoals));
    const f=replay.finish(after);assert.equal(f.body,r.body);
    assert.deepEqual(f.permanentVector,original.permanentVector);assert.deepEqual(f.permanentCapVector,original.permanentCapVector);
    if(!worlds.has(e.to)){worlds.set(e.to,after);paths.set(e.to,suffix);}
    edges.push({from:e.from,to:e.to,action:e.action,steps:e.steps,actionHash:key([...r.actions,...suffix]),stateHash:exactWorld(after),finiteConsumed:mm.consumed});
   }
   assert.deepEqual([...worlds.keys()].sort(),cycle.states.slice().sort());
  }else{
   for(const x of q.open){
    if(x.missingResearch.length){failures.push({rule:x.id,reason:"MISSING_RESEARCH",missing:x.missingResearch});continue;}
    try{
     const rule=replay.rules.get(x.id);assert(rule&&rule.allowedSoldierTypes.includes(r.body)&&!rule.createsClone&&!rule.producedItem&&(!rule.producedSoldierType||rule.producedSoldierType===r.body));
     const outcomes=replay.transformOutcomes({world:w,steps:[]},rule);assert(outcomes.length,"No supported replay outcome");
     for(const o of outcomes){
      const z=replay.grow(o.value),suffix=z.steps,actions=[...r.actions,...suffix],end=z.world,f=replay.finish(end),s=member(end).state;
      assert(suffix.some(a=>a.type==="transform"&&a.transform===rule.id));assert.equal(f.body,r.body);assert(valid(end,b,r.targetGoals));
      const mm=material.extend(m,suffix);assert.deepEqual(material.issues(mm),{hard:[],uncertain:[]});
      assert.equal(exactWorld(replay.replay(suffix,w)),exactWorld(end));
      const afterCtx=auditOriginCampaignContext(actions,data);assert.equal(afterCtx.kind,"compatible");assert.deepEqual(afterCtx.allowedDifficulties,ctx.allowedDifficulties);
      const next=assess(end,b,mm),pathId=key([actions.filter(a=>kinds.has(a.type)),sort(end.researched),sort(end.disabled)]),traitId=key(Object.fromEntries([...s.bonusCounts].sort(([a],[b])=>a.localeCompare(b)))),pairId=key([r.origin,r.branch,r.body,ctx.allowedDifficulties,pathId,traitId]);
      successors.push({...receipt,id:"VO2-POD-SUCCESSOR:"+key(actions),action:rule.id,actions,actionHash:key(actions),stateHash:exactWorld(end),pairId,pathId,traitId,suffix,suffixHash:key(suffix),parentActionHash:r.actionHash,targetGoals:r.targetGoals,sourceAssumptions:r.sourceAssumptions,manufacture:r.manufacture,band:o.band??null,material:{...mm,issues:material.issues(mm)},endpoint:{raw:f.raw,cap:f.permanentCapVector,permanent:f.permanentVector,traits:[...s.bonusCounts].sort(),rank:f.rank,medals:f.medals},statDelta:f.permanentVector.map((x,j)=>x-original.permanentVector[j]),scope:scopeView(next),status:next.closed?"CONDITIONAL_CLOSURE_CANDIDATE":"CONDITIONAL_SUCCESSOR_OPEN",actualGameCertified:false,finalAdmission:false});
     }
    }catch(e){failures.push({rule:x.id,reason:String(e.message)});}
   }
  }
  const closureReady=q.closed||!!cycle;
  records.push({...receipt,scope:scopeView(q),closureReady,cycleProof:cycle,cycleProofHash:cycle?key(cycle):null,cycleRejected,edges,successors,failures,seed:r,status:closureReady?"CONDITIONAL_CLOSURE_CANDIDATE":"CONDITIONAL_FRONTIER_OPEN",finalAdmission:false,actualGameCertified:false});
 }catch(e){errors.push({...receipt,reason:String(e.message)});}
}
const summary={eligible:jobs.length,attempted:records.length+errors.length,produced:records.length,closureReady:records.filter(r=>r.closureReady).length,cycles:records.filter(r=>r.cycleProof).length,cycleStates:records.reduce((s,r)=>s+(r.cycleProof?.states.length||0),0),cycleEdges:records.reduce((s,r)=>s+r.edges.length,0),successors:records.reduce((s,r)=>s+r.successors.length,0),successorClosures:records.reduce((s,r)=>s+r.successors.filter(x=>x.scope.closed).length,0),errors:errors.length,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_POD_CYCLE_PRODUCTION_V1",sourceMetadataSha256:queue.sourceMetadataSha256,sourceGraphSha256:queue.sourceGraphSha256,sourceQueueHash:key(queue),materialBudgetHash:budget.sha256,ruleHashes,intakeVersion,batch:{offset,limit},summary,records,errors,scope:"Existing exact v10 cycle proof and concrete successor production. No public admission, actual gameplay, or cross-body closure."};
const file="tools/data/overcap-vo2-pod-cycle-v"+intakeVersion+"-"+offset+"-"+limit+".json";
fs.writeFileSync(file+".tmp",JSON.stringify(out)+"\n");fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({file,summary,records:records.map(r=>({offset:r.offset,body:r.body,closed:r.closureReady,possibleExact:r.scope.possibleExact,cycleRejected:r.cycleRejected,edges:r.edges.length,successors:r.successors.map(x=>({rule:x.action,delta:x.statDelta,closed:x.scope.closed,open:x.scope.open.map(y=>y.id)})),failures:r.failures})),errors},null,2));
