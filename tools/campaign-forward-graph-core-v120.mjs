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
export function produceGraph(data,snapshot,{maxStates=200,maxDepth=8,extraActions=()=>[]}={}){
 if(!Number.isSafeInteger(maxStates)||maxStates<5||!Number.isSafeInteger(maxDepth)||maxDepth<1)throw Error('invalid-budget');
 const root=campaignStartWorld(data,snapshot),nodes=[],edges=[],frontier=[],rejected=[],queue=[],seen=new Map();
 function register(w,depth,parent){
  const id=key(w);if(seen.has(id))return seen.get(id);
  const n={id,depth,parent,available:availableResearch(w,data),researched:[...w.researched].sort(),disabled:[...w.disabled].sort(),pendingFree:w.pendingFree??null,gameCertified:false};
  nodes.push(n);seen.set(id,n);queue.push({w,n});return n;
 }
 const initial=register(root,0,null);
 for(let i=0;i<queue.length;i++){
  const {w,n}=queue[i],p=w.pendingFree;
  const candidates=p?(p.sequential?p.choices.slice(0,1):p.choices).map(research=>({type:'freeResearch',source:p.source,research,assumeOutcome:!p.sequential&&p.choices.length>1})):
    [...n.available.map(id=>w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id}),...extraActions(w,data)];
  const unique=new Map(candidates.map(a=>[JSON.stringify(canonical(a)),a]));
  for(const action of unique.values()){
   if(n.depth>=maxDepth){frontier.push({from:n.id,action,reason:'depth-budget'});continue;}
   if(['externalInputs','campaignContext'].includes(action.type)){rejected.push({from:n.id,action,reason:'external-state-forbidden'});continue;}
   if(['research','repeatResearch'].includes(action.type)){
    const v=labVerdict(w,action.id,data,{repeat:action.type==='repeatResearch'});
    if(!v.ok){rejected.push({from:n.id,action,reason:v.reason});continue;}
   }
   const result=applyCampaignStartStep(structuredClone(w),action,data);
   if(!result.ok){rejected.push({from:n.id,action,reason:result.reason});continue;}
   const z=result.world,id=key(z);
   if(!seen.has(id)&&nodes.length>=maxStates){frontier.push({from:n.id,action,reason:'state-budget'});continue;}
   const next=register(z,n.depth+1,n.id);
   edges.push({from:n.id,to:next.id,action,availableBefore:n.available,availableAfter:next.available,unlocked:next.available.filter(k=>!n.available.includes(k)),added:diff(w.researched,z.researched),disabled:diff(w.disabled,z.disabled),reopened:diff(z.disabled,w.disabled),itemsDelta:delta(w.items,z.items),functionsAdded:diff(w.baseFunctions,z.baseFunctions),functionsRemoved:diff(z.baseFunctions,w.baseFunctions),conditional:!!result.assumed,notes:result.notes||[],gameCertified:false});
  }
 }
 return {version:120,sourceFingerprint:snapshot.sourceFingerprint,initial:initial.id,nodes,edges,frontier,rejected,coverage:'bounded-model-research-and-supplied-actions',complete:false,gameCertified:false};
}
