// Rebase legacy career witnesses onto observed campaign-start lab choices.
// Never treat an assumed sample or a successful conditional replay as a
// campaign-normalization certificate. The legacy ledger remains immutable.
import assert from "node:assert/strict";
import {START_RESEARCH,earlyLabAccess,replayEarlyPrefix} from "./atlas-overcap-rooted-early-research.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {exactWorld} from "./population-growth-replay-core.mjs";
import {key} from "./population-research-career-core.mjs";
const roots=new Set(Object.values(START_RESEARCH)),sort=x=>[...x].sort();
const arr=x=>Array.isArray(x)?x:[];
const lab=a=>a.type==="research"||a.type==="repeatResearch";
export function rootedBirthActions(graph,bank){
 const a=graph.birthActions,at=a.findIndex(x=>x.type==="research"&&roots.has(x.id));
 assert(at>=0,"NO_EXISTING_START_ROOT");
 const id=a[at].id;
 let end=at+1;
 while(end<a.length&&a[end].type==="freeResearch"&&a[end].source===id)end++;
 const oldFree=a.slice(at+1,end).map(x=>x.research);
 const prefix=bank.prefixes.find(p=>p.labOrder.length===1&&p.firstRoot===id&&key(p.actions.filter(x=>x.type==="freeResearch").map(x=>x.research))===key(oldFree));
 assert(prefix,"NO_MATCHING_ROOT_AWARD");
 const lead=a[0]?.type==="campaignContext"?1:0;
 assert(!a.slice(lead,at).some(x=>x.type==="campaignContext"||x.type==="recruit"),"ROOT_AFTER_RECRUIT_OR_CONTEXT");
 return {firstRoot:id,movedFrom:at,oldRootActions:a.slice(at,end),prefixHash:key(prefix.actions),steps:[...a.slice(0,lead),...prefix.actions,...a.slice(lead,at),...a.slice(end)]};
}
function applySteps(data,replay,input,steps){
 let world=input.world,started=input.started,actions=[...input.actions],assumptions=[...input.assumptions],researchAccess=[...input.researchAccess];
 for(const a of steps){
  const i=actions.length;
  try{
   if(lab(a)){
    const r=data.researchRules[a.id];
    assert(r,"UNKNOWN_RESEARCH "+a.id);
    if(!started){
     assert(a.type==="research"&&roots.has(a.id),"FIRST_LAB_NOT_START_ROOT "+a.id);
    }
    let why;
    if(a.type==="repeatResearch"){
     assert(started&&world.researched.has(a.id)&&!world.disabled.has(a.id),"UNAVAILABLE_REPEAT "+a.id);
     why={kind:"REPEAT_EXISTING_RESEARCH",ids:[a.id]};
    }else{
     why=earlyLabAccess(world,a.id,data.researchRules,{started});
     if(!why){
      // Sample topics may enter the lab when their item is actually present.
      // Legacy externalInputs do not establish its campaign acquisition.
      // Record the exact outstanding sample gate; the existing replay still
      // enforces dependencies, requires, disables, base functions and free RNG.
      const sample=r.neededItem||a.id;
      assert(started&&r.needItem&&Number(world.items[sample])>0&&!world.disabled.has(a.id),"UNROOTED_OR_UNAVAILABLE_LAB "+a.id);
      why={kind:"CONDITIONAL_SAMPLE_ACCESS",ids:[sample]};
     }
    }
    if(r.needItem)assumptions.push({index:i,kind:"SAMPLE_ACQUISITION_UNPROVEN",research:a.id,item:r.neededItem||a.id});
    researchAccess.push({index:i,research:a.id,...why});
   }
   if(a.type==="externalInputs"&&(Object.keys(a.items||{}).length||arr(a.functions).length||a.funds))assumptions.push({index:i,kind:"EXTERNAL_INPUTS",items:a.items||{},functions:a.functions||[],funds:a.funds||0});
   if(a.type==="eventResearch"||a.type==="missionResearch")assumptions.push({index:i,kind:"EVENT_OR_MISSION_OUTCOME_CONDITIONAL",research:a.research,event:a.event||null,mission:a.mission||null});
   if(a.type==="freeResearch"&&a.assumeOutcome)assumptions.push({index:i,kind:"FREE_RESEARCH_OUTCOME_CONDITIONAL",research:a.research});
   world=replay.apply(world,a);if(lab(a))started=true;actions.push(a);
  }catch(e){return {ok:false,failedAt:i,action:a,reason:e.message||String(e)};}
 }
 if(world.pendingFree)return {ok:false,failedAt:actions.length,reason:"PENDING_FREE"};
 return {ok:true,world,started,actions,assumptions,researchAccess};
}
export function produceRootedCareerCandidates({data,ledger,bank,replay,maxGraphs=12,maxNodes=300,offset=0}){
 assert.equal(bank.sourceMetadataSha256,ledger.sourceMetadataSha256);
 assert.deepEqual(bank.roots,START_RESEARCH);
 for(const p of bank.prefixes.filter(p=>p.labOrder.length===1))replayEarlyPrefix(data,p);
 const ordered=Object.entries(ledger.graphs).sort((a,b)=>a[1].birthActions.length-b[1].birthActions.length||a[0].localeCompare(b[0]));
 // Interleave birth origins to avoid exhausting the budget on one body.
 const groups=new Map();for(const e of ordered){const k=e[1].origin;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
 const queue=[];for(let n=0;queue.length<ordered.length;n++)for(const g of groups.values())if(g[n])queue.push(g[n]);
 const byGraph=new Map();
 for(const [id,r] of Object.entries(ledger.routes)){if(!byGraph.has(r.sourceGraph))byGraph.set(r.sourceGraph,new Map());const m=byGraph.get(r.sourceGraph);if(!m.has(r.sourceNode))m.set(r.sourceNode,[]);m.get(r.sourceNode).push([id,r]);}
 const graphs={},failures=[],routes={},births={},coverage={};let processedNodes=0,attempted=0;
 for(const [gid,g] of queue.slice(offset,offset+maxGraphs)){
  // Never silently advance the cursor past a partially processed graph.
  // A single oversized graph is allowed as the first unit of a batch.
  if(attempted>0&&processedNodes+g.nodes.length>maxNodes)break;
  attempted++;
  let birth;
  try{birth=rootedBirthActions(g,bank);}catch(e){failures.push({graph:gid,origin:g.origin,reason:e.message});continue;}
  const b=applySteps(data,replay,{world:foundationWorld(),started:false,actions:[],assumptions:[],researchAccess:[]},birth.steps);
  if(!b.ok){failures.push({graph:gid,origin:g.origin,...b});continue;}
  const candidateId=key([gid,birth.steps]),nodes=[],cache=[];
  const gOut={legacyGraph:gid,origin:g.origin,branch:g.branch,firstRoot:birth.firstRoot,movedFrom:birth.movedFrom,birthActions:birth.steps,prefixHash:birth.prefixHash,nodes};
  graphs[candidateId]=gOut;births[gid]=candidateId;
  for(const [i,n] of g.nodes.entries()){
   processedNodes++;
   const parent=i===0?null:cache[n.parent];
   const q=i===0?b:parent?.ok?applySteps(data,replay,parent,n.steps):{ok:false,reason:"PARENT_NOT_REPLAYED"};
   cache.push(q);
   if(!q.ok){nodes.push({legacyNode:i,parent:n.parent,status:"BLOCKED",reason:q.reason});failures.push({graph:gid,node:i,origin:g.origin,...q});continue;}
   try{
    const f=replay.finish(q.world),stateHash=exactWorld(q.world),actionHash=key(q.actions);
    const sameStats=["body","raw","capRaw","permanentVector","permanentCapVector","rank","medals"].every(k=>key(f[k])===key(n[k]));
    const row={legacyNode:i,parent:n.parent,status:"CONDITIONAL_ROOTED_REPLAY",steps:i===0?[]:n.steps,stateHash,actionHash,body:f.body,raw:f.raw,capRaw:f.capRaw,permanentVector:f.permanentVector,permanentCapVector:f.permanentCapVector,rank:f.rank,medals:f.medals,legacyStatsMatch:sameStats,activeResearch:sort([...q.world.researched].filter(x=>!q.world.disabled.has(x))),disabledResearch:sort(q.world.disabled),assumptions:q.assumptions,researchAccess:q.researchAccess};
    nodes.push(row);
    for(const [rid,r] of byGraph.get(gid)?.get(i)||[]){
     const id=key([rid,candidateId,actionHash,stateHash]);
     routes[id]={legacyRoute:rid,legacyGraph:gid,sourceGraph:candidateId,sourceNode:i,origin:r.origin,branch:r.branch,body:f.body,firstRoot:birth.firstRoot,fullActionHash:actionHash,canonicalStateHash:stateHash,permanentVector:f.permanentVector,permanentCapVector:f.permanentCapVector,legacyStatsMatch:sameStats,normalizationComplete:false,actualGameCertified:false};
    }
   }catch(e){cache[i]={ok:false};nodes.push({legacyNode:i,parent:n.parent,status:"BLOCKED",reason:e.message});failures.push({graph:gid,node:i,origin:g.origin,reason:e.message});}
  }
  coverage[g.origin]=(coverage[g.origin]||0)+nodes.filter(n=>n.status==="CONDITIONAL_ROOTED_REPLAY").length;
 }
 return {schema:"ATLAS_ROOTED_CAREER_CANDIDATES_V1",sourceMetadataSha256:ledger.sourceMetadataSha256,legacyGraphHash:ledger.sourceGraphSha256,roots:START_RESEARCH,offset,maxGraphs,maxNodes,attemptedGraphs:attempted,processedNodes,totalLegacyGraphs:ordered.length,nextOffset:offset+attempted,graphs,births,routes,failures,coverage,normalizationComplete:false,actualGameCertified:false,scope:"Conditional rebased witnesses; samples, events and actual campaign resource access not certified. Not final intake."};
}
