// Append all-origin evidence to the same published registry. Existing
// branch, resource and deep-cohort evidence is retained untouched.
import crypto from "node:crypto";
const hash=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0,24);
const total=v=>v.reduce((a,b)=>a+b,0);
const dominance=(a,b)=>a.every((v,i)=>v>=b[i])&&a.some((v,i)=>v>b[i]);
export function attachAllOriginCap(db,artifact){
 if(artifact.sourceMetadataSha256!==db.sourceMetadataSha256||JSON.stringify(artifact.stats)!==JSON.stringify(db.stats)||artifact.origins.length!==72||artifact.summary.actualGameCertified!==0)throw Error("All-origin source mismatch");
 const prior=db.originCap12;
 if(prior&&Object.keys(prior.models).some(id=>!artifact.models[id]))throw Error("Refusing to lose previous all-origin models");
 const witnesses=db.witnesses,profiles=db.profiles,stats=db.stats,models={},records={};
 const compare=(a,b)=>total(witnesses[b].vector)-total(witnesses[a].vector)||a.localeCompare(b);
 const maxBy=(ids,fn)=>ids.reduce((a,b)=>!a||fn(witnesses[b])>fn(witnesses[a])?b:a,null);
 const byVector=ids=>{
  const ties={};
  for(const id of ids){const key=witnesses[id].vector.join(",");(ties[key]??=[]).push(id);}
  const reps=Object.values(ties).map(a=>a.sort(compare)[0]).sort(compare),frontier=[];
  for(const id of reps)if(!frontier.some(other=>dominance(witnesses[other].vector,witnesses[id].vector)))frontier.push(id);
  return {frontier,frontierTies:Object.fromEntries(frontier.map(id=>[id,ties[witnesses[id].vector.join(",")]]))};
 };
 function group(ids){
  if(!ids.length)return null;
  const {frontier,frontierTies}=byVector(ids);
  const score=k=>w=>k.reduce((n,key)=>n+w.vector[stats.indexOf(key)],0);
  const objectives={total: maxBy(ids,w=>total(w.vector)),
   firing:maxBy(ids,score(["tu","firing","reactions"])),melee:maxBy(ids,score(["tu","melee","strength","health"])),psi:maxBy(ids,score(["psiStrength","psiSkill","mana"]))};
  const feeCandidates=ids.filter(id=>Number.isFinite(witnesses[id].directFees)).sort((a,b)=>witnesses[a].directFees-witnesses[b].directFees||compare(a,b));
  const feeTotalFrontier=[];let max=-Infinity;
  for(const id of feeCandidates){const s=total(witnesses[id].vector);if(s>max){feeTotalFrontier.push(id);max=s;}}
  return {source:"ORIGINCAP12",count:frontier.length,frontier,frontierTies,best:stats.map((_,i)=>maxBy(ids,w=>w.vector[i])),objectives,feeTotalFrontier,
   allWitnessCount:ids.length,actualGameCertified:false};
 }
 for(const [id,m] of Object.entries(artifact.models)){
  const evidence=m.candidates.find(c=>c.scope==="full-route")||m.candidates[0];
  if(!evidence||!m.frontier.length)throw Error("Missing archive evidence "+id);
  const ids=[];
  for(const f of m.frontier){
   if(f.vector.length!==12||f.raw.length!==12||f.bonus.length!==12||f.vector.some((v,i)=>v!==Math.max(stats[i]==="health"?1:0,f.raw[i]+f.bonus[i])))throw Error("Invalid vector "+id);
   const ref="ORIGINCAP12:"+hash([id,f.schedule,f.vector]);
   const w={source:"ORIGINCAP12",originProfile:m.profileId,body:m.finalBody,vector:f.vector,raw:f.raw,bonus:f.bonus,steps:m.order.map(id=>({id,count:1})),placement:f.schedule.join(" / "),growthSchedule:f.schedule,conditionalGateCrossings:f.conditionalGateCrossings,rawCombatCaps:m.rawCombatCaps,trainingCaps:m.trainingCaps,creationMax:m.creationMax,bonusIds:m.bonusIds,directFees:m.directFees,reference:id,archiveCandidateId:evidence.id,archiveScope:evidence.scope,archiveActionEnd:evidence.actionEnd,branchIds:[],actualGameCertified:false,simultaneousGrowthCertified:false,medalBonusesExcluded:true};
   if(witnesses[ref]&&JSON.stringify(witnesses[ref].vector)!==JSON.stringify(w.vector))throw Error("Existing witness changed "+ref);
   witnesses[ref]=w;ids.push(ref);
  }
  const {frontier,...metadata}=m;models[id]={...metadata,witnessIds:ids};
 }
 for(const r of artifact.origins){
  const own=r.modelIds.flatMap(id=>models[id].witnessIds);
  const same=own.filter(id=>witnesses[id].body===r.body);
  const byBody={};
  for(const id of own)(byBody[witnesses[id].body]??=[]).push(id);
  const bodyProfiles={};
  for(const [body,ids] of Object.entries(byBody)){
   const pid="origincap:"+r.profileId+":"+body;profiles[pid]=group(ids);bodyProfiles[body]=pid;
  }
  const lineageId="origincap:"+r.profileId+":lineage";profiles[lineageId]=group(own);
  records[r.profileId]={...r,bodyProfiles,lineageProfile:lineageId,sameBodyProfile:bodyProfiles[r.body]??null,
   modeledDepth:Math.max(0,...r.modelIds.map(id=>models[id].order.length)),
   fullRouteCount:new Set(r.modelIds.flatMap(id=>models[id].candidates.filter(c=>c.scope==="full-route").map(c=>c.id))).size,
   sameBodyWitnesses:same.length,registeredWitnesses:own.length};
 }
 const ids=Object.values(models).flatMap(m=>m.witnessIds);
 const globalId="origincap:global:lineage";profiles[globalId]=group(ids);
 const globalSameBody="origincap:global:same-body";profiles[globalSameBody]=group(ids.filter(id=>records[witnesses[id].originProfile].body===witnesses[id].body));
 const bodyProfiles={};
 for(const body of new Set(ids.map(id=>witnesses[id].body))){
  const pid="origincap:global:"+body;profiles[pid]=group(ids.filter(id=>witnesses[id].body===body));bodyProfiles[body]=pid;
 }
 const summary={...artifact.summary,frontierVectors:profiles[globalId].frontier.length,
  sameBodyModeledOrigins:Object.values(records).filter(r=>r.sameBodyProfile).length,sameBodyFrontierVectors:profiles[globalSameBody].frontier.length,lastCalculation:artifact.lastCalculation??null,
  finalBodies:Object.keys(bodyProfiles).length,registeredWitnesses:ids.length,generatedAt:artifact.generatedAt,archiveSHA256:artifact.archiveSHA256};
 db.originCap12={schemaVersion:1,engineSourceHashes:artifact.engineSourceHashes,sourceMetadataSha256:artifact.sourceMetadataSha256,archiveSHA256:artifact.archiveSHA256,archiveSourceHash:artifact.archiveSourceHash,baseCommit:artifact.baseCommit,generatedAt:artifact.generatedAt,summary,records,models,archiveEvidence:artifact.archiveEvidence,globalProfile:globalId,globalSameBody,bodyProfiles,unresolved:artifact.unresolved,
  policy:{scope:"Existing compatible origin archive routes and recruitment prefixes; canonical research parent replay not yet connected.",growth:"Chronological relaxed raw-stat envelopes, fixed route history, combat/physical opportunities before and after transformations; joint RNG and actual medal awards unproven.",pareto:"Terminal numerical comparison only; no history or candidate is permanently removed.",fees:"Direct positive transformation fees only. Full campaign cost and resource feasibility excluded."}};
 db.summary.originCap12=summary;
 db.sources.ORIGINCAP12={file:"public/data/soldier-origin-candidates.json",sha256:artifact.archiveSHA256,sourceMetadataSha256:artifact.sourceMetadataSha256,source:"ALL_ORIGIN_CAP12",models:summary.completedModels};
 db.policies.ORIGINCAP12="72개 출생처의 기존 호환 연구·시술 증거를 재사용한 12능력치 시간순 조건부 성장 상계. 공통 부모 미연결, 실제 동시 달성·훈장·전역 최적성 미인증.";
 db.summary.registeredWitnesses=Object.keys(witnesses).length;
 db.summary.frontierProfiles=Object.values(profiles).filter(p=>p.frontier).length;
 db.summary.frontierReferences=Object.values(profiles).reduce((n,p)=>n+(p.frontier?.length||0),0);
 db.summary.frontierWitnesses=new Set(Object.values(profiles).flatMap(p=>p.frontier||[])).size;
 return summary;
}
