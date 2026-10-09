// Ordered soldier transformations. Restrictions apply to PREVIOUS transformations.
const list=x=>Array.isArray(x)?x:[];
export function initialState(origin,{condition="healthy"}={}){
  const prior=new Set(Object.entries(origin.previousTransformations||{}).filter(([,v])=>!!v).map(([id])=>id));
  return{soldierType:origin.soldierType,condition,prior,steps:[]};
}
export function evaluate(t,state){
  const issues=[];
  if(!t)return[{code:"unknown",ids:[]}];
  if(t.allowedSoldierTypes?.length&&!t.allowedSoldierTypes.includes(state.soldierType))
    issues.push({code:"type",ids:[state.soldierType]});
  if(list(t.forbiddenSoldierTypes).includes(state.soldierType))
    issues.push({code:"forbidden-type",ids:[state.soldierType]});
  const forbids=list(t.forbiddenPreviousTransformations).filter(id=>state.prior.has(id));
  if(forbids.length)issues.push({code:"forbidden",ids:forbids});
  const missing=list(t.requiredPreviousTransformations).filter(id=>!state.prior.has(id));
  if(missing.length)issues.push({code:"prerequisite",ids:missing});
  const field=state.condition==="dead"?"allowsDeadSoldiers":state.condition==="wounded"?"allowsWoundedSoldiers":"allowsLiveSoldiers";
  if(t[field]===false)issues.push({code:"condition",ids:[field]});
  return issues;
}
export function apply(t,state){
  const issues=evaluate(t,state);
  if(issues.length)throw new Error("Cannot apply "+t.id+": "+issues.map(x=>x.code+":"+x.ids.join(",")).join(" "));
  const prior=new Set(state.prior);
  for(const id of list(t.removeTransformations))prior.delete(id);
  prior.add(t.id);
  return{
    ...state,prior,
    // A clone/summon creates a DIFFERENT unit, not a type change to the source.
    soldierType:t.createsClone?state.soldierType:(t.producedSoldierType||state.soldierType),
    steps:[...state.steps,t.id]
  };
}
export function replay(origin,ids,byId,options={}){
  let state=initialState(origin,options);
  for(const id of ids)state=apply(byId.get(id),state);
  return state;
}
export function addWithPrerequisites(target,state,byId){
  let current=state;
  const stack=new Set(),steps=[];
  function resolve(id){
    const t=byId.get(id);
    if(!t||stack.has(id))return false;
    stack.add(id);
    for(const pre of list(t.requiredPreviousTransformations)){
      if(current.prior.has(pre))continue;
      if(!resolve(pre)){stack.delete(id);return false;}
    }
    stack.delete(id);
    if(evaluate(t,current).length)return false;
    current=apply(t,current);
    steps.push(id);
    return true;
  }
  return resolve(target.id)?{steps,state:current}:{steps:[],state:null};
}
export function requiredResearch(row,graph){
  const known=new Set(),pending=[...list(row?.researchRoots)];
  while(pending.length){
    const id=pending.pop();if(known.has(id))continue;
    known.add(id);
    pending.push(...list(graph[id]?.prerequisites));
  }
  return known;
}
export function findResearchConflicts(rows,graph){
  const ids=new Set();
  for(const row of rows)for(const id of requiredResearch(row,graph))ids.add(id);
  const conflicts=[],seen=new Set();
  for(const id of ids)for(const disabled of list(graph[id]?.disables)){
    if(!ids.has(disabled))continue;
    const key=id+"->"+disabled;
    if(!seen.has(key)){seen.add(key);conflicts.push({disabling:id,disabled});}
  }
  return conflicts;
}
export function compileRelations(rows){
  const relations=new Map(rows.map(x=>[x.id,{blocksLater:[],blockedBy:[],requires:[]}]));
  for(const t of rows){
    for(const prev of list(t.forbiddenPreviousTransformations)){
      if(!relations.has(prev))continue;
      relations.get(t.id).blockedBy.push(prev);
      relations.get(prev).blocksLater.push(t.id);
    }
    relations.get(t.id).requires=list(t.requiredPreviousTransformations);
  }
  return relations;
}
