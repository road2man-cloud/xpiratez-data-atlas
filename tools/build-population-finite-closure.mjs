// Compute an exact quotient and 12-stat Pareto closure over the recorded D3
// transition graph. All original path labels remain in the original asset.
// A finite-model certificate is NOT a complete game-campaign certificate.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {createFiniteClosure} from "./population-finite-closure-core.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const key=x=>sha(JSON.stringify(x));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const decode=b=>JSON.parse(gunzipSync(b));
const write=(p,o)=>{fs.writeFileSync(p+".tmp",gzipSync(Buffer.from(JSON.stringify(o)),{level:6}));fs.renameSync(p+".tmp",p);};
const db=decode(fs.readFileSync("public/data/branch-soldier-results.json.gz"));
const p=db.populationSearch,v=p.versions.D3;
assert(v&&v.depth===3&&v.summary.scope==="FIXED_ACTIVE_RESEARCH_D3");
const graphBytes=fs.readFileSync("public/data/"+v.file);
assert.equal(sha(graphBytes),v.sha256);
const graph=decode(graphBytes);
assert.equal(graph.kind,"POPULATION_FIXED_ACTIVE_DAG");
assert.equal(graph.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(graph.engine,v.engine);assert.equal(graph.depth,v.depth);
assert.deepEqual(graph.origins,p.origins);assert.deepEqual(graph.branches,p.branches);
assert.deepEqual(graph.matrix,v.matrix);
const files=["tools/population-finite-closure-core.mjs","tools/build-population-finite-closure.mjs"];
const sourceHashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"))]));
const identity=key([db.sourceMetadataSha256,v.sha256,v.engine,sourceHashes]);
const checkpoint=arg("checkpoint","population-finite-closure-d3.checkpoint.json.gz");
const out=arg("out","public/data/soldier-population-finite-closure-d3.json.gz");
const seconds=Number(arg("seconds","90")),chunk=Number(arg("chunk","50"));
assert(Number.isFinite(seconds)&&seconds>0&&Number.isSafeInteger(chunk)&&chunk>0);
const start=performance.now();
let old=null;
if(fs.existsSync(checkpoint)&&!process.argv.includes("--fresh")){
 const c=decode(fs.readFileSync(checkpoint));
 assert.equal(c.identity,identity,"Checkpoint engine/source identity mismatch; use --fresh for deliberate recomputation");
 assert.equal(c.digest,key(c.payload),"Checkpoint content digest mismatch");
 old=c.payload;
}
const groups=old?.groups||[],engine=createFiniteClosure(old?.nodes||[]);
let aliases=old?.aliases||0,orderedLabels=old?.orderedLabels||0;
let elapsedBefore=old?.elapsedMs||0,dominanceBefore=old?.terminalDominanceRemoved||0;
function save(){
 const payload={groups,nodes:engine.nodes,aliases,orderedLabels,elapsedMs:elapsedBefore+performance.now()-start,terminalDominanceRemoved:dominanceBefore+engine.metrics.terminalDominanceRemoved};
 write(checkpoint,{identity,digest:key(payload),payload});
}
function group(g,gi){
 assert.equal(g.originProfile,v.groups[gi].originProfile);
 assert.deepEqual(g.historyIndices,v.groups[gi].historyIndices);
 assert.deepEqual(g.branchIds,v.groups[gi].branchIds);
 const edges=new Map(g.edges);
 assert.equal(edges.size,g.edges.length);
 const roots=g.labels.filter(l=>l[2].length===0);
 assert.equal(roots.length,2);assert.deepEqual(roots.map(l=>l[1]).sort(),[0,1]);
 const rootByBand=roots.slice().sort((a,b)=>a[1]-b[1]).map(l=>l[0]);
 const local=new Map();
 function walk(n,left){
  const k=n+"|"+left;if(local.has(k))return local.get(k);
  const s=g.states[n];assert(s&&s.state[0]===s.body);
  assert(left===0||edges.has(n),"Missing successor enumeration at reachable state");
  const es=left?edges.get(n).map(([to,rule,grow])=>{
   assert(graph.rules[rule]&&[0,1].includes(grow));return [rule,grow,walk(to,left-1)];
  }):[];
  const id=engine.intern(left,[s.body,s.raw,s.bonus,s.vector,s.bonusIds],es);
  local.set(k,id);return id;
 }
 const rootClasses=rootByBand.map(n=>walk(n,graph.depth));
 // Every original ordered label is still represented, with its own local
 // state, branch/history aliases, growth decisions, and fees.
 const seen=new Set();
 for(const [n,band,order,growth,fees] of g.labels){
  assert([0,1].includes(band)&&order.length===growth.length&&order.length<=graph.depth&&Number.isSafeInteger(fees));
  const label=JSON.stringify([band,order,growth]);assert(!seen.has(label));seen.add(label);
  let at=rootByBand[band];
  for(let i=0;i<order.length;i++){
   const next=edges.get(at)?.find(e=>e[1]===order[i]&&e[2]===growth[i]);assert(next,"Label has missing transition");at=next[0];
  }
  assert.equal(at,n,"Label terminal state mismatch");
  assert(local.has(n+"|"+(graph.depth-order.length)));
 }
 const count=rootClasses.reduce((s,id)=>s+engine.nodes[id].paths,0);
 assert.equal(count,g.labels.length,"Closed graph path multiplicity differs");
 const mapping=[...local].map(([k,id])=>[...k.split("|").map(Number),id]);
 aliases+=mapping.length;orderedLabels+=count;
 return {originProfile:g.originProfile,rootClasses,aliases:mapping,orderedLabels:count};
}
for(let i=groups.length;i<graph.groups.length;i++){
 groups.push(group(graph.groups[i],i));
 if(groups.length%chunk===0)save();
 if(performance.now()-start>=seconds*1000&&groups.length<graph.groups.length){
  save();console.log(JSON.stringify({status:"CHECKPOINT",processedGroups:groups.length,totalGroups:graph.groups.length,quotientStates:engine.nodes.length,aliases}));process.exit(0);
 }
}
save();
const groupClassMap=new Map(),groupClasses=[],groupToClass=[];
for(const g of groups){
 const k=JSON.stringify(g.rootClasses);let i=groupClassMap.get(k);
 if(i===undefined){i=groupClasses.length;groupClassMap.set(k,i);groupClasses.push({roots:g.rootClasses,frontier:engine.frontier(g.rootClasses.flatMap(id=>engine.nodes[id].frontier))});}
 groupToClass.push(i);
}
const pairClasses=[],pairIndex=new Map();let covered=0;
const matrix=graph.matrix.map(row=>row.map(ids=>{
 if(!ids.length)return -1;
 covered++;
 const members=[...new Set(ids.map(i=>groupToClass[i]))].sort((a,b)=>a-b),k=JSON.stringify(members);
 let i=pairIndex.get(k);
 if(i===undefined){
  i=pairClasses.length;pairIndex.set(k,i);
  const bodyFrontier=engine.frontier(members.flatMap(c=>groupClasses[c].frontier));
  pairClasses.push({members,bodyFrontier,lineageFrontier:engine.frontier(bodyFrontier,false)});
 }
 return i;
}));
assert.equal(covered,v.summary.coveredPairs);
assert.equal(orderedLabels,graph.summary.orderedLabels);
const total=graph.origins.length*graph.branches.length;
const summary={targetPairs:total,globalDirectComplete:0,globalEquivalentComplete:0,globalImpossibleComplete:0,
 limitedClosedPairs:covered,limitedDirectClasses:pairClasses.length,limitedEquivalentPairs:covered-pairClasses.length,limitedUnmodeledPairs:total-covered,
 sourceGroups:groups.length,distinctGroupClasses:groupClasses.length,sourceNumericNodes:graph.summary.numericNodes,sourceOrderedLabels:orderedLabels,
 depthStateOccurrences:aliases,quotientStates:engine.nodes.length,quotientHits:aliases-engine.nodes.length,
 quotientHitRate:1-engine.nodes.length/aliases,pairCalculationReduction:1-pairClasses.length/covered,
 terminalDominanceRemoved:dominanceBefore+engine.metrics.terminalDominanceRemoved,
 elapsedMs:Math.round(elapsedBefore+performance.now()-start),globalPruned:0,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_FINITE_CLOSURE",identity,sourceMetadataSha256:db.sourceMetadataSha256,
 graph:{file:v.file,sha256:v.sha256,engine:v.engine,depth:graph.depth,scope:v.summary.scope},sourceHashes,
 origins:graph.origins,branches:graph.branches,stats:db.stats,rules:graph.rules,groups,groupToClass,groupClasses,matrix,pairClasses,nodes:engine.nodes,summary,
 proof:{method:"INDUCTIVE_ACTION_LABELLED_FINITE_BISIMULATION_AND_TERMINAL_PARETO_DP",closedGraph:true,fullCampaign:false,orderedAliasesPreserved:true,
 scope:"Recorded fixed-active D3 graph only: deterministic healthy live transformations, birth min/max, cap-target growth, assumed resources. No additional research, actual growth sequence, promotion, medals, random outcomes or unbounded repetitions.",
 blockers:["FULL_RESEARCH_CHRONOLOGY_AND_EXCLUSIONS","ALL_BIRTH_VARIANTS_AND_RNG","INTERMEDIATE_GROWTH_AND_TRAINING","CAREER_AND_MEDALS","RESOURCE_AND_TIME_REACHABILITY","UNBOUNDED_REPEAT_TERMINATION_OR_BOUND"]}};
write(out,result);
console.log(JSON.stringify({status:"FINITE_MODEL_CLOSED",file:out,bytes:fs.statSync(out).size,sha256:sha(fs.readFileSync(out)),summary}));
