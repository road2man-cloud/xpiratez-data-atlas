// Compact witness projection. Not a replacement for the shared registry.
// Keep complete replay rows in gzip; every index entry references one row.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const [input,graphPath,output,indexPath]=process.argv.slice(2);
if(!input||!graphPath||!output||!indexPath)throw Error('usage: input graph output.gz index.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(input),graphBytes=fs.readFileSync(graphPath);
const ledger=JSON.parse(bytes),graph=JSON.parse(graphBytes);
if(ledger.schema!=='ATLAS_FORWARD_CAREER_GROWTH_V1'||ledger.graphSha256!==hash(graphBytes)||ledger.sourceMetadataSha256!==graph.sourceMetadataSha256)throw Error('ledger/graph mismatch');
const groups=new Map(),routeIds=new Set(),routes=[];
for(const [row,r] of ledger.results.entries()){
 const node=graph.nodes[r.targetState];
 if(!node||node.id!==r.targetState||r.graphSha256!==ledger.graphSha256||r.gameCertified!==false)throw Error('bad route '+row);
 const id=hash(JSON.stringify([r.graphSha256,r.targetState,r.profileId,r.trace.map(t=>t.action),r.finalStateHash]));
 if(routeIds.has(id))throw Error('duplicate route identity');routeIds.add(id);
 const statKeys=Object.keys(r.after.stats);
 if(statKeys.length!==12||statKeys.some(k=>!Number.isSafeInteger(r.after.stats[k])||!Number.isSafeInteger(r.after.raw[k])||!Number.isSafeInteger(r.after.bonus[k])))throw Error('invalid stat vector');
 const route={id,row,originProfile:r.profileId,finalBody:r.body,targetState:r.targetState,activeResearch:node.completed.filter(k=>!node.disabled.includes(k)),canonicalBranchIds:null,trainingIds:r.trainingIds,growthSlots:r.growthSlots,raw:r.after.raw,bonus:r.after.bonus,effective:r.after.stats,evidenceTier:'conditional-model',unresolvedConditions:r.limitations,finalStateHash:r.finalStateHash};
 routes.push(route);
 const key=JSON.stringify([r.profileId,r.body]);
 if(!groups.has(key))groups.set(key,{originProfile:r.profileId,finalBody:r.body,independentMaxima:{},bestTotal:null,routeIds:[]});
 const group=groups.get(key);group.routeIds.push(id);
 for(const k of statKeys)if(!group.independentMaxima[k]||r.after.stats[k]>group.independentMaxima[k].value)group.independentMaxima[k]={value:r.after.stats[k],routeId:id};
 const total=statKeys.reduce((s,k)=>s+r.after.stats[k],0);
 if(!group.bestTotal||total>group.bestTotal.value)group.bestTotal={value:total,routeId:id,effective:r.after.stats};
}
const compressed=gzipSync(bytes,{level:9});
const index={schema:'ATLAS_FORWARD_CAREER_GROWTH_WITNESS_INDEX_V1',sourceMetadataSha256:ledger.sourceMetadataSha256,graphSha256:ledger.graphSha256,ledgerSha256:hash(bytes),compressedSha256:hash(compressed),summary:ledger.summary,groups:[...groups.values()],routes,limitations:['canonical branch mapping unresolved; not imported into shared registry','maxima are independent; only bestTotal is a single witness','conditional model, not native certification']};
fs.writeFileSync(output,compressed,{flag:'wx'});
fs.writeFileSync(indexPath,JSON.stringify(index),{flag:'wx'});
console.log(JSON.stringify({routes:routes.length,groups:groups.size,compressedBytes:compressed.length,compressedSha256:index.compressedSha256,indexSha256:hash(fs.readFileSync(indexPath))}));
