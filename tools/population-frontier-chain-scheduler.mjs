// Batch proposals sharing an immutable chronological parent, with
// interleaved career depths. No candidate is rejected by numeric dominance.
import {key,sum} from "./population-research-career-core.mjs";
export function chainStateKey(parent){
 return key([parent.input,parent.canonicalStateHash,parent.order.length,[...parent.allowedDifficulties].sort()]);
}
export function scheduleChain(seeds,attempts,batchSize=8){
 const visited=new Map();
 for(const t of Object.values(attempts))visited.set(t.parent,(visited.get(t.parent)||0)+1);
 const byDepth=new Map();
 for(const xs of seeds){
  const parent=xs[0].parent,known=new Set(parent.addedResearch);
  const likelyActive=q=>q.f.rule.requires.every(k=>known.has(k));
  xs.sort((a,b)=>Number(likelyActive(b))-Number(likelyActive(a))||a.f.rule.requires.length-b.f.rule.requires.length||a.f.rule.id.localeCompare(b.f.rule.id));
  const d=parent.order.length,list=byDepth.get(d)||[];list.push(xs);byDepth.set(d,list);
 }
 for(const xs of byDepth.values())xs.sort((a,b)=>(visited.get(a[0].id)||0)-(visited.get(b[0].id)||0)||sum(b[0].parent.permanentVector)-sum(a[0].parent.permanentVector)||a[0].id.localeCompare(b[0].id));
 // First chunk of every seed before second chunk; alternate depths
 // so new three- and four-stage careers are not starved by depth one.
 const depths=[...byDepth.keys()].sort((a,b)=>b-a),out=[];
 for(let off=0;;off+=batchSize){
  let any=false;
  const maxSeeds=Math.max(0,...depths.map(d=>byDepth.get(d).length));
  for(let i=0;i<maxSeeds;i++)for(const d of depths){
   const xs=byDepth.get(d)[i];if(!xs||off>=xs.length)continue;
   out.push(...xs.slice(off,off+batchSize));any=true;
  }
  if(!any)break;
 }
 return out;
}
