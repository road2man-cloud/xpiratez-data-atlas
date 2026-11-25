// Only reorder remaining work. Candidate-index signature stays fixed.
import assert from "node:assert/strict";
import {member} from "./population-growth-replay-core.mjs";
export function distinctDepth(s){return new Set(s.actions.filter(a=>a.type==="transform").map(a=>a.transform)).size;}
export function remainingMoves(s,moves,{priority=false,max=48}={}){
 const done=new Set(s.priorityDone||[]);
 assert([...done].every(i=>Number.isSafeInteger(i)&&i>s.cursor&&i<moves.length));
 const indices=[];for(let i=s.cursor;i<moves.length;i++)if(!done.has(i))indices.push(i);
 if(priority){
  const score=i=>{
   const {r,n}=moves[i],m=member(n.world),h=m.state.history,traits=m.state.bonusIds;
   const fresh=Boolean(r.soldierBonusType&&!traits.has(r.soldierBonusType));
   const removed=(r.removeTransformations||[]).some(k=>h.has(k));
   const blocked=(r.requiredPreviousTransformations||[]).some(k=>!h.has(k))||(r.forbiddenPreviousTransformations||[]).some(k=>h.has(k));
   const newResearch=r.requires.filter(k=>!n.world.researched.has(k)||n.world.disabled.has(k)).length;
   return 2000*Number(fresh)+250*Number(!h.has(r.id))+100*Number(Boolean(r.producedSoldierType&&r.producedSoldierType!==m.state.soldierType))-1700*Number(Boolean(r.reset))-900*Number(removed)-2500*Number(blocked)-Math.min(200,10*newResearch);
  };
  const scores=new Map(indices.map(i=>[i,score(i)]));
  indices.sort((a,b)=>scores.get(b)-scores.get(a)||a-b);
 }
 return indices.slice(0,max);
}
export function completeMove(s,index,length){
 const done=new Set(s.priorityDone||[]);
 assert(Number.isSafeInteger(index)&&index>=s.cursor&&index<length&&!done.has(index));
 const outOfOrder=index!==s.cursor;
 done.add(index);
 while(done.delete(s.cursor))s.cursor++;
 if(done.size)s.priorityDone=[...done].sort((a,b)=>a-b);else delete s.priorityDone;
 return outOfOrder;
}
export function assertProgress(old,next){
 assert(next.cursor>=old.cursor);
 const retained=new Set(next.priorityDone||[]);
 for(const i of old.priorityDone||[])assert(i<next.cursor||retained.has(i),"Lost sparse move completion");
}
