// Novel research lane: prioritize unrepresented branch + goal combinations,
// then diversify exact research set/body and origin. It is a scheduler, not
// a proof of impossibility. All omitted requests stay in the worklist.
import {key} from "./population-research-career-core.mjs";
const group=t=>key([t.branch,t.goal]);
export function createNovelResearchLane({tasks,receipts,suffixes,meta,lineage}){
 const groups=new Map(),setAttempts=new Map(),originAttempts=new Map(),attempts=new Map();
 const metrics={picks:0,groupsSeen:0,groupsPicked:0,newGroups:0,successes:0,resetPicks:0,unresolved:0,policyExcluded:0},picked=new Set(),successGroups=new Set();
 function add(id,t){
  const k=group(t),a=groups.get(k)||[];a.push([id,t]);groups.set(k,a);
 }
 function sub(t){return key([group(t),t.sourceSet,meta(t.ref).n.body]);}
 function account(t){
  const k=group(t),s=sub(t);attempts.set(k,(attempts.get(k)||0)+1);setAttempts.set(s,(setAttempts.get(s)||0)+1);originAttempts.set(t.origin,(originAttempts.get(t.origin)||0)+1);
 }
 for(const [id,t] of Object.entries(tasks)){add(id,t);if(receipts[id])account(t);}
 function pick(){
  let bestGroup=null,bestRank=null;
  // Re-check known successful suffixes because a new witness can appear
  // during the current round.
  for(const [k,a] of groups){
   if(!a.length||suffixes.has(k))continue;
   const pending=a.filter(([id])=>!receipts[id]);if(!pending.length)continue;
   const rank=[attempts.get(k)||0,-new Set(pending.map(([,t])=>t.origin)).size,-pending.length,k];
   if(!bestRank||less(rank,bestRank)){bestRank=rank;bestGroup={k,pending};}
  }
  if(!bestGroup)return null;
  metrics.groupsSeen=groups.size;let best=null,rank=null;
  for(const [id,t] of bestGroup.pending){
   const n=meta(t.ref).n,reset=lineage.anchor(t.ref);
   // A fresh research group is explored from a representative that retains
   // more traits. Reset descendants receive a preference, not exclusion.
   const x=[setAttempts.get(sub(t))||0,originAttempts.get(t.origin)||0,Number(!reset),-n.traits.length,-t.fresh,t.generation,id];
   if(!rank||less(x,rank)){rank=x;best={id,t,reset:!!reset,k:bestGroup.k};}
  }
  if(best){metrics.picks++;picked.add(best.k);metrics.groupsPicked=picked.size;metrics.resetPicks+=Number(best.reset);account(best.t);}
  return best;
 }
 function record(x,r){
  if(r?.graph){metrics.successes++;successGroups.add(x.k);metrics.newGroups=successGroups.size;}
  else if(r?.status==="CURRENT_BRANCH_POLICY_EXCLUDED")metrics.policyExcluded++;
  else metrics.unresolved++;
 }
 function less(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return false;}
 return {pick,record,add,metrics};
}
// Locate the last actually replayed reset in a linked graph path. A fixed
// seed may already have a reset in its pre-graph history, which is NOT
// counted without a pre/post-reset concrete state. No inference from traits.
export function createResetLineage({fixed,exp,ec,graphs,rules}){
 const cache=new Map(),resetIds=new Set([...rules.values()].filter(r=>r.reset).map(r=>r.id));
 function graph(ref){const [kind,id]=ref;return kind==="F"?fixed.graphs[id]:kind==="E"?ec.graphs[id]:graphs[id];}
 function node(ref){return graph(ref)?.nodes[ref[2]];}
 function anchor(ref){
  const pending=[];let p=ref,a=null;
  while(p){
   const k=p.join("|");if(cache.has(k)){a=cache.get(k);break;}
   const [kind,id,i]=p,g=graph(p),n=g?.nodes[i];if(!n)throw Error("Missing reset lineage node");
   pending.push(k);
   if(i!==0){
    if(resetIds.has(n.action)&&(n.steps||[]).some(s=>s.type==="transform"&&s.soldier==="origin"&&s.transform===n.action)){a={action:n.action,before:[kind,id,n.parent],after:p};break;}
    p=[kind,id,n.parent];
   }else if(kind==="R")p=g.source;
   else if(kind==="E"){const e=exp.expansions[id];p=["F",e.root,e.node];}
   else p=null;
  }
  for(const k of pending)cache.set(k,a);
  return a;
 }
 function evidence(ref){
  const a=anchor(ref);if(!a)return null;
  const before=node(a.before),after=node(a.after),n=node(ref);
  const pre=new Set(before.traits),post=new Set(after.traits),now=new Set(n.traits);
  const removed=before.traits.filter(k=>!post.has(k)),regained=removed.filter(k=>now.has(k));
  return {...a,beforeBody:before.body,afterBody:after.body,beforeStateHash:before.stateHash,afterStateHash:after.stateHash,beforeTraits:before.traits,afterTraits:after.traits,currentTraits:n.traits,removed,regained,newAfterReset:n.traits.filter(k=>!post.has(k)),newVsBefore:n.traits.filter(k=>!pre.has(k)),lostVsBefore:before.traits.filter(k=>!now.has(k)),netVsBefore:n.traits.length-before.traits.length,netSinceReset:n.traits.length-after.traits.length};
 }
 return {anchor,evidence};
}
