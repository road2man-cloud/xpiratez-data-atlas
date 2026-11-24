// Select the exact preset winners over a union of the currently selected
// static risk profiles. Do not infer compatibility for absent profiles.
// The graph builder evaluated all resource labels before projecting winners.
import {summarizeRouteResources} from "./branch-soldier-resources.js";
const fields={fees:"grossFees",recovery:"recoveryDays",transfer:"transferHours",actions:"actions"};
const labels=["grossFees","recoveryDays","transferHours","actions"];
export function projectResourceGoal(db,profileIds,presetId,goalId,resourceFor=null){
 const spec=db.summary.resourceGoalCheckpoints;
 const preset=spec?.presets.find(p=>p.id===presetId),goal=spec?.goals.find(g=>g.id===goalId);
 if(!preset||!goal)return null;
 const records=[...new Set(profileIds)].map(id=>db.profiles[id]?.resourceGoalCheckpoints?.[presetId]).filter(Boolean);
 const cache=new Map();
 const get=resourceFor||((id)=>{if(!cache.has(id))cache.set(id,summarizeRouteResources(db.witnesses[id],db.ruleDetails));return cache.get(id)});
 function choose(ids,stat,objective){
  let winner=null;
  const order=objective?[fields[objective],...labels.filter(k=>k!==fields[objective])]:labels;
  for(const id of ids){
   if(!id||!db.witnesses[id])continue;
   if(!winner){winner=id;continue;}
   const a=db.witnesses[id],b=db.witnesses[winner],r=get(id),s=get(winner);
   const av=stat==null?0:a.vector[stat],bv=stat==null?0:b.vector[stat];
   let diff=bv-av;
   if(!diff)for(const k of order){diff=r[k]-s[k];if(diff)break;}
   if(diff<0||diff===0&&((a.randomSteps??0)<(b.randomSteps??0)||((a.randomSteps??0)===(b.randomSteps??0)&&id<winner)))winner=id;
  }
  return winner;
 }
 return {preset,goal,profiles:records.length,
  best:db.stats.map((_,i)=>choose(records.map(x=>x.best[i]),i,null)),
  goals:Object.fromEntries(spec.objectives.map(o=>[o,choose(records.map(x=>x.goals[goal.id]?.[o]),null,o)]))};
}
