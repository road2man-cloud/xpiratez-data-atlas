// Conservative irreversible-research exclusion within the indexed v.o2 replay
// model. Failure to prove is OPEN, never an impossibility claim.
// Unlike the selected branch heuristic, this requires a concrete disabled
// state, no indexed reenable, and exhausts every indexed grant method.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const arr=x=>Array.isArray(x)?x:[];
const fields=new Set(['requires','dependencies','disables','reenables','unlocks','lookup','getOneFree','getOneFreeProtected','sequentialGetOneFree','repeatable','needItem','destroyItem','returnsItem','neededItem','requiresBaseFunc','cost']);
export const POLICY='IRREVERSIBLE_INDEXED_RESEARCH_METHOD_CLOSURE_V1';
export function createIrreversibleResearchExclusion(data,catalog){
 const rules=data.researchRules;
 assert(catalog.sourceVersion==='v.o2'&&data.meta.mod.version==='v.o2');
 assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
 assert(Array.isArray(catalog.itemIds)&&data.eventResearchSources&&data.missionResearchSources);
 const unknownFields=[...new Set(Object.values(rules).flatMap(Object.keys).filter(k=>!fields.has(k)))].sort();
 const knownItems=new Set([...catalog.itemIds,...Object.keys(data.itemSupply||{}),...(data.armorCatalog||[]).map(x=>x.storeItem),...(data.transformations||[]).map(x=>x.producedItem)].filter(Boolean));
 // Treat every unknown rule shape or missing script listing as an open path.
 const methods=new Map(),reenablers=new Map();
 const add=(id,kind,deps,extra={})=>{const a=methods.get(id)||[];a.push({kind,deps:[...new Set(deps)].sort(),...extra});methods.set(id,a);};
 for(const [id,r] of Object.entries(rules)){
  // Deliberately overapproximate normal/automatic unlocks: do not require
  // cost, facility, protected guard or research-list visibility to be proven.
  // Only an undefined item in the same-version source catalog can block the
  // sample-based path, and only if no current stock or indexed producer exists.
  const sample=r.needItem===true?(r.neededItem||id):null;
  add(id,'LAB_OR_AUTOMATIC',arr(r.dependencies),{sample});
  for(const t of arr(r.unlocks))add(t,'UNLOCK_BYPASS',[id],{sample:rules[t]?.needItem===true?(rules[t].neededItem||t):null});
  for(const t of arr(r.getOneFree))add(t,'FREE',[id]);
  for(const [guard,ts] of Object.entries(r.getOneFreeProtected||{}))for(const t of arr(ts))add(t,'PROTECTED_FREE',[id,guard]);
  if(r.lookup&&r.lookup!==id)add(r.lookup,'LOOKUP',[id]);
  for(const t of arr(r.reenables)){const a=reenablers.get(t)||[];a.push(id);reenablers.set(t,a);}
 }
 for(const [id,sources] of Object.entries(data.eventResearchSources)){
  for(const e of arr(sources)){
   if(!arr(e.scripts).length)add(id,'UNINDEXED_EVENT',[],{event:e.event});
   for(const s of arr(e.scripts))add(id,'EVENT',arr(s.researchPositive),{event:e.event,script:s.script});
  }
 }
 for(const [id,sources] of Object.entries(data.missionResearchSources)){
  for(const e of arr(sources)){
   if(!arr(e.scripts).length)add(id,'UNINDEXED_MISSION',[],{deployment:e.deployment});
   for(const s of arr(e.scripts))add(id,'MISSION',arr(s.researchPositive),{deployment:e.deployment,script:s.script});
  }
 }
 const fingerprint=hash({rules,eventResearchSources:data.eventResearchSources,missionResearchSources:data.missionResearchSources,catalogHash:hash(catalog),knownItems:sort(knownItems)});
 function prove(world,id,{maxNodes=400,maxDepth=35}={}){
  if(unknownFields.length||world.pendingFree||!(world.researched instanceof Set)||!(world.disabled instanceof Set))return null;
  const active=k=>world.researched.has(k)&&!world.disabled.has(k);
  const memo=new Map(),visiting=new Set(),nodes=new Map();let visits=0;
  function walk(k,depth){
   if(active(k)||!rules[k]||depth>maxDepth||++visits>maxNodes||visiting.has(k))return null;
   if(memo.has(k))return memo.get(k);
   if(world.disabled.has(k)&&!world.researched.has(k)&&!(reenablers.get(k)||[]).length){
    const n={id:k,kind:'DISABLED_WITH_NO_INDEXED_REENABLE',ruleHash:hash(rules[k]),reenablers:[]};nodes.set(k,n);memo.set(k,k);return k;
   }
   // A currently disabled topic with even a hypothetical reenabler remains
   // open unless its ordinary methods can independently be disproved.
   if(world.disabled.has(k))return null;
   const ms=methods.get(k)||[];if(!ms.length)return null;
   visiting.add(k);const blocked=[];
   for(const m of ms){
    let why=null;
    if(m.sample&&!knownItems.has(m.sample)&&!Number(world.items?.[m.sample]||0)){
     why={kind:'NO_DEFINED_SAMPLE_IN_INDEXED_MODEL',sample:m.sample,catalogSourceHash:hash(catalog.sourceHashes),currentStock:0};
    }else{
     // For auto/lookup/free, completed history (not only active flags) can
     // satisfy some engine gates. The walk is conservative: never exclude a
     // topic still present in the completed set, even when it is disabled.
     for(const dep of m.deps){if(world.researched.has(dep))continue;const p=walk(dep,depth+1);if(p){why={kind:'BLOCKED_DEPENDENCY',proof:p};break;}}
    }
    if(!why){visiting.delete(k);return null;}
    blocked.push({...m,blockedBy:why});
   }
   visiting.delete(k);const n={id:k,kind:'ALL_INDEXED_METHODS_EXCLUDED',ruleHash:hash(rules[k]),methods:blocked};nodes.set(k,n);memo.set(k,k);return k;
  }
  if(!walk(id,0))return null;
  const used=new Set();function gather(k){if(used.has(k))return;used.add(k);for(const m of nodes.get(k)?.methods||[])if(m.blockedBy.kind==='BLOCKED_DEPENDENCY')gather(m.blockedBy.proof);}
  gather(id);
  return {policy:POLICY,goal:id,sourceFingerprint:fingerprint,scope:'Indexed v.o2 replay only; no game-wide impossibility claim.',worldResearchHash:hash([sort(world.researched),sort(world.disabled)]),nodes:Object.fromEntries(sort(used).map(k=>[k,nodes.get(k)])),unknownFields:[],completeIndexedMethods:true,actualGameCertified:false};
 }
 return {prove,fingerprint,unknownFields};
}
function sort(x){return [...x].sort();}
