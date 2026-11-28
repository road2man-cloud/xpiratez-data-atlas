// Forward state-space production, independent of legacy career/prefix actions.
// Every edge is an action selected from the current state, then actually applied.
// This is a bounded model graph, NOT a native campaign or exhaustive tree.
import {createHash} from 'node:crypto';
import {campaignStartWorld,availableResearch,applyCampaignStartStep,START_RESEARCH} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const arr=x=>Array.isArray(x)?x:[];
const canon=x=>x instanceof Set?[...x].sort().map(canon):x instanceof Map?Object.fromEntries([...x.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,v])=>[k,canon(v)])):Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
const diff=(a,b)=>[...a].filter(x=>!b.has(x)).sort();
export function buildCampaignForwardTree(data,snapshot,{maxDepth=5,maxNodes=600,captainEvent=null,resume=null}={}){
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
 // Reconstruct each stored state from a previously generated forward edge.
 // Never trust a serialized inventory or inject completion flags.
 const eq=(a,b)=>digest(a)===digest(b);
 const edgeKey=a=>digest(a);
 const processed=new Map();
 const valid=new Set(),blocked=new Set(),firstBranches={};
 if(resume){
  if(resume.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||resume.sourceMetadataSha256!==snapshot.sourceFingerprint||
   resume.difficulty!==snapshot.difficulty||!eq(resume.regions,snapshot.regions??null)||!eq(resume.countries,snapshot.countries??null)||
   !eq(resume.limits?.captainEvent??null,captainEvent)||maxDepth<resume.limits.maxDepth||maxNodes<resume.nodes.length)
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
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],w=worlds[i],pending=n.pendingFree;
  let actions=pending?(pending.sequential?pending.choices.slice(0,1):pending.choices).map(research=>({type:'freeResearch',source:pending.source,research,assumeOutcome:!pending.sequential&&pending.choices.length>1})):
   n.availableResearch.map(id=>w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id});
  // The first event is an explicitly conditional separate action, not a lab
  // topic. Its native scheduling is not modeled. Never grant it at the root.
  if(!pending&&i!==0&&captainEvent&&!w.researched.has(captainEvent.research)&&!w.generatedEvents?.[captainEvent.event])
   actions.push({type:'eventResearch',event:captainEvent.event,script:captainEvent.script,research:captainEvent.research,assumeOutcome:true});
  const seen=processed.get(i)||new Set();
  const remaining=actions.filter(a=>!seen.has(edgeKey(a)));
  n.candidateCount=actions.length;
  n.omitted=0;
  if(n.depth>=maxDepth){n.frontierReason=remaining.length?'depth-bound':null;n.omitted=remaining.length;n.expanded=!remaining.length;continue;}
  for(const action of remaining){
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
  continuation:resume?{previousStates,previousEdges,newStates:nodes.length-previousStates,newEdges:edges.length-previousEdges,previousGraphHash:digest(resume)}:null,
  summary:{states:nodes.length,edges:edges.length,initialBranches:Object.keys(firstBranches).length,distinctCompletedResearch:valid.size,researchIds:[...valid].sort(),expandedStates:nodes.length-incomplete,frontierStates:incomplete,omittedActions:nodes.reduce((s,n)=>s+n.omitted,0),rejectedActions:nodes.reduce((s,n)=>s+n.blocked.length,0),rejectedTopics:[...blocked].filter(Boolean).sort(),maxReachedDepth:Math.max(...nodes.map(n=>n.depth)),gameCertified:0,exhaustive:false}};
}
