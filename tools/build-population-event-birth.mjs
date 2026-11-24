// Conditional event recruitment inserted in actual chronological research roots.
// No geography, random rolls, or complete event reward effects are invented.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {originEventScript} from "../public/soldiers/modern/origin-witness.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
const json=p=>JSON.parse(fs.readFileSync(p)),sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/branch-soldier-results.json.gz"))),data=json("public/data/soldiers-modern-index.json"),ledger=json("public/data/soldier-acquisition-progression-20261102.json"),catalog=json("public/data/soldier-source-catalog.json");
const rootFile=arg("roots","D:/xpiratez-data-atlas/experiments/endgame-current-save/12-damsel-madgal-2280-cap-root-chronology.json"),rootData=json(rootFile);
if(data.meta.source.metadataSha256!==db.sourceMetadataSha256||rootData.sourceMetadataSha256!==db.sourceMetadataSha256||data.profiles.length!==72)throw Error("Source mismatch");
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const deps=["tools/build-population-event-birth.mjs","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json",...fs.readdirSync("public/soldiers/modern").filter(n=>n.endsWith(".js")&&n!=="app.js").sort().map(n=>"public/soldiers/modern/"+n)];
const fingerprint=key([db.sourceMetadataSha256,...deps.map(p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")))]);
const prior=db.originEventBirth;
if(prior&&prior.fingerprint!==fingerprint)throw Error("Event engine migration required");
const roots={...(prior?.roots||{})},pairs={...(prior?.pairs||{})},variants={...(prior?.variants||{})},witnesses={...(prior?.witnesses||{})},attempts={...(prior?.attempts||{})};
const plans=new Map([...(rootData.oldExactRootPlans||[]),...(rootData.oldChosenCauseRawProbes||[]),...(rootData.newNoCauseProbes||[])].map(p=>[p.rank,p]));
const branchByRank=new Map(db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount>0).map(b=>[b.rank,b]));
const profiles=data.profiles.filter(p=>p.sourceType==="event");
const rowById=new Map(ledger.rows.map(r=>[r.id,r]));
const alternatives=profiles.flatMap(p=>(rowById.get(p.id)?.prerequisites?.event?.alternatives||[]).map(alt=>({p,alt,script:originEventScript(alt,p.sourceId)})));
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const planner=createFoundationResearchPlanner(data,{maxAttempts:120,maxDepth:45,maxSteps:1200,methodLimit:24});
const branchValid=(n,plan)=>plan.requiredActive.every(id=>active(n.world,id))&&!n.trace.some(t=>t.added?.some(id=>plan.avoidIds.includes(id)));
const rootCandidates=[...Object.entries(db.originUnlockSearch?.roots||{}),...Object.entries(db.originPairSearch?.roots||{})].map(([digest,r])=>({digest,...r,rank:Number(r.historyId.split(":")[1])}));
const extra=rootData.evidence.filter(h=>h.rawActionsRetained&&Array.isArray(h.rawActions)&&branchByRank.has(h.rank)).map(h=>({digest:key(h.rawActions),historyId:h.id,actions:h.rawActions,rank:h.rank})).sort((a,b)=>a.actions.length-b.actions.length);
const queue=[...new Map([...rootCandidates,...extra].filter(r=>branchByRank.has(r.rank)&&plans.has(r.rank)).map(r=>[r.digest,r])).values()];
const rules=data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")),bodies=new Map(data.soldiers.map(s=>[s.id,s]));
const vec=s=>STAT_KEYS.map(k=>s[k]);
function finish(s){const body=bodies.get(s.soldierType),raw=vec(s.currentStats);for(let i=0;i<12;i++){const k=STAT_KEYS[i],cap=body.statCaps[k];if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)continue;if(cap>raw[i])raw[i]=k==="bravery"?raw[i]+10*Math.floor((cap-raw[i])/10):cap;}const m=bonusStats(s,data),bonus=STAT_KEYS.map(k=>m[k]||0);return {body:s.soldierType,raw,bonus,vector:raw.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&bonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+bonus[i]))};}
const start=performance.now(),cpu=process.cpuUsage(),seconds=Number(arg("seconds","42")),rootLimit=Number(arg("root-limit","18")),maxVariants=Number(arg("limit","180"));
const m={rootsReplayed:0,rootFailed:0,newPairs:0,newVariants:0,newWitnesses:0,prefixSteps:0,suffixSteps:0,readyProbes:0,lateResearchSearches:0,lateResearchReuse:0,failed:0,earlyInsertions:0,lateInsertions:0,transforms:0};
const enough=()=>performance.now()-start<seconds*1000&&m.newVariants<maxVariants;
const oldPairs=new Set(Object.keys(pairs)),priorOrigins=new Set(Object.values(pairs).map(p=>p.origin));
function probe(n,x){
 if(n.world.pendingFree||n.world.soldiers.some(s=>s.id==="origin"))return null;
 if(![...(x.p.requires||[]),...(x.script.researchPositive||[])].every(id=>active(n.world,id)))return null;
 // Supply is explicit at the insertion slot. For readiness, only project
 // the listed positive items; all other current conditions remain intact.
 const items={...n.world.items};for(const id of x.script.itemPositive||[])items[id]=Math.max(1,items[id]||0);
 m.readyProbes++;
 const v=eventScriptVerdict(x.script,{...n.world,items},{mode:"current"});
 return v.kind==="blocked"?null:v;
}
for(const root of queue){
 if(!enough()||m.rootsReplayed>=rootLimit)break;
 const b=branchByRank.get(root.rank),plan=plans.get(root.rank);
 const pending=alternatives.filter(x=>!attempts[key([root.digest,x.p.id,x.alt.script])]&&!pairs[x.p.id+"|"+b.id]?.variants?.some(id=>variants[id].script===x.alt.script));
 if(!pending.length)continue;
 if(key(root.actions)!==root.digest)throw Error("Root identity changed");
 const ctx=auditOriginCampaignContext(root.actions,data);if(ctx.kind!=="compatible"){m.rootFailed++;m.rootsReplayed++;continue;}
 const slots=new Map(pending.map(x=>[x,[]]));const n=planner.newNode();
 m.rootsReplayed++;
 try{
  for(let i=0;i<=root.actions.length;i++){
   // Do not insert before the only legal initial difficulty selection.
   if(i!==0||root.actions[0]?.type!=="campaignContext"){
    for(const x of pending){
     const v=probe(n,x);if(!v)continue;
     const ar=slots.get(x),entry={at:i,node:planner.clone(n),verdict:v};
     if(!ar.length)ar.push(entry);else if(ar.length===1)ar.push(entry);else ar[1]=entry;
    }
   }
   if(i<root.actions.length){planner.append(n,root.actions[i]);m.prefixSteps++;}
  }
  if(!branchValid(n,plan)||n.world.soldiers.some(s=>s.id==="origin"))throw Error("Root commitments invalid");
 }catch(e){m.rootFailed++;continue;}
 const goalCache=new Map();
 for(const x of pending){
  if(!enough())break;
  const aid=key([root.digest,x.p.id,x.alt.script]),id=x.p.id+"|"+b.id;
  let done=false,reason="No eligible insertion in recorded root";
  const trySlot=(slot,extra=[])=>{
   const t=planner.clone(slot.node),birthAt=t.steps.length;
   try{
    const reqItems=Object.fromEntries((x.script.itemPositive||[]).map(i=>[i,1]));
    planner.supply(t,{items:reqItems,functions:x.p.requiresBaseFunc||[]},"Conditional event recruitment inputs "+x.p.id);
    const verdict=eventScriptVerdict(x.script,t.world,{mode:"current"});
    if(verdict.kind==="blocked")throw Error(verdict.blocked.join("; "));
    const birthMonth=t.world.month;
    planner.append(t,{type:"recruit",soldier:"origin",profile:x.p.id,band:"min",script:x.alt.script,assumeOutcome:true});
    const inserted=t.steps.slice(birthAt);
    for(const s of root.actions.slice(slot.at)){planner.append(t,s);m.suffixSteps++;}
    if(!branchValid(t,plan))throw Error("Branch commitment lost");
    const campaign=auditOriginCampaignContext(t.steps,data);
    if(campaign.kind!=="compatible")throw Error("Joint difficulty or source context "+campaign.kind);
    const member=t.world.soldiers.find(s=>s.id==="origin"),state=member?.state;if(!state?.exactStats||state.retired)throw Error("Birth not exact");
    const vid="PEV12:"+key([id,root.digest,x.alt.script,slot.at,extra,inserted]).slice(0,24);
    const rec={id:vid,pair:id,origin:x.p.id,branch:b.id,root:root.digest,historyId:root.historyId,script:x.alt.script,event:x.p.sourceId,birthMonth,insertionAt:slot.at,extraBeforeBirth:extra,inserted,fullActionHash:key(t.steps),stateHash:sha(serialize(t.world)),allowedDifficulties:campaign.allowedDifficulties,pending:verdict.pending,unknown:verdict.unknown,raw:vec(state.currentStats),body:state.soldierType,witnessIds:[],actualGameCertified:false};
    function store(s,order,actions){
     const f=finish(s),wid="POPEVENT12:"+key([vid,order,f.raw,f.bonus]).slice(0,24);
     witnesses[wid]={source:"POPEVENT12",originProfile:x.p.id,branchIds:[b.id],...f,steps:order.map(id=>({id,count:1})),placement:"REPLAYED_EVENT_MIN_BIRTH_THEN_CONDITIONAL_CAP",populationEvent:{variant:vid,actions,rawBeforeFinalGrowth:vec(s.currentStats)},actualGameCertified:false};
     rec.witnessIds.push(wid);m.newWitnesses++;
    }
    store(state,[],[]);
    for(const r of rules){
     if(!r.allowedSoldierTypes.includes(state.soldierType)||!r.requires.every(id=>active(t.world,id)))continue;
     const p=applyTransformation(r,state,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:member.commendations,statsKnown:true,medalsKnown:true});
     if(p.verdict.kind!=="eligible"||!p.state.exactStats||p.state.retired)continue;
     try{const c=planner.clone(t);planner.supply(c,{items:r.requiredItems||{},functions:r.requiresBaseFunc||[],funds:Math.max(0,r.cost||0)},"Conditional event-origin transform "+r.id);planner.append(c,{type:"transform",soldier:"origin",transform:r.id});const s=c.world.soldiers.find(s=>s.id==="origin")?.state;if(s?.exactStats&&!s.retired&&branchValid(c,plan)){store(s,[r.id],c.steps.slice(t.steps.length));m.transforms++;}}catch{}
    }
    roots[root.digest]??={historyId:root.historyId,actions:root.actions,actionHash:root.digest};
    variants[vid]=rec;pairs[id]??={origin:x.p.id,branch:b.id,variants:[]};pairs[id].variants.push(vid);
    attempts[aid]={status:"CONDITIONAL_REPLAY",variant:vid};m.newVariants++;if(!oldPairs.has(id)){m.newPairs++;oldPairs.add(id);}
    if(slot.at<root.actions.length)m.earlyInsertions++;else m.lateInsertions++;
    return true;
   }catch(e){reason=e.message;return false;}
  };
  for(const s of slots.get(x))if(trySlot(s)){done=true;break;}
  if(!done&&enough()){
   // A late event can be reached by explicit additional research or a later
   // month, but a passed finite event window is never moved backwards.
   const last=x.alt.lastMonth;
   if(last==null||last<0||n.world.month<=last){
    const goals=[...new Set([...plan.requiredActive,...(x.p.requires||[]),...(x.script.researchPositive||[])])],gk=key(goals.slice().sort());
    let q=goalCache.get(gk);if(q)m.lateResearchReuse++;else{q=planner.ensure(goals,n);goalCache.set(gk,q);m.lateResearchSearches++;}
    if(q.ok&&branchValid(q.node,plan)){
     try{const t=planner.clone(q.node);const first=Math.max(0,x.alt.firstMonth||0);if(t.world.month<first)planner.append(t,{type:"advanceMonth",month:first,assumeContinuity:true});
      if(probe(t,x))done=trySlot({at:root.actions.length,node:t},t.steps.slice(root.actions.length));
     }catch(e){reason=e.message;}
    }else reason=q.reason||"Additional event research unresolved";
   }
  }
  if(!done){attempts[aid]={status:"LIMITED_UNRESOLVED",origin:x.p.id,branch:b.id,script:x.alt.script,historyId:root.historyId,reason};m.failed++;}
 }
 console.log("ROOT",b.rank,m.newVariants,m.newPairs);
}
const elapsedMs=Math.round(performance.now()-start),u=process.cpuUsage(cpu);
const summary={...m,registeredPairs:Object.keys(pairs).length,registeredVariants:Object.keys(variants).length,registeredOrigins:new Set(Object.values(pairs).map(p=>p.origin)).size,registeredBranches:new Set(Object.values(pairs).map(p=>p.branch)).size,registeredWitnesses:Object.keys(witnesses).length,rootPrefixes:Object.keys(roots).length,newOrigins:[...new Set(Object.values(pairs).map(p=>p.origin))].filter(p=>!priorOrigins.has(p)).length,elapsedMs,cpuMs:Math.round((u.user+u.system)/1000),peakRssBytes:process.resourceUsage().maxRSS*1024,actualGameCertified:0};
const result={schemaVersion:1,kind:"POPULATION_EVENT_BIRTH_INSERTION",fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceRootSha256:sha(fs.readFileSync(rootFile)),roots,pairs,variants,witnesses,attempts,summary,scope:"Conditional event birth at sampled earliest/latest feasible insertion slots in actual chronological research roots, or explicit late research extension. Geography, RNG and full event co-rewards not modeled; no actual game certification or impossibility proof."};
fs.writeFileSync(arg("out","population-event-birth.json.gz"),zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));console.log(JSON.stringify(summary));
