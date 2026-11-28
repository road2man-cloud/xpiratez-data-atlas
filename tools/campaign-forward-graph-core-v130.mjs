import {createHash} from 'node:crypto';
import {campaignStartWorld,availableResearch,applyCampaignStartStep,labVerdict} from '../public/soldiers/modern/campaign-start-gate-v1.js';
function canonical(v){
 if(v===undefined)return ['undefined'];
 if(v===null||typeof v!=='object')return [typeof v,String(v)];
 if(v instanceof Set)return ['set',[...v].map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
 if(v instanceof Map)return ['map',[...v].map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
 if(Array.isArray(v))return ['array',v.map(canonical)];
 return ['object',Object.keys(v).sort().map(k=>[k,canonical(v[k])])];
}
const key=w=>createHash('sha256').update(JSON.stringify(canonical(w))).digest('hex');
const diff=(a,b)=>[...b].filter(x=>!a.has(x)).sort();
const delta=(a={},b={})=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].sort().filter(k=>(a[k]||0)!==(b[k]||0)).map(k=>[k,(b[k]||0)-(a[k]||0)]));
export function produceGraph(data,snapshot,{maxStates=200,maxDepth=8,extraActions=()=>[],seeds=[],maxExpanded=40,maxMillis=20000,applyStep=applyCampaignStartStep,verifySeed=()=>null,deepExpanded=4,priorGraph=null,focus=[],maxActionsPerState=12,careerCandidates=()=>[],careerEvidence=()=>null,careerPlans=[],planEvidence=()=>null,statePriority=()=>0,actionRank=()=>0,maxCareerActions=24,expansionPolicy=null}={}){
 if(!Number.isSafeInteger(maxStates)||maxStates<5||!Number.isSafeInteger(maxDepth)||maxDepth<1)throw Error('invalid-budget');
 if(!Number.isSafeInteger(maxExpanded)||maxExpanded<0||!Number.isSafeInteger(maxMillis)||maxMillis<1)throw Error('invalid-expansion-budget');
 const careerResults=[],careerRejected=[];
 const root=campaignStartWorld(data,snapshot),nodes=[],edges=[],frontier=[],rejected=[],queue=[],seen=new Map(),seedResults=[],edgeKeys=new Set(),transitionCache=new Map(),seedTips=new Set(),worldById=new Map();let cacheHits=0;
 function register(w,depth,parent){
  const id=key(w);if(seen.has(id))return seen.get(id);
  const n={id,depth,parent,available:availableResearch(w,data),researched:[...w.researched].sort(),disabled:[...w.disabled].sort(),pendingFree:w.pendingFree??null,gameCertified:false};
  nodes.push(n);seen.set(id,n);worldById.set(id,w);queue.push({w,n});return n;
 }
 const initial=register(root,0,null);
 function candidates(w,n){
  const p=w.pendingFree;
  return p?(p.sequential?p.choices.slice(0,1):p.choices).map(research=>({type:'freeResearch',source:p.source,research,assumeOutcome:!p.sequential&&p.choices.length>1})):
    [...n.available.map(id=>w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id}),...extraActions(w,data),...careerCandidates(w,data)];
 }
 function transition(w,n,action,{seed=false}={}){
  if(!seed&&n.depth>=maxDepth){frontier.push({from:n.id,action,reason:'depth-budget'});return {ok:false,reason:'depth-budget'};}
  const cacheKey=JSON.stringify([n.id,canonical(action)]);
  if(transitionCache.has(cacheKey)){cacheHits++;return transitionCache.get(cacheKey);}
  if(['externalInputs','campaignContext'].includes(action.type))return {ok:false,reason:'external-state-forbidden'};
  if(['research','repeatResearch'].includes(action.type)){
   const v=labVerdict(w,action.id,data,{repeat:action.type==='repeatResearch'});
   if(!v.ok)return {ok:false,reason:v.reason};
  }
  let result;try{result=applyStep(structuredClone(w),action,data);}catch(e){return {ok:false,reason:String(e.message||e)};}
  if(!result.ok)return {ok:false,reason:result.reason};
  const z=result.world,id=key(z);
  let careerProof=null;
  if(!seed&&action.type==='transform'){
   try{careerProof=careerEvidence(w,z,action,data);if(!careerProof)throw Error('non-exact-career-result');}catch(e){careerRejected.push({from:n.id,action,reason:String(e.message||e)});return {ok:false,reason:String(e.message||e)};}
  }
  if(!seen.has(id)&&nodes.length>=maxStates){frontier.push({from:n.id,action,reason:'state-budget'});return {ok:false,reason:'state-budget'};}
  const next=register(z,n.depth+1,n.id);
  const ek=JSON.stringify([n.id,canonical(action),next.id]);
  if(!edgeKeys.has(ek)){
   edgeKeys.add(ek);
   edges.push({from:n.id,to:next.id,action,availableBefore:n.available,availableAfter:next.available,unlocked:next.available.filter(k=>!n.available.includes(k)),added:diff(w.researched,z.researched),disabled:diff(w.disabled,z.disabled),reopened:diff(z.disabled,w.disabled),itemsDelta:delta(w.items,z.items),functionsAdded:diff(w.baseFunctions,z.baseFunctions),functionsRemoved:diff(z.baseFunctions,w.baseFunctions),conditional:!!result.assumed,notes:result.notes||[],gameCertified:false});
  }
  if(careerProof)careerResults.push({from:n.id,to:next.id,action,evidence:careerProof,gameCertified:false,registered:false});
  const receipt={ok:true,w:z,n:next};transitionCache.set(cacheKey,receipt);return receipt;
 }
 // Preserve all four first research choices before using supplied witnesses.
 for(const a of candidates(root,initial))transition(root,initial,a);
 for(const seed of seeds){
  let w=root,n=initial,applied=0,reason=null;
  const stateIds=[n.id];
  for(const a of seed.actions){
   if(applied===0&&!(a.type==='research'&&initial.available.includes(a.id))){reason='invalid-seed-root';break;}
   const res=transition(w,n,a,{seed:true});
   if(!res.ok){reason=res.reason;break;}
   w=res.w;n=res.n;applied++;stateIds.push(n.id);
  }
  let evidence=null;
  if(!reason&&!w.pendingFree){try{evidence=verifySeed(w,seed);seedTips.add(n.id);}catch(e){reason='seed-terminal-mismatch:'+String(e.message||e);}}
  seedResults.push({id:seed.id,applied,total:seed.actions.length,reason,stateIds,finalState:n.id,gameCertified:false,ok:!reason&&!w.pendingFree,unresolvedFree:!!w.pendingFree,evidence});
 }
 // Replay every previously published edge, rather than treating old state flags as inputs.
 const priorNodes=new Set(),priorEdges=new Set();
 if(priorGraph){
  if(priorGraph.sourceFingerprint!==snapshot.sourceFingerprint||priorGraph.initial!==initial.id)throw Error('prior-graph-source-mismatch');
  for(const n of priorGraph.nodes)priorNodes.add(n.id);
  for(const e of priorGraph.edges){
   const w=worldById.get(e.from),n=seen.get(e.from);
   if(!w||!n)throw Error('prior-graph-edge-order-unresolved');
   const res=transition(w,n,e.action,{seed:true});
   if(!res.ok||res.n.id!==e.to)throw Error('prior-graph-replay-mismatch:'+e.from+':'+JSON.stringify(e.action)+':'+res.reason);
   priorEdges.add(JSON.stringify([e.from,canonical(e.action),e.to]));
  }
  if([...priorNodes].some(id=>!seen.has(id)))throw Error('prior-state-missing');
 }
 // Replay alternate training orders through the same source-checked campaign gate.
 const planResults=[];
 for(const plan of careerPlans){
  const seed=seedResults.find(r=>r.id===plan.seedId&&r.ok);
  if(!seed){planResults.push({id:plan.id,ok:false,reason:'base-seed-unavailable',applied:0,total:plan.actions.length});continue;}
  let n=seen.get(seed.finalState),w=worldById.get(n.id),applied=0,reason=null;
  const baseState=n.id,stateIds=[n.id];
  for(const action of plan.actions){
   const result=transition(w,n,action,{seed:true});
   if(!result.ok){reason=result.reason;break;}
   w=result.w;n=result.n;applied++;stateIds.push(n.id);
  }
  let evidence=null;
  if(!reason&&!w.pendingFree){try{evidence=planEvidence(w,plan,data);seedTips.add(n.id);}catch(e){reason=String(e.message||e);}}
  planResults.push({id:plan.id,seedId:plan.seedId,baseState,finalState:n.id,stateIds,applied,total:plan.actions.length,reason,ok:!reason&&!w.pendingFree,evidence,registered:false,gameCertified:false});
 }
 // Try new eligible transformations on existing replayed states, prioritizing strong careers.
 let careerAttempts=0;
 for(const n of [...nodes].sort((a,b)=>statePriority(worldById.get(b.id),b)-statePriority(worldById.get(a.id),a)||b.depth-a.depth)){
  if(careerAttempts>=maxCareerActions||nodes.length>=maxStates)break;
  const w=worldById.get(n.id);if(w.pendingFree)continue;
  for(const action of careerCandidates(w,data)){
   if(careerAttempts>=maxCareerActions||nodes.length>=maxStates)break;
   if(transitionCache.has(JSON.stringify([n.id,canonical(action)])))continue;
   careerAttempts++;
   const res=transition(w,n,action);
   if(!res.ok)careerRejected.push({from:n.id,action,reason:res.reason});
  }
 }
 // Carry all previous deferred actions forward, even when their state was not expanded in this batch.
 frontier.push(...(priorGraph?.frontier||[]));
 const focusSet=new Set(focus),completedEver=new Set(nodes.flatMap(n=>n.researched));
 const expanded=new Set(),expansionRecords=[],started=Date.now();let stopReason=null;
 const priorExpanded=new Set(priorGraph?priorGraph.nodes.filter(n=>!priorGraph.unexpanded.some(x=>x.state===n.id)).map(n=>n.id):[]);
 const oldDeferred=new Set((priorGraph?.frontier||[]).map(x=>x.from));
 const want=n=>focus.filter(id=>n.researched.includes(id)&&!n.disabled.includes(id)).length;
 const actionPriority=(a,n)=> (a.type==='freeResearch'?10000:a.type==='transform'?500:focusSet.has(a.id||a.research)?100:!completedEver.has(a.id||a.research)&&a.type==='research'?30:['manufacture','acquireFacility','acquirePurchase'].includes(a.type)?20:0)+actionRank(a,worldById.get(n.id),n);
 const scores=new Map();function score(e){const n=e.n;if(!scores.has(n.id))scores.set(n.id,statePriority(e.w,n)+120*want(n)+n.depth+25*n.available.filter(id=>focusSet.has(id)&&!n.researched.includes(id)).length+(n.pendingFree?120:0));return scores.get(n.id);}
 while(true){
  if(expanded.size>=maxExpanded){stopReason='expansion-budget';break;}
  if(Date.now()-started>=maxMillis){stopReason='time-budget';break;}
  const pool=queue.filter(e=>!expanded.has(e.n.id)&&(!priorExpanded.has(e.n.id)||oldDeferred.has(e.n.id)));
  const policy=expansionPolicy?.(pool,expanded.size);if(!policy)pool.sort((a,b)=>score(b)-score(a)||b.n.depth-a.n.depth||a.n.id.localeCompare(b.n.id));
  const entry=policy?.entry||pool[0];if(!entry)break;
  const {w,n}=entry;expanded.add(n.id);
  const unique=[...new Map([...candidates(w,n),...(policy?.actions||[])].map(a=>[JSON.stringify(canonical(a)),a])).values()].filter(a=>!transitionCache.has(JSON.stringify([n.id,canonical(a)])));
  const rank=a=>policy?.rank?policy.rank(a):actionPriority(a,n);
  unique.sort((a,b)=>rank(b)-rank(a)||JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
  let attempted=0,accepted=0;
  for(const action of unique){
   if(Date.now()-started>=maxMillis||attempted>=maxActionsPerState){frontier.push({from:n.id,action,reason:attempted>=maxActionsPerState?'per-state-action-budget':'time-budget'});continue;}
   attempted++;
   const res=transition(w,n,action);
   if(res.ok){accepted++;for(const id of res.n.researched)completedEver.add(id);}
   else if(!['state-budget','depth-budget'].includes(res.reason))rejected.push({from:n.id,action,reason:res.reason});
  }
  expansionRecords.push({state:n.id,depth:n.depth,focusCompleted:want(n),attempted,accepted,goal:policy?.goal??null,estimatedMissing:policy?.cost??null});
 }
 // Seed insertion order must not be confused with shortest graph distance.
 const adj=new Map();
 for(const e of edges){if(!adj.has(e.from))adj.set(e.from,[]);adj.get(e.from).push(e);}
 for(const n of nodes){n.depth=Infinity;n.parent=null;n.parentAction=null;}
 initial.depth=0;const bfs=[initial];
 for(let i=0;i<bfs.length;i++)for(const e of adj.get(bfs[i].id)||[]){
  const n=seen.get(e.to);
  if(n.depth===Infinity){n.depth=bfs[i].depth+1;n.parent=bfs[i].id;n.parentAction=e.action;bfs.push(n);}
 }
 if(bfs.length!==nodes.length)throw Error('disconnected-graph');
 const realized=new Set(edges.map(e=>JSON.stringify([e.from,canonical(e.action)])));
 const remaining=[...new Map(frontier.filter(e=>!realized.has(JSON.stringify([e.from,canonical(e.action)]))).map(e=>[JSON.stringify([e.from,canonical(e.action)]),e])).values()];
 const routeFor=id=>{const actions=[];let n=seen.get(id);while(n.parent!==null){actions.push(n.parentAction);n=seen.get(n.parent);}return actions.reverse();};
 for(const receipt of planResults.filter(r=>r.ok)){
  receipt.actions=routeFor(receipt.finalState);receipt.actionHash=createHash('sha256').update(JSON.stringify(receipt.actions)).digest('hex');receipt.actionCount=receipt.actions.length;
 }
 for(const receipt of careerResults){
  const actions=[...routeFor(receipt.from),receipt.action];
  receipt.actions=actions;receipt.actionHash=createHash('sha256').update(JSON.stringify(actions)).digest('hex');
  receipt.actionCount=actions.length;
 }
 const unexpanded=queue.filter(e=>!expanded.has(e.n.id)&&(!priorExpanded.has(e.n.id)||oldDeferred.has(e.n.id))).map(e=>({state:e.n.id,reason:stopReason||'unexpanded'}));
 return {version:130,careerAttempts,planResults,careerResults,careerRejected,focus,expansionRecords,priorStates:priorNodes.size,priorTransitions:priorEdges.size,newStates:nodes.filter(n=>!priorNodes.has(n.id)).length,newTransitions:edges.filter(e=>!priorEdges.has(JSON.stringify([e.from,canonical(e.action),e.to]))).length,cacheHits,seedTipCount:seedTips.size,expanded:expanded.size,unexpanded,stopReason,sourceFingerprint:snapshot.sourceFingerprint,initial:initial.id,nodes,edges,frontier:remaining,rejected,seedResults,coverage:'bounded-model-research-resource-actions-and-replayed-seeds',complete:false,gameCertified:false};
}
