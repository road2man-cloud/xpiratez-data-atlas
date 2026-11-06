// Display-only shortlist of fully replayed reductions; NEVER mutate registry.
import {sameRouteStatVector} from './origin-route-tiebreak.js?v=20261106-vector-audit-4';
const researchTypes=new Set(['research','repeatResearch','eventResearch','missionResearch','freeResearch']);
export function verifiedShortRoutes(record,selected,target,dependencies,iterative){
  if(!selected||selected.growth?.kind!=='conditional-upper-envelope')return [];
  const map=new Map(record.candidates.map(x=>[x.id,x]));
  const alternatives=[];
  const append=(proof,stage,profileId)=>{
    if(profileId!==record.profileId||proof.target!==target)return;
    const source=map.get(proof.sourceCandidate);
    if(!source||!sameRouteStatVector(source,selected))return;
    const indices=new Set(proof.removedIndices);
    const removed=source.steps.filter((_,i)=>indices.has(i));
    const remaining=source.steps.filter((_,i)=>!indices.has(i));
    const remainingTransforms=remaining.filter(s=>s.type==='transform').map(s=>s.transform);
    const removedTransforms=removed.filter(s=>s.type==='transform').map(s=>s.transform);
    if(removedTransforms.length!==stage||remainingTransforms.length+stage!==source.transforms.length)return;
    alternatives.push({
      sourceCandidate:source.id,stage,hash:proof.reducedStepsHash,
      originalTransforms:source.transforms.length,remainingTransforms,removedTransforms,
      removedResearchSteps:removed.filter(s=>researchTypes.has(s.type)).length,
      removedExternalInputs:removed.filter(s=>s.type==='externalInputs').length,
      remainingResearchSteps:remaining.filter(s=>researchTypes.has(s.type)).length
    });
  };
  for(const x of dependencies?.findings||[])append(x,1,x.id);
  for(const x of iterative?.findings||[])append(x,2,x.profileId);
  const unique=new Map();
  for(const x of alternatives){
    const before=unique.get(x.hash);
    if(!before||x.stage>before.stage)unique.set(x.hash,x);
  }
  return [...unique.values()].sort((a,b)=>
    a.remainingTransforms.length-b.remainingTransforms.length||
    a.remainingResearchSteps-b.remainingResearchSteps||
    a.sourceCandidate.localeCompare(b.sourceCandidate));
}
