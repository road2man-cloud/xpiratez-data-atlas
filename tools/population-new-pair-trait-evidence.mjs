// Exact retained bonus types and action-set evidence from replayed worlds.
// Action depth, current traits and actual-game finality are separate.
import {member} from "./population-growth-replay-core.mjs";
const sorted=xs=>[...new Set(xs)].sort();
export function traitEvidence(w,actions,rules){
 const s=member(w).state,retained=sorted(s.bonusIds||s.bonusCounts.keys()),counts=Object.fromEntries(retained.map(id=>[id,s.bonusCounts.get(id)||1]));
 const transforms=sorted(actions.filter(a=>a.type==="transform").map(a=>a.transform));
 const requiredResearch=sorted(transforms.flatMap(id=>rules.get(id)?.requires||[]));
 const activeAtEnd=requiredResearch.filter(id=>w.researched.has(id)&&!w.disabled.has(id));
 return {retained,counts,transforms,requiredResearch,activeAtEnd,notActiveAtEnd:requiredResearch.filter(id=>!activeAtEnd.includes(id)),model:"REPLAYED_CONDITIONAL_TRAIT_SET_V1"};
}
export const traitKey=(r,e)=>JSON.stringify([r.origin,r.branch,r.body,e.counts,e.transforms]);
export function traitSummary(routes){
 const measured=Object.values(routes).filter(r=>r.traitEvidence);
 return {traitMeasuredRoutes:measured.length,traitOnlyRoutes:measured.filter(r=>r.publication==="RETAINED_TRAIT_SET").length,maxRetainedTraits:Math.max(0,...measured.map(r=>r.traitEvidence.retained.length)),maxDistinctTransforms:Math.max(0,...measured.map(r=>r.traitEvidence.transforms.length)),traitPairs:new Set(measured.map(r=>r.origin+"|"+r.branch)).size,traitOrigins:new Set(measured.map(r=>r.origin)).size,traitSetCount:new Set(measured.map(r=>traitKey(r,r.traitEvidence))).size};
}
