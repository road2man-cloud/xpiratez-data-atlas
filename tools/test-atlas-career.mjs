import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {ledgers,project,filterRows,rankRows,readResearchWitness,routeUrl,sum} from '../public/branch-soldier-atlas-career-core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../public/data/'+n+'.json',import.meta.url)));
const gz=n=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../public/data/'+n+'.json.gz',import.meta.url))));
const metadata=read('soldiers-modern-index').meta.source.metadataSha256;
const branchData=read('soldier-atlas-career-branches');assert.equal(branchData.sourceMetadataSha256,metadata);
const ids=new Set(branchData.branches.map(b=>b.id)),all=[],counts={},witnesses={};
for(const s of ledgers){
 const raw=gz(s.file),{rows,rejected}=project(s,raw,metadata);assert.deepEqual(rejected,[]);counts[s.key]=rows.length;
 for(const r of rows){assert(ids.has(r.branch),'Missing branch '+r.branch);assert(r.cap.length===12&&r.current.length===12);assert(!r.certified);assert(routeUrl(r).includes('populationRoute='));}
 if(s.index){const index=gz(s.index);let linked=0;for(const r of rows){const w=readResearchWitness(index,r,metadata);assert(w.actions.length>0);assert(w.gates.every(g=>r.order.includes(g.transform)));linked++;}witnesses[s.key]=linked;}
 all.push(...rows);
}
assert.equal(new Set(all.map(r=>r.key)).size,all.length);
const first=all[0],subset=filterRows(all,{origin:first.origin,body:first.body,branch:first.branch,training:first.order[0],difficulty:''});assert(subset.length&&subset.every(r=>r.origin===first.origin&&r.branch===first.branch));
const sorted=rankRows(subset,'cap','total');assert(sorted.every((r,i)=>!i||sum(sorted[i-1].cap)>=sum(r.cap)));
assert.equal(filterRows(all,{certified:true}).length,0);
const traits=all.filter(r=>r.traits?.length);assert(traits.length>0);assert(filterRows(all,{trait:traits[0].traits[0]}).every(r=>r.traits?.includes(traits[0].traits[0])));
console.log(JSON.stringify({counts,total:all.length,origins:new Set(all.map(r=>r.origin)).size,branches:new Set(all.map(r=>r.branch)).size,witnesses,measuredTraits:all.filter(r=>r.traits!==null).length,certified:0},null,2));
