// Add actual goal-directed research actions AFTER a recorded birth.
// This is a bounded chronological search, separate from fixed-active D6.
// Never grant research directly or reuse results across canonical branches.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {STAT_KEYS,bonusStats,applyTransformation} from "../public/soldiers/modern/eligibility.js";
import {exactStateHash,createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const file="public/data/branch-soldier-results.json.gz",db=decode(file),u=db.originUnlockSearch,e=db.originEventBirth,x=db.originExtendedContinuation;
assert(u&&e&&x&&x.sourceMetadataSha256===db.sourceMetadataSha256);
const data=read("public/data/soldiers-modern-index.json"),ledger=read("public/data/soldier-acquisition-progression-20261102.json"),catalog=read("public/data/soldier-source-catalog.json");
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);assert.equal(STAT_KEYS.join(),db.stats.join());
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const deps=["tools/build-population-research-continuation.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json",...fs.readdirSync("public/soldiers/modern").filter(s=>s.endsWith(".js")&&s!=="app.js").sort().map(s=>"public/soldiers/modern/"+s)];
const hashes=Object.fromEntries(deps.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const fingerprint=key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,hashes]);
const prior=db.originResearchContinuation;if(prior)assert.equal(prior.fingerprint,fingerprint,"Research continuation migration required");
const routes={...(prior?.routes||{})},attempts={...(prior?.attempts||{})},visits={...(prior?.visits||{})};
const priorCount=Object.keys(routes).length,priorWitnesses=Object.keys(db.witnesses).length;
const tasks=[],branches=new Map(db.branches.map(b=>[b.id,b]));
for(const [id,p] of Object.entries(u.pairs)){
 const root=u.roots[p.root];assert.equal(key(root.actions),p.root);tasks.push({id:"unlock:"+id,kind:"unlock",pair:id,p,actions:[...root.actions,...p.suffix]});
}
for(const [id,p] of Object.entries(e.variants)){
 const root=e.roots[p.root];assert.equal(key(root.actions),p.root);assert(e.pairs[p.pair]?.variants.includes(id));tasks.push({id:"event:"+id,kind:"event",pair:p.pair,p,actions:[...root.actions.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.actions.slice(p.insertionAt)]});
}
const legacyHashes={...x.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
const cacheKey=key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,legacyHashes]);
for(const [p,h] of Object.entries(x.hashes))if(p!=="tools/build-population-extended-continuation.mjs")assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Birth dependency drift "+p);
const cache=createExactPrefixCheckpointCache(".population-extended-cache",cacheKey);
const planner=createFoundationResearchPlanner(data,{maxAttempts:85,maxDepth:28,maxSteps:1200,methodLimit:16});
const member=n=>n.world.soldiers.find(s=>s.id==="origin"),vec=s=>STAT_KEYS.map(k=>s[k]||0),active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const deterministic=r=>!STAT_KEYS.some(k=>r.rerollStats?.[k]||["flat","percent","percentGained"].some(s=>Number(r[s+"Min"]?.[k]||0)!==Number(r[s+"Max"]?.[k]||0)));
const byBody=new Map(),bodies=new Map(data.soldiers.map(b=>[b.id,b]));
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")&&deterministic(r))for(const body of r.allowedSoldierTypes||[]){const a=byBody.get(body)||[];a.push(r);byBody.set(body,a);}
const start=performance.now(),limit=Number(arg("limit","100")),seconds=Number(arg("seconds","24"));
assert(Number.isSafeInteger(limit)&&limit>0&&Number.isFinite(seconds)&&seconds>0);
const m={newRoutes:0,visited:0,birthFailures:0,goalAttempts:0,goalFailed:0,gateRejected:0,contextRejected:0,cacheHits:0,addedResearchActions:0,byBranch:{},bySource:{},researchPlanReuse:0};
const enough=()=>m.newRoutes<limit&&performance.now()-start<seconds*1000;
const pending=new Map();
for(const t of tasks){if(!pending.has(t.p.branch))pending.set(t.p.branch,[]);pending.get(t.p.branch).push(t);}
const priorBranchCounts={};for(const r of Object.values(routes))priorBranchCounts[r.branch]=(priorBranchCounts[r.branch]||0)+1;
const groups=[...pending].sort(([a],[b])=>(priorBranchCounts[a]||0)-(priorBranchCounts[b]||0)||a.localeCompare(b));
for(const [,a] of groups)a.sort((a,b)=>(visits[a.id]||0)-(visits[b.id]||0)||a.id.localeCompare(b.id));
const queue=[];for(let i=0;;i++){let any=false;for(const [,a] of groups)if(a[i]){queue.push(a[i]);any=true;}if(!any)break;}
const knownBranchChoices=new Set(db.branches.flatMap(b=>[...b.captain,...Object.values(b.choices||{})]).filter(Boolean));
function birth(t){
 const p=t.p;assert.equal(key(t.actions),p.fullActionHash);
 const ctx=auditOriginCampaignContext(t.actions,data);if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.some(x=>p.allowedDifficulties.includes(x)))throw Error("Birth campaign context mismatch");
 let n=cache.load(t.actions,p.stateHash);
 if(n)m.cacheHits++;else{n=planner.newNode();for(const step of t.actions)planner.append(n,step);if(sha(serialize(n.world))!==p.stateHash)throw Error("Birth state hash mismatch");cache.save(n,p.stateHash);}
 const s=member(n)?.state;if(!s?.exactStats||s.retired||s.soldierType!==p.body||key(vec(s.currentStats))!==key(p.raw))throw Error("Birth state differs");
 if(p.bonus&&key(vec(bonusStats(s,data,{commendations:member(n).commendations||{}})))!==key(p.bonus))throw Error("Birth bonus differs");
 return n;
}
function finish(n){
 const s=member(n).state,body=bodies.get(s.soldierType),raw=vec(s.currentStats),bonus=vec(bonusStats(s,data,{commendations:member(n).commendations||{}}));
 const capRaw=raw.map((v,i)=>{const k=STAT_KEYS[i],cap=body.statCaps[k];if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)return v;return cap>v?(k==="bravery"?v+10*Math.floor((cap-v)/10):cap):v;});
 if(![...raw,...bonus,...capRaw].every(Number.isSafeInteger))throw Error("Invalid vector");
 const effective=a=>a.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));
 return {body:s.soldierType,raw,bonus,vector:effective(raw),capRaw,capVector:effective(capRaw)};
}
const branchQuota=Math.max(2,Math.ceil(limit/groups.length));
for(const t of queue){
 if(!enough())break;
 if((m.byBranch[t.p.branch]||0)>=branchQuota)continue;
 visits[t.id]=(visits[t.id]||0)+1;m.visited++;
 let n;try{n=birth(t);}catch{m.birthFailures++;continue;}
 const b=branches.get(t.p.branch),commitments=[...b.captain,...Object.values(b.choices||{}).filter(Boolean)];
 if(b.sourceRootConflict||!commitments.every(k=>active(n.world,k))){m.contextRejected++;continue;}
 const s=member(n).state,blocked=new Set(b.blockedResearch||[]),opposing=new Set([...knownBranchChoices].filter(k=>!commitments.includes(k)&&!n.world.researched.has(k)));
 // Probe stats/rank/history before spending search budget. A rejection is
 // only a limited-search result, never a proof of game impossibility.
 const targets=(byBody.get(s.soldierType)||[]).filter(r=>r.requires.some(k=>!active(n.world,k))&&r.requires.every(k=>!blocked.has(k)&&!opposing.has(k))&&r.minRank<=s.rank);
 targets.sort((a,b)=>a.requires.reduce((v,k)=>v+(active(n.world,k)?0:planner.distance.get(k)??1e8),0)-b.requires.reduce((v,k)=>v+(active(n.world,k)?0:planner.distance.get(k)??1e8),0)||a.id.localeCompare(b.id));
 const memo=new Map();let tried=0,produced=0;
 for(const r of targets){
  if(!enough()||tried>=4||produced>=2||(m.byBranch[t.p.branch]||0)>=branchQuota)break;
  const aid=key([t.id,r.id]);if(attempts[aid])continue;
  let probe;try{probe=applyTransformation(r,s,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:member(n).commendations,statsKnown:true,medalsKnown:true});}catch{m.gateRejected++;continue;}
  if(probe.verdict.kind!=="eligible"||!probe.state.exactStats||probe.state.retired){m.gateRejected++;continue;}
  tried++;m.goalAttempts++;
  const goals=[...new Set([...commitments,...r.requires])],gk=key(goals),found=memo.get(gk);
  const q=found||planner.ensure(goals,n);if(found)m.researchPlanReuse++;else memo.set(gk,q);
  if(!q.ok){m.goalFailed++;attempts[aid]={input:t.id,rule:r.id,status:"LIMITED_UNRESOLVED",reason:q.reason||"Goal search exhausted"};continue;}
  try{
   const c=planner.clone(q.node),extension=c.steps.slice(n.steps.length),newTrace=c.trace.slice(n.trace.length);
   if(!extension.length||!r.requires.every(k=>active(c.world,k))||!commitments.every(k=>active(c.world,k)))throw Error("Required research not active");
   if(newTrace.some(z=>(z.added||[]).some(k=>opposing.has(k)||blocked.has(k))||(z.closed||[]).some(k=>commitments.includes(k))))throw Error("Branch commitments changed");
   const researchContext=auditOriginCampaignContext(c.steps,data);
   if(researchContext.kind!=="compatible"||!researchContext.allowedDifficulties.some(k=>t.p.allowedDifficulties.includes(k)))throw Error("Joint campaign context incompatible");
   planner.supply(c,{items:r.requiredItems||{},functions:r.requiresBaseFunc||[],funds:Math.max(0,r.cost||0)},"Conditional indexed research continuation "+r.id);
   planner.append(c,{type:"transform",soldier:"origin",transform:r.id});
   const f=finish(c),actions=c.steps.slice(n.steps.length),id="PXR12:"+key([t.id,actions]).slice(0,24),newActive=[...c.world.researched].filter(k=>active(c.world,k)&&!active(n.world,k));
   const record={input:t.id,kind:t.kind,pair:t.pair,origin:t.p.origin,branch:t.p.branch,root:t.p.root,order:[r.id],goal:r.requires,missing:r.requires.filter(k=>!active(n.world,k)),addedResearch:newActive,actions,birthActionHash:t.p.fullActionHash,birthStateHash:t.p.stateHash,fullActionHash:key(c.steps),canonicalStateHash:exactStateHash(c.world),allowedDifficulties:researchContext.allowedDifficulties.filter(k=>t.p.allowedDifficulties.includes(k)),...f,actualGameCertified:false};
   if(routes[id]){assert.deepEqual(routes[id],record);continue;}
   const metadata=t.kind==="unlock"?{populationUnlock:{pair:t.pair,actions,rawBeforeFinalGrowth:f.raw}}:{populationEvent:{variant:t.p.id,actions,rawBeforeFinalGrowth:f.raw}};
   const witness={source:"POPRESEARCH12",originProfile:record.origin,branchIds:[record.branch],body:f.body,raw:f.capRaw,bonus:f.bonus,vector:f.capVector,steps:[{id:r.id,count:1}],research:r.requires,placement:"REPLAYED_BIRTH_RESEARCH_AND_TRANSFORM_THEN_CONDITIONAL_CAP",populationResearch:{route:id,missing:record.missing,addedResearch:newActive,fullActionHash:record.fullActionHash},...metadata,actualGameCertified:false};
   assert(!db.witnesses[id]);db.witnesses[id]=witness;routes[id]=record;
   attempts[aid]={input:t.id,rule:r.id,status:"CONDITIONAL_REPLAY",route:id};
   m.newRoutes++;produced++;m.byBranch[record.branch]=(m.byBranch[record.branch]||0)+1;m.bySource[t.kind]=(m.bySource[t.kind]||0)+1;m.addedResearchActions+=extension.length;
  }catch(err){m.contextRejected++;attempts[aid]={input:t.id,rule:r.id,status:"LIMITED_UNRESOLVED",reason:String(err.message)};}
 }
}
const all=Object.values(routes),summary={...m,priorRoutes:priorCount,registeredRoutes:all.length,registeredOrigins:new Set(all.map(r=>r.origin)).size,registeredBranches:new Set(all.map(r=>r.branch)).size,registeredPairs:new Set(all.map(r=>r.pair)).size,attemptedGoals:Object.keys(attempts).length,seconds:(performance.now()-start)/1000,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_RESEARCH_CONTINUATION",fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,unlockFingerprint:u.fingerprint,eventFingerprint:e.fingerprint,routes,attempts,visits,published:Object.keys(routes),summary,scope:"Recorded birth + actual goal-directed research actions + deterministic immediate transform. Preserves branch and difficulty, no intervening stat growth. Final cap projection is conditional; limited goal search failures are not impossibility proofs."};
assert.equal(Object.keys(db.witnesses).length-priorWitnesses,m.newRoutes);
db.originResearchContinuation=result;db.summary.originResearchContinuation=summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPRESEARCH12={file:"tools/build-population-research-continuation.mjs",fingerprint,sourceMetadataSha256:db.sourceMetadataSha256};
db.policies.POPRESEARCH12="기존 모집 이후 필요한 연구를 실제 시간순 조건부 행동으로 추가하고 원래 분기 선택 및 공동 난이도 조건을 유지한 채 결정론적 시술을 재생. 마지막 전투캡 수치는 조건부 투영; 무작위 성장·승급·전체 최적성 미인증.";
fs.writeFileSync(file+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify(summary));
