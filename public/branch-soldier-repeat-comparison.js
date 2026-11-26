// Comparison-only compression of replay-proven shorter witnesses.
// Do not collapse arbitrary trait counts, equal vectors or research sets.
// A filtered table suppresses a route only when its proven shorter
// alternative is also present; the original evidence remains addressable.
import {createMaterialIndex} from "./branch-soldier-material-frontier-v2.js?v=83-repeat-accounting";
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=a=>[...a].sort();
export function createRepeatComparison(registry){
 const c=registry?.careerCompletion,sets=c?.researchTraitSets,pop=registry?.populationMissingOriginCareer;
 const receipts=pop?.summary?.repeatCompaction?.records||{},raw=pop?.routes||{},edges=new Map(),material=createMaterialIndex(c?.materialBudget);
 let rejected=0;
 for(const [id,r] of Object.entries(receipts)){
  if(r.status!=="COMPACT_REPLAY")continue;
  const to="MISSCAR:"+r.graph+":"+r.to,a=raw[id],b=raw[to],x=sets?.records?.[id],y=sets?.records?.[to],cx=c?.classifications?.missingbirth?.[id],cy=c?.classifications?.missingbirth?.[to];
  const m=material.cost(id),n=material.cost(to);
  if(r.source!==id||!a||!b||!x||!y||!m||!n||cx?.status!=="RESEARCH_LINE_COMPLETE"||cy?.status!=="RESEARCH_LINE_COMPLETE"||
     cx.researchLineId!==x.pairId||cy.researchLineId!==y.pairId||
     a.sourceGraph!==r.graph||b.sourceGraph!==r.graph||a.sourceNode!==r.from||b.sourceNode!==r.to||
     a.canonicalStateHash!==r.sourceStateHash||b.canonicalStateHash!==r.targetStateHash||
     x.stateHash!==a.canonicalStateHash||y.stateHash!==b.canonicalStateHash||x.actionHash!==a.fullActionHash||y.actionHash!==b.fullActionHash||
     r.policy!=="NONREMOVABLE_PRESENCE_COUNTERS_V1"||!(/^[a-f0-9]{64}$/.test(r.equivalenceHash||""))||
     !Array.isArray(a.order)||!Array.isArray(b.order)||b.order.length>=a.order.length||
     a.origin!==b.origin||a.branch!==b.branch||a.body!==b.body||!same(a.allowedDifficulties,b.allowedDifficulties)||
     x.pathId!==y.pathId||!same(x.goals,y.goals)||!x.goals?.length||
     !same(a.permanentVector,b.permanentVector)||!same(a.permanentCapVector,b.permanentCapVector)||
     a.rank!==b.rank||!same(a.medals,b.medals)||!same(sorted(a.traitEvidence.retained),sorted(b.traitEvidence.retained))||
     n.some((v,i)=>v>m[i])){
   rejected++;continue;
  }
  edges.set(id,to);
 }
 function filter(rows){
  const available=new Set(rows.filter(r=>r.complete&&r.source==="missingbirth").map(r=>r.id));
  return rows.filter(r=>!r.complete||r.source!=="missingbirth"||!edges.has(r.id)||!available.has(edges.get(r.id)));
 }
 function summarize(rows){
  const kept=filter(rows),pairs=r=>new Set(r.map(x=>x.completionId)).size,ordinary=r=>r.filter(x=>x.body!=="STR_SOLDIER_CHORT");
  const rawOrdinary=ordinary(rows),effectiveOrdinary=ordinary(kept);
  return {schema:"REPLAY_PROVEN_SHORTER_WITNESS_COMPARISON_V1",scope:"Only replay-proven equivalent shorter alternatives with the same research path, context, numeric state and no increased finite material consumption. Archive admissions unchanged.",validatedReceipts:edges.size,rejectedReceipts:rejected,
   rawWitnesses:rows.length,effectiveWitnesses:kept.length,suppressedWitnesses:rows.length-kept.length,
   rawCombinations:pairs(rows),effectiveCombinations:pairs(kept),suppressedCombinations:pairs(rows)-pairs(kept),
   rawOrdinaryCombinations:pairs(rawOrdinary),effectiveOrdinaryCombinations:pairs(effectiveOrdinary),ordinarySuppressedWitnesses:rawOrdinary.length-effectiveOrdinary.length,
   suppressedRouteIds:rows.filter(r=>!kept.includes(r)).map(r=>r.id).sort()};
 }
 return {edges,rejected,filter,summarize};
}
