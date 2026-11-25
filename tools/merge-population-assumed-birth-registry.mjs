// Attach an already audited V4 result to a newer shared registry without
// repeating the search or replacing another worker's proof ledgers.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p)));
const sha=x=>createHash("sha256").update(x).digest("hex");
const file="public/data/branch-soldier-results.json.gz",snapshot=process.argv[2];
assert(snapshot,"Usage: node tools/merge-population-assumed-birth-registry.mjs <audited-registry.gz>");
const db=decode(file),old=decode(snapshot),a=old.populationAssumedBirthClosure;
assert(a&&a.summary.conditionalClosed===76608&&a.actualGameCertified===false);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(old.populationSearch.versions.D3.sha256,db.populationSearch.versions.D3.sha256);
for(const k of ["populationClosure","populationAntichain","populationBirthBox","populationRandomBox","populationInvariantBound","populationBranchInvariant"]){
 assert.equal(old[k]?.sha256,db[k]?.sha256,"Source changed "+k);
}
for(const k of ["originExtendedContinuation","originResearchContinuation","originResearchChain"]){
 const x=old[k],y=db[k];assert.deepEqual(x?.published,y?.published,"Replay evidence changed "+k);
 for(const id of x?.published||[]){assert.deepEqual(x.routes[id],y.routes[id],"Replay changed "+id);assert.deepEqual(old.witnesses[id],db.witnesses[id],"Witness changed "+id);}
}
for(const m of [a,a.catalog,a.boundGap])assert.equal(sha(fs.readFileSync("public/data/"+m.file)),m.sha256,"Proof asset drift "+m.file);
if(db.populationAssumedBirthClosure)assert.deepEqual(db.populationAssumedBirthClosure,a,"Conflicting V4 proof");
db.populationAssumedBirthClosure=a;db.summary.populationAssumedBirthClosure=a.summary;
db.sources.POPASSUMEDBIRTH12=old.sources.POPASSUMEDBIRTH12;db.policies.POPASSUMEDBIRTH12=old.policies.POPASSUMEDBIRTH12;
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({conditional:a.summary.conditionalClosed,full:a.summary.fullCompleted,witnesses:Object.keys(db.witnesses).length,careerEnvelope:!!db.populationCareerEnvelope}));
