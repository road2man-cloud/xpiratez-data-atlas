export function buildChoiceIndex(topics) {
  if (!Array.isArray(topics) || !topics.length) throw new Error("No research topics");
  const byId=new Map();
  for(const t of topics){
    if(!t || typeof t.id!=="string" || byId.has(t.id)) throw new Error("Invalid research ID");
    byId.set(t.id,{
      id:t.id,koName:String(t.koName||""),enName:String(t.enName||""),
      prerequisites:Array.isArray(t.prerequisites)?t.prerequisites:[],
      disables:Array.isArray(t.disables)?t.disables.map(x=>typeof x==="string"?x:x.id).filter(x=>typeof x==="string"):[],
      reenables:Array.isArray(t.reenables)?t.reenables.map(x=>typeof x==="string"?x:x.id).filter(x=>typeof x==="string"):[],
      needItem:t.needItem===true,requiresBaseFunc:Array.isArray(t.requiresBaseFunc)?t.requiresBaseFunc:[]
    });
  }
  return {byId,topics:[...byId.values()]};
}
export function choiceLabel(index,id){
  const t=index.byId.get(id), label=t?.koName?.trim()||t?.enName?.trim();
  return label&&label!==id?label:id;
}
// A loaded .sav supplies an authoritative status snapshot; a manual list has no timing information.
export function computeChoiceScenario(index, previouslyCompleted=[], proposedSteps=[], options={}) {
  const snapshot=options?.snapshot===true;
  const past=[],steps=[],skipped=[],priorConflicts=[],erased=[],reenabled=[];
  const completed=new Set(),disabled=new Set(),blockedBy=new Map(),removedBy=new Map(),saveDisabled=new Set();
  for(const id of previouslyCompleted){
    if(!index.byId.has(id)){skipped.push({id,kind:"unknown-past",blockers:[]});continue;}
    if(!completed.has(id)){past.push(id);completed.add(id);}
  }
  for(const id of options?.disabledIds||[]){
    if(!index.byId.has(id)){skipped.push({id,kind:"unknown-disabled",blockers:[]});continue;}
    disabled.add(id);
    if(snapshot)saveDisabled.add(id);
  }
  // Do not replay the historical rules when a .sav supplies authoritative status=2.
  // For manually entered current research, infer blocks but flag contradictions.
  if(!snapshot)for(const source of past)for(const target of index.byId.get(source)?.disables||[]){
    disabled.add(target);
    if(!blockedBy.has(target))blockedBy.set(target,new Set());
    blockedBy.get(target).add(source);
  }
  for(const id of past)if(disabled.has(id))
    priorConflicts.push({id,blockedBy:[...(blockedBy.get(id)||[])],fromSave:saveDisabled.has(id)});

  for(const id of proposedSteps){
    if(!index.byId.has(id)){skipped.push({id,kind:"unknown-step",blockers:[]});continue;}
    if(disabled.has(id)){
      skipped.push({id,kind:"blocked",blockers:[...(blockedBy.get(id)||[])],fromSave:saveDisabled.has(id)});
      continue;
    }
    if(completed.has(id)){skipped.push({id,kind:"duplicate",blockers:[]});continue;}
    // Assume this topic finishes successfully; we don't auto-resolve event or zero-cost rewards.
    steps.push(id);
    completed.add(id);
    for(const target of index.byId.get(id).disables){
      disabled.add(target);
      if(!blockedBy.has(target))blockedBy.set(target,new Set());
      blockedBy.get(target).add(id);
      if(completed.delete(target)){
        erased.push({id:target,by:id,origin:past.includes(target)?"past":"planned"});
        removedBy.set(target,id);
      }
    }
    // OXCE reenables resets a disabled status to NEW, without rediscovering it.
    for(const target of index.byId.get(id).reenables){
      if(!disabled.has(target))continue;
      disabled.delete(target);blockedBy.delete(target);saveDisabled.delete(target);
      reenabled.push({id:target,by:id});
    }
  }
  return {past,steps,completed,disabled,blockedBy,saveDisabled,removedBy,erased,reenabled,
    skipped,priorConflicts,snapshot};
}
function blockedPrerequisite(index,state,id,seen,depth=24){
  if(depth<=0||seen.has(id)||state.completed.has(id))return null;
  const t=index.byId.get(id);if(!t)return null;
  seen.add(id);
  for(const req of t.prerequisites){
    if(state.completed.has(req))continue;
    if(state.disabled.has(req)){
      seen.delete(id);
      return {missing:req,blockers:[...(state.blockedBy.get(req)||[])],fromSave:state.saveDisabled.has(req),path:[id,req]};
    }
    const deeper=blockedPrerequisite(index,state,req,seen,depth-1);
    if(deeper){seen.delete(id);return {...deeper,path:[id,...deeper.path]};}
  }
  seen.delete(id);return null;
}
export function choiceStatus(index,state,id){
  const t=index.byId.get(id);
  if(!t)return {id,kind:"unknown",blockers:[],missing:[]};
  const blockers=[...(state.blockedBy.get(id)||[])];
  if(state.completed.has(id))return {
    id,kind:"completed",origin:state.past.includes(id)?"past":"planned",
    blockers:state.disabled.has(id)?blockers:[],inconsistent:state.disabled.has(id),missing:[]
  };
  if(state.disabled.has(id))return {
    id,kind:"blocked",blockers,fromSave:state.saveDisabled.has(id),
    wasCompleted:state.erased.some(x=>x.id===id),
    removedBy:state.removedBy.get(id)||null,missing:[]
  };
  const missing=t.prerequisites.filter(req=>!state.completed.has(req));
  const nominal=blockedPrerequisite(index,state,id,new Set());
  return {id,kind:nominal?"path-risk":missing.length?"pending":"candidate",
    blockers:nominal?.blockers||[],missing,nominal,
    needItem:t.needItem,requiresBaseFunc:t.requiresBaseFunc};
}
export function choiceImpact(index,state,id,surfaceIds=[]){
  const t=index.byId.get(id);
  if(!t)return {id,newDirect:[],alreadyCompleted:[],newSurface:[],reenables:[]};
  const fresh=t.disables.filter(x=>!state.disabled.has(x));
  return {id,newDirect:fresh,alreadyCompleted:t.disables.filter(x=>state.completed.has(x)),
    newSurface:fresh.filter(x=>surfaceIds.includes(x)),
    reenables:t.reenables.filter(x=>state.disabled.has(x))};
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
