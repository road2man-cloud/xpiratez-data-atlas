// Restore a compatible packed transport from a previously published registry.
// This is a generated-data migration: no route, stat, or research fields change.
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const asset="public/data/branch-soldier-results.json.gz";
const arg=process.argv.find(x=>x.startsWith("--from="))?.slice(7);
if(!arg||!/^[a-f0-9]{7,40}$/.test(arg))throw Error("Pass an explicit prior registry commit with --from=");
const sha=b=>createHash("sha256").update(b).digest("hex");
const current=JSON.parse(gunzipSync(fs.readFileSync(asset)));
const prior=JSON.parse(gunzipSync(execFileSync("git",["show",arg+":"+asset],{maxBuffer:150e6})));
if(current.sourceMetadataSha256!==prior.sourceMetadataSha256)throw Error("Ruleset mismatch");
const now=current.summary.exactResourceIndex,old=prior.summary.exactResourceIndex;
const restored=[];
for(const [digest,entry] of Object.entries(old.versions)){
 const p=entry.packedTransport,next=now.versions[digest];
 if(!p)continue;
 if(!next||next.sha256!==entry.sha256||next.file!==entry.file)throw Error("Original resource identity changed: "+digest);
 if(!/^branch-soldier-d[1-9][0-9]*-exact-(damsel|madgal)[.]packed[.]gz$/.test(p.file)||p.format!=="XPZEX001")throw Error("Invalid transport filename");
 const bytes=fs.readFileSync("public/data/"+p.file);
 if(bytes.length!==p.bytes||sha(bytes)!==p.sha256)throw Error("Packed transport digest mismatch: "+p.file);
 if(next.packedTransport&&JSON.stringify(next.packedTransport)!==JSON.stringify(p))throw Error("Refusing to replace a different current transport");
 next.packedTransport=p;
 restored.push(p.file);
}
for(const entry of Object.values(now.classes)){
 const p=now.versions[entry.sha256]?.packedTransport;
 if(p)entry.packedTransport=p;
}
current.sources.EXACTRESOURCE12.files=Object.values(now.versions).flatMap(x=>[{file:x.file,sha256:x.sha256},...(x.packedTransport?[{file:x.packedTransport.file,sha256:x.packedTransport.sha256}]:[])]);
const bytes=gzipSync(Buffer.from(JSON.stringify(current)),{level:9});
fs.writeFileSync(asset,bytes);
console.log(JSON.stringify({restored,sha256:sha(bytes),careerReplayed:current.summary.careerConditional.suffixReplayed,registeredWitnesses:current.summary.registeredWitnesses}));
