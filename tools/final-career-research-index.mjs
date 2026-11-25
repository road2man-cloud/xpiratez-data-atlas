// Lookup only. A research sequence is a reusable proposal, never a grant.
// A caller must apply the suffix on its own full world and check all gates.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
export function createResearchWitnessLookup(index,{sourceMetadataSha256,sourceLedgerHash}){
 assert.equal(index.schema,"CONDITIONAL_RESEARCH_WITNESS_INDEX_V1");
 assert.equal(index.sourceMetadataSha256,sourceMetadataSha256);
 assert.equal(index.sourceLedgerHash,sourceLedgerHash);
 const edges=new Map(),groups=new Map(),memo=new Map();
 for(let i=1;i<index.nodes.length;i++){const n=index.nodes[i];edges.set(key([n.parent,n.action]),i);}
 for(const g of Object.values(index.transformGates)){
  const k=key([g.branch,g.transform]),xs=groups.get(k)||[];xs.push(g);groups.set(k,xs);
 }
 function prefix(actions){
  let n=0;
  for(const a of actions){n=edges.get(key([n,a]));if(n===undefined)return null;}
  return n;
 }
 function candidates(branch,transform,from){
  if(from===null||!Number.isInteger(from)||from<0||from>=index.nodes.length)return [];
  const k=key([branch,transform,from]);if(memo.has(k))return memo.get(k);
  const result=[];
  for(const g of groups.get(key([branch,transform]))||[]){
   let n=g.prefix;const reverse=[];
   while(n!==from&&n!==0){const entry=index.nodes[n];reverse.push(entry.action);n=entry.parent;}
   if(n===from)result.push({prefix:g.prefix,researchSuffix:reverse.reverse(),requires:g.requires,witnesses:g.witnesses,evidence:"CONDITIONAL_PROPOSAL_REPLAY_REQUIRED"});
  }
  result.sort((a,b)=>a.researchSuffix.length-b.researchSuffix.length);
  memo.set(k,result);return result;
 }
 return {prefix,candidates};
}
