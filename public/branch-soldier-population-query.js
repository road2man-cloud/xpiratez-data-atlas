// Exact branch-and-bound query INSIDE a completed finite population DAG.
// No claim about unexplored growth/technologies/campaigns.
// Independent per-stat bounds and same-path objective bound are admissible
// because they are maxima of the completed suffix graph.
export function queryPopulationGraph(a,ruleDetails,{stats,targets={},objective="total",maxFees=null,origin=null,branch=null,body=null}={}){
 if(!Array.isArray(stats)||stats.length!==12||!["total",...stats].includes(objective))throw Error("Invalid objective");
 const target=Object.entries(targets).map(([k,v])=>{const i=stats.indexOf(k);if(i<0||!Number.isFinite(v))throw Error("Invalid target "+k);return [i,v];});
 if(maxFees!=null&&(!Number.isFinite(maxFees)||maxFees<0))throw Error("Invalid fee limit");
 const costs=a.rules.map(id=>{const n=ruleDetails[id]?.cost;if(!Number.isFinite(n))throw Error("Unknown fee "+id);return Math.max(0,n);});
 const oi=stats.indexOf(objective),score=v=>oi<0?v.reduce((n,x)=>n+x,0):v[oi];
 const result={groups:0,boundStates:0,orderedLabels:0,visitedLabels:0,prunedLabels:0,prunedSubtrees:0,prunedByTarget:0,prunedByObjective:0,prunedByFees:0,bestScore:null,ties:0,witness:null};
 let incumbent=-Infinity;
 for(let g=0;g<a.groups.length;g++){
  const group=a.groups[g];if(origin&&group.originProfile!==origin||branch&&!group.branchIds.includes(branch))continue;
  result.groups++;result.orderedLabels+=group.labels.length;
  const edges=new Map(group.edges),memo=new Map();
  const bounds=(node,left)=>{
   const key=node*(a.depth+1)+left;
   if(memo.has(key))return memo.get(key);
   const s=group.states[node],valid=!body||s.body===body;
   const vector=valid?[...s.vector]:stats.map(()=>-Infinity);
   let best=valid?score(s.vector):-Infinity,count=1;
   if(left>0)for(const [to] of edges.get(node)||[]){
    const sub=bounds(to,left-1);count+=sub.count;best=Math.max(best,sub.best);
    for(let i=0;i<12;i++)vector[i]=Math.max(vector[i],sub.vector[i]);
   }
   const out={vector,best,count};memo.set(key,out);return out;
  };
  function visit(node,left,band,actions,growth,fees){
   const upper=bounds(node,left);
   let reason=null;
   if(maxFees!=null&&fees>maxFees)reason="Fees";
   else if(upper.best===-Infinity||target.some(([i,v])=>upper.vector[i]<v))reason="Target";
   else if(upper.best<incumbent)reason="Objective";
   if(reason){result.prunedSubtrees++;result.prunedLabels+=upper.count;result["prunedBy"+reason]+=upper.count;return;}
   result.visitedLabels++;
   const s=group.states[node];
   if((!body||s.body===body)&&target.every(([i,v])=>s.vector[i]>=v)){
    const value=score(s.vector);
    if(value>=incumbent){
     if(value>incumbent){incumbent=value;result.ties=0;}
     result.ties++;
     if(!result.witness||value>result.bestScore||value===result.bestScore&&fees<result.witness.fees){
      result.bestScore=value;result.witness={group:g,node,originProfile:group.originProfile,body:s.body,band:band?"max":"min",steps:actions.map(i=>a.rules[i]),growth,fees,raw:s.raw,bonus:s.bonus,vector:s.vector,branchIds:group.branchIds};
     }
    }
   }
   if(left>0){
    const successors=[...(edges.get(node)||[])].sort((x,y)=>bounds(y[0],left-1).best-bounds(x[0],left-1).best);
    for(const [to,i,grow] of successors)visit(to,left-1,band,[...actions,i],[...growth,grow],fees+costs[i]);
   }
  }
  const roots=group.labels.filter(l=>l[2].length===0);
  if(roots.reduce((n,r)=>n+bounds(r[0],a.depth).count,0)!==group.labels.length)throw Error("DAG label count mismatch "+g);
  for(const [node,band] of roots)visit(node,a.depth,band,[],[],0);
  result.boundStates+=memo.size;
 }
 if(result.visitedLabels+result.prunedLabels!==result.orderedLabels)throw Error("Incomplete bounded query");
 return result;
}
