// Source-indexed early research prefix producer. Not a full campaign normalizer.
import assert from "node:assert/strict";
import {applyOriginWitnessStep,foundationWorld} from "../public/soldiers/modern/origin-witness.js";
export const START_RESEARCH=Object.freeze({
 "근처 마을 방문":"STR_JACKSTOWN_SCOUTING",
 "회의 소집":"STR_WAT_DO",
 "지역 농부 고용":"STR_RECRUIT_PEASANTS",
 "기계류 조사":"STR_INSPECT_MACHINERY"
});
const roots=new Set(Object.values(START_RESEARCH)),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort();
// Restrict this producer to concrete root/dependency/unlock evidence. A topic
// with no dependencies and an unknown sample/event origin is not a start root.
export function earlyLabAccess(world,id,rules,{started=false}={}){
 const r=rules[id];if(!r||!(r.cost>0)||arr(r.requires).length||world.pendingFree||world.disabled.has(id)||world.researched.has(id))return null;
 if(r.needItem&&!(Number(world.items[r.neededItem||id])>0))return null;
 if(arr(r.requiresBaseFunc).some(f=>!world.baseFunctions.has(f)))return null;
 if(roots.has(id))return {kind:"START_CHOICE",ids:[id]};
 if(!started)return null;
 const unlocks=sort([...world.researched].filter(k=>arr(rules[k]?.unlocks).includes(id)));
 if(unlocks.length)return {kind:"EXPLICIT_UNLOCK",ids:unlocks};
 const deps=arr(r.dependencies);
 if(deps.length&&deps.every(k=>world.researched.has(k)))return {kind:"DEPENDENCIES",ids:sort(deps)};
 return null;
}
function state(w){return {researched:sort(w.researched),disabled:sort(w.disabled),baseFunctions:sort(w.baseFunctions),items:w.items,month:w.month};}
// Convert a produced prefix to a live chronological seed for a downstream
// producer. Re-evaluate every action rather than trusting serialized states.
export function replayEarlyPrefix(data,prefix){
 assert(data.meta.mod.version==="v.o2");
 assert(Array.isArray(prefix.actions)&&prefix.actions.length>1);
 const [init,...actions]=prefix.actions;
 assert.deepEqual(init,{type:"externalInputs",items:{},functions:["SHOP"],funds:0,reason:"Observed campaign start: Inspect Machinery requires SHOP",assumption:true});
 let r=advance(data,foundationWorld(),init);assert(!r.error,r.error);
 let world=r.world;
 const labOrder=[],access=[],trace=[r.trace];
 for(const a of actions){
  if(a.type==="research"){
   const why=earlyLabAccess(world,a.id,data.researchRules,{started:labOrder.length>0});
   assert(why,"Unrooted early lab action "+a.id);
   labOrder.push(a.id);access.push({id:a.id,...why});
  }else assert(a.type==="freeResearch"&&world.pendingFree,"Unexpected early action "+a.type);
  r=advance(data,world,a);assert(!r.error,r.error);world=r.world;trace.push(r.trace);
 }
 assert(!world.pendingFree&&labOrder.length>0);
 assert.equal(prefix.firstRoot,labOrder[0]);assert.deepEqual(prefix.labOrder,labOrder);
 assert.deepEqual(prefix.access,access);assert.deepEqual(prefix.state,state(world));
 return {world,steps:prefix.actions,trace,labOrder,firstRoot:labOrder[0],conditional:true,normalizationComplete:false};
}
function advance(data,w,action){
 const r=applyOriginWitnessStep(w,action,data);
 if(!r.ok)return {error:r.reason};
 return {world:r.world,trace:{action,added:sort([...r.world.researched].filter(k=>!w.researched.has(k))),closed:sort([...r.world.disabled].filter(k=>!w.disabled.has(k))),reopened:sort([...w.disabled].filter(k=>!r.world.disabled.has(k))),notes:r.notes||[],conditional:!!r.assumed}};
}
function finishFree(data,node,failures,depth=0){
 if(!node.world.pendingFree)return [node];
 if(depth>=32){failures.push({actions:node.actions,reason:"FREE_CHAIN_BUDGET"});return [];}
 const t=node.world.pendingFree,choices=t.choices.filter(k=>!node.world.researched.has(k)&&!node.world.disabled.has(k));
 if(!choices.length){failures.push({actions:node.actions,reason:"EMPTY_PENDING_FREE"});return [];}
 const out=[];
 for(const id of t.sequential?choices.slice(0,1):choices){
  const a={type:"freeResearch",source:t.source,research:id,assumeOutcome:!t.sequential&&choices.length>1},r=advance(data,node.world,a);
  if(r.error){failures.push({actions:[...node.actions,a],reason:r.error});continue;}
  out.push(...finishFree(data,{...node,world:r.world,actions:[...node.actions,a],trace:[...node.trace,r.trace]},failures,depth+1));
 }
 return out;
}
export function produceEarlyPrefixes(data,{maxLabDepth=2,maxPrefixes=1000}={}){
 assert(data.meta.mod.version==="v.o2");assert(Number.isSafeInteger(maxLabDepth)&&maxLabDepth>=1&&maxLabDepth<=6);
 assert(Number.isSafeInteger(maxPrefixes)&&maxPrefixes>=4);
 const rules=data.researchRules;
 for(const id of roots)assert(rules[id],"Missing start research "+id);
 // The owner-observed four choices imply SHOP is present for machinery.
 // Represent that as an explicit conditional initial function, not a grant
 // of any research or a claim about other facilities/inventory.
 const init={type:"externalInputs",items:{},functions:["SHOP"],funds:0,reason:"Observed campaign start: Inspect Machinery requires SHOP",assumption:true};
 const i=advance(data,foundationWorld(),init);assert(!i.error,i.error);
 let layer=[{world:i.world,actions:[init],trace:[i.trace],labOrder:[],access:[]}];
 const prefixes=[],failures=[],frontier=[];let truncated=false;
 for(let d=1;d<=maxLabDepth;d++){
  const next=[];
  for(const n of layer){
   const ids=d===1?[...roots]:Object.keys(rules).sort();
   for(const id of ids){
    const access=earlyLabAccess(n.world,id,rules,{started:n.labOrder.length>0});if(!access)continue;
    if(prefixes.length>=maxPrefixes){truncated=true;frontier.push({labOrder:n.labOrder,next:id,reason:"PREFIX_BUDGET"});break;}
    const a={type:"research",id},r=advance(data,n.world,a);
    if(r.error){failures.push({actions:[...n.actions,a],reason:r.error});continue;}
    const base={world:r.world,actions:[...n.actions,a],trace:[...n.trace,r.trace],labOrder:[...n.labOrder,id],access:[...n.access,{id,...access}]};
    for(const q of finishFree(data,base,failures)){
     if(prefixes.length>=maxPrefixes){truncated=true;frontier.push({labOrder:q.labOrder,reason:"PREFIX_BUDGET"});break;}
     next.push(q);prefixes.push({firstRoot:q.labOrder[0],labOrder:q.labOrder,access:q.access,actions:q.actions,trace:q.trace,state:state(q.world),actualGameCertified:false});
    }
   }
   if(truncated)break;
  }
  layer=next;if(truncated)break;
 }
 for(const n of layer)frontier.push({labOrder:n.labOrder,next:Object.keys(rules).sort().filter(id=>earlyLabAccess(n.world,id,rules,{started:true})),reason:"LAB_DEPTH_BOUND"});
 const byRoot=Object.fromEntries([...roots].map(k=>[k,prefixes.filter(p=>p.firstRoot===k).length]));
 return {schema:"ATLAS_ROOTED_EARLY_PREFIXES_V1",sourceMetadataSha256:data.meta.source.metadataSha256,roots:START_RESEARCH,scope:"Conditional lab-only prefix bank; no event, mission, sample procurement or complete campaign claims.",maxLabDepth,maxPrefixes,truncated,byRoot,prefixes,failures,frontier,actualGameCertified:false,normalizationComplete:false};
}
