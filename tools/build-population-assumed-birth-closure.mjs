// Exact numerical closure conditioned on a hypothetical birth and each
// observed fixed-active research history. Never claims joint birth/research
// feasibility. Old proofs are reused only at identical root endpoints/mask.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {terminalFrontier} from "./population-closure-core.mjs";
import {signature,dominates,liveIndex,findCover,verifyCover} from "./population-antichain-core.mjs";
import {createRandomBoxModel} from "./population-random-box-core.mjs";
const MODEL="ASSUMED_BIRTH_OBSERVED_ACTIVE_ROLL_BOX_V1";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(z.gunzipSync(b));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode(fs.readFileSync("public/data/branch-soldier-results.json.gz")),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const cl=db.populationClosure,ac=db.populationAntichain,rb=db.populationRandomBox,bb=db.populationBirthBox,v=db.populationSearch.versions.D3;
assert(cl&&ac&&rb&&bb&&v);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
function asset(meta){const bytes=fs.readFileSync("public/data/"+meta.file);assert.equal(sha(bytes),meta.sha256);return decode(bytes);}
const base=asset(cl),antichain=asset(ac),roll=asset(rb),birth=asset(bb),snap=asset(v);
for(const x of [base,antichain,roll,birth]){assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(x.sourceD3Sha256,v.sha256);assert.equal(x.pairMapHash,base.pairMapHash);}
assert.equal(roll.sourceBirthProofSha256,bb.sha256);assert.equal(roll.sourceClosureSha256,cl.sha256);assert.equal(roll.sourceAntichainSha256,ac.sha256);
assert.equal(birth.summary.certifiedGroups,base.groups.length);assert.equal(rb.summary.certifiedGroups,base.groups.length);
const hashFile=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const [p,h] of Object.entries(roll.hashes))assert.equal(hashFile(p),h,"Source drift "+p);
const self="tools/build-population-assumed-birth-closure.mjs",hashes={...roll.hashes,[self]:hashFile(self)};
const fingerprint=key([MODEL,db.sourceMetadataSha256,v.sha256,cl.sha256,ac.sha256,bb.sha256,rb.sha256,hashes]);
const {model,checker,changedIds}=createRandomBoxModel(data,snap);
const rootsKey=(mask,roots)=>JSON.stringify([mask,...roots]);
const known=new Map();
for(let i=0;i<base.groups.length;i++){
 const g=base.groups[i],r=g.roots.map(id=>base.nodes[id].state);if(r.length===1)r.push(r[0]);
 assert(rb.groups[i].closed);known.set(rootsKey(g.mask,r),i);
}
const origins=base.origins,branches=base.branches,bi=new Map(branches.map((id,i)=>[id,i])),profileMap=new Map(data.profiles.map(p=>[p.id,p])),proofProfiles=new Map(birth.profiles.map(p=>[p.origin,p]));
const pairGroups=Array.from({length:origins.length*branches.length},()=>[]),admittedGroups=Array.from({length:pairGroups.length},()=>[]);
const groups=[],catalog=new Map();
for(let oi=0;oi<origins.length;oi++){
 const p=profileMap.get(origins[oi]),roots=model.initial(p),receipt=proofProfiles.get(p.id);
 assert.deepEqual(roots,[receipt.lower,receipt.upper]);
 for(let hi=0;hi<snap.histories.length;hi++){
  const h=snap.histories[hi],j=bi.get(h.branchId);assert(Number.isInteger(j));
  const pi=oi*branches.length+j,mask=model.reachable(p.soldierType,model.available[hi]).toString(16),sig=rootsKey(mask,roots);
  let gi=catalog.get(sig);
  if(gi===undefined){gi=groups.length;catalog.set(sig,gi);groups.push({id:gi,signature:key(sig),mask,roots,sourceGroup:known.get(sig)??null,aliases:[],admittedAliases:0});}
  const g=groups[gi],admitted=(p.requires||[]).every(k=>model.active(model.hs[hi],k));
  g.aliases.push([oi,hi,admitted?1:0]);if(admitted)g.admittedAliases++;
  if(!pairGroups[pi].includes(gi))pairGroups[pi].push(gi);
  if(admitted&&!admittedGroups[pi].includes(gi))admittedGroups[pi].push(gi);
 }
}
assert(pairGroups.every(gs=>gs.length));
assert.equal(known.size,base.groups.length);
for(let pi=0;pi<pairGroups.length;pi++){
 const actual=admittedGroups[pi].map(i=>groups[i].sourceGroup);
 assert(actual.every(Number.isInteger));assert.deepEqual(actual.slice().sort((a,b)=>a-b),base.pairGroups[pi].slice().sort((a,b)=>a-b));
}
const pairMapHash=key([origins,branches,pairGroups,admittedGroups,groups.map(g=>[g.signature,g.sourceGroup,g.aliases])]);
const output=arg("out","population-assumed-birth-closure.json.gz"),prior=fs.existsSync(output)?decode(fs.readFileSync(output)):null;
if(prior){assert.equal(prior.fingerprint,fingerprint,"Engine/source migration required");assert.equal(prior.pairMapHash,pairMapHash);}
const nodes=prior?.nodes||[],index=new Map(nodes.map((n,i)=>[JSON.stringify(n.state),i])),work=prior?.work||[];
const srcs=[roll,antichain,base].map((s,i)=>({nodes:s.nodes,changed:i===0,index:new Map(s.nodes.map((n,j)=>[JSON.stringify(n.state),j]))}));
const started=performance.now(),seconds=Number(arg("seconds","20")),maxNew=Number(arg("new-states","70000")),maxRecords=Number(arg("group-records","100000")),quantum=Number(arg("quantum","350"));
assert(Number.isFinite(seconds)&&seconds>0&&[maxNew,maxRecords,quantum].every(n=>Number.isSafeInteger(n)&&n>0));
const initialNodes=nodes.length,m={requests:0,localHits:0,sourceHits:0,computed:0,newStates:0,admitted:0,coveredCandidates:0,retiredRepresentatives:0,expanded:0,staleSkipped:0,newCertified:0,newUnproved:0,gateRejected:0,outsideModel:0};
function intern(p){const k=JSON.stringify(p);if(index.has(k))return index.get(k);const id=nodes.length;nodes.push({state:p,edges:{}});index.set(k,id);m.newStates++;return id;}
function transition(id,a){
 m.requests++;const n=nodes[id],k=String(a);if(Object.hasOwn(n.edges,k)){m.localHits++;return n.edges[k];}
 let to;const sig=JSON.stringify(n.state);
 for(const s of srcs){if(changedIds.has(a)&&!s.changed)continue;const b=s.nodes[s.index.get(sig)];if(!b||!Object.hasOwn(b.edges,k))continue;const j=b.edges[k];to=j<0?j:intern(s.nodes[j].state);m.sourceHits++;break;}
 if(to===undefined){m.computed++;const t=model.transition(n.state,a);to=t.kind==="OK"?intern(t.state):t.kind==="GATE"?-1:-2;}
 n.edges[k]=to;return to;
}
function add(g,id,parent,action,buckets){
 const p=nodes[id].state,k=signature(p),list=buckets.get(k)||[];
 if(findCover(p,g,nodes,buckets)!==null){m.coveredCandidates++;return;}
 const keep=[],i=g.records.length;
 for(const j of list){const r=g.records[j];if(!r.live)continue;if(dominates(p,nodes[r.id].state)){r.live=false;m.retiredRepresentatives++;}else keep.push(j);}
 g.records.push({id,parent,action,live:true});keep.push(i);buckets.set(k,keep);m.admitted++;
}
if(!prior)for(const g of groups)if(g.sourceGroup===null){
 const id=intern(g.roots[1]),w={group:g.id,mask:g.mask,roots:[id],records:[],cursor:0,status:"OPEN",frontier:[]};
 add(w,id,null,null,new Map());work.push(w);
}
assert.deepEqual(work.map(g=>g.group),groups.filter(g=>g.sourceGroup===null).map(g=>g.id));
const wm=new Map(work.map(w=>[w.group,w])),bucketsByGroup=new Map(),auditCache=new Map();
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
  if(audit.ok){g.status="EXACT_CONDITIONAL_NUMERIC_PARETO";g.frontier=terminalFrontier(g.records.filter(r=>r.live).map(r=>r.id),nodes,model);g.proofHash=key([g.group,g.mask,g.roots,g.records,g.frontier]);m.newCertified++;}
  else{g.status="CANDIDATE_NOT_PROVED";m.newUnproved++;}
 }
 return n;
}
const popularity=Array(groups.length).fill(0);for(const gs of pairGroups)for(const i of gs)popularity[i]++;
const popcount=x=>BigInt("0x"+x).toString(2).replace(/0/g,"").length;
const queue=work.filter(g=>g.status==="OPEN").sort((a,b)=>popcount(a.mask)-popcount(b.mask)||popularity[b.group]-popularity[a.group]||a.group-b.group);
let progress=true;
while(progress&&performance.now()-started<seconds*1000&&nodes.length-initialNodes<maxNew){
 progress=false;for(const g of queue){if(g.status!=="OPEN"||g.records.length>=maxRecords)continue;if(performance.now()-started>=seconds*1000||nodes.length-initialNodes>=maxNew)break;if(expand(g))progress=true;}
}
const certified=i=>groups[i].sourceGroup!==null||wm.get(i)?.status==="EXACT_CONDITIONAL_NUMERIC_PARETO";
const codes=[],pairs=[],reps=new Map(),coveredOrigins=new Set();let direct=0,equivalent=0,partial=0,assumedOnlyClosed=0;
for(let i=0;i<pairGroups.length;i++){
 const gs=pairGroups[i];if(!gs.every(certified)){codes.push(1);partial++;continue;}
 const sig=gs.slice().sort((a,b)=>a-b).join(",");if(reps.has(sig)){codes.push(3);equivalent++;}else{codes.push(2);direct++;reps.set(sig,i);}
 pairs.push([i,gs,reps.get(sig)]);coveredOrigins.add(origins[Math.floor(i/branches.length)]);if(!admittedGroups[i].length)assumedOnlyClosed++;
}
const totals={};for(const k of Object.keys(m))totals[k]=(prior?.totals?.[k]||0)+m[k];
const elapsed=(performance.now()-started)/1000;
const summary={pairCount:pairGroups.length,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0,conditionalDirect:direct,conditionalEquivalent:equivalent,conditionalClosed:direct+equivalent,conditionalPartial:partial,assumedOnlyClosed,admittedPairCount:admittedGroups.filter(x=>x.length).length,coveredOrigins:coveredOrigins.size,groups:groups.length,sourceGroups:groups.filter(g=>g.sourceGroup!==null).length,newGroups:work.length,certifiedGroups:groups.filter(g=>certified(g.id)).length,newCertifiedGroups:work.filter(g=>g.status==="EXACT_CONDITIONAL_NUMERIC_PARETO").length,openGroups:work.filter(g=>g.status==="OPEN").length,unprovedGroups:work.filter(g=>g.status==="CANDIDATE_NOT_PROVED").length,historyAliases:groups.reduce((n,g)=>n+g.aliases.length,0),admittedAliases:groups.reduce((n,g)=>n+g.admittedAliases,0),storedStates:nodes.length,admittedRecords:work.reduce((n,g)=>n+g.records.length,0),liveRepresentatives:work.reduce((n,g)=>n+g.records.filter(r=>r.live).length,0),pendingRecords:work.filter(g=>g.status==="OPEN").reduce((n,g)=>n+g.records.length-g.cursor,0),frontierRepresentatives:groups.reduce((n,g)=>n+(g.sourceGroup===null?wm.get(g.id).frontier.length:rb.groups[g.sourceGroup].frontier.length),0),elapsedSeconds:elapsed,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsed,simulationChecks:checker.metrics,metrics:m,totals};
const result={schemaVersion:1,kind:"POPULATION_ASSUMED_BIRTH_CLOSURE",model:MODEL,fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,sourceD3Sha256:v.sha256,sourceClosureSha256:cl.sha256,sourceRandomBoxSha256:rb.sha256,sourceBirthProofSha256:bb.sha256,pairMapHash,scope:{...rb.scope,extraAssumption:"Birth is granted even when its required research is absent in the selected observed final-active history. This is a hypothetical numerical calculation, not joint attainability. No claim about unobserved or intermediate research."},origins,branches,groups,pairGroups,admittedGroups,work,nodes,codes,pairs,summary,totals};
fs.writeFileSync(output+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);console.log(JSON.stringify(summary));
