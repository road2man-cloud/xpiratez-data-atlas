// Fixed-end-body development scope. The full chronological research witness
// is retained. Different final bodies are alternative goals, not missing work.
// An excluded model action is NOT a proof of game-wide impossibility.
import assert from "node:assert/strict";
import {passiveArmorReturns,passiveReturnDelta} from "./atlas-passive-armor-return.mjs";
import {createBranchResearchExclusion} from "./atlas-branch-research-exclusion.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createRepeatQuotient} from "./final-career-repeat-quotient.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
export const SCOPE="SELECTED_VICTORY_RESEARCH_FIXED_FINAL_BODY_CAP_RESTORED_V1";
export function createBodyCareerScope(data,branches,replay){
 const first=createFirstSuccessorIndex(data),rules=new Map(data.transformations.map(r=>[r.id,r]));
 const quotient=createRepeatQuotient(data),materials=createResearchMaterialPolicy(data),safeHistory=new Set(quotient.proof.safeHistory);
 const choices=b=>[...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean);
 const allChoices=new Set(branches.flatMap(choices)),branchExclusion=createBranchResearchExclusion(data);
 const stats={scope:SCOPE,repeatTrials:0,repeatFixed:0,repeatCapRestored:0,repeatUnresolved:0,repeatReasons:{},transitiveExclusions:0,cycleAttempts:0,cycleAccepted:0,passiveFiniteReturnEdges:0,cycleStates:0,cycleEdges:0,cycleRejected:{}};
 function reason(k){stats.repeatReasons[k]=(stats.repeatReasons[k]||0)+1;return null;}
 function eligible(x,inputs,allowFirst=false){
  const r=rules.get(x.id),body=replay.bodies.get(inputs.body);
  return !!r&&!!body&&inputs.historyKnown&&(inputs.history?.has(x.id)||(allowFirst&&!r.soldierBonusType))&&safeHistory.has(x.id)&&!r.reset&&!r.resetRank&&!r.removeTransformations?.length&&!r.createsClone&&!r.producedItem&&x.destination===inputs.body&&x.missingResearch.length===0&&Number.isSafeInteger(r.cost||0)&&(r.cost||0)>=0&&deterministicRule(r,[body])&&(r.allowsLiveSoldiers||replay.lifecycleRules?.has(r.id))&&Object.keys(r.requiredItems||{}).every(k=>!materials.finite.has(k)&&materials.catalog[k]?.kind==="ORDINARY_ACQUISITION_ASSUMED");
 }
 function fixedRepeat(x,inputs,w){
  if(!eligible(x,inputs))return null;
  const r=rules.get(x.id);stats.repeatTrials++;
  try{
   assert(member(w).state.status==="healthy");
   const v=replay.transform({world:w,steps:[]},r);if(!v)return reason("NO_EXACT_REPLAY");
   assert.equal(exactWorld(replay.replay(v.steps,w)),exactWorld(v.world));
   assert(v.steps.filter(a=>a.type==="transform").length===1);
   const support=v.steps.filter(a=>a.type==="externalInputs");
   assert(support.every(a=>Object.keys(a.items||{}).every(k=>Object.hasOwn(r.requiredItems||{},k))&&!(a.functions||[]).length));
   const itemKeys=Object.keys(r.requiredItems||{});
   function normalize(a){
    const z=structuredClone(a);z.funds=0;
    for(const k of itemKeys)delete z.items[k];
    return quotient.project(z);
   }
   // Only declared repeat costs may differ. Research, identity, armor,
   // initial stats, promotion, medals, base functions and all other items
   // must match in the full conditional world quotient.
   assert(v.world.funds<=w.funds);
   assert(itemKeys.every(k=>(v.world.items[k]||0)<=(w.items[k]||0)));
   const before=normalize(w),immediate=normalize(v.world);
   let target=v.world,steps=v.steps,kind="FIXED_REPEAT";
   if(immediate!==before){
    // The scoped objective explicitly restores cap growth after each
    // transformation. Do not claim that an intermediate reduced-stat
    // state is globally interchangeable or that alternate bodies cannot
    // return with more traits.
    if((first.byBody.get(inputs.body)||[]).some(q=>q.requiredMaxStats))return reason("MAX_STAT_GATE_PRESENT");
    const q=replay.grow({world:v.world,steps:v.steps});
    target=q.world;steps=q.steps;kind="CAP_RESTORED_REPEAT";
   }
   if(normalize(target)!==before)return reason("STATE_CHANGED");
   assert.equal(exactWorld(replay.replay(steps,w)),exactWorld(target));
   const a=replay.finish(w),b=replay.finish(target);
   assert.deepEqual(a.raw,b.raw);assert.deepEqual(a.capRaw,b.capRaw);assert.deepEqual(a.permanentVector,b.permanentVector);
   stats.repeatFixed++;stats.repeatCapRestored+=Number(kind==="CAP_RESTORED_REPEAT");
   return {id:r.id,reason:kind,evidence:{ruleHash:key(r),before:exactWorld(w),after:exactWorld(target),immediate:exactWorld(v.world),quotient:before,actions:steps,ordinaryMaterialIds:itemKeys,cost:r.cost||0,modelOnly:true}};
  }catch(e){stats.repeatUnresolved++;return reason("REPLAY:"+String(e.message).slice(0,100));}
 }
 function assess(inputs,branch,w=null){
  const q=first.assess(inputs),blocked=q.blocked.slice(),alternatives=[],open=[],repeats=[];
  const chosen=new Set(choices(branch)),forbidden=new Set([...(branch.blockedResearch||[]),...[...allChoices].filter(k=>!chosen.has(k))]);
  for(const x of q.open){
   const r=rules.get(x.id),conflict=x.missingResearch.filter(k=>forbidden.has(k));
   if(conflict.length){blocked.push({id:x.id,reason:"SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH",evidence:conflict});continue;}
   // Only committed mutually exclusive choices seed transitive exclusion.
   // Direct blockedResearch still has the original, narrower semantics.
   const excludedChoices=new Set([...allChoices].filter(k=>!chosen.has(k)));
   const proofs=x.missingResearch.map(k=>branchExclusion.prove(k,excludedChoices,inputs.active)).filter(Boolean);
   if(proofs.length){blocked.push({id:x.id,reason:"SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH_TRANSITIVE",evidence:{policy:"ALL_INDEXED_METHODS_BLOCKED_V1",proofs,modelOnly:true}});stats.transitiveExclusions++;continue;}
   if(x.destination!==inputs.body||x.clone||r?.producedItem){
    alternatives.push({...x,reason:x.clone?"OTHER_INDIVIDUAL":r?.producedItem?"ITEM_CONVERSION":"OTHER_FINAL_BODY"});continue;
   }
   const proof=w?fixedRepeat(x,inputs,w):null;
   if(proof){blocked.push(proof);repeats.push(proof);}
   else open.push(x);
  }
  const possibleExact=q.unknownRules.length===0&&inputs.historyKnown&&!q.openGrowth&&open.every(x=>eligible(x,inputs,true));
  return {...q,blocked,open,alternatives,repeats,possibleExact,missingResearch:[...new Set(open.flatMap(x=>x.missingResearch))].sort(),closed:inputs.historyKnown&&!q.openGrowth&&!open.length&&!q.unknownRules.length,allBodyClosed:q.closed};
 }
 // Close a finite cap-restored SCC, rather than demanding that every
 // single action have the identical armor/history representation. The
 // equivalence projection still keeps armor, rank, initial stats, research
 // and all history presences, and never prunes an unproved successor.
 function proveCapCycle(inputs,branch,start,{maxStates=16,maxEdges=96}={}){
  stats.cycleAttempts++;
  const reject=why=>{stats.cycleRejected[why]=(stats.cycleRejected[why]||0)+1;return null;};
  try{
   const materialKeys=new Set();
   for(const r of first.byBody.get(inputs.body)||[])for(const k of Object.keys(r.requiredItems||{}))if(!materials.finite.has(k)&&materials.catalog[k]?.kind==="ORDINARY_ACQUISITION_ASSUMED")materialKeys.add(k);
   // The campaign verifier returns old armor to storage on a change.
   // Only source-indexed nonfinite outfit items unused by any surgery
   // can be projected out of this fixed-active-research objective.
   // Every concrete transition still records the exact returned item.
   const armorById=new Map((data.armorCatalog||[]).map(a=>[a.id,a]));
   const armorProjection=passiveArmorReturns(data,materials),armorReturns=armorProjection.all;
   // Indexed soft finite *grant* bounds remain unchanged. A returned
   // outfit not read by any surgery is a passive counter in this
   // fixed-active-research cycle, not a new usable grant. All concrete
   // worlds and transitions still keep the full stock count.
   const passiveFiniteSeen=new Set();
   const project=w=>{const z=structuredClone(w);z.funds=0;for(const k of materialKeys)delete z.items[k];for(const k of armorReturns)delete z.items[k];return quotient.project(z);};
   const objective=w=>{
    const m=member(w),s=m.state,f=replay.finish(w);
    return key([m.id,f.body,f.raw,f.capRaw,f.permanentVector,f.permanentCapVector,[...s.bonusIds].sort(),s.rank,s.initialStats,f.medals,s.status]);
   };
   const target=objective(start),source=project(start),states=new Map([[source,start]]),queue=[source],edges=[],inventories=[];
   for(let i=0;i<queue.length;i++){
    const from=queue[i],w=states.get(from),s=member(w).state,f=replay.finish(w);
    const actual={...inputs,body:f.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown!==false,active:new Set([...w.researched].filter(k=>!w.disabled.has(k))),raw:f.raw,capRaw:f.capRaw};
    const q=assess(actual,branch);
    if(q.openGrowth||q.unknownRules.length||!actual.historyKnown||objective(w)!==target)return reject("NONTERMINAL_OBJECTIVE");
    if(q.open.some(x=>!eligible(x,actual,true)))return reject("UNSUPPORTED_OR_NEW_RESEARCH");
    inventories.push({state:from,open:q.open.map(x=>x.id).sort(),blocked:q.blocked.map(x=>[x.id,x.reason]),alternatives:q.alternatives.map(x=>x.id)});
    for(const x of q.open){
     if(edges.length>=maxEdges)return reject("EDGE_BUDGET");
     const r=rules.get(x.id),v=replay.transform({world:w,steps:[]},r);
     if(!v)return reject("REPLAY_UNAVAILABLE");
     assert.equal(exactWorld(replay.replay(v.steps,w)),exactWorld(v.world));
     assert(v.steps.filter(a=>a.type==="transform").length===1);
     assert(v.steps.every(a=>["transform","externalInputs","conditionalPromotion","conditionalMedal"].includes(a.type)),"Non-surgery cycle action");
     assert(v.steps.filter(a=>a.type==="externalInputs").every(a=>!(a.functions||[]).length&&Object.keys(a.items||{}).every(k=>Object.hasOwn(r.requiredItems||{},k)&&!armorProjection.indexedFinite.has(k))));
     assert(v.world.funds<=w.funds);
     const oldArmor=member(w).state.armorId,newArmor=member(v.world).state.armorId;
     const returned=oldArmor!==newArmor?armorById.get(oldArmor)?.storeItem:null;
     for(const k of new Set([...Object.keys(w.items),...Object.keys(v.world.items)])){
      const a=w.items[k]||0,b=v.world.items[k]||0;
      assert(b===a||materialKeys.has(k)&&Object.hasOwn(r.requiredItems||{},k)&&b<=a||passiveReturnDelta(k,a,b,returned,armorProjection),"Unexpected inventory delta "+k);
      if(b!==a&&armorProjection.indexedFinite.has(k)){passiveFiniteSeen.add(k);stats.passiveFiniteReturnEdges++;}
     }
     if((first.byBody.get(inputs.body)||[]).some(t=>t.requiredMaxStats))return reject("MAX_STAT_GATE_PRESENT");
     const grown=replay.grow(v);
     assert.equal(exactWorld(replay.replay(grown.steps,w)),exactWorld(grown.world));
     if(objective(grown.world)!==target)return reject("OBJECTIVE_CHANGED");
     const to=project(grown.world);
     edges.push({from,to,action:r.id,ruleHash:key(r),before:exactWorld(w),after:exactWorld(grown.world),steps:grown.steps,...(returned&&armorReturns.has(returned)?{returnedArmorItem:returned,...(armorProjection.indexedFinite.has(returned)?{passiveIndexedFiniteReturn:{before:w.items[returned]||0,after:v.world.items[returned]||0,grantAssumed:false}}:{})}:{})});
     if(!states.has(to)){
      if(states.size>=maxStates)return reject("STATE_BUDGET");
      states.set(to,grown.world);queue.push(to);
     }
    }
   }
   stats.cycleAccepted++;stats.cycleStates+=states.size;stats.cycleEdges+=edges.length;
   return {policy:"FINITE_FIXED_BODY_CAP_RESTORED_CLOSURE_V1",source,objective:target,states:queue,edges,inventories,ordinaryMaterialIds:[...materialKeys].sort(),nonfiniteUnusedArmorReturnIds:[...armorProjection.ordinary].sort(),passiveIndexedFiniteArmorReturns:[...passiveFiniteSeen].sort().map(k=>armorProjection.indexedFinite.get(k)),passiveInventoryScope:"Only hypothetical same-body fixed-active-research surgery/growth cycles. No new grant, material-limit change, actual-game stock proof or research/recruit reuse.",allSuccessorsCovered:true,actualGameCertified:false,globalOptimal:false};
  }catch(e){return reject("REPLAY:"+String(e.message).slice(0,100));}
 }
 return {assess,proveCapCycle,stats,scope:SCOPE};
}
