// Cumulative, atomic all-origin registry/UI publication from latest main.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import crypto from "node:crypto";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const git=(a,opts={})=>execFileSync("git",a,{maxBuffer:256*1024*1024,windowsHide:true,...opts});
const str=(a,opts={})=>git(a,{...opts,encoding:"utf8"}).trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const version="20261124-all-origin-4324";
git(["fetch","origin","main"]);
const base=str(["rev-parse","origin/main"]);
const get=p=>git(["show",base+":"+p]);
const exists=p=>{try{git(["cat-file","-e",base+":"+p],{stdio:"ignore"});return true;}catch{return false;}};
const stage="experiments/endgame-current-save/12-all-origin-shared-registry.json.gz";
execFileSync(process.execPath,["--max-old-space-size=6144","tools/build-all-origin-cap12.mjs","--base="+base,"--seconds=40","--output="+stage],{stdio:"inherit"});
execFileSync(process.execPath,["tools/check-all-origin-cap12.mjs","--registry="+stage],{stdio:"inherit"});
const asset="public/data/branch-soldier-results.json.gz";let bytes=fs.readFileSync(stage);const next=JSON.parse(gunzipSync(bytes)),prior=JSON.parse(gunzipSync(get(asset))),o=next.originCap12;
assert.equal(o.baseCommit,base);
assert.equal(o.archiveSHA256,sha(get("public/data/soldier-origin-candidates.json")));
assert(same(prior.branches,next.branches)&&same(prior.globalEvidence,next.globalEvidence)&&same(prior.summary.unifiedCap,next.summary.unifiedCap)&&same(prior.summary.careerConditional,next.summary.careerConditional)&&same(prior.summary.exactResourceIndex,next.summary.exactResourceIndex),"Existing branch/cohort/resource data changed");
for(const [id,w] of Object.entries(prior.witnesses))if(w.source!=="ORIGINCAP12")assert(same(w,next.witnesses[id]),"Prior witness lost/changed "+id);
for(const [id,p] of Object.entries(prior.profiles))if(p.source!=="ORIGINCAP12")assert(same(p,next.profiles[id]),"Prior profile lost/changed "+id);
for(const [id,s] of Object.entries(prior.sources))if(id!=="ORIGINCAP12")assert(same(s,next.sources[id]),"Prior evidence source changed "+id);
const oldAsset="public/data/soldier-origin-cap-frontier.json";
let migrated=0,migratedVectors=0;const recalculated=[];
if(exists(oldAsset)){
 const old=JSON.parse(get(oldAsset));
 assert.equal(old.originArchiveSha256,o.archiveSHA256,"Legacy origin archive changed");
 const byCandidate=new Map();
 for(const m of Object.values(o.models))for(const c of m.candidates)if(c.scope==="full-route")byCandidate.set(c.id,m);
 for(const r of old.records){
  for(const m of r.models){const x=byCandidate.get(m.candidateId);assert(x&&same(x.order,m.order)&&x.finalBody===m.body,"Prior sampled model missing "+m.candidateId);migrated++;}
  for(const b of r.bodies)for(const f of b.frontier){
   const x=byCandidate.get(f.candidateId);assert(x,"Prior sampled route missing "+f.candidateId);
   if(!x.witnessIds.some(id=>same(next.witnesses[id].vector,f.vector))){
    const replacement=x.witnessIds.find(id=>next.witnesses[id].vector.every((v,i)=>v>=f.vector[i]));
    assert(replacement,"Prior sampled vector not covered "+f.candidateId);
    recalculated.push({profileId:r.profileId,candidateId:f.candidateId,body:f.body,order:f.order,previousVector:f.vector,previousRaw:f.raw,previousBonus:f.bonus,previousSchedule:f.schedule,replacement,newVector:next.witnesses[replacement].vector});
   }
   migratedVectors++;
  }
 }
}
if(migrated){
 o.legacySampleMigration={archivePath:oldAsset,sourceCommit:base,sourceSha256:sha(get(oldAsset)),models:migrated,vectors:migratedVectors,recalculated,policy:"All prior sampled models preserved by route ID; changed previous vectors archived here and covered by pinned-engine vectors. Legacy public file retained only for cached clients."};
 bytes=gzipSync(Buffer.from(JSON.stringify(next)),{level:6});fs.writeFileSync(stage,bytes);
}
const patch=new Map([[asset,bytes]]);
function edit(file,transform){const t=get(file).toString("utf8"),eol=t.includes("\r\n")?"\r\n":"\n";const s=transform(t.replace(/\r\n/g,"\n"));patch.set(file,Buffer.from(eol==="\r\n"?s.replace(/\n/g,"\r\n"):s));}
function once(s,a,b){assert.equal(s.split(a).length,2,"Missing/ambiguous anchor: "+a.slice(0,120));return s.replace(a,b);}
function versionOf(s,pattern){return s.replace(pattern,version);}
const modulePath="public/branch-soldier-origin-cap.js";
for(const p of [modulePath,"tools/build-all-origin-cap12.mjs","tools/branch-soldier-origin-cap.mjs","tools/check-all-origin-cap12.mjs","tools/publish-all-origin-cap12.mjs"]){patch.set(p,fs.readFileSync(p));}
// The model imports the exact pinned remote engine in an isolated directory.
assert(Object.keys(o.engineSourceHashes||{}).length===5);
for(const [p,digest] of Object.entries(o.engineSourceHashes))assert.equal(sha(get(p)),digest,"Pinned numerical engine differs "+p);
const allUI="public/all-origin-cap-frontier.js";
if(!get(allUI).toString("utf8").includes("originCap12;"))patch.set(allUI,fs.readFileSync("tools/all-origin-cap-frontier-ui-source.js"));
edit("public/branch-soldier-catalog.js",s=>{
 if(s.includes("allOriginBodyWitnessIds"))return s;
 s=once(s,'import {inflateArchivedGzip}', 'import {allOriginBodyWitnessIds} from "./branch-soldier-origin-cap.js?v='+version+'";\nimport {inflateArchivedGzip}');
 return once(s," return groupBodyMaxima(keys,modern.soldiers,candidates);",' if(db&&!branchId)for(const id of allOriginBodyWitnessIds(db)){const w=db.witnesses[id];candidates.push({...registryCandidate(db,id),steps:routeActionCount(w)});}\n return groupBodyMaxima(keys,modern.soldiers,candidates);');
});
edit("public/branch-soldier-maxima.js",s=>{
 if(s.includes("ORIGINCAP12:"))return s;
 s=once(s,'ORIGIN:"출생처 등록 경로"','ORIGIN:"출생처 등록 경로",ORIGINCAP12:"전체 출생처 시간순 성장 상계"');
 return once(s,"UNIFIED12:0,ORIGIN:1,","UNIFIED12:0,ORIGINCAP12:1,ORIGIN:2,");
});
edit("public/soldiers/modern/app.js",s=>{
 if(s.includes("mergeAllOriginRows"))return s;
 s=once(s,"import {evidenceLabel} from '../../branch-soldier-maxima.js';","import {evidenceLabel} from '../../branch-soldier-maxima.js';\nimport {mergeAllOriginRows,allOriginCoverageText,originCapButton,renderAllOriginCap} from '../../branch-soldier-origin-cap.js?v="+version+"';");
 s=s.replaceAll("20261124-unified-maxima-1",version);
 s=once(s,"let integratedOrigins=new Map()","let sharedRegistry=null,integratedOrigins=new Map()");
 s=once(s,"function integratedRouteLink(row,label,route=row.route){","function integratedRouteLink(row,label,route=row.route){\n  if(sharedRegistry?.witnesses?.[route]?.source==='ORIGINCAP12')return originCapButton(route,label);");
 s=once(s,"try{const registry=await loadBranchSoldierResults();branchScope=","try{const registry=await loadBranchSoldierResults();sharedRegistry=registry;branchScope=");
 s=once(s,"integratedCoverage=registryCoverage(registry,integratedOrigins,REPORT.records.length);bodyRows=","integratedCoverage=registryCoverage(registry,integratedOrigins,REPORT.records.length);if(!activeBranch)integratedOrigins=mergeAllOriginRows(registry,integratedOrigins,DISPLAY_STATS);bodyRows=");
 s=once(s,"coverageNode.dataset.registryStatus=u?'loaded':'unavailable';","if(u&&sharedRegistry?.originCap12)coverageNode.textContent+=' '+allOriginCoverageText(sharedRegistry);\n    coverageNode.dataset.registryStatus=u?'loaded':'unavailable';");
 s=once(s,"async function openOrigin(id,candidateId=null,{sharedTerminal=false}={})","async function openOrigin(id,candidateId=null,{sharedTerminal=false,originCapRoute=null}={})");
 s=once(s,"const coverageNote=currentNotice+'<p","const coverageNote=currentNotice+(!activeBranch?renderAllOriginCap(sharedRegistry,id,originCapRoute,DATA.statLabels):'')+'<p");
 s=s.replaceAll("등록 분기 후보 내 최장","등록 후보 내 최장").replaceAll("등록 분기 후보 최장","등록 후보 최장");
 s=once(s,"integrated?integrated.steps+'개 시술 · '+fmt(integrated.branchCount)+'개 참조 분기'","integrated?integrated.steps+'개 시술 · '+(integrated.source==='ORIGINCAP12'?'출생처 공통 부모 미연결':fmt(integrated.branchCount)+'개 참조 분기')");
 s=once(s,"const shared=e.target.closest('[data-open-shared-candidate]');","const capRoute=e.target.closest('[data-origin-cap-route]');\n    if(capRoute){const route=capRoute.dataset.originCapRoute,w=sharedRegistry?.witnesses?.[route];if(w?.source==='ORIGINCAP12')void openOrigin(w.originProfile,w.archiveScope==='full-route'?w.archiveCandidateId:null,{sharedTerminal:w.body==='STR_SOLDIER_CHORT',originCapRoute:route}).then(()=>$('#originDetails').scrollIntoView({block:'start'}));return;}\n    const shared=e.target.closest('[data-open-shared-candidate]');");
 return s;
});
edit("public/branch-soldier-results.js",s=>{
 if(s.includes("allOriginCoverageText"))return s;
 s=once(s,'import {loadRuntime} from "./db-runtime.js";','import {loadRuntime} from "./db-runtime.js";\nimport {allOriginCoverageText} from "./branch-soldier-origin-cap.js?v='+version+'";');
 s=s.replaceAll('branch-soldier-catalog.js?v=20261124-unified-maxima-1','branch-soldier-catalog.js?v='+version);
 const line=s.split("\n").find(x=>x.includes("const overview=()=>"));assert(line&&line.endsWith("';"));
 return once(s,line,line.slice(0,-1)+'+(db.originCap12?\'<p class="bs-summary" data-all-origin-cap-coverage="true">\'+esc(allOriginCoverageText(db))+\'</p>\':"");');
});
for(const file of ["public/soldiers/modern/index.html","public/captains/index.html"])edit(file,s=>{
 if(!s.includes("data-all-origin-cap-frontier"))throw Error("Existing all-origin panel missing");
 s=s.replace(/(all-origin-cap-frontier\.js\?v=)[^"']+/g,"$1"+version).replace(/(branch-soldier-results\.js\?v=)[^"']+/g,"$1"+version);
 if(file.includes("soldiers/modern"))s=s.replaceAll("20261124-unified-maxima-1",version);
 return s;
});
edit(".github/workflows/pages.yml",s=>s.includes("node tools/check-all-origin-cap12.mjs")?s:once(s,"          node tools/check-branch-soldier-publication.mjs","          node tools/check-branch-soldier-publication.mjs\n          node tools/check-all-origin-cap12.mjs"));
// The former sample publisher must not recreate a parallel public DB.
edit("tools/publish-all-origin-cap-frontier.mjs",s=>s.includes("publish-all-origin-cap12.mjs")?s:'// The sampled panel now uses the shared registry.\nimport "./publish-all-origin-cap12.mjs";\n');
// Keep the older sampled asset as a compatibility snapshot during the first
// release, but never load or update it in the active UI. Subsequent cleanup
// can remove it after scoped/public caches have migrated.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-all-origin-index-")),env={...process.env,GIT_INDEX_FILE:path.join(tmp,"index")};
try{
 for(const [p,b] of patch)if(p.endsWith(".js")||p.endsWith(".mjs"))execFileSync(process.execPath,["--input-type=module","--check"],{input:b,stdio:["pipe","inherit","inherit"]});
 git(["read-tree",base],{env});
 for(const [p,b] of patch){const blob=str(["hash-object","-w","--stdin"],{input:b});git(["update-index","--add","--cacheinfo","100644,"+blob+","+p],{env});}
 const tree=str(["write-tree"],{env}),commit=str(["commit-tree",tree,"-p",base,"-m","feat(atlas): integrate all 72 origins and 4386 archived routes into shared 12-stat growth registry"],{env});
 const changed=str(["diff-tree","--no-commit-id","--name-only","-r",commit]).split("\n").filter(Boolean);
 assert(changed.length&&changed.every(p=>patch.has(p)),"Unrelated files changed");
 assert.equal(str(["ls-remote","origin","refs/heads/main"]).split(/\s+/)[0],base,"Remote moved: rerun safely");
 if(process.argv.includes("--push"))git(["push","origin",commit+":refs/heads/main"]);
 console.log(JSON.stringify({base,commit,changed,published:process.argv.includes("--push"),preservedPriorWitnesses:Object.keys(prior.witnesses).length,migratedSampleModels:migrated,migratedSampleVectors:migratedVectors,recalculatedSampleVectors:recalculated.length,summary:o.summary,registrySHA256:sha(bytes),pagesCertified:false},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
