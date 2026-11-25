// Publish the birth-interval and flat-roll closure proofs separately from
// full-game completion, and compute actual changes to per-pair Pareto sets.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {terminalFrontier} from "./population-closure-core.mjs";
import {verifyCover} from "./population-antichain-core.mjs";
import {MODEL,createRandomBoxModel} from "./population-random-box-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const cl=db.populationClosure,ac=db.populationAntichain,v=db.populationSearch.versions.D3;
assert(cl&&ac&&v);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
function asset(meta){const bytes=fs.readFileSync("public/data/"+meta.file);assert.equal(sha(bytes),meta.sha256);return decode(bytes);}
const base=asset(cl),snap=asset(v),birthBytes=fs.readFileSync(process.argv[2]||"population-birth-box-proof.json.gz"),birth=decode(birthBytes),rollBytes=fs.readFileSync(process.argv[3]||"population-random-box.json.gz"),a=decode(rollBytes);
assert.equal(birth.kind,"POPULATION_BIRTH_BOX_PROOF");assert.equal(a.kind,"POPULATION_RANDOM_BOX_CLOSURE");assert.equal(a.model,MODEL);
for(const x of [birth,a]){
 assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(x.sourceD3Sha256,v.sha256);assert.equal(x.sourceClosureSha256,cl.sha256);assert.equal(x.sourceAntichainSha256,ac.sha256);assert.equal(x.pairMapHash,cl.pairMapHash);
 for(const [p,h] of Object.entries(x.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Proof source changed "+p);
 for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(x.summary[k],0);
}
assert.equal(birth.sourcePartialSha256,ac.partialProof.sha256);assert.equal(a.sourceBirthProofSha256,sha(birthBytes));
assert.equal(birth.fingerprint,key([birth.model,db.sourceMetadataSha256,v.sha256,cl.sha256,ac.sha256,ac.partialProof.sha256,birth.hashes]));
assert.equal(a.fingerprint,key([MODEL,cl.sha256,ac.sha256,sha(birthBytes),a.hashes]));
assert.equal(birth.summary.certifiedGroups,base.groups.length);assert.equal(birth.groupReceipts.length,base.groups.length);
assert.deepEqual(birth.pairStatus,ac.status.flatMap(row=>Array.from(row,c=>["UNMODELED","PARTIAL_OR_UNPROVED","LIMITED_DIRECT","LIMITED_EQUIVALENT"][Number(c)])));
const {model,checker,changed,changedMask}=createRandomBoxModel(data,snap);assert.deepEqual(a.changed,changed);
const started=performance.now(),affected=base.groups.map((g,i)=>BigInt("0x"+g.mask)&changedMask?i:-1).filter(i=>i>=0);assert.deepEqual(a.affected,affected);
const affectedSet=new Set(affected),groupMap=new Map(a.groups.map(g=>[g.group,g]));assert.equal(groupMap.size,affected.length);
const profileMap=new Map(birth.profiles.map(p=>[p.origin,p])),actualProfiles=new Map(data.profiles.map(p=>[p.id,p]));assert.equal(profileMap.size,base.origins.length);
for(const id of base.origins){
 const p=profileMap.get(id),[lo,hi]=model.initial(actualProfiles.get(id));assert.deepEqual(p.lower,lo);assert.deepEqual(p.upper,hi);
 assert(lo.every((x,i)=>i===5||i===6?x.every((n,j)=>Number.isSafeInteger(n)&&n<=hi[i][j]):key(x)===key(hi[i])));
}
const dominates=(x,y)=>x.body===y.body&&x.vector.every((n,i)=>n>=y.vector[i]);
function compare(before,after){
 // A new model includes the old model: every old terminal vector must
 // remain covered, even where its original path started at the low root.
 assert(before.every(x=>after.some(y=>dominates(y,x))),"Old Pareto vector lost");
 const novel=after.filter(x=>!before.some(y=>dominates(y,x)));
 let sumDelta=null,statDeltas=Array(db.stats.length).fill(null),newBodies=0;
 const oldBodies=new Set(before.map(x=>x.body));for(const b of new Set(after.map(x=>x.body)))if(!oldBodies.has(b))newBodies++;
 if(before.length&&after.length){
  sumDelta=Math.max(...after.map(f=>f.vector.reduce((n,v)=>n+v,0)))-Math.max(...before.map(f=>f.vector.reduce((n,v)=>n+v,0)));
  statDeltas=db.stats.map((_,i)=>Math.max(...after.map(f=>f.vector[i]))-Math.max(...before.map(f=>f.vector[i])));
 }
 return {novel:novel.length,improved:novel.length>0,sumDelta,statDeltas,newBodies};
}
const groups=[],certified=new Set(),cache=new Map(),groupChanges=[];
let auditedEdges=0,auditedPaths=0;
for(let i=0;i<base.groups.length;i++){
 const g=base.groups[i],old=ac.groups[i],receipt=birth.groupReceipts[i];
 assert(old.closed&&receipt.status==="BIRTH_BOX_PARETO_EXACT");assert.equal(receipt.sourceProofHash,old.proofHash);
 if(!affectedSet.has(i)){
  assert(!groupMap.has(i));groups.push({...old,proofKind:"BIRTH_BOX_REUSE"});certified.add(i);groupChanges.push({group:i,improved:false,novel:0});continue;
 }
 const g2=groupMap.get(i);assert(g2);assert.equal(g2.mask,g.mask);
 assert.equal(g2.roots.length,1);
 for(const [oi] of g.aliases)assert.deepEqual(a.nodes[g2.roots[0]].state,profileMap.get(base.origins[oi]).upper);
 if(g2.status!=="BIRTH_AND_ROLL_BOX_PARETO_EXACT"){groups.push({id:i,closed:false,proofKind:"UNPROVED",frontier:[],states:g2.records.length,pending:g2.records.length-g2.cursor,aliases:g.aliases.length});groupChanges.push({group:i,improved:null,novel:null});continue;}
 assert.equal(g2.cursor,g2.records.length);assert.equal(g2.proofHash,key([g2.group,g2.mask,g2.roots,g2.records,g2.frontier]));
 const audit=verifyCover(g2,a.nodes,model,checker,{replay:true,transitionCache:cache});assert(audit.ok,"Random-box proof failed "+i);
 auditedEdges+=audit.counts.edgeChecks;auditedPaths+=audit.counts.pathChecks;
 const front=terminalFrontier(g2.records.filter(r=>r.live).map(r=>r.id),a.nodes,model);assert.deepEqual(front,g2.frontier);
 const pos=new Map(g2.records.map((r,j)=>[r.id,j]));assert.equal(pos.size,g2.records.length);
 const paths=front.map(f=>{
  let j=pos.get(f.id),r=g2.records[j];assert(r.live);const actions=[];while(r.parent!==null){actions.push(r.action===-1?"CAP_TARGET":base.rules[r.action]);j=r.parent;r=g2.records[j];}
  return {...f,root:r.id,actions:actions.reverse(),birthBand:"max",randomRoll:"ALL_MAX_IF_USED"};
 });
 groupChanges.push({group:i,...compare(old.frontier,paths)});
 groups.push({id:i,closed:true,proofKind:"FLAT_ROLL_BOX_FORWARD_SIMULATION",frontier:paths,proofHash:g2.proofHash,states:audit.counts.live,pending:0,aliases:g.aliases.length,admittedRecords:g2.records.length});
 certified.add(i);
}
assert.equal(certified.size,a.summary.certifiedGroups);
const codes=[],pairs=[],reps=new Map(),classChanges=new Map();let direct=0,equivalent=0,partial=0,unmodeled=0,improvedPairs=0,improvedClasses=0,newBodyPairs=0,maxSumDelta=0;
function paretoUnion(gs,source){
 const byBody=new Map();
 for(const gi of gs)for(const f of source[gi].frontier){const x=byBody.get(f.body)||[];x.push(f);byBody.set(f.body,x);}
 const result=[];
 for(const xs of byBody.values()){
  xs.sort((a,b)=>b.vector.reduce((n,v)=>n+v,0)-a.vector.reduce((n,v)=>n+v,0));
  const front=[];for(const x of xs)if(!front.some(y=>dominates(y,x)))front.push(x);result.push(...front);
 }
 return result;
}
const improvedOrigins=new Set(),improvedBranches=new Set(),top=[];
for(let i=0;i<base.pairGroups.length;i++){
 const gs=base.pairGroups[i];let code;
 if(!gs.length){code=0;unmodeled++;}
 else if(!gs.every(g=>certified.has(g))){code=1;partial++;}
 else{
  const k=gs.slice().sort((a,b)=>a-b).join(",");
  if(reps.has(k)){code=3;equivalent++;}
  else{code=2;direct++;reps.set(k,i);const old=paretoUnion(gs,ac.groups),next=paretoUnion(gs,groups),diff=compare(old,next);classChanges.set(k,{representative:i,groups:gs,...diff});if(diff.improved)improvedClasses++;}
  const change=classChanges.get(k);
  if(change.improved){
   improvedPairs++;const oi=Math.floor(i/base.branches.length),bi=i%base.branches.length;improvedOrigins.add(base.origins[oi]);improvedBranches.add(base.branches[bi]);if(change.newBodies>0)newBodyPairs++;
   maxSumDelta=Math.max(maxSumDelta,change.sumDelta||0);
   if(code===2)top.push({origin:base.origins[oi],branch:base.branches[bi],...change});
  }
  pairs.push([i,gs,reps.get(k)]);
 }
 codes.push(code);assert.equal(a.pairStatus[i],["UNMODELED","PARTIAL_OR_UNPROVED","LIMITED_DIRECT","LIMITED_EQUIVALENT"][code]);
}
assert.deepEqual(a.pairs,pairs);assert.equal(a.summary.limitedDirect,direct);assert.equal(a.summary.limitedEquivalent,equivalent);assert.equal(a.summary.partialOrUnproved,partial);assert.equal(a.summary.unmodeled,unmodeled);
const old=db.populationRandomBox;if(old){assert.equal(old.pairMapHash,a.pairMapHash);assert(old.summary.limitedClosed<=direct+equivalent);for(const g of old.groups.filter(g=>g.closed)){assert(groups[g.id].closed);assert.equal(groups[g.id].proofHash,g.proofHash,"Previous proof changed");}}
const bf="soldier-population-birth-box-proof.json.gz",rf="soldier-population-random-box.json.gz";
const summary={...a.summary,fullDirect:0,fullEquivalent:0,fullImpossible:0,fullCompletionRate:0,fullPartial:cl.summary.fullPartial,fullUnexplored:cl.summary.fullUnexplored,fullCompletedPerHour:0,fullRemainingWork:null,fullEtaHours:null,birthProofSeconds:birth.summary.elapsedSeconds,improvedGroups:groupChanges.filter(g=>g.improved).length,novelGroupFrontierVectors:groupChanges.reduce((n,g)=>n+(g.novel||0),0),improvedPairs,improvedClasses,improvedOrigins:improvedOrigins.size,improvedBranches:improvedBranches.size,newBodyPairs,maxSumDelta,frontierRepresentatives:groups.reduce((n,g)=>n+g.frontier.length,0),proofAuditSeconds:(performance.now()-started)/1000,proofAuditEdges:auditedEdges,proofAuditPaths:auditedPaths,proofAuditIndependentTransitions:cache.size,proofAuditSimulation:checker.metrics,scopeLimit:true};
assert.equal(summary.frontierRepresentatives,a.summary.frontierRepresentatives);
fs.writeFileSync("public/data/"+bf,birthBytes);fs.writeFileSync("public/data/"+rf,rollBytes);
db.populationBirthBox={schemaVersion:1,model:birth.model,fingerprint:birth.fingerprint,pairMapHash:a.pairMapHash,sourceMetadataSha256:a.sourceMetadataSha256,sourceAntichainSha256:ac.sha256,file:bf,sha256:sha(birthBytes),bytes:birthBytes.length,scope:birth.scope,summary:birth.summary,profiles:birth.profiles.map(({lower,upper,...p})=>p),actualGameCertified:false};
db.populationRandomBox={schemaVersion:1,model:MODEL,fingerprint:a.fingerprint,pairMapHash:a.pairMapHash,sourceMetadataSha256:a.sourceMetadataSha256,sourceD3Sha256:v.sha256,sourceBirthProofSha256:sha(birthBytes),file:rf,sha256:sha(rollBytes),bytes:rollBytes.length,scope:a.scope,summary,origins:base.origins,branches:base.branches,status:base.origins.map((_,i)=>codes.slice(i*base.branches.length,(i+1)*base.branches.length).join("")),groups,changed,groupChanges,classChanges:[...classChanges.values()],topImproved:top.sort((a,b)=>(b.sumDelta||0)-(a.sumDelta||0)||b.novel-a.novel).slice(0,20),actualGameCertified:false};
db.summary.populationBirthBox=birth.summary;db.summary.populationRandomBox=summary;
db.sources.POPBIRTHBOX12={file:"tools/build-population-birth-box-proof.mjs",fingerprint:birth.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.sources.POPRANDOMBOX12={file:"tools/build-population-random-box.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPBIRTHBOX12="출생 초기·현재 능력치의 좌표별 범위 전체를 성장량 계수와 전방 시뮬레이션으로 포함한 제한 수치모형 증명.";
db.policies.POPRANDOMBOX12="독립 정수 평면 무작위 증가량의 최대값이 다른 모든 수치 결과를 지배하는 모형에서 출생·부분 성장·무제한 시술의 최종 병종별 파레토 전선 증명. 실제 공동 난수 분포 및 캠페인 전역 최적성 미인증.";
fs.writeFileSync(file+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,changed,topImproved:db.populationRandomBox.topImproved.slice(0,3)}));
