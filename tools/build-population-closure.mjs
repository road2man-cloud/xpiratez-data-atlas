// Persistent, no-depth-limit worklist over the fixed-active numeric model.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {MODEL,createClosureModel,terminalFrontier,assertClosed} from "./population-closure-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode(fs.readFileSync("public/data/branch-soldier-results.json.gz")),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const v=db.populationSearch.versions.D3,bytes=fs.readFileSync("public/data/"+v.file),snap=decode(bytes);
assert.equal(sha(bytes),v.sha256);assert.equal(snap.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const files=["tools/build-population-closure.mjs","tools/population-closure-core.mjs","tools/population-scalar-upper-bound.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/research-training-locks.js","public/data/soldiers-modern-index.json"];
const hashes=Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const fingerprint=key([MODEL,db.sourceMetadataSha256,v.sha256,hashes]),model=createClosureModel(data,snap);
const path=arg("out","population-closure.json.gz"),prior=fs.existsSync(path)?decode(fs.readFileSync(path)):null;
if(prior)assert.equal(prior.fingerprint,fingerprint,"Explicit closure-engine migration required");
const nodes=prior?.nodes||[],interned=new Map(nodes.map((n,i)=>[JSON.stringify(n.state),i]));
const groups=prior?.groups||[],groupIndex=new Map(groups.map((g,i)=>[g.signature,i]));
const started=performance.now(),seconds=Number(arg("seconds","20")),maxStates=Number(arg("group-states","10000")),maxNewNodes=Number(arg("new-states","60000")),quantum=Number(arg("quantum","160"));
assert(Number.isFinite(seconds)&&seconds>0&&[maxStates,maxNewNodes,quantum].every(n=>Number.isSafeInteger(n)&&n>0));
const initialNodes=nodes.length,metrics={independentTransitions:0,transitionRequests:0,cacheHits:0,newStates:0,duplicateStates:0,expanded:0,newClosedGroups:0,gateRejected:0,outsideModel:0,repeatEdges:0,selfLoops:0,terminalDominanceRemoved:0};
function intern(p){
 const k=JSON.stringify(p);if(interned.has(k)){metrics.duplicateStates++;return interned.get(k);}
 const id=nodes.length;nodes.push({state:p,edges:{}});interned.set(k,id);metrics.newStates++;return id;
}
// Build the complete original pair catalog. Every observed history is an
// alias, not a new independent solve. A failed birth gate is not impossibility.
const origins=data.profiles.map(p=>p.id),branches=db.populationSearch.branches;
assert.equal(origins.length,72);assert.equal(branches.length,1064);assert.equal(new Set(branches).size,branches.length);
const bi=new Map(branches.map((id,i)=>[id,i])),pairGroups=Array.from({length:origins.length*branches.length},()=>[]),pairHistoryCount=new Uint16Array(pairGroups.length),pairAdmittedCount=new Uint16Array(pairGroups.length);
for(let oi=0;oi<data.profiles.length;oi++){
 const p=data.profiles[oi],roots=model.initial(p).map(intern);
 for(let hi=0;hi<snap.histories.length;hi++){
  const h=snap.histories[hi],j=bi.get(h.branchId);assert(j!==undefined);
  const pi=oi*branches.length+j;pairHistoryCount[pi]++;
  if((p.requires||[]).some(id=>!model.active(model.hs[hi],id)))continue;
  pairAdmittedCount[pi]++;
  const mask=model.reachable(p.soldierType,model.available[hi]).toString(16),signature=key([mask,roots]);
  let gi=groupIndex.get(signature);
  if(gi===undefined){
   gi=groups.length;groupIndex.set(signature,gi);
   groups.push({signature,mask,roots:[...new Set(roots)],ids:[...new Set(roots)],parents:[...new Set(roots)].map(()=>null),cursor:0,closed:false,frontier:[],outsideModelEdges:0,repeatEdges:0,selfLoops:0,aliases:[]});
  }
  if(!pairGroups[pi].includes(gi))pairGroups[pi].push(gi);
  if(!prior)groups[gi].aliases.push([oi,hi]);
 }
}
const pairMapHash=key([origins,branches,pairGroups,Array.from(pairHistoryCount),Array.from(pairAdmittedCount)]);
if(prior)assert.equal(prior.pairMapHash,pairMapHash,"Pair mapping changed");
const beforeClosed=groups.filter(g=>g.closed).length;
const beforePairClosed=pairGroups.filter(gs=>gs.length&&gs.every(i=>groups[i].closed)).length;
const sets=new Map();
function expand(gi){
 const g=groups[gi],mask=BigInt("0x"+g.mask);let membership=sets.get(gi);
 if(!membership){membership=new Set(g.ids);sets.set(gi,membership);}
 let n=0;
 while(g.cursor<g.ids.length&&n<quantum&&g.ids.length<maxStates&&nodes.length-initialNodes<maxNewNodes&&performance.now()-started<seconds*1000){
  const j=g.cursor,id=g.ids[j],node=nodes[id];
  // Each expansion is atomic, including all allowed actions.
  for(const a of model.actions(node.state,mask)){
   metrics.transitionRequests++;const k=String(a);let to;
   if(Object.hasOwn(node.edges,k)){metrics.cacheHits++;to=node.edges[k];}
   else{
    metrics.independentTransitions++;const r=model.transition(node.state,a);
    to=r.kind==="OK"?intern(r.state):r.kind==="GATE"?-1:-2;node.edges[k]=to;
   }
   if(to===-1){metrics.gateRejected++;continue;}
   if(to===-2){g.outsideModelEdges++;metrics.outsideModel++;continue;}
   if(membership.has(to)){g.repeatEdges++;metrics.repeatEdges++;if(to===id){g.selfLoops++;metrics.selfLoops++;}continue;}
   membership.add(to);g.ids.push(to);g.parents.push([j,a]);
  }
  g.cursor++;n++;metrics.expanded++;
 }
 if(g.cursor===g.ids.length){
  assertClosed(g,nodes,model);
  g.frontier=terminalFrontier(g.ids,nodes,model);g.closed=true;
  g.closureHash=key([g.signature,g.ids,g.parents,g.frontier,g.outsideModelEdges]);
  metrics.newClosedGroups++;metrics.terminalDominanceRemoved+=g.ids.length-g.frontier.length;
 }
 return n;
}
// First try small/high reuse groups. Round-robin quantum prevents a large
// cyclic group from starving other groups. Budget exhaustion is resumable.
const popularity=Array(groups.length).fill(0);for(const gs of pairGroups)for(const i of gs)popularity[i]++;
const popcount=s=>BigInt("0x"+s).toString(2).replace(/0/g,"").length;
const queue=groups.map((g,i)=>i).filter(i=>!groups[i].closed&&groups[i].ids.length<maxStates).sort((a,b)=>popcount(groups[a].mask)-popcount(groups[b].mask)||popularity[b]-popularity[a]||a-b);
let progress=true;
while(progress&&performance.now()-started<seconds*1000&&nodes.length-initialNodes<maxNewNodes){
 progress=false;
 for(const gi of queue){
  const g=groups[gi];if(g.closed||g.ids.length>=maxStates)continue;
  if(performance.now()-started>=seconds*1000||nodes.length-initialNodes>=maxNewNodes)break;
  if(expand(gi))progress=true;
 }
}
const pairStatus=[],representatives=new Map(),closedPairs=[];
let limitedDirect=0,limitedEquivalent=0,partial=0,unmodeled=0;
for(let pi=0;pi<pairGroups.length;pi++){
 const gs=pairGroups[pi];let status="UNMODELED";
 if(gs.length){
  if(gs.every(i=>groups[i].closed)){
   const sig=gs.slice().sort((a,b)=>a-b).join(",");
   if(representatives.has(sig)){status="LIMITED_EQUIVALENT";limitedEquivalent++;}
   else{status="LIMITED_DIRECT";representatives.set(sig,pi);limitedDirect++;}
   closedPairs.push([pi,gs,representatives.get(sig)]);
  }else{status="LIMITED_PARTIAL";partial++;}
 }else unmodeled++;
 pairStatus.push(status);
}
const totals={};for(const k of Object.keys(metrics))totals[k]=(prior?.totals?.[k]||0)+metrics[k];
const elapsed=(performance.now()-started)/1000,totalSeconds=(prior?.summary?.cumulativeSeconds||0)+elapsed,limitedClosed=limitedDirect+limitedEquivalent;
const summary={pairCount:pairGroups.length,fullDirect:0,fullEquivalent:0,fullImpossible:0,fullCompleted:0,fullCompletionRate:0,limitedDirect,limitedEquivalent,limitedClosed,limitedPartial:partial,unmodeled,knownEvidencePairs:db.populationJointCoverage?.uniqueCovered||0,groups:groups.length,closedGroups:groups.filter(g=>g.closed).length,openGroups:groups.filter(g=>!g.closed).length,groupBudgetBlocked:groups.filter(g=>!g.closed&&g.ids.length>=maxStates).length,historyAliases:groups.reduce((n,g)=>n+g.aliases.length,0),observedResearchMasks:model.bdd.observedMasks,bddNodes:model.bdd.nodes.length-2,globalStates:nodes.length,groupStateReferences:groups.reduce((n,g)=>n+g.ids.length,0),pendingStates:groups.reduce((n,g)=>n+g.ids.length-g.cursor,0),newClosedGroups:groups.filter(g=>g.closed).length-beforeClosed,newLimitedClosedPairs:limitedClosed-beforePairClosed,elapsedSeconds:elapsed,cumulativeSeconds:totalSeconds,limitedClosedPerHour:totalSeconds>0?limitedClosed*3600/totalSeconds:null,fullCompletedPerHour:0,cacheHitRate:totals.transitionRequests?totals.cacheHits/totals.transitionRequests:0,transitionSavingRate:totals.transitionRequests?1-totals.independentTransitions/totals.transitionRequests:0,stateCompressionRate:groups.reduce((n,g)=>n+g.ids.length,0)?1-nodes.length/groups.reduce((n,g)=>n+g.ids.length,0):0,fullRemainingWork:null,fullEtaHours:null,unboundedDepth:true,actualGameCertified:0,globalOptimalCertified:0,metrics,totals};
const result={schemaVersion:1,kind:"POPULATION_REACHABILITY_CLOSURE",model:MODEL,fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,sourceD3Sha256:v.sha256,scope:{included:["observed final active research","min and max birth vectors","deterministic healthy no-clone non-retiring transformations","optional whole combat-cap growth","unlimited conditional resources","no depth cap"],excluded:["all unobserved or intermediate research histories","all intermediate birth RNG vectors","partial combat growth and special training growth","random transformations","promotion and commendations","campaign timing, resource acquisition, events, wounds, death and cloning"],presenceQuotient:"No selective history/bonus removal in this ruleset; history/bonus counts are presence-only, full reset clears all.",fullProof:"NO_FULL_GAME_PROOF; closed finite submodel only"},origins,branches,bdd:model.bdd,rules:snap.rules,groups,nodes,pairGroups,pairHistoryCount:Array.from(pairHistoryCount),pairAdmittedCount:Array.from(pairAdmittedCount),pairMapHash,pairStatus,closedPairs,summary,totals};
fs.writeFileSync(path+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(path+".tmp",path);
console.log(JSON.stringify(summary));
