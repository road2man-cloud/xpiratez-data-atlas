// Build the source-bound v.o2 finite material budget for canonical shared routes.
import assert from "node:assert/strict";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy-v2-vo2.mjs";
export function buildCareerMaterialBudget(data,ledger){
 const policy=createResearchMaterialPolicy(data),description=policy.describe(),records={},checkedRouteIds=[];
 let withFinite=0,hardViolations=0,indexedUnresolved=0;
 assert.equal(ledger.sourceMetadataSha256,description.sourceMetadataSha256);
 for(const [id,r] of Object.entries(ledger.routes)){
  const g=ledger.graphs[r.sourceGraph],i=r.sourceNode;
  assert(g?.nodes[i],"Missing route endpoint "+id);
  const state=policy.state(g,i),q=policy.issues(state);checkedRouteIds.push(id);
  hardViolations+=Number(q.hard.length>0);indexedUnresolved+=Number(q.uncertain.length>0);
  const use={};for(const [k,f] of policy.finite){
   const granted=state.granted[k]||0,consumed=state.consumed[k]||0;
   if(granted||consumed)use[k]={granted,consumed,cap:f.cap,remaining:Math.max(0,f.cap-consumed)};
  }
  if(Object.keys(use).length||q.hard.length||q.uncertain.length){withFinite++;records[id]={use,hard:q.hard,uncertain:q.uncertain};}
 }
 return {schema:description.schema,source:description.source,sourceVersion:description.sourceVersion,sourceMetadataSha256:description.sourceMetadataSha256,sha256:description.sha256,scope:description.scope,finite:description.finite,counts:description.counts,records,checkedRouteIds:checkedRouteIds.sort(),checked:checkedRouteIds.length,withFinite,hardViolations,indexedUnresolved};
}
