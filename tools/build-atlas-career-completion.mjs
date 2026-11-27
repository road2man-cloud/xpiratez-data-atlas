// Classify and admit into the existing common registry, never a parallel DB.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {ledgers,project,loadCareerRows} from "../public/branch-soldier-atlas-career-core.js";
import {CAREER_STAT_POLICY} from "../public/branch-soldier-stat-comparison-policy.js";
import {summarizeMaxComparison,summarizeOriginCoverage} from "../public/branch-soldier-max-frontier.js";
import {summarizeCareerIncumbents} from "./population-career-incumbents.mjs";
import {SCHEMA,REQUIRED_PROOFS,classifyCandidate,evidenceIdentity,admitVerified} from "./atlas-career-completion-core.mjs";
import {key,sha} from "./population-research-career-core.mjs";
import {RESEARCH_TREE_POLICY} from "./atlas-research-tree-policy.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {sharedRankData} from "./population-shared-default-rank.mjs";
import {buildTerminalResearchTraitSets} from "./atlas-terminal-research-trait-sets.mjs";
import {admitResearchLines,RESEARCH_LINE_PROOF} from "./atlas-research-line-admission.mjs";
import {classifyFinalCareers} from "./atlas-final-career-admission-v7-passive-armor.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy.mjs";
import {createMaterialIndex,summarizeMaterialComparison} from "../public/branch-soldier-material-frontier-v2.js";
import {createRepeatComparison} from "../public/branch-soldier-repeat-comparison.js";
import {packResearchPaths,hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {completionStage} from "./atlas-career-completion-stage.mjs";
import {packEconomyDetails} from "../public/branch-soldier-economy-detail-codec.js";
import {hydrateSharedCareerSections,packSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
// Original YAML is needed only for a fresh source extraction.
const file="public/data/branch-soldier-results.json.gz";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const stage=completionStage();
async function prepare(){
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode(file))),modern=read("public/data/soldiers-modern-index.json"),metadata=db.sourceMetadataSha256;
assert.equal(modern.meta.source.metadataSha256,metadata);
const prior=db.careerCompletion;
const priorLineRows=prior?.researchLineRows||prior?.rows||[];
const gameRoot=process.argv.find(x=>x.startsWith("--game-root="))?.slice(12);
const terminalRule=gameRoot?(await import("./atlas-terminal-rule-source.mjs")).extractTerminalRules(modern,gameRoot):prior?.terminalRule?.sourceMetadataSha256===metadata?prior.terminalRule:{status:"UNRESOLVED",reason:"Original terminal rules not extracted"};
const terminalResearch=db.populationMissingOriginCareer?.terminalResearch||null;
const terminalSupply=db.populationMissingOriginCareer?.terminalSupply||null;
const bySource={},classifications={},sourceHashes={},seen=new Set(),pairs=new Set(),branches=new Set(),origins=new Set(),admitted=new Map();
const missingProofs=Object.fromEntries(REQUIRED_PROOFS.map(k=>[k,0])),assumptions={};
let candidates=0,traceVerified=0,traceMissing=0,conditionalClosed=0,fixedModelBound=0,legacyCertified=0,invalidProjection=0,duplicateEvidence=0;
// A real verifier must be an implemented original-rule/engine or gameplay
// replay adapter. A JSON assertion or a user-supplied flag is not a verifier.
const verifyEvidence=null;
for(const ledger of ledgers){
 const path="public/data/"+ledger.file+".json.gz",bytes=fs.readFileSync(path),data=JSON.parse(gunzipSync(bytes));
 const index=ledger.index?decode("public/data/"+ledger.index+".json.gz"):null;
 sourceHashes[ledger.key]={asset:ledger.file,sha256:sha(bytes),routes:key(data.routes)};
 const {rows,rejected}=project(ledger,data,metadata);
 const stats={rows:rows.length,rejected:rejected.length,traceVerified:0,traceMissing:0,conditionalClosed:0,fixedModelBound:0,duplicates:0,complete:0};
 bySource[ledger.key]=stats;classifications[ledger.key]={};
 invalidProjection+=rejected.length;
 for(const row of rows){
  const raw=data.routes[row.id],cls=classifyCandidate({ledger,row,raw,db,index});
  candidates++;origins.add(row.origin);branches.add(row.branch);pairs.add(row.origin+"|"+row.branch);
  if(cls.traceHashVerified){traceVerified++;stats.traceVerified++;}else{traceMissing++;stats.traceMissing++;}
  if(row.conditionalScopeComplete){conditionalClosed++;stats.conditionalClosed++;}
  if(row.fixedModelOptimum){fixedModelBound++;stats.fixedModelBound++;}
  if(cls.actualGameCertified)legacyCertified++;
  const id=evidenceIdentity(row),duplicate=seen.has(id);
  if(duplicate){duplicateEvidence++;stats.duplicates++;}else seen.add(id);
  for(const a of cls.assumptions)assumptions[a]=(assumptions[a]||0)+1;
  const record=admitVerified({row,raw,db,classification:cls,verifyEvidence});
  if(record){
   stats.complete++;
   const old=admitted.get(record.id);
   if(old)old.alternatives.push({source:row.source,routeId:row.id,actionHash:row.hash,proofHash:record.proofHash});
   else admitted.set(record.id,record);
  }else for(const p of cls.missing)missingProofs[p]++;
  classifications[ledger.key][row.id]={status:record?"COMPLETE":cls.category,traceHashVerified:cls.traceHashVerified,
   ...(cls.traceError?{traceError:cls.traceError}:{}),assumptions:cls.assumptions,evidenceId:id,
   duplicateEvidence:duplicate,missing:record?[]:cls.missing};
 }
}
// Existing companions are tied to exact route/action IDs. A pure append
// must not invalidate them just because the containing archive grew.
const appendOnly=!!prior?.classifications&&Object.entries(prior.classifications).every(([source,old])=>Object.entries(old).every(([id,r])=>classifications[source]?.[id]?.evidenceId===r.evidenceId));
if(appendOnly&&key(prior.sourceHashes)!==key(sourceHashes)){
 for(const name of ["earlyEconomy","researchCalendar","codexSourcePrefixes","financedCareerCalendar","auxiliaryCareerCalendar","initialEventSchedules"]){
  const old=prior[name];if(old&&key(old.sourceHashes)===key(prior.sourceHashes))prior[name]={...old,sourceHashesAtProduction:old.sourceHashesAtProduction||old.sourceHashes,sourceHashes};
 }
}
const rows=[...admitted.values()].sort((a,b)=>a.id.localeCompare(b.id));
if(prior?.rows?.length)for(const p of prior.rows)if(p.proofKind!==RESEARCH_LINE_PROOF)assert(admitted.has(p.id),"Previously certified gameplay combination needs a re-verifier: "+p.id);
const shared=db.populationMissingOriginCareer?.summary||{},newpair=db.populationNewPairCareer?.summary||{},research=db.populationResearchCareer?.summary||{},frontier=db.populationFrontierChronology?.summary||{};
const alternatingPath="public/data/soldier-final-career-alternating-v9.json.gz";
const alt=fs.existsSync(alternatingPath)?decode(alternatingPath):null;
const n=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const pendingBySource={terminalSupply:n(terminalSupply?.pending),missingbirth:n(shared.states-shared.processed),alternating:alt?.graphs?Object.values(alt.graphs).reduce((s,g)=>s+(g.nodes||[]).filter(n=>!n.edges).length,0):null,
 newpair:n(newpair.pendingStates),research:n(research.continuationPending),frontierHorizon:n(frontier.horizonPending),frontierRankHorizon:n(frontier.rankHorizonPending)};
const summary={origins:modern.profiles.length,originsWithSeeds:origins.size,staticBranches:db.branches.length,
 branchesWithConditionalResearch:db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount).length,branchesWithSeeds:branches.size,
 candidateRows:candidates,uniqueEvidence:seen.size,duplicateEvidence,invalidProjection,conditionalClosed,fixedModelBound,legacyCertified,
 traceVerified,traceMissing,unresolvedEvidence:seen.size-rows.length,completeCombinations:rows.length,
 equivalentCombinationsCompressed:[...admitted.values()].reduce((s,r)=>s+r.alternatives.length,0),
 impossibleCertified:0,fullyEnumeratedBranches:0,globalOptimalCertified:rows.filter(r=>r.globalOptimal).length,
 exploredOriginBranchPairs:pairs.size,totalSearchSpace:null,completionRate:null,pendingBySource,missingProofs,assumptions};
