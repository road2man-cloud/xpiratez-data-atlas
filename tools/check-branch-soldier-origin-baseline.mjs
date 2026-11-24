import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {decodeOriginReport} from "./origin-report-codec.mjs";
export function checkOriginBaseline(db){
 const file=fs.readFileSync("public/data/soldier-origin-candidates.json"),r=decodeOriginReport(file),b=db.originBaseline;
 assert(b,"All-origin baseline missing from common registry");
 assert.equal(b.sourceMetadataSha256,db.sourceMetadataSha256);
 assert.equal(b.sourceReportHash,r.sourceHash);
 assert.equal(b.sourceSha256,createHash("sha256").update(file.toString().replaceAll("\r\n","\n")).digest("hex"));
 assert.equal(b.rows.length,72);assert.equal(b.summary.modeledOrigins,72);
 const originals=new Map(r.records.map(x=>[x.profileId,x]));
 const branches=new Map(db.branches.map(x=>[x.id,x]));
 for(const row of b.rows){
  const original=originals.get(row.profileId);assert(original);
  const c=new Map(original.candidates.filter(x=>x.campaignContext?.kind==="compatible").map(x=>[x.id,x]));
  assert.equal(row.refs.length,c.size);assert.equal(row.modelCount,row.models.length);
  for(const ref of row.refs){
   assert(c.has(ref.id));assert.equal(ref.depth,c.get(ref.id).transforms.length);
   assert(ref.modelIds.length>0);
   for(const [id,band,mask] of ref.placements){assert(ref.modelIds.includes(id));assert(["min","max"].includes(band));assert(mask>=0&&mask<2**ref.depth);}
   for(const id of ref.branchIds){assert(branches.has(id)&&!branches.get(id).sourceRootConflict);assert(b.branchLinks[id][row.profileId].includes(ref.id));}
  }
  for(const [id,m] of row.models.entries()){
   assert.equal(m.id,id);assert(c.has(m.route));
   assert.deepEqual(m.vector.map((v,i)=>b.stats[i]==="psiSkill"&&m.raw[i]<=0&&m.bonus[i]>0?m.raw[i]:Math.max(b.stats[i]==="health"?1:0,m.raw[i]+m.bonus[i])),m.vector);
   assert.equal(m.total,m.vector.reduce((a,b)=>a+b,0));
   assert(row.refs.find(x=>x.id===m.route)?.placements.some(x=>x[0]===id&&x[1]===m.band&&x[2]===m.mask));
  }
  assert.equal(row.models[row.best].total,Math.max(...row.models.map(x=>x.total)));
  for(const [i,id] of row.maxima.entries())assert.equal(row.models[id].vector[i],Math.max(...row.models.map(m=>m.vector[i])));
 }
 assert.equal(b.summary.originalRoutes,r.summary.compatibleWitnesses);
 assert.equal(b.summary.distinctModels,b.rows.reduce((a,x)=>a+x.models.length,0));
 assert.equal(b.summary.actualGameCertified,0);
 assert.equal(b.summary.rootMatchedOriginBranchPairs,Object.values(b.branchLinks).reduce((a,x)=>a+Object.keys(x).length,0));
 if(db.originScheduleFrontier){assert.equal(db.originScheduleFrontier.originArchiveSha256,b.sourceSha256);assert.equal(db.originScheduleFrontier.summary.origins,72);}
 console.log("PASS all-origin baseline",b.summary.modeledOrigins,b.summary.originalRoutes,b.summary.distinctModels,b.summary.rootMatchedOriginBranchPairs);
}
