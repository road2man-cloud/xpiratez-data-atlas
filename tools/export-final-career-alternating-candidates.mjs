// Publication projection only. Never prune the search graph. Keep an actual
// ordered conditional witness for every published candidate, and require one
// shared campaign difficulty and matching original birth/graph root hashes.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {birthActions} from "./population-growth-replay-core.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),ledger=db.populationFrontierChronology;
const data=read("public/data/soldiers-modern-index.json");data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
const fixed=decode("public/data/soldier-final-career-active-closure-v3.json.gz"),exp=decode("public/data/soldier-final-career-research-expansion.json.gz"),ec=decode("public/data/soldier-final-career-expanded-closure.json.gz");
const sourceFile="public/data/soldier-final-career-alternating-v8.json.gz",sourceBytes=fs.readFileSync(sourceFile),alt=JSON.parse(gunzipSync(sourceBytes));
for(const x of [fixed,exp,ec,alt])assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);assert.equal(alt.sourceExpansionFingerprint,exp.fingerprint);assert.equal(alt.sourceExpandedClosureFingerprint,ec.fingerprint);
const rules=new Map(data.transformations.map(x=>[x.id,x])),memo=new Map(),rootMemo=new Map();
function path(g,i,full){const a=[];while(i!==0){const n=g.nodes[i];assert(n&&Number.isInteger(n.parent)&&n.parent<i);a.push(n.steps);i=n.parent;}return full.concat(...a.reverse());}
function fixedPath(id,i){const g=fixed.graphs[id],r=ledger.routes[id];assert(r&&g&&r.fullActionHash===g.rootActionHash&&r.canonicalStateHash===g.rootStateHash);
 let full=rootMemo.get("F|"+id);if(!full){const b=birthActions(db,r);full=[...b.steps,...r.actions];assert.equal(key(full),g.rootActionHash);rootMemo.set("F|"+id,full);}return path(g,i,full);}
