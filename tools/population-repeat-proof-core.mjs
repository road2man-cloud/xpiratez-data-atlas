// Safe upper repetition counts via a body/history projection.
// Unknown stat/research/rank/resource gates are relaxed, not assumed false.
// A positive edge inside a reachable SCC means only that this abstraction
// cannot bound the count. It is NOT a proof of a repeatable game path.
import assert from "node:assert/strict";
export function repeatBounds(data){
 const rules=data.transformations.filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.producedItem);
 assert(rules.every(r=>!r.createsClone),"Clone requires separate history policy");
 const bodies=new Set(data.soldiers.map(b=>b.id)),byBody=new Map();
 for(const r of rules)for(const b of r.allowedSoldierTypes||[]){
  if(r.forbiddenSoldierTypes?.includes(b))continue;
  assert(bodies.has(b)&&bodies.has(r.producedSoldierType||b));
  const a=byBody.get(b)||[];a.push(r);byBody.set(b,a);
 }
 const rows=[],metrics={nodes:0,edges:0,sccs:0,positiveSccs:0};
 for(const target of rules){
  const tracked=[...new Set([target.id,...(target.requiredPreviousTransformations||[]),...(target.forbiddenPreviousTransformations||[])])].sort();
  const bits=new Map(tracked.map((id,i)=>[id,1n<<BigInt(i)]));
  const bit=id=>bits.get(id)||0n,mask=ids=>ids.reduce((m,id)=>m|bit(id),0n);
  const nodes=[],index=new Map();
  function intern(body,h){
   const k=body+"|"+h.toString(16);if(index.has(k))return index.get(k);
   const id=nodes.length;nodes.push({body,mask:h.toString(16),edges:[]});index.set(k,id);return id;
  }
  const roots=data.profiles.map(p=>intern(p.soldierType,mask(Object.entries(p.previousTransformations||{}).filter(([,v])=>Number(v)>0).map(([id])=>id))));
  for(let i=0;i<nodes.length;i++){
   const n=nodes[i],h=BigInt("0x"+n.mask);
   for(const r of byBody.get(n.body)||[]){
    const req=mask(r.requiredPreviousTransformations||[]),forbid=mask(r.forbiddenPreviousTransformations||[]);
    if((h&req)!==req||(h&forbid)!==0n)continue;
    const next=(r.reset?0n:h&~mask(r.removeTransformations||[]))|bit(r.id);
    n.edges.push([intern(r.producedSoldierType||n.body,next),r.id]);
   }
  }
  // Tarjan SCC, then longest weighted path in condensation DAG.
  const d=Array(nodes.length).fill(-1),low=[],stack=[],on=new Set(),components=[],component=Array(nodes.length).fill(-1);
  let tick=0;
  function dfs(v){
   d[v]=low[v]=tick++;stack.push(v);on.add(v);
   for(const [w] of nodes[v].edges){
    if(d[w]<0){dfs(w);low[v]=Math.min(low[v],low[w]);}
    else if(on.has(w))low[v]=Math.min(low[v],d[w]);
   }
   if(low[v]===d[v]){
    const c=[];let w;do{w=stack.pop();on.delete(w);component[w]=components.length;c.push(w);}while(w!==v);components.push(c);
   }
  }
  for(let i=0;i<nodes.length;i++)if(d[i]<0)dfs(i);
  const dag=components.map(()=>new Map()),positive=components.map(()=>false);
  for(let i=0;i<nodes.length;i++)for(const [j,r] of nodes[i].edges){
   const a=component[i],b=component[j],w=Number(r===target.id);
   if(a===b){if(w)positive[a]=true;}
   else dag[a].set(b,Math.max(dag[a].get(b)||0,w));
  }
  const memo=new Map();
  function upper(c){
   if(memo.has(c))return memo.get(c);
   let u=positive[c]?Infinity:0;
   for(const [j,w] of dag[c])u=Math.max(u,w+upper(j));
   memo.set(c,u);return u;
  }
  const bounds=roots.map(id=>{const n=upper(component[id]);return Number.isFinite(n)?n:null;});
  const edgeCount=nodes.reduce((n,s)=>n+s.edges.length,0);
  metrics.nodes+=nodes.length;metrics.edges+=edgeCount;metrics.sccs+=components.length;metrics.positiveSccs+=positive.filter(Boolean).length;
  rows.push({rule:target.id,tracked,nodes,roots,component,positiveSccs:positive.map((x,i)=>x?i:-1).filter(i=>i>=0),bounds});
 }
 return {rows,metrics};
}
