// Forward-only campaign research state graph. No legacy career action input.
// Every edge is generated from the current world and applied by the shared
// chronological verifier, or by a narrowly scoped source-bound ordinary
// effort action. Unexpanded states and unsupported sources stay OPEN.
import assert from "node:assert/strict";
import {START_RESEARCH} from "./atlas-overcap-rooted-early-research.mjs";
import {foundationWorld,applyOriginWitnessStep} from "../public/soldiers/modern/origin-witness.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
import {createForwardSupply} from "./atlas-overcap-forward-supply-v2.mjs";
import {assertForwardPurchaseGate} from "./atlas-overcap-forward-purchase-gate-v3.mjs";
export const SCHEMA="ATLAS_FORWARD_CAMPAIGN_RESEARCH_V3";
const roots=Object.values(START_RESEARCH),rootSet=new Set(roots);
const arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort(),qty=(w,id)=>Number(w.items[id]||0);
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const all=(w,ids)=>arr(ids).every(id=>active(w,id));
const hasFunctions=(w,ids)=>arr(ids).every(id=>w.baseFunctions.has(id));

export function createForwardResearch(data,{maxMonth=3}={}){
 assert.equal(data.meta.mod.version,"v.o2");
 const rules=data.researchRules,supply=createForwardSupply(data),initial=data.forwardStartingBase,junk=data.forwardJunk;
 assert.equal(initial.schema,"ATLAS_FORWARD_STARTING_BASE_V3");assert.equal(junk.schema,"ATLAS_FORWARD_JUNK_EXTRACTION_V3");
 assert.equal(initial.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(junk.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.deepEqual(initial.ruleFiles,Object.fromEntries(data.meta.source.rules.map(r=>[r.file,r.sha256])));
 assert.deepEqual(junk.ruleFiles,initial.ruleFiles);
 const recipe=junk.recipe;
 const init={type:"sourceStartingBase",source:initial.source,facilities:initial.facilities,items:initial.items,functions:initial.baseFunctions,crafts:initial.crafts,scientists:initial.scientists,engineers:initial.engineers,randomSoldiers:initial.randomSoldiers,assumption:false};
 const junkReady=w=>!w.pendingFree&&all(w,recipe.requires)&&hasFunctions(w,recipe.functions)&&Object.entries(recipe.inputs).every(([id,n])=>qty(w,id)>=n);
 function junkOptions(w){
  if(!junkReady(w))return [];
  return recipe.outcomes.map((o,index)=>({action:{type:"sourceRandomManufacture",id:recipe.id,outcome:index,assumeOutcome:true},evidence:{kind:"SOURCE_WEIGHTED_MANUFACTURE_OUTCOME",requires:recipe.requires,functions:recipe.functions,inputs:recipe.inputs,fixed:recipe.fixed,random:o.items,weight:o.weight,totalWeight:recipe.totalWeight,time:recipe.time,cost:recipe.cost,space:recipe.space}}));
 }
 for(const id of roots)assert(rules[id]&&rules[id].cost>0);
 const labs=Object.entries(rules).filter(([,r])=>r.cost>0&&!arr(r.requires).length);

 // Native OXCE GeoscapeState.cpp 3381-3397: direct completed lab
 // projects queue spawnedItem and spawnedItemList in a one-hour transfer.
 // Do not award these for lookup, free, event or auto-zero flags.
 const labGrants=new Map();
 for(const [item,s] of Object.entries(data.itemSupply||{}))if(s.exists)for(const g of arr(s.researchGrants)){
  if(!rules[g.research]||!Number.isSafeInteger(g.count)||g.count<=0)continue;
  if(!labGrants.has(g.research))labGrants.set(g.research,[]);
  labGrants.get(g.research).push({item,count:g.count});
 }
 const unlockBy=new Map();
 for(const [src,r] of Object.entries(rules))for(const id of arr(r.unlocks)){if(!unlockBy.has(id))unlockBy.set(id,[]);unlockBy.get(id).push(src);}
 const events=[];
 for(const [research,sources] of Object.entries(data.eventResearchSources||{}))for(const e of arr(sources))for(const s of arr(e.scripts))events.push({research,event:e.event,script:s,action:{type:"eventResearch",research,event:e.event,script:s.script,assumeOutcome:true}});
 const missions=[];
 for(const [research,sources] of Object.entries(data.missionResearchSources||{}))for(const m of arr(sources))if(m.reward==="mission-success")for(const s of arr(m.scripts))missions.push({research,event:"MISSION:"+m.deployment,script:{...s,mode:"fixed"},action:{type:"missionResearch",research,deployment:m.deployment,script:s.script,assumeOutcome:true}});
 function labAccess(w,id,started){
  const r=rules[id];if(!r||!(r.cost>0)||arr(r.requires).length||w.pendingFree||w.disabled.has(id)||w.researched.has(id))return null;
  if(!started&&!rootSet.has(id))return null;
  const by=arr(unlockBy.get(id)).filter(src=>w.researched.has(src));
  const deps=arr(r.dependencies);
  if(!by.length&&!deps.every(k=>w.researched.has(k)))return null;
  if(!hasFunctions(w,r.requiresBaseFunc)||r.needItem&&!qty(w,r.neededItem||id))return null;
  if(rootSet.has(id))return {kind:"START_CHOICE",requires:[]};
  if(by.length)return {kind:"EXPLICIT_UNLOCK",requires:sort(by)};
  if(deps.length)return {kind:"DEPENDENCIES",requires:sort(deps)};
  if(r.needItem)return {kind:"SOURCE_BACKED_SAMPLE",item:r.neededItem||id};
  return null;
 }
 function freeOptions(w){
  const t=w.pendingFree;
  const choices=t.choices.filter(id=>!w.researched.has(id)&&!w.disabled.has(id));
  return (t.sequential?choices.slice(0,1):choices).map(research=>({action:{type:"freeResearch",source:t.source,research,assumeOutcome:!t.sequential&&choices.length>1},evidence:{kind:"PENDING_FREE",source:t.source,choices,phase:t.phase}}));
 }
 function judgment(w,e){
  // Do not treat unobserved geography, all-base stock, score, counters, etc.
  // as satisfied merely because the legacy verifier accepts an assumption.
  const mission=e.action.type==="missionResearch";
  const triggerItems=w.otherItems==null?null:{...w.otherItems};
  if(triggerItems)for(const [id,n] of Object.entries(w.items))triggerItems[id]=Number(triggerItems[id]||0)+n;
  const v=eventScriptVerdict({...e.script,eventId:e.event},{...w,triggerItems,triggerFacilities:w.globalFacilities??null},{mode:"current"});
  const unknown=v.unknown.length||v.pending.some(x=>x.includes("카운터"));
  return {v,eligible:v.kind!=="blocked"&&!unknown};
 }
 function grantOptions(w,month,unresolved){
  const out=[];
  for(const e of [...events,...missions]){
   if(w.researched.has(e.research)||w.disabled.has(e.research)||e.action.type==="missionResearch"&&w.completedMissions?.has(e.action.deployment))continue;
   if(!all(w,e.script.researchPositive)||arr(e.script.researchNegative).some(id=>active(w,id)))continue;
   if(e.script.firstMonth>month||e.script.lastMonth!=null&&e.script.lastMonth>=0&&month>e.script.lastMonth)continue;
   const {v,eligible}=judgment(w,e);
   if(e.action.type==="eventResearch"&&!supply.eventAllowed(w,e)){
    if(eligible)unresolved.push({kind:"EVENT_REWARD_OR_REPEAT_UNMODELED",research:e.research,source:e.event,script:e.script.script});continue;
   }
   if(eligible)out.push({action:e.action,evidence:{kind:e.action.type==="missionResearch"?"MISSION_VICTORY_CONDITIONAL":"EVENT_OUTCOME_CONDITIONAL",source:e.event,script:e.script.script,requires:arr(e.script.researchPositive),forbids:arr(e.script.researchNegative),pending:v.pending}});
   else if(v.unknown.length||v.pending.some(x=>x.includes("카운터")))unresolved.push({kind:"UNKNOWN_EVENT_CONTEXT",research:e.research,source:e.event,script:e.script.script,unknown:[...v.unknown,...v.pending.filter(x=>x.includes("카운터"))]});
  }
  return out;
 }
 function options(w,firstRoot){
  if(w.pendingFree)return {choices:freeOptions(w),unresolved:[]};
  const choices=[],unresolved=[],started=!!firstRoot;
  // Complete pending deliveries before the next modeled action. This is an
  // explicit wait scenario, not an assertion that other timing orders fail.
  const g=arr(w.forwardDeliveries)[0];
  if(g){return {choices:[{action:{type:"sourceResearchDelivery",index:0,source:g.source,item:g.item,count:g.count,assumption:true},evidence:{kind:g.kind==="event"?"FIXED_EVENT_ITEM_TRANSFER":g.kind==="purchase"?"PURCHASE_ITEM_TRANSFER":"DIRECT_LAB_SPAWNED_ITEM_TRANSFER",source:g.source,item:g.item,count:g.count,transferHours:g.kind==="purchase"?null:1}}],unresolved:[]};}
  for(const [id,r] of started?labs:roots.map(id=>[id,rules[id]])){
   const e=labAccess(w,id,started);
   if(e)choices.push({action:{type:"research",id},evidence:e});
   else if(started&&!w.researched.has(id)&&!w.disabled.has(id)&&r.needItem&&!qty(w,r.neededItem||id)&&all(w,r.dependencies)&&hasFunctions(w,r.requiresBaseFunc)){
    const s=data.itemSupply?.[r.neededItem||id];
    if(s)unresolved.push({kind:"SAMPLE_SOURCE_REQUIRED",research:id,item:r.neededItem||id,sourceCounts:{research:arr(s.researchGrants).length,events:arr(s.eventGrants).length,manufacture:arr(s.manufacture).length,mapLoot:s.mapLoot?.sourceCount||0,purchase:s.buyCost>0}});
   }
  }
  if(!started)return {choices,unresolved};
  choices.push(...supply.options(w,firstRoot).filter(x=>{try{assertForwardPurchaseGate(w,x.action,data);return true;}catch{return false;}}),...junkOptions(w));
  // Repeat research only if an actual outstanding free reward exists. The
  // shared replay rejects repeats with unmodeled protected/lookup effects.
  for(const id of w.researched){
   const r=rules[id];if(!r||w.disabled.has(id)||!(r.cost>0)||arr(r.requires).length||!hasFunctions(w,r.requiresBaseFunc)||r.needItem&&!qty(w,r.neededItem||id))continue;
   const targets=[...arr(r.getOneFree),...Object.entries(r.getOneFreeProtected||{}).filter(([k])=>w.researched.has(k)).flatMap(([,v])=>arr(v))].filter(k=>!w.researched.has(k)&&!w.disabled.has(k));
   if(targets.length)choices.push({action:{type:"repeatResearch",id,assumeAvailability:true},evidence:{kind:"REMAINING_FREE_REWARD",targets}});
  }
  choices.push(...grantOptions(w,w.month,unresolved));
  const months=[...events,...missions].filter(e=>!w.researched.has(e.research)&&!w.disabled.has(e.research)&&all(w,e.script.researchPositive)&&!arr(e.script.researchNegative).some(id=>active(w,id))).map(e=>Number(e.script.firstMonth)).filter(m=>Number.isInteger(m)&&m>w.month&&m<=maxMonth);
  months.push(...supply.futureMonths(w,maxMonth));
  if(months.length){const month=Math.min(...months);choices.push({action:{type:"advanceMonth",month},evidence:{kind:"NEXT_INDEXED_EVENT_WINDOW",month}});}
  return {choices,unresolved};
 }
 function apply(w,action,firstRoot){
  // Re-derive and check each custom action at its actual predecessor.
  if(action.type==="sourceResearchDelivery"){
   const g=w.forwardDeliveries?.[action.index];assert(firstRoot&&action.assumption&&!w.pendingFree&&g&&g.source===action.source&&g.item===action.item&&g.count===action.count);
   const next=structuredClone(w);next.forwardDeliveries.splice(action.index,1);next.items[g.item]=qty(next,g.item)+g.count;
   return {world:next,notes:[g.kind==="event"?"Fixed event reward delivered; delivery timing conditional.":g.kind==="purchase"?"Source-backed purchase delivered; delivery timing conditional.":"OXCE direct lab spawned item; one-hour transfer completion assumed."],conditional:true};
  }
  if(action.type==="sourceRandomManufacture"){
   assert(firstRoot&&action.id===recipe.id&&action.assumeOutcome&&junkReady(w),"Random manufacture input or research missing");
   const o=recipe.outcomes[action.outcome];assert(o&&o.weight>0);
   const next=structuredClone(w);for(const [id,n] of Object.entries(recipe.inputs))next.items[id]=qty(next,id)-n;
   for(const output of [recipe.fixed,o.items])for(const [id,n] of Object.entries(output))next.items[id]=qty(next,id)+n;
   return {world:next,notes:["Exact source recipe inputs consumed; fixed outputs plus one weighted RNG outcome. Labor/time and RNG conditional."],conditional:true};
  }
  assertForwardPurchaseGate(w,action,data);
  const supplied=supply.apply(w,action,firstRoot);if(supplied){
   if(action.type==="sourceBuildFacility")supplied.world.globalFacilities=new Set(supplied.world.facilities);
   return supplied;
  }
  if(action.type==="research")assert(labAccess(w,action.id,!!firstRoot),"NOT_CURRENTLY_AVAILABLE_LAB");
  if(action.type==="eventResearch"||action.type==="missionResearch"){
   const e=(action.type==="eventResearch"?events:missions).find(e=>key(e.action)===key(action));
   assert(firstRoot&&e&&judgment(w,e).eligible&&(action.type!=="eventResearch"||supply.eventAllowed(w,e)),"EVENT_CONTEXT_OR_REWARD_NOT_ESTABLISHED");
  }
  const r=applyOriginWitnessStep(w,action,data);if(!r.ok)throw Error(r.reason);
  const next=r.world;
  if(action.type==="eventResearch")supply.eventEffects(next,supply.catalog.events[action.event]);
  let completedLab=null;
  if(action.type==="research"||action.type==="repeatResearch"){
   if(next.pendingFree?.phase==="before-source")next.forwardPendingLab=action.id;
   else completedLab=action.id;
  }else if(action.type==="freeResearch"&&w.forwardPendingLab&&!next.pendingFree){
   completedLab=w.forwardPendingLab;delete next.forwardPendingLab;
  }
  // Source-closed lab projects are deliberately left unresolved rather than
  // inferring an item reward from a failed completion flag.
  if(completedLab&&next.researched.has(completedLab)&&!next.disabled.has(completedLab)&&labGrants.has(completedLab)){
   next.forwardDeliveries=[...arr(next.forwardDeliveries),...labGrants.get(completedLab).map(g=>({source:completedLab,...g}))];
  }
  return {world:next,notes:r.notes||[],conditional:!!r.assumed};
 }
 function start(){
  const w=foundationWorld(),functions=new Set();
  for(const f of initial.facilities){w.facilities.add(f.id);const r=data.baseFacilityFunctions[f.id];assert(r);for(const k of r.provides)functions.add(k);}
  assert.deepEqual(sort(functions),initial.baseFunctions);w.baseFunctions=new Set(initial.baseFunctions);
  w.items={...initial.items};w.globalFacilities=new Set(w.facilities);
  // OXCE SavedGame::isItemObtained checks storage AND craft cargo.
  // Cargo contributes to event trigger presence, not laboratory stock.
  w.otherItems={};for(const c of initial.crafts)for(const [id,n] of Object.entries(c.items))w.otherItems[id]=Number(w.otherItems[id]||0)+n;
  w.forwardInitialSource=initial.source.sectionSha256;
  return w;
 }
 return {start,options,apply,init};
}
// Downstream research/career workers consume a concrete ordered witness,
// not a flattened set of researched topics. The node's parent chain and
// each edge's actual predecessor are rechecked from campaign start.
export function replayForwardNode(data,graph,nodeId){
 assert.equal(graph.schema,SCHEMA);
 assert.deepEqual(graph.roots,START_RESEARCH);
 assert.equal(graph.sourceMetadataSha256,data.meta.source.metadataSha256);
 const engine=createForwardResearch(data,{maxMonth:graph.budget.maxMonth});
 const stack=[],visited=new Set();let cursor=graph.nodes[nodeId];
 assert(cursor&&cursor.id===nodeId,"Unknown forward node");
 while(cursor.parent!==null){
  assert(!visited.has(cursor.id),"Cyclic parent chain");visited.add(cursor.id);
  const e=graph.edges[cursor.parent];assert(e&&e.to===cursor.id&&e.id===cursor.parent);
  stack.push(e);cursor=graph.nodes[e.from];assert(cursor&&cursor.id===e.from);
 }
 assert.equal(cursor.id,0);
 let world=engine.start(),firstRoot=null;
 assert.equal(exactStateHash(world),cursor.stateHash);
 const actions=[engine.init],evidence=[];
 for(const e of stack.reverse()){
  const option=engine.options(world,firstRoot).choices.find(x=>key(x.action)===key(e.action)&&key(x.evidence)===key(e.evidence));
  assert(option,"Forward edge no longer available "+e.id);
  const r=engine.apply(world,e.action,firstRoot);
  firstRoot=firstRoot||e.action.id;
  world=r.world;actions.push(e.action);evidence.push(e.evidence);
  assert.equal(exactStateHash(world),graph.nodes[e.to].stateHash,"Forward state mismatch "+e.to);
  assert.equal(firstRoot,graph.nodes[e.to].firstRoot);
 }
 return {world,actions,evidence,firstRoot,nodeId,stateHash:exactStateHash(world),next:engine.options(world,firstRoot),normalizationComplete:false,actualGameCertified:false};
}
export function produceForwardGraph(data,{maxExpanded=80,maxNodes=5000,maxMonth=3,prior=null}={}){
 const engine=createForwardResearch(data,{maxMonth}),initial=engine.start(),nodes=prior?.nodes||[],edges=prior?.edges||[],worlds=[],seen=new Map(),queues=new Map(roots.map(id=>[id,[]])),expandedByRoot=Object.fromEntries(roots.map(id=>[id,0])),topicsByRoot=new Map(roots.map(id=>[id,new Set()])),failed=prior?.failed||[],unsupported=prior?.unsupported||{};
 const signature=(w,root)=>key([root,exactStateHash(w)]);
 let expanded=0;
 if(prior){
  assert.equal(prior.schema,SCHEMA);assert.deepEqual(prior.roots,START_RESEARCH);assert.equal(prior.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(prior.budget.maxMonth,maxMonth);
  assert.equal(nodes[0]?.stateHash,exactStateHash(initial));assert.equal(nodes[0].parent,null);
  assert.equal(prior.summary.nodes,nodes.length);assert.equal(prior.summary.edges,edges.length);
  worlds[0]=initial;
  for(const [i,n] of nodes.entries()){
   assert.equal(n.id,i);const sig=key([n.firstRoot,n.stateHash]);assert(!seen.has(sig));seen.set(sig,i);
   if(i){const e=edges[n.parent];assert(e&&e.to===i&&e.from<i&&rootSet.has(n.firstRoot));}
   if(n.status==="OPEN_UNEXPANDED"){assert(n.firstRoot);queues.get(n.firstRoot).push(i);}
   else{assert(["EXPANDED","OPEN_NO_SUPPORTED_SUCCESSOR"].includes(n.status));expanded++;if(n.firstRoot){expandedByRoot[n.firstRoot]++;for(const k of n.researched)topicsByRoot.get(n.firstRoot).add(k);}}
  }
  assert.equal(expanded,prior.summary.expanded);
  assert(maxExpanded>expanded,"Resume requires a larger total --expand budget");
 }
 // Lazy reconstruction: load only the parent chains of newly expanded nodes.
 // The CLI binds the entire prior artifact and the producer/engine fingerprints.
 function worldAt(id){
  if(worlds[id])return worlds[id];
  const n=nodes[id],e=edges[n.parent],before=worldAt(e.from);
  const r=engine.apply(before,e.action,nodes[e.from].firstRoot);
  assert.equal(exactStateHash(r.world),n.stateHash,"Resume world mismatch "+id);
  worlds[id]=r.world;return r.world;
 }
 function insert(w,root,parent,depth,researchDepth){
  const hash=signature(w,root);if(seen.has(hash))return seen.get(hash);
  const id=nodes.length,n={id,firstRoot:root,parent,depth,researchDepth,stateHash:exactStateHash(w),researched:sort(w.researched),disabled:sort(w.disabled),items:w.items,baseFunctions:sort(w.baseFunctions),facilities:sort(w.facilities),month:w.month,pendingFree:w.pendingFree||null,pendingDeliveries:arr(w.forwardDeliveries),status:"OPEN_UNEXPANDED"};
  nodes.push(n);worlds[id]=w;seen.set(hash,id);if(root)queues.get(root).push(id);return id;
 }
 if(!prior)insert(initial,null,null,0,0);
 function expand(id){
  const n=nodes[id],w=worldAt(id),{choices,unresolved}=engine.options(w,n.firstRoot);
  n.unresolved=unresolved;
  for(const u of unresolved)unsupported[u.kind]=(unsupported[u.kind]||0)+1;
  let successful=0;
  for(const {action,evidence} of choices){
   try{
    const r=engine.apply(w,action,n.firstRoot),next=r.world,root=n.firstRoot||action.id;
    assert(rootSet.has(root));
    const added=sort([...next.researched].filter(x=>!w.researched.has(x))),closed=sort([...next.disabled].filter(x=>!w.disabled.has(x))),reopened=sort([...w.disabled].filter(x=>!next.disabled.has(x)));
    const edgeId=edges.length,to=insert(next,root,edgeId,n.depth+1,n.researchDepth+Number(action.type==="research"||action.type==="repeatResearch"));
    edges.push({id:edgeId,from:id,to,action,evidence,added,closed,reopened,notes:r.notes,conditional:r.conditional});successful++;
   }catch(e){failed.push({from:id,action,reason:e.message||String(e)});}
  }
  n.status=successful?"EXPANDED":"OPEN_NO_SUPPORTED_SUCCESSOR";
  n.outgoing=successful;n.rejected=choices.length-successful;
  if(n.firstRoot){expandedByRoot[n.firstRoot]++;for(const k of n.researched)topicsByRoot.get(n.firstRoot).add(k);}
 }
 if(!prior){expand(0);expanded=1;}
 // Alternate roots. Prioritize deeper lab paths while retaining every
 // generated successor. A bounded scheduler, not an exhaustive closure.
 while(expanded<maxExpanded&&nodes.length<maxNodes){
  let progressed=false;
  for(const root of roots){
   if(expanded>=maxExpanded||nodes.length>=maxNodes)break;
   const q=queues.get(root);if(!q.length)continue;
   const topics=topicsByRoot.get(root);
   let best=0,score=-Infinity;
   const lane=expandedByRoot[root]%5;
   for(let j=0;j<q.length;j++){
    const n=nodes[q[j]],novel=n.researched.reduce((s,k)=>s+Number(!topics.has(k)),0);
    const last=n.parent==null?null:edges[n.parent]?.action.type;
    const resource=Number(["sourceResearchDelivery","sourceBuySample","sourceBuildFacility","sourceManufactureItem","sourceEventItems"].includes(last));
    const stocked=Object.values(n.items).filter(x=>x>0).length,waiting=Number(!!n.pendingFree||!!n.pendingDeliveries.length);
    const v=lane===3?novel*100+n.researchDepth*5+waiting*30:
     lane===4?resource*1200+n.researchDepth*50+novel*5+Math.min(stocked,30)*5+waiting*90:
     n.researchDepth*100+waiting*50+Math.min(novel,20)*5+Math.min(stocked,30)*2+n.researched.length/100;
    if(v>score){score=v;best=j;}
   }
   const [id]=q.splice(best,1);expand(id);expanded++;progressed=true;
  }
  if(!progressed)break;
 }
 const byRoot=Object.fromEntries(roots.map(root=>[root,{states:nodes.filter(n=>n.firstRoot===root).length,expanded:expandedByRoot[root],open:queues.get(root).length,maxLabDepth:Math.max(0,...nodes.filter(n=>n.firstRoot===root).map(n=>n.researchDepth)),distinctResearch:new Set(nodes.filter(n=>n.firstRoot===root).flatMap(n=>n.researched)).size}]));
 const byAction={};for(const e of edges)byAction[e.action.type]=(byAction[e.action.type]||0)+1;
 return {schema:SCHEMA,sourceMetadataSha256:data.meta.source.metadataSha256,roots:START_RESEARCH,initialAction:engine.init,scope:"V3 source-matched starting base and weighted junk extraction, with source-backed conditional supplies. No legacy action input. Event repetition, additional random sources, exact timing/economy and actual game remain uncertified.",budget:{maxExpanded,maxNodes,maxMonth},nodes,edges,failed,unsupported,summary:{nodes:nodes.length,edges:edges.length,expanded,openUnexpanded:nodes.filter(n=>n.status==="OPEN_UNEXPANDED").length,openNoSupportedSuccessor:nodes.filter(n=>n.status==="OPEN_NO_SUPPORTED_SUCCESSOR").length,distinctResearch:new Set(nodes.flatMap(n=>n.researched)).size,byRoot,byAction,failed:failed.length},normalizationComplete:false,actualGameCertified:false};
}
