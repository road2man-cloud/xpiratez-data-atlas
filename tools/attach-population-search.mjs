// Attach population graph evidence without replacing any prior worker data.
// The full graph is a hashed public sidecar; the common registry owns its
// route representatives, history aliases, pair status and provenance.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const sha=x=>createHash("sha256").update(x).digest("hex");
const decode=b=>JSON.parse(zlib.gunzipSync(b));
const registry="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(registry));
const input=process.argv[2]||"population-search-d2.json.gz",bytes=fs.readFileSync(input),a=decode(bytes);
const comparison=process.argv[3]?decode(fs.readFileSync(process.argv[3])):null;
const digest=x=>sha(JSON.stringify([x.matrix,x.groups,x.witnesses]));
if(a.kind!=="POPULATION_FIXED_ACTIVE_DAG"||a.sourceMetadataSha256!==db.sourceMetadataSha256||a.origins.length!==72||a.branches.length!==1064||a.summary.pairCount!==76608||a.summary.actualGameCertified!==0)throw Error("Population source mismatch");
const current=db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount>0).sort((a,b)=>a.rank-b.rank);
assert.deepEqual(a.branches,current.map(b=>b.id));
const origins=new Map(a.origins.map((id,i)=>[id,i])),branches=new Map(a.branches.map((id,i)=>[id,i]));
const records=a.records;
const evidence=Array.from({length:a.origins.length},()=>Array(a.branches.length).fill(0));
for(const w of Object.values(db.witnesses)){
 if(!origins.has(w.originProfile)||!["UNIFIED12","CAREER12","ORIGINEXT12"].includes(w.source))continue;
 const flag=w.source==="UNIFIED12"?1:w.source==="CAREER12"?2:4;
 for(const id of w.branchIds||[])if(branches.has(id))evidence[origins.get(w.originProfile)][branches.get(id)]|=flag;
}
const old=db.populationSearch?.versions||{},versionKey="D"+a.depth;
const file="soldier-population-search-d"+a.depth+".json.gz";
const groups=a.groups.map((g,i)=>{
 assert(g.historyIndices.every(h=>a.histories[h]?.branchId&&g.branchIds.includes(a.histories[h].branchId)));
 assert(g.representativeIds.every(id=>a.witnesses[id]?.populationGroups.includes(i)));
 return {originProfile:g.originProfile,readyMask:g.readyMask,historyIndices:g.historyIndices,branchIds:g.branchIds,representativeIds:g.representativeIds,stateCount:g.states.length,labelCount:g.labels.length,primaryBranch:g.branchIds.map(id=>branches.get(id)).sort((x,y)=>x-y)[0]};
});
const statusCounts={UNEXPLORED:0,CONDITIONAL_PATH:0,REUSED_LIMITED_MODEL:0,LIMITED_SEARCH_COMPLETE:0,SEARCHING:0,IMPOSSIBLE_PROVEN:0,GLOBAL_OPTIMUM_CERTIFIED:0};
let known=0,knownCovered=0,rootOnly=0,modelRepresentativePairs=0,modelReusedPairs=0;
const status=a.matrix.map((row,i)=>row.map((ids,j)=>{
 assert(ids.every(k=>groups[k]?.originProfile===a.origins[i]&&groups[k].branchIds.includes(a.branches[j])));
 const ev=evidence[i][j],cond=Boolean(ev&3),reused=ids.length>0&&ids.every(k=>groups[k].primaryBranch!==j);
 if(cond){known++;if(ids.length)knownCovered++;}
 if(ev&4)rootOnly++;
 if(ids.length){if(reused)modelReusedPairs++;else modelRepresentativePairs++;}
 const code=cond?1:ids.length?(reused?2:3):0;
 statusCounts[["UNEXPLORED","CONDITIONAL_PATH","REUSED_LIMITED_MODEL","LIMITED_SEARCH_COMPLETE"][code]]++;
 return code;
}).join(""));
const flags=evidence.map(row=>row.join(""));
const benchmark=comparison?{sameGraphDigest:digest(a),uncachedGraphDigest:digest(comparison),identical:digest(a)===digest(comparison),cachedMs:a.summary.elapsedMs,uncachedMs:comparison.summary.elapsedMs,cachedPeakRss:a.summary.peakRssBytes,uncachedPeakRss:comparison.summary.peakRssBytes}:null;
if(benchmark&&!benchmark.identical)throw Error("Cached graph differs");
for(const [id,w] of Object.entries(a.witnesses)){
 const support=[...new Set(w.populationGroups.flatMap(i=>groups[i].branchIds))].sort();
 const previous=db.witnesses[id];
 // Same route may be found by a deeper run. Keep both version-specific links.
 if(previous&&(previous.source!=="POPSEARCH12"||JSON.stringify(previous.vector)!==JSON.stringify(w.vector)))throw Error("Witness collision "+id);
 db.witnesses[id]={...w,branchIds:[...new Set([...(previous?.branchIds||[]),...support])].sort(),populationVersions:{...(previous?.populationVersions||{}),[versionKey]:w.populationGroups},actualGameCertified:false};
}
const summary={...a.summary,statusCounts,knownConditionalPairs:known,knownConditionalAndModelPairs:knownCovered,rootMatchOnlyFlagPairs:rootOnly,modelRepresentativePairs,modelReusedPairs,benchmark,sourceBytes:bytes.length,historyCount:a.histories.length};
const v={depth:a.depth,engine:a.engine,historyFileHash:a.historyFileHash,file,sha256:sha(bytes),bytes:bytes.length,summary,records,matrix:a.matrix,status,evidence:flags,groups,histories:a.histories.map(({activeMaskHex,...h})=>h),witnessIds:Object.keys(a.witnesses)};
const versions={...old,[versionKey]:v},latest=Object.keys(versions).sort((x,y)=>versions[y].depth-versions[x].depth)[0];
db.populationSearch={schemaVersion:1,sourceMetadataSha256:a.sourceMetadataSha256,origins:a.origins,branches:a.branches,versions,latest,summary:versions[latest].summary,scope:"FIXED_ACTIVE_RESEARCH_NUMERICAL_ONLY: birth min/max, cap-target growth placements, deterministic ordinary live actions at starting rank, external resources assumed, no future research or acquisition timing proof; event/start country compatibility not checked. All excluded/unknown gates are unresolved for full search."};
db.summary.populationSearch=db.populationSearch.summary;
db.sources.POPSEARCH12={file,sha256:sha(bytes),sourceMetadataSha256:a.sourceMetadataSha256,historyFileHash:a.historyFileHash};
db.policies.POPSEARCH12="동일 연구 이력 종료 상태의 활성 연구만 적용한 제한 수치모형. 출생·이벤트 시점·자원·성장 공동 달성 미인증. 대표 계산 그룹과 실제 연구 이력 별칭을 유지하며 전역 불가능·최적성 판정에 사용하지 않음.";
db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
fs.writeFileSync("public/data/"+file,bytes);
fs.writeFileSync(registry,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
console.log(JSON.stringify(summary));
