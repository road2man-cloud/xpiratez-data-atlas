// Every indexed original birth is an eligible coverage seed, independent
// of whether its numerical Pareto frontier contains a CAP_TARGET proposal.
// The reference is the birth body's indexed cap, not a claimed outcome.
import {key} from "./population-research-career-core.mjs";
export const COVERAGE_POLICY="INDEXED_BIRTH_COVERAGE_V1";
export const birthPair=r=>r.origin+"|"+r.branch;
export function coverageIndex(routes,births){
 const inputs=new Map(),pairs=new Map(),origins=new Map(),branches=new Map();
 for(const r of Object.values(routes)){
  for(const [m,k] of [[inputs,r.input],[pairs,birthPair(r)],[origins,r.origin],[branches,r.branch]])m.set(k,(m.get(k)||0)+1);
 }
 const missing=births.filter(r=>!inputs.has(r.input)),birthPairs=new Set(births.map(birthPair));
 return {inputs,pairs,origins,branches,missing,summary:{birthInputs:births.length,coveredInputs:inputs.size,missingInputs:missing.length,indexedPairs:birthPairs.size,coveredPairs:pairs.size,coveredOrigins:origins.size,coveredBranches:branches.size,thinPairs:[...pairs.values()].filter(n=>n<=2).length}};
}
export function coverageProposal(db,data,birth){
 const c=db.populationAssumedBirthClosure,i=c.origins.indexOf(birth.origin),j=c.branches.indexOf(birth.branch);
 const groups=c.classes[c.classIndex[i]?.[j]]?.groups||[];
 const profile=data.profiles.find(x=>x.id===birth.origin),body=data.soldiers.find(x=>x.id===profile?.soldierType);
 if(!body||!groups.length)return null;
 const capGroup=groups.find(g=>(c.groups[g]?.frontier||[]).some(f=>f.body===body.id&&f.actions.length===1&&f.actions[0]==="CAP_TARGET"));
 const gi=capGroup??groups[0],g=c.groups[gi];
 const reference=data.statKeys.map(k=>body.statCaps?.[k]??0);
 if(reference.length!==12||!reference.every(Number.isSafeInteger))return null;
 return {gi,f:{id:"BIRTHCOVER:"+key([COVERAGE_POLICY,birth.origin,gi,g.proofHash,body.id,reference]).slice(0,24),body:body.id,actions:[{kind:"CAP_TARGET"}],permanentVector:reference,sourceKind:"COVERAGE_CAP_REPLAY"}};
}
export function orderMissing(index,attempts,db,data){
 const byBranch=new Map(),out=[],counts=index.branches;
 for(const birth of index.missing){
  const p=coverageProposal(db,data,birth);if(!p)continue;
  const id=key([birth.input,p.f.id]);if(attempts[id])continue;
  const xs=byBranch.get(birth.branch)||[];xs.push({birth,...p,id});byBranch.set(birth.branch,xs);
 }
 const groups=[...byBranch.entries()].sort((a,b)=>(counts.get(a[0])||0)-(counts.get(b[0])||0)||a[0].localeCompare(b[0]));
 for(const [,xs] of groups)xs.sort((a,b)=>(index.origins.get(a.birth.origin)||0)-(index.origins.get(b.birth.origin)||0)||a.birth.origin.localeCompare(b.birth.origin)||a.id.localeCompare(b.id));
 for(let i=0;;i++){let any=false;for(const [,xs] of groups)if(xs[i]){out.push(xs[i]);any=true;}if(!any)break;}
 return out;
}
