// Publish only actual completed producer artifacts from the current source
// fingerprint. Separate CLI batches are never mistaken for full coverage.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p));
const basePath=dir+"overcap-forward-captain-gdx-active-v3.json",sourcePath=dir+"overcap-forward-persuasion-sources-v3.json";
const inputs={baseSha256:sha(fs.readFileSync(basePath)),sourceSha256:sha(fs.readFileSync(sourcePath)),producers:Object.fromEntries(["tools/build-overcap-forward-persuasion-v3.mjs","tools/build-overcap-forward-persuasion-sources-v3.mjs","tools/atlas-overcap-forward-persuasion-v3.mjs","tools/replay-overcap-forward-captain-gdx-v3.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]))};
const base=load(basePath),rows=[],missing=[];
for(const row of base.scenarios)for(const b of row.branches){
 const stem=dir+"overcap-forward-persuasion-v3-"+row.scenario+"-"+row.root.toLowerCase()+"-"+b.award.toLowerCase();
 const path=stem+".json.gz",summary=stem+"-summary.json";
 if(!fs.existsSync(path)||!fs.existsSync(summary)){missing.push({scenario:row.scenario,root:row.root,award:b.award,reason:"ARTIFACT_ABSENT"});continue;}
 const s=load(summary);
 if(JSON.stringify(s.inputs)!==JSON.stringify(inputs)){missing.push({scenario:row.scenario,root:row.root,award:b.award,reason:"STALE_PRODUCER_INPUTS"});continue;}
 const bytes=fs.readFileSync(path);assert.equal(sha(bytes),s.artifactSha256);
 const g=JSON.parse(gunzipSync(bytes));
 assert.deepEqual(g.inputs,inputs);assert.equal(g.prefix.sha256,row.sha256);assert.equal(g.prefix.stateHash,b.stateHash);assert.equal(g.final.stateHash,s.final.stateHash);
 assert.equal(g.scenario,row.scenario);assert.equal(g.root,row.root);assert.equal(g.award,b.award);
 let h=g.prefix.stateHash;for(const [i,step] of g.steps.entries()){assert.equal(step.index,g.prefix.steps+i+1);assert.equal(step.beforeHash,h);h=step.afterHash;}assert.equal(h,g.final.stateHash);
 const reached=g.final.targets.filter(t=>t.reached).map(t=>t.id),core=["STR_SOCIALIZING","STR_PERSUASION","STR_SECTOID_LEADER"].every(k=>reached.includes(k));
 rows.push({scenario:row.scenario,root:row.root,award:b.award,path,summary,sha256:s.artifactSha256,prefix:g.prefix,newSteps:g.steps.length,month:g.final.month,researchCount:g.final.researchCount,stateHash:g.final.stateHash,reached,rankBlockers:g.final.rankBlockers,deferredOptions:s.deferredOptions,failures:g.failures,status:core?"CONDITIONAL_PERSUASION_AND_LEADER_REACHED":"OPEN",actualGameCertified:false});
}
const counts={expected:rows.length+missing.length,produced:rows.length,coreReached:rows.filter(x=>x.status==="CONDITIONAL_PERSUASION_AND_LEADER_REACHED").length,newSteps:rows.reduce((n,x)=>n+x.newSteps,0),deferredOptions:rows.reduce((n,x)=>n+x.deferredOptions,0),maxResearchCount:Math.max(0,...rows.map(x=>x.researchCount))};
const out={schema:"ATLAS_FORWARD_PERSUASION_UNIFIED_V3",inputs,counts,scenarios:rows,missing,normalizationComplete:false,actualGameCertified:false,scope:"Exact source-bound conditional continuations. Rank score, funds, complete mission and calendar state remain unverified; this registry is not a campaign normalization receipt."};
fs.writeFileSync(dir+"overcap-forward-persuasion-active-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({counts,missing,scenarios:rows.map(r=>[r.scenario,r.root,r.award,r.newSteps,r.researchCount,r.status])},null,2));
