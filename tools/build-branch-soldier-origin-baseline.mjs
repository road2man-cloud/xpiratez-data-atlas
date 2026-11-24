// Population-wide baseline in the existing shared registry. Reuse signed birth
// routes; never remove a source witness, or treat a bounded miss as impossible.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {decodeOriginReport} from "./origin-report-codec.mjs";
import {projectCandidateStats} from "../public/soldiers/modern/score-12.js";
import {projectCandidateGrowthLimit} from "../public/soldiers/modern/score-growth-12.js";
import {initialState,applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {summarizeRouteResources} from "../public/branch-soldier-resources.js";
const read=f=>JSON.parse(fs.readFileSync("public/data/"+f));
const name="public/data/branch-soldier-results.json.gz",db=JSON.parse(zlib.gunzipSync(fs.readFileSync(name)));
const data=read("soldiers-modern-index.json"),source=fs.readFileSync("public/data/soldier-origin-candidates.json"),report=decodeOriginReport(source);
const sha=x=>createHash("sha256").update(x).digest("hex");
if(db.sourceMetadataSha256!==data.meta.source.metadataSha256||report.records.length!==72||new Set(report.records.map(r=>r.profileId)).size!==72)throw Error("Origin source mismatch");
const stats=db.stats,vec=o=>stats.map(k=>o[k]),total=v=>v.reduce((a,b)=>a+b,0);
const bodies=new Map(data.soldiers.map(x=>[x.id,x])),rules=new Map(data.transformations.map(x=>[x.id,x]));
const branches=db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount>0);
const branchRoots=branches.map(b=>({id:b.id,roots:[...b.captain,...Object.values(b.choices).filter(Boolean)],neutral:!b.choices.cause}));
function matchingRoots(c){
 const observed=new Set([...c.branchChoices.map(x=>x.id),...c.steps.filter(s=>["research","eventResearch","freeResearch","missionResearch","repeatResearch"].includes(s.type)).map(s=>s.research||s.id).filter(Boolean)]);
 return branchRoots.filter(b=>!b.neutral&&b.roots.every(id=>observed.has(id))).map(b=>b.id);
}
const primary=new Set(["reactions","firing","melee","throwing","psiSkill","psiStrength","bravery"]),secondary=new Set(["tu","health","strength","stamina"]);
if(data.growthRules.manaPrimary)primary.add("mana");
if(data.growthRules.manaSecondary)secondary.add("mana");
function fill(s){
 const body=bodies.get(s.soldierType),raw={...s.currentStats};
 for(const k of stats){
  if(!primary.has(k)&&!secondary.has(k))continue;
  const cap=body.statCaps?.[k],v=raw[k];
  if(!Number.isSafeInteger(cap)||cap<=v)continue;
  raw[k]=k==="bravery"?v+10*Math.floor((cap-v)/10):cap;
 }
 return {...s,currentStats:raw};
}
function replay(p,c,band,mask){
 let s={...initialState(data,p,{band}),exactStats:true,historyKnown:true};
 for(let i=0;i<c.transforms.length;i++){
  if(mask&(1<<i))s=fill(s);
  const r=rules.get(c.transforms[i]);
  if(!r||r.createsClone||r.producedItem)return {reason:"UNSUPPORTED_ACTION"};
  // The original chronological witness supplies this action's research and
  // material premises. This is a numerical replay, not a new campaign proof.
  const result=applyTransformation(r,s,data,{mode:"current",researched:r.requires||[],disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:{},statsKnown:true,medalsKnown:true});
  if(result.verdict.kind!=="eligible")return {reason:"NUMERIC_OR_ACTION_GATE",detail:[...result.verdict.blockers,...result.verdict.conditions].slice(0,4)};
  if(!result.state.exactStats)return {reason:"RANDOM_OR_UNKNOWN_TRANSFORM"};
  s=result.state;
 }
 s=fill(s);
 if(s.soldierType!==c.finalSoldierType)return {reason:"BODY_MISMATCH"};
 const raw=vec(s.currentStats),added=bonusStats(s,data),bonus=stats.map(k=>added[k]||0);
 const vector=raw.map((v,i)=>stats[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(stats[i]==="health"?1:0,v+bonus[i]));
 if(!raw.every(Number.isSafeInteger)||!vector.every(Number.isSafeInteger))return {reason:"NONINTEGER"};
 return {body:s.soldierType,raw,bonus,vector,total:total(vector),band,mask,bonusIds:[...s.bonusIds].sort()};
}
const numericKey=m=>JSON.stringify([m.body,m.raw,m.bonus,m.vector]);
const modelKey=(m,c)=>JSON.stringify([numericKey(m),m.bonusIds,c.transforms]);
const dominates=(a,b)=>a.vector.every((v,i)=>v>=b.vector[i])&&a.fees<=b.fees&&(a.fees<b.fees||a.vector.some((v,i)=>v>b.vector[i]));
function frontier(ms,sameBody=true){return ms.filter((m,i)=>!ms.some((n,j)=>i!==j&&(!sameBody||n.body===m.body)&&dominates(n,m)));}
const roles={gun:["firing","reactions","tu"],melee:["melee","strength","tu"],voodoo:["psiSkill","psiStrength","mana"],survival:["health","stamina","bravery"],mobility:["tu","stamina"]};
function roleBest(ms,keys){return [...ms].sort((a,b)=>{for(const k of keys){const i=stats.indexOf(k),d=b.vector[i]-a.vector[i];if(d)return d;}return a.fees-b.fees||b.total-a.total;})[0]?.id??null;}
function best(ms,score){return ms.reduce((a,b)=>!a||score(b)>score(a)||score(b)===score(a)&&b.fees<a.fees?b:a,null);}
const rows=[],branchLinks={},allModels=[],start=Date.now();
let routes=0,attempts=0,success=0,unique=0,unresolved=0,matchedRoutes=0;
for(const record of report.records){
 const p=data.profiles.find(x=>x.id===record.profileId);if(!p)throw Error("Unknown birth "+record.profileId);
 const body=bodies.get(p.soldierType),models=new Map(),refs=[],failures={},cache=new Map();
 const bump=k=>failures[k]=(failures[k]||0)+1;
 for(const c of record.candidates){
  if(c.campaignContext?.kind!=="compatible")continue;
  routes++;
  const old=projectCandidateStats(record,c,data),upper=projectCandidateGrowthLimit(record,c,data);
  const key=JSON.stringify(c.transforms);
  if(!cache.has(key)){
   const result=[];
   // All binary full-cap / no-growth placements for the existing signed
   // transformation order. This does not enumerate alternative rule orders.
   if(c.transforms.length>12)throw Error("Explicit schedule budget exceeded: "+c.id);
   const masks=Array.from({length:2**c.transforms.length},(_,i)=>i);
   for(const band of ["min","max"])for(const mask of masks){
    attempts++;const m=replay(p,c,band,mask);
    if(m.reason){bump(m.reason);continue;}
    success++;result.push(m);
   }
   cache.set(key,result);
  }
  const r=summarizeRouteResources({steps:c.transforms.map(id=>({id,count:1}))},db.ruleDetails);
  const branchIds=matchingRoots(c);
  if(branchIds.length)matchedRoutes++;
  const modelIds=[],placements=[];
  for(const m of cache.get(key)){
   if(!r.complete.cash)continue;
   const mk=modelKey(m,c)+"|"+r.grossFees;
   let stored=models.get(mk);
   if(!stored){stored={...m,id:models.size,fees:r.grossFees,route:c.id,depth:c.transforms.length,support:0};models.set(mk,stored);}
   if(!modelIds.includes(stored.id)){modelIds.push(stored.id);stored.support++;}placements.push([stored.id,m.band,m.mask]);
  }
  if(!modelIds.length)unresolved++;
  refs.push({id:c.id,body:c.finalSoldierType,depth:c.transforms.length,order:c.transforms,raw:vec(old.raw),bonus:vec(old.bonus),vector:vec(old.stats),upper:upper.kind==="conditional-upper-envelope"?vec(upper.stats):null,modelIds,placements,branchIds,fees:r.complete.cash?r.grossFees:null,recovery:r.complete.recovery?r.recoveryDays:null,transfer:r.complete.transfer?r.transferHours:null,items:r.items,medals:r.medals,facilities:r.facilities,rankRequirements:r.rankRequirements,research:r.research,assumptions:c.assumptions.length});
  for(const branchId of branchIds){
   const b=branchLinks[branchId]??={};(b[p.id]??=[]).push(c.id);
  }
 }
 const ms=[...models.values()],pf=frontier(ms),b=best(ms,m=>m.total),same=best(ms.filter(m=>m.body===p.soldierType),m=>m.total),converted=best(ms.filter(m=>m.body!==p.soldierType),m=>m.total);
 unique+=ms.length;
 const row={profileId:p.id,name:record.name,soldierType:p.soldierType,soldierName:p.soldierKoName,birth:{min:p.initialStatsBeforeTraits.min,max:p.initialStatsBeforeTraits.max,current:p.currentStatsBeforeTraits,traits:p.traitNames||[],traitCounts:p.traitCounts||{},previousTransformations:p.previousTransformations||{},statCaps:body.statCaps,trainingStatCaps:body.trainingStatCaps,requires:p.requires||[],allowedTransformations:data.transformations.filter(t=>t.allowedSoldierTypes.includes(p.soldierType)).map(t=>t.id)},routeCount:refs.length,depth:Math.max(0,...refs.map(x=>x.depth)),modelCount:ms.length,numericModelCount:new Set(ms.map(numericKey)).size,models:ms,refs,frontier:pf.map(x=>x.id),best:b?.id??null,bestSame:same?.id??null,bestConverted:converted?.id??null,roleBest:Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,roleBest(ms,v)])),cheapest:best(ms,m=>-m.fees)?.id??null,maxima:stats.map((_,i)=>best(ms,m=>m.vector[i])?.id??null),failures,unresolvedRoutes:refs.filter(x=>!x.modelIds.length).length,branchCount:new Set(refs.flatMap(x=>x.branchIds)).size};
 rows.push(row);for(const m of pf)allModels.push({...m,profileId:p.id});
 console.log(p.id,refs.length,ms.length,pf.length,b?.total??"unresolved");
}
const global=frontier(allModels).map(m=>({profileId:m.profileId,modelId:m.id}));
const crossBodyDisplayFrontier=frontier(allModels,false).map(m=>({profileId:m.profileId,modelId:m.id}));
const pairs=Object.values(branchLinks).reduce((n,x)=>n+Object.keys(x).length,0);
db.originBaseline={schemaVersion:1,kind:"ALL_ORIGINS_CONDITIONAL_CAP_TARGET",sourceSha256:sha(source.toString().replaceAll("\r\n","\n")),sourceReportHash:report.sourceHash,sourceMetadataSha256:db.sourceMetadataSha256,generatedAt:new Date().toISOString(),stats,bodyNames:Object.fromEntries(data.soldiers.map(s=>[s.id,s.koName||s.id])),scope:{growth:"conditional deterministic min/max birth, post-training cap target and all binary pre-action placements within recorded orders; no XP, rank, medal, supply or campaign certification",branch:"all non-neutral root choices explicitly observed in archived witness; not joint replay with the shared branch history",pareto:"within final body, twelve effective stats and positive direct fees; display only, no search-state pruning",notGlobalOptimum:true},rows,branchLinks,global,crossBodyDisplayFrontier,summary:{origins:rows.length,modeledOrigins:rows.filter(x=>x.modelCount>0).length,originalRoutes:routes,attempts,successfulSchedules:success,distinctModels:unique,numericModels:rows.reduce((n,x)=>n+x.numericModelCount,0),originFrontier:rows.reduce((n,x)=>n+x.frontier.length,0),globalFrontier:global.length,crossBodyDisplayFrontier:crossBodyDisplayFrontier.length,unresolvedRoutes:unresolved,rootMatchedRoutes:matchedRoutes,rootMatchedBranches:Object.keys(branchLinks).length,rootMatchedOriginBranchPairs:pairs,eligibleSharedBranches:branches.length,actualGameCertified:0,elapsedMs:Date.now()-start}};
db.summary.originBaseline={...db.originBaseline.summary,generatedAt:db.originBaseline.generatedAt};
db.sources.ORIGINBASELINE12={kind:db.originBaseline.kind,file:"soldier-origin-candidates.json",sha256:db.originBaseline.sourceSha256};
const frontierFile="public/data/soldier-origin-cap-frontier.json";
if(!db.originCap12&&fs.existsSync(frontierFile)){
 const bytes=fs.readFileSync(frontierFile),advanced=JSON.parse(bytes);
 if(advanced.kind!=="ALL_ORIGIN_GROWTH_SCHEDULE_FRONTIERS"||advanced.sourceMetadataSha256!==db.sourceMetadataSha256||advanced.originArchiveSha256!==db.originBaseline.sourceSha256)throw Error("Advanced origin frontier source mismatch");
 db.originScheduleFrontier=advanced;
 db.summary.originScheduleFrontier=advanced.summary;
 db.sources.ORIGINSCHEDULE12={kind:advanced.kind,file:"soldier-origin-cap-frontier.json",sha256:sha(bytes.toString().replaceAll("\r\n","\n"))};
}
fs.writeFileSync(name,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
console.log(JSON.stringify(db.originBaseline.summary));
