// Plateau-aware scheduling, NOT a state quotient or impossibility proof.
// A same-score transition can change history, bonuses, research or resources.
// Only exact full-world hashes identify exact-state loops; even these retain
// their witnesses and all unprocessed edges.
import {key} from "./population-research-career-core.mjs";
export const PLATEAU_POLICY="LOSSLESS_PLATEAU_PRIORITY_V1";
const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
export function edgeClass(parent,r){
 if(!parent)return "SEED";
 if(parent.canonicalStateHash===r.canonicalStateHash&&equal(parent.allowedDifficulties,r.allowedDifficulties))return "EXACT_WORLD_LOOP";
 if(equal(parent.permanentVector,r.permanentVector))return "SAME_VECTOR_STATE_CHANGE";
 return "VECTOR_CHANGE";
}
export function createPlateauIndex(routes){
 const memo=new Map();
 function info(id){
  if(memo.has(id))return memo.get(id);
  const r=routes[id],p=routes[r?.chainParent];
  if(!p){const v={kind:"SEED",streak:0,repeatRule:null};memo.set(id,v);return v;}
  const kind=edgeClass(p,r);
  const streak=kind==="VECTOR_CHANGE"?0:1+info(r.chainParent).streak;
  const v={kind,streak,repeatRule:streak?r.chainRule:null};memo.set(id,v);return v;
 }
 return info;
}
export function routePlateauSummary(routes){
 const info=createPlateauIndex(routes),rules={};let sameVector=0,exactLoops=0,changedVector=0,maxStreak=0;
 for(const [id,r] of Object.entries(routes)){
  if(!r.chainParent)continue;
  const x=info(id);maxStreak=Math.max(maxStreak,x.streak);
  if(x.kind==="EXACT_WORLD_LOOP")exactLoops++;
  else if(x.kind==="SAME_VECTOR_STATE_CHANGE")sameVector++;
  else if(x.kind==="VECTOR_CHANGE")changedVector++;
  if(x.streak)rules[r.chainRule]=(rules[r.chainRule]||0)+1;
 }
 return {sameVector,exactLoops,changedVector,maxStreak,rules};
}
export function isDeferred(parent,info,rule){
 // Only repeated same-rule actions get the slow lane. Other successors of
 // plateau states remain on the normal lane, including stat-decreasing ones.
 return info.streak>0&&info.repeatRule===rule.id&&parent.order.includes(rule.id);
}
// One deferred batch per N batches whenever available; never discard a job.
export function makeFairLanes(batch,period,start=0){
 const lanes=[{origins:[],queues:new Map(),cursor:0},{origins:[],queues:new Map(),cursor:0}];
 let tick=start,remaining=[0,0],batchCount=0,lastLane=-1;
 function enqueue(origin,xs,deferred,front=false){
  if(!xs.length)return;
  const i=Number(deferred),lane=lanes[i];
  let q=lane.queues.get(origin);
  if(!q){q={jobs:[],cursor:0};lane.queues.set(origin,q);}
  if(front&&!deferred)q.jobs.splice(Math.min(q.cursor+1,q.jobs.length),0,{xs,cursor:0});else q.jobs.push({xs,cursor:0});
  if(!lane.origins.includes(origin))lane.origins.push(origin);
  remaining[i]+=xs.length;
 }
 function next(){
  if(!remaining[0]&&!remaining[1])return null;
  if(batchCount===0||lastLane<0||!remaining[lastLane]){
   lastLane=remaining[1]&&(!remaining[0]||tick%period===period-1)?1:0;
   tick++;batchCount=batch;
  }
  const i=lastLane,lane=lanes[i];
  while(lane.origins.length){
   if(lane.cursor>=lane.origins.length)lane.cursor=0;
   const origin=lane.origins[lane.cursor],q=lane.queues.get(origin);
   while(q.cursor<q.jobs.length&&q.jobs[q.cursor].cursor>=q.jobs[q.cursor].xs.length)q.cursor++;
   if(q.cursor>=q.jobs.length){lane.origins.splice(lane.cursor,1);continue;}
   const job=q.jobs[q.cursor],edge=job.xs[job.cursor++];remaining[i]--;batchCount--;
   if(batchCount===0||job.cursor===job.xs.length){lane.cursor++;batchCount=0;}
   return {...edge,deferred:i===1};
  }
  if(remaining[i])throw Error("Plateau lane accounting drift");
  batchCount=0;return next();
 }
 return {enqueue,next,remaining:()=>[...remaining],tick:()=>tick,origins:()=>new Set(lanes.flatMap(l=>l.origins)).size};
}
