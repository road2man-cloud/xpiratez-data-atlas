// Exact, finite, action-labelled graph quotient and multiobjective closure.
// The caller must supply the complete transition relation of its DECLARED model.
// This module never certifies unmodelled game rules or prunes intermediate stats.
import assert from "node:assert/strict";
export const dominates=(a,b)=>a.length===b.length&&a.every((x,i)=>x>=b[i]);
const vectorOK=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
export function createFiniteClosure(saved=[]){
 const nodes=saved.slice(),index=new Map(),metrics={requests:0,computed:0,hits:0,terminalDominanceRemoved:0};
 const sig=(remaining,observation,edges)=>JSON.stringify([remaining,observation,edges]);
 function signature(n){return sig(n.remaining,n.observation,n.edges);}
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i];assert(n.edges.every(e=>e[2]<i),"Non-topological checkpoint");
  const k=signature(n);assert(!index.has(k),"Duplicate checkpoint signature");index.set(k,i);
 }
 // Only terminal outputs are dominated. All successor edges remain intact.
 function frontier(ids,byBody=true){
  const bins=new Map();
  for(const id of new Set(ids)){
   const o=nodes[id].observation,k=byBody?o[0]:"*";
   if(!bins.has(k))bins.set(k,new Map());
   const b=bins.get(k),key=JSON.stringify(o[3]);if(!b.has(key))b.set(key,id);
  }
  const result=[];
  for(const b of bins.values()){
   const xs=[...b.values()].sort((a,b)=>nodes[b].observation[3].reduce((s,x)=>s+x,0)-nodes[a].observation[3].reduce((s,x)=>s+x,0)||a-b);
   const f=[];
   for(const id of xs){
    if(f.some(j=>dominates(nodes[j].observation[3],nodes[id].observation[3]))){metrics.terminalDominanceRemoved++;continue;}
    f.push(id);
   }
   result.push(...f);
  }
  return result.sort((a,b)=>a-b);
 }
 function intern(remaining,observation,edges){
  assert(Number.isSafeInteger(remaining)&&remaining>=0);
  assert(typeof observation[0]==="string"&&observation.slice(1,4).every(vectorOK));
  assert(remaining||!edges.length);
  edges=edges.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  const labels=new Set();
  for(const [rule,grow,child] of edges){
   assert(Number.isSafeInteger(rule)&&[0,1].includes(grow)&&nodes[child]?.remaining===remaining-1);
   const k=rule+"|"+grow;assert(!labels.has(k),"Nondeterministic action label in deterministic adapter");labels.add(k);
  }
  metrics.requests++;
  const k=sig(remaining,observation,edges);if(index.has(k)){metrics.hits++;return index.get(k);}
  const id=nodes.length,paths=1+edges.reduce((n,e)=>n+nodes[e[2]].paths,0);
  assert(Number.isSafeInteger(paths),"Ordered path count overflow");
  nodes.push({remaining,observation,edges,paths,frontier:[]});index.set(k,id);
  nodes[id].frontier=frontier([id,...edges.flatMap(e=>nodes[e[2]].frontier)]);
  metrics.computed++;return id;
 }
 return {nodes,metrics,intern,frontier};
}
