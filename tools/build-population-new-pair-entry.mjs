// Expand coverage, not just routes within existing pairs. Reuse retained
// research roots, never treat failed recruitment as an impossibility proof.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {createGrowthReplay,exactWorld,member} from "./population-growth-replay-core.mjs";
import {integratedCoverage} from "../public/branch-soldier-integrated-coverage.js";
import {preflightTemplate} from "./population-research-template-selector.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p))),sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const file="public/data/branch-soldier-results.json.gz",db=decode(file),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const rootFile=arg("roots","D:/xpiratez-data-atlas/experiments/endgame-current-save/12-damsel-madgal-2280-cap-root-chronology.json"),raw=fs.readFileSync(rootFile),rd=JSON.parse(raw);
assert.equal(rd.sourceMetadataSha256,db.sourceMetadataSha256);
const prior=db.populationNewPairEntry,coverage=integratedCoverage(db),branches=new Map(db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount&&coverage.byBranch[b.id]).map(b=>[b.rank,b]));
const plans=new Map([...(rd.oldExactRootPlans||[]),...(rd.oldChosenCauseRawProbes||[]),...(rd.newNoCauseProbes||[])].map(p=>[p.rank,p]));
const profiles=data.profiles.filter(p=>p.sourceType!=="event"&&data.originRows.some(r=>r.id===p.id&&r.kind==="SOURCE_SPAWN"));
const roots={...prior?.roots},routes={...prior?.routes},attempts={...prior?.attempts},planTemplates={...prior?.planTemplates};
const originCount=new Map(profiles.map(p=>[p.id,coverage.byOrigin[p.id]?.conditional||0]));
const candidates=rd.evidence.filter(e=>e.rawActionsRetained&&Array.isArray(e.rawActions)&&branches.has(e.rank)&&plans.has(e.rank)).map(e=>({rank:e.rank,id:e.id,actions:e.rawActions,hash:key(e.rawActions)}));
const seen=new Set(),ordered=candidates.sort((a,b)=>coverage.byBranch[branches.get(a.rank).id].conditional-coverage.byBranch[branches.get(b.rank).id].conditional||a.actions.length-b.actions.length||a.rank-b.rank).filter(r=>{if(seen.has(r.rank+"|"+r.hash))return false;seen.add(r.rank+"|"+r.hash);return true;});
const planner=createFoundationResearchPlanner(data,{maxAttempts:100,maxDepth:35,maxSteps:1800,methodLimit:24}),g=createGrowthReplay(data);
const metrics={roots:0,rootFailures:0,attempted:0,failed:0,planCalls:0,planReuse:0,direct:0,added:0,templateHits:0,templateRejected:0,templatePreflightRejects:0,templateSavedSteps:0};
const diverse=process.argv.includes("--diverse");
const t0=performance.now(),seconds=Number(arg("seconds","25")),limit=Number(arg("limit","160")),perRoot=Number(arg("per-root","8")),timely=()=>metrics.attempted<limit&&performance.now()-t0<seconds*1000;
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),found=new Set(Object.values(routes).map(r=>r.origin+"|"+r.branch));
for(const root of ordered){
 if(!timely())break;
 const b=branches.get(root.rank),plan=plans.get(root.rank),commit=[...new Set([...plan.requiredActive,...b.captain,...Object.values(b.choices||{}).filter(Boolean)])],avoid=new Set([...plan.avoidIds,...(b.blockedResearch||[])]);
 const pending=profiles.filter(p=>!coverage.pair(p.id,b.id)?.conditional&&!found.has(p.id+"|"+b.id)&&!attempts[key([root.hash,b.id,p.id])]);
 if(!pending.length)continue;
 metrics.roots++;
 const rr=replayOriginWitness(root.actions,data,{requireCompatibleContext:true});
 if(!rr.ok||rr.world.soldiers.some(s=>s.id==="origin")||!commit.every(k=>active(rr.world,k))||rr.trace.some(t=>t.added?.some(k=>avoid.has(k)))){metrics.rootFailures++;continue;}
 const prefix={world:rr.world,steps:root.actions,trace:rr.trace,diagnostics:[]},cache=new Map();
 pending.sort((a,b)=>(diverse?(originCount.get(a.id)||0)-(originCount.get(b.id)||0):0)||a.requires.filter(k=>!active(rr.world,k)).length-b.requires.filter(k=>!active(rr.world,k)).length||(originCount.get(a.id)||0)-(originCount.get(b.id)||0)||a.id.localeCompare(b.id));
 let count=0;
 for(const p of pending){
  if(!timely()||count>=perRoot)break;
  count++;metrics.attempted++;
  const aid=key([root.hash,b.id,p.id]),rec={origin:p.id,branch:b.id,root:root.hash},missing=p.requires.filter(k=>!active(rr.world,k));
  try{
   const goals=[...new Set([...commit,...p.requires])],k=key(goals),direct=!missing.length;
   let q;if(direct){q={ok:true,node:prefix};metrics.direct++;}else if(cache.has(k)){q=cache.get(k);metrics.planReuse++;}else{
    const tk=key(missing.slice().sort());
    for(const suffix of planTemplates[tk]||[]){
     if(preflightTemplate(prefix.world,suffix,data)){metrics.templatePreflightRejects++;continue;}
     try{
      const n=planner.clone(prefix);for(const a of suffix)planner.append(n,a);
      if(n.world.pendingFree||!goals.every(k=>active(n.world,k))||n.trace.some(t=>t.added?.some(k=>avoid.has(k))||t.closed?.some(k=>commit.includes(k))))throw Error("TEMPLATE_CONTEXT");
      q={ok:true,node:n};metrics.templateHits++;metrics.templateSavedSteps+=suffix.length;break;
     }catch{metrics.templateRejected++;}
    }
    if(!q){q=planner.ensure(goals,prefix);metrics.planCalls++;
     if(q.ok&&goals.every(k=>active(q.node.world,k))&&!q.node.trace.some(t=>t.added?.some(k=>avoid.has(k)))){
      const suffix=q.node.steps.slice(prefix.steps.length),old=planTemplates[tk]||[];
      if(suffix.length&&!old.some(s=>key(s)===key(suffix)))planTemplates[tk]=[suffix,...old].slice(0,8);
     }
    }
    cache.set(k,q);
   }
   if(!q.ok)throw Error(q.reason||"PLAN_UNRESOLVED");
   if(q.node.trace.some(t=>t.added?.some(k=>avoid.has(k)))||!goals.every(k=>active(q.node.world,k)))throw Error("BRANCH_CONFLICT");
   const n=planner.clone(q.node);
   planner.supply(n,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[],funds:Math.max(0,p.cost||0)},"Conditional recruitment inputs "+p.id);
   planner.append(n,{type:"recruit",soldier:"origin",profile:p.id,band:"min"});
   const ctx=auditOriginCampaignContext(n.steps,data);
   if(ctx.kind!=="compatible"||!commit.every(k=>active(n.world,k))||n.trace.some(t=>t.added?.some(k=>avoid.has(k))))throw Error("RECRUIT_CONTEXT");
   const m=member(n.world);assert(m?.state.exactStats&&m.state.soldierType===p.soldierType);
   const grown=g.grow({world:n.world,steps:n.steps}),f=g.finish(grown.world),id="POPNEWPAIR12:"+key([p.id,b.id,grown.steps]).slice(0,24);
   roots[root.hash]??={actions:root.actions,historyId:root.id,rank:root.rank};
   routes[id]={...rec,body:f.body,actions:grown.steps.slice(root.actions.length),fullActionHash:key(grown.steps),canonicalStateHash:exactWorld(grown.world),allowedDifficulties:ctx.allowedDifficulties,commit,avoid:[...avoid].sort(),missing,...f,actualGameCertified:false};
   attempts[aid]={...rec,status:"CONDITIONAL_REPLAY",route:id};found.add(p.id+"|"+b.id);metrics.added++;originCount.set(p.id,(originCount.get(p.id)||0)+1);
  }catch(e){attempts[aid]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};metrics.failed++;}
 }
}
const summary={...metrics,registeredRoutes:Object.keys(routes).length,registeredPairs:found.size,registeredBranches:new Set(Object.values(routes).map(r=>r.branch)).size,registeredOrigins:new Set(Object.values(routes).map(r=>r.origin)).size,templateBuckets:Object.keys(planTemplates).length,templateCount:Object.values(planTemplates).reduce((n,x)=>n+x.length,0),elapsedSeconds:(performance.now()-t0)/1000,fullCompleted:0,actualGameCertified:0};
const result={kind:"POPULATION_NEW_PAIR_ENTRY",schemaVersion:1,sourceMetadataSha256:db.sourceMetadataSha256,sourceRootSha256:sha(raw),roots,routes,attempts,planTemplates,published:Object.keys(routes),summary,scope:"Conditional non-event minimum recruitment and final combat-cap growth replay; retained research root, conditional supplies, no global certification."};
fs.writeFileSync(arg("out","population-new-pair-entry.json.gz"),z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));console.log(JSON.stringify(summary));
