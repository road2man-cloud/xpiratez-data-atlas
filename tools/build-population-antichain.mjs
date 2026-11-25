// Reachable antichain saturation, no depth limit. Candidate dominance is
// promoted to a proof ONLY after a forward-simulation closure audit.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {createClosureModel,terminalFrontier} from "./population-closure-core.mjs";
import {MODEL,signature,dominates,createSimulationChecker,liveIndex,findCover,verifyCover} from "./population-antichain-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode(fs.readFileSync("public/data/branch-soldier-results.json.gz")),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const bytes=fs.readFileSync(arg("closure","population-closure.json.gz")),base=decode(bytes),partialBytes=fs.readFileSync(arg("partial","population-partial-growth-proof.json.gz")),partial=decode(partialBytes);
const v=db.populationSearch.versions.D3,snapshotBytes=fs.readFileSync("public/data/"+v.file);
assert.equal(sha(snapshotBytes),v.sha256);assert.equal(base.sourceD3Sha256,v.sha256);assert.equal(base.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(partial.closureSha256,sha(bytes));assert.equal(partial.closureFingerprint,base.fingerprint);assert.equal(partial.pairMapHash,base.pairMapHash);
const hashFile=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const [p,h] of Object.entries(partial.hashes))assert.equal(hashFile(p),h,"Source drift "+p);
const hashes={...partial.hashes,"tools/population-antichain-core.mjs":hashFile("tools/population-antichain-core.mjs"),"tools/build-population-antichain.mjs":hashFile("tools/build-population-antichain.mjs")};
const fingerprint=key([MODEL,sha(bytes),sha(partialBytes),hashes]),model=createClosureModel(data,decode(snapshotBytes)),checker=createSimulationChecker(data,model);
const out=arg("out","population-antichain.json.gz"),prior=fs.existsSync(out)?decode(fs.readFileSync(out)):null;
if(prior)assert.equal(prior.fingerprint,fingerprint,"Explicit source/engine migration required");
const nodes=prior?.nodes||[],nodeIndex=new Map(nodes.map((n,i)=>[JSON.stringify(n.state),i]));
const baseIndex=new Map(base.nodes.map((n,i)=>[JSON.stringify(n.state),i]));
const groups=prior?.groups||[];
const started=performance.now(),seconds=Number(arg("seconds","20")),maxNewNodes=Number(arg("new-states","100000")),quantum=Number(arg("quantum","250")),maxRecords=Number(arg("group-records","50000"));
assert(Number.isFinite(seconds)&&seconds>0&&[maxNewNodes,quantum,maxRecords].every(n=>Number.isSafeInteger(n)&&n>0));
const initialNodes=nodes.length,m={edgeRequests:0,localHits:0,sourceHits:0,computed:0,newStates:0,admitted:0,coveredCandidates:0,retiredRepresentatives:0,expanded:0,staleAgendaSkipped:0,newCertified:0,newUnproved:0,gateRejected:0,outsideModel:0};
function intern(p){
 const k=JSON.stringify(p);if(nodeIndex.has(k))return nodeIndex.get(k);
 const id=nodes.length;nodes.push({state:p,edges:{}});nodeIndex.set(k,id);m.newStates++;return id;
}
function transition(id,a){
 m.edgeRequests++;const n=nodes[id],k=String(a);
 if(Object.hasOwn(n.edges,k)){m.localHits++;return n.edges[k];}
 const b=base.nodes[baseIndex.get(JSON.stringify(n.state))];let to;
 if(b&&Object.hasOwn(b.edges,k)){
  m.sourceHits++;const j=b.edges[k];to=j<0?j:intern(base.nodes[j].state);
 }else{
  m.computed++;const t=model.transition(n.state,a);to=t.kind==="OK"?intern(t.state):t.kind==="GATE"?-1:-2;
 }
 n.edges[k]=to;return to;
}
function add(g,id,parent,action,buckets){
 const p=nodes[id].state,k=signature(p),list=buckets.get(k)||[];
 if(findCover(p,g,nodes,buckets)!==null){m.coveredCandidates++;return;}
 const i=g.records.length,keep=[];
 for(const j of list){
  const old=g.records[j];if(!old.live)continue;
  if(dominates(p,nodes[old.id].state)){old.live=false;m.retiredRepresentatives++;}
  else keep.push(j);
 }
 g.records.push({id,parent,action,live:true});keep.push(i);buckets.set(k,keep);m.admitted++;
}
if(!prior)for(let i=0;i<base.groups.length;i++){
 if(partial.proofs[i].status==="PARTIAL_CAP_BOX_PARETO_EXACT")continue;
 const b=base.groups[i],roots=b.roots.map(id=>intern(base.nodes[id].state));
 const g={group:i,mask:b.mask,roots,records:[],cursor:0,status:"OPEN",frontier:[]},buckets=new Map();
 for(const id of roots)add(g,id,null,null,buckets);
 groups.push(g);
}
const bucketsByGroup=new Map(),auditCache=new Map();
function expand(g){
 let buckets=bucketsByGroup.get(g.group);if(!buckets){buckets=liveIndex(g,nodes);bucketsByGroup.set(g.group,buckets);}
 let n=0;const mask=BigInt("0x"+g.mask);
 while(g.cursor<g.records.length&&n<quantum&&g.records.length<maxRecords&&nodes.length-initialNodes<maxNewNodes&&performance.now()-started<seconds*1000){
  const j=g.cursor++,r=g.records[j];n++;
  if(!r.live){m.staleAgendaSkipped++;continue;}
  for(const a of model.actions(nodes[r.id].state,mask)){
   const to=transition(r.id,a);
   if(to===-1){m.gateRejected++;continue;}
   if(to===-2){m.outsideModel++;continue;}
   add(g,to,j,a,buckets);
  }
  m.expanded++;
 }
 if(g.cursor===g.records.length){
  // Recompute transitions used in each proof, including every witness path.
  const audit=verifyCover(g,nodes,model,checker,{replay:true,transitionCache:auditCache});g.audit=audit;
  if(audit.ok){
   g.status="PARTIAL_CAP_BOX_PARETO_EXACT";g.frontier=terminalFrontier(g.records.filter(r=>r.live).map(r=>r.id),nodes,model);
   g.proofHash=key([g.group,g.mask,g.roots,g.records,g.frontier]);m.newCertified++;
  }else{g.status="CANDIDATE_NOT_PROVED";m.newUnproved++;}
 }
 return n;
}
const queue=groups.filter(g=>g.status==="OPEN").sort((a,b)=>base.groups[a.group].ids.length-base.groups[b.group].ids.length||a.group-b.group);
let progress=true;
while(progress&&performance.now()-started<seconds*1000&&nodes.length-initialNodes<maxNewNodes){
 progress=false;
 for(const g of queue){
  if(g.status!=="OPEN"||g.records.length>=maxRecords)continue;
  if(performance.now()-started>=seconds*1000||nodes.length-initialNodes>=maxNewNodes)break;
  if(expand(g))progress=true;
 }
}
const groupById=new Map(groups.map(g=>[g.group,g])),certified=i=>partial.proofs[i].status==="PARTIAL_CAP_BOX_PARETO_EXACT"||groupById.get(i)?.status==="PARTIAL_CAP_BOX_PARETO_EXACT";
const reps=new Map(),pairs=[],pairStatus=[];let direct=0,equivalent=0,partialCount=0,unmodeled=0;
for(let i=0;i<base.pairGroups.length;i++){
 const gs=base.pairGroups[i];
 if(!gs.length){unmodeled++;pairStatus.push("UNMODELED");continue;}
 if(!gs.every(certified)){partialCount++;pairStatus.push("PARTIAL_OR_UNPROVED");continue;}
 const k=gs.slice().sort((a,b)=>a-b).join(",");
 if(reps.has(k)){equivalent++;pairStatus.push("LIMITED_EQUIVALENT");}else{direct++;reps.set(k,i);pairStatus.push("LIMITED_DIRECT");}
 pairs.push([i,gs,reps.get(k)]);
}
const totals={};for(const k of Object.keys(m))totals[k]=(prior?.totals?.[k]||0)+m[k];
const elapsed=(performance.now()-started)/1000;
const summary={pairCount:base.summary.pairCount,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0,limitedDirect:direct,limitedEquivalent:equivalent,limitedClosed:direct+equivalent,partialOrUnproved:partialCount,unmodeled,groups:base.groups.length,certifiedGroups:base.groups.map((_,i)=>i).filter(certified).length,newAntichainGroups:groups.filter(g=>g.status==="PARTIAL_CAP_BOX_PARETO_EXACT").length,openGroups:groups.filter(g=>g.status==="OPEN").length,unprovedGroups:groups.filter(g=>g.status==="CANDIDATE_NOT_PROVED").length,sourceCertifiedGroups:partial.summary.certifiedGroups,storedStates:nodes.length,admittedRecords:groups.reduce((n,g)=>n+g.records.length,0),liveRepresentatives:groups.reduce((n,g)=>n+g.records.filter(r=>r.live).length,0),pendingRecords:groups.filter(g=>g.status==="OPEN").reduce((n,g)=>n+g.records.length-g.cursor,0),certifiedFrontierRepresentatives:groups.filter(g=>g.status==="PARTIAL_CAP_BOX_PARETO_EXACT").reduce((n,g)=>n+g.frontier.length,0),elapsedSeconds:elapsed,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsed,simulationChecks:checker.metrics,metrics:m,totals};
const result={schemaVersion:1,kind:"POPULATION_ANTICHAIN_CLOSURE",model:MODEL,fingerprint,hashes,sourceMetadataSha256:base.sourceMetadataSha256,sourceD3Sha256:base.sourceD3Sha256,sourceClosureSha256:sha(bytes),sourcePartialSha256:sha(partialBytes),pairMapHash:base.pairMapHash,scope:partial.scope,groups,nodes,pairStatus,pairs,summary,totals};
fs.writeFileSync(out+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);console.log(JSON.stringify(summary));
