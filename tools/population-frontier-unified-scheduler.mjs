// Shared horizon/bounded transition index. Success references are not
// impossibility proofs, and failed bounded attempts remain retryable.
import {key} from "./population-research-career-core.mjs";
import {successorKey} from "./population-frontier-chain-extended.mjs";
import {horizonProposal,HORIZON_POLICY} from "./population-full-horizon-proposals.mjs";
export const UNIFIED_POLICY="UNIFIED_LIVE_HORIZON_SCHEDULER_V1";
export function atGrowthCap(r){
 return Array.isArray(r.raw)&&Array.isArray(r.capRaw)&&r.raw.length===12&&r.capRaw.length===12&&r.raw.every((v,i)=>Number.isSafeInteger(v)&&v===r.capRaw[i]);
}
export function knownTransitions(routes,attempts){
 const success=new Map(),tried=new Set(),visited=new Map();
 for(const [aid,t] of Object.entries(attempts)){
  const p=routes[t.parent];if(!p)continue;
  const sk=successorKey(p,t.rule);tried.add(sk);
  visited.set(t.parent,(visited.get(t.parent)||0)+1);
  if(t.status!=="CONDITIONAL_CHAIN_REPLAY"||!atGrowthCap(p))continue;
  const r=routes[t.route];if(!r||r.chainParent!==t.parent||r.chainRule!==t.rule)continue;
  if(!success.has(sk))success.set(sk,{attempt:aid,parent:t.parent,route:t.route});
 }
 return {success,tried,visited};
}
// Cache eligibility by body/rule, but construct exact proposal IDs/actions
// for each parent; prior horizon verifier remains the source of semantics.
export function createIndexedHorizon(data){
 const eligible=new Map();
 return function propose(id,parent,rule){
  const k=parent.body+"|"+rule.id;
  if(!eligible.has(k))eligible.set(k,Boolean(horizonProposal(data,id,parent,rule.id)));
  if(!eligible.get(k)||parent.rankDefault)return null;
  const actions=[...parent.order.map(id=>({kind:"TRANSFORM",id})),{kind:"TRANSFORM",id:rule.id},{kind:"CAP_TARGET"}];
  return {id:"HORIZON:"+key([HORIZON_POLICY,id,parent.fullActionHash,rule.id]).slice(0,24),body:rule.producedSoldierType||parent.body,actions,permanentVector:parent.permanentVector,sourceKind:"BIRTH_RESEARCH_CHAIN",rule};
 };
}
export function makeReuse(parentId,parent,f,hit){
 return {parent:parentId,input:parent.input,rule:f.rule.id,sourceRoute:f.id,successorKey:successorKey(parent,f.rule.id),equivalent:hit,policy:UNIFIED_POLICY};
}
