// Exhaustive first-transformation inventory in the indexed soldier model.
// A research-only action cannot change transformation history or retained
// traits. No numerical heuristic, failed search, depth or retry limit proves
// an exclusion. Dead, wounded, clone, reset and unsupported actions remain open.
export const FIRST_SUCCESSOR_POLICY='INDEXED_FIRST_TRANSFORM_OBLIGATIONS_V1';
const sorted=a=>[...a].sort();
export function createFirstSuccessorIndex(data){
 const byBody=new Map(),unknown=[];
 for(const r of data.transformations||[]){
  if(!Array.isArray(r.allowedSoldierTypes)||!r.allowedSoldierTypes.length){unknown.push(r.id);continue;}
  for(const body of r.allowedSoldierTypes){const a=byBody.get(body)||[];a.push(r);byBody.set(body,a);}
 }
 function assess({body,history,historyKnown,active,raw,capRaw,finite={},consumed={}}){
  const rules=byBody.get(body)||[],blocked=[],open=[];
  const exactHistory=historyKnown===true&&history instanceof Set;
  for(const r of rules){
   let reason=null,evidence=null;
   if(r.requires?.includes('STR_UNAVAILABLE')){reason='UNAVAILABLE_SENTINEL';evidence='STR_UNAVAILABLE';}
   else if(r.forbiddenSoldierTypes?.includes(body)){reason='FORBIDDEN_BODY';evidence=body;}
   else if(exactHistory&&(r.forbiddenPreviousTransformations||[]).some(k=>history.has(k))){reason='FIRST_ACTION_FORBIDDEN_HISTORY';evidence=sorted(r.forbiddenPreviousTransformations.filter(k=>history.has(k)));}
   else if(exactHistory&&(r.requiredPreviousTransformations||[]).some(k=>!history.has(k))){reason='FIRST_ACTION_MISSING_HISTORY';evidence=sorted(r.requiredPreviousTransformations.filter(k=>!history.has(k)));}
   else {
    for(const [k,n] of Object.entries(r.requiredItems||{})){
     const f=finite[k],used=consumed[k]||0;
     if(f?.hard===true&&Number.isSafeInteger(f.cap)&&Number.isSafeInteger(used)&&n>f.cap-used){reason='CONFIRMED_FINITE_EXHAUSTED';evidence={id:k,cap:f.cap,used,required:n};break;}
    }
   }
   if(reason)blocked.push({id:r.id,reason,evidence});
   else open.push({id:r.id,missingResearch:sorted((r.requires||[]).filter(k=>!active.has(k))),live:r.allowsLiveSoldiers===true,dead:r.allowsDeadSoldiers===true,clone:r.createsClone===true,reset:r.reset===true,destination:r.producedSoldierType||body});
  }
  const openGrowth=!Array.isArray(raw)||!Array.isArray(capRaw)||raw.length!==12||capRaw.length!==12||raw.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(capRaw[i])||v!==capRaw[i]);
  return {policy:FIRST_SUCCESSOR_POLICY,body,ruleCount:rules.length,blocked,open,unknownRules:unknown.slice(),openGrowth,missingResearch:sorted(new Set(open.flatMap(x=>x.missingResearch))),closed:exactHistory&&!openGrowth&&!open.length&&!unknown.length};
 }
 return {assess,byBody,unknown};
}
