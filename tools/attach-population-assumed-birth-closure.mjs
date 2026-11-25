// Publish the complete hypothetical-birth numeric catalog without promoting
// a missing recruitment condition or a relaxed bound to a campaign proof.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {terminalFrontier} from "./population-closure-core.mjs";
import {verifyCover} from "./population-antichain-core.mjs";
import {createRandomBoxModel} from "./population-random-box-core.mjs";
const MODEL="ASSUMED_BIRTH_OBSERVED_ACTIVE_ROLL_BOX_V1";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(z.gunzipSync(b));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const cl=db.populationClosure,ac=db.populationAntichain,rb=db.populationRandomBox,bb=db.populationBirthBox,v=db.populationSearch.versions.D3;
assert(cl&&ac&&rb&&bb&&v);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const bytes=fs.readFileSync(process.argv[2]||"population-assumed-birth-closure.json.gz"),a=decode(bytes);
function asset(meta){const bytes=fs.readFileSync("public/data/"+meta.file);assert.equal(sha(bytes),meta.sha256);return decode(bytes);}
const base=asset(cl),snap=asset(v),birth=asset(bb),roll=asset(rb);
assert.equal(a.kind,"POPULATION_ASSUMED_BIRTH_CLOSURE");assert.equal(a.model,MODEL);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.sourceD3Sha256,v.sha256);assert.equal(a.sourceClosureSha256,cl.sha256);assert.equal(a.sourceRandomBoxSha256,rb.sha256);assert.equal(a.sourceBirthProofSha256,bb.sha256);
assert.equal(a.fingerprint,key([MODEL,db.sourceMetadataSha256,v.sha256,cl.sha256,ac.sha256,bb.sha256,rb.sha256,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Source changed "+p);
for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
assert.equal(roll.sourceBirthProofSha256,bb.sha256);
assert.deepEqual(a.origins,base.origins);assert.deepEqual(a.branches,base.branches);assert.deepEqual(a.origins,db.populationSearch.origins);assert.deepEqual(a.branches,db.populationSearch.branches);
const {model,checker}=createRandomBoxModel(data,snap),started=performance.now();
const profileMap=new Map(data.profiles.map(p=>[p.id,p])),bi=new Map(a.branches.map((id,i)=>[id,i])),bp=new Map(birth.profiles.map(p=>[p.origin,p]));
const sig=(mask,roots)=>JSON.stringify([mask,...roots]),source=new Map();
for(let i=0;i<base.groups.length;i++){
 const g=base.groups[i],r=g.roots.map(id=>base.nodes[id].state);if(r.length===1)r.push(r[0]);source.set(sig(g.mask,r),i);assert(rb.groups[i].closed);
}
const expected=[],groupIndex=new Map(),pairs=Array.from({length:a.origins.length*a.branches.length},()=>[]),admitted=Array.from({length:pairs.length},()=>[]);
for(let oi=0;oi<a.origins.length;oi++){
 const p=profileMap.get(a.origins[oi]),roots=model.initial(p),r=bp.get(p.id);assert.deepEqual(roots,[r.lower,r.upper]);
 for(let hi=0;hi<snap.histories.length;hi++){
  const j=bi.get(snap.histories[hi].branchId),pi=oi*a.branches.length+j;assert(Number.isInteger(j));
  const mask=model.reachable(p.soldierType,model.available[hi]).toString(16),s=sig(mask,roots);
  let gi=groupIndex.get(s);
  if(gi===undefined){gi=expected.length;groupIndex.set(s,gi);expected.push({id:gi,signature:key(s),mask,roots,sourceGroup:source.get(s)??null,aliases:[],admittedAliases:0});}
  const g=expected[gi],ok=(p.requires||[]).every(k=>model.active(model.hs[hi],k));
  g.aliases.push([oi,hi,ok?1:0]);if(ok)g.admittedAliases++;
  if(!pairs[pi].includes(gi))pairs[pi].push(gi);if(ok&&!admitted[pi].includes(gi))admitted[pi].push(gi);
 }
}
assert.deepEqual(a.groups,expected);assert.deepEqual(a.pairGroups,pairs);assert.deepEqual(a.admittedGroups,admitted);
assert.equal(a.pairMapHash,key([a.origins,a.branches,pairs,admitted,expected.map(g=>[g.signature,g.sourceGroup,g.aliases])]));
for(let i=0;i<pairs.length;i++)assert.deepEqual(admitted[i].map(g=>expected[g].sourceGroup).sort((x,y)=>x-y),base.pairGroups[i].slice().sort((x,y)=>x-y));
const work=new Map(a.work.map(g=>[g.group,g]));assert.equal(work.size,expected.filter(g=>g.sourceGroup===null).length);
const cache=new Map(),groups=[],certified=new Set();let auditedEdges=0,auditedPaths=0;
for(const g of expected){
 if(g.sourceGroup!==null){
  const old=rb.groups[g.sourceGroup];groups.push({id:g.id,closed:true,proofKind:"EXACT_SOURCE_GROUP_REUSE",sourceGroup:g.sourceGroup,frontier:old.frontier,proofHash:old.proofHash,states:old.states,aliases:g.aliases.length,admittedAliases:g.admittedAliases});certified.add(g.id);continue;
 }
 const w=work.get(g.id);assert(w&&w.mask===g.mask&&w.roots.length===1);assert.deepEqual(a.nodes[w.roots[0]].state,g.roots[1]);
 if(w.status!=="EXACT_CONDITIONAL_NUMERIC_PARETO"){groups.push({id:g.id,closed:false,proofKind:"UNPROVED",frontier:[],states:w.records.length,pending:w.records.length-w.cursor,aliases:g.aliases.length,admittedAliases:g.admittedAliases});continue;}
 assert.equal(w.cursor,w.records.length);assert.equal(w.proofHash,key([w.group,w.mask,w.roots,w.records,w.frontier]));
 const audit=verifyCover(w,a.nodes,model,checker,{replay:true,transitionCache:cache});assert(audit.ok,"Unclosed simulation "+g.id);
 auditedEdges+=audit.counts.edgeChecks;auditedPaths+=audit.counts.pathChecks;
 const front=terminalFrontier(w.records.filter(r=>r.live).map(r=>r.id),a.nodes,model);assert.deepEqual(front,w.frontier);
 const pos=new Map(w.records.map((r,i)=>[r.id,i]));assert.equal(pos.size,w.records.length);
 const frontier=front.map(f=>{let j=pos.get(f.id),r=w.records[j];assert(r.live);const actions=[];while(r.parent!==null){actions.push(r.action===-1?"CAP_TARGET":base.rules[r.action]);j=r.parent;r=w.records[j];}return {...f,root:r.id,actions:actions.reverse(),birthBand:"max",randomRoll:"ALL_MAX_IF_USED"};});
 groups.push({id:g.id,closed:true,proofKind:"ASSUMED_BIRTH_ANTICHAIN",frontier,proofHash:w.proofHash,states:audit.counts.live,aliases:g.aliases.length,admittedAliases:g.admittedAliases});certified.add(g.id);
}
const codes=[],classIndex=[],classes=[],reps=new Map(),closedPairs=[];let direct=0,equivalent=0,partial=0,assumedOnly=0;
const dominates=(x,y)=>x.body===y.body&&x.vector.every((n,i)=>n>=y.vector[i]);
function pareto(gs){
 const bodies=new Map();
 for(const gi of gs)for(let i=0;i<groups[gi].frontier.length;i++){const f=groups[gi].frontier[i],xs=bodies.get(f.body)||[];xs.push({...f,group:gi,index:i});bodies.set(f.body,xs);}
 const front=[];
 for(const xs of bodies.values()){xs.sort((x,y)=>y.vector.reduce((s,v)=>s+v,0)-x.vector.reduce((s,v)=>s+v,0));const kept=[];for(const f of xs)if(!kept.some(x=>dominates(x,f)))kept.push(f);front.push(...kept);}
 return front;
}
const invariant=db.populationInvariantBound,invMap=new Map(Object.entries(invariant?.originIndex||{}));let boundComparisons=0,boundMismatch=0,effectiveEquality=0,sumEquality=0;
const invBody=new Map();
if(invariant)for(let oi=0;oi<a.origins.length;oi++){
 const id=a.origins[oi],g=invariant.groups[invMap.get(id)];assert(g);invBody.set(id,new Map(g.bounds.map(b=>[b.body,b])));
}
for(let i=0;i<pairs.length;i++){
 const gs=pairs[i];
 if(!gs.every(g=>certified.has(g))){codes.push(1);classIndex.push(-1);partial++;continue;}
 const k=gs.slice().sort((x,y)=>x-y).join(","),oi=Math.floor(i/a.branches.length),origin=a.origins[oi];
 let c=reps.get(k),code;
 if(c===undefined){
  code=2;direct++;c=classes.length;reps.set(k,c);
  const front=pareto(gs),byBody=new Map();
  for(const f of front){const xs=byBody.get(f.body)||[];xs.push(f);byBody.set(f.body,xs);}
  classes.push({id:c,representative:i,groups:gs,frontierCount:front.length,bodies:[...byBody].map(([body,xs])=>{
   const best=xs.slice().sort((x,y)=>y.vector.reduce((s,v)=>s+v,0)-x.vector.reduce((s,v)=>s+v,0))[0];
   return {body,coordinateMax:db.stats.map((_,j)=>Math.max(...xs.map(f=>f.vector[j]))),bestSum:best.vector.reduce((s,v)=>s+v,0),best:{group:best.group,index:best.index},frontier:xs.map(f=>[f.group,f.index])};
  })});
 }else{code=3;equivalent++;}
 const bodyBounds=invBody.get(origin);
 if(bodyBounds)for(const t of classes[c].bodies){
  const upper=bodyBounds.get(t.body);if(!upper){boundMismatch++;continue;}
  for(let j=0;j<db.stats.length;j++){boundComparisons++;if(t.coordinateMax[j]>upper.effective[j])boundMismatch++;else if(t.coordinateMax[j]===upper.effective[j])effectiveEquality++;}
  if(t.bestSum===upper.effective.reduce((s,v)=>s+v,0))sumEquality++;
 }
 codes.push(code);classIndex.push(c);closedPairs.push([i,gs,classes[c].representative]);if(!admitted[i].length)assumedOnly++;
}
assert.deepEqual(a.codes,codes);assert.deepEqual(a.pairs,closedPairs);assert.equal(a.summary.conditionalDirect,direct);assert.equal(a.summary.conditionalEquivalent,equivalent);assert.equal(a.summary.conditionalPartial,partial);assert.equal(a.summary.assumedOnlyClosed,assumedOnly);assert.equal(a.summary.certifiedGroups,certified.size);
const previous=db.populationAssumedBirthClosure;if(previous){assert.equal(previous.pairMapHash,a.pairMapHash);for(const g of previous.groups.filter(g=>g.closed)){assert(groups[g.id].closed);assert.equal(groups[g.id].proofHash,g.proofHash);}}
const sum=v=>v.reduce((s,x)=>s+x,0);
// A second diagnostic compares only registered chronological terminal
// snapshots (before speculative final cap growth) with broad invariant boxes.
// These are conditional replay witnesses, NOT actual-game certified lower bounds.
const replayByPair=new Map();let replayRows=0,replayMissingBounds=0,replayOutside=0;
const ledgers=[["POPEXT12",db.originExtendedContinuation],["POPRESEARCH12",db.originResearchContinuation],["POPRESEARCHCHAIN12",db.originResearchChain]];
for(const [kind,l] of ledgers)for(const id of l?.published||[]){
 const r=l.routes[id],w=db.witnesses[id];if(!r||!w||w.source!==kind||!r.fullActionHash||!r.canonicalStateHash)continue;
 if(!r.raw?.every(Number.isSafeInteger)||!r.bonus?.every(Number.isSafeInteger)||r.raw.length!==db.stats.length||r.bonus.length!==db.stats.length)continue;
 const bound=invBody.get(r.origin)?.get(r.body);if(!bound){replayMissingBounds++;continue;}
 const eff=r.raw.map((v,j)=>db.stats[j]==="psiSkill"&&v<=0&&r.bonus[j]>0?v:Math.max(db.stats[j]==="health"?1:0,v+r.bonus[j]));
 const gap=bound.effective.map((v,j)=>v-eff[j]),rawGap=bound.raw.map((v,j)=>v-r.raw[j]);
 if(gap.some(v=>v<0)||rawGap.some(v=>v<0))replayOutside++;
 const pk=r.origin+"|"+r.branch,bodyKey=pk+"|"+r.body;
 let t=replayByPair.get(bodyKey);
 if(!t){t={origin:r.origin,branch:r.branch,body:r.body,upperEffective:bound.effective,upperRaw:bound.raw,bestEffective:[],bestRaw:[],bestSum:null,rows:0};replayByPair.set(bodyKey,t);}
 for(let j=0;j<db.stats.length;j++){
  if(!t.bestEffective[j]||eff[j]>t.bestEffective[j].value)t.bestEffective[j]={value:eff[j],witness:id};
  if(!t.bestRaw[j]||r.raw[j]>t.bestRaw[j].value)t.bestRaw[j]={value:r.raw[j],witness:id};
 }
 if(!t.bestSum||sum(eff)>t.bestSum.value)t.bestSum={value:sum(eff),witness:id};
 t.rows++;replayRows++;
}
const replayGaps=[...replayByPair.values()].map(t=>({...t,effectiveGap:t.upperEffective.map((v,j)=>v-t.bestEffective[j].value),rawGap:t.upperRaw.map((v,j)=>v-t.bestRaw[j].value),sumGap:sum(t.upperEffective)-t.bestSum.value}));
const replayRawEqual=replayGaps.reduce((n,t)=>n+t.rawGap.filter(x=>x===0).length,0),replayEffectiveEqual=replayGaps.reduce((n,t)=>n+t.effectiveGap.filter(x=>x===0).length,0);
// The latest independently generated branch constraint envelope gives a
// tighter search priority. A contradiction quarantines that comparison;
// equality with any envelope still does not establish actual attainability.
const branchInvariant=db.populationBranchInvariant;
const branchGap={sourceSha256:branchInvariant?.sha256||null,comparedPairBodies:0,missingBounds:0,outside:0,rawEqual:0,effectiveEqual:0,sumEqual:0,tighterPairBodies:0,actualGameCertified:0,priority:[]};
if(branchInvariant){
 assert.equal(branchInvariant.sourceMetadataSha256,a.sourceMetadataSha256);
 assert.deepEqual(branchInvariant.stats,db.stats);
 const bo=new Map(branchInvariant.origins.map((id,i)=>[id,i])),bi=new Map(branchInvariant.branches.map((id,i)=>[id,i]));
 for(const t of replayGaps){
  const gi=branchInvariant.pairClasses[bo.get(t.origin)]?.[bi.get(t.branch)],g=branchInvariant.groups[gi],b=g?.bounds.find(x=>x.body===t.body);
  if(!b){branchGap.missingBounds++;continue;}
  const raw=b.raw.map((v,j)=>v-t.bestRaw[j].value),effective=b.effective.map((v,j)=>v-t.bestEffective[j].value),sumGap=sum(b.effective)-t.bestSum.value;
  t.branchBound={group:gi,raw:b.raw,effective:b.effective,rawGap:raw,effectiveGap:effective,sumGap,status:raw.some(v=>v<0)||effective.some(v=>v<0)||sumGap<0?"INCONSISTENT":"CONDITIONAL_COMPARISON"};
  branchGap.comparedPairBodies++;
  if(t.branchBound.status==="INCONSISTENT"){branchGap.outside++;continue;}
  if(b.raw.some((v,j)=>v<t.upperRaw[j])||b.effective.some((v,j)=>v<t.upperEffective[j]))branchGap.tighterPairBodies++;
  branchGap.rawEqual+=raw.filter(v=>v===0).length;branchGap.effectiveEqual+=effective.filter(v=>v===0).length;if(sumGap===0)branchGap.sumEqual++;
  branchGap.priority.push({origin:t.origin,branch:t.branch,body:t.body,sumGap,bestSum:t.bestSum.value,witness:t.bestSum.witness,rawEqual:raw.filter(v=>v===0).length,effectiveEqual:effective.filter(v=>v===0).length});
 }
 branchGap.priority.sort((x,y)=>x.sumGap-y.sumGap||y.rawEqual-x.rawEqual||x.origin.localeCompare(y.origin));branchGap.priority=branchGap.priority.slice(0,20);
}
const gapSummary={scope:"Conditional chronological replay snapshots vs independent broad and branch-specific invariant bounds; equality is objective-level numerical evidence only, never a complete game or campaign proof.",replayRows,pairBodies:replayGaps.length,pairs:new Set(replayGaps.map(t=>t.origin+"|"+t.branch)).size,replayMissingBounds,replayOutside,replayRawEqual,replayEffectiveEqual,replaySumEqual:replayGaps.filter(t=>t.sumGap===0).length,boundComparisons,boundMismatch,effectiveEquality,sumEquality,branchGap,actualGameCertified:0};
const proofFile="soldier-population-assumed-birth-closure.json.gz",catalogFile="soldier-population-assumed-birth-catalog.json.gz",gapFile="soldier-population-bound-gap.json.gz";
const summary={...a.summary,proofAuditSeconds:(performance.now()-started)/1000,proofAuditEdges:auditedEdges,proofAuditPaths:auditedPaths,proofAuditIndependentTransitions:cache.size,proofAuditSimulation:checker.metrics,coordinateBoundDiagnostics:gapSummary};
const catalog={schemaVersion:1,kind:"POPULATION_ASSUMED_BIRTH_CATALOG",sourceMetadataSha256:a.sourceMetadataSha256,proofSha256:sha(bytes),pairMapHash:a.pairMapHash,origins:a.origins,branches:a.branches,stats:db.stats,classes,classIndex,groups,scope:a.scope,summary};
const cb=z.gzipSync(Buffer.from(JSON.stringify(catalog)),{level:6}),gb=z.gzipSync(Buffer.from(JSON.stringify({schemaVersion:1,kind:"POPULATION_CONDITIONAL_BOUND_GAP",sourceMetadataSha256:a.sourceMetadataSha256,proofSha256:sha(bytes),invariantSha256:invariant?.sha256||null,summary:gapSummary,rows:replayGaps})),{level:6});
fs.writeFileSync("public/data/"+proofFile,bytes);fs.writeFileSync("public/data/"+catalogFile,cb);fs.writeFileSync("public/data/"+gapFile,gb);
const shape=xs=>a.origins.map((_,i)=>xs.slice(i*a.branches.length,(i+1)*a.branches.length));
db.populationAssumedBirthClosure={schemaVersion:1,model:MODEL,fingerprint:a.fingerprint,pairMapHash:a.pairMapHash,sourceMetadataSha256:a.sourceMetadataSha256,sourceD3Sha256:v.sha256,sourceRandomBoxSha256:rb.sha256,file:proofFile,sha256:sha(bytes),bytes:bytes.length,catalog:{file:catalogFile,sha256:sha(cb),bytes:cb.length},boundGap:{file:gapFile,sha256:sha(gb),bytes:gb.length,summary:gapSummary},scope:a.scope,summary,origins:a.origins,branches:a.branches,status:shape(codes).map(x=>x.join("")),admittedStatus:shape(admitted.map(gs=>gs.length?1:0)).map(x=>x.join("")),classIndex:shape(classIndex),classes:classes.map(({id,representative,groups,frontierCount,bodies})=>({id,representative,groups,frontierCount,bodies:bodies.map(({frontier,...b})=>b)})),groups,actualGameCertified:false};
db.summary.populationAssumedBirthClosure=summary;
db.sources.POPASSUMEDBIRTH12={file:"tools/build-population-assumed-birth-closure.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPASSUMEDBIRTH12="모든 출생처×관측 연구 분기에 대하여 출생 자체를 가정한 고정 연구 독립 수치모형의 파레토 폐쇄. 출생 요구 연구의 관측 충족 여부 및 실제 시간순 조건부 증거는 별도. 실제 모집·전역 최적성 미인증.";
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({summary,gap:gapSummary,catalogBytes:cb.length,proofBytes:bytes.length,registryWitnesses:Object.keys(db.witnesses).length}));
