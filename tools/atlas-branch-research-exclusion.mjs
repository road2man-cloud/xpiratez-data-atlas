// Conservative transitive exclusions in the selected-branch model only.
 // Treat every indexed alternate award as a possible route, regardless of
 // costs, time, availability or whether the planner can actually execute it.
 // A missing rule, unknown schema, cycle, event or mission is NOT a blocker.
import {key} from "./population-research-career-core.mjs";
const fields=new Set(["requires","dependencies","disables","reenables","unlocks","lookup","getOneFree","getOneFreeProtected","sequentialGetOneFree","repeatable","needItem","destroyItem","returnsItem","neededItem","requiresBaseFunc","cost"]);
export function createBranchResearchExclusion(data){
 const rules=data.researchRules,methods=new Map(),unknown=Object.values(rules).some(r=>Object.keys(r).some(k=>!fields.has(k)));
 const add=(id,kind,deps,source=null)=>{
  const a=methods.get(id)||[];a.push({kind,deps:[...new Set(deps)].sort(),source});methods.set(id,a);
 };
 for(const [id,r] of Object.entries(rules)){
  // Over-approximate the lab and automatic queue: ignore costs, samples,
  // protected conditions and source availability. Dependencies may be
  // bypassed by an unlock, which is indexed as a separate method.
  add(id,"DEPENDENCIES",r.dependencies||[]);
  for(const t of r.unlocks||[])add(t,"UNLOCK",[id],id);
  for(const t of r.getOneFree||[])add(t,"FREE",[id],id);
  for(const [guard,targets] of Object.entries(r.getOneFreeProtected||{}))
   for(const t of targets)add(t,"PROTECTED_FREE",[id,guard],id);
  if(r.lookup)add(r.lookup,"LOOKUP",[id],id);
  // Re-enable cannot by itself grant research, but include it anyway as
  // an escape for previously completed/disabled topics.
  for(const t of r.reenables||[])add(t,"REENABLE",[id],id);
 }
 for(const [id,a] of Object.entries(data.eventResearchSources||{}))if(a?.length)add(id,"EVENT",[]);
 for(const [id,a] of Object.entries(data.missionResearchSources||{}))if(a?.length)add(id,"MISSION",[]);
 // Cache structural proofs, then veto ANY active topic in the proof.
 // This is deliberately more conservative than searching another proof.
 const cache=new Map();
 function prove(id,forbidden,active){
  if(unknown||!(active instanceof Set)||!Object.hasOwn(data,"eventResearchSources")||!Object.hasOwn(data,"missionResearchSources"))return null;
  const cacheKey=key([[...forbidden].sort(),id]);
  if(cache.has(cacheKey)){const x=cache.get(cacheKey);return x&&x.topics.every(k=>!active.has(k))?x.proof:null;}
  const memo=new Map(),visiting=new Set();let work=0;
  function walk(k){
   if(++work>512||visiting.size>24)return null;
   if(forbidden.has(k))return {id:k,kind:"DIRECT_BRANCH_EXCLUSION"};
   if(memo.has(k))return memo.get(k);
   const a=methods.get(k);if(!rules[k]||!a?.length||visiting.has(k))return null;
   visiting.add(k);
   const blocked=[];
   for(const m of a){
    let why=null;for(const dep of m.deps){why=walk(dep);if(why)break;}
    if(!why){visiting.delete(k);return null;}
    blocked.push({...m,blockedBy:why});
   }
   visiting.delete(k);
   const proof={id:k,kind:"ALL_INDEXED_METHODS_BLOCKED",ruleHash:key(rules[k]),methods:blocked};
   memo.set(k,proof);return proof;
  }
  const proof=walk(id),topics=new Set();let nodes=0;
  function collect(p){if(++nodes>256)return false;topics.add(p.id);return (p.methods||[]).every(m=>collect(m.blockedBy));}
  const entry=proof&&collect(proof)?{proof,topics:[...topics]}:null;
  cache.set(cacheKey,entry);
  return entry&&entry.topics.every(k=>!active.has(k))?proof:null;
 }
 return {prove};
}
