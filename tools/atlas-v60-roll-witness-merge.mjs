// Merge endpoint witness indexes by actual action/state identity.
// Identical deterministic routes retain all source references.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [minPath,maxPath,out]=process.argv.slice(2);
if(!minPath||!maxPath||!out)throw Error('usage: min-index max-index output');
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const inputs=[['min',minPath,'career-growth-v60-revolution-min.json.gz'],['max',maxPath,'career-growth-v60-revolution-max.json.gz']];
const sources=[],map=new Map(),groups=new Map();
let fingerprint,graphSha256;
for(const [band,p,ledger] of inputs){
 const x=read(p);
 if(x.schema!=='ATLAS_FORWARD_CAREER_GROWTH_WITNESS_INDEX_V1')throw Error('bad input schema');
 fingerprint??=x.sourceMetadataSha256;graphSha256??=x.graphSha256;
 if(fingerprint!==x.sourceMetadataSha256||graphSha256!==x.graphSha256)throw Error('source mismatch');
 sources.push({band,index:path.basename(p),indexSha256:hash(fs.readFileSync(p)),ledger,ledgerSha256:x.ledgerSha256,compressedSha256:x.compressedSha256});
 for(const r of x.routes){
  const {row,...route}=r;
  const ref={band,row,ledger};
  if(map.has(r.id)){
   const existing=map.get(r.id);
   const {refs,...prior}=existing;
   if(JSON.stringify(prior)!==JSON.stringify(route))throw Error('route collision:'+r.id);
   refs.push(ref);
  }else map.set(r.id,{...route,refs:[ref]});
 }
}
for(const r of map.values()){
 const key=JSON.stringify([r.originProfile,r.finalBody]);
 if(!groups.has(key))groups.set(key,{originProfile:r.originProfile,finalBody:r.finalBody,independentMaxima:{},bestTotal:null,routeCount:0});
 const g=groups.get(key);g.routeCount++;
 const total=Object.values(r.effective).reduce((a,b)=>a+b,0);
 for(const [k,v] of Object.entries(r.effective))if(!g.independentMaxima[k]||v>g.independentMaxima[k].value)g.independentMaxima[k]={value:v,routeId:r.id};
 if(!g.bestTotal||total>g.bestTotal.value)g.bestTotal={value:total,routeId:r.id,effective:r.effective};
}
const routes=[...map.values()];
const result={schema:'ATLAS_FORWARD_CAREER_ROLL_MERGE_V1',sourceMetadataSha256:fingerprint,graphSha256,sources,summary:{uniqueRoutes:routes.length,uniqueEffectiveVectors:new Set(routes.map(r=>JSON.stringify([r.originProfile,r.finalBody,r.effective]))).size,sharedRoutes:routes.filter(r=>r.refs.length===2).length},groups:[...groups.values()],routes,limitations:['conditional joint RNG endpoints, not native proof','canonical branch mapping unresolved; no shared registry import','independent maxima are not a single witness']};
fs.writeFileSync(out,JSON.stringify(result),{flag:'wx'});
console.log(JSON.stringify({summary:result.summary,groups:result.groups.map(g=>({body:g.finalBody,count:g.routeCount,best:g.bestTotal.value})),bytes:fs.statSync(out).size,sha256:hash(fs.readFileSync(out))}));
