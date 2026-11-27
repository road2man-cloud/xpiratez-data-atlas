// Final publication gate. Research-goal witnesses are inputs, not final rows.
// A bounded search, an empty processed edge list, or a better numeric vector
// cannot prove the absence of future research/transformation outcomes.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {createBodyCareerScope,SCOPE} from "./atlas-body-career-scope.mjs";
import {packBodyScopeInventory,unpackBodyScopeWitness} from "../public/branch-soldier-final-scope-codec.js";
import {createSharedPrefixReplay} from "./population-shared-prefix-replay-v3-benefit.mjs";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {gunzipSync} from "node:zlib";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createFinalReplayCheckpoint,replayContext} from "./atlas-final-replay-checkpoint.mjs";
export const FINAL_SCHEMA="ATLAS_CAREER_BODY_SCOPE_CLOSURE_V3";
const sort=x=>[...x].sort();
const researchAction=a=>["research","repeatResearch","freeResearch","eventResearch","missionResearch"].includes(a.type);
const relevantAction=a=>researchAction(a)||a.type==="transform"||a.type==="conditionalCapGrowth"||a.type==="conditionalPromotion"||a.type==="conditionalMedal";
const same=(a,b)=>key(a)===key(b);
export function finalIdentity(pair){return key([pair.origin,pair.branch,pair.body,pair.difficulties,pair.pathId,pair.traitId]);}
// A baseline is explicit and read from an existing committed registry.
// Never infer equivalence from unchanged row counts or an append claim.
function loadBaseline(ref,db,ledger,sets,budget,sourceHashes){
 if(!ref)return null;
 try{
  if(!/^[a-f0-9]{7,40}$/.test(ref))throw Error("Use a concrete baseline commit SHA");
  const commit=execFileSync("git",["rev-parse",ref+"^{commit}"],{encoding:"utf8"}).trim();
  const previous=hydrateResearchPaths(JSON.parse(gunzipSync(execFileSync("git",["show",commit+":public/data/branch-soldier-results.json.gz"],{maxBuffer:256*1024*1024}))));
  const c=previous.careerCompletion,a=c?.finalCareerAdmission,ss=c?.researchTraitSets,mb=c?.materialBudget;
  assert(a?.schema===FINAL_SCHEMA&&ss&&mb);
  assert.equal(previous.sourceMetadataSha256,db.sourceMetadataSha256);
  assert.equal(ss.replayFingerprint,sets.replayFingerprint);
  assert.equal(a.sourceGraphSha256,ss.sourceGraphSha256);
  assert.equal(a.sourceGraphSha256,previous.populationMissingOriginCareer.sourceGraphSha256);
  assert.equal(mb.sha256,budget.sha256);
  for(const k of ["defaultRankPolicy","flatRollPolicy","lifecyclePolicy"])assert(same(previous.populationMissingOriginCareer.summary[k]??null,ledger.summary[k]??null),"Replay policy changed: "+k);
  assert(same(previous.branches,db.branches)&&same(c.terminalRule,db.careerCompletion.terminalRule)&&same(mb.finite,budget.finite));
  const required=Object.keys(sourceHashes).filter(p=>p!=="tools/atlas-final-career-admission-v5-baseline-checkpoint.mjs");
  for(const p of required)assert.equal(a.sourceHashes?.[p],sourceHashes[p],"Baseline gate changed: "+p);
  for(const [p,h] of Object.entries(a.sourceHashes||{}))assert.equal(sourceHashes[p],h,"Baseline source changed: "+p);
  // Verify the original gate, the exact lifecycle replay implementation,
  // and the data/snapshot dependencies against the committed baseline.
  // The new orchestration module itself need not exist in the baseline.
  const files=new Set(),queue=[...required,"tools/population-shared-lifecycle-replay.mjs","tools/atlas-terminal-research-trait-sets.mjs","tools/atlas-research-line-admission.mjs"];
  while(queue.length){
   const p=queue.pop();if(files.has(p))continue;files.add(p);
   const source=fs.readFileSync(p,"utf8");
   for(const m of source.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["'](\.[^"']+)["']/gm))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1].split("?")[0])));
  }
  for(const p of ["public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json"])files.add(p);
  execFileSync("git",["diff","--quiet",commit,"--",...files]);
  return {commit,admission:a,sets:ss,budget:mb,known:new Set(mb.checkedRouteIds||[])};
 }catch(e){console.error("FINAL_BASELINE_DISABLED "+String(e.message));return null;}
}
export function classifyFinalCareers({db,ledger,data,replay,lines,baselineRef=null}){
 const c=db.careerCompletion,sets=c.researchTraitSets,budget=c.materialBudget,known=new Set(budget.checkedRouteIds||[]);
 const branches=new Map(db.branches.map(b=>[b.id,b])),first=createBodyCareerScope(data,db.branches,replay),prefix=createSharedPrefixReplay(replay,{limit:8,checkpointLimit:128});
 const sourceHashes=Object.fromEntries(["tools/atlas-final-career-admission-v5-baseline-checkpoint.mjs","tools/atlas-final-career-admission-v3-body-scope.mjs","tools/atlas-final-replay-checkpoint.mjs","tools/atlas-body-career-scope.mjs","public/branch-soldier-final-scope-codec.js","tools/atlas-first-successor-obligations.mjs","tools/final-career-repeat-quotient.mjs","tools/atlas-research-material-policy.mjs","tools/population-scalar-upper-bound.mjs"].map(p=>[p,key(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
 const checkpoint=createFinalReplayCheckpoint(replayContext({db,ledger,sets,budget,sourceHashes}));
 const baseline=loadBaseline(baselineRef,db,ledger,sets,budget,sourceHashes);
 const incremental={baseline:baseline?.commit||null,reusedClosed:0,reusedOpen:0,fresh:0};
 function reuse(id,s,raw,p,line){
  if(!baseline||!baseline.known.has(id))return null;
  const old=baseline.admission.witnesses[id],prior=baseline.sets.records[id];
  if(!old||!prior||!same(baseline.budget.records[id]||null,budget.records[id]||null))return null;
  if(old.stateHash!==s.stateHash||old.actionHash!==s.actionHash||old.pairId!==line.id||prior.snapshotHash!==s.snapshotHash||prior.snapshotIdentity!==s.snapshotIdentity||prior.pathId!==s.pathId||prior.traitId!==s.traitId||!same(prior.goals,s.goals)||!same(baseline.sets.paths[s.pathId],sets.paths[s.pathId])||!same(baseline.sets.traits[s.traitId],sets.traits[s.traitId]))return null;
  if(old.status==="FINAL_CLOSED"||old.status==="FINAL_EQUIVALENT"){
   const cert=old.certificate;
   if(!cert||key(cert)!==old.proofHash||cert.graph!==baseline.admission.sourceGraphSha256||cert.source!==sets.sourceMetadataSha256||cert.replay!==sets.replayFingerprint||cert.state!==s.stateHash||cert.actions!==s.actionHash||cert.pair!==line.id||!same(cert.terminalGoals,s.goals)||!same(cert.sourceHashes,baseline.admission.sourceHashes)||cert.independentReplay!==true||!cert.terminalEffect||cert.openRules?.length||cert.openGrowth||cert.unknownRules?.length||cert.unknownResearchFields?.length)return null;
   const certificate={...cert,graph:ledger.sourceGraphSha256,sourceHashes};
   incremental.reusedClosed++;
   return {status:"FINAL_CLOSED",certificate,proofHash:key(certificate)};
  }
  if(!["OPEN_RESEARCH_OR_GROWTH","OPEN_TRANSFORMATION"].includes(old.status)||old.independentReplay!==true)return null;
  // These are negative observations, never a closure certificate.
  const {pairId,stateHash,actionHash,...result}=unpackBodyScopeWitness(old,baseline.admission.inventory);
  incremental.reusedOpen++;return result;
 }
 const graphChildren=new Map(),nodeRecords=new Map(),projectedHistory=new Map();
 const profileById=new Map(data.profiles.map(p=>[p.id,p])),ruleById=new Map(data.transformations.map(r=>[r.id,r]));
 // This compact projection is a scheduling prefilter, NOT a closure proof.
 // It mirrors initial previousTransformations, reset and removeTransformations.
 // A positive certificate still independently replays the entire candidate.
 function projectActions(previous,actions){
  let h=previous&&new Set(previous);
  for(const a of actions){
   if(a.type==="recruit"&&a.soldier==="origin"){
    const p=profileById.get(a.profile);h=p?new Set(Object.entries(p.previousTransformations||{}).filter(([,n])=>Number(n)>0).map(([k])=>k)):null;
   }else if(a.type==="transform"&&a.soldier==="origin"){
    const r=ruleById.get(a.transform);if(!h||!r||r.createsClone)return null;
    if(r.reset)h.clear();else for(const k of r.removeTransformations||[])h.delete(k);
    h.add(r.id);
   }else if(!["recruit","transform","research","repeatResearch","freeResearch","eventResearch","missionResearch","externalInputs","conditionalCapGrowth","conditionalPromotion","conditionalMedal","advanceMonth","campaignContext"].includes(a.type))return null;
  }
  return h;
 }
 for(const [id,r] of Object.entries(sets.records)){const raw=ledger.routes[id];if(raw)nodeRecords.set(raw.sourceGraph+"|"+raw.sourceNode,{id,r});}
 for(const [gid,g] of Object.entries(ledger.graphs)){
  const successors=new Array(g.nodes.length).fill(null);
  for(let i=g.nodes.length-1;i>0;i--){
   const n=g.nodes[i],p=n.parent;assert(Number.isInteger(p)&&p<i);
   // Only a body-preserving continuation belongs to this endpoint's
   // obligation inventory. Research-only children and count-only repeats
   // do not by themselves invalidate a completed final trait set.
   const a=g.nodes[p];if(n.body!==a.body)continue;
   const improves=z=>z.traits.some(t=>!a.traits.includes(t))||["raw","capRaw"].some(k=>z[k].some((v,j)=>v>a[k][j]));
   if(n.stateHash!==a.stateHash&&n.steps.some(relevantAction)&&improves(n))successors[p]??=i;
   else if(successors[i]!==null&&improves(g.nodes[successors[i]]))successors[p]??=successors[i];
  }
  graphChildren.set(gid,successors);
  const history=[];
  for(const [i,n] of g.nodes.entries())history.push(i===0?projectActions(null,g.birthActions):projectActions(history[n.parent],n.steps));
  projectedHistory.set(gid,history);
 }
 // A selected active victory route is the research endpoint. Unrelated
 // equipment research and alternative victory targets do not change this
 // soldier's permanent vector or retained trait set in this model.
 // Every possible FIRST transformation is considered, including unsupported
 // ones. If none can occur, no later body/trait reset can occur either.
 function getHistory(gid,i){
  const g=ledger.graphs[gid],stack=[];let j=i;
  while(j){stack.push(g.nodes[j].steps);j=g.nodes[j].parent;}
  const actions=[...g.birthActions,...stack.reverse().flat()];
  const w=prefix.load({id:gid+"|"+i,actions});
  assert.equal(exactWorld(w),g.nodes[i].stateHash);
  const state=member(w).state;
  assert(state.exactStats&&!state.retired&&state.history instanceof Map);
  return {w,state,actions};
 }
 // The indexed research rule schema contains no direct soldier mutation
 // fields. A changed schema must be reviewed before certifying closure.
 const researchFields=new Set(["requires","dependencies","disables","reenables","unlocks","lookup","getOneFree","getOneFreeProtected","sequentialGetOneFree","repeatable","needItem","destroyItem","returnsItem","neededItem","requiresBaseFunc","cost"]);
 const unknownResearchFields=[...new Set(Object.values(data.researchRules).flatMap(Object.keys).filter(k=>!researchFields.has(k)))];
 const witnesses={},rows=[],counts={},regressions=[],ogreSeven=[],scopeTotals={branchExcluded:0,otherObjectives:0,repeatFixed:0,allBodyClosedWitnesses:0,bodyScopedClosedWitnesses:0};
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
     try{
      const consumed=Object.fromEntries(Object.entries(budget.records[id]?.use||{}).map(([k,v])=>[k,v.consumed||0]));
      const h=projectedHistory.get(raw.sourceGraph)[raw.sourceNode];
      const inputs={body:p.body,history:h,historyKnown:!!h,active:new Set(path.active),raw:n.raw,capRaw:n.capRaw,finite:budget.finite,consumed};
      assert([...inputs.active].every(k=>typeof k==="string"),"Research path must be hydrated before assessment");
      let q=first.assess(inputs,b),independentReplay=false,terminalEffect=null;
      const cacheable=q.possibleExact&&!unknownResearchFields.length;
      const inputKey=cacheable?key([line.id,p.origin,p.branch,p.body,p.difficulties,p.pathId,p.traitId,s.goals,s.stateHash,s.actionHash,[...inputs.active].sort(),[...h].sort(),n.raw,n.capRaw,consumed,unknownResearchFields]):null;
      let cached=inputKey?checkpoint.get(inputKey):null;
      if(cached?.certificate){const v=cached.certificate;if(cached.proofHash!==key(v)||v.state!==s.stateHash||v.actions!==s.actionHash||v.pair!==line.id||v.schema!==FINAL_SCHEMA||!v.independentReplay)cached=null;}
      if(cached&&!cached.certificate&&!cached.independentReplay)cached=null;
      if(!cached&&cacheable)cached=reuse(id,s,raw,p,line);
      if(cached){
       result=cached;
       if(result.certificate){result.certificate.graph=ledger.sourceGraphSha256;result.proofHash=key(result.certificate);}
      }else{
      if(cacheable){
       incremental.fresh++;
       const {w,state}=getHistory(raw.sourceGraph,raw.sourceNode);
       assert(state.soldierType===p.body&&!w.pendingFree);
       const active=new Set([...w.researched].filter(k=>!w.disabled.has(k)));
       assert(s.goals.every(id=>{const t=c.terminalRule.targets.find(t=>t.id===id);return t&&t.researchGoals.every(k=>active.has(k))&&!(t.inactiveResearch||[]).some(k=>active.has(k));}));
       assert.deepEqual([...state.history.keys()].sort(),[...h].sort(),"History projection mismatch");
       const f=replay.finish(w);assert.deepEqual(f.raw,n.raw);assert.deepEqual(f.capRaw,n.capRaw);
       assert.deepEqual([...active].sort(),[...inputs.active].sort(),"Research active-set mismatch");
       q=first.assess({...inputs,history:new Set(state.history.keys()),historyKnown:state.historyKnown!==false,active,raw:f.raw,capRaw:f.capRaw},b,w);
       if(!q.closed&&!q.openGrowth&&q.possibleExact&&!unknownResearchFields.length){
        const cycle=first.proveCapCycle({...inputs,history:new Set(state.history.keys()),historyKnown:state.historyKnown!==false,active,raw:f.raw,capRaw:f.capRaw},b,w);
        if(cycle){q.cycleProof=cycle;q.blocked.push(...q.open.map(x=>({id:x.id,reason:"FINITE_CAP_RESTORED_CYCLE",evidence:{proofHash:key(cycle)}})));q.open=[];q.missingResearch=[];q.closed=true;}
       }
       independentReplay=true;
       terminalEffect=key([p.origin,p.branch,p.body,p.difficulties,p.pathId,s.goals,[...state.bonusIds].sort(),[...state.history.keys()].sort(),state.armorId,state.status,state.rank,state.initialStats,state.currentStats,f.permanentVector,f.permanentCapVector,f.medals,consumed]);
      }
      const evidence={firstRules:q.ruleCount,blocked:q.blocked,openRules:q.open,alternativeObjectives:q.alternatives,repeatProofs:q.repeats,...(q.cycleProof?{cycleProof:q.cycleProof}:{}),missingResearch:q.missingResearch.length,exampleResearch:q.missingResearch.slice(0,12),openGrowth:q.openGrowth,unknownRules:q.unknownRules,unknownResearchFields,independentReplay,allBodyFirstActionsClosed:q.allBodyClosed};
      if(q.closed&&independentReplay&&!unknownResearchFields.length){
       const certificate={schema:FINAL_SCHEMA,source:sets.sourceMetadataSha256,replay:sets.replayFingerprint,graph:ledger.sourceGraphSha256,state:s.stateHash,actions:s.actionHash,pair:line.id,terminalGoals:s.goals,sourceHashes,scope:SCOPE,...evidence,terminalEffect};
       result={status:"FINAL_CLOSED",certificate,proofHash:key(certificate)};
      }else result={status:q.openGrowth||q.missingResearch.length?"OPEN_RESEARCH_OR_GROWTH":"OPEN_TRANSFORMATION",...evidence};
      if(inputKey&&independentReplay)checkpoint.put(inputKey,result);
      }
      const ev=result.certificate||result;
      scopeTotals.branchExcluded+=(ev.blocked||[]).filter(x=>x.reason==="SELECTED_BRANCH_MODEL_EXCLUDES_RESEARCH").length;
      scopeTotals.otherObjectives+=(ev.alternativeObjectives||[]).length;scopeTotals.repeatFixed+=(ev.repeatProofs||[]).length;
      if(result.status==="FINAL_CLOSED"){scopeTotals[ev.allBodyFirstActionsClosed?"allBodyClosedWitnesses":"bodyScopedClosedWitnesses"]++;approved.push({...ref,closureProofHash:result.proofHash});}
     }catch(e){result={status:"UNRESOLVED_CLOSURE_REPLAY",reason:String(e.message)};}
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
 // A repeat count is not an additional final trait set when both exact
 // closed witnesses have the same permanent result and same research path.
 // Require an actually replayed shorter surgery subsequence, removing
 // only repeat occurrences. Preserve distinct research paths and all
 // non-equivalent numeric / finite-material witnesses.
 const rawClosedCombinations=rows.length,equivalent=[];
 const order=id=>ledger.routes[id]?.order||[];
 function shorterRepeat(a,b){
  const x=order(a),y=order(b);if(x.length>=y.length)return false;
  const used=new Set(x);let i=0;
  for(const k of y){if(i<x.length&&x[i]===k)i++;else if(!used.has(k))return false;}
  return i===x.length;
 }
 const kept=[];
 for(const row of rows.slice().sort((a,b)=>order(a.routeId).length-order(b.routeId).length||a.id.localeCompare(b.id))){
  const refs=[row,...row.alternatives];
  const master=kept.find(k=>refs.every(r=>[k,...k.alternatives].some(q=>witnesses[q.routeId].certificate.terminalEffect===witnesses[r.routeId].certificate.terminalEffect&&shorterRepeat(q.routeId,r.routeId))));
  if(!master){kept.push(row);continue;}
  equivalent.push({pair:row.id,representative:master.id,routes:refs.map(r=>r.routeId)});
  for(const r of refs){
   const q=[master,...master.alternatives].find(q=>witnesses[q.routeId].certificate.terminalEffect===witnesses[r.routeId].certificate.terminalEffect&&shorterRepeat(q.routeId,r.routeId));
   const v=witnesses[r.routeId];v.status="FINAL_EQUIVALENT";v.equivalentTo=q.routeId;v.equivalentPair=master.id;
   counts.FINAL_CLOSED--;count("FINAL_EQUIVALENT");
   const cls=c.classifications[r.source][r.routeId];cls.status="FINAL_EQUIVALENT";cls.finalCareerStatus=v.status;cls.nextCareerRoute=q.routeId;
  }
 }
 rows.splice(0,rows.length,...kept);
 const finalIds=new Set(rows.map(r=>r.id));assert.equal(finalIds.size,rows.length);
 assert(regressions.length>0,"Ogre 6 to 7 regression witness missing");
 for(const r of regressions)assert(witnesses[r.from].status!=="FINAL_CLOSED","Ogre intermediate admitted");
 const inventory=packBodyScopeInventory(witnesses);
 return {schema:FINAL_SCHEMA,inventory,sourceMetadataSha256:sets.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,scope:"Selected active victory research and fixed final soldier body, with cap growth restored after each repeat. Other bodies, clone offspring and item conversion are separate objectives; excluded research follows the explicit branch model. Exact same-body repeat fixed points use replay and conditional ordinary supplies only. Unknown actions fail open. No proof of return cycles, global optimum, actual gameplay or campaign-wide impossibility.",sourceHashes,rows,witnesses,equivalent,summary:{scope:SCOPE,scopeTotals,scopeReplay:first.stats,incremental,replayCheckpoint:checkpoint.metrics,byFinalBody:Object.fromEntries([...new Set(rows.map(r=>sets.pairs[r.id].body))].sort().map(body=>[body,rows.filter(r=>sets.pairs[r.id].body===body).length])),reclassifiedCombinations:lines.length,classifiedWitnesses:Object.keys(witnesses).length,rawClosedCombinations,equivalentCombinations:equivalent.length,completeCombinations:rows.length,explorationCombinations:lines.length-rows.length-equivalent.length,completeWitnesses:counts.FINAL_CLOSED||0,counts,closureReplay:prefix.metrics,ogreRegression:regressions,ogreSeven}};
}
