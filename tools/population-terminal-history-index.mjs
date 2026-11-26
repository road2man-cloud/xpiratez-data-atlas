// Source-derived history index for retained chronological graph nodes.
// No world replay, research grant, or numerical eligibility decision here.
// Unknown actions/clone semantics deliberately invalidate the index.
const passive=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
export function createTerminalHistoryIndex({data}){
 const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r])),cache=new WeakMap();
 const metrics={nodes:0,roots:0,unknown:0,knownChecks:0,mismatches:0,gatedCandidates:0,sourceGated:0};
 function apply(start,steps){
  let h=start===null?null:new Set(start);
  for(const a of steps){
   if(passive.has(a.type))continue;
   if(a.type==="recruit"){
    if(a.soldier!=="origin")continue;
    const p=profiles.get(a.profile);if(!p||h!==null)return undefined;
    h=new Set(Object.entries(p.previousTransformations||{}).filter(([,n])=>Number(n)>0).map(([k])=>k));
   }else if(a.type==="transform"){
    if(a.soldier!=="origin")continue;
    const r=rules.get(a.transform);if(!h||!r||r.createsClone||r.producedItem)return undefined;
    if(r.reset)h.clear();else for(const k of r.removeTransformations||[])h.delete(k);
    h.add(r.id);
   }else return undefined;
  }
  return h;
 }
 function history(g,i){
  let a=cache.get(g);if(!a){a=[];cache.set(g,a);}
  for(let j=a.length;j<=i;j++){
   const n=g.nodes[j];if(!n)return undefined;
   let v;
   if(j===0){v=apply(null,g.birthActions);metrics.roots++;}
   else if(Number.isInteger(n.parent)&&n.parent>=0&&n.parent<j&&a[n.parent] instanceof Set)v=apply(a[n.parent],n.steps);
   a.push(v instanceof Set?v:undefined);metrics.nodes++;if(!a[j])metrics.unknown++;
  }
  return a[i];
 }
 function gate(g,i,r,known){
  let h=history(g,i);
  if(known){
   metrics.knownChecks++;
   const k=new Set(Object.entries(known).filter(([,v])=>Number(v)>0).map(([k])=>k));
   if(h&&(h.size!==k.size||[...h].some(id=>!k.has(id)))){metrics.mismatches++;h=undefined;}
   h=k;
  }
  if(!h)return false;
  const blocked=(r.requiredPreviousTransformations||[]).some(k=>!h.has(k))||(r.forbiddenPreviousTransformations||[]).some(k=>h.has(k));
  if(blocked){metrics.gatedCandidates++;if(!known)metrics.sourceGated++;}
  return blocked;
 }
 return {history,gate,metrics};
}
