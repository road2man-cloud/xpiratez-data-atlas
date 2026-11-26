// Shared conditional rank adapter. The source JSON is never modified.
// A blank rank list is handled using the existing evidence-backed OXCE
// policy; custom lists, inherited refNode and disabled promotions remain.
import assert from "node:assert/strict";
import {defaultRankData,RANK_POLICY} from "./population-frontier-default-rank.mjs";
export function sharedRankData(data,policy){
 if(!policy)return data;
 assert.deepEqual(policy.policy,RANK_POLICY);
 const q=defaultRankData(data);
 assert.deepEqual(policy.indexed,q.indexed);
 return q.data;
}
export function sharedRankPolicy(data){
 const q=defaultRankData(data);
 return {policy:RANK_POLICY,indexed:q.indexed};
}
export function createSharedRankEvidence(data,policy){
 const indexed=new Set(policy.indexed),profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r]));
 return full=>{
  let body=null;const promotions=[];
  for(const [index,a] of full.entries()){
   if(a.soldier!=="origin")continue;
   if(a.type==="recruit"){body=profiles.get(a.profile)?.soldierType;continue;}
   if(a.type==="transform"){body=rules.get(a.transform)?.producedSoldierType||body;continue;}
   if(a.type==="conditionalPromotion"&&indexed.has(body))promotions.push({index,body,rank:a.rank});
  }
  return promotions.length?{policy:RANK_POLICY.id,exactBuildVerified:false,promotions}:null;
 };
}
