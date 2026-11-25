// Attach the finite-model proof index without replacing independent witnesses.
// Global completion stays zero until a complete campaign model has a proof.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const registry="public/data/branch-soldier-results.json.gz";
const asset="soldier-population-finite-closure-d3.json.gz";
const bytes=fs.readFileSync("public/data/"+asset),a=JSON.parse(gunzipSync(bytes));
const db=JSON.parse(gunzipSync(fs.readFileSync(registry))),p=db.populationSearch,v=p.versions.D3;
assert.equal(a.kind,"POPULATION_FINITE_CLOSURE");
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.deepEqual(a.origins,p.origins);assert.deepEqual(a.branches,p.branches);assert.deepEqual(a.stats,db.stats);
assert.equal(a.graph.sha256,v.sha256);assert.equal(a.graph.engine,v.engine);assert.equal(a.graph.file,v.file);
assert.equal(a.graph.depth,3);assert.equal(a.proof.fullCampaign,false);assert.equal(a.proof.closedGraph,true);
assert.equal(a.identity,key([db.sourceMetadataSha256,v.sha256,v.engine,a.sourceHashes]));
for(const [f,h] of Object.entries(a.sourceHashes))assert.equal(sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n")),h,"Source drift "+f);
const s=a.summary;
assert.equal(s.targetPairs,p.origins.length*p.branches.length);
assert.equal(s.globalDirectComplete+s.globalEquivalentComplete+s.globalImpossibleComplete+s.globalOptimalCertified+s.actualGameCertified,0);
assert.equal(s.limitedClosedPairs,s.limitedDirectClasses+s.limitedEquivalentPairs);
assert.equal(s.limitedClosedPairs+s.limitedUnmodeledPairs,s.targetPairs);
assert.equal(s.limitedClosedPairs,v.summary.coveredPairs);
assert.equal(s.sourceOrderedLabels,a.groups.reduce((n,g)=>n+g.orderedLabels,0));
assert.equal(s.depthStateOccurrences,a.groups.reduce((n,g)=>n+g.aliases.length,0));
assert.equal(s.quotientStates,a.nodes.length);assert.equal(s.quotientHits,s.depthStateOccurrences-s.quotientStates);
assert.equal(s.limitedDirectClasses,a.pairClasses.length);
assert.equal(s.distinctGroupClasses,a.groupClasses.length);
let covered=0;const referenced=new Set();
for(let i=0;i<p.origins.length;i++)for(let j=0;j<p.branches.length;j++){
 const id=a.matrix[i][j],groups=v.matrix[i][j];
 if(!groups.length){assert.equal(id,-1);continue;}
 assert(Number.isSafeInteger(id)&&a.pairClasses[id]);covered++;referenced.add(id);
 const members=[...new Set(groups.map(k=>a.groupToClass[k]))].sort((x,y)=>x-y);
 assert.deepEqual(members,a.pairClasses[id].members);
}
assert.equal(covered,s.limitedClosedPairs);assert.equal(referenced.size,a.pairClasses.length);
for(const g of a.pairClasses)for(const id of [...g.bodyFrontier,...g.lineageFrontier])assert(a.nodes[id]?.observation[3].length===12);
const meta={schemaVersion:1,sourceMetadataSha256:db.sourceMetadataSha256,identity:a.identity,file:asset,bytes:bytes.length,sha256:sha(bytes),graph:a.graph,proof:a.proof,summary:s};
db.populationFiniteClosure=meta;db.summary.populationFiniteClosure=s;
db.sources.POPFINITE12={file:"tools/build-population-finite-closure.mjs",sourceMetadataSha256:db.sourceMetadataSha256,fingerprint:a.identity,asset,sha256:meta.sha256};
db.policies.POPFINITE12="기록된 D3 유한 결정론 그래프의 행동 라벨 및 남은 깊이 동등성 증명, 12능력치 종단 파레토 DP. 원본 출생처·연구 분기·행동 순서 대응 보존. 전체 게임 최적성·불가능 판정에는 포함하지 않음.";
fs.writeFileSync(registry+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
fs.renameSync(registry+".tmp",registry);
console.log(JSON.stringify({file:asset,sha256:meta.sha256,bytes:meta.bytes,registeredWitnesses:db.summary.registeredWitnesses,summary:s}));
