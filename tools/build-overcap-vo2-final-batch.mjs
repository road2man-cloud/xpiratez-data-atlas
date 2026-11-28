// Resumable full-registry v10 admission. Every batch sees ALL descendants of
// its source graphs; no limited batch is allowed to declare a global final table.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {unpackBodyScopeWitness} from "../public/branch-soldier-final-scope-codec.js";
import {classifyFinalCareers} from "./atlas-final-career-admission-v10-vo2-irreversible.mjs";
import {createBodyCareerScope} from "./atlas-body-career-scope-v5-vo2-irreversible.mjs";
import {createShadeResetProof} from "./atlas-shade-reset-dominance-v2-vo2.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"POD_REPAIR";
const fast=process.argv.includes("--fast-pass"),staticPass=process.argv.includes("--static-pass"),closureFirst=process.argv.includes("--closure-first"),next=process.argv.includes("--next"),offset=Number(process.argv.find(x=>x.startsWith("--offset="))?.slice(9)||0),limit=Number(process.argv.find(x=>x.startsWith("--limit="))?.slice(8)||(fast||staticPass?2000:6));
assert(/^[A-Z0-9_]+$/.test(body)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
assert(Number(fast)+Number(staticPass)+Number(closureFirst)+Number(next)<=1,"Choose one automatic selection mode");
const stage="tools/data/overcap-intake-stage-"+body+"/";
const prep=decode(stage+"vo2-full-prepared.json.gz"),manifest=read("tools/data/overcap-vo2-full-prepared-manifest-"+body+".json");
assert.equal(prep.schema,"ATLAS_VO2_FULL_PREPARED_V1");assert.equal(key(prep),manifest.preparedHash);assert.equal(key(prep.plan),manifest.planHash);
const ledger=decode(stage+"soldier-population-missing-origin-career.json.gz");
assert.equal(key(ledger.graphs),prep.sourceGraphSha256);assert.equal(ledger.sourceGraphSha256,prep.sourceGraphSha256);
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
assert.equal(db.sourceMetadataSha256,prep.sourceMetadataSha256);assert.equal(db.careerCompletion.researchTraitSets.sourceGraphSha256,prep.baseGraphHash);
const data=read("public/data/soldiers-modern-index.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(data.meta.source.metadataSha256,prep.sourceMetadataSha256);assert.equal(catalog.sourceVersion,"v.o2");assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
// Exact prefilter for the gate's first two nonfinal outcomes. It never
// supplies a final certificate, and the original gate still classifies
// every selected witness. A complete pair must be in ONE batch.
const already=new Set();
for(const name of fs.readdirSync(stage).filter(n=>/^vo2-final-(?:batch-\d+-\d+|(?:fast|static|next)-batch-[a-f0-9]+)\.json\.gz$/.test(n))){
 const d=decode(stage+name);assert.equal(d.preparedHash,manifest.preparedHash);assert.equal(d.planHash,prep.planHash);
 const ix=d.batch.indices||Array.from({length:d.pairIds.length},(_,i)=>d.batch.offset+i);
 assert.deepEqual(ix.map(i=>prep.plan[i].id),d.pairIds);
 for(const i of ix){assert(!already.has(i),"Overlapping existing batches "+i);already.add(i);}
}
let indices,scheduling=null;
if(fast||staticPass||closureFirst){
 const known=new Set(prep.materialBudget.checkedRouteIds),children=new Map();
 const relevant=a=>["research","repeatResearch","freeResearch","eventResearch","missionResearch","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"].includes(a.type);
 for(const [gid,g] of Object.entries(ledger.graphs)){
  const next=new Array(g.nodes.length).fill(null);
  for(let i=g.nodes.length-1;i>0;i--){
   const n=g.nodes[i],p=n.parent,a=g.nodes[p];assert(Number.isInteger(p)&&p<i);
   if(n.body!==a.body)continue;
   const improves=z=>z.traits.some(t=>!a.traits.includes(t))||["raw","capRaw"].some(k=>z[k].some((v,j)=>v>a[k][j]));
   if(n.stateHash!==a.stateHash&&n.steps.some(relevant)&&improves(n))next[p]??=i;
   else if(next[i]!==null&&improves(g.nodes[next[i]]))next[p]??=next[i];
  }
  children.set(gid,next);
 }
 const immediate=id=>{const v=prep.materialBudget.records[id],r=ledger.routes[id],s=prep.researchTraitSets.records[id],n=ledger.graphs[r.sourceGraph]?.nodes[r.sourceNode];
  assert(n&&s?.goals?.length&&s.stateHash===n.stateHash&&s.actionHash===r.fullActionHash);
  return !known.has(id)||v?.hard?.length||v?.uncertain?.length||children.get(r.sourceGraph)[r.sourceNode]!==null;};
 // Use the very same scope assessor as the final gate, not an approximation
 // to its closure decision. Projection is a scheduling hint only. The
 // authoritative gate independently classifies the selected complete pairs.
 let canSkipReplay=immediate;
 const scores=new Map();
 if(staticPass||closureFirst){
  const replay=createSharedCareerReplay(data,ledger.summary),first=createBodyCareerScope(data,db.branches,replay,catalog),shade=createShadeResetProof(data,replay,first);
  const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r])),branches=new Map(db.branches.map(b=>[b.id,b])),histories=new Map();
  function projectHistory(previous,actions){
   let h=previous&&new Set(previous);
   for(const a of actions){
    if(a.type==="recruit"&&a.soldier==="origin"){
     const p=profiles.get(a.profile);h=p?new Set(Object.entries(p.previousTransformations||{}).filter(([,n])=>Number(n)>0).map(([k])=>k)):null;
    }else if(a.type==="transform"&&a.soldier==="origin"){
     const r=rules.get(a.transform);if(!h||!r||r.createsClone)return null;
     if(r.reset)h.clear();else for(const k of r.removeTransformations||[])h.delete(k);
     h.add(r.id);
    }else if(!["recruit","transform","research","repeatResearch","freeResearch","eventResearch","missionResearch","externalInputs","conditionalCapGrowth","conditionalPromotion","conditionalMedal","advanceMonth","campaignContext"].includes(a.type))return null;
   }
   return h;
  }
  function history(gid,i){
   if(!histories.has(gid)){
    const g=ledger.graphs[gid],h=[];
    for(const [j,n] of g.nodes.entries())h.push(j===0?projectHistory(null,g.birthActions):projectHistory(h[n.parent],n.steps));
    histories.set(gid,h);
   }return histories.get(gid)[i];
  }
  const memo=new Map();
  canSkipReplay=id=>{
   if(memo.has(id))return memo.get(id);
   let safe=Boolean(immediate(id));
   if(!safe){
    const raw=ledger.routes[id],s=prep.researchTraitSets.records[id],p=prep.researchTraitSets.pairs[s.pairId],path=prep.researchTraitSets.paths[p.pathId],b=branches.get(p.branch),n=ledger.graphs[raw.sourceGraph].nodes[raw.sourceNode],h=history(raw.sourceGraph,raw.sourceNode);
    assert(b&&path&&p);
    const consumed=Object.fromEntries(Object.entries(prep.materialBudget.records[id]?.use||{}).map(([k,v])=>[k,v.consumed||0]));
    const inputs={body:p.body,history:h,historyKnown:!!h,active:new Set(path.active),raw:n.raw,capRaw:n.capRaw,finite:prep.materialBudget.finite,consumed};
    assert([...inputs.active].every(k=>typeof k==="string"));
    const q=first.assess(inputs,b),possibleIrreversible=inputs.historyKnown&&!q.openGrowth&&!q.unknownRules.length&&q.missingResearch.length>0&&Array.isArray(path.disabled)&&path.disabled.length>0;
    const shadePossible=shade.canAttempt(q,inputs);
    safe=!q.possibleExact&&!shadePossible&&!possibleIrreversible;
    if(!safe)scores.set(id,{tier:q.closed?0:q.possibleExact?1:shadePossible?2:3,missing:q.missingResearch.length,open:q.open.length,unknown:q.unknownRules.length,graph:raw.sourceGraph});
   }
   memo.set(id,safe);return safe;
  };
 }
 if(closureFirst){
  // Rank the remaining pairs by a best nontrivial witness. This is ONLY
  // scheduling: the final gate still replays all witnesses of each pair.
  const compare=(a,b)=>a.tier-b.tier||a.missing-b.missing||a.open-b.open||a.unknown-b.unknown;
  const pending=prep.plan.map((p,i)=>({p,i})).filter(({i})=>!already.has(i)).map(({p,i})=>{
   const candidates=p.routes.filter(id=>!canSkipReplay(id)).map(id=>scores.get(id));
   assert(candidates.every(Boolean));
   candidates.sort(compare);
   return {i,best:candidates[0]||{tier:4,missing:0,open:0,unknown:0,graph:""},replayCount:candidates.length,witnesses:p.routes.length};
  }).sort((a,b)=>compare(a.best,b.best)||a.replayCount-b.replayCount||a.best.graph.localeCompare(b.best.graph)||a.witnesses-b.witnesses||a.i-b.i);
  indices=pending.slice(0,limit).map(x=>x.i);
  const tiers={};for(const r of pending)tiers[r.best.tier]=(tiers[r.best.tier]||0)+1;
  scheduling={strategy:"CLOSURE_FIRST_HINT_V1",remaining:pending.length,tiers,selected:pending.slice(0,limit).map(({i,best,replayCount,witnesses})=>({i,tier:best.tier,missing:best.missing,open:best.open,replayCount,witnesses}))};
  console.log(JSON.stringify({phase:"closure-first scheduling",...scheduling}));
 }else indices=prep.plan.map((p,i)=>({p,i})).filter(({p,i})=>!already.has(i)&&p.routes.every(canSkipReplay)).slice(0,limit).map(x=>x.i);
}else if(next){
 indices=prep.plan.map((_,i)=>i).filter(i=>!already.has(i)).slice(0,limit);
}else{
 indices=Array.from({length:Math.min(limit,Math.max(0,prep.plan.length-offset))},(_,i)=>offset+i);
 for(const i of indices)assert(!already.has(i),"Batch overlaps existing result "+i);
}
const lines=indices.map(i=>prep.researchLineRows[i]);assert(lines.length>0,"No eligible unprocessed pairs");
assert.deepEqual(lines.map(x=>x.id),indices.map(i=>prep.plan[i].id));
const ids=new Set(lines.flatMap(r=>[r,...r.alternatives].map(x=>x.routeId)));
const graphs=new Set([...ids].map(id=>{const r=ledger.routes[id];assert(r);return r.sourceGraph;}));
// The v10 gate examines every descendant node in each selected graph.
// Other graphs are irrelevant to local successor checks, and the cross-
// graph repeat quotient is performed only once during the global merge.
const selected={...ledger,graphs:Object.fromEntries(Object.entries(ledger.graphs).filter(([id])=>graphs.has(id)))};
const c=db.careerCompletion;
c.researchTraitSets=prep.researchTraitSets;c.materialBudget=prep.materialBudget;
c.classifications={...c.classifications,missingbirth:Object.fromEntries([...ids].map(id=>[id,structuredClone(prep.classifications[id])]))};
const final=classifyFinalCareers({db,ledger:selected,data,replay:createSharedCareerReplay(data,ledger.summary),lines,sourceCatalog:catalog,requireFullRegression:false});
assert.deepEqual(Object.keys(final.witnesses).sort(),[...ids].sort());
const witnesses=Object.fromEntries(Object.entries(final.witnesses).map(([id,w])=>[id,unpackBodyScopeWitness(w,final.inventory)]));
for(const [id,v] of Object.entries(witnesses)){
 const r=prep.researchTraitSets.records[id];assert.equal(v.actionHash,r.actionHash);assert.equal(v.stateHash,r.stateHash);assert.equal(v.pairId,r.pairId);
 if(v.certificate){assert.equal(key(v.certificate),v.proofHash);assert.equal(v.certificate.graph,prep.sourceGraphSha256);assert.deepEqual(v.certificate.sourceHashes,final.sourceHashes);}
}
if(fast)assert(Object.values(witnesses).every(v=>["KNOWN_CONTINUATION","UNRESOLVED_FINITE_MATERIAL"].includes(v.status)),"Fast-pass selected a nontrivial witness");
if(staticPass){assert.equal(final.summary.incremental.fresh,0,"Static pass unexpectedly required independent replay");assert(Object.values(witnesses).every(v=>["KNOWN_CONTINUATION","UNRESOLVED_FINITE_MATERIAL","OPEN_RESEARCH_OR_GROWTH","OPEN_TRANSFORMATION"].includes(v.status)),"Static pass may never admit a final pair");}
const summary={attemptedPairs:lines.length,attemptedWitnesses:ids.size,localClosedPairs:final.rows.length,localEquivalentPairs:final.equivalent.length,unresolved:Object.values(witnesses).filter(v=>v.status.startsWith("UNRESOLVED")).length,counts:final.summary.counts,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_FULL_FINAL_BATCH_V1",sourceMetadataSha256:prep.sourceMetadataSha256,sourceGraphSha256:prep.sourceGraphSha256,preparedHash:manifest.preparedHash,planHash:prep.planHash,sourceHashes:final.sourceHashes,materialBudgetHash:prep.materialBudget.sha256,batch:{offset,limit,total:prep.plan.length,...((fast||staticPass||closureFirst||next)?{indices,selection:fast?"immediate-nonfinal":staticPass?"static-open":closureFirst?"closure-first-hint":"next-unprocessed"}:{})},pairIds:lines.map(r=>r.id),...(scheduling?{scheduling}:{}),summary,witnesses,ogreRegression:final.summary.ogreRegression,scope:"Local classification; final cross-batch quotient and all-pair coverage required before registry replacement."};
const file=stage+(fast||staticPass||closureFirst||next?"vo2-final-"+(fast?"fast":staticPass?"static":"next")+"-batch-"+key(indices).slice(0,16):"vo2-final-batch-"+offset+"-"+limit)+".json.gz";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out),{level:4}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({file,summary,byBody:final.summary.byFinalBody,metrics:final.summary.incremental,hash:key(out)}));
