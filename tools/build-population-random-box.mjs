// Extend the birth-box model to independent integer flat-roll outcomes.
// A maximal roll is a reachable representative in this defined numeric box.
// Reuse unaffected groups and exact unchanged transitions; new groups close
// only when their reachable antichain satisfies every simulation obligation.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {terminalFrontier} from "./population-closure-core.mjs";
import {signature,dominates,liveIndex,findCover,verifyCover} from "./population-antichain-core.mjs";
import {MODEL,createRandomBoxModel} from "./population-random-box-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode(fs.readFileSync("public/data/branch-soldier-results.json.gz")),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const cl=db.populationClosure,ac=db.populationAntichain,v=db.populationSearch.versions.D3;
assert(cl&&ac&&v);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
function asset(meta){const bytes=fs.readFileSync("public/data/"+meta.file);assert.equal(sha(bytes),meta.sha256);return decode(bytes);}
const base=asset(cl),antichain=asset(ac),snap=asset(v),birthBytes=fs.readFileSync(arg("birth","population-birth-box-proof.json.gz")),birth=decode(birthBytes);
assert.equal(birth.kind,"POPULATION_BIRTH_BOX_PROOF");assert.equal(birth.sourceClosureSha256,cl.sha256);assert.equal(birth.sourceAntichainSha256,ac.sha256);assert.equal(birth.sourcePartialSha256,ac.partialProof.sha256);assert.equal(birth.pairMapHash,base.pairMapHash);assert.equal(birth.sourceD3Sha256,v.sha256);assert.equal(birth.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(birth.summary.certifiedGroups,base.groups.length);
const hashFile=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const [p,h] of Object.entries(birth.hashes))assert.equal(hashFile(p),h,"Birth proof source changed "+p);
const hashes={...birth.hashes,"tools/population-random-box-core.mjs":hashFile("tools/population-random-box-core.mjs"),"tools/build-population-random-box.mjs":hashFile("tools/build-population-random-box.mjs")};
const fingerprint=key([MODEL,cl.sha256,ac.sha256,sha(birthBytes),hashes]),{model,checker,changed,changedIds,changedMask}=createRandomBoxModel(data,snap);
const affected=base.groups.map((g,i)=>BigInt("0x"+g.mask)&changedMask?i:-1).filter(i=>i>=0),affectedSet=new Set(affected);
const path=arg("out","population-random-box.json.gz"),prior=fs.existsSync(path)?decode(fs.readFileSync(path)):null;
if(prior)assert.equal(prior.fingerprint,fingerprint,"Explicit random-box migration required");
const nodes=prior?.nodes||[],index=new Map(nodes.map((n,i)=>[JSON.stringify(n.state),i])),groups=prior?.groups||[];
const sourceIndexes=[base,antichain].map(s=>({nodes:s.nodes,index:new Map(s.nodes.map((n,i)=>[JSON.stringify(n.state),i]))}));
const started=performance.now(),seconds=Number(arg("seconds","22")),maxNew=Number(arg("new-states","60000")),maxRecords=Number(arg("group-records","60000")),quantum=Number(arg("quantum","300"));
assert(Number.isFinite(seconds)&&seconds>0&&[maxNew,maxRecords,quantum].every(n=>Number.isSafeInteger(n)&&n>0));
const initialNodes=nodes.length,m={requests:0,localHits:0,unchangedSourceHits:0,computed:0,randomTransitions:0,randomSuccesses:0,newStates:0,admitted:0,coveredCandidates:0,retiredRepresentatives:0,expanded:0,staleSkipped:0,newCertified:0,newUnproved:0,gateRejected:0,outsideModel:0};
function intern(p){const k=JSON.stringify(p);if(index.has(k))return index.get(k);const id=nodes.length;nodes.push({state:p,edges:{}});index.set(k,id);m.newStates++;return id;}
function transition(id,a){
 m.requests++;const n=nodes[id],k=String(a);if(Object.hasOwn(n.edges,k)){m.localHits++;return n.edges[k];}
 let to;const random=changedIds.has(a);
 if(!random){
  const sig=JSON.stringify(n.state);
  for(const s of sourceIndexes){const b=s.nodes[s.index.get(sig)];if(!b||!Object.hasOwn(b.edges,k))continue;const j=b.edges[k];to=j<0?j:intern(s.nodes[j].state);m.unchangedSourceHits++;break;}
 }
 if(to===undefined){m.computed++;if(random)m.randomTransitions++;const t=model.transition(n.state,a);to=t.kind==="OK"?intern(t.state):t.kind==="GATE"?-1:-2;if(random&&to>=0)m.randomSuccesses++;}
 n.edges[k]=to;return to;
}
function add(g,id,parent,action,buckets){
 const p=nodes[id].state,k=signature(p),list=buckets.get(k)||[];
 if(findCover(p,g,nodes,buckets)!==null){m.coveredCandidates++;return;}
 const keep=[],i=g.records.length;
 for(const j of list){const r=g.records[j];if(!r.live)continue;if(dominates(p,nodes[r.id].state)){r.live=false;m.retiredRepresentatives++;}else keep.push(j);}
 g.records.push({id,parent,action,live:true});keep.push(i);buckets.set(k,keep);m.admitted++;
}
const profileMap=new Map(birth.profiles.map(p=>[p.origin,p]));
if(!prior)for(const gi of affected){
 const g=base.groups[gi],root=g.roots[g.roots.length-1],upper=base.nodes[root].state;
 for(const [oi] of g.aliases)assert.deepEqual(upper,profileMap.get(base.origins[oi]).upper,"Maximum birth root mismatch "+gi);
 const id=intern(upper),a={group:gi,mask:g.mask,roots:[id],records:[],cursor:0,status:"OPEN",frontier:[]};
 add(a,id,null,null,new Map());groups.push(a);
}
assert.deepEqual(groups.map(g=>g.group),affected);
const bucketsByGroup=new Map(),auditCache=new Map();
function expand(g){
 let buckets=bucketsByGroup.get(g.group);if(!buckets){buckets=liveIndex(g,nodes);bucketsByGroup.set(g.group,buckets);}
 const mask=BigInt("0x"+g.mask);let n=0;
 while(g.cursor<g.records.length&&g.records.length<maxRecords&&n<quantum&&nodes.length-initialNodes<maxNew&&performance.now()-started<seconds*1000){
  const j=g.cursor++,r=g.records[j];n++;if(!r.live){m.staleSkipped++;continue;}
  for(const a of model.actions(nodes[r.id].state,mask)){
   const to=transition(r.id,a);if(to===-1){m.gateRejected++;continue;}if(to===-2){m.outsideModel++;continue;}
   add(g,to,j,a,buckets);
  }
  m.expanded++;
 }
 if(g.cursor===g.records.length){
  const audit=verifyCover(g,nodes,model,checker,{replay:true,transitionCache:auditCache});g.audit=audit;
  if(audit.ok){g.status="BIRTH_AND_ROLL_BOX_PARETO_EXACT";g.frontier=terminalFrontier(g.records.filter(r=>r.live).map(r=>r.id),nodes,model);g.proofHash=key([g.group,g.mask,g.roots,g.records,g.frontier]);m.newCertified++;}
  else{g.status="CANDIDATE_NOT_PROVED";m.newUnproved++;}
 }
 return n;
}
const queue=groups.filter(g=>g.status==="OPEN").sort((a,b)=>ac.groups[a.group].states-ac.groups[b.group].states||a.group-b.group);
let progress=true;
while(progress&&performance.now()-started<seconds*1000&&nodes.length-initialNodes<maxNew){progress=false;for(const g of queue){if(g.status!=="OPEN"||g.records.length>=maxRecords)continue;if(performance.now()-started>=seconds*1000||nodes.length-initialNodes>=maxNew)break;if(expand(g))progress=true;}}
const groupMap=new Map(groups.map(g=>[g.group,g])),certified=i=>affectedSet.has(i)?groupMap.get(i)?.status==="BIRTH_AND_ROLL_BOX_PARETO_EXACT":birth.groupReceipts[i].status==="BIRTH_BOX_PARETO_EXACT";
const pairs=[],status=[],reps=new Map();let direct=0,equivalent=0,partial=0,unmodeled=0;
for(let i=0;i<base.pairGroups.length;i++){
 const gs=base.pairGroups[i];if(!gs.length){status.push("UNMODELED");unmodeled++;continue;}if(!gs.every(certified)){status.push("PARTIAL_OR_UNPROVED");partial++;continue;}
 const sig=gs.slice().sort((a,b)=>a-b).join(",");if(reps.has(sig)){status.push("LIMITED_EQUIVALENT");equivalent++;}else{status.push("LIMITED_DIRECT");direct++;reps.set(sig,i);}pairs.push([i,gs,reps.get(sig)]);
}
const totals={};for(const k of Object.keys(m))totals[k]=(prior?.totals?.[k]||0)+m[k];
const elapsed=(performance.now()-started)/1000,affectedPairs=base.pairGroups.filter(gs=>gs.some(i=>affectedSet.has(i))).length;
const summary={pairCount:base.summary.pairCount,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0,limitedDirect:direct,limitedEquivalent:equivalent,limitedClosed:direct+equivalent,partialOrUnproved:partial,unmodeled,groups:base.groups.length,certifiedGroups:base.groups.map((_,i)=>i).filter(certified).length,affectedGroups:affected.length,affectedPairs,unaffectedReusedGroups:base.groups.length-affected.length,newCertifiedGroups:groups.filter(g=>g.status==="BIRTH_AND_ROLL_BOX_PARETO_EXACT").length,openGroups:groups.filter(g=>g.status==="OPEN").length,unprovedGroups:groups.filter(g=>g.status==="CANDIDATE_NOT_PROVED").length,randomRules:changed.length,storedStates:nodes.length,admittedRecords:groups.reduce((n,g)=>n+g.records.length,0),liveRepresentatives:groups.reduce((n,g)=>n+g.records.filter(r=>r.live).length,0),pendingRecords:groups.filter(g=>g.status==="OPEN").reduce((n,g)=>n+g.records.length-g.cursor,0),frontierRepresentatives:base.groups.reduce((n,g,i)=>n+(affectedSet.has(i)?(groupMap.get(i)?.frontier.length||0):ac.groups[i].frontier.length),0),elapsedSeconds:elapsed,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsed,simulationChecks:checker.metrics,metrics:m,totals};
const scope={included:[...birth.scope.included,"independent integer flat-roll outcomes of all supported random transformations"],excluded:birth.scope.excluded.filter(x=>x!=="random transforms").concat(["actual random-roll correlations or probabilities"]),theorem:[...birth.scope.theorem,"For a flat-roll rule at fixed initial and raw values, the engine transformation output is nondecreasing in each independent flat contribution, including rounding and clipping. The maximal roll vector is itself included in this box.","Every maximal-roll successor is independently replayed and covered by the closed reachable antichain. Scalar prefix-max checks apply to the modified rule as well; all other outcomes are dominated by the maximal one.","An unaffected group's reachable mask excludes every changed action; its previous proof is unchanged."],notClaimed:"Independent birth and roll boxes and conditional partial growth are numeric models, not actual joint RNG or campaign feasibility or global optimality."};
const result={schemaVersion:1,kind:"POPULATION_RANDOM_BOX_CLOSURE",model:MODEL,fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,sourceD3Sha256:v.sha256,sourceClosureSha256:cl.sha256,sourceAntichainSha256:ac.sha256,sourceBirthProofSha256:sha(birthBytes),pairMapHash:base.pairMapHash,scope,changed,affected,groups,nodes,pairStatus:status,pairs,summary,totals};
fs.writeFileSync(path+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(path+".tmp",path);console.log(JSON.stringify(summary));
