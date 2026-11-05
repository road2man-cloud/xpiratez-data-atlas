// Read-only investigation of chronological birth routes. Never publishes data.
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
import {applyOriginWitnessStep,foundationWorld,replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';
const read=p=>decodeOriginReport(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const catalog=read('public/data/soldier-source-catalog.json');
const report=read('public/data/soldier-origin-candidates.json');
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=report.records.map(r=>r.sourceProof);
const value=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const goals=(value('goals')||'').split(',').filter(Boolean);
const profileId=value('profile');
const seedId=value('seed');
const attempts=Number(value('attempts')||900);
const maxSteps=Number(value('steps')||850);
const difficulty=value('difficulty')==null?null:Number(value('difficulty'));
const planner=createFoundationResearchPlanner(data,{maxAttempts:attempts,maxDepth:64,maxSteps,collectFailures:true,difficulty,methodLimit:Number(value('methods')||32)});
let node=planner.newNode();
if(seedId){
  const row=report.records.find(r=>r.profileId===seedId);
  if(!row?.candidates.length)throw Error('No replayable seed origin '+seedId);
  const candidates=row.candidates.filter(c=>!c.transforms.length).sort((a,b)=>a.steps.length-b.steps.length);
  const c=candidates[0]||row.candidates[0];
  const at=c.steps.findIndex(s=>s.type==='recruit');
  if(at<0)throw Error('Seed has no birth boundary');
  for(const step of c.steps.slice(0,at))planner.append(node,step);
  if(node.world.soldiers.length)throw Error('A seed may not borrow another soldier');
  console.log('SEED',JSON.stringify({id:seedId,candidate:c.id,steps:node.steps.length,month:node.world.month,research:node.world.researched.size}));
}
for(const id of (value('inspect')||'').split(',').filter(Boolean)){
  console.log('INSPECT',JSON.stringify({id,active:node.world.researched.has(id),disabled:node.world.disabled.has(id),rule:data.researchRules[id],distance:planner.distance.get(id),methods:(planner.methods.get(id)||[]).map(m=>({kind:m.kind,source:m.source,guard:m.guard,event:m.event,deps:m.deps,missing:m.deps.filter(x=>!planner.distance.has(x))})).slice(0,12)}));
}
const profile=profileId?data.profiles.find(p=>p.id===profileId):null;
if(profileId&&!profile)throw Error('Unknown origin '+profileId);
const planned=[];
for(const goal of [...goals,...(profile?.requires||[])]){
  const start=Date.now();
  const result=planner.ensure([goal],node);
  console.log('GOAL',JSON.stringify({goal,ok:result.ok,attempts:result.attempts,elapsedMs:Date.now()-start,reason:result.reason,unresolved:result.unresolved,steps:result.node.steps.length,month:result.node.world.month,research:result.node.world.researched.size}));
  if(!result.ok){
    const unique=new Map();
    for(const failure of result.failures||[])unique.set([failure.goal,failure.method,failure.reason].join('|'),failure);
    console.log('FAILURES',JSON.stringify([...unique.values()].slice(-12)));
    console.log('DEAD_ENDS',JSON.stringify((result.deadEnds||[]).slice(-24)));
    process.exitCode=2;
    break;
  }
  node=result.node;planned.push(goal);
}
if(!process.exitCode&&profile){
  planner.supply(node,{items:profile.acquisitionRequiredItems||{},functions:profile.requiresBaseFunc||[],funds:profile.cost||0},'Conditional birth inputs: '+profile.id);
  planner.append(node,{type:'recruit',profile:profile.id,soldier:'origin',band:'min'});
  const check=replayOriginWitness(node.steps,data,{requireCompatibleContext:true});
  if(!check.ok||!check.exact)throw Error('Independent replay failed: '+check.reason);
  console.log('BIRTH',JSON.stringify({id:profile.id,steps:node.steps.length,month:node.world.month,total:check.total,conditional:check.conditional,certifiedMaximum:check.certifiedMaximum}));
}
if(!process.argv.includes('--quiet'))console.log('CHRONOLOGY',JSON.stringify(node.steps.filter(s=>s.type==='campaignContext'||s.type==='advanceMonth'||s.type==='eventResearch'||s.type==='missionResearch'||s.type==='recruit')));
