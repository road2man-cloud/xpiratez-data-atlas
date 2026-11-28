// V109: preserve legacy evidence, build a rebase queue; never admit a route.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
const [receiptPath,ledgerPath,out]=process.argv.slice(2);
assert(receiptPath&&ledgerPath&&out,"Usage: node tools/build-hero-research-rebase-queue.mjs RECEIPT LEDGER.gz OUT.json");
const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8"));
const ledger=JSON.parse(gunzipSync(fs.readFileSync(ledgerPath)));
assert.equal(receipt.schema,"TARGETED_CONDITIONAL_TRANSFORMATION_CONTINUATIONS_V1");
assert.equal(receipt.sourceMetadataSha256,ledger.sourceMetadataSha256,"Ruleset changed: manual migration required");
const entries=Object.entries(ledger.routes);
const queue=receipt.produced.map(e=>{
  const matches=entries.filter(([,r])=>r.body===receipt.body&&r.origin===e.origin&&r.branch===e.branch&&!r.order.includes(e.target));
  const rank=r=>Number(r.fullActionHash===e.prefixActionHash)*2+Number(r.canonicalStateHash===e.beforeStateHash);
  matches.sort((a,b)=>rank(b[1])-rank(a[1])||a[0].localeCompare(b[0]));
  return {legacyRoute:e.sourceRoute,legacyPrefixHash:e.prefixActionHash,target:e.target,origin:e.origin,branch:e.branch,legacySuffix:e.suffix,legacyAfter:e.after,candidates:matches.map(([id,r])=>({id,graph:r.sourceGraph,node:r.sourceNode,prefixHash:r.fullActionHash,stateHash:r.canonicalStateHash,exactLegacyPrefix:r.fullActionHash===e.prefixActionHash})),status:"PENDING_NORMALIZED_ROOT_REPLAY",registered:false,finalAdmission:false,actualGameCertified:false};
});
const result={schema:"HERO_RESEARCH_REBASE_QUEUE_V109",sourceGraphSha256:ledger.sourceGraphSha256,sourceLedgerFingerprint:ledger.fingerprint,legacyGraphSha256:receipt.sourceGraphSha256,requiredCampaignRootsKo:["근처 마을 방문","회의 소집","지역 농부 고용","기계류 조사"],policy:"Root IDs and legal chronology must come from the normalization worker; candidate presence does not certify research.",queue,registered:false,finalAdmission:false};
fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({queued:queue.length,candidates:queue.map(x=>x.candidates.length),registered:0}));
