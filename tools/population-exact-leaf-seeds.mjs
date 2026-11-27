// Scheduling only. Select a bounded set of concrete leaves for exact replay.
// All other frontier nodes remain in the ordinary seed queue.
export function selectExactLeafSeeds(graph,candidates,{limit=3,accept=()=>true,turns=()=>0}={}){
 if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid exact leaf budget');
 const nodes=graph.nodes,parents=new Set(),histories=[];
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],p=n.parent;
  if(p!=null&&(!Number.isSafeInteger(p)||p<0||p>=i))throw Error('Invalid graph parent');
  if(p!=null)parents.add(p);
  const h=new Set(p==null?[]:histories[p]);
  for(const a of (p==null?[...(graph.birthActions||[]),...(n.steps||[])]:n.steps||[]))if(a.type==='transform'&&a.soldier==='origin'&&typeof a.transform==='string')h.add(a.transform);
  histories.push(h);
 }
 const scored=[];
 for(const i of new Set(candidates)){
  const n=nodes[i];if(!n||parents.has(i)||!accept(n,i))continue;
  if(!Array.isArray(n.raw)||!Array.isArray(n.capRaw)||n.raw.length!==12||n.capRaw.length!==12)continue;
  const atCap=n.raw.every((v,j)=>v===n.capRaw[j]);
  const h=[...histories[i]].sort(),traits=[...(n.traits||[])].sort();
  const signature=JSON.stringify([n.body,n.raw,n.capRaw,traits,h]);
  scored.push({i,atCap,history:h.length,traits:traits.length,turns:turns(i),signature});
 }
 const cmp=(a,b)=>a.turns-b.turns||b.history-a.history||b.traits-a.traits||b.i-a.i;
 scored.sort(cmp);
 const chosen=[],seen=new Set();
 function take(x){if(!x||seen.has(x.signature)||chosen.length>=limit)return;seen.add(x.signature);chosen.push(x.i);}
 // Both cap-restored and growth-pending endpoints matter. A cap-only lane
 // can starve a newly revived leaf before its next growth action.
 take(scored.find(x=>x.atCap));
 take(scored.find(x=>!x.atCap));
 for(const x of scored)take(x);
 return chosen;
}
