// V161: narrow adapter for the GDX orders events, whose additional raw
// interruptResearch field cannot be silently dropped. The partial campaign
// has no active laboratory projects: require an explicit idle-project
// assumption, retain the raw interrupt field in the replay receipt.
import assert from 'node:assert/strict';
import {createMonthlyResearchReward} from './atlas-overcap-forward-monthly-research-reward-v1.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createIdleResearchInterruptReward(data,rp,monthly,rawEvent,source){
 const raw=rawEvent.raw,{interruptResearch,...reward}=raw;
 assert(typeof interruptResearch==='string'&&interruptResearch.length>0);
 assert.deepEqual(reward.researchList,[interruptResearch]);
 assert(!reward.everyItemList?.length&&!Object.keys(reward.everyMultiItemList||{}).length);
 const base=createMonthlyResearchReward(data,rp,monthly,{...rawEvent,raw:reward},source);
 const idle=s=>rp.settled(s)&&!s.world.activeResearchProjects?.length&&!s.world.pendingResearchProjects?.length;
 function options(s,topic=interruptResearch){
  if(topic!==interruptResearch||!idle(s))return [];
  return base.options(s,topic).map(o=>({
   action:{...o.action,type:'sourceMonthlyInterruptResearchReward',interruptResearch,assumeNoActiveProject:true},
   evidence:{...o.evidence,kind:'CONDITIONAL_IDLE_RESEARCH_INTERRUPT_EVENT',rawInterruptResearch:interruptResearch,activeProjectAbsenceConditional:true,fullResearchTimeUnmodeled:true}
  }));
 }
 function apply(s,a){
  const o=options(s,a.research).find(x=>same(x.action,a));assert(o,'Unsupported interrupt or missing idle-project assumption');
  const {interruptResearch:ignored,assumeNoActiveProject,...rest}=a;
  const n=base.apply(s,{...rest,type:'sourceMonthlyResearchReward'});
  return {...n,actions:[...s.actions,a],trace:[...s.trace,{...n.trace.at(-1),action:a,evidence:o.evidence}]};
 }
 return {id:base.id,options,apply};
}
