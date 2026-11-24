// Publish a pair-search snapshot to the SAME common registry without replacing
// any independent career/origin/resource evidence. Exact base, normal FF push.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const git=(a,opts={})=>execFileSync("git",a,{maxBuffer:256*1024*1024,windowsHide:true,...opts});
const sha=b=>createHash("sha256").update(b).digest("hex");
const key=x=>sha(JSON.stringify(x));
const asset="public/data/branch-soldier-results.json.gz";
const report=JSON.parse(fs.readFileSync("experiments/endgame-current-save/12-all-origin-pair-search.json","utf8"));
git(["fetch","origin","main"]);
const base=git(["rev-parse","origin/main"]).toString().trim();
const get=f=>git(["show",base+":"+f]);
const db=JSON.parse(gunzipSync(get(asset)));
const s=report.summary;
assert.equal(report.kind,"ALL_ORIGIN_PAIR_SEARCH");
assert.equal(report.baseCommit,base,"Registry changed; rebuild pair search against latest main");
assert.equal(report.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(report.origins.length,72);
const branches=db.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict).sort((a,b)=>a.rank-b.rank);
assert.deepEqual(report.branches,branches.map(b=>({id:b.id,rank:b.rank})));
assert.equal(s.applicableCandidates,report.origins.length*branches.length);
assert.equal(s.globalOptimalCertified,0);
assert.equal(s.actualGameCertified,0);
const counts=Object.fromEntries(report.statusNames.map(n=>[n,0]));
const origins=new Map(report.origins.map(o=>[o.id,o])),branchIndex=new Map(branches.map((b,i)=>[b.id,i]));
assert.equal(origins.size,72);
for(const row of report.origins){
 assert.equal(row.status.length,branches.length);
 for(const n of row.status){assert(Number.isInteger(n)&&n>=0&&n<report.statusNames.length);counts[report.statusNames[n]]++;}
}
assert.deepEqual(counts,s.counts);
assert.equal(s.conditionalPairs,counts.conditionalRegistry+counts.jointBirth);
assert.equal(counts.jointBirth,Object.keys(report.pairs).length);
for(const [id,p] of Object.entries(report.pairs)){
 assert.equal(id,p.origin+"|"+p.branch);
 assert.equal(origins.get(p.origin).status[branchIndex.get(p.branch)],2);
 assert.equal(db.originCap12.models[p.birthModel].profileId,p.origin);
 assert.equal(db.originCap12.models[p.birthModel].order.length,0);
 assert.equal(p.actualGameCertified,false);
 assert(p.raw.length===12&&p.bonus.length===12&&[...p.raw,...p.bonus].every(Number.isSafeInteger));
 const r=report.roots[p.root];
 assert.equal(key(r.actions),p.root);
 assert.equal(key([...r.actions,...p.suffix]),p.fullActionHash);
}
if(db.originPairSearch){
 for(const [id,p] of Object.entries(db.originPairSearch.pairs))assert.deepEqual(report.pairs[id],p,"Lost prior conditional pair "+id);
}
db.originPairSearch=report;
db.summary.originPairSearch=s;
db.sources.ORIGINPAIRSEARCH={file:"tools/build-all-origin-pair-search.mjs",sourceMetadataSha256:db.sourceMetadataSha256,fingerprint:report.fingerprint};
db.policies.ORIGINPAIRSEARCH="72개 출생처와 연구 이력 보유 부모의 조합별 상태표. 정확한 연구 접두부 공유와 활성 연구 비트셋을 사용한 조건부 모집 증거이며 전역 최적성 인증은 별도.";
const payload=gzipSync(Buffer.from(JSON.stringify(db)),{level:6});
const version="20261124-origin-pair-search-1";
const replace=(text,from,to)=>{assert.equal(text.split(from).length,2,"Missing or duplicate anchor: "+from.slice(0,100));return text.replace(from,to);};
let shared=get("public/branch-soldier-results.js").toString("utf8");
if(!shared.includes("pairSearchMarkup")){
 shared=replace(shared,'const ROOT=document.querySelector("[data-branch-soldier-results]");','import {pairSearchMarkup} from "./branch-soldier-pair-search.js?v='+version+'";\nconst ROOT=document.querySelector("[data-branch-soldier-results]");');
 shared=replace(shared,"+overview()+'<p>하나의 육성 경로를 선택하면","+overview()+pairSearchMarkup(db)+'<p>하나의 육성 경로를 선택하면");
 shared=replace(shared,"+overview()+'<p>19개 말단은","+overview()+pairSearchMarkup(db)+'<p>19개 말단은");
}
const bump=(text,re)=>{assert(re.test(text),"Missing cache key");return text.replace(re,(_m,a,b)=>a+version+b);};
let soldier=get("public/soldiers/modern/index.html").toString("utf8");
soldier=bump(soldier,/(src="\.\.\/\.\.\/branch-soldier-results\.js\?v=)[^"]+(")/);
soldier=bump(soldier,/(src="app\.js\?v=)[^"]+(")/);
soldier=bump(soldier,/(href="acquisition-tech-view\.css\?v=)[^"]+(")/);
let app=get("public/soldiers/modern/app.js").toString("utf8");
app=bump(app,/(acquisition-tech-view\.js\?v=)[^']+(')/);
let captain=get("public/captains/index.html").toString("utf8");
captain=bump(captain,/(src="\.\.\/branch-soldier-results\.js\?v=)[^"]+(")/);
const patch=new Map([[asset,payload],["public/branch-soldier-results.js",Buffer.from(shared)],["public/soldiers/modern/index.html",Buffer.from(soldier)],["public/soldiers/modern/app.js",Buffer.from(app)],["public/captains/index.html",Buffer.from(captain)],["modules/captains/index.html",Buffer.from(captain)]]);
for(const f of ["public/branch-soldier-pair-search.js","tools/build-all-origin-pair-search.mjs","tools/publish-all-origin-pair-search.mjs"])patch.set(f,fs.readFileSync(f));
for(const f of ["public/branch-soldier-results.js","public/soldiers/modern/app.js","public/branch-soldier-pair-search.js"])execFileSync(process.execPath,["--input-type=module","--check"],{input:patch.get(f),windowsHide:true});
const idx=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-pair-publish-"));
try{
 const env={...process.env,GIT_INDEX_FILE:path.join(idx,"index")};
 git(["read-tree",base],{env});
 for(const [f,b] of patch){const blob=git(["hash-object","-w","--stdin"],{input:b}).toString().trim();git(["update-index","--add","--cacheinfo","100644,"+blob+","+f],{env});}
 const tree=git(["write-tree"],{env}).toString().trim();
 const commit=git(["commit-tree",tree,"-p",base,"-m","feat(atlas): publish whole-population pair coverage and shared research prefix reuse"],{env}).toString().trim();
 const changed=git(["diff-tree","--no-commit-id","--name-only","-r",commit]).toString().trim().split(/\r?\n/);
 assert(changed.every(f=>patch.has(f)));
 const push=process.argv.includes("--push");
 if(push)git(["push","origin",commit+":refs/heads/main"]);
 const remote=push?git(["ls-remote","origin","refs/heads/main"]).toString().split(/\s+/)[0]:null;
 if(push)assert.equal(remote,commit);
 console.log(JSON.stringify({commit,base,changed,published:push,bytes:payload.length,sha256:sha(payload),origins:s.origins,pairs:s.applicableCandidates,jointBirth:s.counts.jointBirth,conditionalPairs:s.conditionalPairs,unified:db.summary.unifiedCap.conditionalPaths,registeredWitnesses:db.summary.registeredWitnesses,originExtension:db.summary.originExtension12?.registered,career:db.summary.careerConditional?.suffixReplayed}));
}finally{fs.rmSync(idx,{recursive:true,force:true});}
