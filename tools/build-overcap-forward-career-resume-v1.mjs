// V151: replay/resume existing concrete bulk paths; interleave research and career stages.
// The V148 hero training rows are a separate regression/production cohort, not
// recovered legacy goals. No imported result is promoted to final certification.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createCareerReplay} from './atlas-overcap-forward-career-replay-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const priorPath=arg('prior','tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz');
const heroPath='tools/data/overcap-forward-late-recruit-training-v2-c6be53b2021458e53ac2.json.gz';
const prior=read(priorPath),hero=read(heroPath);
assert.equal(prior.schema,'ATLAS_OVERCAP_FORWARD_BULK_NORMALIZATION_V3');
const data=read('public/data/soldiers-modern-index.json');
data.forwardSupply=read('tools/data/overcap-forward-supply-catalog-v2.json');
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
assert.equal(data.meta.source.metadataSha256,prior.sourceMetadataSha256);
assert.equal(data.meta.source.metadataSha256,hero.sourceMetadataSha256);
const replay=createCareerReplay(data,{maxMonth:3});
const map=rows=>new Map(rows.map(r=>[r.id,r]));
const acqs=map(prior.acquisitions),groups=map(prior.groups),prefixes=new Map(prior.prefixes.map(p=>[p.nodeId,p]));
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const idsOf=actions=>actions.map(a=>a.research||a.id).filter(Boolean);
const reqWeight=new Map();
function relevance(req){
 const seed=JSON.stringify(req);if(reqWeight.has(seed))return reqWeight.get(seed);
 const weights=new Map(),queue=arr(req?.research).map(k=>[k,0]),rules=data.researchRules;
 const unlock=new Map();
 for(const [src,r] of Object.entries(rules))for(const k of arr(r.unlocks)){if(!unlock.has(k))unlock.set(k,[]);unlock.get(k).push(src);}
 for(let i=0;i<queue.length;i++){
  const [k,d]=queue[i],v=1000/4**d;if((weights.get(k)||0)>=v)continue;weights.set(k,v);if(d>=5)continue;
  const r=rules[k]||{},deps=[...arr(r.dependencies),...arr(r.requires),...arr(unlock.get(k))];
  for(const e of arr(data.eventResearchSources?.[k]))for(const s of arr(e.scripts))deps.push(...arr(s.researchPositive));
  for(const e of arr(data.missionResearchSources?.[k]))for(const s of arr(e.scripts))deps.push(...arr(s.researchPositive));
  const item=r.needItem?data.itemSupply?.[r.neededItem||k]:null;
  for(const g of arr(item?.researchGrants))deps.push(g.research);
  for(const g of arr(item?.eventGrants))for(const s of arr(g.scriptRoutes))deps.push(...arr(s.researchPositive));
  for(const g of arr(item?.manufacture))deps.push(...arr(g.requires));
  for(const x of new Set(deps))queue.push([x,d+1]);
 }
 reqWeight.set(seed,weights);return weights;
}
function score(o,s,req){
 const a=o.action,e=o.evidence||{},w=s.world,weights=relevance(req);
 if(a.type==='sourceResearchDelivery')return 10000;
 if(a.type==='freeResearch')return 10000+(weights.get(a.research)||0);
 const id=a.research||a.id,missing=replay.missing(s,req);
 let v=['research','eventResearch','missionResearch','repeatResearch'].includes(a.type)?weights.get(id)||0:0;
 if(a.type==='research'||a.type==='repeatResearch'){
  const r=data.researchRules[a.id]||{};
  v+=Math.max(0,...arr(r.getOneFree).filter(k=>!active(w,k)).map(k=>weights.get(k)||0))*0.8;
 }
 const needed=new Map(Object.keys(missing.items||{}).map(k=>[k,1000]));
 for(const [k,value] of weights){const r=data.researchRules[k];if(r?.needItem&&!active(w,k)&&!(w.items[r.neededItem||k]>0))needed.set(r.neededItem||k,Math.max(needed.get(r.neededItem||k)||0,value));}
 if(a.type==='sourceBuySample')v+=needed.get(a.id)||0;
 if(a.type==='sourceManufactureItem'||a.type==='sourceEventItems')v+=Math.max(0,...Object.keys(e.outputs||e.items||{}).map(k=>needed.get(k)||0));
 if(a.type==='sourceBuildFacility')v+=Math.max(0,...arr(e.provides).map(k=>missing.functions?.includes(k)?1000:0));
 return v;
}
const maxSteps=Number(arg('steps','8'));assert(Number.isSafeInteger(maxSteps)&&maxSteps>=0&&maxSteps<=40);
function progress(s,req,limit){
 const from=s.actions.length,seen=new Set([exactStateHash(s.world)]),blocked=[];
 for(let i=0;i<limit;i++){
  const m=replay.missing(s,req);
  if(replay.settled(s)&&!m.research.length&&!m.functions.length&&!Object.keys(m.items).length&&m.funds===0)break;
  const options=replay.options(s).map(o=>({o,v:score(o,s,req)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v||JSON.stringify(a.o.action).localeCompare(JSON.stringify(b.o.action)));
  let chosen=null;
  for(const {o} of options)try{
   const r=replay.research(s,o.action),h=exactStateHash(r.world);
   if(seen.has(h)||arr(req.research).some(k=>r.world.disabled.has(k)))continue;
   chosen=r;seen.add(h);break;
  }catch(e){if(blocked.length<10)blocked.push({action:o.action,reason:String(e.message)});}
  if(!chosen)break;s=chosen;
 }
 return {state:s,added:s.actions.length-from,blocked};
}
function receipt(s){return {root:s.root,difficulty:s.world.difficulty,actions:s.actions,trace:s.trace,stateHash:exactStateHash(s.world),balance:s.world.funds,income:s.income,procurement:s.procurement,careerSpend:s.careerSpend};}
const resumes=[],careers=[],heroRows=[],errors=[];
const replayCache=new Map();
for(const f of prior.frontiers){
 const a=acqs.get(f.acquisition),p=prefixes.get(f.nodeId);assert(a&&p&&p.stateHash===f.prefixStateHash);
 const difficulty=a.context?.difficulty;assert(Number.isInteger(difficulty));
 let s=null,at=0,error=null;
 const k=key([p.nodeId,difficulty]);
 try{
  if(!replayCache.has(k))replayCache.set(k,replay.replay(p.actions,difficulty));
  s=replayCache.get(k);
  for(const x of arr(f.suffix)){s=replay.research(s,x.action);at++;}
 }catch(e){error=String(e.message);}
 if(!s){resumes.push({acquisition:a.id,root:f.root,status:'PREFIX_REPLAY_BLOCKED',error,priorNode:f.nodeId,priorSuffixSteps:f.suffix.length,replayedSuffixSteps:at});continue;}
 const before=replay.missing(s,a.requirements),q=progress(s,a.requirements,maxSteps);s=q.state;
 let birth=null,birthError=null;
 try{birth=replay.career(s,a.birth);}catch(e){birthError=String(e.message);}
 resumes.push({acquisition:a.id,root:f.root,priorNode:f.nodeId,priorSuffixSteps:f.suffix.length,replayedSuffixSteps:at,priorSuffixError:error,newSteps:q.added,before,after:replay.missing(s,a.requirements),birthError,receipt:receipt(s),status:birth?'CONDITIONAL_RECRUITED':'OPEN_ACQUISITION',blocked:q.blocked,finalAdmission:false});
 if(!birth)continue;
 for(const gid of a.groupIds){
  const g=groups.get(gid);assert(g&&g.acquisition===a.id);
  let state=birth,applied=1,failure=null;
  for(const stage of g.stages.slice(1)){
   if(stage.requirements){const next=progress(state,stage.requirements,maxSteps);state=next.state;}
   try{state=replay.career(state,stage.action);applied++;}catch(e){failure={action:stage.action,reason:String(e.message),missing:replay.missing(state,stage.requirements)};break;}
  }
  careers.push({group:gid,goals:g.goalIds,applied,total:g.stages.length,failure,receipt:receipt(state),result:replay.finish(state),status:failure?'PARTIAL_CONDITIONAL_CAREER':'CONDITIONAL_CAREER_REPLAYED',finalAdmission:false});
 }
}
// Existing source-backed positive cohort: produce new, explicit-difficulty
// receipts with cash updated before every research/recruit/training action.
for(const row of hero.rows){
 let found=null;const failed=[];
 for(const difficulty of [2,1,0,3,4])try{
  const state=replay.replay(row.actions,difficulty),result=replay.finish(state);
  assert.deepEqual(result,row.after,'Training result drift');
  found={legacyHeroId:row.id,difficulty,receipt:receipt(state),result,goal:row.goal,status:'CONDITIONAL_TRAINING_REPLAYED',finalAdmission:false};break;
 }catch(e){failed.push({difficulty,reason:String(e.message)});}
 if(found)heroRows.push(found);else errors.push({id:row.id,failed});
}
const complete=careers.filter(c=>!c.failure);
const summary={legacyGoals:prior.goals.length,careerGroups:prior.groups.length,acquisitionGroups:prior.acquisitions.length,resumeTargets:prior.frontiers.length,resumed:resumes.filter(r=>r.receipt).length,fullPriorSuffixReplayed:resumes.filter(r=>r.receipt&&r.replayedSuffixSteps===r.priorSuffixSteps).length,replayedPriorSuffixSteps:resumes.reduce((n,r)=>n+r.replayedSuffixSteps,0),additionalForwardSteps:resumes.reduce((n,r)=>n+(r.newSteps||0),0),recruited:resumes.filter(r=>r.status==='CONDITIONAL_RECRUITED').length,legacyCareerGroupsApplied:careers.length,legacyCareerGroupsCompleted:complete.length,legacyGoalsConditionallyReplayed:new Set(complete.flatMap(c=>c.goals)).size,heroTrainingReceipts:heroRows.length,heroDistinctOutcomes:new Set(heroRows.map(r=>key(r.result))).size,heroErrors:errors.length,actualGameCertified:0,finalAdmission:0};
const result={schema:'ATLAS_OVERCAP_FORWARD_CAREER_RESUME_V1',scope:'Explicit difficulty and indexed cash, resumable exact chronological model. Existing hero cohort is separate from legacy career goals. Full economy, combat, time and RNG remain conditional.',priorPath,priorSha256:sha(fs.readFileSync(priorPath)),heroPath,heroSha256:sha(fs.readFileSync(heroPath)),sourceMetadataSha256:prior.sourceMetadataSha256,summary,resumes,careers,heroRows,errors,normalizationComplete:false,actualGameCertified:false};
const out='tools/data/overcap-forward-career-resume-v1-'+key(result).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),result);else fs.writeFileSync(out,gzipSync(JSON.stringify(result)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,firstHero:heroRows[0]&&{difficulty:heroRows[0].difficulty,balance:heroRows[0].receipt.balance,goal:heroRows[0].goal},firstErrors:errors.slice(0,1),resumeStatus:resumes.map(r=>({root:r.root,prior:r.priorSuffixSteps,replayed:r.replayedSuffixSteps,new:r.newSteps,status:r.status,birthError:r.birthError,error:r.error||r.priorSuffixError}))}));
