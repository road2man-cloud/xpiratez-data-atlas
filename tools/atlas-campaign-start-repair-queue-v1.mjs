// Consume existing full witnesses without discarding original career actions.
// Queue entries are production inputs, not claims that paths are repaired.
import {createCampaignStartResearchPlanner} from '../public/soldiers/modern/campaign-start-research-planner-v1.js';
export function repairCampaignRoute(actions,data,snapshot,options={}){
 const planner=createCampaignStartResearchPlanner(data,snapshot,options);
 let node=planner.newNode();
 for(const [index,step] of actions.entries()){
  try{
   if(step.type==='campaignContext'){
    if(step.difficulty!==snapshot.difficulty)throw Error('difficulty-mismatch');
    continue;
   }
   if(step.type==='externalInputs'){
    planner.supply(node,{items:step.items||{},functions:step.functions||[]},'legacy resource replacement');
    continue;
   }
   if(step.type==='research'&&!node.world.researched.has(step.id)){
    const result=planner.ensure([step.id],node);
    if(!result.ok)throw Error(result.reason);
    node=result.node;continue;
   }
   if(step.type==='research'&&node.world.researched.has(step.id)&&!node.world.disabled.has(step.id))continue;
   if(step.type==='freeResearch'&&node.world.researched.has(step.research)&&!node.world.pendingFree)continue;
   planner.append(node,step);
  }catch(e){
   return {status:'repair-pending',failedAt:index,reason:e.message,producedActions:node.steps,remainingActions:actions.slice(index),originalActions:actions};
  }
 }
 return {status:node.world.pendingFree?'repair-pending':'conditional-replay',producedActions:node.steps,originalActions:actions,gameCertified:false};
}
