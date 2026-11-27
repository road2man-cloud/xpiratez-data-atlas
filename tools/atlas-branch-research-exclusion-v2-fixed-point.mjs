// Least fixed point over the same conservative indexed acquisition methods
// as V1. A topic is blocked only when EVERY method has a previously proven
// blocked prerequisite. Unknown methods, empty prerequisites and unseeded
// cycles stay open. This removes traversal-order-dependent DFS exhaustion.
import {key} from "./population-research-career-core.mjs";
const fields=new Set(["requires","dependencies","disables","reenables","unlocks","lookup","getOneFree","getOneFreeProtected","sequentialGetOneFree","repeatable","needItem","destroyItem","returnsItem","neededItem","requiresBaseFunc","cost"]);
export const EXCLUSION_POLICY="ALL_INDEXED_METHODS_BLOCKED_FIXED_POINT_V2";
export function createBranchResearchExclusion(data){
 const rules=data.researchRules,methods=new Map(),reverse=new Map(),unknown=Object.values(rules).some(r=>Object.keys(r).some(k=>!fields.has(k)));
 const add=(id,kind,deps,source=null)=>{
  const a=methods.get(id)||[],method={kind,deps:[...new Set(deps)].sort(),source};
  const index=a.length;a.push(method);methods.set(id,a);
  for(const dep of method.deps){const xs=reverse.get(dep)||[];xs.push([id,index]);reverse.set(dep,xs);}
 };
 for(const [id,r] of Object.entries(rules)){
  add(id,"DEPENDENCIES",r.dependencies||[]);
  for(const t of r.unlocks||[])add(t,"UNLOCK",[id],id);
  for(const t of r.getOneFree||[])add(t,"FREE",[id],id);
  for(const [guard,targets] of Object.entries(r.getOneFreeProtected||{}))for(const t of targets)add(t,"PROTECTED_FREE",[id,guard],id);
  if(r.lookup)add(r.lookup,"LOOKUP",[id],id);
  for(const t of r.reenables||[])add(t,"REENABLE",[id],id);
 }
 for(const [id,a] of Object.entries(data.eventResearchSources||{}))if(a?.length)add(id,"EVENT",[]);
 for(const [id,a] of Object.entries(data.missionResearchSources||{}))if(a?.length)add(id,"MISSION",[]);
 const cache=new Map();
 const metrics={computations:0,hits:0,derived:0,proofs:0,activeVeto:0,oversize:0};
 function closure(forbidden){
  const seed=[...forbidden].sort(),id=key(seed);
  if(cache.has(id)){metrics.hits++;return cache.get(id);}
  metrics.computations++;
  const queue=seed.slice(),proven=new Map(seed.map(k=>[k,{direct:true,rank:0}])),pending=new Map();
  for(let i=0;i<queue.length;i++){
   const dep=queue[i],rank=proven.get(dep).rank;
   for(const [topic,j] of reverse.get(dep)||[]){
    if(proven.has(topic)||!Object.hasOwn(rules,topic))continue;
    const ms=methods.get(topic);
    let row=pending.get(topic);
    if(!row){row={why:new Map(),rank:0};pending.set(topic,row);}
    if(row.why.has(j))continue;
    row.why.set(j,dep);row.rank=Math.max(row.rank,rank+1);
    if(row.why.size===ms.length){
     proven.set(topic,{direct:false,rank:row.rank,why:row.why});
     queue.push(topic);pending.delete(topic);metrics.derived++;
    }
   }
  }
  cache.set(id,proven);return proven;
 }
 function prove(id,forbidden,active){
  if(unknown||!(forbidden instanceof Set)||!(active instanceof Set)||!Object.hasOwn(data,"eventResearchSources")||!Object.hasOwn(data,"missionResearchSources"))return null;
  const proven=closure(forbidden);
  if(!proven.has(id))return null;
  let nodes=0,reason=null;
  function expand(k,parentRank=Infinity){
   if(active.has(k)){reason="active";return null;}
   if(++nodes>256){reason="size";return null;}
   const p=proven.get(k);
   if(!p||p.rank>=parentRank)return null;
   if(p.direct)return {id:k,kind:"DIRECT_BRANCH_EXCLUSION"};
   const ms=methods.get(k),blocked=[];
   for(const [j,m] of ms.entries()){
    const q=expand(p.why.get(j),p.rank);if(!q)return null;
    blocked.push({...m,blockedBy:q});
   }
   return {id:k,kind:"ALL_INDEXED_METHODS_BLOCKED",ruleHash:key(rules[k]),methods:blocked};
  }
  const proof=expand(id);if(reason==="active")metrics.activeVeto++;if(reason==="size")metrics.oversize++;if(proof)metrics.proofs++;
  return proof;
 }
 return {prove,metrics};
}
