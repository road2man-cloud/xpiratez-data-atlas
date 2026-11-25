// Deterministic alternatives to a failed chronological proposal. No stat grants.
export const RECOVERY_KINDS=[
 "INSERT_CAP_BEFORE_GATE","SWAP_GATE_WITH_NEXT_TRANSFORM","DROP_BLOCKED_TRANSFORM",
 "DROP_GATE_AND_LATER_PROMOTIONS","DROP_UNINDEXED_PROMOTIONS",
 "DROP_PROMOTIONS_AND_RANK_GATED_TRANSFORMS","PREFIX_BEFORE_GATE_THEN_CAP"
];
export function recoveryProposal(f,t,kind,ruleMap,startBody){
 const at=t.at,actions=f.actions,blocked=actions[at];
 if(!Number.isSafeInteger(at)||at<0||!blocked)return null;
 const rank=t.reason==="Promotion rank list unindexed"&&blocked.kind==="ASSUMED_PROMOTION";
 const gate=["TRANSFORM_GATE","PRE_RESEARCH_NUMERIC_GATE"].includes(t.reason)&&blocked.kind==="TRANSFORM";
 if(!rank&&!gate)return null;
 const cap={kind:"CAP_TARGET"};let next;
 switch(kind){
 case "INSERT_CAP_BEFORE_GATE":
  if(!gate||actions[at-1]?.kind==="CAP_TARGET")return null;
  next=[...actions.slice(0,at),cap,...actions.slice(at)];break;
 case "SWAP_GATE_WITH_NEXT_TRANSFORM":
  if(!gate||actions[at+1]?.kind!=="TRANSFORM")return null;
  next=[...actions.slice(0,at),actions[at+1],blocked,...actions.slice(at+2)];break;
 case "DROP_BLOCKED_TRANSFORM":
  if(!gate)return null;
  next=actions.filter((_,i)=>i!==at);break;
 case "DROP_GATE_AND_LATER_PROMOTIONS":
  if(!gate)return null;
  next=actions.filter((a,i)=>i!==at&&(i<at||a.kind!=="ASSUMED_PROMOTION"));break;
 case "DROP_UNINDEXED_PROMOTIONS":
  if(!rank)return null;
  next=actions.filter((a,i)=>i<at||a.kind!=="ASSUMED_PROMOTION");break;
 case "DROP_PROMOTIONS_AND_RANK_GATED_TRANSFORMS":
  if(!rank&&!gate)return null;
  next=actions.filter((a,i)=>i<at||((!gate||i!==at)&&a.kind!=="ASSUMED_PROMOTION"&&!(a.kind==="TRANSFORM"&&Number(ruleMap.get(a.id)?.minRank)>0)));break;
 case "PREFIX_BEFORE_GATE_THEN_CAP":
  if(!actions.slice(0,at).some(a=>a.kind==="TRANSFORM"))return null;
  next=[...actions.slice(0,at),cap];break;
 default:return null;
 }
 if(!next.some(a=>a.kind==="TRANSFORM")||JSON.stringify(next)===JSON.stringify(actions))return null;
 let body=startBody;
 for(const a of next)if(a.kind==="TRANSFORM"){const r=ruleMap.get(a.id);if(!r)return null;body=r.producedSoldierType||body;}
 return {...f,body,actions:next};
}