function graphPath(ref){const [kind,id,i]=ref,k=[kind,id,i].join("|");if(memo.has(k))return memo.get(k);
 const g=kind==="E"?ec.graphs[id]:alt.graphs[id];assert(g&&g.nodes[i]);
 let full=rootMemo.get(kind+"|"+id);if(!full){
  if(kind==="E"){const e=exp.expansions[id];assert(e&&g.rootStateHash===e.resultStateHash&&g.rootActionHash===e.fullActionHash);assert.equal(fixed.graphs[e.root].nodes[e.node].stateHash,e.sourceStateHash);full=[...fixedPath(e.root,e.node),...e.researchActions];assert.equal(key(full),e.fullActionHash);}
  else{const [sk,si,sn]=g.source,sg=sk==="E"?ec.graphs[si]:alt.graphs[si];assert.equal(sg.nodes[sn].stateHash,g.sourceStateHash);full=[...graphPath(g.source),...g.researchActions];assert.equal(key(full),g.fullActionHash);}
  rootMemo.set(kind+"|"+id,full);
 }
 const out=path(g,i,full);if(memo.size>=120)memo.delete(memo.keys().next().value);memo.set(k,out);return out;
}
const researchTypes=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
function trie(){const nodes=[{parent:null,action:null}],map=new Map();return {nodes,push(parent,action){const k=key([parent,action]);let n=map.get(k);if(n===undefined){n=nodes.length;nodes.push({parent,action});map.set(k,n);}return n;}};}
const research=trie(),actions=trie(),routes={},indexRoutes={},rejects=[];
let inputStates=0,displayCandidates=0,duplicateVectors=0;const certificates={},breakthroughs={},jointWitnesses={},retainedWitnesses={},jointByGraph=new Map();
for(const [request,rs] of Object.entries(alt.jointReceipts||{}))for(const receipt of rs){
 if(!receipt.graph)continue;
 const g=alt.graphs[receipt.graph],t=alt.jointRequests[request],s=g&&alt.sets[g.researchSet],task=alt.tasks[receipt.task];
 assert(g&&t&&s&&task&&receipt.achieved.length>=2&&receipt.achieved.every(k=>s.active.includes(k)));
 const j={request,requested:t.goal,achieved:receipt.achieved,remaining:receipt.remaining,full:receipt.status==="FULL",targets:receipt.targets||task.targets,sourceSet:t.sourceSet,resultSet:g.researchSet,conflicts:receipt.conflicts,envelopeBodies:receipt.envelopeBodies||null};
 const a=jointByGraph.get(receipt.graph)||[];a.push(j);jointByGraph.set(receipt.graph,a);
}
for(const a of jointByGraph.values())a.sort((x,y)=>y.achieved.length-x.achieved.length||Number(y.full)-Number(x.full)||x.request.localeCompare(y.request));
const labels={};
function displayFrontier(g){
 const groups=new Map();
 for(const [i,n] of g.nodes.entries()){
  // For presentation only: never erase other trait sets, rank or medals.
  const k=key([n.body,[...n.traits].sort(),n.rank,Object.entries(n.medals||{}).sort()]),a=groups.get(k)||[];
  const d=(x,y)=>dominates(x.permanentVector,y.permanentVector)&&dominates(x.permanentCapVector,y.permanentCapVector);
  if(a.some(j=>d(g.nodes[j],n)))continue;
  groups.set(k,[...a.filter(j=>!d(n,g.nodes[j])),i]);
 }
 return [...new Set([0,...[...groups.values()].flat()])].sort((a,b)=>a-b);
}
for(const [gid,g] of Object.entries(alt.graphs)){
 inputStates+=g.nodes.length;const base=ledger.routes[g.root];assert(base&&base.origin===g.origin&&base.branch===g.branch);
 const ref=alt.upperRefs?.[gid],bound=ref&&alt.upperBounds?.[ref.bound];let ceiling=null,witness=-1;
 if(bound&&ref.rootStateHash===g.rootStateHash&&ref.researchSet===g.researchSet&&bound.stats.every(x=>x.status==="INDUCTIVE_UPPER")){
  ceiling=bound.stats.map((x,j)=>Math.max(...bound.reachableBodies.map(b=>bound.effectiveUpper[b][j])));
  // Only export a certificate if all recorded concrete states respect the
  // body-specific invariant and one state attains all 12 global axes.
  const consistent=g.nodes.every(n=>bound.rawUpper[n.body]&&bound.effectiveUpper[n.body]&&n.raw.every((v,j)=>v<=bound.rawUpper[n.body][j])&&n.permanentCapVector.every((v,j)=>v<=bound.effectiveUpper[n.body][j]));
  if(consistent)witness=g.nodes.findIndex(n=>n.permanentVector.every((v,j)=>v===ceiling[j]));
  else ceiling=null;
 }
 const tr=alt.upperTransitions?.[gid];
 const transition=tr&&tr.sourceStateHash===g.sourceStateHash&&tr.resultStateHash===g.rootStateHash&&tr.sourceSet===g.sourceSet&&tr.resultSet===g.researchSet&&tr.after===ref?.bound&&alt.upperBounds?.[tr.before]?tr:null;
 const exceeded=n=>transition?transition.beforeAxes.map((v,j)=>v===null?null:Math.max(0,n.permanentVector[j]-v)):Array(12).fill(null);
 const score=n=>exceeded(n).reduce((a,b)=>a+(b??0),0);
 let breakthrough=-1,bestScore=0;
 if(transition)for(const [i,n] of g.nodes.entries()){const sc=score(n);if(sc>bestScore){bestScore=sc;breakthrough=i;}}
 const joint=jointByGraph.get(gid)?.[0];
 const jointApplied=i=>joint?[...new Set(path(g,i,[]).filter(a=>a.type==="transform"&&a.soldier==="origin"&&joint.targets.includes(a.transform)).map(a=>a.transform))].sort():[];
 let jointBest=-1,jointCount=0;
 if(joint)for(const [i,n] of g.nodes.entries()){const count=jointApplied(i).length;if(count>jointCount){jointCount=count;jointBest=i;}}
 const rootTraits=new Set(g.nodes[0].traits),retained=n=>({before:[...rootTraits],after:n.traits,gained:n.traits.filter(k=>!rootTraits.has(k)),lost:[...rootTraits].filter(k=>!n.traits.includes(k))});
 let most=0,lossless=0;
 for(const [i,n] of g.nodes.entries()){
  if(n.traits.length>g.nodes[most].traits.length)most=i;
  if(!retained(n).lost.length&&n.traits.length>g.nodes[lossless].traits.length)lossless=i;
 }
 const selected=[...new Set([...displayFrontier(g),most,lossless,...(witness>=0?[witness]:[]),...(breakthrough>=0?[breakthrough]:[]),...(jointBest>=0?[jointBest]:[])])].sort((a,b)=>a-b);
 for(const i of selected){
  displayCandidates++;const n=g.nodes[i],id="ALT4:"+gid+":"+i;
  try{
   const full=graphPath(["R",gid,i]),ctx=auditOriginCampaignContext(full,data);
   const allowed=ctx.allowedDifficulties.filter(x=>g.allowedDifficulties.includes(x));
   assert(ctx.kind==="compatible"&&allowed.length,"Joint campaign difficulty unresolved");
   const hash=key(full);let p=0,a=0;const gates=[],order=[];
   for(const [j,step] of full.entries()){
    a=actions.push(a,step);
    if(researchTypes.has(step.type))p=research.push(p,step);
    if(step.type==="transform"){const r=rules.get(step.transform);assert(r,"Unindexed transform");
     gates.push({index:j,prefix:p,transform:step.transform,requires:r.requires});if(step.soldier==="origin")order.push(step.transform);
    }
   }
   const v={origin:g.origin,body:n.body,branch:g.branch,order,permanentVector:n.permanentVector,permanentCapVector:n.permanentCapVector,fullActionHash:hash,canonicalStateHash:n.stateHash,allowedDifficulties:allowed,traitEvidence:{retained:n.traits},rank:n.rank,medals:n.medals,rootRoute:g.root,sourceGraph:gid,sourceNode:i,researchSet:g.researchSet,conditionalScopeComplete:g.scopeComplete,actualGameCertified:false};
   const delta=retained(n);
   v.retention={scope:"ACTUAL_REPLAYED_GRAPH_ROOT_TRAIT_DELTA",rootStateHash:g.rootStateHash,...delta,net:delta.after.length-delta.before.length,lossless:delta.gained.length>0&&delta.lost.length===0};
   if(v.retention.lossless)retainedWitnesses[id]={origin:g.origin,branch:g.branch,body:n.body,graph:gid,node:i,fullActionHash:hash,stateHash:n.stateHash,vector:n.permanentVector,...v.retention,actualGameCertified:false};
   if(joint){
    const applied=jointApplied(i);
    const retainedApplied=[...new Set(applied.map(k=>rules.get(k)?.soldierBonusType).filter(k=>k&&delta.gained.includes(k)))].sort();
    v.jointResearch={scope:"JOINT_ACTIVE_RESEARCH_CONDITIONAL_REPLAY",...joint,applied,retainedApplied,activeGoalCount:joint.achieved.length};
    jointWitnesses[id]={origin:g.origin,branch:g.branch,body:n.body,graph:gid,node:i,fullActionHash:hash,vector:n.permanentVector,...v.jointResearch,actualGameCertified:false};
   }
   if(transition){
    const actual=exceeded(n),exceededAxes=actual.filter(x=>x>0).length;
    v.researchTransition={scope:"CONDITIONAL_RESEARCH_TRANSITION_ONLY",sourceSet:g.sourceSet,resultSet:g.researchSet,before:transition.before,after:transition.after,beforeAxes:transition.beforeAxes,afterAxes:transition.afterAxes,raisedAxes:transition.raisedAxes,delta:transition.delta,actualExceeded:actual,exceededAxes};
    if(exceededAxes)breakthroughs[id]={origin:g.origin,branch:g.branch,body:n.body,graph:gid,node:i,fullActionHash:hash,vector:n.permanentVector,...v.researchTransition,actualGameCertified:false};
   }
   if(i===witness){
    v.fixedModelOptimum={policy:bound.policy,bound:ref.bound,vector:ceiling,rootStateHash:g.rootStateHash,researchSet:g.researchSet,scope:"FIXED_RESEARCH_DETERMINISTIC_PERMANENT_VECTOR_ONLY"};
    certificates[id]={origin:g.origin,branch:g.branch,body:n.body,graph:gid,node:i,researchSet:g.researchSet,bound:ref.bound,rootStateHash:g.rootStateHash,stateHash:n.stateHash,fullActionHash:hash,vector:ceiling,allowedDifficulties:allowed,actualGameCertified:false};
   }
   routes[id]=v;indexRoutes[id]={origin:g.origin,branch:g.branch,fullActionHash:hash,prefix:p,fullPrefix:a,transformGates:gates,history:key([g.branch,p]),sourceGraph:gid,sourceNode:i,actionCount:full.length};
  }catch(e){rejects.push({id,reason:String(e.message)});}
 }
}
const summary={sourceStates:inputStates,displayCandidates,published:Object.keys(routes).length,rejected:rejects.length,graphs:Object.keys(alt.graphs).length,origins:new Set(Object.values(routes).map(r=>r.origin)).size,branches:new Set(Object.values(routes).map(r=>r.branch)).size,fullActionNodes:actions.nodes.length-1,researchNodes:research.nodes.length-1,fixedModelOptimumWitnesses:Object.keys(certificates).length,fixedModelOptimumPairs:new Set(Object.values(certificates).map(r=>key([r.origin,r.branch]))).size,fixedModelOptimumResearchSets:new Set(Object.values(certificates).map(r=>r.researchSet)).size,breakthroughWitnesses:Object.keys(breakthroughs).length,breakthroughGraphs:new Set(Object.values(breakthroughs).map(r=>r.graph)).size,breakthroughPairs:new Set(Object.values(breakthroughs).map(r=>key([r.origin,r.branch]))).size,jointWitnesses:Object.keys(jointWitnesses).length,jointGraphs:jointByGraph.size,jointAppliedWitnesses:Object.values(jointWitnesses).filter(r=>r.applied.length>0).length,jointMultipleAppliedWitnesses:Object.values(jointWitnesses).filter(r=>r.applied.length>=2).length,jointMaxApplied:Math.max(0,...Object.values(jointWitnesses).map(r=>r.applied.length)),losslessRetainedWitnesses:Object.keys(retainedWitnesses).length,losslessRetainedGraphs:new Set(Object.values(retainedWitnesses).map(r=>r.graph)).size,losslessRetainedPairs:new Set(Object.values(retainedWitnesses).map(r=>key([r.origin,r.branch]))).size,losslessRetainedSets:new Set(Object.values(retainedWitnesses).map(r=>key([r.origin,r.branch,r.body,[...r.after].sort()]))).size,maxRetainedTraits:Math.max(0,...Object.values(routes).map(r=>r.traitEvidence.retained.length)),jointRetainedWitnesses:Object.values(jointWitnesses).filter(r=>r.retainedApplied.length>0).length,jointMultipleRetainedWitnesses:Object.values(jointWitnesses).filter(r=>r.retainedApplied.length>=2).length,actualGameCertified:0};
const scope="Presentation-only current/cap Pareto representatives inside each conditional research graph, body, trait set, rank and medal class, plus every root. All other states remain in the search graph. No actual-game final certification.";
const common={sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256:sha(sourceBytes),sourceGraphFingerprint:alt.fingerprint,summary,scope};
const write=(p,x)=>fs.writeFileSync("public/data/"+p+".json.gz",gzipSync(JSON.stringify(x)));
write("soldier-final-career-alternating-candidates",{schema:"CONDITIONAL_ALTERNATING_DISPLAY_V1",...common,routes,rejects});
write("soldier-final-career-alternating-candidate-index",{schema:"CONDITIONAL_ALTERNATING_WITNESS_INDEX_V1",...common,nodes:research.nodes,actionNodes:actions.nodes,routes:indexRoutes});
write("soldier-final-career-fixed-model-optima",{schema:"FIXED_MODEL_SIMULTANEOUS_BOUND_ATTAINMENT_V1",...common,scope:"Only the fixed-active-research deterministic nonclone healthy live model and permanent stats without medals. All 12 relaxed bounds attained simultaneously in a concrete conditional witness. Not a proof over alternative research, recruitment, partial growth, RNG, resources, rank or other omitted gameplay.",certificates});
write("soldier-final-career-research-breakthroughs",{schema:"CONDITIONAL_RESEARCH_BOUND_EXCEEDANCE_V1",...common,scope:"A concrete conditional state exceeds at least one finite relaxed upper bound of its immediate pre-research fixed model. Not a global optimum or a game acquisition certificate.",breakthroughs});
write("soldier-final-career-joint-research",{schema:"JOINT_ACTIVE_RESEARCH_CONDITIONAL_WITNESSES_V1",...common,scope:"Jointly active research goals at a concrete replayed graph root. Applied treatment IDs count only actual origin transformations after that root. Not simultaneous retained traits, complete research coverage or actual-game certification.",witnesses:jointWitnesses,requests:alt.jointRequests,receipts:alt.jointReceipts});
write("soldier-final-career-retained-traits",{schema:"CONDITIONAL_LOSSLESS_TRAIT_GAIN_V1",...common,scope:"Concrete recorded traits at graph root and successor. All root traits remain and at least one new trait is present. No claim of globally maximal traits or of real campaign resource acquisition.",witnesses:retainedWitnesses});
fs.writeFileSync("public/branch-soldier-fixed-model-optima-summary.js","export const fixedModelOptimaSummary="+JSON.stringify({...summary,sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphFingerprint:alt.fingerprint,file:"soldier-final-career-fixed-model-optima.json.gz",certificates:Object.entries(certificates).map(([id,c])=>({id,...c}))})+";\n");
console.log(JSON.stringify(summary));
