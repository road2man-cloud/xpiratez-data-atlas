// Chronological missing-recruitment expansion from existing accepted research roots.
// Reuse exact prefixes and identical goal sets; no speculative research grants.
// Persist successful recruitment + deterministic immediate surgery evidence.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {serialize} from "node:v8";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p))),hash=x=>createHash("sha256").update(x).digest("hex"),key=x=>hash(JSON.stringify(x));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const sourceFile="public/data/branch-soldier-results.json.gz",db=decode(sourceFile),data=read("public/data/soldiers-modern-index.json");
const ledger=read("public/data/soldier-acquisition-progression-20261102.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const rootFile=arg("roots","D:/xpiratez-data-atlas/experiments/endgame-current-save/12-damsel-madgal-2280-cap-root-chronology.json"),rootData=read(rootFile);
if(rootData.sourceMetadataSha256!==db.sourceMetadataSha256||data.meta.source.metadataSha256!==db.sourceMetadataSha256||data.profiles.length!==72)throw Error("Source mismatch");
const planMap=new Map([...(rootData.oldExactRootPlans||[]),...(rootData.oldChosenCauseRawProbes||[]),...(rootData.newNoCauseProbes||[])].map(p=>[p.rank,p]));
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const allowed=(n,plan)=>plan.requiredActive.every(id=>active(n.world,id))&&!n.trace.some(t=>t.added?.some(id=>plan.avoidIds.includes(id)));
const branches=db.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict),branchMap=new Map(branches.map(b=>[b.id,b])),rankMap=new Map(branches.map(b=>[b.rank,b]));
const sourceRows=new Map(ledger.rows.map(r=>[r.id,r]));
const profileMap=new Map(data.profiles.map(p=>[p.id,p]));
const profiles=data.profiles.filter(p=>p.sourceType!=="event"&&sourceRows.get(p.id)?.kind==="SOURCE_SPAWN");
const known=new Set(Object.values(db.witnesses).filter(w=>["UNIFIED12","CAREER12"].includes(w.source)&&w.originProfile).flatMap(w=>(w.branchIds||[]).map(b=>w.originProfile+"|"+b)));
const prior=db.originUnlockSearch;
const fp=key([db.sourceMetadataSha256,...["tools/build-population-unlock-search.mjs","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json",...fs.readdirSync("public/soldiers/modern").filter(n=>n.endsWith(".js")&&n!=="app.js").sort().map(n=>"public/soldiers/modern/"+n)].map(f=>hash(fs.readFileSync(f)))]);
if(prior&&prior.fingerprint!==fp)throw Error("Prior unlock engine changed: migrate explicitly");
const pairs={...(prior?.pairs||{})},roots={...(prior?.roots||{})},attempts={...(prior?.attempts||{})},witnesses={...(prior?.witnesses||{})};
const existingRoots=Object.entries(db.originPairSearch?.roots||{}).map(([digest,r])=>({digest,historyId:r.historyId,actions:r.actions,rank:Number(r.historyId.split(":")[1])}));
const extra=rootData.evidence.filter(h=>h.rawActionsRetained&&Array.isArray(h.rawActions)&&rankMap.has(h.rank)).map(h=>({digest:key(h.rawActions),historyId:h.id,actions:h.rawActions,rank:h.rank}));
const choices=[...new Map([...existingRoots,...extra.sort((a,b)=>a.actions.length-b.actions.length)].filter(r=>rankMap.has(r.rank)&&planMap.has(r.rank)).map(r=>[r.digest,r])).values()];
const ordered=[...choices.filter(r=>existingRoots.some(x=>x.digest===r.digest)),...choices.filter(r=>!existingRoots.some(x=>x.digest===r.digest))];
const planner=createFoundationResearchPlanner(data,{maxAttempts:150,maxDepth:45,maxSteps:1200,methodLimit:24,collectFailures:true});
const bodies=new Map(data.soldiers.map(s=>[s.id,s])),rules=data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"));
const vec=s=>STAT_KEYS.map(k=>s[k]),total=v=>v.reduce((n,x)=>n+x,0);
const finish=s=>{const body=bodies.get(s.soldierType),raw=vec(s.currentStats);for(let i=0;i<12;i++){const k=STAT_KEYS[i],cap=body.statCaps[k];if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)continue;if(cap>raw[i])raw[i]=k==="bravery"?raw[i]+10*Math.floor((cap-raw[i])/10):cap;}const m=bonusStats(s,data),bonus=STAT_KEYS.map(k=>m[k]||0);return {body:s.soldierType,raw,bonus,vector:raw.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&bonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+bonus[i]))};};
const started=performance.now(),cpu=process.cpuUsage(),seconds=Number(arg("seconds","45")),maxAttempts=Number(arg("limit","150")),maxRoots=Number(arg("max-roots","12")),metrics={newPairs:0,newOrigins:0,attempted:0,failed:0,rootReplay:0,rootFailed:0,goalReuse:0,goalSearches:0,actionsAdded:0,newWitnesses:0,transformReplay:0,transformRejected:0,contextRejected:0};
const oldOrigins=new Set(Object.values(pairs).map(p=>p.origin)),newOrigins=new Set(),coverage=new Map();
for(const p of Object.values(pairs))coverage.set(p.origin,(coverage.get(p.origin)||0)+1);
const activeBefore=(n,p)=>p.requires.every(id=>active(n.world,id));
const startOk=()=>metrics.attempted<maxAttempts&&performance.now()-started<seconds*1000;
for(const root of ordered){
 if(!startOk()||metrics.rootReplay>=maxRoots)break;
 const b=rankMap.get(root.rank),plan=planMap.get(root.rank);
 // Include only profiles with an actually missing requirement in the root;
 // work already covered by the existing pair search is not repeated.
 const pending=profiles.filter(p=>{const id=p.id+"|"+b.id;return !pairs[id]&&!known.has(id)&&!db.originPairSearch?.pairs?.[id]&&!attempts[root.digest+"|"+p.id];});
 if(!pending.length)continue;
 const replay=replayOriginWitness(root.actions,data,{requireCompatibleContext:true});metrics.rootReplay++;
 if(!replay.ok||replay.world.soldiers.some(s=>s.id==="origin")){metrics.rootFailed++;continue;}
 const prefix={world:replay.world,steps:root.actions,trace:replay.trace,diagnostics:[]};
 if(!allowed(prefix,plan)){metrics.rootFailed++;continue;}
 const goalsCache=new Map();
 pending.sort((a,b)=>(coverage.get(a.id)||0)-(coverage.get(b.id)||0)||a.id.localeCompare(b.id));
 for(const p of pending){
  if(!startOk())break;
  if(activeBefore(prefix,p))continue;
  const id=p.id+"|"+b.id,aid=root.digest+"|"+p.id,missing=p.requires.filter(id=>!active(prefix.world,id)),goalSet=[...new Set([...plan.requiredActive,...p.requires])],gk=key(goalSet.slice().sort());
  metrics.attempted++;
  let q=goalsCache.get(gk);
  if(q)metrics.goalReuse++;else{q=planner.ensure(goalSet,prefix);goalsCache.set(gk,q);metrics.goalSearches++;}
  if(!q.ok||!allowed(q.node,plan)||!activeBefore(q.node,p)){
   attempts[aid]={origin:p.id,branch:b.id,historyId:root.historyId,missing,reason:q.reason||"Branch commitment lost",unresolved:q.unresolved||null,status:"LIMITED_UNRESOLVED"};metrics.failed++;continue;
  }
  try{
   const n=planner.clone(q.node);
   planner.supply(n,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[],funds:Math.max(0,p.cost||0)},"Conditional recruitment inputs "+p.id);
   planner.append(n,{type:"recruit",soldier:"origin",profile:p.id,band:"min"});
   if(!allowed(n,plan))throw Error("Branch commitment lost after recruitment");
   const ctx=auditOriginCampaignContext(n.steps,data);
   if(ctx.kind!=="compatible"){metrics.contextRejected++;throw Error("Difficulty/source context "+ctx.kind);}
   const member=n.world.soldiers.find(s=>s.id==="origin"),s=member?.state;
   if(!s?.exactStats||s.soldierType!==p.soldierType)throw Error("Recruitment state not exact");
   const suffix=n.steps.slice(root.actions.length),newResearch=[...n.world.researched].filter(id=>!prefix.world.researched.has(id)&&active(n.world,id));
   const r={origin:p.id,branch:b.id,root:root.digest,historyId:root.historyId,missing,addedResearch:newResearch,suffix,fullActionHash:key(n.steps),stateHash:hash(serialize(n.world)),allowedDifficulties:ctx.allowedDifficulties,raw:vec(s.currentStats),bonus:vec(Object.fromEntries(STAT_KEYS.map(k=>[k,bonusStats(s,data)[k]||0]))),body:s.soldierType,witnessIds:[],actualGameCertified:false};
   function store(st,steps,actions){
    const f=finish(st),wid="POPUNLOCK12:"+key([id,steps,f.raw,f.bonus]).slice(0,24);
    const w={source:"POPUNLOCK12",originProfile:p.id,branchIds:[b.id],body:f.body,raw:f.raw,bonus:f.bonus,vector:f.vector,steps:steps.map(id=>({id,count:1})),research:[...new Set([...p.requires,...steps.flatMap(id=>data.transformations.find(t=>t.id===id).requires)])].sort(),placement:"REPLAYED_MIN_BIRTH_AND_IMMEDIATE_TRANSFORM_THEN_CONDITIONAL_CAP",populationUnlock:{pair:id,actions,rawBeforeFinalGrowth:vec(st.currentStats)},actualGameCertified:false};
    witnesses[wid]=w;r.witnessIds.push(wid);metrics.newWitnesses++;
   }
   store(s,[],[]);
   // Each legal deterministic immediate transformation is replayed on the
   // actual recruited world, not on an invented grown soldier.
   for(const rule of rules){
    if(!rule.allowedSoldierTypes.includes(s.soldierType)||!rule.requires.every(id=>active(n.world,id)))continue;
    const probe=applyTransformation(rule,s,data,{mode:"current",researched:rule.requires,disabled:[],baseFunctions:rule.requiresBaseFunc||[],items:rule.requiredItems||{},funds:Math.max(0,rule.cost||0),commendations:member.commendations,statsKnown:true,medalsKnown:true});
    if(probe.verdict.kind!=="eligible"||!probe.state.exactStats||probe.state.retired)continue;
    try{
     const t=planner.clone(n);
     planner.supply(t,{items:rule.requiredItems||{},functions:rule.requiresBaseFunc||[],funds:Math.max(0,rule.cost||0)},"Conditional immediate transformation inputs "+rule.id);
     planner.append(t,{type:"transform",soldier:"origin",transform:rule.id});
     const next=t.world.soldiers.find(x=>x.id==="origin")?.state;
     if(!next?.exactStats||next.retired||!allowed(t,plan))throw Error("Invalid transform replay");
     store(next,[rule.id],t.steps.slice(n.steps.length));metrics.transformReplay++;
    }catch(e){metrics.transformRejected++;}
   }
   if(!roots[root.digest])roots[root.digest]={historyId:root.historyId,actions:root.actions,actionHash:root.digest};
   pairs[id]=r;metrics.newPairs++;metrics.actionsAdded+=suffix.length;newOrigins.add(p.id);coverage.set(p.id,(coverage.get(p.id)||0)+1);
   console.log("NEW",b.rank,p.id,missing.join(","),newResearch.length,r.witnessIds.length);
  }catch(e){attempts[aid]={origin:p.id,branch:b.id,historyId:root.historyId,missing,reason:e.message,status:"LIMITED_UNRESOLVED"};metrics.failed++;}
 }
}
metrics.newOrigins=[...newOrigins].filter(id=>!oldOrigins.has(id)).length;
const elapsedMs=Math.round(performance.now()-started),u=process.cpuUsage(cpu);
const summary={...metrics,registeredPairs:Object.keys(pairs).length,registeredOrigins:new Set(Object.values(pairs).map(p=>p.origin)).size,registeredBranches:new Set(Object.values(pairs).map(p=>p.branch)).size,registeredWitnesses:Object.keys(witnesses).length,limitedAttempts:Object.keys(attempts).length,rootPrefixes:Object.keys(roots).length,elapsedMs,cpuMs:Math.round((u.user+u.system)/1000),peakRssBytes:process.resourceUsage().maxRSS*1024,actualGameCertified:0};
const report={schemaVersion:1,kind:"POPULATION_RECRUITMENT_UNLOCK_SEARCH",fingerprint:fp,sourceMetadataSha256:db.sourceMetadataSha256,sourceRootSha256:hash(fs.readFileSync(rootFile)),pairs,roots,attempts,witnesses,summary,scope:"Accepted chronological root replay, additional recruitment research, conditional indexed supply, min birth and immediate deterministic transform; final combat-cap projection conditional. No proof of impossibility/global maximum."};
fs.writeFileSync(arg("out","population-unlock-search.json.gz"),zlib.gzipSync(Buffer.from(JSON.stringify(report)),{level:6}));
console.log(JSON.stringify(summary));
