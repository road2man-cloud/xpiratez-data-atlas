// Add joint suffix evidence to the current shared registry atomically.
// Independent numerical, career, origin and population data are untouched.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const git=(a,opts={})=>execFileSync("git",a,{maxBuffer:256*1024*1024,windowsHide:true,...opts});
const sha=b=>createHash("sha256").update(b).digest("hex"),key=x=>sha(JSON.stringify(x));
const asset="public/data/branch-soldier-results.json.gz";
const a=JSON.parse(fs.readFileSync("experiments/endgame-current-save/12-all-origin-pair-continuation.json","utf8"));
git(["fetch","origin","main"]);const base=git(["rev-parse","origin/main"]).toString().trim(),get=f=>git(["show",base+":"+f]);
const db=JSON.parse(gunzipSync(get(asset))),cohort=db.originPairSearch;
assert.equal(a.kind,"ALL_ORIGIN_PAIR_CONTINUATION");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(a.birthFingerprint,cohort.fingerprint);assert.equal(a.summary.actualGameCertified,0);assert.equal(a.summary.globalOptimalCertified,0);
assert.equal(Object.keys(a.routes).length,a.summary.registeredRoutes);assert.equal(Object.keys(a.models).length,a.summary.numericModels);
for(const [id,r] of Object.entries(a.routes)){
 const p=cohort.pairs[r.pair],root=cohort.roots[r.root];assert(p&&root);
 assert.equal(id,"OPR12:"+key([r.pair,r.order]).slice(0,24));assert.equal(p.root,r.root);assert.equal(r.origin,p.origin);assert.equal(r.branch,p.branch);
 assert.deepEqual(r.suffix.slice(0,p.suffix.length),p.suffix);
 assert.deepEqual(r.suffix.slice(p.suffix.length).filter(s=>s.type==="transform").map(s=>s.transform),r.order);
 assert.equal(key([...root.actions,...r.suffix]),r.fullActionHash);assert.equal(r.actualGameCertified,false);
 assert([r.raw,r.bonus,r.effective].every(v=>v.length===12&&v.every(Number.isSafeInteger)));
 if(r.model){const m=a.models[r.model];assert(m);assert.equal(m.origin,r.origin);assert.equal(m.body,r.body);assert.deepEqual(m.order,r.order);}
}
for(const m of Object.values(a.models)){assert.equal(m.actualGameCertified,false);assert(m.frontier.length&&m.frontier.every(x=>[x.vector,x.raw,x.bonus].every(v=>v.length===12&&v.every(Number.isSafeInteger))));}
if(db.originPairContinuation){
 const old=db.originPairContinuation;
 if(old.engine!==a.engine){
  const m=a.engineMigration;
  assert(m&&m.from===old.engine&&m.to===a.engine,"Unknown engine migration");
  assert.equal(m.legacyCommit,"e5b60e9e6b4cba44e5c239469b2a8d3aa356c736");
  assert.equal(m.legacyHash,sha(git(["show",m.legacyCommit+":tools/build-all-origin-pair-continuation.mjs"])));
  assert.equal(m.legacyCheckpointHash,sha(git(["show",m.legacyCommit+":tools/origin-pair-exact-prefix-checkpoint.mjs"])));
  assert.equal(old.engine,key(["JOINT_SUFFIX_V2",cohort.fingerprint,a.numericHashes,m.legacyCheckpointHash,m.legacyHash]));
  assert.deepEqual(old.numericHashes,a.numericHashes);
  assert.equal(a.checkpointHash,sha(fs.readFileSync("tools/origin-pair-exact-prefix-checkpoint.mjs")));
  assert.equal(a.engine,key(["JOINT_SUFFIX_V3",cohort.fingerprint,a.numericHashes,a.checkpointHash,sha(fs.readFileSync("tools/build-all-origin-pair-continuation.mjs"))]));
 }
 for(const [k,r] of Object.entries(old.routes))assert.deepEqual(a.routes[k],r,"Lost route "+k);
 for(const [k,m] of Object.entries(old.models))assert.deepEqual(a.models[k],m,"Lost model "+k);
}
db.originPairContinuation=a;db.summary.originPairContinuation=a.summary;
db.sources.ORIGINPAIRCONT12={file:"tools/build-all-origin-pair-continuation.mjs",sourceMetadataSha256:a.sourceMetadataSha256,engine:a.engine};
db.policies.ORIGINPAIRCONT12="동일 연구 접두부·조건부 모집 이후 활성 연구로 확정 수치 시술을 재생. 실제 재생 실효값과 별도 성장 상계를 구분하고 기존 증거 계층에 합산하지 않음.";
const payload=gzipSync(Buffer.from(JSON.stringify(db)),{level:6}),v="20261125-origin-joint-suffix-1520";
const replace=(text,from,to)=>{assert.equal(text.split(from).length,2,"Missing or duplicate anchor: "+from);return text.replace(from,to);};
const bump=(text,re)=>{assert(re.test(text),"Missing cache key");return text.replace(re,(_m,a,b)=>a+v+b);};
let shared=get("public/branch-soldier-results.js").toString("utf8");
if(!shared.includes("pairContinuationMarkup")){
 shared=replace(shared,'const ROOT=document.querySelector("[data-branch-soldier-results]");','import {pairContinuationMarkup} from "./branch-soldier-pair-continuation.js?v='+v+'";\nconst ROOT=document.querySelector("[data-branch-soldier-results]");');
 assert.equal(shared.split("pairSearchMarkup(db)").length,3);shared=shared.replaceAll("pairSearchMarkup(db)","pairSearchMarkup(db)+pairContinuationMarkup(db)");
}
shared=shared.replace(/branch-soldier-pair-continuation\.js\?v=[^"]+/,"branch-soldier-pair-continuation.js?v="+v);
let soldier=get("public/soldiers/modern/index.html").toString("utf8");
soldier=bump(soldier,/(src="\.\.\/\.\.\/branch-soldier-results\.js\?v=)[^"]+(")/);
soldier=bump(soldier,/(src="app\.js\?v=)[^"]+(")/);
soldier=bump(soldier,/(href="acquisition-tech-view\.css\?v=)[^"]+(")/);
let app=get("public/soldiers/modern/app.js").toString("utf8");app=bump(app,/(acquisition-tech-view\.js\?v=)[^']+(')/);
let captain=get("public/captains/index.html").toString("utf8");captain=bump(captain,/(src="\.\.\/branch-soldier-results\.js\?v=)[^"]+(")/);
const patch=new Map([[asset,payload],["public/branch-soldier-results.js",Buffer.from(shared)],["public/soldiers/modern/index.html",Buffer.from(soldier)],["public/soldiers/modern/app.js",Buffer.from(app)],["public/captains/index.html",Buffer.from(captain)],["modules/captains/index.html",Buffer.from(captain)]]);
for(const f of ["public/branch-soldier-pair-continuation.js","tools/build-all-origin-pair-continuation.mjs","tools/publish-all-origin-pair-continuation.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs"])patch.set(f,fs.readFileSync(f));
for(const f of ["public/branch-soldier-results.js","public/soldiers/modern/app.js","public/branch-soldier-pair-continuation.js"])execFileSync(process.execPath,["--input-type=module","--check"],{input:patch.get(f),windowsHide:true});
const idx=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-joint-suffix-"));
try{const env={...process.env,GIT_INDEX_FILE:path.join(idx,"index")};git(["read-tree",base],{env});
 for(const [f,b] of patch){const blob=git(["hash-object","-w","--stdin"],{input:b}).toString().trim();git(["update-index","--add","--cacheinfo","100644,"+blob+","+f],{env});}
 const tree=git(["write-tree"],{env}).toString().trim(),commit=git(["commit-tree",tree,"-p",base,"-m","feat(atlas): attach joint origin birth and active-research training continuations"],{env}).toString().trim();
 const changed=git(["diff-tree","--no-commit-id","--name-only","-r",commit]).toString().trim().split(/\r?\n/);assert(changed.every(f=>patch.has(f)));
 const push=process.argv.includes("--push");if(push){git(["push","origin",commit+":refs/heads/main"]);assert.equal(git(["ls-remote","origin","refs/heads/main"]).toString().split(/\s+/)[0],commit);}
 console.log(JSON.stringify({base,commit,published:push,changed,bytes:payload.length,sha256:sha(payload),registeredRoutes:a.summary.registeredRoutes,populationVersions:Object.keys(db.populationSearch?.versions||{}),pairBirths:cohort.summary.registeredJointBirths,unified:db.summary.unifiedCap.conditionalPaths,registeredWitnesses:db.summary.registeredWitnesses}));
}finally{fs.rmSync(idx,{recursive:true,force:true});}
