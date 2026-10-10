export function buildChoiceIndex(topics) {
  if (!Array.isArray(topics) || !topics.length) throw new Error("No research topics");
  const byId=new Map();
  for(const t of topics){
    if(!t || typeof t.id!=="string" || byId.has(t.id)) throw new Error("Invalid research ID");
    byId.set(t.id,{
      id:t.id,koName:String(t.koName||""),enName:String(t.enName||""),
      prerequisites:Array.isArray(t.prerequisites)?t.prerequisites:[],
      disables:Array.isArray(t.disables)?t.disables.map(x=>x.id).filter(x=>typeof x==="string"):[],
      needItem:t.needItem===true,requiresBaseFunc:Array.isArray(t.requiresBaseFunc)?t.requiresBaseFunc:[]
    });
  }
  return {byId,topics:[...byId.values()]};
}
export function choiceLabel(index,id){
  const t=index.byId.get(id), label=t?.koName?.trim()||t?.enName?.trim();
  return label&&label!==id?label:id;
}
export function computeChoiceScenario(index, previouslyCompleted=[], proposedSteps=[]) {
  const past=[],steps=[],skipped=[],completed=new Set(),blockedBy=new Map();
  function append(source) {
    for(const target of index.byId.get(source)?.disables||[]){
      if(!blockedBy.has(target))blockedBy.set(target,new Set());
      blockedBy.get(target).add(source);
    }
  }
  for(const id of previouslyCompleted){
    if(!index.byId.has(id)){skipped.push({id,kind:"unknown-past",blockers:[]});continue}
    if(completed.has(id))continue;
    past.push(id);completed.add(id);append(id);
  }
  const priorConflicts=[];
  for(const id of past){
    const sources=[...(blockedBy.get(id)||[])].filter(x=>x!==id&&past.includes(x));
    if(sources.length)priorConflicts.push({id,blockedBy:sources});
  }
  for(const id of proposedSteps){
    if(!index.byId.has(id)){skipped.push({id,kind:"unknown-step",blockers:[]});continue}
    if(completed.has(id)){skipped.push({id,kind:"duplicate",blockers:[]});continue}
    const sources=[...(blockedBy.get(id)||[])].filter(x=>completed.has(x));
    if(sources.length){skipped.push({id,kind:"blocked",blockers:sources});continue}
    steps.push(id);completed.add(id);append(id);
  }
  return {past,steps,completed,blockedBy,skipped,priorConflicts};
}
function blockedPrerequisite(index,state,id,seen,depth=24){
  if(depth<=0||seen.has(id)||state.completed.has(id))return null;
  const t=index.byId.get(id);
  if(!t)return null;
  seen.add(id);
  for(const req of t.prerequisites){
    if(state.completed.has(req))continue;
    const direct=state.blockedBy.get(req);
    if(direct?.size){seen.delete(id);return {missing:req,blockers:[...direct],path:[id,req]}}
    const nested=blockedPrerequisite(index,state,req,seen,depth-1);
    if(nested){seen.delete(id);return {...nested,path:[id,...nested.path]}}
  }
  seen.delete(id);return null;
}
export function choiceStatus(index,state,id){
  const t=index.byId.get(id);
  if(!t)return {id,kind:"unknown",blockers:[],missing:[]};
  const blockers=[...(state.blockedBy.get(id)||[])].filter(x=>x!==id&&state.completed.has(x));
  if(state.completed.has(id))return {
    id,kind:"completed",origin:state.past.includes(id)?"past":"planned",blockers,missing:[]
  };
  if(blockers.length)return {id,kind:"blocked",blockers,missing:[]};
  const missing=t.prerequisites.filter(x=>!state.completed.has(x));
  const nominal=blockedPrerequisite(index,state,id,new Set());
  return {id,kind:nominal?"path-risk":missing.length?"pending":"candidate",
    blockers:nominal?.blockers||[],missing,nominal,
    needItem:t.needItem,requiresBaseFunc:t.requiresBaseFunc};
}
export function choiceImpact(index,state,id,surfaceIds=[]){
  const t=index.byId.get(id);
  if(!t)return {id,newDirect:[],alreadyCompleted:[],newSurface:[]};
  const fresh=t.disables.filter(x=>!state.blockedBy.has(x));
  return {
    id,
    newDirect:fresh.filter(x=>!state.completed.has(x)),
    alreadyCompleted:t.disables.filter(x=>state.completed.has(x)),
    newSurface:fresh.filter(x=>!state.completed.has(x)&&surfaceIds.includes(x))
  };
}
export function parseCompletedResearch(index,source) {
  const value=String(source||"").trim();
  if(!value)return {ids:[],unknown:[],malformed:false};
  let tokens;
  if(value.startsWith("{")||value.startsWith("[")){
    try{
      const parsed=JSON.parse(value);
      tokens=Array.isArray(parsed)?parsed:Array.isArray(parsed?.completed)?parsed.completed:null;
      if(!tokens)return {ids:[],unknown:[],malformed:true};
    }catch{return {ids:[],unknown:[],malformed:true}}
  }else{
    tokens=value.split(/[\s,;]+/);
  }
  const ids=[],unknown=[],seen=new Set();
  for(const token of tokens){
    const id=String(token||"").trim();
    if(!id||seen.has(id))continue;
    seen.add(id);
    if(index.byId.has(id))ids.push(id);else unknown.push(id);
  }
  return {ids,unknown,malformed:false};
}
