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
const intakeVersion=Number(process.argv.find(a=>a.startsWith("--intake="))?.slice(9)||1);
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
function assess(w,b,m){const s=member(w).state,f=replay.finish(w);return scope.assess({body:f.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:new Set([...w.researched].filter(k=>active(w,k))),raw:f.raw,capRaw:f.capRaw,finite:budget.finite,consumed:m.consumed},b,w);}
const mode=process.argv.find(a=>a.startsWith("--rule="))?.slice(7)||"STR_DREAMLINK_TRAINING";
assert(/^[A-Z0-9_]+$/.test(mode));
const offset=Number(process.argv.find(a=>a.startsWith("--offset="))?.slice(9)||0),limit=Number(process.argv.find(a=>a.startsWith("--limit="))?.slice(8)||1);
assert(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
// A previously generated successor is also a real chronological seed.
// Keep its parent/action hashes and original repaired prior pair unchanged.
const from=process.argv.find(a=>a.startsWith("--from="))?.slice(7)||null;
let seed=queue.openSuccessorQueue,sourceBatchHash=null;
if(from){
 assert(/^[A-Z0-9_]+-\d+-\d+(?:-intake-v[0-9]+)?(?:-from-[a-f0-9]{16})?$/.test(from));
 const batch=read("tools/data/overcap-vo2-pod-successor-"+from+".json");
 assert.equal(batch.schema,"ATLAS_VO2_POD_SUCCESSOR_BATCH_V1");assert.equal(batch.sourceMetadataSha256,queue.sourceMetadataSha256);assert.equal(batch.sourceGraphSha256,queue.sourceGraphSha256);assert.equal(batch.sourceQueueHash,key(queue));assert.equal(batch.materialBudgetHash,budget.sha256);
 seed=batch.records.filter(r=>!r.scope.closed);sourceBatchHash=key(batch);
 for(const r of seed){assert.equal(r.actionHash,key(r.actions));assert.equal(r.suffixHash,key(r.suffix));assert.equal(r.finalAdmission,false);}
}
const jobs=seed.filter(r=>r.scope.open.some(x=>x.id===mode));
const records=[],errors=[];
for(const r of jobs.slice(offset,offset+limit)){
 const receipt={parentId:r.id,priorPair:r.priorPair,priorRoute:r.priorRoute,body:r.body,branch:r.branch,origin:r.origin,action:mode};
 try{
  assert.equal(key(r.actions),r.actionHash);const b=branches.get(r.branch),rule=replay.rules.get(mode);
  assert(b&&rule&&rule.allowedSoldierTypes.includes(r.body)&&!rule.createsClone&&!rule.producedItem&&(!rule.producedSoldierType||rule.producedSoldierType===r.body));
  const w=replay.replay(r.actions),m=material.extend(material.empty(),r.actions);
  assert.equal(exactWorld(w),r.stateHash);assert.deepEqual(material.issues(m),{hard:[],uncertain:[]});assert(valid(w,b,r.targetGoals));
  const original=replay.finish(w),q=assess(w,b,m);
  assert(!q.closed&&q.open.some(x=>x.id===mode&&x.missingResearch.length===0),"No currently actionable obligation");
  const outcomes=replay.transformOutcomes?replay.transformOutcomes({world:w,steps:[]},rule):[{band:null,value:replay.transform({world:w,steps:[]},rule)}].filter(x=>x.value);
  assert(outcomes.length,"No supported replay outcome");
  for(const o of outcomes){
   const z=replay.grow(o.value),suffix=z.steps,actions=[...r.actions,...suffix],end=z.world,f=replay.finish(end),s=member(end).state;
   assert(suffix.some(a=>a.type==="transform"&&a.transform===mode));
   assert.equal(f.body,r.body);assert(valid(end,b,r.targetGoals));
   const mm=material.extend(m,suffix);assert.deepEqual(material.issues(mm),{hard:[],uncertain:[]});
   const ctx=auditOriginCampaignContext(actions,data),beforeCtx=auditOriginCampaignContext(r.actions,data);
   assert.equal(ctx.kind,"compatible");assert.deepEqual(ctx.allowedDifficulties,beforeCtx.allowedDifficulties);
   assert.equal(exactWorld(replay.replay(actions)),exactWorld(end));
   const next=assess(end,b,mm),pathId=key([actions.filter(a=>kinds.has(a.type)),sort(end.researched),sort(end.disabled)]),traitId=key(Object.fromEntries([...s.bonusCounts].sort(([a],[b])=>a.localeCompare(b)))),pairId=key([r.origin,r.branch,r.body,ctx.allowedDifficulties,pathId,traitId]);
   records.push({...receipt,id:"VO2-POD-SUCCESSOR:"+key(actions),actions,actionHash:key(actions),stateHash:exactWorld(end),pairId,pathId,traitId,suffix,suffixHash:key(suffix),parentActionHash:r.actionHash,targetGoals:r.targetGoals,sourceAssumptions:r.sourceAssumptions,manufacture:r.manufacture,band:o.band??null,material:{...mm,issues:material.issues(mm)},endpoint:{raw:f.raw,cap:f.permanentCapVector,permanent:f.permanentVector,traits:[...s.bonusCounts].sort(),rank:f.rank,medals:f.medals},statDelta:f.permanentVector.map((x,i)=>x-original.permanentVector[i]),scope:{closed:next.closed,open:next.open,missingResearch:next.missingResearch,unknownRules:next.unknownRules,openGrowth:next.openGrowth,blocked:next.blocked,repeats:next.repeats},status:next.closed?"CONDITIONAL_CLOSURE_CANDIDATE":"CONDITIONAL_SUCCESSOR_OPEN",actualGameCertified:false,finalAdmission:false});
  }
 }catch(e){errors.push({...receipt,reason:String(e.message)});}
}
const summary={eligible:jobs.length,attempted:Math.min(limit,Math.max(0,jobs.length-offset)),produced:records.length,closed:records.filter(r=>r.scope.closed).length,open:records.filter(r=>!r.scope.closed).length,errors:errors.length,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_POD_SUCCESSOR_BATCH_V1",sourceMetadataSha256:queue.sourceMetadataSha256,sourceGraphSha256:queue.sourceGraphSha256,sourceQueueHash:key(queue),materialBudgetHash:budget.sha256,rule:mode,...(intakeVersion===1?{}:{intakeVersion}),batch:{offset,limit,...(from?{from,sourceBatchHash}:{})},summary,records,errors,scope:"Bounded same-body conditional continuation, not official admission or exhaustive gameplay."};
const file="tools/data/overcap-vo2-pod-successor-"+mode+"-"+offset+"-"+limit+(intakeVersion===1?"":"-intake-v"+intakeVersion)+(from?"-from-"+sourceBatchHash.slice(0,16):"")+".json";
fs.writeFileSync(file,JSON.stringify(out)+"\n");
console.log(JSON.stringify({file,summary,records:records.map(r=>({body:r.body,pairId:r.pairId,statDelta:r.statDelta,closed:r.scope.closed,open:r.scope.open.map(x=>x.id)})),errors},null,2));
