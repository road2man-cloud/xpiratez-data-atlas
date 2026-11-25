// Detail shards are part of the existing shared career ledger, not a new DB.
// Keep the full, immutable original calendar as a content-addressed gzip blob.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {key,sha} from "./population-research-career-core.mjs";
const dir="data/soldier-financed-career-details";
export function storeFinancedDetail(r){
 if(r.detailFile){
  assert.equal(r.detailFile,dir+"/"+r.detailHash+".json.gz");
  assert(fs.existsSync(path.join("public",r.detailFile)),"Missing existing detail "+r.detailFile);
  return r;
 }
 const text=JSON.stringify(r),hash=sha(text),detailFile=dir+"/"+hash+".json.gz",file=path.join("public",detailFile),bytes=Buffer.byteLength(text);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(!fs.existsSync(file)){
  const packed=gzipSync(text,{level:6});fs.writeFileSync(file+".tmp",packed);fs.renameSync(file+".tmp",file);
 }
 const {allocations,unresolved,labGateUnresolved,eventGates,fundingWaits,sourceRewards,logicalSteps,skipped,deadlineDispatches,deadlineResolved,calendar,transactions,monthly,layout,closingStock,closingHeld,finalResearch,finalDisabled,missingOriginalActiveResearch,...summary}=r;
 return {...summary,missingOriginalActiveResearchCount:missingOriginalActiveResearch.length,
  eventGates:eventGates.map(({gateState,...g})=>g),
  counts:{allocations:allocations.length,prefixStockReuse:allocations.filter(a=>a.kind==="PREFIX_STOCK_REUSE").length,unresolved:unresolved.length,labGateUnresolved:labGateUnresolved.length,fundingWaits:fundingWaits.length,fixedRewardDeliveries:sourceRewards.length,logicalSteps:logicalSteps.length,skipped:skipped.length,deadlineDispatches:deadlineDispatches.length,deadlineResolved:deadlineResolved.length,calendar:calendar.length,transactions:transactions.length,monthly:monthly.length},
  detailFile,detailHash:hash,detailBytes:bytes,detailGzipBytes:fs.statSync(file).size};
}
export function loadFinancedDetail(r){
 assert.equal(r.detailFile,dir+"/"+r.detailHash+".json.gz");
 const bytes=gunzipSync(fs.readFileSync(path.join("public",r.detailFile)));
 assert.equal(bytes.length,r.detailBytes);assert.equal(sha(bytes),r.detailHash);
 const x=JSON.parse(bytes);assert.equal(x.calendarHash,r.calendarHash);assert.equal(x.routeId,r.routeId);
 return x;
}
