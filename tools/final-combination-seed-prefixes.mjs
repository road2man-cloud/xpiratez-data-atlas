// Exact action-prefix reconstruction for all seven retained ledgers.
// Hash equality verifies archival identity, NOT game feasibility.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reconstructCareerActions} from './atlas-career-completion-core.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function assumptionActions(actions){
 return actions.flatMap((a,index)=>a?.assumption===true||a?.assumeOutcome===true||a?.type==='externalInputs'||String(a?.type).startsWith('conditional')?[{index,type:a.type}]:[]);
}
export function prepareReplayPrefixes(sources,registry,indices,metadata){
 const nodes=[{parent:null,action:null,depth:0,first:null}],edges=new Map(),refs=new Map(),errors=[],assumptionTypes={},typeCounts={};
 let actionOccurrences=0,assumedRoutes=0,assumptionOccurrences=0;
 for(const [si,s] of sources.entries()){
  const rows=new Map(s.rows.map(r=>[r.id,r]));
  for(const [ri,rid] of s.ids.entries()){
   const raw=s.raw.routes[rid],p=rows.get(rid);
   try{
    assert(p,'Projection invalid');
    const full=reconstructCareerActions(s,p,raw,registry,indices.get(s.key));
    assert.equal(hash(full),p.hash,'Full-action SHA-256 mismatch');
    let prefix=0;
    for(const action of full){
     assert(action&&typeof action.type==='string');
     const key=JSON.stringify([prefix,action]);let next=edges.get(key);
     if(next===undefined){next=nodes.length;edges.set(key,next);nodes.push({parent:prefix,action,depth:nodes[prefix].depth+1,first:nodes[prefix].first??(assumptionActions([action]).length?next:null)});}
     prefix=next;typeCounts[action.type]=(typeCounts[action.type]||0)+1;
    }
    const assumptions=assumptionActions(full);
    for(const a of assumptions)assumptionTypes[a.type]=(assumptionTypes[a.type]||0)+1;
    actionOccurrences+=full.length;assumptionOccurrences+=assumptions.length;assumedRoutes+=Number(assumptions.length>0);
    refs.set(si+'|'+ri,{prefix,hash:p.hash,assumptions});
   }catch(e){errors.push({source:s.key,id:rid,reason:e.message});}
  }
 }
 function actionsAt(prefix){
  const actions=[];for(let n=prefix;n;n=nodes[n].parent)actions.push(nodes[n].action);
  return actions.reverse();
 }
 function resolve([si,ri]){
  const r=refs.get(si+'|'+ri);if(!r)return null;
  const actions=actionsAt(r.prefix);assert.equal(hash(actions),r.hash);
  return {...r,actions};
 }
 // Queue the earliest undischarged assumption, not a late step that depends
 // on it. Shared exact context is a work-sharing proposal, not a proof.
 function firstObligations(queue){
  const groups=new Map();let unprepared=0,withoutExplicitAssumption=0;
  for(const q of queue){
   const r=refs.get(q.seed.join('|'));if(!r){unprepared++;continue;}
   const first=nodes[r.prefix].first;if(first===null){withoutExplicitAssumption++;continue;}
   const context=JSON.stringify([q.branch,q.difficulty,first]);
   let g=groups.get(context);
   if(!g){const n=nodes[first],actions=actionsAt(n.parent);
    g={id:hash([q.branch,q.difficulty,actions,n.action]),branch:q.branch,difficulty:q.difficulty,prefix:n.parent,prefixHash:hash(actions),actionIndex:n.depth-1,action:n.action,units:[],origins:new Set(),representative:q.key};groups.set(context,g);
   }
   g.units.push(q.key);g.origins.add(q.origin);
  }
  const items=[...groups.values()].map(g=>({...g,origins:[...g.origins].sort(),count:g.units.length})).sort((a,b)=>b.count-a.count||a.actionIndex-b.actionIndex||a.id.localeCompare(b.id));
  const byType={};for(const g of items){const b=byType[g.action.type]??={groups:0,units:0};b.groups++;b.units+=g.count;}
  return {items,summary:{groups:items.length,units:items.reduce((n,g)=>n+g.count,0),unprepared,withoutExplicitAssumption,byType},resolve(g){const actions=actionsAt(g.prefix);assert.equal(hash(actions),g.prefixHash);return {...g,actions};}};
 }
 function opportunity(queue){
  // Reuse is allowed only in the same branch/difficulty context, and requires
  // the eventual full-engine adapter to bind an identical initial world.
  const contexts=new Map();let total=0,distinct=0,prepared=0;
  for(const q of queue){
   const r=refs.get(q.seed.join('|'));if(!r)continue;
   prepared++;total+=nodes[r.prefix].depth;
   const key=JSON.stringify([q.branch,q.difficulty]);
   if(!contexts.has(key))contexts.set(key,new Set());
   const seen=contexts.get(key);
   for(let n=r.prefix;n&&!seen.has(n);n=nodes[n].parent){seen.add(n);distinct++;}
  }
  return {preparedWorkUnits:prepared,unpreparedWorkUnits:queue.length-prepared,naiveActionVisits:total,distinctBranchDifficultyPrefixes:distinct,possibleReusedActionVisits:total-distinct,contexts:contexts.size};
 }
 return {resolve,opportunity,firstObligations,errors,summary:{reconstructed:refs.size,unreconstructed:errors.length,actionOccurrences,uniquePrefixNodes:nodes.length-1,sharedPrefixOccurrences:actionOccurrences-(nodes.length-1),assumedRoutes,assumptionOccurrences,assumptionTypes,typeCounts}};
}
