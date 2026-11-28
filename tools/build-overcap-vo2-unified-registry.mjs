// Assemble a single browser-compatible career registry from the staged graph,
// preparation and global final quotient. Never install an incomplete build.
// Existing public assets are input only; this producer writes a release candidate
// into tools/data. The public loader is exercised on the actual assembled bytes.
import fs from "node:fs";
import {requireNormalizedResearch} from "./atlas-overcap-research-normalization-gate.mjs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {key,sha} from "./population-research-career-core.mjs";
import {ledgers,project,loadCareerRows} from "../public/branch-soldier-atlas-career-core.js";
import {CAREER_STAT_POLICY} from "../public/branch-soldier-stat-comparison-policy.js";
import {summarizeMaxComparison,summarizeOriginCoverage} from "../public/branch-soldier-max-frontier.js";
import {summarizeCareerIncumbents} from "./population-career-incumbents.mjs";
import {createMaterialIndex,summarizeMaterialComparison} from "../public/branch-soldier-material-frontier-v2.js";
import {createRepeatComparison} from "../public/branch-soldier-repeat-comparison.js";
import {packResearchPaths,hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {packEconomyDetails} from "../public/branch-soldier-economy-detail-codec.js";
import {hydrateSharedCareerSections,packSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {unpackBodyScopeWitness} from "../public/branch-soldier-final-scope-codec.js";
import {RESEARCH_LINE_PROOF} from "./atlas-research-line-admission.mjs";
import {FINAL_SCHEMA} from "./atlas-final-career-admission-v10-vo2-irreversible.mjs";
import {SCOPE} from "./atlas-body-career-scope-v5-vo2-irreversible.mjs";
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"POD_RETRY_B";
assert(/^[A-Z0-9_]+$/.test(body));
const stage="tools/data/overcap-intake-stage-"+body+"/",read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const baseFile="public/data/branch-soldier-results.json.gz",baseBytes=fs.readFileSync(baseFile);
const db=hydrateSharedCareerSections(hydrateResearchPaths(JSON.parse(gunzipSync(baseBytes)))),c=db.careerCompletion,modern=read("public/data/soldiers-modern-index.json");
const metadata=db.sourceMetadataSha256;
const prep=decode(stage+"vo2-full-prepared.json.gz"),manifest=read("tools/data/overcap-vo2-full-prepared-manifest-"+body+".json");
const merge=decode(stage+"vo2-final-merged.json.gz"),progress=read("tools/data/overcap-vo2-final-merge-progress-"+body+".json");
assert.equal(key(prep),manifest.preparedHash);assert.equal(key(merge),progress.mergeHash);assert.equal(key(prep.plan),prep.planHash);
assert.equal(merge.preparedHash,manifest.preparedHash);assert.equal(merge.planHash,prep.planHash);assert.equal(merge.sourceGraphSha256,prep.sourceGraphSha256);
assert.equal(merge.materialBudgetHash,prep.materialBudget.sha256);assert.equal(merge.sourceMetadataSha256,metadata);assert.equal(modern.meta.source.metadataSha256,metadata);
for(const [p,h] of Object.entries(merge.sourceHashes))assert.equal(key(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h);
const ledgerFile=stage+"soldier-population-missing-origin-career.json.gz",ledgerBytes=fs.readFileSync(ledgerFile),ledger=JSON.parse(gunzipSync(ledgerBytes));
requireNormalizedResearch({stage,ledger});
const ixBytes=fs.readFileSync(stage+"soldier-population-missing-origin-career-index.json.gz"),ix=JSON.parse(gunzipSync(ixBytes));
assert.equal(key(ledger.graphs),prep.sourceGraphSha256);assert.equal(ledger.sourceGraphSha256,ix.sourceGraphSha256);
assert.equal(key(ledger.indexRoutes),key(ix.routes));assert.equal(key(ledger.nodes),key(ix.nodes));assert.equal(key(ledger.actionNodes),key(ix.actionNodes));
const old=db.populationMissingOriginCareer,oldHashes=c.sourceHashes,oldRouteIds=new Set(Object.keys(old.routes));
assert.equal(old.sourceGraphSha256,prep.baseGraphHash);
assert.equal(key(old.routes),oldHashes.missingbirth.routes);
const oldPairs=new Set(Object.values(old.routes).map(r=>r.origin+"|"+r.branch));
for(const [id,r] of Object.entries(old.routes))assert.deepEqual(ledger.routes[id],r,"Changed existing route "+id);
// Recompute source coverage over the same seven projected ledgers used
// by the canonical builder, including any newly connected origin/branch.
const coverageOrigins=new Set(),coverageBranches=new Set(),coveragePairs=new Set();
for(const l of ledgers){
 const p="public/data/"+l.file+".json.gz";
 const source=l.key==="missingbirth"?ledger:(l.registryKey&&db[l.registryKey])||JSON.parse(gunzipSync(fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:256*1024*1024})));
 const rows=project(l,source,metadata);
 assert.equal(rows.rejected.length,c.bySource[l.key].rejected);
 for(const r of rows.rows){coverageOrigins.add(r.origin);coverageBranches.add(r.branch);coveragePairs.add(r.origin+"|"+r.branch);}
}
const newlyConnectedPairs=[...new Set(Object.values(ledger.routes).map(r=>r.origin+"|"+r.branch))].filter(k=>!oldPairs.has(k));
// The public companion intentionally exposes a filtered projection of the
// procurement ledger. Preserve that projection; verify its exact records.
for(const [k,v] of Object.entries(old.terminalSupply)){
 if(k==="plans"){for(const [id,r] of Object.entries(v))assert.equal(key(ledger.terminalSupply.plans[id]),key(r),"Changed public supply plan "+id);}
 else assert.equal(key(ledger.terminalSupply[k]),key(v),"Changed public supply field "+k);
}
assert.equal(key(c.terminalSupply),key(old.terminalSupply),"Divergent public supply companions");
for(const [id,r] of Object.entries(old.terminalResearch.records))assert.deepEqual(ledger.terminalResearch.records[id],r);
assert.equal(Object.keys(prep.classifications).length,Object.keys(ledger.routes).length);
assert.equal(prep.researchTraitSets.sourceGraphSha256,ledger.sourceGraphSha256);
assert.deepEqual(prep.researchLineRejected,[]);
assert.equal(prep.researchLineRows.length,prep.plan.length);
assert.equal(merge.admission.rows.length,merge.summary.conditionalClosedPairs);
assert.equal(merge.admission.schema,FINAL_SCHEMA);
assert.equal(merge.admission.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(merge.summary.previousPublicPairs,c.rows.length);
assert(merge.priorStatus.every(x=>x.status==="RETAINED"||x.status==="REPLACEMENT_CANDIDATE"),"Do not publish while prior rows are unresolved");
const finalIds=new Set(merge.admission.rows.map(r=>r.id));
for(const r of merge.priorStatus)assert(finalIds.has(r.replacement?.replacementPair||r.id),"Missing retained/replacement final row "+r.id);
for(const [id,v] of Object.entries(merge.admission.witnesses)){
 const raw=ledger.routes[id],snap=prep.researchTraitSets.records[id];assert(raw&&snap&&v.pairId===snap.pairId&&v.actionHash===raw.fullActionHash&&v.stateHash===raw.canonicalStateHash);
 if(v.status==="FINAL_CLOSED"||v.status==="FINAL_EQUIVALENT"){
  const cert=v.certificate;assert(cert?.independentReplay&&cert.graph===ledger.sourceGraphSha256&&cert.actions===v.actionHash&&cert.state===v.stateHash&&cert.pair===v.pairId&&key(cert)===v.proofHash);
  assert.deepEqual(cert.sourceHashes,merge.sourceHashes);
 }
}
const sourceHashes={...oldHashes,missingbirth:{...oldHashes.missingbirth,sha256:sha(ledgerBytes),routes:key(ledger.routes)}};
db.populationMissingOriginCareer={...old,sourceGraphSha256:ledger.sourceGraphSha256,sha256:sha(ledgerBytes),routes:ledger.routes,published:Object.keys(ledger.routes).length,summary:ledger.summary,terminalResearch:ledger.terminalResearch};
c.sourceHashes=sourceHashes;c.terminalResearch=ledger.terminalResearch;
const rebound=[];
for(const name of ["earlyEconomy","researchCalendar","codexSourcePrefixes","financedCareerCalendar","auxiliaryCareerCalendar","initialEventSchedules"]){
 const r=c[name];if(!r)continue;
 // This is the same append-only source rebinding policy as the existing
 // production builder; the old economic plans and all old route IDs survive.
 if(key(r.sourceHashes)===key(oldHashes)){c[name]={...r,sourceHashesAtProduction:r.sourceHashesAtProduction||r.sourceHashes,sourceHashes};rebound.push(name);}
}
c.classifications={...c.classifications,missingbirth:prep.classifications};
c.researchTraitSets=prep.researchTraitSets;c.materialBudget=prep.materialBudget;
c.researchLineRows=prep.researchLineRows;c.researchLineAdmission={schema:RESEARCH_LINE_PROOF,scope:"EXPLORATION: continuous replay to active terminal research goal, not final development closure.",rejected:prep.researchLineRejected};
const counts={...merge.summary.counts},scopeTotals={branchExcluded:0,otherObjectives:0,repeatFixed:0,allBodyClosedWitnesses:0,bodyScopedClosedWitnesses:0},ogreSeven=[];
for(const [id,v] of Object.entries(merge.admission.witnesses)){
 const cls=c.classifications.missingbirth[id],snap=c.researchTraitSets.records[id];assert(cls?.researchLineId===v.pairId);
 cls.finalCareerStatus=v.status;cls.status=v.status==="FINAL_CLOSED"?"FINAL_CAREER_COMPLETE":v.status==="FINAL_EQUIVALENT"?"FINAL_EQUIVALENT":"RESEARCH_LINE_EXPLORATION";
 if(v.next||v.equivalentTo)cls.nextCareerRoute=v.next||v.equivalentTo;
 const e=v.certificate||unpackBodyScopeWitness(v,merge.admission.inventory);
 scopeTotals.branchExcluded+=(e.blocked||[]).filter(x=>["SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH","SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH_TRANSITIVE"].includes(x.reason)).length;
 scopeTotals.otherObjectives+=(e.alternativeObjectives||[]).length;scopeTotals.repeatFixed+=(e.repeatProofs||[]).length;
 if(v.status==="FINAL_CLOSED")scopeTotals[e.allBodyFirstActionsClosed?"allBodyClosedWitnesses":"bodyScopedClosedWitnesses"]++;
 const raw=ledger.routes[id];if(raw.body==="STR_SOLDIER_OGRE"&&Object.keys(c.researchTraitSets.traits[snap.traitId]).length===7)ogreSeven.push({route:id,status:v.status,graph:raw.sourceGraph,node:raw.sourceNode,traits:7});
}
for(const r of merge.unprocessed)for(const id of prep.plan[r.i].routes){
 const cls=c.classifications.missingbirth[id];assert(cls?.researchLineId===r.id&&!merge.admission.witnesses[id]);
 cls.status="RESEARCH_LINE_EXPLORATION";cls.finalCareerStatus="UNPROCESSED_V10";
}
const byFinalBody={};
for(const row of merge.admission.rows){const b=c.researchTraitSets.pairs[row.id].body;byFinalBody[b]=(byFinalBody[b]||0)+1;}
const admissionSummary={scope:SCOPE,scopeTotals,byFinalBody,reclassifiedCombinations:merge.summary.processedPairs,classifiedWitnesses:merge.summary.processedWitnesses,rawClosedCombinations:merge.summary.rawClosedCombinations,equivalentCombinations:merge.summary.equivalentCombinations,completeCombinations:merge.summary.conditionalClosedPairs,explorationCombinations:prep.plan.length-merge.summary.conditionalClosedPairs-merge.summary.equivalentCombinations,completeWitnesses:counts.FINAL_CLOSED||0,counts,ogreRegression:merge.admission.ogreRegression,ogreSeven,productionCoverage:{processedPairs:merge.summary.processedPairs,totalPairs:prep.plan.length,unprocessedPairs:merge.summary.unprocessedPairs,complete:merge.summary.complete}};
c.finalCareerAdmission={...merge.admission,scope:"Selected active victory research and fixed final body; source-bound v.o2 finite materials; independently replayed closure only. Partial production coverage is explicit; no actual gameplay or global optimum claimed.",summary:admissionSummary};
c.rows=c.finalCareerAdmission.rows;
const summary=c.summary,seen=new Set(),assumptions={},missingProofs=Object.fromEntries(c.requiredProofs.map(k=>[k,0]));
let candidates=0,duplicateEvidence=0,traceVerified=0,traceMissing=0;
for(const l of ledgers){
 const cls=c.classifications[l.key];assert(cls);
 let dup=0;
 for(const r of Object.values(cls)){
  candidates++;const d=seen.has(r.evidenceId);assert(r.evidenceId);r.duplicateEvidence=d;
  if(d){dup++;duplicateEvidence++;}else seen.add(r.evidenceId);
  if(r.traceHashVerified)traceVerified++;else traceMissing++;
  for(const k of r.assumptions||[])assumptions[k]=(assumptions[k]||0)+1;
  for(const k of r.missing||[])missingProofs[k]=(missingProofs[k]||0)+1;
 }
 c.bySource[l.key].duplicates=dup;
}
const missing=ledgers.find(x=>x.key==="missingbirth"),projection=project(missing,ledger,metadata);
assert.deepEqual(projection.rejected,[]);
Object.assign(c.bySource.missingbirth,{rows:projection.rows.length,rejected:0,traceVerified:projection.rows.length,traceMissing:0,conditionalClosed:projection.rows.filter(r=>r.conditionalScopeComplete).length,fixedModelBound:projection.rows.filter(r=>r.fixedModelOptimum).length,complete:c.rows.length,researchLineCombinations:c.researchLineRows.length,researchLineWitnesses:prep.summary.researchLineWitnesses});
Object.assign(summary,{originsWithSeeds:coverageOrigins.size,branchesWithSeeds:coverageBranches.size,exploredOriginBranchPairs:coveragePairs.size,candidateRows:candidates,uniqueEvidence:seen.size,duplicateEvidence,traceVerified,traceMissing,assumptions,missingProofs,actualGameProofMissing:missingProofs,completeCombinations:c.rows.length,researchLineCombinations:c.researchLineRows.length,researchLineWitnesses:prep.summary.researchLineWitnesses,actualGameCombinations:0,finalCareer:admissionSummary,researchTraitSets:c.researchTraitSets.summary,materialBudget:Object.fromEntries(["checked","withFinite","hardViolations","indexedUnresolved","counts"].map(k=>[k,c.materialBudget[k]])),pendingBySource:{...summary.pendingBySource,missingbirth:ledger.summary.states-ledger.summary.processed}});
c.researchTraitSets.summary={...c.researchTraitSets.summary,researchLineCombinations:c.researchLineRows.length,actualGameCombinations:0,complete:c.rows.length};summary.researchTraitSets=c.researchTraitSets.summary;
const line=await loadCareerRows(modern,db,{includeWitnesses:true,scope:"research-line"}),final=await loadCareerRows(modern,db,{includeWitnesses:true,scope:"final"});
assert.deepEqual(line.errors,[]);assert.deepEqual(final.errors,[]);
assert.equal(line.rows.length,prep.summary.researchLineWitnesses);assert.equal(final.rows.length,counts.FINAL_CLOSED);
assert.equal(new Set(final.rows.map(r=>r.completionId)).size,c.rows.length);
const omit=(o,k)=>{const x={...o};delete x[k];return x;};
function comparisons(rows){
 const a=summarizeOriginCoverage(modern.profiles,rows),maxComparison=summarizeMaxComparison(rows),materialComparison=summarizeMaterialComparison(rows,createMaterialIndex(c.materialBudget)),repeatComparison=createRepeatComparison(db).summarize(rows.map(r=>({...r,complete:true}))),observedIncumbents=summarizeCareerIncumbents(rows);
 return {originCoverage:a.origins,chortCoverage:a.chort,observedIncumbents,maxComparison,materialComparison,repeatComparison,coverageSummary:a.summary};
}
function comparisonSummary(x){return {...x.coverageSummary,maxComparison:omit(x.maxComparison,"routeIds"),materialComparison:omit(x.materialComparison,"routeIds"),repeatComparison:omit(x.repeatComparison,"suppressedRouteIds"),observedIncumbents:x.observedIncumbents.summary};}
const exploration=comparisons(line.rows),confirmed=comparisons(final.rows);
c.researchLineExploration={summary:{...summary,...comparisonSummary(exploration),completeCombinations:0,researchLineCombinations:c.researchLineRows.length,unresolvedEvidence:seen.size-new Set(line.rows.map(r=>c.classifications.missingbirth[r.id].evidenceId)).size},originCoverage:exploration.originCoverage,chortCoverage:exploration.chortCoverage,observedIncumbents:exploration.observedIncumbents,maxComparison:exploration.maxComparison,materialComparison:exploration.materialComparison,repeatComparison:exploration.repeatComparison};
confirmed.maxComparison.scope="Successor-closed final career witnesses only; commendation bonuses excluded.";
confirmed.materialComparison.scope=confirmed.maxComparison.scope;
for(const k of ["originCoverage","chortCoverage","observedIncumbents","maxComparison","materialComparison","repeatComparison"])c[k]=confirmed[k];
Object.assign(summary,comparisonSummary(confirmed),{unresolvedEvidence:seen.size-new Set(Object.entries(merge.admission.witnesses).filter(([,v])=>["FINAL_CLOSED","FINAL_EQUIVALENT"].includes(v.status)).map(([id])=>c.classifications.missingbirth[id].evidenceId)).size,statComparison:{policy:CAREER_STAT_POLICY.id,projectedRows:summary.candidateRows,rejectedRows:summary.invalidProjection,researchLineWitnesses:line.rows.length,finalWitnesses:final.rows.length,medalBearingFinalWitnesses:final.rows.filter(r=>Object.keys(r.medals||{}).length).length}});
db.summary.careerCompletion=summary;db.summary.populationMissingOriginCareer=ledger.summary;
const coverage={schema:"ATLAS_VO2_STAGED_UNIFIED_REGISTRY_V1",sourceMetadataSha256:metadata,sourceGraphSha256:ledger.sourceGraphSha256,baseGraphHash:prep.baseGraphHash,sourcePublicRegistrySha256:sha(baseBytes),preparedHash:manifest.preparedHash,mergeHash:progress.mergeHash,planHash:prep.planHash,productionCoverage:admissionSummary.productionCoverage,priorRetained:merge.summary.priorRetained,priorReplacementCandidates:merge.summary.priorReplacementCandidates,priorNotClosed:merge.summary.priorNotClosed,publicRegistryChanged:false,publicationReady:merge.summary.complete&&merge.admission.ogreRegression.length>0,finalPairs:c.rows.length,finalWitnesses:final.rows.length,researchLinePairs:c.researchLineRows.length,researchLineWitnesses:line.rows.length,byFinalBody,reboundCompanions:rebound,newlyConnectedPairs,actualGameCertified:false,sourceAssets:{ledgerSha256:sha(ledgerBytes),indexSha256:sha(ixBytes)},scope:"One common registry release candidate. Do not deploy a partial build. Existing comparison UI loader was used, not a separate comparison table."};
c.productionCoverage=coverage;
db.policies.CAREER_COMPLETION="선택 연구 분기 및 최종 병종 유지 조건부 종결. 전체 생산 범위는 productionCoverage에 기록. 실제 게임 및 전역 최적은 미인증.";
const filename=stage+"vo2-unified-registry.json.gz",bytes=gzipSync(JSON.stringify(packSharedCareerSections(packEconomyDetails(packResearchPaths(db)))),{level:4});
fs.writeFileSync(filename+".tmp",bytes);fs.renameSync(filename+".tmp",filename);
const report={...coverage,registrySha256:sha(bytes),registryBytes:bytes.length,loader:{researchLineRows:line.rows.length,finalRows:final.rows.length,errors:0},file:filename,sourceCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()};
fs.writeFileSync("tools/data/overcap-vo2-unified-registry-"+body+".json",JSON.stringify(report)+"\n");
console.log(JSON.stringify(report));
