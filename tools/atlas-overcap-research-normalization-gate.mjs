import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const SCHEMA='ATLAS_CAMPAIGN_RESEARCH_NORMALIZATION_RECEIPT_V1';
export const ROOT_LABELS=['근처 마을 방문','회의 소집','지역 농부 고용','기계류 조사'];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// Consumer contract only: upstream chronological replay must issue the receipt.
export function requireNormalizedResearch({stage,ledger,read=fs.readFileSync,digest=hash}){
 const path=stage+'research-normalization-receipt.json';
 let receipt;
 try{receipt=JSON.parse(read(path,'utf8'));}catch(e){throw new Error('P0 research normalization receipt missing or unreadable: '+path,{cause:e});}
 assert.equal(receipt.schema,SCHEMA);
 assert.equal(receipt.status,'COMPLETE');
 assert.deepEqual(Object.keys(receipt.roots||{}).sort(),[...ROOT_LABELS].sort());
 const ids=Object.values(receipt.roots);assert(ids.every(x=>typeof x==='string'&&/^STR_/.test(x))&&new Set(ids).size===4);
 assert.equal(receipt.sourceMetadataSha256,ledger.sourceMetadataSha256);
 assert.equal(receipt.sourceGraphSha256,ledger.sourceGraphSha256);
 assert.equal(receipt.ledgerBytesSha256,digest(stage+'soldier-population-missing-origin-career.json.gz'));
 assert.equal(receipt.rulesBytesSha256,digest('public/data/soldiers-modern-index.json'));
 const engines=Object.entries(receipt.engineFiles||{});assert(engines.length>0,'Missing normalized engine fingerprint');
 for(const [p,h] of engines){assert(/^(tools|public)\/[a-zA-Z0-9_./-]+$/.test(p)&&!p.split('/').includes('..'));assert.equal(digest(p),h,'Normalized engine changed: '+p);}
 const routes=Object.entries(ledger.routes),proofs=receipt.routes||{};
 assert.equal(Object.keys(proofs).length,routes.length,'Incomplete route coverage');
 for(const [id,r] of routes){const p=proofs[id];assert(p&&p.status==='REPLAYED'&&p.actionHash===r.fullActionHash&&p.stateHash===r.canonicalStateHash,'Unnormalized route: '+id);}
 assert.equal(receipt.failedRoutes,0);assert.equal(receipt.unresolvedRoutes,0);
 return receipt;
}
