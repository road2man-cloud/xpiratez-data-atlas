// Publish a replay-audited closure certificate, separate from unrestricted
// game completion. All original pair identities remain in the proof sidecar.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {MODEL,createClosureModel,terminalFrontier,assertClosed} from "./population-closure-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const input=process.argv[2]||"population-closure.json.gz",bytes=fs.readFileSync(input),a=decode(bytes);
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),v=db.populationSearch.versions.D3;
assert.equal(a.kind,"POPULATION_REACHABILITY_CLOSURE");assert.equal(a.model,MODEL);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.sourceD3Sha256,v.sha256);
assert.equal(a.fingerprint,key([MODEL,db.sourceMetadataSha256,v.sha256,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency drift "+p);
const sb=fs.readFileSync("public/data/"+v.file);assert.equal(sha(sb),v.sha256);const snap=decode(sb),model=createClosureModel(data,snap);
assert.deepEqual(a.origins,db.populationSearch.origins);assert.deepEqual(a.branches,db.populationSearch.branches);assert.deepEqual(a.bdd,model.bdd);assert.deepEqual(a.rules,snap.rules);
const old=db.populationClosure;
if(old){assert.equal(old.fingerprint,a.fingerprint);assert.equal(old.pairMapHash,a.pairMapHash);assert(a.summary.closedGroups>=old.summary.closedGroups);assert(a.summary.limitedClosed>=old.summary.limitedClosed);for(const g of old.groups.filter(g=>g.closed)){assert(a.groups[g.id]?.closed);assert.equal(a.groups[g.id].closureHash,g.closureHash,"Previously closed group changed");}}
assert.equal(a.pairGroups.length,a.origins.length*a.branches.length);
assert.equal(a.pairMapHash,key([a.origins,a.branches,a.pairGroups,a.pairHistoryCount,a.pairAdmittedCount]));
// Rebuild history-to-group coverage independently from the serialized mapping.
const started=performance.now(),profileMap=new Map(data.profiles.map(p=>[p.id,p])),bi=new Map(a.branches.map((b,i)=>[b,i]));
const nodeIndex=new Map(a.nodes.map((n,i)=>[JSON.stringify(n.state),i]));assert.equal(nodeIndex.size,a.nodes.length);
const signatureIndex=new Map(a.groups.map((g,i)=>[g.signature,i]));assert.equal(signatureIndex.size,a.groups.length);
const aliasCount=new Uint32Array(a.groups.length),expected=Array.from({length:a.pairGroups.length},()=>[]),hc=new Uint16Array(expected.length),ac=new Uint16Array(expected.length);
for(let oi=0;oi<a.origins.length;oi++){
 const p=profileMap.get(a.origins[oi]),roots=model.initial(p).map(r=>nodeIndex.get(JSON.stringify(r)));
 assert(roots.every(Number.isInteger));
 for(let hi=0;hi<snap.histories.length;hi++){
  const j=bi.get(snap.histories[hi].branchId),pi=oi*a.branches.length+j;hc[pi]++;
  if((p.requires||[]).some(r=>!model.active(model.hs[hi],r)))continue;
  ac[pi]++;
  const mask=model.reachable(p.soldierType,model.available[hi]).toString(16),gi=signatureIndex.get(key([mask,roots]));
  assert(Number.isInteger(gi));if(!expected[pi].includes(gi))expected[pi].push(gi);
  aliasCount[gi]++;
 }
}
assert.deepEqual(expected,a.pairGroups);assert.deepEqual([...hc],a.pairHistoryCount);assert.deepEqual([...ac],a.pairAdmittedCount);
const audited=new Set(),groupSummaries=[],codes=[],reps=new Map(),closedPairs=[];
let auditedEdges=0,limitedDirect=0,limitedEquivalent=0,limitedPartial=0,unmodeled=0;
for(let gi=0;gi<a.groups.length;gi++){
 const g=a.groups[gi];assert.equal(g.aliases.length,aliasCount[gi]);
 // Alias contents, not just count, are checked against the original model.
 const distinct=new Set();
 for(const [oi,hi] of g.aliases){const p=profileMap.get(a.origins[oi]);assert(p&&snap.histories[hi]);assert((p.requires||[]).every(r=>model.active(model.hs[hi],r)));const roots=model.initial(p).map(r=>nodeIndex.get(JSON.stringify(r))),mask=model.reachable(p.soldierType,model.available[hi]).toString(16);assert.equal(g.signature,key([mask,roots]));assert.equal(g.mask,mask);assert.deepEqual(g.roots,[...new Set(roots)]);distinct.add(oi+"|"+hi);}
 assert.equal(distinct.size,g.aliases.length);
 if(!g.closed){groupSummaries.push({id:gi,closed:false,states:g.ids.length,pending:g.ids.length-g.cursor,frontier:[],aliases:g.aliases.length});continue;}
 assertClosed(g,a.nodes,model);
 // Independently replay each unique transition in the closed subgraph.
 // Sharing the result across groups is safe: masks only choose actions.
 for(const id of g.ids)for(const action of model.actions(a.nodes[id].state,BigInt("0x"+g.mask))){
  const k=id+"|"+action;if(audited.has(k))continue;audited.add(k);
  const t=model.transition(a.nodes[id].state,action),to=a.nodes[id].edges[String(action)];
  if(t.kind==="OK")assert.equal(nodeIndex.get(JSON.stringify(t.state)),to);
  else assert.equal(to,t.kind==="GATE"?-1:-2);
  auditedEdges++;
 }
 const frontier=terminalFrontier(g.ids,a.nodes,model);assert.deepEqual(g.frontier,frontier);
 assert.equal(g.closureHash,key([g.signature,g.ids,g.parents,g.frontier,g.outsideModelEdges]));
 const pos=new Map(g.ids.map((id,i)=>[id,i]));
 const paths=frontier.map(f=>{
  let j=pos.get(f.id);const actions=[];
  while(g.parents[j]!==null){const [p,act]=g.parents[j];actions.push(act===-1?"CAP_TARGET":a.rules[act]);j=p;}
  return {...f,root:g.ids[j],actions:actions.reverse()};
 });
 groupSummaries.push({id:gi,closed:true,states:g.ids.length,pending:0,frontier:paths,aliases:g.aliases.length,closureHash:g.closureHash,outsideModelEdges:g.outsideModelEdges,selfLoops:g.selfLoops});
}
for(let i=0;i<expected.length;i++){
 const gs=expected[i];let status;
 if(!gs.length){status=0;unmodeled++;}
 else if(!gs.every(g=>a.groups[g].closed)){status=1;limitedPartial++;}
 else{
  const sig=gs.slice().sort((a,b)=>a-b).join(",");
  if(reps.has(sig)){status=3;limitedEquivalent++;}else{status=2;reps.set(sig,i);limitedDirect++;}
  closedPairs.push([i,gs,reps.get(sig)]);
 }
 codes.push(status);
 assert.equal(a.pairStatus[i],["UNMODELED","LIMITED_PARTIAL","LIMITED_DIRECT","LIMITED_EQUIVALENT"][status]);
}
assert.deepEqual(closedPairs,a.closedPairs);
assert.equal(limitedDirect,a.summary.limitedDirect);assert.equal(limitedEquivalent,a.summary.limitedEquivalent);assert.equal(limitedPartial,a.summary.limitedPartial);assert.equal(unmodeled,a.summary.unmodeled);
// Fail closed: scope gaps mean NO claim is allowed in any full-proof bucket.
for(const k of ["fullDirect","fullEquivalent","fullImpossible","fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
assert(a.scope.excluded.length);
const joint=db.populationJointCoverage;
assert.deepEqual(joint.origins,a.origins);assert.deepEqual(joint.branches,a.branches);
const fullPartial=codes.reduce((n,c,i)=>n+Number(c!==0||Number(joint.status[Math.floor(i/a.branches.length)][i%a.branches.length])!==0),0);
const summary={...a.summary,fullPartial,fullUnexplored:codes.length-fullPartial,proofAuditEdges:auditedEdges,proofAuditSeconds:(performance.now()-started)/1000,frontierRepresentatives:groupSummaries.reduce((n,g)=>n+g.frontier.length,0),blockedScopeReasons:a.scope.excluded.length};
const asset="soldier-population-closure.json.gz";
fs.writeFileSync("public/data/"+asset,bytes);
db.populationClosure={schemaVersion:1,model:MODEL,fingerprint:a.fingerprint,pairMapHash:a.pairMapHash,sourceMetadataSha256:a.sourceMetadataSha256,sourceD3Sha256:a.sourceD3Sha256,scope:a.scope,summary,file:asset,sha256:sha(bytes),bytes:bytes.length,origins:a.origins,branches:a.branches,status:a.origins.map((_,i)=>codes.slice(i*a.branches.length,(i+1)*a.branches.length).join("")),pairGroups:a.origins.map((_,i)=>expected.slice(i*a.branches.length,(i+1)*a.branches.length)),groups:groupSummaries,actualGameCertified:false};
db.summary.populationClosure=summary;
db.policies.POPCLOSURE12="깊이 제한 없는 제한 상태모형의 도달 가능 상태 폐쇄 및 12능력치 파레토 전선. 원본 조합과 그룹 대응, 상태·전이·경로의 증거를 보존. 실제 게임 전체 종료 증명에는 포함하지 않음.";
db.sources.POPCLOSURE12={file:"tools/build-population-closure.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256,sourceD3Sha256:a.sourceD3Sha256};
fs.writeFileSync(file+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify(summary));
