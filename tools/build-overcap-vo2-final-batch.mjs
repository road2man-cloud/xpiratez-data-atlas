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
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"POD_REPAIR";
const fast=process.argv.includes("--fast-pass"),next=process.argv.includes("--next"),offset=Number(process.argv.find(x=>x.startsWith("--offset="))?.slice(9)||0),limit=Number(process.argv.find(x=>x.startsWith("--limit="))?.slice(8)||(fast?2000:6));
assert(/^[A-Z0-9_]+$/.test(body)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
assert(!(fast&&next),"Choose one automatic selection mode");
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
for(const name of fs.readdirSync(stage).filter(n=>/^vo2-final-(?:batch-\d+-\d+|(?:fast|next)-batch-[a-f0-9]+)\.json\.gz$/.test(n))){
 const d=decode(stage+name);assert.equal(d.preparedHash,manifest.preparedHash);assert.equal(d.planHash,prep.planHash);
 const ix=d.batch.indices||Array.from({length:d.pairIds.length},(_,i)=>d.batch.offset+i);
 assert.deepEqual(ix.map(i=>prep.plan[i].id),d.pairIds);
 for(const i of ix){assert(!already.has(i),"Overlapping existing batches "+i);already.add(i);}
}
let indices;
if(fast){
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
 indices=prep.plan.map((p,i)=>({p,i})).filter(({p,i})=>!already.has(i)&&p.routes.every(immediate)).slice(0,limit).map(x=>x.i);
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
const summary={attemptedPairs:lines.length,attemptedWitnesses:ids.size,localClosedPairs:final.rows.length,localEquivalentPairs:final.equivalent.length,unresolved:Object.values(witnesses).filter(v=>v.status.startsWith("UNRESOLVED")).length,counts:final.summary.counts,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_FULL_FINAL_BATCH_V1",sourceMetadataSha256:prep.sourceMetadataSha256,sourceGraphSha256:prep.sourceGraphSha256,preparedHash:manifest.preparedHash,planHash:prep.planHash,sourceHashes:final.sourceHashes,materialBudgetHash:prep.materialBudget.sha256,batch:{offset,limit,total:prep.plan.length,...((fast||next)?{indices,selection:fast?"immediate-nonfinal":"next-unprocessed"}:{})},pairIds:lines.map(r=>r.id),summary,witnesses,ogreRegression:final.summary.ogreRegression,scope:"Local classification; final cross-batch quotient and all-pair coverage required before registry replacement."};
const file=stage+(fast||next?"vo2-final-"+(fast?"fast":"next")+"-batch-"+key(indices).slice(0,16):"vo2-final-batch-"+offset+"-"+limit)+".json.gz";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out),{level:4}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({file,summary,byBody:final.summary.byFinalBody,metrics:final.summary.incremental,hash:key(out)}));
