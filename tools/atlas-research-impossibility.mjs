// Conservative reachability: only prove a topic impossible if every indexed
// way around a hard blocker is excluded. Unknown grants, materials, facilities,
// events and positive cycles are deliberately left possible.
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
const fields=new Set(["requires","dependencies","disables","reenables","unlocks","lookup","getOneFree","getOneFreeProtected","sequentialGetOneFree","repeatable","needItem","destroyItem","returnsItem","neededItem","requiresBaseFunc","cost"]);
const arr=x=>Array.isArray(x)?x:[];
const sorted=x=>[...x].sort();
const add=(m,k,v)=>{if(k){const a=m.get(k)||new Set();a.add(v);m.set(k,a);}};
export const REACHABILITY_POLICY="INDEXED_IRREVERSIBLE_RESEARCH_V1";
export function createResearchImpossibilityIndex(data,{cacheLimit=1024}={}){
 const rules=data.researchRules||{},entries=Object.entries(rules);
 const known=entries.length>0&&entries.every(([,r])=>Object.keys(r).every(k=>fields.has(k))&&["requires","dependencies","disables","reenables","unlocks","getOneFree"].every(k=>Array.isArray(r[k]))&&r.getOneFreeProtected&&typeof r.getOneFreeProtected==="object");
 const reenable=new Map(),unlock=new Map(),grants=new Set();
 const eventSources=data.eventResearchSources??data.researchEventSources,missionSources=data.missionResearchSources;
 // Do not infer lack of a grant if the source indexes themselves are missing.
 const dependencyProofs=known&&eventSources!=null&&missionSources!=null;
 for(const [id,r] of entries){
  for(const k of arr(r.reenables))add(reenable,k,id);
  for(const k of arr(r.unlocks))add(unlock,k,id);
  for(const k of [...arr(r.getOneFree),...Object.values(r.getOneFreeProtected||{}).flatMap(arr),r.lookup])if(k)grants.add(k);
 }
 for(const source of [eventSources,missionSources])for(const k of Object.keys(source||{}))grants.add(k);
 const cache=new Map(),metrics={requests:0,hits:0,computed:0,disabledProofs:0,dependencyProofs:0};
 function analyze(researched,disabled){
  metrics.requests++;
  if(!known||!(researched instanceof Set)||!(disabled instanceof Set))return new Map();
  const id=JSON.stringify([sorted(researched),sorted(disabled)]);
  if(cache.has(id)){metrics.hits++;return cache.get(id);}
  const impossible=new Map(),undiscovered=new Set();
  const block=(k,reason)=>{impossible.set(k,reason);if(!researched.has(k))undiscovered.add(k);};
  // A currently disabled topic cannot be newly queued, directly researched,
  // or granted by an event/mission/free reward. Only explicit reenables
  // can make it active again. A disabled-but-previously-discovered topic
  // can still satisfy a discovery-based prerequisite; track that separately.
  let changed=true;
  while(changed){
   changed=false;
   for(const k of disabled){
    if(impossible.has(k)||!rules[k])continue;
    const sources=sorted(reenable.get(k)||[]);
    if(sources.every(s=>impossible.has(s))){
     block(k,{kind:"DISABLED_REENABLE_SOURCES_BLOCKED",premises:sources});changed=true;metrics.disabledProofs++;
    }
   }
   if(!dependencyProofs)continue;
   for(const [k,r] of entries){
    if(researched.has(k)||impossible.has(k)||grants.has(k))continue;
    const req=arr(r.requires).find(x=>undiscovered.has(x));
    // Direct grants (including lookup) may bypass BOTH kinds of gates.
    // Auto-zero still checks requires, even with an unlock source.
    if(req){block(k,{kind:"REQUIRED_TOPIC_NEVER_DISCOVERED",premises:[req]});changed=true;metrics.dependencyProofs++;continue;}
    const dep=arr(r.dependencies).find(x=>undiscovered.has(x)),sources=sorted(unlock.get(k)||[]);
    if(dep&&sources.every(s=>undiscovered.has(s))){
     block(k,{kind:"DEPENDENCY_NEVER_DISCOVERED_NO_UNLOCK",premises:[...new Set([dep,...sources])]});changed=true;metrics.dependencyProofs++;
    }
   }
  }
  metrics.computed++;
  if(cache.size>=cacheLimit)cache.delete(cache.keys().next().value);
  cache.set(id,impossible);return impossible;
 }
 function receipt(impossible,topic){
  const nodes={},pending=[topic];
  while(pending.length){
   const id=pending.pop();if(nodes[id])continue;
   const r=impossible.get(id);if(!r)throw Error("MISSING_RESEARCH_BLOCKER_PREMISE:"+id);
   nodes[id]=r;pending.push(...r.premises);
  }
  return {policy:REACHABILITY_POLICY,topic,nodes};
 }
 return {analyze,receipt,metrics};
}
export function createReachabilityAwareSuccessorIndex(data,options){
 const base=createFirstSuccessorIndex(data),research=createResearchImpossibilityIndex(data,options);
 function assess(inputs){
  const q=base.assess(inputs);
  if(!q.open.some(x=>x.missingResearch.length))return q;
  const impossible=research.analyze(inputs.researched,inputs.disabled);
  const open=[],blocked=q.blocked.slice();
  for(const r of q.open){
   const blocker=r.missingResearch.find(k=>impossible.has(k));
   if(blocker)blocked.push({id:r.id,reason:"FIRST_ACTION_RESEARCH_UNREACHABLE",evidence:research.receipt(impossible,blocker)});
   else open.push(r);
  }
  return {...q,policy:REACHABILITY_POLICY,blocked,open,missingResearch:sorted(new Set(open.flatMap(x=>x.missingResearch))),closed:inputs.historyKnown===true&&inputs.history instanceof Set&&!q.openGrowth&&!open.length&&!q.unknownRules.length};
 }
 return {...base,assess,research};
}
