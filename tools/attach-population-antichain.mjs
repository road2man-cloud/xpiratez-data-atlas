// Publish independently replayed forward-simulation proof and exact Pareto
// representatives in the explicitly enlarged partial-cap numeric model.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {createClosureModel,terminalFrontier,assertClosed} from "./population-closure-core.mjs";
import {MODEL,createSimulationChecker,verifyCover} from "./population-antichain-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),v=db.populationSearch.versions.D3;
const baseMeta=db.populationClosure;assert(baseMeta);
const bb=fs.readFileSync("public/data/"+baseMeta.file),pb=fs.readFileSync(process.argv[2]||"population-partial-growth-proof.json.gz"),ab=fs.readFileSync(process.argv[3]||"population-antichain.json.gz"),b=decode(bb),p=decode(pb),a=decode(ab);
assert.equal(sha(bb),baseMeta.sha256);assert.equal(p.closureSha256,sha(bb));assert.equal(a.sourceClosureSha256,sha(bb));assert.equal(a.sourcePartialSha256,sha(pb));assert.equal(a.kind,"POPULATION_ANTICHAIN_CLOSURE");assert.equal(a.model,MODEL);
assert.equal(p.kind,"POPULATION_PARTIAL_GROWTH_PROOF");assert.equal(p.closureFingerprint,b.fingerprint);assert.equal(p.fingerprint,key(["PARTIAL_CAP_BOX_FORWARD_SIMULATION_V1",b.fingerprint,p.hashes]));
assert.equal(a.fingerprint,key([MODEL,sha(bb),sha(pb),a.hashes]));
for(const x of [a,b,p]){
 assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(x.sourceD3Sha256,v.sha256);assert.equal(x.pairMapHash,baseMeta.pairMapHash);
 for(const [path,h] of Object.entries(x.hashes))assert.equal(sha(fs.readFileSync(path,"utf8").replace(/\r\n/g,"\n")),h,"Proof source changed "+path);
}
assert.deepEqual(a.scope,p.scope);
const sb=fs.readFileSync("public/data/"+v.file);assert.equal(sha(sb),v.sha256);
const model=createClosureModel(data,decode(sb)),checker=createSimulationChecker(data,model),cache=new Map(),started=performance.now();
assert.equal(p.proofs.length,b.groups.length);
const groupById=new Map(a.groups.map(g=>[g.group,g]));assert.equal(groupById.size,a.groups.length);
const groups=[],certified=new Set(),baseChecks=new Set();
let sourceCertified=0,antichainCertified=0,auditedEdges=0,auditedPaths=0,baseStateChecks=0;
for(let i=0;i<b.groups.length;i++){
 const g=b.groups[i],receipt=p.proofs[i],g2=groupById.get(i);assert.equal(receipt.group,i);
 if(receipt.status==="PARTIAL_CAP_BOX_PARETO_EXACT"){
  assert(g.closed&&!g2);assert.equal(receipt.closureHash,g.closureHash);assert.equal(receipt.frontierHash,key(g.frontier));assertClosed(g,b.nodes,model);
  for(const id of g.ids){const ck=g.mask+"|"+id;if(baseChecks.has(ck))continue;baseChecks.add(ck);assert.equal(checker.check(b.nodes[id].state,BigInt("0x"+g.mask)),null,"Source simulation failure");baseStateChecks++;}
  assert.deepEqual(baseMeta.groups[i].frontier.map(({root,actions,...f})=>f),g.frontier);
  groups.push({id:i,closed:true,proofKind:"FULL_CAP_FORWARD_SIMULATION",frontier:baseMeta.groups[i].frontier,proofHash:g.closureHash,states:g.ids.length,pending:0,aliases:g.aliases.length});
  certified.add(i);sourceCertified++;continue;
 }
 if(!g2||g2.status!=="PARTIAL_CAP_BOX_PARETO_EXACT"){groups.push({id:i,closed:false,proofKind:"UNPROVED",frontier:[],states:g2?.records.length||g.ids.length,pending:g2?g2.records.length-g2.cursor:g.ids.length-g.cursor,aliases:g.aliases.length});continue;}
 assert.equal(g2.mask,g.mask);assert.deepEqual(g2.roots.map(id=>a.nodes[id].state),g.roots.map(id=>b.nodes[id].state));assert.equal(g2.cursor,g2.records.length);
 assert.equal(g2.proofHash,key([g2.group,g2.mask,g2.roots,g2.records,g2.frontier]));
 const audit=verifyCover(g2,a.nodes,model,checker,{replay:true,transitionCache:cache});assert(audit.ok,"Antichain proof failed "+i);auditedEdges+=audit.counts.edgeChecks;auditedPaths+=audit.counts.pathChecks;
 const front=terminalFrontier(g2.records.filter(r=>r.live).map(r=>r.id),a.nodes,model);assert.deepEqual(front,g2.frontier);
 const pos=new Map(g2.records.map((r,j)=>[r.id,j]));assert.equal(pos.size,g2.records.length);
 const paths=front.map(f=>{let j=pos.get(f.id),r=g2.records[j];assert(r.live);const actions=[];while(r.parent!==null){actions.push(r.action===-1?"CAP_TARGET":b.rules[r.action]);j=r.parent;r=g2.records[j];}return {...f,root:r.id,actions:actions.reverse()};});
 groups.push({id:i,closed:true,proofKind:"ANTICHAIN_FORWARD_SIMULATION",frontier:paths,proofHash:g2.proofHash,states:audit.counts.live,pending:0,aliases:g.aliases.length,admittedRecords:g2.records.length});
 certified.add(i);antichainCertified++;
}
assert.equal(sourceCertified,p.summary.certifiedGroups);assert.equal(antichainCertified,a.summary.newAntichainGroups);assert.equal(certified.size,a.summary.certifiedGroups);
const codes=[],pairs=[],reps=new Map();let direct=0,equivalent=0,partial=0,unmodeled=0;
for(let i=0;i<b.pairGroups.length;i++){
 const gs=b.pairGroups[i];let code;
 if(!gs.length){code=0;unmodeled++;}
 else if(!gs.every(g=>certified.has(g))){code=1;partial++;}
 else{
  const k=gs.slice().sort((x,y)=>x-y).join(",");
  if(reps.has(k)){code=3;equivalent++;}else{code=2;direct++;reps.set(k,i);}
  pairs.push([i,gs,reps.get(k)]);
 }
 codes.push(code);assert.equal(a.pairStatus[i],["UNMODELED","PARTIAL_OR_UNPROVED","LIMITED_DIRECT","LIMITED_EQUIVALENT"][code]);
}
assert.deepEqual(a.pairs,pairs);assert.equal(a.summary.limitedDirect,direct);assert.equal(a.summary.limitedEquivalent,equivalent);assert.equal(a.summary.partialOrUnproved,partial);assert.equal(a.summary.unmodeled,unmodeled);
for(const x of [p,a])for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(x.summary[k],0);
const old=db.populationAntichain;if(old){assert.equal(old.pairMapHash,a.pairMapHash);assert(old.summary.limitedClosed<=direct+equivalent);for(const g of old.groups.filter(g=>g.closed)){assert(groups[g.id].closed);assert.equal(groups[g.id].proofHash,g.proofHash,"Previous proof changed");}}
const pf="soldier-population-partial-growth-proof.json.gz",af="soldier-population-antichain.json.gz";
const summary={...a.summary,fullDirect:0,fullEquivalent:0,fullImpossible:0,fullCompletionRate:0,fullPartial:baseMeta.summary.fullPartial,fullUnexplored:baseMeta.summary.fullUnexplored,fullCompletedPerHour:0,fullRemainingWork:null,fullEtaHours:null,partialGrowthSeconds:p.summary.elapsedSeconds,combinedFrontierRepresentatives:groups.reduce((n,g)=>n+g.frontier.length,0),proofAuditSeconds:(performance.now()-started)/1000,proofAuditBaseStates:baseStateChecks,proofAuditAntichainEdges:auditedEdges,proofAuditWitnessPaths:auditedPaths,proofAuditIndependentTransitions:cache.size,proofAuditSimulation:checker.metrics,scopeLimit:true};
fs.writeFileSync("public/data/"+pf,pb);fs.writeFileSync("public/data/"+af,ab);
db.populationAntichain={schemaVersion:1,model:MODEL,fingerprint:a.fingerprint,pairMapHash:a.pairMapHash,sourceMetadataSha256:a.sourceMetadataSha256,sourceD3Sha256:v.sha256,sourceClosureSha256:sha(bb),partialProof:{file:pf,sha256:sha(pb),bytes:pb.length,summary:p.summary},file:af,sha256:sha(ab),bytes:ab.length,scope:a.scope,summary,origins:b.origins,branches:b.branches,status:b.origins.map((_,i)=>codes.slice(i*b.branches.length,(i+1)*b.branches.length).join("")),groups,actualGameCertified:false};
db.summary.populationAntichain=summary;
db.sources.POPANTICHAIN12={file:"tools/build-population-antichain.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256,sourceClosureSha256:sha(bb)};
db.policies.POPANTICHAIN12="고정 활성 연구·출생 두 벡터·결정론적 시술에서 독립 부분 성장의 전방 시뮬레이션과 도달 가능한 우위 상태 집합의 폐쇄로 최종 병종별 파레토 전선 증명. 원본 행동 경로 유지, 동등 그룹 합산 금지, 전역 실제 게임 완료 미인증.";
fs.writeFileSync(file+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);console.log(JSON.stringify(summary));
