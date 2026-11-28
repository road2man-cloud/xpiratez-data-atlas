import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {produceForwardGraph} from "./atlas-overcap-forward-research.mjs";
const arg=(k,d)=>Number(process.argv.find(x=>x.startsWith("--"+k+"="))?.split("=")[1]||d);
const maxExpanded=arg("expand",80),maxNodes=arg("nodes",5000),maxMonth=arg("months",3),resume=process.argv.includes("--resume");
assert(Number.isSafeInteger(maxExpanded)&&maxExpanded>=5&&Number.isSafeInteger(maxNodes)&&maxNodes>=5&&Number.isSafeInteger(maxMonth)&&maxMonth>=0);
const sha=b=>createHash("sha256").update(b).digest("hex"),path="public/data/soldiers-modern-index.json",bytes=fs.readFileSync(path),data=JSON.parse(bytes);
const files=["tools/atlas-overcap-forward-research.mjs","tools/atlas-overcap-rooted-early-research.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","tools/population-research-career-core.mjs","public/soldiers/modern/origin-witness.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/event-chronology.js","public/soldiers/modern/auto-zero-cascade.js","public/soldiers/modern/eligibility.js","public/soldiers/modern/origin-campaign-context.js"];
const inputs={rulesSha256:sha(bytes),engineFiles:Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])),nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz"))};
const stem="tools/data/overcap-forward-research-v1";
let prior=null;
if(resume){
 const old=fs.readFileSync(stem+".json.gz"),summary=JSON.parse(fs.readFileSync(stem+"-summary.json","utf8"));
 assert.equal(sha(old),summary.artifactSha256);prior=JSON.parse(gunzipSync(old));assert.deepEqual(prior.inputs,inputs,"Engine or rules changed; old graph cannot be reused");assert.deepEqual(summary.inputs,inputs);
 assert(maxNodes>prior.nodes.length,"Resume node budget must exceed previous node count");
}
const previous=prior?{nodes:prior.summary.nodes,edges:prior.summary.edges,expanded:prior.summary.expanded}:null;
const result=produceForwardGraph(data,{maxExpanded,maxNodes,maxMonth,prior});
result.inputs=inputs;
const out=gzipSync(JSON.stringify(result),{level:9});
const summary={schema:result.schema,artifact:stem+".json.gz",artifactSha256:sha(out),inputs:result.inputs,roots:result.roots,budget:result.budget,...result.summary,previous,unsupported:result.unsupported,normalizationComplete:false,actualGameCertified:false,firstFailures:result.failed.slice(0,10)};
fs.writeFileSync(stem+".json.gz.tmp",out);fs.writeFileSync(stem+"-summary.json.tmp",JSON.stringify(summary,null,2)+"\n");
fs.renameSync(stem+".json.gz.tmp",stem+".json.gz");fs.renameSync(stem+"-summary.json.tmp",stem+"-summary.json");
console.log(JSON.stringify({...summary,inputs:{rulesSha256:inputs.rulesSha256,nativeArchiveSha256:inputs.nativeArchiveSha256}},null,2));
