// Cache only the context read by an individual transition. Availability
// of the action itself is still checked by the group's fixed research mask.
// This is a cache projection, not an equivalence of entire campaign histories.
import assert from "node:assert/strict";
import {PROMOTE,GROW} from "./population-career-frontier-core.mjs";
export const CACHE_SCHEMA="CAREER_ACTION_CONTEXT_V2";
export function actionKeys(base,mask,medals){
 const keys=new Map();
 keys.set(GROW,"g");
 const maxNeed=Math.max(0,...base.rules.filter((r,i)=>mask&base.bits[i]).map(r=>r.minRank||0));
 keys.set(PROMOTE,"p:"+maxNeed);
 const fullMedals=JSON.stringify(Object.entries(medals).sort(([a],[b])=>a.localeCompare(b)));
 for(let i=0;i<base.rules.length;i++){
  const r=base.rules[i];
  // Only explicit medal gates and bonus-inclusive stat gates read the
  // medal context. The resulting raw stats, rank, body and permanent
  // bonus/history fields are independent of the remaining medal preset.
  const usesBonus=!!r.includeBonusesForMaxStats||
   (!!r.includeBonusesForMinStats&&Object.values(r.requiredMinStats||{}).some(n=>Number(n)!==0));
  const gate=Object.entries(r.requiredCommendations||{}).every(([id,n])=>
   Object.hasOwn(medals,id)&&Number.isFinite(Number(medals[id]))&&Number(medals[id])>=0&&Number(medals[id])>=Number(n));
  keys.set(i,"t:"+i+":"+(usesBonus?"b:"+fullMedals:gate?"1":"0"));
 }
 return keys;
}
export function migrateContextEdges(nodes,base){
 const memo=new Map(),contexts=new Map();
 let legacyEdges=0,uniqueEdges=0,mergedEdges=0;
 for(const n of nodes){
  const projected={};
  for(const [old,to] of Object.entries(n.edges)){
   assert(Number.isSafeInteger(to)&&to>=-2&&to<nodes.length,"Bad legacy edge");
   let k=memo.get(old);
   if(k===undefined){
    const [context,a]=JSON.parse(old);
    let ks=contexts.get(context);
    if(!ks){
     const [mask,medals]=JSON.parse(context);
     assert(typeof mask==="string"&&medals&&typeof medals==="object");
     ks=actionKeys(base,BigInt("0x"+mask),medals);contexts.set(context,ks);
    }
    k=ks.get(a);assert(k!==undefined);memo.set(old,k);
   }
   legacyEdges++;
   if(Object.hasOwn(projected,k)){assert.equal(projected[k],to,"Cache projection collision with unequal successors");mergedEdges++;}
   else{projected[k]=to;uniqueEdges++;}
  }
  n.edges=projected;
 }
 assert.equal(legacyEdges,uniqueEdges+mergedEdges);
 return {legacyEdges,uniqueEdges,mergedEdges,legacyContexts:contexts.size,legacyKeys:memo.size};
}
