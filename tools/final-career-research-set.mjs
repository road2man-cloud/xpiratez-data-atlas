// Shared research-history set matching. Gates must occur on ONE ancestor chain.
// Missing evidence is unknown, never proof of incompatibility.
export function createResearchSetLookup(index){
 const groups=new Map(),cache=new Map();
 const children=Array.from({length:index.nodes.length},()=>[]);
 for(let i=1;i<index.nodes.length;i++)children[index.nodes[i].parent].push(i);
 const lo=[],hi=[];let clock=0;
 const stack=[[0,false]];
 while(stack.length){const [n,exit]=stack.pop();if(exit){hi[n]=clock;continue;}lo[n]=clock++;stack.push([n,true]);for(const c of children[n])stack.push([c,false]);}
 for(const g of Object.values(index.transformGates)){
  if(!g.requires)continue;
  const k=JSON.stringify([g.branch,g.transform]);const xs=groups.get(k)||[];xs.push(g);groups.set(k,xs);
 }
 const histories=new Map();
 for(const [id,h] of Object.entries(index.histories)){const xs=histories.get(h.branch)||[];xs.push({id,...h});histories.set(h.branch,xs);}
 function match(branch,transforms){
  const ids=[...new Set(transforms)].sort(),k=JSON.stringify([branch,ids]);if(cache.has(k))return cache.get(k);
  const candidates=ids.map(id=>groups.get(JSON.stringify([branch,id]))||[]);
  const matches=[];
  if(candidates.every(xs=>xs.length))for(const h of histories.get(branch)||[]){
   const gates=candidates.map(xs=>xs.filter(g=>lo[g.prefix]<=lo[h.prefix]&&lo[h.prefix]<hi[g.prefix]));
   if(gates.every(xs=>xs.length))matches.push({history:h.id,prefix:h.prefix,gates:gates.map(xs=>xs.map(g=>({prefix:g.prefix,transform:g.transform,witnesses:g.witnesses})))});
  }
  const out={branch,transforms:ids,matches,status:matches.length?"SHARED_CONDITIONAL_RESEARCH_HISTORY":"UNRESOLVED",actualGameCertified:false};
  cache.set(k,out);return out;
 }
 return {match};
}
