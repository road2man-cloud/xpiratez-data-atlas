// Research-to-surgery followthrough. All transitions use the same campaign
// replay functions as the ordinary frontier; no research or stat grants.
// Batch quotas are scheduling only, not bounds on a career.
const sum=v=>(v||[]).reduce((s,x)=>s+x,0);
export function researchPriority(g,n,r,byBody){
 const root=g.nodes[0],dest=r.producedSoldierType||n.body;
 const future=new Set((byBody.get(dest)||[]).map(x=>x.soldierBonusType).filter(x=>x&&!n.traits.includes(x))).size;
 return 120*Number(!!r.soldierBonusType&&!n.traits.includes(r.soldierBonusType))+
  45*Number(dest!==n.body)+n.traits.length*22+Math.min(60,future)*4+
  (sum(n.permanentVector)-sum(root.permanentVector))*.08+
  (sum(n.permanentCapVector)-sum(root.permanentCapVector))*.06;
}
export function followResearchTransform({g,id,node,r,replay,loadNode,stepsFor,insert,context}){
 const results=[];
 function get(i){return {world:loadNode(id,g,i),steps:stepsFor(g,i)};}
 function emit(parent,action,q){
  if(!q)return {status:"UNRESOLVED_LOCAL_GATE"};
  const base=stepsFor(g,parent);
  const allowed=context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...q.steps],q.world);
  if(!allowed.length)return {status:"UNRESOLVED_CONTEXT"};
  const edge=insert(id,g,q.world,parent,action,q.steps.slice(base.length),true);
  return {...edge,allowedDifficulties:allowed};
 }
 function transform(i,mode){
  try{
   const n=get(i);
   if(!r.requires.every(k=>replay.active(n.world,k))){results.push({mode,parent:i,status:"INACTIVE_RESEARCH"});return;}
   // A prior ordinary expansion may already contain this exact action.
   const existing=g.nodes[i].edges?.find(e=>e.action===r.id&&e.status==="CONDITIONAL_REPLAY");
   const edge=existing?{...existing,status:"EXISTING_REPLAY"}:emit(i,r.id,replay.transform(n,r));
   results.push({mode,parent:i,...edge});
  }catch(e){results.push({mode,parent:i,status:"LIMITED_UNRESOLVED",reason:String(e.message)});}
 }
 transform(node,"DIRECT");
 try{
  const base=get(node),grown=replay.grow(base);
  if(grown.steps.length>base.steps.length){
   const existing=g.nodes[node].edges?.find(e=>e.action==="CAP_GROWTH"&&e.status==="CONDITIONAL_REPLAY");
   const edge=existing||emit(node,"CAP_GROWTH",grown);
   if(edge.to!==undefined&&(edge.status==="CONDITIONAL_REPLAY"||edge.status==="CONDITIONAL_ALIAS"))transform(edge.to,"GROW_THEN_TRANSFORM");
   else results.push({mode:"GROW_THEN_TRANSFORM",parent:node,status:edge.status});
  }
 }catch(e){results.push({mode:"GROW_THEN_TRANSFORM",parent:node,status:"LIMITED_UNRESOLVED",reason:String(e.message)});}
 return results;
}
