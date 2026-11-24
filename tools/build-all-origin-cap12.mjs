// Whole-origin cap cohort; reuses the existing chronological growth evaluator.
// Archive histories are conditional replay evidence, never proof of joint RNG,
// promotion, medals, resource procurement, or exhaustive optimality.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {decodeOriginReport} from "./origin-report-codec.mjs";
import {attachAllOriginCap} from "./branch-soldier-origin-cap.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const base=arg("base",execFileSync("git",["rev-parse","origin/main"],{encoding:"utf8"}).trim());
const get=p=>execFileSync("git",["show",base+":"+p],{maxBuffer:256*1024*1024});
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const stable=x=>sha(JSON.stringify(x));
const modern=JSON.parse(get("public/data/soldiers-modern-index.json"));
const archiveBytes=get("public/data/soldier-origin-candidates.json"),report=decodeOriginReport(archiveBytes.toString("utf8"));
const db=JSON.parse(gunzipSync(get("public/data/branch-soldier-results.json.gz")));
const stats=modern.statKeys, vec=o=>stats.map(k=>o[k]);
if(stats.length!==12||JSON.stringify(stats)!==JSON.stringify(db.stats)||modern.meta.source.metadataSha256!==db.sourceMetadataSha256||report.records.length!==72)throw Error("Origin/source identity mismatch");
if(JSON.stringify(report.sourceHashes)!==JSON.stringify(modern.meta.source.rules))throw Error("Origin archive rules differ");
const root="experiments/endgame-current-save";
const out=path.join(root,"12-all-origin-cap12.json");
const engineFiles=["tools/damsel-madgal-cap-growth-chronology-core.mjs","public/soldiers/modern/stat-envelope.js","public/soldiers/modern/growth-envelope.js","public/soldiers/modern/eligibility.js","public/soldiers/modern/research-training-locks.js"];
const engineSourceHashes=Object.fromEntries(engineFiles.map(p=>[p,sha(get(p))]));
const implementation=stable(["chronology-v2-pinned-remote",engineSourceHashes]);
const engineTmp=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-origin-engine-"));
let evaluateCapGrowthChronologies;
try{
 fs.writeFileSync(path.join(engineTmp,"package.json"),'{"type":"module"}');
 for(const p of engineFiles){const f=path.join(engineTmp,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,get(p));}
 ({evaluateCapGrowthChronologies}=await import(pathToFileURL(path.join(engineTmp,engineFiles[0])).href));
}finally{fs.rmSync(engineTmp,{recursive:true,force:true});}
const fingerprint=stable([db.sourceMetadataSha256,implementation]);
const previous=fs.existsSync(out)?JSON.parse(fs.readFileSync(out,"utf8")):null;
const cache=previous?.fingerprint===fingerprint?previous.models:{};
const ruleMap=new Map(modern.transformations.map(t=>[t.id,t]));
const bodyMap=new Map(modern.soldiers.map(t=>[t.id,t]));
const byOrigin=new Map(), jobs=[];
const archiveCandidates=new Set(),archiveEvidence={};
for(const r of report.records){
 const p=modern.profiles.find(p=>p.id===r.profileId);if(!p)throw Error("Unknown source "+r.profileId);
 const own=new Map();
 const valid=r.candidates.filter(c=>c.status==="PROVISIONAL_CONDITIONAL"&&c.researchSequenceComplete===true&&c.certifiedMaximum===false&&c.campaignContext?.kind==="compatible");
 for(const c of valid){
  if(archiveCandidates.has(c.id)||c.profileId!==p.id||!Array.isArray(c.steps)||!Array.isArray(c.transforms))throw Error("Invalid archived evidence "+c.id);
  archiveCandidates.add(c.id);
  if(JSON.stringify(c.steps.filter(s=>s.type==="transform"&&s.soldier==="origin").map(s=>s.transform))!==JSON.stringify(c.transforms))throw Error("Transform sequence mismatch "+c.id);
  const birth=c.steps.findIndex(s=>s.type==="recruit"&&s.profile===p.id&&s.soldier==="origin");
  if(birth<0)throw Error("No recruit evidence "+c.id);
  archiveEvidence[c.id]={profileId:p.id,researchCount:c.researchCount,birthActionEnd:birth+1,branchChoices:(c.branchChoices||[]).map(x=>({id:x.id,at:x.at,excludes:(x.excludes||[]).filter(y=>y.closedAtEnd).map(y=>y.id)})),allowedDifficulties:c.campaignContext?.allowedDifficulties||[],actionSHA256:stable(c.steps)};
  const order=c.transforms;
  const add=(order,finalBody,scope)=>{
   const id="OC12:"+stable([p.id,order]).slice(0,24);
   let j=own.get(id);
   if(!j){j={id,profileId:p.id,order,finalBody,candidates:[]};own.set(id,j);}
   if(j.finalBody!==finalBody)throw Error("Divergent body for same source/action order");
   j.candidates.push({id:c.id,scope,actionEnd:scope==="birth-prefix"?birth+1:c.steps.length});
  };
  add(order,c.finalSoldierType,"full-route");
  if(order.length)add([],p.soldierType,"birth-prefix");
 }
 byOrigin.set(p.id,{profile:p,valid,own:[...own.values()].sort((a,b)=>a.order.length-b.order.length||a.id.localeCompare(b.id)),attemptCount:r.attempts?.length??0,unresolved:r.unresolved??null});
}
if(archiveCandidates.size!==report.summary.compatibleWitnesses)throw Error("Archived compatible path count mismatch "+archiveCandidates.size);
const originGroups=[...byOrigin.values()];
for(let i=0;;i++){
 let any=false;for(const r of originGroups)if(r.own[i]){any=true;jobs.push(r.own[i]);}if(!any)break;
}
const started=Date.now(),seconds=Number(arg("seconds","35")),limit=Number(arg("limit","100000")),models={},unresolved=[];
let computed=0,reused=0,spent=0;
const fail=(j,error)=>({id:j.id,profileId:j.profileId,order:j.order,error:String(error.message||error)});
for(const j of jobs){
 const old=cache[j.id];
 if(old&&old.profileId===j.profileId&&JSON.stringify(old.order)===JSON.stringify(j.order)&&old.finalBody===j.finalBody){models[j.id]={...old,candidates:j.candidates};reused++;continue;}
 if(computed>=limit||Date.now()-started>seconds*1000)continue;
 try{
  const m=evaluateCapGrowthChronologies(modern,j.profileId,j.order,{maxTransformations:12,deduplicateEnvelopes:true,correlatedPercent:true,tightenStatGates:true});
  if(m.finalBody!==j.finalBody)throw Error("Final body differs from archived route");
  const f=m.frontiers.twelve.map(x=>({vector:vec(x.highEffective),raw:vec(x.rawUpper),bonus:vec(x.permanentBonus),schedule:x.schedule,conditionalGateCrossings:x.conditionalGateCrossings}));
  if(!f.length||f.some(x=>[x.vector,x.raw,x.bonus].some(v=>v.length!==12||!v.every(Number.isSafeInteger))))throw Error("Incomplete twelve-stat vector");
  const cost=j.order.map(id=>ruleMap.get(id)?.cost);
  const fees=cost.every(Number.isFinite)?cost.reduce((n,v)=>n+Math.max(0,v),0):null;
  models[j.id]={...j,frontier:f,rawCombatCaps:vec(m.finalBodyRawCombatCaps),trainingCaps:vec(m.finalBodyPhysicalTrainingCaps),creationMax:vec(m.finalBodyCreationMax),birthMin:vec(m.sourceBirthMin),birthMax:vec(m.sourceBirthMax),bonusIds:m.retainedBonusIds,independentMaxima:stats.map(k=>m.perStatOptimisticUpper[k].relaxedUpper),directFees:fees,schedules:m.totals.combinatorialGrowthSchedules,actualGameCertified:false};
  computed++;spent+=m.totals.compressedTransitions||0;
 }catch(error){unresolved.push(fail(j,error));}
}
const origins=originGroups.map(({profile:p,valid,own,attemptCount,unresolved:gap})=>{
 const b=bodyMap.get(p.soldierType);
 return {profileId:p.id,body:p.soldierType,name:p.sourceKoName,soldierName:p.soldierKoName,kind:p.sourceType,birthMin:vec(p.currentStatsBeforeTraits.min),birthMax:vec(p.currentStatsBeforeTraits.max),birthInitialMin:vec(p.initialStatsBeforeTraits.min),birthInitialMax:vec(p.initialStatsBeforeTraits.max),bodyCreationMin:vec(b.minStats),bodyCreationMax:vec(b.maxStats),combatCaps:vec(b.statCaps),trainingCaps:vec(b.trainingStatCaps),birthBonus:vec(p.traitStats),birthBonusIds:p.traitNames||[],requires:p.requires||[],requiresBaseFunc:p.requiresBaseFunc||[],requiredItems:p.acquisitionRequiredItems||{},archivePaths:valid.length,archiveDepth:Math.max(0,...valid.map(c=>c.transforms.length)),uniqueOrders:own.length,modelIds:own.filter(j=>models[j.id]).map(j=>j.id),unresolvedModelIds:own.filter(j=>!models[j.id]).map(j=>j.id),legacyUnresolvedAttempts:attemptCount,archiveGap:gap,actualGameCertified:false};
});
const archiveSHA256=sha(archiveBytes);
const elapsed=(Date.now()-started)/1000;
const lastCalculation=computed?{models:computed,seconds:elapsed,calculatedAt:new Date().toISOString()}:previous?.lastCalculation??(previous?.summary?.computed?{models:previous.summary.computed,seconds:previous.summary.seconds,calculatedAt:previous.generatedAt}:null);
const result={schemaVersion:1,kind:"ALL_ORIGIN_CAP12",fingerprint,engineSourceHashes,sourceMetadataSha256:db.sourceMetadataSha256,archiveSHA256,archiveSourceHash:report.sourceHash,baseCommit:base,generatedAt:new Date().toISOString(),stats,origins,models,unresolved,lastCalculation,archiveEvidence,
 summary:{registeredOrigins:origins.length,researchOrigins:origins.filter(r=>r.archivePaths>0).length,modeledOrigins:origins.filter(r=>r.modelIds.length>0).length,archivePaths:archiveCandidates.size,uniqueOrders:jobs.length,completedModels:Object.keys(models).length,pendingModels:jobs.length-Object.keys(models).length,modeledFullRoutes:new Set(Object.values(models).flatMap(m=>m.candidates.filter(c=>c.scope==="full-route").map(c=>c.id))).size,computed,reused,attemptedModelErrors:unresolved.length,seconds:(Date.now()-started)/1000,compressedTransitions:spent,actualGameCertified:0,canonicalResearchPairsCertified:0}};
if(result.summary.modeledOrigins!==72)throw Error("Baseline coverage incomplete");
const content=JSON.stringify(result),tmp=out+"."+process.pid+".tmp";
fs.writeFileSync(tmp,content);fs.renameSync(tmp,out);
attachAllOriginCap(db,result);
const output=arg("output","experiments/endgame-current-save/12-all-origin-shared-registry.json.gz");
const registryBytes=Buffer.from(JSON.stringify(db));
fs.writeFileSync(output,output.endsWith(".gz")?gzipSync(registryBytes,{level:6}):registryBytes);
console.log(JSON.stringify({summary:result.summary,shared:db.summary.originCap12,unresolved:unresolved.slice(0,5),output},null,2));