db.careerCompletion={schema:SCHEMA,sourceMetadataSha256:metadata,engineVersion:"8.7.1",sourceHashes,
 terminalRule,terminalResearch,terminalSupply,researchTreePolicy:RESEARCH_TREE_POLICY,statComparisonPolicy:CAREER_STAT_POLICY,
 ...(db.populationMissingOriginCareer?.endStage?.sourceFingerprint===terminalRule.fingerprint?{endStage:db.populationMissingOriginCareer.endStage}:{}),
 ...(db.populationMissingOriginCareer?.resetRecovery?.sourceFingerprint===terminalRule.fingerprint?{resetRecovery:db.populationMissingOriginCareer.resetRecovery}:{}),
 ...(db.populationMissingOriginCareer?.traitChain?.sourceFingerprint===terminalRule.fingerprint?{traitChain:db.populationMissingOriginCareer.traitChain}:{}),
 ...(db.populationMissingOriginCareer?.summary?.branchCoverage?{branchCoverage:db.populationMissingOriginCareer.summary.branchCoverage}:{}),
 ...(prior?.terminalEconomy?.sourceMetadataSha256===metadata&&prior.terminalEconomy.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&[...Object.values(prior.terminalEconomy.records||{}),...(prior.terminalEconomy.unresolved||[])].every(r=>terminalSupply?.plans?.[r.planId]?.plan?.planHash===r.planHash)?{terminalEconomy:prior.terminalEconomy}:{}),
 ...(prior?.earlyEconomy?.sourceMetadataSha256===metadata&&prior.earlyEconomy.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&key(prior.earlyEconomy.sourceHashes)===key(sourceHashes)&&Object.values(prior.earlyEconomy.records||{}).every(r=>r.linkedPlanIds.every(id=>terminalSupply?.plans?.[id]?.graph===r.graph&&terminalSupply?.plans?.[id]?.node===r.node))?{earlyEconomy:prior.earlyEconomy}:{}),
 ...(prior?.researchCalendar?.sourceMetadataSha256===metadata&&prior.researchCalendar.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&key(prior.researchCalendar.sourceHashes)===key(sourceHashes)&&Object.values(prior.researchCalendar.records||{}).every(r=>r.linkedPlanIds.every(id=>terminalSupply?.plans?.[id]?.graph===r.graph&&terminalSupply?.plans?.[id]?.node===r.node))?{researchCalendar:prior.researchCalendar}:{}),
 ...(prior?.codexSourcePrefixes?.sourceMetadataSha256===metadata&&prior.codexSourcePrefixes.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&key(prior.codexSourcePrefixes.sourceHashes)===key(sourceHashes)&&Object.values(prior.codexSourcePrefixes.records||{}).every(r=>r.linkedPlanIds.every(id=>terminalSupply?.plans?.[id]?.graph===r.graph&&terminalSupply?.plans?.[id]?.node===r.node))?{codexSourcePrefixes:prior.codexSourcePrefixes}:{}),
 ...(prior?.financedCareerCalendar?.sourceMetadataSha256===metadata&&prior.financedCareerCalendar.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&key(prior.financedCareerCalendar.sourceHashes)===key(sourceHashes)&&prior.financedCareerCalendar.codexFingerprint===prior.codexSourcePrefixes?.producerFingerprint&&Object.values(prior.financedCareerCalendar.records||{}).every(r=>prior.codexSourcePrefixes?.records?.[r.codexId]?.prefixId===r.prefixHash&&r.linkedPlanIds.every(id=>terminalSupply?.plans?.[id]?.graph===r.graph&&terminalSupply?.plans?.[id]?.node===r.node)&&/^data\/soldier-financed-career-details\/[a-f0-9]{64}\.json\.gz$/.test(r.detailFile)&&fs.existsSync("public/"+r.detailFile))?{financedCareerCalendar:prior.financedCareerCalendar}:{}),
 ...(prior?.auxiliaryCareerCalendar?.sourceMetadataSha256===metadata&&prior.auxiliaryCareerCalendar.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&key(prior.auxiliaryCareerCalendar.sourceHashes)===key(sourceHashes)&&prior.auxiliaryCareerCalendar.codexFingerprint===prior.codexSourcePrefixes?.producerFingerprint&&prior.auxiliaryCareerCalendar.financedFingerprint===prior.financedCareerCalendar?.producerFingerprint&&Object.values(prior.auxiliaryCareerCalendar.records||{}).every(r=>prior.financedCareerCalendar?.records?.[r.financedId]?.routeId===r.routeId&&prior.financedCareerCalendar.records[r.financedId].prefixHash===r.prefixHash&&prior.codexSourcePrefixes?.records?.[r.codexId]?.prefixId===r.prefixHash&&r.linkedPlanIds.every(id=>terminalSupply?.plans?.[id]?.graph===r.graph&&terminalSupply?.plans?.[id]?.node===r.node)&&/^data\/soldier-financed-career-details\/[a-f0-9]{64}\.json\.gz$/.test(r.detailFile)&&fs.existsSync("public/"+r.detailFile))?{auxiliaryCareerCalendar:prior.auxiliaryCareerCalendar}:{}),
 ...(prior?.initialEventSchedules?.sourceMetadataSha256===metadata&&key(prior.initialEventSchedules.sourceHashes)===key(sourceHashes)?{initialEventSchedules:prior.initialEventSchedules}:{}),
 requiredProofs:REQUIRED_PROOFS,summary,bySource,classifications,rows,
 scope:"Final within selected body and branch with conditional cap-restored development; alternatives with a different final body are separate objectives. Actual victory, cross-body return cycles and global optimum are not certified."};
