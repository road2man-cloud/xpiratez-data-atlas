// Reusable research action blocks from previously replayed chronology.
// Same-branch first; other branches are proposals only, never evidence grants.
import {key} from "./population-research-career-core.mjs";
import {createResearchReuse} from "./final-career-research-reuse.mjs";
const research=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
const context=new Set(["externalInputs","advanceMonth"]);
export function createResearchSegments(index,db,engine){
 const exact=createResearchReuse(index,db,engine),groups=new Map(),metrics={queries:0,blocks:0,tries:0,accepted:0,sameBranch:0,crossBranch:0,rejected:0,steps:0,fallback:0};
 for(const [id,r] of Object.entries(db.populationFrontierChronology.routes)){
  let segment=[];
  for(const [i,a] of r.actions.entries()){
   if(research.has(a.type)||context.has(a.type)){segment.push(a);continue;}
   if(a.type==="transform"){
    if(segment.some(x=>research.has(x.type))){
     const k=key(segment),map=groups.get(a.transform)||new Map();
     if(!map.has(k))map.set(k,{steps:segment,hash:k,route:id,actionIndex:i,branches:new Set()});
     map.get(k).branches.add(r.branch);groups.set(a.transform,map);
    }
    segment=[];
   }
  }
 }
 metrics.blocks=[...groups.values()].reduce((n,x)=>n+x.size,0);
 const {replay}=engine;
 function plan(n,branch,birth,rule){
  metrics.queries++;
  const first=exact.plan(n,branch,birth,rule);if(first)return first;
  const p=engine.policy(branch,n),goals=[...new Set([...p.commit,...rule.requires])];
  const candidates=[...(groups.get(rule.id)?.values()||[])].sort((a,b)=>Number(b.branches.has(branch))-Number(a.branches.has(branch))||a.steps.length-b.steps.length);
  // The limit bounds this optimization only. Exhaustion falls back to the
  // existing planner; neither a failed block nor budget is impossibility.
  for(const c of candidates.slice(0,16)){
   metrics.tries++;let w=n.world;const actions=[];
   try{
    for(const a of c.steps){
     if(a.type==="research"&&!w.pendingFree&&replay.active(w,a.id))continue;
     const next=replay.apply(w,a);metrics.steps++;
     if([...next.researched].some(id=>!w.researched.has(id)&&(p.blocked.has(id)||p.opposing.has(id)))||p.commit.some(id=>replay.active(w,id)&&!replay.active(next,id)))throw Error("branch gate");
     w=next;actions.push(a);
    }
    if(w.pendingFree||!goals.every(id=>replay.active(w,id))||!actions.some(a=>research.has(a.type)))throw Error("goal inactive");
    metrics.accepted++;metrics[c.branches.has(branch)?"sameBranch":"crossBranch"]++;
    return {ok:true,n:{world:w,steps:[...n.steps,...actions]},researchWitness:{kind:"REPLAYED_RESEARCH_SEGMENT",sourceRoute:c.route,sourceActionIndex:c.actionIndex,sourceBlockHash:c.hash,appliedHash:key(actions),sameBranch:c.branches.has(branch)}};
   }catch{metrics.rejected++;}
  }
  metrics.fallback++;return null;
 }
 return {plan,metrics,exactMetrics:exact.metrics};
}
