// Forward state-space production, independent of legacy career/prefix actions.
// Every edge is an action selected from the current state, then actually applied.
// This is a bounded model graph, NOT a native campaign or exhaustive tree.
import {createHash} from 'node:crypto';
import {campaignStartWorld,availableResearch,applyCampaignStartStep,START_RESEARCH} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const arr=x=>Array.isArray(x)?x:[];
const canon=x=>x instanceof Set?[...x].sort().map(canon):x instanceof Map?Object.fromEntries([...x.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,v])=>[k,canon(v)])):Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
const diff=(a,b)=>[...a].filter(x=>!b.has(x)).sort();
export function buildCampaignForwardTree(data,snapshot,{maxDepth=5,maxNodes=600,captainEvent=null}={}){
 if(!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>50||!Number.isSafeInteger(maxNodes)||maxNodes<5||maxNodes>100000)throw Error('invalid-forward-bounds');
 const initial=campaignStartWorld(data,snapshot);
 if(initial.researched.size||initial.disabled.size||initial.pendingFree)throw Error('nonempty-forward-root');
 const nodes=[],worlds=[],edges=[],index=new Map();
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
 register(initial,0);
 if(JSON.stringify(nodes[0].availableResearch)!==JSON.stringify(Object.keys(START_RESEARCH).sort()))throw Error('forward-root-menu-mismatch');
 const valid=new Set(),blocked=new Set(),firstBranches={};
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],w=worlds[i],pending=n.pendingFree;
  let actions=pending?(pending.sequential?pending.choices.slice(0,1):pending.choices).map(research=>({type:'freeResearch',source:pending.source,research,assumeOutcome:!pending.sequential&&pending.choices.length>1})):
   n.availableResearch.map(id=>w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id});
  // The first event is an explicitly conditional separate action, not a lab
  // topic. Its native scheduling is not modeled. Never grant it at the root.
  if(!pending&&i!==0&&captainEvent&&!w.researched.has(captainEvent.research)&&!w.generatedEvents?.[captainEvent.event])
   actions.push({type:'eventResearch',event:captainEvent.event,script:captainEvent.script,research:captainEvent.research,assumeOutcome:true});
  n.candidateCount=actions.length;
  if(n.depth>=maxDepth){n.frontierReason='depth-bound';n.omitted=actions.length;continue;}
  for(const action of actions){
   const result=applyCampaignStartStep(w,action,data);
   if(!result.ok){n.blocked.push({action,reason:result.reason});blocked.add(action.id||action.research);continue;}
   const j=register(result.world,n.depth+1);
   if(j===null){n.omitted++;continue;}
   const next=nodes[j],after=result.world;
   const e={from:i,to:j,action,added:diff(after.researched,w.researched),newlyAvailable:diff(new Set(next.availableResearch),new Set(n.availableResearch)),noLongerAvailable:diff(new Set(n.availableResearch),new Set(next.availableResearch)),newlyDisabled:diff(after.disabled,w.disabled),reopened:diff(w.disabled,after.disabled),conditional:!!result.assumed||action.type==='eventResearch',notes:result.notes||[]};
   edges.push(e);
   if(i===0)firstBranches[action.id]=j;
   for(const id of e.added)valid.add(id);
  }
  n.expanded=n.omitted===0;n.frontierReason=n.omitted?'node-bound':null;
 }
 const incomplete=nodes.filter(n=>!n.expanded).length;
 return {schema:'ATLAS_CAMPAIGN_FORWARD_TREE_V1',scope:'BOUNDED_FORWARD_LAB_FREE_AWARD_AND_OPTIONAL_CAPTAIN_EVENT; NO_LEGACY_ACTIONS; NO_NATIVE_CERTIFICATION',
  difficulty:snapshot.difficulty,regions:snapshot.regions??null,countries:snapshot.countries??null,sourceMetadataSha256:snapshot.sourceFingerprint,
  limits:{maxDepth,maxNodes,depthUnit:'actions',captainEvent:captainEvent??null},
  excluded:['physical sample acquisition beyond starting inventory and research grants','facility construction','other events and missions','native research duration and event scheduler','economy and full base simulation'],
  initialMenu:nodes[0].availableResearch,firstBranches,nodes,edges,
  summary:{states:nodes.length,edges:edges.length,initialBranches:Object.keys(firstBranches).length,distinctCompletedResearch:valid.size,researchIds:[...valid].sort(),expandedStates:nodes.length-incomplete,frontierStates:incomplete,omittedActions:nodes.reduce((s,n)=>s+n.omitted,0),rejectedActions:nodes.reduce((s,n)=>s+n.blocked.length,0),rejectedTopics:[...blocked].filter(Boolean).sort(),maxReachedDepth:Math.max(...nodes.map(n=>n.depth)),gameCertified:0,exhaustive:false}};
}
