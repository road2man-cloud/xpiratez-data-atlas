// Forward state-space production, independent of legacy career/prefix actions.
// Every edge is an action selected from the current state, then actually applied.
// This is a bounded model graph, NOT a native campaign or exhaustive tree.
import {createHash} from 'node:crypto';
import {campaignStartWorld,availableResearch,applyCampaignStartStep,START_RESEARCH,labVerdict} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {purchaseVerdict} from '../public/soldiers/modern/campaign-start-reachability-v1.js';
import {facilityRules,facilityMaterials,freeFacilityPosition} from '../public/soldiers/modern/campaign-start-construction-v1.js';
const arr=x=>Array.isArray(x)?x:[];
const canon=x=>x instanceof Set?[...x].sort().map(canon):x instanceof Map?Object.fromEntries([...x.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,v])=>[k,canon(v)])):Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
const diff=(a,b)=>[...a].filter(x=>!b.has(x)).sort();
export function buildCampaignForwardTree(data,snapshot,{maxDepth=5,maxNodes=600,captainEvent=null,resume=null,eventRoutes=[],samplePurchases=false,fixedItems=false,construction=false,manufacturing=false,missions=false,manufactureFocus='all',fixedEventFilter=null,focusNodes=null,priorityResearch=[]}={}){
 if(!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>50||!Number.isSafeInteger(maxNodes)||maxNodes<5||maxNodes>100000)throw Error('invalid-forward-bounds');
 const initial=campaignStartWorld(data,snapshot);
 if(initial.researched.size||initial.disabled.size||initial.pendingFree)throw Error('nonempty-forward-root');
 const nodes=[],worlds=[],edges=[],index=new Map();
 const sampleRules=samplePurchases?Object.entries(data.researchRules).filter(([,r])=>r.needItem&&r.cost>0&&!arr(r.requires).length):[];
 if(!['all','research'].includes(manufactureFocus))throw Error('unknown-manufacture-focus');
 const policy={eventRoutes,samplePurchases,fixedItems,construction,manufacturing,missions,manufactureFocus,fixedEventFilter};
 const sampleTargets=Object.entries(data.researchRules).filter(([,r])=>r.needItem&&r.cost>0&&!arr(r.requires).length);
 const sampleIds=new Set(sampleTargets.map(([id,r])=>r.neededItem||id));
 const recipes=manufacturing?Object.entries(data.campaignAssets?.deterministicManufacture||{}).sort(([a],[b])=>a.localeCompare(b)):[];
 const lootRoutes=missions?Object.entries(data.campaignAssets?.missionLoot||{}).flatMap(([item,routes])=>routes.map(route=>({item,route}))):[];
 // Deduplicate bundle routes: one event pays the entire bundle once.
 const bundles=new Map();
 if(fixedItems)for(const routes of Object.values(data.campaignAssets?.fixedItemEvents||{}))for(const route of routes){
  const key=JSON.stringify([route.event,route.script.script]);
  if((!fixedEventFilter||fixedEventFilter.includes(route.event))&&!bundles.has(key))bundles.set(key,route);
 }
 const buildings=construction?Object.entries(facilityRules(data)).filter(([,r])=>arr(r.provideBaseFunc).length):[];
 const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
 const deltas=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].sort().map(k=>[k,(b?.[k]||0)-(a?.[k]||0)]).filter(([,v])=>v!==0));
 const scope=manufacturing||missions?'BOUNDED_FORWARD_LAB_EVENTS_SUPPLY_CONSTRUCTION_MANUFACTURE_MISSIONS; NO_LEGACY_ACTIONS; NO_NATIVE_CERTIFICATION':fixedItems||construction?'BOUNDED_FORWARD_LAB_EVENTS_SUPPLY_CONSTRUCTION; NO_LEGACY_ACTIONS; NO_NATIVE_CERTIFICATION':eventRoutes.length||samplePurchases?'BOUNDED_FORWARD_LAB_FREE_AWARD_EVENTS_AND_ELIGIBLE_PURCHASES; NO_LEGACY_ACTIONS; NO_NATIVE_CERTIFICATION':'BOUNDED_FORWARD_LAB_FREE_AWARD_AND_OPTIONAL_CAPTAIN_EVENT; NO_LEGACY_ACTIONS; NO_NATIVE_CERTIFICATION';
 function register(world,depth){
  const hash=digest(world);
  if(index.has(hash))return index.get(hash);
  if(nodes.length>=maxNodes)return null;
  const id=nodes.length;
  const menu=availableResearch(world,data);
  const token=world.pendingFree;
  const choices=token?arr(token.choices).filter(k=>data.researchRules[k]&&!world.researched.has(k)&&!world.disabled.has(k)):[];
  const pendingFree=token?{source:token.source,sequential:!!token.sequential,choices}:null;
  nodes.push({id,depth,stateHash:hash,availableResearch:menu,completed:[...world.researched].sort(),disabled:[...world.disabled].sort(),pendingFree,month:world.month,expanded:false,omitted:0,blocked:[]});
  worlds.push(world);index.set(hash,id);return id;
 }
 // Reconstruct each stored state from a previously generated forward edge.
 // Never trust a serialized inventory or inject completion flags.
 const eq=(a,b)=>digest(a)===digest(b);
 const edgeKey=a=>digest(a);
 const processed=new Map();
 const valid=new Set(),blocked=new Set(),firstBranches={};
 if(resume){
  if(resume.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||resume.sourceMetadataSha256!==snapshot.sourceFingerprint||
   resume.difficulty!==snapshot.difficulty||!eq(resume.regions,snapshot.regions??null)||!eq(resume.countries,snapshot.countries??null)||
   !eq(resume.limits?.captainEvent??null,captainEvent)||!eq({eventRoutes:[],samplePurchases:false,fixedItems:false,construction:false,manufacturing:false,missions:false,manufactureFocus:'all',fixedEventFilter:null,...resume.limits?.policy},policy)||maxDepth<resume.limits.maxDepth||maxNodes<resume.nodes.length)
   throw Error('forward-resume-identity-mismatch');
  if(!Array.isArray(resume.nodes)||!Array.isArray(resume.edges)||!resume.nodes.length)throw Error('forward-resume-invalid');
  const parents=new Map();
  for(const e of resume.edges){
   if(!Number.isInteger(e.from)||!Number.isInteger(e.to)||e.from<0||e.to<0||e.from>=resume.nodes.length||e.to>=resume.nodes.length)throw Error('forward-resume-bad-edge');
   if(e.from<e.to&&!parents.has(e.to))parents.set(e.to,e);
   if(!processed.has(e.from))processed.set(e.from,new Set());
   const seen=processed.get(e.from),key=edgeKey(e.action);
   if(seen.has(key))throw Error('forward-resume-duplicate-edge');seen.add(key);
   for(const k of e.added||[])valid.add(k);
   if(e.from===0)firstBranches[e.action.id]=e.to;
  }
  for(const [id,n] of resume.nodes.entries()){
   if(n.id!==id)throw Error('forward-resume-node-order');
   let world=initial;
   if(id){
    const e=parents.get(id);
    if(!e||!worlds[e.from])throw Error('forward-resume-parent-missing:'+id);
    if(['research','repeatResearch'].includes(e.action.type)&&!nodes[e.from].availableResearch.includes(e.action.id))throw Error('forward-resume-illegal-research:'+id);
    const result=applyCampaignStartStep(worlds[e.from],e.action,data);
    if(!result.ok)throw Error('forward-resume-replay:'+id+':'+result.reason);
    world=result.world;
   }
   if(digest(world)!==n.stateHash||!eq(availableResearch(world,data),n.availableResearch)||!eq([...world.researched].sort(),n.completed)||!eq([...world.disabled].sort(),n.disabled))throw Error('forward-resume-state-mismatch:'+id);
   if(index.has(n.stateHash))throw Error('forward-resume-duplicate-state');
   nodes.push(structuredClone(n));worlds.push(world);index.set(n.stateHash,id);
   const seen=processed.get(id)||new Set();
   for(const b of n.blocked||[]){seen.add(edgeKey(b.action));blocked.add(b.action.id||b.action.research);}
   processed.set(id,seen);
  }
  edges.push(...structuredClone(resume.edges));
 }else register(initial,0);
 if(JSON.stringify(nodes[0].availableResearch)!==JSON.stringify(Object.keys(START_RESEARCH).sort()))throw Error('forward-root-menu-mismatch');
 const previousStates=nodes.length,previousEdges=edges.length;
 // A focused continuation is a scheduling policy, not a different ruleset.
 // Existing graph and unvisited frontier are retained; no state injection.
 if(focusNodes!==null&&(!resume||!Array.isArray(focusNodes)||!focusNodes.length||focusNodes.some(id=>!Number.isSafeInteger(id)||id<0||id>=previousStates)))throw Error('invalid-forward-focus-nodes');
 if(!Array.isArray(priorityResearch)||priorityResearch.some(id=>!data.researchRules[id]))throw Error('invalid-forward-priority-research');
 const priority=new Set(priorityResearch);
 const queue=focusNodes===null?null:[...new Set(focusNodes)];
 const queued=new Set(queue||[]);
 const oldOutgoing=new Map();
 if(queue)for(const e of edges){if(!oldOutgoing.has(e.from))oldOutgoing.set(e.from,[]);oldOutgoing.get(e.from).push(e.to);}
 const schedule=id=>{if(queue&&!queued.has(id)){queued.add(id);queue.push(id);}};
 let visitedThisRun=0;
 for(let cursor=0;cursor<(queue?queue.length:nodes.length);cursor++){
  const i=queue?queue[cursor]:cursor;
  visitedThisRun++;
  const n=nodes[i],w=worlds[i],pending=n.pendingFree;
  let actions=pending?(pending.sequential?pending.choices.slice(0,1):pending.choices).map(research=>({type:'freeResearch',source:pending.source,research,assumeOutcome:!pending.sequential&&pending.choices.length>1})):
   n.availableResearch.map(id=>w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id});
  // The first event is an explicitly conditional separate action, not a lab
  // topic. Its native scheduling is not modeled. Never grant it at the root.
  if(!pending&&i!==0&&captainEvent&&!w.researched.has(captainEvent.research)&&!w.generatedEvents?.[captainEvent.event])
   actions.push({type:'eventResearch',event:captainEvent.event,script:captainEvent.script,research:captainEvent.research,assumeOutcome:true});
  if(!pending&&i!==0){
   for(const route of eventRoutes){
    if(w.researched.has(route.research)||w.disabled.has(route.research)||w.generatedEvents?.[route.event])continue;
    const triggerItems={...w.otherItems};
    for(const [k,v] of Object.entries(w.items))triggerItems[k]=(triggerItems[k]||0)+v;
    const v=eventScriptVerdict({...route.script,eventId:route.event},{...w,triggerItems,triggerFacilities:w.globalFacilities},{mode:'current'});
    if(v.blocked.length||v.unknown.length)continue;
    const action={type:'eventResearch',event:route.event,script:route.script.script,research:route.research,assumeOutcome:true};
    if(!actions.some(a=>edgeKey(a)===edgeKey(action)))actions.push(action);
   }
   if(fixedItems)for(const route of bundles.values()){
    if(w.generatedEvents?.[route.event])continue;
    const triggerItems={...w.otherItems};
    for(const [k,v] of Object.entries(w.items))triggerItems[k]=(triggerItems[k]||0)+v;
    const v=eventScriptVerdict({...route.script,eventId:route.event},{...w,triggerItems,triggerFacilities:w.globalFacilities},{mode:'current'});
    if(v.blocked.length||v.unknown.length)continue;
    const item=Object.keys(route.items).sort()[0];
    actions.push({type:'acquireEventItems',event:route.event,script:route.script.script,item,count:route.items[item],assumeOutcome:true});
   }
   if(construction){
    for(const f of w.baseLayout||[])if(!f.complete)actions.push({type:'finishFacility',id:f.id,x:f.x,y:f.y,waitDays:Math.max(0,f.readyDay-w.elapsedBuildDays)});
    for(const [id,r] of buildings){
     if(!arr(r.provideBaseFunc).some(k=>!w.baseFunctions.has(k))||w.baseLayout?.some(f=>f.id===id))continue;
     if(!arr(r.requires).every(k=>active(w,k))||arr(r.requires).includes('STR_UNAVAILABLE')||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
     if(!Number.isSafeInteger(r.buildCost)||r.buildCost<0||w.funds<r.buildCost)continue;
     if(arr(r.forbiddenBaseFunc).some(k=>w.baseFunctions.has(k))||[...w.facilities].some(f=>arr(facilityRules(data)[f]?.forbiddenBaseFunc).some(k=>arr(r.provideBaseFunc).includes(k))))continue;
     if(Object.entries(facilityMaterials(r)).some(([k,v])=>(w.items[k]||0)<v))continue;
     const pos=freeFacilityPosition(w,id,data);
     if(pos)actions.push({type:'buildFacility',id,...pos});
    }
   }
   // The full deterministic raw recipe is applied atomically. One batch per
   // recipe is a declared finite exploration bound, not an engine restriction.
   if(manufacturing)for(const [recipe,r] of recipes){
    if(w.forwardManufactureCounts?.[recipe]||!r.requires.every(k=>active(w,k))||!r.functions.every(k=>w.baseFunctions.has(k))||w.funds<r.cost)continue;
    if(Object.entries(r.materials).some(([k,v])=>(w.items[k]||0)<v))continue;
    if(manufactureFocus==='research'&&!Object.keys(r.outputs).some(item=>sampleIds.has(item)&&!(w.items[item]>0)))continue;
    actions.push({type:'manufactureBundle',recipe,count:1});
   }
   if(missions)for(const {item,route} of lootRoutes){
    if(w.completedMissions?.has(route.deployment)||w.disabled.has(route.research)||w.researched.has(route.research))continue;
    if(!route.craftResearch.every(k=>active(w,k)))continue;
    const v=eventScriptVerdict({...route.script,mode:'fixed',eventId:'MISSION:'+route.deployment},w,{mode:'current'});
    if(v.blocked.length||v.unknown.length)continue;
    actions.push({type:'missionResearch',deployment:route.deployment,script:route.script.script,research:route.research,assumeOutcome:true,recoverFixedItem:{item,count:route.count,terrain:route.terrain,block:route.block,craft:route.craft,assumeTransport:true,assumeRecovery:true}});
   }
   // Only acquire a missing sample if it would immediately enable an otherwise
   // legal project and the source-backed purchase gate already passes.
   const wanted=new Set();
   for(const [id,r] of sampleRules){
    const item=r.neededItem||id;
    if(wanted.has(item)||w.researched.has(id)||w.disabled.has(id)||(w.items[item]||0)>0)continue;
    if(arr(r.requiresBaseFunc).some(k=>!w.baseFunctions.has(k)))continue;
    const hypothetical={...w,items:{...w.items,[item]:1}};
    if(!labVerdict(hypothetical,id,data).ok)continue;
    try{purchaseVerdict(w,item,1,data);}catch{continue;}
    wanted.add(item);
    actions.push({type:'acquirePurchase',item,count:1});
   }
  }
  const seen=processed.get(i)||new Set();
  const remaining=actions.filter(a=>!seen.has(edgeKey(a)));
  if(priority.size)remaining.sort((a,b)=>Number(priority.has(b.id||b.research))-Number(priority.has(a.id||a.research)));
  n.candidateCount=actions.length;
  n.omitted=0;
  if(n.depth>=maxDepth){n.frontierReason=remaining.length?'depth-bound':null;n.omitted=remaining.length;n.expanded=!remaining.length;continue;}
  if(queue)for(const id of oldOutgoing.get(i)||[])schedule(id);
  for(const action of remaining){
   const result=applyCampaignStartStep(w,action,data);
   if(!result.ok){n.blocked.push({action,reason:result.reason});blocked.add(action.id||action.research);continue;}
   const j=register(result.world,n.depth+1);
   if(j===null){n.omitted++;continue;}
   schedule(j);
   const next=nodes[j],after=result.world;
   const e={from:i,to:j,action,added:diff(after.researched,w.researched),newlyAvailable:diff(new Set(next.availableResearch),new Set(n.availableResearch)),noLongerAvailable:diff(new Set(n.availableResearch),new Set(next.availableResearch)),newlyDisabled:diff(after.disabled,w.disabled),reopened:diff(w.disabled,after.disabled),conditional:!!result.assumed||action.type==='eventResearch',itemDelta:deltas(w.items,after.items),addedFunctions:diff(after.baseFunctions,w.baseFunctions),fundsDelta:after.funds-w.funds,buildDaysDelta:(after.elapsedBuildDays||0)-(w.elapsedBuildDays||0),manufactureHoursDelta:(after.forwardManufactureHours||0)-(w.forwardManufactureHours||0),notes:result.notes||[]};
   edges.push(e);
   if(i===0)firstBranches[action.id]=j;
   for(const id of e.added)valid.add(id);
  }
  n.expanded=n.omitted===0;n.frontierReason=n.omitted?'node-bound':null;
 }
 const incomplete=nodes.filter(n=>!n.expanded).length;
 return {schema:'ATLAS_CAMPAIGN_FORWARD_TREE_V1',scope,
  difficulty:snapshot.difficulty,regions:snapshot.regions??null,countries:snapshot.countries??null,sourceMetadataSha256:snapshot.sourceFingerprint,
  limits:{maxDepth,maxNodes,depthUnit:'actions',captainEvent:captainEvent??null,policy},
  excluded:[samplePurchases?'non-purchase sample acquisition and purchase cost/delivery':'physical sample acquisition beyond starting inventory and research grants',construction?'alternative facility placements, replacements, funding and full calendar':'facility construction',fixedItems?'events outside selected fixed bundles and research routes':'events outside selected routes',missions?'missions outside indexed fixed loot; tactical victory, transport and recovery':'mission rewards',manufacturing?'repeat batches, special/random recipes and manufacturing workforce/calendar':'manufacturing','native research duration and event scheduler','economy and full base simulation',...(manufactureFocus==='research'?['manufacturing without a currently missing research sample; intermediate material chains not exhaustive']:[]),...(fixedEventFilter?['fixed events outside selected filter']:[])],
  initialMenu:nodes[0].availableResearch,firstBranches,nodes,edges,
  continuation:resume?{previousStates,previousEdges,newStates:nodes.length-previousStates,newEdges:edges.length-previousEdges,previousGraphHash:digest(resume),focusNodes,priorityResearch,visitedThisRun,deferredPreviousStates:queue?previousStates-[...queued].filter(id=>id<previousStates).length:0}:null,
  summary:{manufactureResearchUnlockEdges:edges.filter(e=>e.action.type==='manufactureBundle'&&e.newlyAvailable.length).length,indexedDeterministicRecipes:recipes.length,indexedMissionLootRoutes:lootRoutes.length,actionTypes:edges.reduce((a,e)=>(a[e.action.type]=(a[e.action.type]||0)+1,a),{}),states:nodes.length,edges:edges.length,initialBranches:Object.keys(firstBranches).length,distinctCompletedResearch:valid.size,researchIds:[...valid].sort(),expandedStates:nodes.length-incomplete,frontierStates:incomplete,omittedActions:nodes.reduce((s,n)=>s+n.omitted,0),rejectedActions:nodes.reduce((s,n)=>s+n.blocked.length,0),rejectedTopics:[...blocked].filter(Boolean).sort(),maxReachedDepth:Math.max(...nodes.map(n=>n.depth)),gameCertified:0,exhaustive:false}};
}