if(terminalRule.status==="RULES_AND_PRESERVED_ENGINE_EXTRACTED"&&terminalResearch){
 const replayData={...modern,originRows:read("public/data/soldier-acquisition-progression-20261102.json").rows,sourceItemIds:new Set(read("public/data/soldier-source-catalog.json").itemIds)};
 const ledger=decode("public/data/soldier-population-missing-origin-career.json.gz");
 const sets=buildTerminalResearchTraitSets({db,ledger,index:decode("public/data/soldier-population-missing-origin-career-index.json.gz"),replay:createSharedCareerReplay(replayData,ledger.summary),prior:prior?.researchTraitSets});
 const lines=admitResearchLines({db,sets,ledger,classifications,prior:{...prior,rows:priorLineRows}});
 const lineIds=new Set(lines.rows.map(r=>r.id));
 for(const p of priorLineRows)if(p.proofKind===RESEARCH_LINE_PROOF)assert(lineIds.has(p.id),"Previously complete research line lost: "+p.id);
 const actualGameCombinations=rows.length;
 rows.push(...lines.rows);rows.sort((a,b)=>a.id.localeCompare(b.id));
 summary.researchLineCombinations=lines.rows.length;summary.actualGameCombinations=actualGameCombinations;
 summary.completeCombinations=rows.length;
 summary.researchLineWitnesses=lines.covered.size;summary.actualGameProofMissing=missingProofs;sets.summary.researchLineCombinations=lines.rows.length;sets.summary.actualGameCombinations=0;
 summary.unresolvedEvidence=seen.size-new Set([...lines.covered].map(id=>classifications.missingbirth[id].evidenceId).concat([...admitted.values()].map(r=>classifications[r.source][r.routeId].evidenceId))).size;
 bySource.missingbirth.researchLineCombinations=lines.rows.length;bySource.missingbirth.researchLineWitnesses=lines.covered.size;
 db.careerCompletion.researchLineAdmission={schema:RESEARCH_LINE_PROOF,scope:"EXPLORATION: continuous replay to active terminal research goal, not final development closure.",rejected:lines.rejected};
 db.careerCompletion.researchTraitSets=sets;summary.researchTraitSets=sets.summary;
 // Keep per-witness finite use in the canonical completion registry.
 const budget=createResearchMaterialPolicy(replayData),description=budget.describe(),records={};
 let checked=0,hardViolations=0,indexedUnresolved=0,withFinite=0;const checkedRouteIds=[];
 for(const [id,r] of Object.entries(ledger.routes)){
  const g=ledger.graphs[r.sourceGraph],i=r.sourceNode;if(!g?.nodes[i])continue;
  const v=budget.state(g,i),q=budget.issues(v);checked++;checkedRouteIds.push(id);
  if(q.hard.length)hardViolations++;if(q.uncertain.length)indexedUnresolved++;
  const use={};for(const [k,f] of budget.finite){
   const granted=v.granted[k]||0,consumed=v.consumed[k]||0;
   if(granted||consumed)use[k]={granted,consumed,cap:f.cap,remaining:Math.max(0,f.cap-consumed)};
  }
  if(Object.keys(use).length||q.hard.length||q.uncertain.length){withFinite++;records[id]={use,hard:q.hard,uncertain:q.uncertain};}
 }
 db.careerCompletion.materialBudget={schema:description.schema,source:description.source,sha256:description.sha256,scope:description.scope,finite:description.finite,counts:description.counts,records,checkedRouteIds:checkedRouteIds.sort(),checked,withFinite,hardViolations,indexedUnresolved};
 summary.materialBudget={checked,withFinite,hardViolations,indexedUnresolved,counts:description.counts};

}
const comparison=await loadCareerRows(modern,db,{includeWitnesses:true,scope:"research-line"});
assert.deepEqual(comparison.errors,[]);
db.careerCompletion.maxComparison=summarizeMaxComparison(comparison.rows);
summary.maxComparison={...db.careerCompletion.maxComparison};delete summary.maxComparison.routeIds;
if(db.careerCompletion.materialBudget){
 const index=createMaterialIndex(db.careerCompletion.materialBudget);
 db.careerCompletion.materialComparison=summarizeMaterialComparison(comparison.rows,index);
 summary.materialComparison={...db.careerCompletion.materialComparison};delete summary.materialComparison.routeIds;
}
const repeatComparison=createRepeatComparison(db).summarize(comparison.rows.map(r=>({...r,complete:true})));
db.careerCompletion.repeatComparison=repeatComparison;
summary.repeatComparison={...repeatComparison};delete summary.repeatComparison.suppressedRouteIds;
const coverage=summarizeOriginCoverage(modern.profiles,comparison.rows);
Object.assign(summary,coverage.summary);
db.careerCompletion.originCoverage=coverage.origins;db.careerCompletion.chortCoverage=coverage.chort;
const incumbents=summarizeCareerIncumbents(comparison.rows);
db.careerCompletion.observedIncumbents=incumbents;
summary.observedIncumbents=incumbents.summary;
// Preserve the old archive and its observed scheduling hints. It is not a
// final table, and none of its numerical scores are pruning certificates.
const c=db.careerCompletion;
c.researchLineRows=c.rows.filter(r=>r.proofKind===RESEARCH_LINE_PROOF);
c.researchLineExploration={summary:{...summary},originCoverage:c.originCoverage,chortCoverage:c.chortCoverage,observedIncumbents:c.observedIncumbents,maxComparison:c.maxComparison,materialComparison:c.materialComparison,repeatComparison:c.repeatComparison};
return {db,comparisonRows:comparison.rows,seenSize:seen.size};
}
const prepared=stage.mode==="finalize"?await stage.load():await prepare();
if(stage.mode==="prepare"){await stage.save(prepared);}else{
const {db,seenSize}=prepared,modern=read("public/data/soldiers-modern-index.json");
const comparison=prepared.comparisonRows?{rows:prepared.comparisonRows,errors:[]}:await loadCareerRows(modern,db,{includeWitnesses:true,scope:"research-line"});
assert.deepEqual(comparison.errors,[]);
const comparisonRows=comparison.rows;
const c=db.careerCompletion,{summary,bySource,classifications}=c;
summary.researchTraitSets=c.researchTraitSets.summary;
const finalLedger=decode("public/data/soldier-population-missing-origin-career.json.gz");
const finalData={...modern,originRows:read("public/data/soldier-acquisition-progression-20261102.json").rows,sourceItemIds:new Set(read("public/data/soldier-source-catalog.json").itemIds)};
const final=classifyFinalCareers({db,ledger:finalLedger,data:finalData,replay:createSharedCareerReplay(finalData,finalLedger.summary),lines:c.researchLineRows,baselineRef:process.argv.find(x=>x.startsWith("--reuse-final-from="))?.slice("--reuse-final-from=".length)||null});
c.finalCareerAdmission=final;
c.rows=final.rows;
summary.completeCombinations=final.rows.length;
summary.finalCareer=final.summary;
summary.unresolvedEvidence=seenSize-new Set(Object.entries(final.witnesses).filter(([,v])=>['FINAL_CLOSED','FINAL_EQUIVALENT'].includes(v.status)).map(([id])=>classifications.missingbirth[id].evidenceId)).size;
bySource.missingbirth.complete=final.rows.length;
c.researchTraitSets.summary.complete=final.rows.length;
const finalRows=comparisonRows.filter(r=>final.witnesses[r.id]?.status==="FINAL_CLOSED").map(r=>({...r,complete:true}));
assert(finalRows.every(r=>r.statPolicy===CAREER_STAT_POLICY.id));
summary.statComparison={policy:CAREER_STAT_POLICY.id,projectedRows:summary.candidateRows,rejectedRows:summary.invalidProjection,researchLineWitnesses:comparisonRows.length,finalWitnesses:finalRows.length,medalBearingFinalWitnesses:finalRows.filter(r=>Object.keys(r.medals||{}).length).length};
const finalCoverage=summarizeOriginCoverage(modern.profiles,finalRows);
Object.assign(summary,finalCoverage.summary);
c.originCoverage=finalCoverage.origins;c.chortCoverage=finalCoverage.chort;
c.observedIncumbents=summarizeCareerIncumbents(finalRows);summary.observedIncumbents=c.observedIncumbents.summary;
c.maxComparison=summarizeMaxComparison(finalRows);c.maxComparison.scope="Successor-closed final career witnesses only; commendation bonuses excluded.";
summary.maxComparison={...c.maxComparison};delete summary.maxComparison.routeIds;
c.materialComparison=summarizeMaterialComparison(finalRows,createMaterialIndex(c.materialBudget));c.materialComparison.scope="Successor-closed final career witnesses only; commendation bonuses excluded.";
summary.materialComparison={...c.materialComparison};delete summary.materialComparison.routeIds;
c.repeatComparison=createRepeatComparison(db).summarize(finalRows);
summary.repeatComparison={...c.repeatComparison};delete summary.repeatComparison.suppressedRouteIds;
db.summary.careerCompletion=summary;
db.policies.CAREER_STAT_COMPARISON=CAREER_STAT_POLICY.medals;
db.policies.CAREER_COMPLETION="선택 연구 분기와 최종 병종을 유지하는 조건부 육성 종결 조합을 등록. 다른 병종 및 복제는 별도 목표로 분리. 반복 시술은 실제 재생 및 성장캡 복원 후 동일 상태일 때만 종결 의무에서 제외. 병종 순환과 실제 게임·전역 최적은 미인증.";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(packSharedCareerSections(packEconomyDetails(packResearchPaths(db)))),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,bySource},null,2));
}
