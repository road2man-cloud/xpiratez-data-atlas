// V154: goal-focused continuation of V152. Preserve separate random outcomes,
// reserve recruitment stock, and produce actual missing persuasion dependencies.
// A heuristic rank never authorizes an action; every action uses the V151 replay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createCareerReplay} from './atlas-overcap-forward-career-replay-v1.mjs';
import {createRandomItemEventAdapter} from './atlas-overcap-forward-random-event-v1.mjs';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=x=>sha(JSON.stringify(x));
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const priorPath='tools/data/overcap-forward-persuasion-wave-v1-c0618e93cb613cf7dde8.json.gz';
const eventPriorPath='tools/data/overcap-forward-random-event-wave-v1-18cce509c74a8e4734d5.json.gz';
const sourcePlanPath='tools/data/overcap-supplemental-supply-v1-15b6da7f889025c1c90c.json.gz';
const bulkPath='tools/data/overcap-forward-bulk-normalization-v3-f332fe05e2e4b74e9eff.json.gz';
const prior=read(priorPath),eventPrior=read(eventPriorPath),bulk=read(bulkPath),supplyPlan=read(sourcePlanPath);
assert.equal(prior.priorSha256,sha(fs.readFileSync(eventPriorPath)));
assert.equal(eventPrior.bulkSha256,sha(fs.readFileSync(bulkPath)));
assert.equal(supplyPlan.sourceMetadataSha256,bulk.sourceMetadataSha256);
const book=supplyPlan.items.find(x=>x.id==='STR_BOOK_OF_SERMONS');assert(book.itemDefined&&book.mapLoot.sourceCount>0);
const data=read('public/data/soldiers-modern-index.json');
data.forwardSupply=read('tools/data/overcap-forward-supply-catalog-v2.json');
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
assert.equal(data.meta.source.metadataSha256,bulk.sourceMetadataSha256);
const {source}=eventPrior;let bytes=fs.existsSync(source.path)?fs.readFileSync(source.path):null;
if(!bytes||sha(bytes)!==source.sha256)bytes=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',source.commit+':'+source.path],{maxBuffer:64*1024*1024});
assert.equal(sha(bytes),source.sha256);
const raw=Object.values(JSON.parse(gunzipSync(bytes)).details).find(e=>e.id==='STR_TROUBLESEEKING_ENEMY');
const random=createRandomItemEventAdapter(data,raw,source),rp=createCareerReplay(data,{maxMonth:3});
const rules=data.researchRules,catalog=data.forwardSupply;
const target='STR_PERSUASION',direct=rules[target].dependencies,common='STR_MOST_COMMON_POWER',commonDirect=rules[common].dependencies;
const tavern='STR_CONTACT_GENERAL_SUPPLIES';
const arr=x=>Array.isArray(x)?x:[],pairs=x=>Object.entries(x||{});
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
const reverse=new Map(),freeBy=new Map(),functions=new Map();
function put(m,k,v){if(!m.has(k))m.set(k,[]);m.get(k).push(v);}
for(const [id,r] of pairs(rules)){
 for(const k of arr(r.unlocks))put(reverse,k,id);
 for(const k of arr(r.getOneFree))put(freeBy,k,id);
 for(const [gate,targets] of pairs(r.getOneFreeProtected))for(const k of arr(targets))put(freeBy,k,id);
}
for(const f of Object.values(catalog.facilities))for(const k of f.provides)put(functions,k,f);
const profiles=new Map(bulk.acquisitions.map(a=>[a.id,a]));
const fixedSources=new Map(),recipesBy=new Map();
for(const e of Object.values(catalog.events))for(const k of Object.keys(e.fixed))put(fixedSources,k,e);
for(const r of catalog.recipes)for(const k of Object.keys(r.outputs))put(recipesBy,k,r);
function restore(row){
 let s=rp.start(row.fullActions[0].difficulty);assert.deepEqual(s.actions,row.fullActions.slice(0,2));
 for(const a of row.fullActions.slice(2))s=a.type==='sourceRandomEventItem'?random.apply(s,a):rp.research(s,a);
 assert.equal(exactStateHash(s.world),row.finalStateHash);return s;
}
function snapshot(s,a){
 return {persuasion:active(s.world,target),common:active(s.world,common),missingCommon:commonDirect.filter(k=>!active(s.world,k)),tavernGate:active(s.world,tavern),direct:direct.filter(k=>active(s.world,k)),missingDirect:direct.filter(k=>!active(s.world,k)),acquisition:rp.missing(s,a.requirements),balance:s.world.funds,stock:Object.fromEntries(Object.keys(a.requirements.items).map(k=>[k,qty(s.world,k)])),settled:rp.settled(s)};
}
// Build a bounded and state-dependent relevance map from missing goal
// prerequisites. Explicit unlock/free routes are alternatives, not AND gates.
// Avoid exploding long OR-like dependency lists when a known unlock is available.
function plan(w,goal,acq){
 const weight=new Map(),need=new Map(),fn=new Map(),q=[[goal,1000,0]],seen=new Map();
 const set=(m,k,v)=>m.set(k,Math.max(m.get(k)||0,v));
 for(const [k,n] of pairs(acq.requirements.items))if(qty(w,k)<n)set(need,k,15);
 for(let i=0;i<q.length;i++){
  const [k,v,depth]=q[i];if(!k||active(w,k)||w.disabled.has(k)||v<0.5||(seen.get(k)||0)>=v)continue;
  seen.set(k,v);set(weight,k,v);if(depth>=5)continue;
  const r=rules[k]||{},by=arr(reverse.get(k)),free=arr(freeBy.get(k));
  const dep=arr(r.dependencies).filter(x=>!active(w,x)),req=arr(r.requires).filter(x=>!active(w,x));
  if(!by.some(x=>active(w,x))){
   const deps=dep.length>12&&by.length?[]:dep;
   for(const x of deps)q.push([x,v*0.52,depth+1]);
   for(const x of by)if(!active(w,x))q.push([x,v*0.48,depth+1]);
  }
  for(const x of req)q.push([x,v*0.55,depth+1]);
  for(const x of free)if(!active(w,x))q.push([x,v*0.30,depth+1]);
  for(const f of arr(r.requiresBaseFunc))if(!w.baseFunctions.has(f)){
   set(fn,f,v*0.7);for(const x of arr(functions.get(f)))for(const id of x.research)q.push([id,v*0.26,depth+1]);
  }
  for(const e of arr(data.eventResearchSources?.[k]))for(const s of arr(e.scripts))for(const x of arr(s.researchPositive))q.push([x,v*0.42,depth+1]);
  if(r.needItem){
   const item=r.neededItem||k;
   if(qty(w,item)<1){
    set(need,item,v*0.9);
    for(const g of arr(data.itemSupply?.[item]?.researchGrants))q.push([g.research,v*0.6,depth+1]);
    for(const e of arr(fixedSources.get(item)))for(const s of e.scripts)for(const x of arr(s.researchPositive))q.push([x,v*0.4,depth+1]);
    const buy=catalog.buys[item];if(buy)for(const x of buy.requires)q.push([x,v*0.5,depth+1]);
    for(const recipe of arr(recipesBy.get(item)))for(const x of recipe.requires)q.push([x,v*0.35,depth+1]);
   }
  }
 }
 return {weight,need,fn};
}
function rank(o,s,p,a){
 const w=s.world,x=o.action,e=o.evidence||{},id=x.research||x.id;
 if(x.type==='sourceResearchDelivery')return 100000;
 if(x.type==='freeResearch')return 100000+(p.weight.get(id)||0);
 // A physical recruit specimen must not be sacrificed once reserved.
 if(['research','repeatResearch'].includes(x.type)){
  const r=rules[id],item=r?.neededItem||id;
  if(r?.destroyItem&&a.requirements.items[item]&&qty(w,item)<=a.requirements.items[item])return -1;
 }
 let v=['research','eventResearch','missionResearch','repeatResearch'].includes(x.type)?(p.weight.get(id)||0):0;
 if(['research','repeatResearch'].includes(x.type)){
  const r=rules[id]||{};
  v+=Math.max(0,...arr(r.getOneFree).filter(k=>!active(w,k)).map(k=>(p.weight.get(k)||0)*0.9));
  v+=Math.max(0,...arr(r.unlocks).filter(k=>!active(w,k)).map(k=>(p.weight.get(k)||0)*0.8));
 }
 if(x.type==='sourceBuySample')v+=p.need.get(x.id)||0;
 if(x.type==='sourceEventItems'||x.type==='sourceManufactureItem')v+=Math.max(0,...Object.keys(e.items||e.outputs||{}).map(k=>p.need.get(k)||0));
 if(x.type==='sourceBuildFacility')v+=Math.max(0,...arr(e.provides).map(k=>p.fn.get(k)||0));
 // Only explicit indexed income can help; never infer a global economy.
 if(x.type==='sourceEventItems'||x.type==='eventResearch')v+=(catalog.events[x.event]?.funds||0)>0?2:0;
 return v;
}
const maxSteps=Number(process.argv.find(x=>x.startsWith('--steps='))?.slice(8)||'40');
assert(Number.isSafeInteger(maxSteps)&&maxSteps>=1&&maxSteps<=80);
const states=new Map();
for(const row of prior.rows){
 const k=key([row.finalStateHash,row.acquisition]);if(!states.has(k))states.set(k,row);
}
// Produce each distinct state once for the scout acquisition; the flame-guard
// cohort gets the same state references, not a duplicate claim of new research.
const rootsArg=process.argv.find(x=>x.startsWith('--root='))?.slice(7)||null;
const policyArg=process.argv.find(x=>x.startsWith('--policy='))?.slice(9)||null;
const seeds=[...states.values()].filter(r=>profiles.get(r.acquisition)?.profile==='manufacture:STR_RAIDER_SCOUT_RECRUITMENT'&&(!rootsArg||r.root===rootsArg)&&(!policyArg||r.policy===policyArg));
assert(seeds.length,'Empty continuation batch');
const rows=[];
for(const row of seeds){
 const a=profiles.get(row.acquisition);assert(a);
 let s=restore(row),before=snapshot(s,a),start=s.actions.length,initialResearch=new Set(s.world.researched);
 const seen=new Set([exactStateHash(s.world)]),blocked=[],milestones=[];
 // Focus on individual missing direct conditions, not all transitive
 // dependencies at once. Advance to the next target if no enabled action.
 // First produce the common-power subgoals, then open the lowest known
 // map mission gate. A map loot source is NOT automatically added to stock.
 const goals=[...commonDirect.filter(k=>!active(s.world,k)),common,'STR_SALVAGE',tavern,'STR_BOOK_OF_SERMONS',target,'STR_RAIDER_CLANS','STR_RAIDER_SCOUT','STR_RAIDER_SCOUT_RECRUITMENT'];
 const attempts=new Map();let lastGoal=null;
 for(let step=0;step<maxSteps;step++){
  let next=null;
  const options=rp.options(s);
  const pending=!rp.settled(s);
  const availableGoals=goals.filter(k=>!active(s.world,k)&&(attempts.get(k)||0)<12);
  for(const g of pending?[lastGoal||target]:availableGoals){
   const p=plan(s.world,g,a);
   const ranked=options.map(o=>({o,v:rank(o,s,p,a)})).filter(x=>x.v>0).sort((x,y)=>y.v-x.v||JSON.stringify(x.o.action).localeCompare(JSON.stringify(y.o.action)));
   for(const {o} of ranked){
    try{
     const t=rp.research(s,o.action),h=exactStateHash(t.world);
     if(seen.has(h)||direct.some(k=>active(s.world,k)&&!active(t.world,k)))continue;
     if(a.requirements.items.STR_RAIDER_SCOUT&&qty(s.world,'STR_RAIDER_SCOUT')>0&&qty(t.world,'STR_RAIDER_SCOUT')<qty(s.world,'STR_RAIDER_SCOUT'))continue;
     next={t,h,g};break;
    }catch(e){if(blocked.length<20)blocked.push({goal:g,action:o.action,reason:String(e.message)});}
   }
   if(next)break;
   attempts.set(g,12);
  }
  if(!next)break;
  const old=snapshot(s,a);
  s=next.t;seen.add(next.h);lastGoal=next.g;
  attempts.set(lastGoal,(attempts.get(lastGoal)||0)+1);
  const current=snapshot(s,a);
  const gained=current.direct.filter(k=>!old.direct.includes(k));
  if(gained.length||current.persuasion&&!old.persuasion||current.tavernGate&&!old.tavernGate)milestones.push({at:s.actions.length-start,goal:lastGoal,gained,persuasion:current.persuasion,tavernGate:current.tavernGate});
 }
 const after=snapshot(s,a);
 rows.push({id:key([row.id,exactStateHash(s.world)]),parent:row.id,root:row.root,policy:row.policy,acquisition:row.acquisition,priorStateHash:row.finalStateHash,before,after,milestones,added:s.actions.length-start,fullActions:s.actions,newTrace:s.trace.slice(s.trace.length-(s.actions.length-start)),finalStateHash:exactStateHash(s.world),newResearch:[...s.world.researched].filter(k=>!initialResearch.has(k)&&active(s.world,k)).sort(),blocked,finalAdmission:false,actualGameCertified:false});
}
const summary={seeds:seeds.length,produced:rows.length,newActions:rows.reduce((n,r)=>n+r.added,0),uniqueEndStates:new Set(rows.map(r=>r.finalStateHash)).size,directDependencyGains:rows.reduce((n,r)=>n+r.after.direct.filter(k=>!r.before.direct.includes(k)).length,0),improvedRows:rows.filter(r=>r.after.direct.length>r.before.direct.length).length,uniqueDirectGains:[...new Set(rows.flatMap(r=>r.after.direct.filter(k=>!r.before.direct.includes(k))))].sort(),commonPowerReached:rows.filter(r=>r.after.common).length,commonPowerNew:rows.filter(r=>r.after.common&&!r.before.common).length,tavernGateReached:rows.filter(r=>r.after.tavernGate).length,tavernGateNew:rows.filter(r=>r.after.tavernGate&&!r.before.tavernGate).length,maxDirect:Math.max(0,...rows.map(r=>r.after.direct.length)),persuasionReached:rows.filter(r=>r.after.persuasion).length,recruitmentResearchReached:rows.filter(r=>!r.after.acquisition.research.length).length,reservedScoutPreserved:rows.filter(r=>r.before.stock.STR_RAIDER_SCOUT>0&&r.after.stock.STR_RAIDER_SCOUT>=r.before.stock.STR_RAIDER_SCOUT).length,finalAdmission:0,actualGameCertified:0};
const report={schema:'ATLAS_OVERCAP_FORWARD_PERSUASION_WAVE_V2',scope:'Bounded milestone-focused continuation with reserved stock, exact source-backed actions, conditional outcomes only.',sourceMetadataSha256:bulk.sourceMetadataSha256,priorPath,priorSha256:sha(fs.readFileSync(priorPath)),direct,sourcePlan:{path:sourcePlanPath,sha256:sha(fs.readFileSync(sourcePlanPath)),item:'STR_BOOK_OF_SERMONS',events:book.events.length,recipes:book.manufacture.length,mapSources:book.mapLoot.sourceCount,tavernDeployment:'STR_LOC_TAVERN_CELLAR',deliveryImplemented:false,requiresSample:true},summary,rows,actualGameCertified:false,normalizationComplete:false};
const out='tools/data/overcap-forward-persuasion-wave-v2-'+key(report).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(read(out),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,summary,rows:rows.map(r=>({root:r.root,policy:r.policy,added:r.added,before:r.before.direct,after:r.after.direct,remaining:r.after.missingDirect,commonMissing:r.after.missingCommon,tavernGate:r.after.tavernGate,stock:r.after.stock,balance:r.after.balance,milestones:r.milestones}))}));
