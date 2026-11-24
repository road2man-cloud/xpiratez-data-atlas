// All-source growth schedule frontier. Read the published signed origin archive,
// not an uncommitted worker's experimental source. Bounded selection, never a proof.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {evaluateCapGrowthChronologies} from './damsel-madgal-cap-growth-chronology-core.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';
const args=process.argv.slice(2),arg=(k,d)=>args.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const revision=arg('revision','origin/main'),limit=Number(arg('per-origin','3'));
if(!Number.isSafeInteger(limit)||limit<1||limit>30)throw Error('Invalid candidate budget');
const show=p=>execFileSync('git',['show',revision+':'+p],{maxBuffer:256*1024*1024});
const sha=x=>createHash('sha256').update(x).digest('hex');
const bytes=show('public/data/soldier-origin-candidates.json'),report=decodeOriginReport(bytes);
const data=JSON.parse(show('public/data/soldiers-modern-index.json'));
if(report.sourceVersion!=='v.o2'||report.records.length!==72||
 JSON.stringify(report.sourceHashes)!==JSON.stringify(data.meta.source.rules))throw Error('Source mismatch');
const stats=[...STAT_KEYS],vec=x=>stats.map(k=>x[k]),sum=v=>v.reduce((a,b)=>a+b,0);
const dominates=(a,b)=>a.every((v,i)=>v>=b[i])&&a.some((v,i)=>v>b[i]);
const records=[];let evaluated=0,failed=0,represented=0,frontierCount=0;
for(const r of report.records){
 const profile=data.profiles.find(p=>p.id===r.profileId);if(!profile)throw Error('Unknown origin '+r.profileId);
 const seen=new Set(),pool=[];
 for(const c of r.candidates){
  const order=c.steps.filter(s=>s.type==='transform').map(s=>s.transform);
  if(c.profileId!==r.profileId||JSON.stringify(order)!==JSON.stringify(c.transforms))throw Error('Witness identity mismatch');
  const key=JSON.stringify([c.finalSoldierType,order]);if(seen.has(key))continue;seen.add(key);
  const g=projectCandidateGrowthLimit(r,c,data);if(g.kind!=='conditional-upper-envelope')continue;
  pool.push({c,order,g,vector:vec(g.stats)});
 }
 pool.sort((a,b)=>sum(b.vector)-sum(a.vector)||a.order.length-b.order.length||a.c.id.localeCompare(b.c.id));
 const picks=[],used=new Set();
 const pick=x=>{if(x&&!used.has(x.c.id)&&picks.length<limit){picks.push(x);used.add(x.c.id);}};
 // Preserve a distinct final-body representative before adding another similar route.
 const bodyBest=new Map();for(const x of pool)if(!bodyBest.has(x.c.finalSoldierType))bodyBest.set(x.c.finalSoldierType,x);
 for(const x of bodyBest.values())pick(x);
 pick(pool.find(x=>x.order.length===0));
 while(picks.length<limit){
  const left=pool.filter(x=>!used.has(x.c.id));if(!left.length)break;
  // Prioritize new per-coordinate peaks among the legacy projection candidates,
  // not initial stats or another permutation of an already selected vector.
  const top=stats.map((_,i)=>Math.max(...picks.map(x=>x.vector[i])));
  left.sort((a,b)=>sum(b.vector.map((n,i)=>Math.max(0,n-top[i])))-sum(a.vector.map((n,i)=>Math.max(0,n-top[i])))||sum(b.vector)-sum(a.vector));
  pick(left[0]);
 }
 const models=[],errors=[],rows=[];
 for(const x of picks){
  try{
   const m=evaluateCapGrowthChronologies(data,r.profileId,x.order,{maxTransformations:12,deduplicateEnvelopes:true,correlatedPercent:true,tightenStatGates:true});
   if(m.finalBody!==x.c.finalSoldierType)throw Error('Final body mismatch');
   models.push({candidateId:x.c.id,order:x.order,body:m.finalBody,branchChoices:x.c.branchChoices,sourceResearchCount:x.c.researchCount,rawCaps:vec(m.finalBodyRawCombatCaps),trainingCaps:vec(m.finalBodyPhysicalTrainingCaps),creationMax:vec(m.finalBodyCreationMax),schedules:m.totals.eligibleSchedulesAfterStatGate,distinct:m.totals.distinctTwelveStatHighVectors});
   evaluated++;represented+=m.totals.eligibleSchedulesAfterStatGate;
   for(const f of m.frontiers.twelve)rows.push({candidateId:x.c.id,body:m.finalBody,order:x.order,schedule:f.schedule,raw:vec(f.rawUpper),bonus:vec(f.permanentBonus),vector:vec(f.highEffective),gateCrossings:f.conditionalGateCrossings});
  }catch(e){failed++;errors.push({candidateId:x.c.id,reason:e.message});}
 }
 const groups={};
 for(const row of rows)(groups[row.body]??=[]).push(row);
 const bodies=Object.entries(groups).map(([body,group])=>{
  const ties=new Map();for(const row of group){const key=row.vector.join(',');if(!ties.has(key))ties.set(key,[]);ties.get(key).push(row);}
  const reps=[...ties.values()].map(a=>a[0]);
  const frontier=reps.filter(a=>!reps.some(b=>dominates(b.vector,a.vector))).map(a=>({...a,tieCandidateIds:[...new Set(ties.get(a.vector.join(',')).map(x=>x.candidateId))]}));
  frontierCount+=frontier.length;
  return {body,frontier,maxima:stats.map((_,i)=>frontier.reduce((best,x)=>x.vector[i]>best.vector[i]?x:best).vector[i])};
 });
 records.push({profileId:r.profileId,name:r.name,soldierName:r.soldierName,originBody:r.soldierType,sourceWitnesses:r.candidates.length,uniqueSourceOrders:seen.size,selected:picks.length,models,errors,bodies,unresolved:r.candidates.length?null:r.unresolved,actualGameCertified:false});
}
const labels=Object.fromEntries([...data.soldiers,...data.transformations].map(x=>[x.id,x.koName||x.id]));
const result={labels,schemaVersion:1,kind:'ALL_ORIGIN_GROWTH_SCHEDULE_FRONTIERS',sourceMetadataSha256:data.meta.source.metadataSha256,originArchiveSha256:sha(bytes),originArchiveSourceHash:report.sourceHash,sourceRevision:execFileSync('git',['rev-parse',revision],{encoding:'utf8'}).trim(),stats,scope:{perOrigin:limit,selection:'bounded existing signed witnesses; distinct bodies, birth and projected coordinate peaks',fullAcquisitionReplay:false,interleavedActualGrowthReplayed:false,globalOptimality:false},summary:{origins:records.length,originsWithModels:records.filter(r=>r.models.length).length,sourceWitnesses:report.summary.witnesses,evaluated,failed,represented,frontierCount,actualGameCertified:0},records};
fs.writeFileSync('public/data/soldier-origin-cap-frontier.json',JSON.stringify(result)+'\n');
console.log(JSON.stringify(result.summary));
