// Classify and admit into the existing common registry, never a parallel DB.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {ledgers,project} from "../public/branch-soldier-atlas-career-core.js";
import {SCHEMA,REQUIRED_PROOFS,classifyCandidate,evidenceIdentity,admitVerified} from "./atlas-career-completion-core.mjs";
import {key,sha} from "./population-research-career-core.mjs";
// Original YAML is needed only for a fresh source extraction.
const file="public/data/branch-soldier-results.json.gz";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=decode(file),modern=read("public/data/soldiers-modern-index.json"),metadata=db.sourceMetadataSha256;
assert.equal(modern.meta.source.metadataSha256,metadata);
const prior=db.careerCompletion;
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
const rows=[...admitted.values()].sort((a,b)=>a.id.localeCompare(b.id));
if(prior?.rows?.length)for(const p of prior.rows)assert(admitted.has(p.id),"Previously admitted combination needs a re-verifier: "+p.id);
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
 terminalRule,terminalResearch,terminalSupply,
 ...(prior?.terminalEconomy?.sourceMetadataSha256===metadata&&prior.terminalEconomy.terminalSupplyFingerprint===terminalSupply?.sourceFingerprint&&[...Object.values(prior.terminalEconomy.records||{}),...(prior.terminalEconomy.unresolved||[])].every(r=>terminalSupply?.plans?.[r.planId]?.plan?.planHash===r.planHash)?{terminalEconomy:prior.terminalEconomy}:{}),
 ...(prior?.initialEventSchedules?.sourceMetadataSha256===metadata&&key(prior.initialEventSchedules.sourceHashes)===key(sourceHashes)?{initialEventSchedules:prior.initialEventSchedules}:{}),
 requiredProofs:REQUIRED_PROOFS,summary,bySource,classifications,rows,
 scope:"Only verified full campaign combinations; all conditional ledgers remain search seeds. No final admission based on conditional closure or numerical upper bounds."};
db.summary.careerCompletion=summary;
db.policies.CAREER_COMPLETION="실제 게임 종료 조건·최종 연구·시간순 성장·자원·후속 가능성·독립 재생 증명을 모두 통과한 완결 조합만 기존 DB 표에 등록. 조건부 원장은 탐색 자료로 보존.";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(db),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,bySource},null,2));
