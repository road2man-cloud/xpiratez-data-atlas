// Recombine observed research transactions into new proposals. A source
// witness is not proof on a different world; every candidate is replayed.
// Free-research outcomes stay attached to their triggering transaction.
import {key} from "./population-research-career-core.mjs";
import {exactWorld} from "./population-growth-replay-core.mjs";
const primary=new Set(["research","repeatResearch","eventResearch","missionResearch"]);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createResearchFragmentIndex(){
 const fragments=new Map(),byGoal=new Map();
 function add(steps,source){
  let pending=[],current=[];
  function flush(){
   if(!current.length)return;
   const outputs=[...new Set(current.filter(a=>primary.has(a.type)||a.type==="freeResearch").map(a=>a.type==="repeatResearch"?null:a.research||a.id).filter(Boolean))];
   if(outputs.length){
    const hash=key(current);
    if(!fragments.has(hash)){
     const e={hash,steps:current,outputs,source};fragments.set(hash,e);
     for(const id of outputs){const a=byGoal.get(id)||[];a.push(e);byGoal.set(id,a);}
    }
   }
   current=[];
  }
  for(const a of steps){
   if(a.type==="externalInputs"){flush();pending.push(a);continue;}
   if(primary.has(a.type)){flush();current=[...pending,a];pending=[];continue;}
   if(a.type==="freeResearch"&&current.length){current.push(a);continue;}
   flush();pending=[];
  }
  flush();
 }
 // Dependency distances are ranking hints only. Other paths remain open.
 function propose({world,goals,planner,replay,allowed,accept,deadline=Infinity,maxTrials=40,maxChunks=8}){
  let w=world;const used=[],sources=[],failed=new Set(),metrics={trials:0,applied:0,rejected:0,added:0};
  const relevant=new Map(),queue=[...new Set(goals)].map(k=>[k,0]);
  for(let i=0;i<queue.length&&relevant.size<512;i++){
   const [id,depth]=queue[i];if(relevant.has(id))continue;relevant.set(id,depth);
   if(depth<8)for(const m of planner.methods.get(id)||[])for(const dep of m.deps||[])if(!relevant.has(dep))queue.push([dep,depth+1]);
  }
  const complete=()=>goals.every(k=>active(w,k));
  while(!complete()&&metrics.trials<maxTrials&&sources.length<maxChunks&&performance.now()<deadline){
   const options=new Map();
   for(const [id,depth] of relevant)if(!active(w,id)&&!w.disabled.has(id))for(const f of byGoal.get(id)||[]){
    if(failed.has(f.hash))continue;
    const score=1000-50*depth-f.steps.length;
    const prev=options.get(f.hash);if(!prev||score>prev.score)options.set(f.hash,{f,score});
   }
   const ranked=[...options.values()].sort((a,b)=>b.score-a.score||a.f.hash.localeCompare(b.f.hash));
   let advanced=false;
   for(const {f} of ranked){
    if(metrics.trials>=maxTrials||performance.now()>=deadline)break;
    metrics.trials++;
    try{
     let z=w;
     for(const a of f.steps){const next=replay.apply(z,a);if(!allowed(z,next))throw Error("BRANCH_CONFLICT");z=next;}
     const gained=[...relevant.keys()].filter(k=>!active(w,k)&&active(z,k));
     if(z.pendingFree||!gained.length||!accept([...used,...f.steps],z))throw Error("FRAGMENT_GOAL_OR_CONTEXT");
     if(exactWorld(replay.replay(f.steps,w))!==exactWorld(z))throw Error("FRAGMENT_REPLAY");
     w=z;used.push(...f.steps);sources.push({hash:f.hash,source:f.source,gained});metrics.applied++;metrics.added+=gained.length;failed.clear();advanced=true;break;
    }catch{failed.add(f.hash);metrics.rejected++;}
   }
   if(!advanced)break;
  }
  return {world:w,steps:used,sources,complete:complete(),metrics};
 }
 return {add,propose,get size(){return fragments.size;}};
}
