// Conditional research witnesses shared across origins, not unconditional grants.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {birthActions} from "./population-growth-replay-core.mjs";
import {birthCatalog} from "./population-frontier-chronology-core.mjs";
import {key} from "./population-research-career-core.mjs";
import {createResearchWitnessLookup} from "./final-career-research-index.mjs";
const db=JSON.parse(gunzipSync(fs.readFileSync("public/data/branch-soldier-results.json.gz")));
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
assert.equal(data.meta.mod.version,"v.o2");
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const research=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const rules=new Map(data.transformations.map(x=>[x.id,x]));
const nodes=[{parent:null,action:null}],prefixes=new Map(),histories=new Map(),births={},routes={},byTransform=new Map(),unresolved=[];
let researchSteps=0,gateCount=0;
function index(full,branch,ref,kind){
 let node=0;const gates=[],context=[],ids=new Set();
 for(let i=0;i<full.length;i++){
  const a=full[i];
  if(research.has(a.type)){
   researchSteps++;
   const k=key([node,a]);let next=prefixes.get(k);
   if(next===undefined){next=nodes.length;prefixes.set(k,next);nodes.push({parent:node,action:a});}
   node=next;
   const id=a.research||a.id;if(id)ids.add(id);
  }else{
   // Keep every non-research position. No projection may silently grant
   // resources, outcomes, time, recruitment, rank or transformation effects.
   context.push(i);
   if(a.type==="transform"){
    const rule=rules.get(a.transform);
    if(!rule)unresolved.push({ref,index:i,reason:"UNINDEXED_TRANSFORM"});
    const g={index:i,prefix:node,transform:a.transform,requires:rule?.requires??null};
    gates.push(g);gateCount++;
    const k=key([branch,node,a.transform]);let group=byTransform.get(k);
    if(!group){group={branch,prefix:node,transform:a.transform,requires:g.requires,witnesses:[]};byTransform.set(k,group);}
    group.witnesses.push([ref,i]);
   }
  }
 }
 const hk=key([branch,node]);let h=histories.get(hk);
 if(!h){h={branch,prefix:node,explicitResearchIds:[...ids].sort(),births:[],routes:[]};histories.set(hk,h);}
 h[kind].push(ref);
 return {history:hk,prefix:node,fullActionHash:key(full),actionCount:full.length,contextIndices:context,transformGates:gates,evidence:"CONDITIONAL_REPLAY",actualGameCertified:false};
}
for(const b of birthCatalog(db)){
 const {p,steps}=birthActions(db,b);
 assert.equal(key(steps),p.fullActionHash);
 births[b.input]={...index(steps,b.branch,b.input,"births"),origin:b.origin,branch:b.branch,sourceStateHash:p.stateHash,allowedDifficulties:p.allowedDifficulties};
}
for(const [id,r] of Object.entries(db.populationFrontierChronology.routes)){
 const {p,steps}=birthActions(db,r),full=[...steps,...r.actions];
 assert.equal(key(full),r.fullActionHash,"Route hash mismatch "+id);
 routes[id]={...index(full,r.branch,id,"routes"),origin:r.origin,branch:r.branch,birth:r.input,sourceStateHash:r.canonicalStateHash,allowedDifficulties:r.allowedDifficulties};
}
const routeCount=Object.keys(routes).length,birthCount=Object.keys(births).length;
const originOf=ref=>(routes[ref]||births[ref])?.origin;
const crossOriginHistories=[...histories.values()].filter(h=>new Set([...h.routes,...h.births].map(originOf)).size>1).length;
const crossOriginGateGroups=[...byTransform.values()].filter(g=>new Set(g.witnesses.map(([ref])=>originOf(ref))).size>1).length;
const summary={crossOriginHistories,crossOriginGateGroups,birthCount,routeCount,researchSteps,uniqueResearchPrefixes:nodes.length-1,sharedPrefixSteps:researchSteps-(nodes.length-1),historyCount:histories.size,sharedHistories:[...histories.values()].filter(h=>h.routes.length+h.births.length>1).length,gateCount,uniqueGateGroups:byTransform.size,unresolved:unresolved.length,finalCertified:0};
const out={schema:"CONDITIONAL_RESEARCH_WITNESS_INDEX_V1",sourceMetadataSha256:db.sourceMetadataSha256,sourceLedgerFingerprint:db.populationFrontierChronology.fingerprint,sourceLedgerHash:key(Object.entries(db.populationFrontierChronology.routes).map(([id,r])=>[id,r.fullActionHash])),scope:"Ordered explicit research actions; original full action witnesses and context positions required. Not a complete research graph, active-set proof, or game certificate.",summary,nodes,histories:Object.fromEntries(histories),births,routes,transformGates:Object.fromEntries(byTransform),unresolved};
// Exercise the production lookup across all gate groups, including ancestor
// suffix selection. The recorded gate is evidence, not a new replay.
const lookup=createResearchWitnessLookup(out,out);
for(const g of byTransform.values()){
 assert(lookup.candidates(g.branch,g.transform,g.prefix).some(x=>x.prefix===g.prefix&&x.researchSuffix.length===0));
}
const raw=Buffer.from(JSON.stringify(out)),gz=gzipSync(raw);
const file="soldier-final-career-research-index.json.gz";
fs.writeFileSync("public/data/"+file,gz);
const sha256=createHash("sha256").update(gz).digest("hex");
fs.writeFileSync("public/branch-soldier-research-witness-summary.js","// Generated by tools/build-final-career-research-index.mjs\nexport const researchWitnessSummary="+JSON.stringify({...summary,file,sha256,sourceLedgerFingerprint:out.sourceLedgerFingerprint,sourceLedgerHash:out.sourceLedgerHash})+";\n");
console.log(JSON.stringify({...summary,bytes:gz.length,sha256}));
