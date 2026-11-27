// A narrow dominance proof for repeat Shade summoning. This is not an
// equality proof or a proof of optimal play across other final bodies.
// Only the fixed-body, fixed-active-research, cap-restored comparison is
// covered. All chronological candidates are still independently replayed.
import assert from "node:assert/strict";
import {STAT_KEYS,statChangeEngineEstimate} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth,deterministicRule} from "./population-scalar-upper-bound.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
export const SHADE_RESET_POLICY="SHADE_SINGLE_ACTION_DOMINATED_RESET_V1";
const BODY="STR_SOLDIER_SPECTRE",RULE="STR_SPECTRE_SUMMONING";
const equal=(a,b)=>key(a)===key(b);
export function createShadeResetProof(data,replay,scope){
 const rule=data.transformations.find(r=>r.id===RULE),body=replay.bodies.get(BODY),materials=createResearchMaterialPolicy(data);
 const itemIds=Object.keys(rule?.requiredItems||{}),stats={attempted:0,accepted:0,rejected:{},scalarCases:0,scalarCacheHits:0},memo=new Map();
 const stableRule=!!(rule&&body&&rule.reset===true&&!rule.resetRank&&!rule.createsClone&&!rule.producedItem&&!rule.soldierBonusType&&rule.producedSoldierType===BODY&&rule.allowedSoldierTypes.includes(BODY)&&rule.allowsDeadSoldiers&&!rule.allowsLiveSoldiers&&replay.lifecycleRules?.has(RULE)&&deterministicRule(rule,[body])&&!rule.requiredMaxStats&&Number(rule.minRank||0)===0&&!(rule.requiresBaseFunc||[]).length&&Object.keys(rule.requiredCommendations||{}).length===0&&Number.isSafeInteger(rule.cost||0)&&(rule.cost||0)>=0&&itemIds.every(k=>!materials.finite.has(k)&&materials.catalog[k]?.kind==="ORDINARY_ACQUISITION_ASSUMED"));
 function canAttempt(q,inputs){
  return stableRule&&inputs.body===BODY&&inputs.historyKnown&&!q.openGrowth&&!q.unknownRules.length&&q.open.length===1&&q.open[0].id===RULE&&!q.open[0].missingResearch.length&&q.open[0].destination===BODY;
 }
 function scalarDomain(s,f){
  const id=key([s.initialStats,f.raw]);if(memo.has(id)){stats.scalarCacheHits++;return memo.get(id);}
  const bounds=[];
  for(const [i,k] of STAT_KEYS.entries()){
   const floor=k==="health"?1:0,max=f.raw[i];assert(Number.isSafeInteger(max)&&max>=floor&&max<=10000,"Scalar domain unsupported");
   let upper=-Infinity;
   // Enumerate the complete per-stat box, not just the sampled successor.
   // The indexed deterministic stat transform and growth are separable.
   for(let x=floor;x<=max;x++){
    const a=statChangeEngineEstimate(rule,{...s,currentStats:{...s.currentStats,[k]:x}},data);
    const y=scalarGrowth(body,k,a.stats[k],data);
    assert(Number.isSafeInteger(y)&&y>=floor&&y<=max,"Scalar upper bound violated "+k);
    upper=Math.max(upper,y);stats.scalarCases++;
   }
   bounds.push({stat:k,min:floor,max,successorUpper:upper});
  }
  memo.set(id,bounds);return bounds;
 }
 function prove(q,inputs,branch,w){
  if(!canAttempt(q,inputs))return null;
  stats.attempted++;
  try{
   const s=member(w).state,f=replay.finish(w);
   assert(s.exactStats&&!s.retired&&s.status==="healthy"&&!w.pendingFree&&s.historyKnown!==false&&s.bonusIds.size===0&&s.bonusCounts.size===0);
   assert(equal(f.raw,f.capRaw)&&equal(f.raw,f.permanentVector)&&equal(f.capRaw,f.permanentCapVector),"Non-raw comparison vector");
   const v=replay.transform({world:w,steps:[]},rule);assert(v,"Resummoning replay unavailable");
   assert(v.steps.filter(a=>a.type==="transform").length===1&&v.steps.every(a=>a.type==="transform"||a.type==="externalInputs"));
   assert(v.steps.filter(a=>a.type==="externalInputs").every(a=>!(a.functions||[]).length&&Object.keys(a.items||{}).every(k=>itemIds.includes(k))));
   assert(v.world.funds<=w.funds&&itemIds.every(k=>(v.world.items[k]||0)<=(w.items[k]||0)));
   const grown=replay.grow(v),z=grown.world,t=member(z).state,after=replay.finish(z);
   assert.equal(exactWorld(replay.replay(grown.steps,w)),exactWorld(z));
   assert(t.exactStats&&!t.retired&&t.status==="healthy"&&t.historyKnown!==false);
   assert(equal(after.raw,after.capRaw)&&equal(after.raw,after.permanentVector)&&equal(after.capRaw,after.permanentCapVector));
   assert(after.raw.every((x,i)=>x<=f.raw[i])&&t.bonusIds.size===0&&t.bonusCounts.size===0);
   // Preserve every modeled non-stat field except explicit ordinary
   // supply consumption, nonincreasing funds and audit-only step trace.
   // In particular history, rank, initial stats, armor and research must
   // remain identical even though the rule carries reset:true.
   const project=a=>{
    const b=structuredClone(a),n=member(b).state;
    b.funds=0;for(const k of itemIds)delete b.items[k];
    n.currentStats=structuredClone(s.currentStats);n.steps=[];
    return exactWorld(b);
   };
   assert.equal(project(w),project(z),"Non-stat state changed");
   const next={...inputs,history:new Set(t.history.keys()),historyKnown:t.historyKnown!==false,active:new Set([...z.researched].filter(k=>!z.disabled.has(k))),raw:after.raw,capRaw:after.capRaw};
   const nq=scope.assess(next,branch);
   assert(canAttempt(nq,next),"Another same-body action remains or is unlocked");
   // The first-action inventory ignores numeric eligibility, so identical
   // history/active/finite state preserves this conservative superset.
   // A later failed numerical gate only removes the one reset action.
   assert(equal(q.blocked,nq.blocked)&&equal(q.alternatives,nq.alternatives),"First-action inventory changed");
   const bounds=scalarDomain(s,f);
   stats.accepted++;
   return {id:RULE,reason:"DOMINATED_SAME_BODY_RESET",evidence:{policy:SHADE_RESET_POLICY,ruleHash:key(rule),before:exactWorld(w),after:exactWorld(z),steps:grown.steps,nonStatQuotient:project(w),rawBefore:f.raw,rawAfter:after.raw,scalarBounds:bounds,ordinaryMaterialIds:itemIds,allSameBodySuccessorsCovered:true,strictlyWorse:after.raw.some((x,i)=>x<f.raw[i]),modelOnly:true,actualGameCertified:false,globalOptimal:false}};
  }catch(e){const k=String(e.message).slice(0,140);stats.rejected[k]=(stats.rejected[k]||0)+1;return null;}
 }
 return {canAttempt,prove,stats};
}
