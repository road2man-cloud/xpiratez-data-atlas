// Final publication gate. Research-goal witnesses are inputs, not final rows.
// A bounded search, an empty processed edge list, or a better numeric vector
// cannot prove the absence of future research/transformation outcomes.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {createResearchConstraintModel} from "./population-research-constraint-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
export const FINAL_SCHEMA="ATLAS_CAREER_SUCCESSOR_CLOSURE_V1";
const sort=x=>[...x].sort();
const researchAction=a=>["research","repeatResearch","freeResearch","eventResearch","missionResearch"].includes(a.type);
const relevantAction=a=>researchAction(a)||a.type==="transform"||a.type==="conditionalCapGrowth"||a.type==="conditionalPromotion"||a.type==="conditionalMedal";
const same=(a,b)=>key(a)===key(b);
export function finalIdentity(pair){return key([pair.origin,pair.branch,pair.body,pair.difficulties,pair.pathId,pair.traitId]);}
export function classifyFinalCareers({db,ledger,data,replay,lines}){
 const c=db.careerCompletion,sets=c.researchTraitSets,budget=c.materialBudget,known=new Set(budget.checkedRouteIds||[]);
 const branches=new Map(db.branches.map(b=>[b.id,b])),model=createResearchConstraintModel(data);
 const byBody=new Map(),branchModel=new Map(),possibleCache=new Map(),pathCache=new Map(),histories=new Map();
 // All indexed rules, including reset, removal, death/revival, clone,
 // random and unmodeled rules: lack of support cannot certify closure.
 for(const r of data.transformations)for(const b of r.allowedSoldierTypes||[]){const a=byBody.get(b)||[];a.push(r);byBody.set(b,a);}
 const graphChildren=new Map(),nodeRecords=new Map();
 for(const [id,r] of Object.entries(sets.records)){const raw=ledger.routes[id];if(raw)nodeRecords.set(raw.sourceGraph+"|"+raw.sourceNode,{id,r});}
 for(const [gid,g] of Object.entries(ledger.graphs)){
  const successors=new Array(g.nodes.length).fill(null);
  for(let i=g.nodes.length-1;i>0;i--){
   const n=g.nodes[i],p=n.parent;assert(Number.isInteger(p)&&p<i);
   const changed=n.stateHash!==g.nodes[p].stateHash&&n.steps.some(relevantAction);
   // A changing descendant is evidence of continuation, not dominance.
   if(changed)successors[p]??=i;
   else if(successors[i]!==null)successors[p]??=successors[i];
  }
  graphChildren.set(gid,successors);
 }
 function branchScope(b,path){
  const k=b.id;let v=branchModel.get(k);
  if(!v){
   const commitment=[...b.captain,...Object.values(b.choices||{})].filter(Boolean);
   v=model.analyze(commitment);branchModel.set(k,v);
  }
  // If the relaxed model contradicts any active replayed fact, fail open.
  return path.active.every(id=>v.isA(id))?v:null;
 }
 function getHistory(gid,i){
  const k=gid+"|"+i;if(histories.has(k))return histories.get(k);
  const g=ledger.graphs[gid],stack=[];let j=i;
  while(j){stack.push(g.nodes[j].steps);j=g.nodes[j].parent;}
  const actions=[...g.birthActions,...stack.reverse().flat()];
  // Exact replay is required only for a potential positive certificate.
  const w=replay.replay(actions);assert.equal(exactWorld(w),g.nodes[i].stateHash);
  const state=member(w).state;histories.set(k,{w,state,actions});return histories.get(k);
 }
 // The scope is soldier development plus all terminal research goals. Every
 // rule reachable by body is conservatively included; unrelated equipment
 // technology does not itself create a new soldier development endpoint.
 function relevantResearch(body,b,scope){
  const k=b.id+"|"+body+"|"+!!scope;if(possibleCache.has(k))return possibleCache.get(k);
  const bodies=new Set([body]),queue=[body],topics=new Set(c.terminalRule.targets.flatMap(t=>t.researchGoals));
  for(let i=0;i<queue.length;i++)for(const r of byBody.get(queue[i])||[]){
   if(r.requires?.includes("STR_UNAVAILABLE")||scope&&!model.actionPossible(r,scope))continue;
   for(const x of r.requires||[])topics.add(x);
   const dest=r.producedSoldierType;if(dest&&!bodies.has(dest)){bodies.add(dest);queue.push(dest);}
  }
  // Include indexed supporting prerequisites, auto/free routes are already
  // overapproximated by the necessary research model.
  const todo=[...topics];for(let i=0;i<todo.length;i++){
   const r=data.researchRules[todo[i]];for(const t of [...(r?.requires||[]),...(r?.dependencies||[])])if(!topics.has(t)){topics.add(t);todo.push(t);}
  }
  const result=sort([...topics].filter(t=>!scope||scope.isA(t)));possibleCache.set(k,result);return result;
 }
 function openResearch(p,b,path){
  const k=p.body+"|"+p.branch+"|"+p.pathId;if(pathCache.has(k))return pathCache.get(k);
  const scope=branchScope(b,path),active=new Set(path.active),rev=new Set(Object.values(data.researchRules).flatMap(r=>r.reenables||[]));
  const disabled=new Set(path.disabled);
  const missing=relevantResearch(p.body,b,scope).filter(t=>!active.has(t)&&!(disabled.has(t)&&!rev.has(t)));
  const result={scope,missing};pathCache.set(k,result);return result;
 }
 const witnesses={},rows=[],counts={},regressions=[],ogreSeven=[];
 // Exact direct 6->7 lineage, independent of which child is selected for
 // generic continuation navigation.
 for(const [gid,g] of Object.entries(ledger.graphs))for(const [i,n] of g.nodes.entries()){
  if(n.parent===null||n.body!=="STR_SOLDIER_OGRE"||g.nodes[n.parent].body!==n.body)continue;
  const a=nodeRecords.get(gid+"|"+n.parent),b=nodeRecords.get(gid+"|"+i);
  if(a&&b&&a.r.pathId===b.r.pathId&&Object.keys(sets.traits[a.r.traitId]).length===6&&Object.keys(sets.traits[b.r.traitId]).length===7)regressions.push({from:a.id,to:b.id,pathId:a.r.pathId,fromTraits:6,toTraits:7});
 }
 const count=(k)=>counts[k]=(counts[k]||0)+1;
 for(const line of lines){
  const p=sets.pairs[line.id],path=sets.paths[p?.pathId],b=branches.get(p?.branch);
  assert(p&&path&&b&&line.id===finalIdentity(p));
  const refs=[line,...(line.alternatives||[])],approved=[];
  for(const ref of refs){
   const id=ref.routeId,s=sets.records[id],raw=ledger.routes[id],g=ledger.graphs[raw?.sourceGraph],n=g?.nodes[raw?.sourceNode];
   const base={pairId:line.id,stateHash:s?.stateHash,actionHash:s?.actionHash};
   let result;
   if(!s||!n||!s.goals?.length||s.stateHash!==n.stateHash||s.actionHash!==raw.fullActionHash)result={status:"UNRESOLVED_REPLAY"};
   else if(!known.has(id)||budget.records[id]?.hard?.length||budget.records[id]?.uncertain?.length)result={status:"UNRESOLVED_FINITE_MATERIAL"};
   else {
    const child=graphChildren.get(raw.sourceGraph)[raw.sourceNode];
    if(child!==null)result={status:"KNOWN_CONTINUATION",next:"MISSCAR:"+raw.sourceGraph+":"+child};
    else {
     const {scope,missing}=openResearch(p,b,path);
     // Only sound first-action exclusions. A missing required prior
     // transformation / used forbidden one is conclusive for that first
     // action, but NOT for any later action until all first actions close.
     const potential=(byBody.get(p.body)||[]).filter(r=>!r.requires?.includes("STR_UNAVAILABLE")&&(!scope||model.actionPossible(r,scope)));
     const finite=budget.records[id]?.use||{};
     const remaining=potential.filter(r=>!Object.entries(r.requiredItems||{}).some(([k,v])=>budget.finite[k]?.hard===true&&v>budget.finite[k].cap-(finite[k]?.consumed||0)));
     const openGrowth=n.raw.some((v,i)=>v!==n.capRaw[i]);
     if(missing.length||openGrowth)result={status:"OPEN_RESEARCH_OR_GROWTH",missingResearch:missing.length,exampleResearch:missing.slice(0,12),potentialRules:remaining.length,openGrowth};
     else {
      try{
       const {state}=getHistory(raw.sourceGraph,raw.sourceNode);
       const history=state.history;
       const open=remaining.filter(r=>!r.requiredPreviousTransformations?.some(k=>!(history.get(k)>0))&&!r.forbiddenPreviousTransformations?.some(k=>history.get(k)>0));
       // Unsupported statuses, random outcomes, rank, wounds, facilities
       // and stat gates are relaxed; all remain open until ruled out.
       if(open.length)result={status:"OPEN_TRANSFORMATION",potentialRules:open.length,exampleRules:open.slice(0,12).map(r=>r.id)};
       else {
        const certificate={schema:FINAL_SCHEMA,source:sets.sourceMetadataSha256,replay:sets.replayFingerprint,graph:ledger.sourceGraphSha256,state:s.stateHash,actions:s.actionHash,pair:line.id,terminalGoals:s.goals,ruleCount:potential.length,excludedFinite:potential.length-remaining.length,excludedHistory:remaining.length,researchMissing:0,openGrowth:false};
        result={status:"FINAL_CLOSED",certificate,proofHash:key(certificate)};
        approved.push({...ref,closureProofHash:result.proofHash});
       }
      }catch(e){result={status:"UNRESOLVED_CLOSURE_REPLAY",reason:String(e.message)};}
     }
    }
   }
   witnesses[id]={...base,...result};count(result.status);
   const cls=c.classifications[ref.source]?.[id];if(cls){cls.finalCareerStatus=result.status;cls.status=result.status==="FINAL_CLOSED"?"FINAL_CAREER_COMPLETE":"RESEARCH_LINE_EXPLORATION";if(result.next)cls.nextCareerRoute=result.next;}
   if(p.body==="STR_SOLDIER_OGRE"){
    const traitCount=Object.keys(sets.traits[p.traitId]).length;
    if(traitCount===7)ogreSeven.push({route:id,status:result.status,graph:raw.sourceGraph,node:raw.sourceNode,traits:traitCount});

   }
  }
  if(approved.length){
   const primary=approved.find(r=>r.routeId===line.routeId)||approved[0];
   rows.push({...line,...primary,alternatives:approved.filter(r=>r!==primary)});
  }
 }
 const finalIds=new Set(rows.map(r=>r.id));assert.equal(finalIds.size,rows.length);
 assert(regressions.length>0,"Ogre 6 to 7 regression witness missing");
 for(const r of regressions)assert(witnesses[r.from].status!=="FINAL_CLOSED","Ogre intermediate admitted");
 return {schema:FINAL_SCHEMA,sourceMetadataSha256:sets.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,scope:"Active terminal research, no possible relevant research/growth and all first meaningful transformations ruled out by necessary research, exact history or confirmed finite material; unknown and bounded exploration fail open. No global optimum or gameplay victory.",rows,witnesses,summary:{reclassifiedCombinations:lines.length,classifiedWitnesses:Object.keys(witnesses).length,completeCombinations:rows.length,explorationCombinations:lines.length-rows.length,completeWitnesses:counts.FINAL_CLOSED||0,counts,ogreRegression:regressions,ogreSeven}};
}
