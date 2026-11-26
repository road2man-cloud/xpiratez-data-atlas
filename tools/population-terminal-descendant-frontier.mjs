// Scheduling and retention only, not a terminal closure certificate.
// Parent paths are real retained witnesses; aliases never establish ancestry.
export function createTerminalDescendantFrontier(graphs, records){
 const roots=new Map(), marks=new Map();
 const metrics={rootCount:0,expanded:0};
 function refresh(){
  for(const r of Object.values(records)){
   if(r.status!=="CONDITIONAL_TARGET_RESEARCH_READY"||!Number.isInteger(r.to)||!graphs[r.graph]?.nodes[r.to])continue;
   let set=roots.get(r.graph);if(!set){set=new Set();roots.set(r.graph,set);}
   if(!set.has(r.to)){set.add(r.to);marks.delete(r.graph);metrics.rootCount++;}
  }
 }
 function lineage(id){
  const g=graphs[id],set=roots.get(id);
  if(!set||!g)return [];
  let a=marks.get(id);if(!a){a=[];marks.set(id,a);}
  for(let i=a.length;i<g.nodes.length;i++){
   const p=g.nodes[i].parent;
   if(p!==null&&(!Number.isInteger(p)||p<0||p>=i))throw Error("INVALID_TERMINAL_PARENT");
   a.push(set.has(i)||(p!==null&&a[p]===true));
  }
  return a;
 }
 const contains=(id,i)=>lineage(id)[i]===true;
 function nodes(id){return lineage(id).flatMap((v,i)=>v?[i]:[]);}
 function pick(turns){
  let best=null;
  for(const id of roots.keys()){
   const g=graphs[id];if(g.blocker)continue;
   for(const i of nodes(id)){
    const n=g.nodes[i];if(n.edges!==null)continue;
    const age=turns.get(id)||0;
    const candidate={id,g,i,age,traits:n.traits.length};
    if(!best||age<best.age||age===best.age&&(candidate.traits>best.traits||candidate.traits===best.traits&&(id<best.id||id===best.id&&i<best.i)))best=candidate;
   }
  }
  return best;
 }
 function summary(){
  let descendants=0,pending=0;
  for(const id of roots.keys())for(const i of nodes(id)){descendants++;pending+=Number(graphs[id].nodes[i].edges===null);}
  return {...metrics,graphs:roots.size,descendants,pending};
 }
 refresh();return {refresh,contains,nodes,pick,summary,metrics};
}
