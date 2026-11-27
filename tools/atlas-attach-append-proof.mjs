// Reuse registered witness audits only against a committed exact base.
// All new witnesses still get full chronological independent replay.
// Missing or changed evidence falls back to the normal complete audit.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {gunzipSync} from "node:zlib";
import assert from "node:assert/strict";
import {key,sha} from "./population-research-career-core.mjs";
const root="public/data/",asset=root+"soldier-population-missing-origin-career.json.gz",idx=root+"soldier-population-missing-origin-career-index.json.gz",dbFile=root+"branch-soldier-results.json.gz";
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createAppendAuditProof({base,db,ledger,index}){
 const metrics={requested:!!base,enabled:false,reused:0,fallback:0,reason:null};
 const off=reason=>{metrics.reason=reason;return {canReuse:()=>false,metrics};};
 if(!base)return off("NO_BASE");
 try{
  // Use a commit, never an unverified worktree or a moving ref.
  const commit=execFileSync("git",["rev-parse","--verify",base+"^{commit}"],{encoding:"utf8"}).trim();
  assert(/^[a-f0-9]{40}$/.test(commit));
  const read=p=>execFileSync("git",["show",commit+":"+p],{maxBuffer:128*1024*1024});
  assert.equal(sha(read(dbFile)),sha(fs.readFileSync(dbFile)),"Registration base DB changed");
  const bytes=read(asset),old=db.populationMissingOriginCareer;
  assert.equal(old.sha256,sha(bytes),"Registration base ledger bytes changed");
  const prior=JSON.parse(gunzipSync(bytes)),priorIndex=JSON.parse(gunzipSync(read(idx)));
  assert.equal(prior.sourceGraphSha256,old.sourceGraphSha256);
  assert.equal(priorIndex.sourceGraphSha256,old.sourceGraphSha256);
  assert.equal(key(prior.graphs),old.sourceGraphSha256);
  assert.equal(prior.sourceMetadataSha256,ledger.sourceMetadataSha256);
  for(const k of ["defaultRankPolicy","flatRollPolicy","lifecyclePolicy"])assert(eq(prior.summary[k],ledger.summary[k]),"Replay policy changed: "+k);
  // Audit dependencies must be unchanged. The attachment script itself
  // is the only changed caller; its independent replay code is retained.
  const queue=["tools/population-research-career-core.mjs","tools/population-shared-lifecycle-replay.mjs","tools/population-shared-default-rank.mjs","tools/population-growth-replay-core.mjs","tools/population-rank-trait-priority.mjs","public/soldiers/modern/origin-witness.js","public/soldiers/modern/origin-campaign-context.js"],seen=new Set();
  while(queue.length){
   const p=queue.pop();if(seen.has(p))continue;seen.add(p);
   const normalized=b=>b.toString("utf8").replace(/\r\n/g,"\n");
   const src=normalized(fs.readFileSync(p));
   assert.equal(sha(src),sha(normalized(read(p))),"Replay dependency changed: "+p);
   for(const m of src.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["'](\.[^"']+)["']/gm))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1].split("?")[0])));
  }
  for(const p of ["soldiers-modern-index.json","soldier-acquisition-progression-20261102.json","soldier-source-catalog.json"])assert(eq(JSON.parse(read(root+p)),JSON.parse(fs.readFileSync(root+p))),"Replay data changed: "+p);
  assert(index.actionNodes.length>=priorIndex.actionNodes.length);
  for(let i=0;i<priorIndex.actionNodes.length;i++)assert(eq(index.actionNodes[i],priorIndex.actionNodes[i]),"Action trie prefix changed: "+i);
  metrics.enabled=true;metrics.base=commit;metrics.dependencies=seen.size;metrics.actionPrefixNodes=priorIndex.actionNodes.length;
  function canReuse(id,r,g,n,i){
   const a=prior.routes[id],gi=a&&prior.graphs[a.sourceGraph],ni=gi?.nodes[a.sourceNode],ii=priorIndex.routes[id];
   // The old public witness is checked again by the caller. The graph
   // identity, exact chronological index, and difficulty context must
   // also be unchanged. Edge expansion is not part of the witness.
   const core=x=>x&&Object.fromEntries(Object.entries(x).filter(([k])=>k!=="edges"));
   const ok=!!(old.routes[id]&&a&&gi&&ni&&ii&&db.witnesses[id]&&eq(a,r)&&eq(ii,i)&&eq(core(ni),core(n))&&g.origin===gi.origin&&g.branch===gi.branch&&eq(g.allowedDifficulties,gi.allowedDifficulties));
   metrics[ok?"reused":"fallback"]++;return ok;
  }
  return {canReuse,metrics};
 }catch(e){return off(String(e.message).slice(0,240));}
}
