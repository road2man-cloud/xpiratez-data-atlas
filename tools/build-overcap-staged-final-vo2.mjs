// Produce a scoped v10 admission receipt on the actual staged canonical ledger.
// A focused result is deliberately NOT installed in the published registry.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {ledgers,project} from "../public/branch-soldier-atlas-career-core.js";
import {classifyCandidate} from "./atlas-career-completion-core.mjs";
import {buildTerminalResearchTraitSets} from "./atlas-terminal-research-trait-sets.mjs";
import {admitResearchLines} from "./atlas-research-line-admission.mjs";
import {buildCareerMaterialBudget} from "./atlas-career-material-budget-v2-vo2.mjs";
import {classifyFinalCareers} from "./atlas-final-career-admission-v10-vo2-irreversible.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"CHORT";
assert(/^[A-Z0-9_]+$/.test(body));
const full=process.argv.includes("--full"),stage="tools/data/overcap-intake-stage-"+body+"/";
const ledger=decode(stage+"soldier-population-missing-origin-career.json.gz"),index=decode(stage+"soldier-population-missing-origin-career-index.json.gz");
const patch=read("tools/data/overcap-canonical-graph-patch-"+body+".json"),receipt=read("tools/data/overcap-staged-intake-receipt-"+body+".json");
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
const data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
const catalog=read("public/data/soldier-source-catalog.json");data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(db.sourceMetadataSha256,ledger.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);assert.equal(index.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(receipt.sourceGraphSha256,ledger.sourceGraphSha256);assert.equal(receipt.patchHash,key(patch));
assert.equal(db.careerCompletion.researchTraitSets.sourceGraphSha256,patch.baseGraphHash);
const c=db.careerCompletion,priorRows=c.rows.slice(),priorSets=c.researchTraitSets,priorLines=c.researchLineRows;
const replay=createSharedCareerReplay(data,ledger.summary);
const budget=buildCareerMaterialBudget(data,ledger);
const ids=new Set(patch.receipts.map(r=>r.routeId));
const priorMaterialIssues=priorRows.map(row=>{
 const all=[row,...(row.alternatives||[])],passing=all.filter(r=>!budget.records[r.routeId]?.hard?.length&&!budget.records[r.routeId]?.uncertain?.length&&budget.checkedRouteIds.includes(r.routeId));
 return {id:row.id,witnesses:all.length,passing:passing.length};
}).filter(r=>!r.passing);
console.log(JSON.stringify({phase:"v.o2 budget produced",checked:budget.checked,finite:Object.values(budget.finite).map(x=>[x.id,x.cap]),priorPairsWithNoPassingMaterialWitness:priorMaterialIssues.length}));
const selected=full?ledger:{...ledger,routes:Object.fromEntries(Object.entries(ledger.routes).filter(([id,r])=>ids.has(id)))};
const l=ledgers.find(l=>l.key==="missingbirth"),p=project(l,selected,db.sourceMetadataSha256);
assert.deepEqual(p.rejected,[]);const classes=full?{}:{};
for(const row of p.rows){
 const raw=selected.routes[row.id],cls=classifyCandidate({ledger:l,row,raw,db,index});
 assert(cls.traceHashVerified,JSON.stringify({route:row.id,error:cls.traceError}));
 classes[row.id]={status:cls.category,traceHashVerified:true,assumptions:cls.assumptions,missing:cls.missing,evidenceId:key([row.origin,row.branch,row.hash])};
}
c.classifications={...c.classifications,missingbirth:classes};c.materialBudget=budget;
const sets=buildTerminalResearchTraitSets({db,ledger:selected,index,replay,prior:priorSets});c.researchTraitSets=sets;
const lines=admitResearchLines({db,sets,ledger:selected,classifications:c.classifications,prior:{rows:priorLines}});
console.log(JSON.stringify({phase:"research/trait snapshots",summary:sets.summary,lines:lines.rows.length,rejected:lines.rejected.length}));
const final=classifyFinalCareers({db,ledger:selected,data,replay,lines:lines.rows,sourceCatalog:catalog,requireFullRegression:full});
const previous=new Set(priorRows.map(r=>r.id)),next=new Set(final.rows.map(r=>r.id));
const candidates=patch.receipts.map(r=>({candidate:r.candidate,routeId:r.routeId,pairId:sets.records[r.routeId]?.pairId??null,status:final.witnesses[r.routeId]?.status??"NOT_ADMITTED",proofHash:final.witnesses[r.routeId]?.proofHash??null,reason:final.witnesses[r.routeId]?.reason??null,material:budget.records[r.routeId]||{use:{},hard:[],uncertain:[]}}));
const summary={mode:full?"FULL_STAGED_V10":"FOCUSED_INTAKE_V10",previousPublicPairs:previous.size,classifiedPairs:lines.rows.length,passingPairs:next.size,candidatePassingWitnesses:candidates.filter(x=>x.status==="FINAL_CLOSED").length,candidateUniquePassingPairs:new Set(candidates.filter(x=>x.status==="FINAL_CLOSED").map(x=>x.pairId)).size,newPairIdsComparedToPublic:[...next].filter(id=>!previous.has(id)),missingPriorPairIds:full?[...previous].filter(id=>!next.has(id)):null,priorPairsWithNoPassingMaterialWitness:priorMaterialIssues.length,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_STAGED_FINAL_ADMISSION_V1",scope:"Staged conditional closure only; not a public registry replacement.",sourceMetadataSha256:ledger.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,baseGraphHash:patch.baseGraphHash,materialBudgetHash:budget.sha256,summary,candidates,priorMaterialIssues,materialBudget:budget,admission:final,researchTraitSets:sets,researchLineRows:lines.rows,classifications:classes};
const file=stage+"vo2-"+(full?"full":"focused")+"-admission.json";
fs.writeFileSync(file,JSON.stringify(out)+"\n");
console.log(JSON.stringify({file,summary,candidates,finalSummary:final.summary},null,2));
